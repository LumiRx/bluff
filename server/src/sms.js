/* ══════════ SENDING THE CODE ══════════

   One function, three back ends, and a deliberate default of "log" so the whole
   sign-in flow can be built, tested and demoed before anybody has a vendor
   account. In that mode the code goes to the Worker log and the response says
   plainly that nothing was sent, which is a state the client has to handle
   anyway — a carrier dropping a message looks the same from the outside.

   The thing that actually costs money here is not the messages you meant to
   send. It is SMS pumping: a bot asks for codes to premium numbers in a country
   you have never heard of, and somebody takes a cut of the carrier revenue.
   That attack is why `accounts.js` refuses countries it was not told to serve
   before it ever gets here, and why this module has no retry loop. A message
   that fails, fails. */

export function configured(env) {
  const p = (env.SMS_PROVIDER || '').toLowerCase();
  if (p === 'log') return true;
  if (p === 'twilio') return !!(env.TWILIO_SID && env.TWILIO_TOKEN &&
                                (env.TWILIO_FROM || env.TWILIO_SERVICE));
  if (p === 'messagebird') return !!(env.MB_KEY && env.MB_FROM);
  return false;
}

export function provider(env) { return (env.SMS_PROVIDER || 'log').toLowerCase(); }

export async function send(env, e164, text) {
  const p = provider(env);
  try {
    if (p === 'log') {
      console.log(`[sms:log] ${e164} — ${text}`);
      return { ok: true, delivered: false, provider: 'log' };
    }
    if (p === 'twilio') return await twilio(env, e164, text);
    if (p === 'messagebird') return await messagebird(env, e164, text);
    return { ok: false, error: 'no sms provider configured' };
  } catch (e) {
    /* never throw into the request path: a code that could not be sent is a
       message to the player, not a 500 */
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function twilio(env, to, body) {
  const form = new URLSearchParams({ To: to, Body: body });
  if (env.TWILIO_SERVICE) form.set('MessagingServiceSid', env.TWILIO_SERVICE);
  else form.set('From', env.TWILIO_FROM);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
  if (res.ok) return { ok: true, delivered: true, provider: 'twilio' };
  const t = await res.text();
  console.log('[sms:twilio] ' + res.status + ' ' + t.slice(0, 300));
  return { ok: false, error: 'carrier refused', status: res.status };
}

async function messagebird(env, to, body) {
  const res = await fetch('https://rest.messagebird.com/messages', {
    method: 'POST',
    headers: { Authorization: `AccessKey ${env.MB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: [to], originator: env.MB_FROM, body }),
  });
  if (res.ok) return { ok: true, delivered: true, provider: 'messagebird' };
  const t = await res.text();
  console.log('[sms:messagebird] ' + res.status + ' ' + t.slice(0, 300));
  return { ok: false, error: 'carrier refused', status: res.status };
}
