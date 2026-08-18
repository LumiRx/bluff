/* /t/<CODE> — a shared table link.
   This was a _redirects rule (`/t/* /play/?c=:splat 302`) and it did not work:
   Cloudflare does not substitute :splat inside a query string, so every invite
   ever shared landed on /play/?c=:splat and could not join the table. The whole
   challenge-a-friend loop was broken from the outside. A Function is unambiguous. */
export function onRequestGet({ params, request }) {
  const code = String(params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code) return Response.redirect(new URL('/play/', request.url).toString(), 302);
  const u = new URL('/play/', request.url);
  u.searchParams.set('c', code);
  u.searchParams.set('utm_source', 'share');
  u.searchParams.set('utm_medium', 'invite');
  return Response.redirect(u.toString(), 302);
}
