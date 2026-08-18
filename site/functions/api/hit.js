/* First-party analytics. Deliberately tiny.

   Why not Google/Plausible/anything: the /play/ CSP is connect-src 'self' plus
   our own API, the privacy policy promises no third party, and the only numbers
   PERF actually needs are page views, /play/ clicks and signups by source.
   Counters in KV answer all three and cost one write per event.

   No cookie. No device id. No fingerprint. Nothing that identifies a person —
   only which page was seen and which campaign tag brought them. */
const clean = (v, n = 40) => String(v || '').trim().slice(0, n).replace(/[^\w./-]/g, '');
const PAGES = new Set(['home', 'play', 'faq', 'rules', 'privacy', 'terms', 'support', 'vs-wordle']);
const EVENTS = new Set(['view', 'play_click', 'share_click']);

export async function onRequestPost({ request, env }) {
  if (!env.SIGNUPS) return json({ ok: true, counted: false });

  let b; try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const ev = clean(b?.e, 16);
  const page = clean(b?.p, 16);
  if (!EVENTS.has(ev) || !PAGES.has(page)) return json({ ok: false }, 400);

  const src = clean(b?.c) || clean(b?.utm_source) || 'direct';
  const day = new Date().toISOString().slice(0, 10);

  await Promise.all([
    bump(env, `a:${ev}:total`),
    bump(env, `a:${ev}:page:${page}`),
    bump(env, `a:${ev}:src:${src}`),
    bump(env, `a:${ev}:day:${day}`)
  ]);
  return json({ ok: true, counted: true });
}

async function bump(env, k) {
  try {
    const n = parseInt(await env.SIGNUPS.get(k) || '0', 10) || 0;
    await env.SIGNUPS.put(k, String(n + 1));
  } catch (e) { console.error('bump', k, String(e)); }
}

export function onRequestGet() { return json({ error: 'post an event' }, 405); }

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
