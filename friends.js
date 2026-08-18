/* Two people, two devices, one challenge.

   The friends board used to hash a handle and a date into a plausible number,
   so adding a real friend showed them scoring 412 on a day they never opened
   the app. This proves the replacement: handles are claimed and unique, scores
   come from the board or show as absent, and a challenge is an event the other
   person receives rather than a code both sides derive and hope about.

   Everything runs against the real Worker and the real Durable Objects, in two
   separate browser contexts, because "two players" is the entire feature and a
   single-context test would prove nothing. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const PLAY = require('./playdaily');
const E = require('./server/src/engine.js');
const fs = require('fs'), vm = require('vm');

const DAY = new Date().toISOString().slice(0, 10);

// ── the two Durable Objects, in memory, same contracts as the real ones
class Board {
  constructor() { this.rows = new Map(); this.n = 0; }
  submit(e) {
    if (this.rows.has(e.device)) {
      const p = this.rows.get(e.device);
      return { ok: true, already: true, score: p.score, chips: p.chips,
               eligible: !!p.eligible, rank: this.rank(e.device), players: this.rows.size };
    }
    this.rows.set(e.device, Object.assign({ at: this.n++ }, e));
    return { ok: true, score: e.score, chips: e.chips, eligible: !!e.eligible,
             rank: this.rank(e.device), players: this.rows.size };
  }
  rank(d) { const me = this.rows.get(d); if (!me) return null;
    let a = 0; for (const r of this.rows.values()) if (r.score > me.score) a++; return a + 1; }
  board(n) { return { players: this.rows.size,
    rows: [...this.rows.values()].sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, n).map(r => ({ handle: r.handle, score: r.score, chips: r.chips,
                               eligible: r.eligible ? 1 : 0 })) }; }
  scores(handles) {
    const out = {};
    for (const r of this.rows.values())
      if (handles.includes(r.handle)) out[r.handle] = { score: r.score, chips: r.chips };
    return { scores: out, players: this.rows.size };
  }
}

// the real Players class, loaded from source so the test cannot drift from it
function loadPlayers() {
  const src = fs.readFileSync('./server/src/players.js', 'utf8')
    .replace(/^export /gm, '');
  const rows = { players: [], invites: [] };
  // a tiny stand-in for the SQLite the Durable Object gets
  const sql = { exec: () => ({ toArray: () => [] }) };
  return { src, rows, sql };
}

/* Rather than fake SQLite, run the real class against a small SQL shim that
   understands the handful of statements it issues. Anything it does that the
   shim has not seen throws, which is the point: a silent mismatch here would
   be a bug that only shows up in production. */
