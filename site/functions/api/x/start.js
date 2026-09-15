/* GET /api/x/start — begin "Connect with X".
   OAuth 2.0 Authorization Code with PKCE. The verifier never reaches the browser: it is held
   in KV against a one-use state for ten minutes, which is what makes PKCE worth having on a
   flow that has a confidential client at all.

   Identity only. The scope list is deliberately the smallest thing that returns a handle:
   users.read for GET /2/users/me, and tweet.read because X requires it alongside users.read.
   We never post, never read a timeline and never touch the follow graph — the first is $0.20
   a post through the API and free through the web intent, and the last is $0.010 per user
   returned, which is not a feature, it is a bill. */

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const back = url.searchParams.get('back') || (url.origin + '/play/');

  if (!env.X_CLIENT_ID) return notConfigured(back);
  if (!env.SIGNUPS) return fail(back, 'no_store');

  // PKCE
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(18)));

  // one use, ten minutes; the back URL travels with it so the callback cannot be pointed elsewhere
  await env.SIGNUPS.put('x:st:' + state, JSON.stringify({ verifier, back }), { expirationTtl: 600 });

  const a = new URL('https://x.com/i/oauth2/authorize');
  a.searchParams.set('response_type', 'code');
  a.searchParams.set('client_id', env.X_CLIENT_ID);
  a.searchParams.set('redirect_uri', url.origin + '/api/x/callback');
  a.searchParams.set('scope', 'users.read tweet.read');
  a.searchParams.set('state', state);
  a.searchParams.set('code_challenge', challenge);
  a.searchParams.set('code_challenge_method', 'S256');
  return Response.redirect(a.toString(), 302);
}

function notConfigured(back) {
  return html(`<h1>Not connected yet</h1>
    <p>X sign-in is built but the credentials are not bound on this site, so there is nothing
    to sign in to. Nothing is wrong with your account.</p>
    <p><a href="${esc(back)}">Back to the game</a></p>`);
}
function fail(back, why) {
  return html(`<h1>That did not work</h1>
    <p>We could not start the X connection (<code>${esc(why)}</code>). Your game is untouched.</p>
    <p><a href="${esc(back)}">Back to the game</a></p>`);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function html(body) {
  return new Response(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BLUFF</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#141a24;color:#f4efe6;font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;
text-align:center;padding:24px;line-height:1.6}h1{font-size:19px;letter-spacing:.06em}
p{font-size:13px;color:#b9c2d0;max-width:30em}a{color:#d89b4f}</style>
<div>${body}</div>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
export { esc, html };
