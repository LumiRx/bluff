/* ══════════ TAKING MONEY ══════════

   The rule this whole file exists to enforce: **the client never says how many
   stars it bought.** It hands over a receipt, and the server asks Apple or
   Google what that receipt actually is, looks the product up in a catalogue it
   holds itself, and credits that. There is nowhere in the request to put an
   amount. A patched app can ask to be given a pack; it cannot ask to be given
   forty thousand stars for the price of five.

   Three attacks, three answers:

     · a forged receipt          — we do not parse it, we ask the store about it
     · the same receipt twice    — transaction ids are the primary key
     · somebody else's receipt   — the grant lands on the session's account

   What this deliberately does *not* try to stop is a player editing their own
   local star balance. In a single-file game running on the player's own device
   that is unfalsifiable, and it does not matter: stars cannot be cashed out,
   and the daily board — the only thing where cheating would hurt somebody else
   — never trusts a client number. It re-scores every run from the decisions.
   Pretending otherwise would mean building DRM that fails anyway.

   Grants are credited server-side and *claimed* by the client, so a purchase
   made on a plane still lands, and lands once.

     wrangler secret put ASC_KEY          # the .p8 from App Store Connect, whole
     wrangler secret put ASC_KEY_ID
     wrangler secret put ASC_ISSUER
     wrangler secret put PLAY_SA          # the service-account JSON, whole
     wrangler secret put BUNDLE_ID        # gg.webluff.app
*/

/* The catalogue lives here and only here. The identifiers have to match what
   is declared in App Store Connect and Play exactly, and the numbers are the
   only place the grant size is decided. */
export const CATALOG = {
  'gg.bluff.stars.handful': { stars: 5000,  usd: '1.99' },
  'gg.bluff.stars.stack':   { stars: 16500, usd: '4.99' },
  'gg.bluff.stars.vault':   { stars: 46000, usd: '9.99' },
};

export function schema(sql) {
  /* the transaction id is the primary key, which is the entire replay defence:
     a second attempt at the same purchase is an INSERT that does not happen */
  sql.exec(`CREATE TABLE IF NOT EXISTS purchases(
    txid    TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    store   TEXT NOT NULL,
    product TEXT NOT NULL,
    stars   INTEGER NOT NULL,
    claimed INTEGER NOT NULL DEFAULT 0,
    at      TEXT NOT NULL
  )`);
  sql.exec(`CREATE INDEX IF NOT EXISTS purchases_acct ON purchases(account, claimed)`);
}

export function configured(env) {
  return !!(env.ASC_KEY && env.ASC_KEY_ID && env.ASC_ISSUER && env.BUNDLE_ID);
}

