/* /c/<CODE> — a creator / streamer link. The attribution seam the Streamer
   Challenge pays against: a signup arriving through here is traceable to the
   creator who sent it. Same reason as /t/ for being a Function, not a redirect rule.
 *
 * Channel slugs are the exception. /c/x in the X bio is not a creator code — it
 * is "the link on our own profile", and treating it as one did two wrong things:
 * it stamped every channel's traffic as streamer-challenge, so bio clicks were
 * indistinguishable from creator clicks in /api/stats; and it passed c=X into the
 * game, which sends a first-time visitor into the join-a-table flow looking for a
 * table called X instead of onto the home screen. A channel link carries the
 * channel's own source and no table code. */
const CHANNEL = {
  x: 'x', tw: 'x', twitter: 'x',
  tt: 'tiktok', tiktok: 'tiktok',
  ig: 'instagram', instagram: 'instagram',
  yt: 'youtube', rd: 'reddit', li: 'linkedin',
  fb: 'facebook', th: 'threads', ds: 'discord'
};

export function onRequestGet({ params, request }) {
  const raw = String(params.code || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const u = new URL('/play/', request.url);
  const channel = CHANNEL[raw.toLowerCase()];
  if (channel) {
    u.searchParams.set('utm_source', channel);
    u.searchParams.set('utm_medium', 'bio');
    u.searchParams.set('utm_campaign', 'channel');
  } else {
    const code = raw.toUpperCase();
    if (code) u.searchParams.set('c', code);
    u.searchParams.set('utm_source', 'creator');
    u.searchParams.set('utm_medium', 'stream');
    u.searchParams.set('utm_campaign', 'streamer-challenge');
  }
  return Response.redirect(u.toString(), 302);
}
