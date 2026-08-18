/* ══════════ THE DAILY SERVER ══════════
   Two jobs, and it refuses to do a third.

   1. Given a day and what somebody decided, work out what that is worth. The
      score is never accepted from the client — it is computed here, from the
      decisions, by the same engine the game runs. A forged score is not
      rejected so much as ignored: there is nowhere to put it.

   2. Rank the results and publish the board.

   There is no login, no password and no personal data. A device generates its
   own random token, and that token is the only thing tying today's entry to
   the same person. Identity is only ever established at the point of paying
   somebody, which is the only point it matters. */
import { runDaily, HANDS } from './engine.js';
import * as apns from './apns.js';
export { DailyBoard } from './board.js';
export { Players } from './players.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400'
};
const json = (o, status = 200, extra) => new Response(JSON.stringify(o), {
  status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS, extra || {})
});

/* prizes ride on the daily and nowhere else, so eligibility is recorded with
   the entry rather than worked out months later at payout time */
const NO_PRIZE_US = new Set(['AZ','AR','CT','DE','LA','MT','SC','SD','TN']);
const eligible = (country, region, age18) =>
  !!age18 && !!country && (country !== 'US' || (region && !NO_PRIZE_US.has(region)));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/* A small per-IP throttle. Nothing here is expensive enough to be worth
   attacking for profit, but an unthrottled POST that runs a whole match
   through the engine is an invitation, and the board endpoint is one object
   that everybody shares. Held in memory per isolate: it is a speed bump, not a
   security control, and the real one is Cloudflare's own rate-limiting rule. */
const HITS = new Map();
function throttle(ip, limit, windowMs) {
  const now = Date.now(), rec = HITS.get(ip);
  if (!rec || now - rec.at > windowMs) { HITS.set(ip, { at: now, n: 1 }); return true; }
  rec.n++;
  if (HITS.size > 5000) for (const [k, v] of HITS) if (now - v.at > windowMs) HITS.delete(k);
  return rec.n <= limit;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    try {
      if (url.pathname === '/v1/health') return json({ ok: true, day: utcDay() });
      if (url.pathname === '/v1/daily/submit' && request.method === 'POST') {
        /* one honest player submits once a day; twenty a minute is already
           somebody doing something else */
        if (!throttle('s:' + ip, 20, 60e3))
          return json({ error: 'too many submissions' }, 429);
        return await submit(request, env);
      }
      if (url.pathname === '/v1/daily/board') {
        if (!throttle('b:' + ip, 120, 60e3))
          return json({ error: 'too many requests' }, 429);
        return await board(request, env, url);
      }
      /* scores for named handles — the friends board, which needs people who
         are nowhere near the top hundred */
      if (url.pathname === '/v1/daily/scores') {
        if (!throttle('b:' + ip, 120, 60e3)) return json({ error: 'too many requests' }, 429);
        return await scores(env, url);
      }
      /* Sign-in is the one place where an unthrottled endpoint costs real
         money — every call is a message somebody pays a carrier for — so it
         gets its own much tighter bucket before the per-number limits inside
         the object ever run. */
      if (url.pathname.startsWith('/v1/auth/')) {
        if (!throttle('a:' + ip, url.pathname.endsWith('/start') ? 5 : 15, 60e3))
          return json({ error: 'too many attempts, wait a minute' }, 429);
        return await auth(request, env, url, ip);
      }
      /* money moves here, so it gets its own bucket and its own log line */
      if (url.pathname.startsWith('/v1/purchase/')) {
        if (!throttle('m:' + ip, 30, 60e3)) return json({ error: 'too many requests' }, 429);
        return await purchase(request, env, url);
      }
      /* the books. Rate-limited harder than the board because a settle is a
         write that moves value, and because thirty an hour is already more
         matches than anybody plays. */
      if (url.pathname.startsWith('/v1/stars/')) {
        if (!throttle('l:' + ip, 60, 60e3)) return json({ error: 'too many requests' }, 429);
        return await stars(request, env, url);
      }
      if (url.pathname.startsWith('/v1/account')) {
        if (!throttle('c:' + ip, 60, 60e3)) return json({ error: 'too many requests' }, 429);
        return await account(request, env, url);
      }
      if (url.pathname.startsWith('/v1/player/') || url.pathname === '/v1/invite'
          || url.pathname === '/v1/invites') {
        if (!throttle('p:' + ip, 60, 60e3)) return json({ error: 'too many requests' }, 429);
        return await people(request, env, url);
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'server error', detail: String(err && err.message || err) }, 500);
    }
  }
};

