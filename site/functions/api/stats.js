/* The read side of the counters. Key-protected: a pre-launch signup count is
   not something to publish by accident.

   Set the key once:
     cd site && npx wrangler pages secret put STATS_KEY --project-name=bluff
   With STATS_KEY unset the endpoint reports itself disabled rather than leaking. */
export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!env.STATS_KEY) return json({ ok: false, error: 'stats_disabled' }, 503);
  if (!safeEqual(key, env.STATS_KEY)) return json({ ok: false, error: 'unauthorised' }, 401);
  if (!env.SIGNUPS) return json({ ok: false, error: 'no_kv' }, 503);

  const day = new Date().toISOString().slice(0, 10);
  const get = async k => parseInt(await env.SIGNUPS.get(k) || '0', 10) || 0;

  // per-source buckets, listed rather than guessed
  const buckets = {};
  let cursor, guard = 0;
  do {
    const page = await env.SIGNUPS.list({ prefix: 'count:bucket:', cursor, limit: 100 });
    for (const k of page.keys) buckets[k.name.replace('count:bucket:', '')] = await get(k.name);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && ++guard < 10);

  return json({
    ok: true,
    signups: { total: await get('count:total'), today: await get('count:day:' + day), byBucket: buckets },
    traffic: {
      views: await get('a:view:total'),
      viewsToday: await get('a:view:day:' + day),
      playClicks: await get('a:play_click:total'),
      shareClicks: await get('a:share_click:total')
    },
    generatedAt: new Date().toISOString()
  });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (o, s = 200) => new Response(JSON.stringify(o, null, 2), {
  status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
