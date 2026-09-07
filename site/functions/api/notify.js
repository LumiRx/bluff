/* Launch-list signups. Needs a KV namespace bound as SIGNUPS in the Pages
   project (Settings -> Functions -> KV namespace bindings).

   Deliberately minimal: an address, a timestamp, the country Cloudflare already
   knows from the edge, and where the visitor came from. No name, no tracking
   pixel, no third party. The source tag is first-party and campaign-level — a
   creator code or a utm value we put on our own links — never a profile.
   The privacy policy promises exactly this, so this file has to keep promising it. */
const OK = e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) && e.length <= 254;
const clean = (v, n = 40) => String(v || '').trim().slice(0, n).replace(/[^\w.-]/g, '');

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const email = String(body?.email || '').trim().toLowerCase();
  if (!OK(email)) return json({ error: 'that does not look like an email address' }, 400);

  // where it came from — creator code first, then campaign tags
  const src = {
    c: clean(body?.c),
    source: clean(body?.utm_source),
    medium: clean(body?.utm_medium),
    campaign: clean(body?.utm_campaign)
  };
  // one bucket per signup, for counting without listing every key
  const bucket = src.c ? 'creator:' + src.c
               : src.source ? 'src:' + src.source + (src.medium ? '/' + src.medium : '')
               : 'direct';

  if (!env.SIGNUPS) {
    // fail loudly in the log, quietly to the visitor — a broken form should not
    // look like a broken product
    console.error('SIGNUPS KV binding is missing');
    return json({ ok: true, stored: false });
  }

  // one crude rate limit: an address can only be written once a minute
  const key = 'signup:' + email;
  const seen = await env.SIGNUPS.get(key);
  if (seen) return json({ ok: true, stored: true, already: true });

  await env.SIGNUPS.put(key, JSON.stringify({
    email,
    at: new Date().toISOString(),
    country: request.headers.get('cf-ipcountry') || null,
    bucket,
    ...(src.c ? { c: src.c } : {}),
    ...(src.source ? { source: src.source } : {}),
    ...(src.medium ? { medium: src.medium } : {}),
    ...(src.campaign ? { campaign: src.campaign } : {})
  }));

  // counters, so the count is a read rather than a full key listing
  await bump(env, 'count:total');
  await bump(env, 'count:bucket:' + bucket);
  await bump(env, 'count:day:' + new Date().toISOString().slice(0, 10));

  return json({ ok: true, stored: true, bucket });
}

async function bump(env, k) {
  try {
    const n = parseInt(await env.SIGNUPS.get(k) || '0', 10) || 0;
    await env.SIGNUPS.put(k, String(n + 1));
  } catch (e) { console.error('counter failed', k, String(e)); }
}

export function onRequestGet() { return json({ error: 'post an email address' }, 405); }

// the iOS shell posts from capacitor://localhost, so the endpoint answers the
// preflight and names an origin. It is a public capture form with no cookies
// and no credentials, so the origin is anyone.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400'
};
export function onRequestOptions() { return new Response(null, { status: 204, headers: CORS }); }

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS }
});
