/* GET /api/x/callback — the other half of "Connect with X".

   Exchanges the code for a token, reads the handle once, throws the token away, and sends the
   player back into the game with ?x=<handle>&xv=1. We store no access token and no refresh
   token: the only thing this flow is for is proving a handle, and a token we keep is a token
   we have to protect, rotate and disclose. One GET /2/users/me is $0.001 as an owned read;
   keeping the token would buy us nothing and cost us a privacy answer. */

import { esc, html } from './start.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');
  const home = url.origin + '/play/';

  if (!env.SIGNUPS) return page(home, 'Not connected', 'This site has no store bound, so the connection cannot be completed.');

  // the state is one-use whatever happens next
  let saved = null;
  if (state) {
    const raw = await env.SIGNUPS.get('x:st:' + state);
    if (raw) { saved = JSON.parse(raw); await env.SIGNUPS.delete('x:st:' + state); }
  }
  const back = (saved && saved.back) || home;

  if (denied) return page(back, 'Not connected', 'You cancelled the X connection. Nothing changed.');
  if (!code || !saved) return page(back, 'That link expired', 'Start the connection again from your profile — a sign-in link is only good for ten minutes and only once.');
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET) return page(back, 'Not connected yet', 'X sign-in is built but the credentials are not bound on this site.');

  let handle = '';
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: url.origin + '/api/x/callback',
      code_verifier: saved.verifier,
      client_id: env.X_CLIENT_ID
    });
    const tok = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: 'Basic ' + btoa(env.X_CLIENT_ID + ':' + env.X_CLIENT_SECRET)
      },
      body
    });
    if (!tok.ok) return page(back, 'X refused that', 'The sign-in could not be completed. Nothing changed on your account.');
    const { access_token } = await tok.json();
    if (!access_token) return page(back, 'X refused that', 'No token came back. Nothing changed on your account.');

    const me = await fetch('https://api.x.com/2/users/me', {
      headers: { authorization: 'Bearer ' + access_token }
    });
    if (!me.ok) return page(back, 'Could not read your handle', 'X let you in but would not tell us who you are. Nothing changed.');
    const j = await me.json();
    handle = (j && j.data && j.data.username) || '';
  } catch (e) {
    return page(back, 'That did not work', 'We could not reach X just then. Nothing changed on your account.');
  }

  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle))
    return page(back, 'Could not read your handle', 'X returned something we did not expect. Nothing changed.');

  // count it, so the funnel knows this exists; no handle is stored against a person
  try {
    const k = 'count:bucket:x:connect';
    const n = parseInt(await env.SIGNUPS.get(k) || '0', 10) || 0;
    await env.SIGNUPS.put(k, String(n + 1));
  } catch (e) { /* a counter is never worth failing a sign-in over */ }

  const to = new URL(back);
  to.searchParams.set('x', handle);
  to.searchParams.set('xv', '1');
  return Response.redirect(to.toString(), 302);
}

function page(back, title, msg) {
  return html(`<h1>${esc(title)}</h1><p>${esc(msg)}</p>
    <p><a href="${esc(back)}">Back to the game</a></p>`);
}