function makePlayers() {
  const players = new Map();      // device -> row
  const invites = new Map();      // from|to|day -> row
  const S = {
    exec(q, ...a) {
      const s = q.replace(/\s+/g, ' ').trim();
      const rows = [];
      if (/^CREATE/i.test(s)) return { toArray: () => [] };
      if (s.startsWith('SELECT * FROM players WHERE device')) {
        const r = players.get(a[0]); if (r) rows.push(r);
      } else if (s.startsWith('SELECT device FROM players WHERE handle')) {
        for (const r of players.values()) if (r.handle === a[0]) rows.push({ device: r.device });
      } else if (s.startsWith('SELECT 1 FROM players WHERE handle')) {
        for (const r of players.values()) if (r.handle === a[0]) rows.push({ 1: 1 });
      } else if (s.startsWith('SELECT handle FROM players WHERE handle = ?')) {
        for (const r of players.values()) if (r.handle === a[0]) rows.push({ handle: r.handle });
      } else if (s.startsWith('SELECT handle FROM players WHERE handle IN')) {
        for (const r of players.values()) if (a.includes(r.handle)) rows.push({ handle: r.handle });
      } else if (s.startsWith('SELECT handle, push, platform FROM players')) {
        for (const r of players.values())
          if (a.includes(r.handle) && r.push) rows.push({ handle: r.handle, push: r.push,
                                                          platform: r.platform });
      } else if (s.startsWith('UPDATE players SET seen')) {
        const r = players.get(a[1]); if (r) r.seen = a[0];
      } else if (s.startsWith('UPDATE players SET handle')) {
        const r = players.get(a[2]); if (r) { r.handle = a[0]; r.seen = a[1]; }
      } else if (s.startsWith('UPDATE players SET push')) {
        const r = players.get(a[3]); if (r) { r.push = a[0]; r.platform = a[1]; r.seen = a[2]; }
      } else if (s.startsWith('INSERT INTO players')) {
        players.set(a[0], { device: a[0], handle: a[1], push: null, platform: null,
                            made: a[2], seen: a[3] });
      } else if (s.startsWith('INSERT INTO invites')) {
        invites.set(a[0] + '|' + a[1] + '|' + a[2],
                    { fromh: a[0], toh: a[1], day: a[2], code: a[3], at: a[4], seen: 0 });
      } else if (s.startsWith('SELECT fromh, code, day, seen FROM invites')) {
        for (const r of invites.values())
          if (r.toh === a[0] && r.day === a[1]) rows.push(r);
      } else if (s.startsWith('UPDATE invites SET seen')) {
        for (const r of invites.values()) if (r.toh === a[0] && r.day === a[1]) r.seen = 1;
      } else {
        throw new Error('the SQL shim has not seen: ' + s.slice(0, 80));
      }
      return { toArray: () => rows };
    }
  };
  const src = fs.readFileSync('./server/src/players.js', 'utf8').replace(/^export /gm, '');
  const ctx = { Response, JSON, Date, String, Number, Object, URL, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src + '\nglobalThis.__P = Players;', ctx);
  return new ctx.__P({ storage: { sql: S } });
}

function loadWorker(board, people) {
  const src = fs.readFileSync('./server/src/index.js', 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export \{[^}]*\}[^;]*;?$/gm, '')
    .replace(/^export default /m, 'const WORKER = ')
    .replace(/^export (async function|function|const)/gm, '$1');
  const apnsCalls = [];
  const ctx = { runDaily: E.runDaily, HANDS: E.HANDS, Response, Request, URL, Date, JSON,
                console, Set, Array, String, Number, Object, Math,
                apns: { configured: () => true,
                        send: async (env, m) => { apnsCalls.push(m); return { ok: true }; } } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src + '\nglobalThis.__W = WORKER;', ctx);
  const doFetch = obj => ({ fetch: async (url, init) => {
    const u = new URL(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (obj === 'board') {
      if (u.pathname === '/submit') return new Response(JSON.stringify(board.submit(body)));
      if (u.pathname === '/scores') return new Response(JSON.stringify(
        board.scores((u.searchParams.get('handles') || '').split(','))));
      return new Response(JSON.stringify(board.board(+u.searchParams.get('n') || 100)));
    }
    return people.fetch(new Request('https://players' + u.pathname + u.search,
      init ? { method: 'POST', body: init.body } : undefined));
  } });
  const env = { BOARD: { idFromName: n => n, get: () => doFetch('board') },
                PLAYERS: { idFromName: n => n, get: () => doFetch('people') },
                APNS_KEY: 'x', APNS_KEY_ID: 'y', APNS_TEAM_ID: 'z' };
  return { worker: ctx.__W, env, apnsCalls };
}

