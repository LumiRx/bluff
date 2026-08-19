/* ══════════ SENDING A PUSH ══════════

   Token-based APNs: an ES256 JWT signed with an Auth Key, reused for up to an
   hour rather than minted per message — Apple rate-limits key regeneration and
   will start rejecting a sender that mints one per notification.

   No SDK. WebCrypto signs, fetch delivers. Workers speak HTTP/2 to APNs, which
   is what APNs requires.

   Everything here is inert until three secrets exist. That is deliberate: the
   feature ships dark and switches on when the key does, rather than the build
   waiting on a credential only one person can create.

     wrangler secret put APNS_KEY        # the .p8, whole, including the header
     wrangler secret put APNS_KEY_ID     # 10 characters
     wrangler secret put APNS_TEAM_ID    # 10 characters, from the portal header

   The APNs Auth Key is a *different* .p8 from the App Store Connect key, and is
   confusingly also called AuthKey_XXXXXXXXXX.p8. They are not interchangeable
   and mixing them up produces a 403 that says nothing useful. */

const HOST = { prod: 'https://api.push.apple.com', dev: 'https://api.sandbox.push.apple.com' };

let cached = null;   // { token, at } — per isolate, good for an hour

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem) {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function configured(env) {
  return !!(env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID);
}

async function bearer(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.at < 3000) return cached.token;   // 50 minutes

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(env.APNS_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(new TextEncoder().encode(
    JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID })));
  const body = b64url(new TextEncoder().encode(
    JSON.stringify({ iss: env.APNS_TEAM_ID, iat: now })));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key,
    new TextEncoder().encode(head + '.' + body));
  const token = head + '.' + body + '.' + b64url(sig);
  cached = { token, at: now };
  return token;
}

/* Send one notification. Returns what happened rather than throwing: a push
   that fails must never take down the thing that triggered it — somebody
   accepting an invite matters more than somebody else's banner. */
export async function send(env, { token, title, body, data, topic, sandbox }) {
  if (!configured(env)) return { ok: false, skipped: 'apns not configured' };
  if (!token) return { ok: false, skipped: 'no device token' };
  try {
    const jwt = await bearer(env);
    const host = sandbox ? HOST.dev : HOST.prod;
    const res = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': topic || env.APNS_TOPIC || 'gg.webluff.app',
        'apns-push-type': 'alert',
        'apns-priority': '5',            /* not urgent; let iOS batch it */
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        aps: { alert: { title, body }, sound: 'default', badge: 1 },
        ...(data || {})
      })
    });
    if (res.status === 200) return { ok: true };
    const detail = await res.text();
    /* 410 means the app was deleted — the caller should forget this token */
    return { ok: false, status: res.status, gone: res.status === 410, detail };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}