/* ── crypto odds and ends ─────────────────────────────────────────────────── */

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function pemToDer(pem) {
  const body = String(pem).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const enc = s => new TextEncoder().encode(s);

async function jwt(header, claims, keyPem, alg) {
  const head = b64url(enc(JSON.stringify(header)));
  const body = b64url(enc(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(keyPem),
    alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' }
                    : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']);
  const sig = await crypto.subtle.sign(
    alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5',
    key, enc(head + '.' + body));
  return `${head}.${body}.${b64url(sig)}`;
}

/* A JWS from Apple, fetched from Apple over TLS. The signature is Apple's own
   and we got it from Apple's host, so the transport is the proof and the
   payload can simply be read. Verifying the x5c chain again would be checking
   Apple's homework using certificates we would have to fetch from Apple. */
function readJws(s) {
  const mid = String(s).split('.')[1];
  if (!mid) return null;
  const pad = mid.replace(/-/g, '+').replace(/_/g, '/');
  try { return JSON.parse(atob(pad + '==='.slice((pad.length + 3) % 4))); }
  catch { return null; }
}

/* ── Apple ───────────────────────────────────────────────────────────────── */

let appleTok = null;   // per isolate, good for an hour

async function appleBearer(env) {
  const now = Math.floor(Date.now() / 1000);
  if (appleTok && now - appleTok.at < 3000) return appleTok.token;
  const token = await jwt(
    { alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' },
    { iss: env.ASC_ISSUER, iat: now, exp: now + 3500,
      aud: 'appstoreconnect-v1', bid: env.BUNDLE_ID },
    env.ASC_KEY, 'ES256');
  appleTok = { token, at: now };
  return token;
}

const APPLE = {
  prod: 'https://api.storekit.itunes.apple.com',
  dev: 'https://api.storekit-sandbox.itunes.apple.com',
};

/* StoreKit 2 gives the app a transaction id. We ask Apple what it was — a
   receipt the client sends us is a claim, and this turns it into a fact. */
async function apple(env, txid, sandbox, fetcher) {
  const host = sandbox ? APPLE.dev : APPLE.prod;
  const res = await (fetcher || fetch)(
    `${host}/inApps/v1/transactions/${encodeURIComponent(txid)}`,
    { headers: { Authorization: 'Bearer ' + await appleBearer(env) } });
  if (res.status === 404 && !sandbox) return apple(env, txid, true, fetcher);
  if (!res.ok) return { ok: false, error: 'apple would not confirm that purchase' };
  const info = readJws((await res.json()).signedTransactionInfo);
  if (!info) return { ok: false, error: 'apple sent something unreadable' };
  if (info.bundleId !== env.BUNDLE_ID)
    return { ok: false, error: 'that receipt belongs to a different app' };
  if (info.revocationDate) return { ok: false, error: 'that purchase was refunded' };
  return { ok: true, txid: String(info.transactionId), product: info.productId,
           store: sandbox ? 'apple-sandbox' : 'apple' };
}

/* ── Google ──────────────────────────────────────────────────────────────── */

let playTok = null;

async function playBearer(env, fetcher) {
  const now = Math.floor(Date.now() / 1000);
  if (playTok && now - playTok.at < 3000) return playTok.token;
  const sa = typeof env.PLAY_SA === 'string' ? JSON.parse(env.PLAY_SA) : env.PLAY_SA;
  const assertion = await jwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3500 },
    sa.private_key, 'RS256');
  const res = await (fetcher || fetch)('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error('play auth failed');
  const token = (await res.json()).access_token;
  playTok = { token, at: now };
  return token;
}

async function google(env, product, purchaseToken, fetcher) {
  const pkg = env.BUNDLE_ID;
  const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
  const url = `${base}/${pkg}/purchases/products/${encodeURIComponent(product)}` +
              `/tokens/${encodeURIComponent(purchaseToken)}`;
  const auth = { Authorization: 'Bearer ' + await playBearer(env, fetcher) };
  const res = await (fetcher || fetch)(url, { headers: auth });
  if (!res.ok) return { ok: false, error: 'google would not confirm that purchase' };
  const p = await res.json();
  if (p.purchaseState !== 0) return { ok: false, error: 'that purchase did not complete' };
  /* the order id is the thing that is unique per purchase; the token can be
     re-presented, which is exactly what we are defending against */
  return { ok: true, txid: 'g_' + String(p.orderId || purchaseToken),
           product, store: 'google', consume: () => (fetcher || fetch)(url + ':consume',
             { method: 'POST', headers: auth }) };
}

/* ── the only entry point ────────────────────────────────────────────────── */

export async function redeem(sql, env, account, body, fetcher) {
  if (!account) return { ok: false, error: 'signed out' };
  const store = String((body && body.store) || '');
  let r;
  if (store === 'apple') {
    const txid = String((body && body.transactionId) || '').slice(0, 64);
    if (!txid) return { ok: false, error: 'no transaction' };
    if (!configured(env)) return { ok: false, error: 'purchases are not switched on yet' };
    r = await apple(env, txid, false, fetcher);
  } else if (store === 'google') {
    const product = String((body && body.product) || '').slice(0, 80);
    const tok = String((body && body.token) || '').slice(0, 400);
    if (!product || !tok) return { ok: false, error: 'no purchase token' };
    if (!env.PLAY_SA) return { ok: false, error: 'purchases are not switched on yet' };
    r = await google(env, product, tok, fetcher);
  } else {
    return { ok: false, error: 'unknown store' };
  }
  if (!r.ok) return r;

  const item = CATALOG[r.product];
  if (!item) return { ok: false, error: 'we do not sell that' };

  const seen = sql.exec('SELECT account, stars FROM purchases WHERE txid = ?', r.txid).toArray()[0];
  if (seen) {
    /* Not an error. A client that lost the response and retried should get the
       same answer, and a client replaying somebody else's is simply told the
       purchase is already spoken for. */
    return { ok: true, already: true, stars: seen.account === account ? seen.stars : 0,
             product: r.product };
  }
  sql.exec(`INSERT INTO purchases(txid,account,store,product,stars,claimed,at)
            VALUES(?,?,?,?,?,0,?)`,
           r.txid, account, r.store, r.product, item.stars, new Date().toISOString());
  if (r.consume) await r.consume().catch(() => {});   // Play needs telling it was used
  return { ok: true, stars: item.stars, product: r.product, store: r.store };
}

/* Credited on the server, collected by the client. A purchase made with the
   app about to be killed still lands, and lands once, because claiming is a
   write the server does rather than a number the client remembers. */
export function claim(sql, account) {
  if (!account) return { ok: false, error: 'signed out' };
  const rows = sql.exec(
    'SELECT txid, stars, product FROM purchases WHERE account = ? AND claimed = 0',
    account).toArray();
  if (!rows.length) return { ok: true, stars: 0, items: [] };
  for (const r of rows) sql.exec('UPDATE purchases SET claimed = 1 WHERE txid = ?', r.txid);
  return { ok: true, stars: rows.reduce((a, r) => a + r.stars, 0),
           items: rows.map(r => r.product) };
}

export function history(sql, account) {
  return { ok: true, rows: sql.exec(
    'SELECT product, stars, store, at FROM purchases WHERE account = ? ORDER BY at DESC LIMIT 50',
    account).toArray() };
}