async function submit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const day = String(body.day || '');
  if (!DAY.test(day)) return json({ error: 'bad day' }, 400);
  /* a day is playable on the day, and for a grace hour after it closes so
     somebody mid-match at midnight is not thrown away */
  const now = utcDay();
  if (day !== now) {
    const closed = Date.now() - Date.parse(day + 'T23:59:59Z');
    if (closed < 0 || closed > 3600e3) return json({ error: 'that day is closed' }, 409);
  }

  const device = String(body.device || '');
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(device)) return json({ error: 'bad device token' }, 400);
  const handle = String(body.handle || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
  if (handle.length < 2) return json({ error: 'bad handle' }, 400);
  if (!Array.isArray(body.decisions) || body.decisions.length !== HANDS)
    return json({ error: `expected ${HANDS} hands` }, 400);

  /* the only line that matters: the score is computed here, from the decisions */
  const result = runDaily(day, body.decisions);
  if (!result.ok) return json({ error: 'that transcript is not a legal daily', why: result.error }, 422);

  const country = request.headers.get('cf-ipcountry') || null;
  const region = (request.cf && request.cf.regionCode) || null;
  /* City comes off the connection, never out of the request body. A client that
     could name its own city would name the emptiest one in the world and be
     first in it by lunchtime. */
  const city = (request.cf && request.cf.city)
    ? String(request.cf.city).slice(0, 60) + (region ? ', ' + region : '')
    : null;
  /* the handful of career numbers the badges are derived from, bounded so a
     patched client cannot post a novel */
  const S = body.stats && typeof body.stats === 'object' ? body.stats : {};
  const stats = {};
  for (const k of ['setHands','setHeld','setNoTakers','called','cracked','missed',
                   'foldedN','foldsJudged','goodFolds','bigPot','bestStreak','busts'])
    stats[k] = Math.max(0, Math.min(1e6, Math.round(Number(S[k]) || 0)));

  const id = env.BOARD.idFromName(day);
  const res = await env.BOARD.get(id).fetch('https://board/submit', {
    method: 'POST',
    body: JSON.stringify({
      device, handle, score: result.score, chips: result.chips,
      region: country === 'US' ? region : country, city, stats,
      eligible: eligible(country, region, body.age18)
    })
  });
  const out = await res.json();
  return json(Object.assign({ day, score: result.score, chips: result.chips,
    hands: result.hands.map(h => ({ hand: h.hand, role: h.role, score: h.score })) }, out));
}

/* ── people ──
   One Durable Object for the whole game: handles have to be unique across all
   of it, and that is exactly what a single object is for. */
function players(env) { return env.PLAYERS.get(env.PLAYERS.idFromName('v1')); }

async function people(request, env, url) {
  const p = url.pathname;
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (p === '/v1/player/claim' && request.method === 'POST') {
    const a = request.headers.get('authorization');
    const r = await hit(env, '/claim', body, a ? { authorization: a } : {});
    return json(r);
  }
  if (p === '/v1/player/push' && request.method === 'POST')
    return json(await hit(env, '/push', body));
  if (p === '/v1/player/lookup')
    return json(await hit(env, '/lookup?handles=' +
      encodeURIComponent(url.searchParams.get('handles') || '')));

  if (p === '/v1/invite' && request.method === 'POST') {
    const r = await hit(env, '/invite', body);
    /* the invite is recorded whether or not the banner ever lands; delivery is
       a courtesy on top of it, never the thing that made it real */
    if (r.ok) request.__notify = notifyInvite(env, r);
    return json(r);
  }
  if (p === '/v1/invites')
    return json(await hit(env, '/invites?device=' +
      encodeURIComponent(url.searchParams.get('device') || '') +
      '&day=' + encodeURIComponent(url.searchParams.get('day') || utcDay())));
  if (p === '/v1/player/seen' && request.method === 'POST')
    return json(await hit(env, '/seen', body));
  return json({ error: 'not found' }, 404);
}

async function hit(env, path, body, headers) {
  const init = body
    ? { method: 'POST', body: JSON.stringify(body), headers: headers || {} }
    : (headers ? { headers } : undefined);
  const res = await players(env).fetch('https://players' + path, init);
  return await res.json();
}

