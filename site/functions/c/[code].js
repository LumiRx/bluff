/* /c/<CODE> — a creator / streamer link. The attribution seam the Streamer
   Challenge pays against: a signup arriving through here is traceable to the
   creator who sent it. Same reason as /t/ for being a Function, not a redirect rule. */
export function onRequestGet({ params, request }) {
  const code = String(params.code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  const u = new URL('/play/', request.url);
  if (code) u.searchParams.set('c', code);
  u.searchParams.set('utm_source', 'creator');
  u.searchParams.set('utm_medium', 'stream');
  u.searchParams.set('utm_campaign', 'streamer-challenge');
  return Response.redirect(u.toString(), 302);
}