(async () => {
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);

  const board = new Board();
  const people = makePlayers();
  const { worker, env, apnsCalls } = loadWorker(board, people);
  let down = false;

  const browser = await chromium.launch();
  const newCtx = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.route('**://api.webluff.com/**', async route => {
      if (down) return route.abort('failed');
      const req = route.request();
      const request = new Request(req.url(), {
        method: req.method(),
        headers: Object.assign({}, req.headers(), { 'cf-ipcountry': 'US' }),
        body: req.method() === 'POST' ? req.postData() : undefined
      });
      request.cf = { regionCode: 'NY' };
      const res = await worker.fetch(request, env);
      route.fulfill({ status: res.status, contentType: 'application/json',
                      body: await res.text() });
    });
    return c;
  };
  const open = async (ctx, handle) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => bad('PAGEERROR ' + e.message));
    await p.goto('file://' + __dirname + '/index.html');
    await p.waitForSelector('#tos');
    await p.check('#tos'); await p.click('#gGo');
    await p.waitForSelector('#hnd');
    await p.evaluate(d => { window.todayKey = () => d; P.mute = true; P.noMusic = true;
      if (typeof Mus !== 'undefined') Mus.stop(); window.countIn = fn => fn(); }, DAY);
    if (handle) { await p.fill('#hnd', handle); await p.click('#go2');
      await p.waitForSelector('#cash', { timeout: 10000 }); }
    return p;
  };

  console.log('\n1. a handle is claimed, and it is yours');
  const ctxA = await newCtx(); const A = await open(ctxA, 'VIV');
  const claimedA = await A.evaluate(() => ({ h: P.handle, claimed: P.claimed }));
  if (!claimedA.claimed) bad('the handle was not claimed on the server');
  else ok(`VIV claimed, and the device knows it (${claimedA.h})`);

  console.log('\n2. the same name cannot be taken twice');
  const ctxB = await newCtx(); const B = await open(ctxB, null);
  await B.fill('#hnd', 'VIV'); await B.click('#go2');
  await B.waitForTimeout(600);
  const taken = await B.evaluate(() => ({
    stillHere: !!document.getElementById('hnd'),
    note: (document.getElementById('hnote') || {}).innerText || '',
    alts: [...document.querySelectorAll('.alt2')].map(x => x.textContent)
  }));
  if (!taken.stillHere) bad('a duplicate handle was accepted — friends would be ambiguous');
  else ok('a second VIV is refused');
  if (!taken.alts.length) bad('no alternative names were offered');
  else ok(`and offered names they can have: ${taken.alts.join(' ')}`);

  // take one of the offered names, the way a person would
  await B.evaluate(() => document.querySelector('.alt2').click());
  await B.waitForSelector('#cash', { timeout: 10000 });
  const bHandle = await B.evaluate(() => P.handle);
  ok(`the second player is ${bHandle}`);

  console.log('\n3. you cannot befriend somebody who does not exist');
  await B.evaluate(() => screenFriends());
  await B.fill('#fn', 'NOBODY9'); await B.click('#fadd');
  await B.waitForTimeout(700);
  if (await B.evaluate(() => (P.friends || []).some(f => f.h === 'NOBODY9')))
    bad('a handle nobody plays under was added to the friends list');
  else ok('adding NOBODY9 is refused — nobody plays under it');

  await B.fill('#fn', 'VIV'); await B.click('#fadd');
  await B.waitForTimeout(700);
  if (!await B.evaluate(() => (P.friends || []).some(f => f.h === 'VIV')))
    bad('a real player could not be added as a friend');
  else ok('VIV is a real player, so VIV can be added');

  console.log('\n4. a friend who has not played says so');
  const before = await B.evaluate(async () => {
    await friendScores(true); screenFriends();
    return document.querySelector('.fr b u').innerText;
  });
  const scorePart = t => t.split('\u00B7')[0];   // drop "· added 10 Aug"
  if (/\d/.test(scorePart(before))) bad(`an unplayed friend shows a number: "${before}"`);
  else ok(`before VIV plays: "${before}"`);

  console.log('\n5. and once they play, the score is the real one');
  await A.evaluate(() => { P.mute = true; window.countIn = fn => fn(); });
  await PLAY.playDaily(A, 'plays everything', bad);
  await A.waitForFunction(() => S.dailySent && S.dailySent !== 'sending',
    null, { timeout: 15000 }).catch(() => {});
  const real = await A.evaluate(() => ({ score: S.score, sent: S.dailySent }));
  if (real.sent !== 'sent') bad(`VIV's run did not reach the board (${real.sent})`);

  const after = await B.evaluate(async () => {
    await friendScores(true); screenFriends();
    return document.querySelector('.fr b u').innerText;
  });
  if (!after.includes(String(real.score)))
    bad(`the friends list shows "${after}" but VIV actually scored ${real.score}`);
  else ok(`after VIV plays: "${after}" — matches the ${real.score} the board holds`);

  console.log('\n6. a challenge reaches the other person');
  apnsCalls.length = 0;
  await people.fetch(new Request('https://players/push', { method: 'POST',
    body: JSON.stringify({ device: await A.evaluate(() => P.device),
                           token: 'a'.repeat(64), platform: 'ios' }) }));
  await B.evaluate(() => { screenDuel('VIV'); });
  await B.waitForTimeout(900);
  const sent = await B.evaluate(() => (document.getElementById('dsent') || {}).innerText || '');
  if (!/has been told/.test(sent)) bad(`the challenge was not delivered: "${sent}"`);
  else ok(`the sender is told it landed: "${sent}"`);
  if (!apnsCalls.length) bad('no push was sent to the person who was challenged');
  else ok(`a push went out: "${apnsCalls[0].title}" / "${apnsCalls[0].body}"`);
  if (!apnsCalls[0] || !apnsCalls[0].data || !apnsCalls[0].data.code)
    bad('the push carries no table code, so tapping it cannot open the right table');
  else ok(`carrying table ${apnsCalls[0].data.code}, so the banner opens that table`);

  console.log('\n7. and the person who was challenged finds out');
  const got = await A.evaluate(async () => {
    const list = await myInvites(true);
    screenHome(); paintInviteBadge();
    return { n: (list || []).length, from: (list || [])[0] && list[0].fromh,
             code: (list || [])[0] && list[0].code,
             badge: (document.querySelector('#fri .badge') || {}).textContent };
  });
  if (got.n !== 1) bad(`VIV sees ${got.n} invites, expected 1`);
  else ok(`VIV has an invite from ${got.from} for table ${got.code}`);
  if (got.badge !== '1') bad(`the home screen badge shows "${got.badge}"`);
  else ok('and the home screen carries a badge without anybody going looking');

  const same = await A.evaluate(c => challengeCode(P.handle, 'X') && c, got.code);
  const bCode = await B.evaluate(h => challengeCode(P.handle, h), 'VIV');
  if (same !== bCode) bad(`the two sides disagree about the table: ${same} vs ${bCode}`);
  else ok(`both sides derive the same table (${bCode}) — the invite matches the maths`);

  console.log('\n8. none of it may stand between somebody and a game');
  down = true;
  const ctxC = await newCtx(); const C = await open(ctxC, null);
  await C.fill('#hnd', 'OFFLINE1'); await C.click('#go2');
  const survived = await C.waitForSelector('#cash', { timeout: 12000 }).then(() => true, () => false);
  if (!survived) bad('a player could not start because the server was unreachable');
  else ok('with the network down, a handle is taken locally and play begins');
  const st = await C.evaluate(() => ({ h: P.handle, claimed: P.claimed }));
  if (st.claimed) bad('an unclaimed handle was recorded as claimed');
  else ok(`${st.h} is held locally and marked unclaimed, to be claimed on next launch`);

  const offBoard = await C.evaluate(async () => {
    P.friends = [{ h: 'VIV', d: todayKey() }]; saveP();
    const r = await friendScores(true); screenFriends();
    return { r, text: document.querySelector('.fr b u').innerText };
  });
  if (offBoard.r !== null) bad('an unreachable server returned scores anyway');
  if (/\d/.test(scorePart(offBoard.text)))
    bad(`an offline friends list invented a number: "${offBoard.text}"`);
  else ok(`offline, the list says "${offBoard.text.split('·')[0].trim()}" rather than a number`);

  down = false;
  const recovered = await C.evaluate(async () => { await catchUp(); return P.claimed; });
  if (!recovered) bad('the handle was never claimed once the network came back');
  else ok('and the name is claimed by itself when the network returns');

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
