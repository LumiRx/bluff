/* /add/<HANDLE> — a shared friend link.
   Mirrors /t/<CODE>: a Function rather than a _redirects rule, because Cloudflare
   does not substitute :splat inside a query string. The app reads ?add=HANDLE,
   pre-fills the friends screen and presses ADD, so one tap makes the mutual add.
   UTM tags on the incoming link ride along so the app's own hit call keeps them. */
export function onRequestGet({ params, request }) {
  const handle = String(params.handle || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
  const u = new URL('/play/', request.url);
  if (!handle) return Response.redirect(u.toString(), 302);
  const from = new URL(request.url);
  u.searchParams.set('add', handle);
  u.searchParams.set('utm_source', from.searchParams.get('utm_source') || 'share');
  u.searchParams.set('utm_medium', from.searchParams.get('utm_medium') || 'add');
  return Response.redirect(u.toString(), 302);
}