/* ── signing in ──
   The phone number goes to the durable object and no further: it is hashed
   there with a secret this Worker holds, and what gets written down is the
   hash. Nothing in a log line, an error, or a response body ever contains the
   number the player typed. */
async function auth(request, env, url, ip) {
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const body = await request.json().catch(() => ({}));
  const headers = { 'cf-connecting-ip': ip };
  if (url.pathname === '/v1/auth/start')
    return json(await hit(env, '/auth/start', body, headers));
  if (url.pathname === '/v1/auth/verify')
    return json(await hit(env, '/auth/verify', body, headers));
  return json({ error: 'not found' }, 404);
}

async function stars(request, env, url) {
  const a = request.headers.get('authorization');
  if (!a) return json({ error: 'signed out' }, 401);
  const h = { authorization: a };
  if (url.pathname === '/v1/stars/audit') return json(await hit(env, '/stars/audit', null, h));
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const body = await request.json().catch(() => ({}));
  if (url.pathname === '/v1/stars/settle') return json(await hit(env, '/stars/settle', body, h));
  if (url.pathname === '/v1/stars/sync') return json(await hit(env, '/stars/sync', body, h));
  return json({ error: 'not found' }, 404);
}

async function purchase(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const a = request.headers.get('authorization');
  if (!a) return json({ error: 'signed out' }, 401);
  const body = await request.json().catch(() => ({}));
  const path = url.pathname === '/v1/purchase/verify' ? '/purchase/verify'
             : url.pathname === '/v1/purchase/claim' ? '/purchase/claim' : null;
  if (!path) return json({ error: 'not found' }, 404);
  return json(await hit(env, path, body, { authorization: a }));
}

async function account(request, env, url) {
  const auth = request.headers.get('authorization') || '';
  const headers = auth ? { authorization: auth } : {};
  if (url.pathname === '/v1/account' && request.method === 'GET')
    return json(await hit(env, '/account', null, headers));
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  if (url.pathname === '/v1/account/save' && request.method === 'POST')
    return json(await hit(env, '/account/save', body, headers));
  /* Apple requires an app that lets you make an account to let you destroy it
     from inside the app. This is that, and it really deletes. */
  if (url.pathname === '/v1/account/delete' && request.method === 'POST')
    return json(await hit(env, '/account/delete', body, headers));
  return json({ error: 'not found' }, 404);
}

async function notifyInvite(env, r) {
  if (!apns.configured(env)) return;
  const { rows } = await hit(env, '/tokens?handles=' + encodeURIComponent(r.to));
  for (const row of rows || []) {
    await apns.send(env, {
      token: row.push,
      title: r.from + ' challenged you',
      body: "Same six deals for both of you, today only. Tap to play.",
      data: { code: r.code, from: r.from, day: r.day },
      sandbox: row.platform === 'ios-dev'
    });
  }
}

async function scores(env, url) {
  const day = url.searchParams.get('day') || utcDay();
  if (!DAY.test(day)) return json({ error: 'bad day' }, 400);
  const handles = (url.searchParams.get('handles') || '').split(',')
    .map(h => h.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(h => h.length >= 2).slice(0, 50);
  if (!handles.length) return json({ day, scores: {} });
  const id = env.BOARD.idFromName(day);
  const res = await env.BOARD.get(id).fetch(
    'https://board/scores?handles=' + encodeURIComponent(handles.join(',')));
  const data = await res.json();
  return json({ day, ...data }, 200, { 'Cache-Control': 'public, max-age=20' });
}

async function board(request, env, url) {
  const day = url.searchParams.get('day') || utcDay();
  if (!DAY.test(day)) return json({ error: 'bad day' }, 400);
  /* ?city=mine means "the city this request is coming from" — the client still
     never gets to name one */
  let city = '';
  if (url.searchParams.get('city') === 'mine' && request.cf && request.cf.city) {
    const region = request.cf.regionCode;
    city = '&city=' + encodeURIComponent(
      String(request.cf.city).slice(0, 60) + (region ? ', ' + region : ''));
  }
  const id = env.BOARD.idFromName(day);
  const res = await env.BOARD.get(id).fetch('https://board/board?n=' +
    (url.searchParams.get('n') || 100) + city);
  const data = await res.json();
  /* the board is the same object for everybody, so let the edge hold it */
  return json({ day, ...data }, 200, { 'Cache-Control': 'public, max-age=20' });
}
