/* The seam the prize money rides on.

   verify.js proves the server's engine agrees with the game. api.js proves the
   Worker handles requests correctly. Neither proves that the game actually
   *sends* the right thing, or does anything sensible with the answer — and that
   is the join where a real player's run would silently vanish.

   So: play a real daily in a real page, put the real Worker behind the real
   fetch, and watch a run travel all the way to a board and back into the
   summary screen. Then break the network and check nobody's run is lost. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const PLAY = require('./playdaily');
const E = require('./server/src/engine.js');
const fs = require('fs'), vm = require('vm');

/* The Worker only accepts today, so the test has to use the real UTC day —
   pinning a date here made the forgery test pass for the wrong reason (a "day
   closed" 409 rather than a rejected transcript), which is worse than no test. */
const DAY = new Date().toISOString().slice(0, 10);

// ── the Durable Object, in memory, same contract as server/src/board.js
class Board {
  constructor() { this.rows = new Map(); this.n = 0; }
  submit(e) {
    const prev = this.rows.get(e.device);
    if (prev) return { ok: true, already: true, score: prev.score, chips: prev.chips,
      eligible: !!prev.eligible, rank: this.rank(e.device), players: this.rows.size };
    this.rows.set(e.device, Object.assign({ at: this.n++ }, e));
    return { ok: true, score: e.score, chips: e.chips, eligible: !!e.eligible,
      rank: this.rank(e.device), players: this.rows.size };
  }
  rank(device) {
    const me = this.rows.get(device); if (!me) return null;
    let above = 0; for (const r of this.rows.values()) if (r.score > me.score) above++;
    return above + 1;
  }
  board(n) {
    return { players: this.rows.size,
      rows: [...this.rows.values()].sort((a, b) => b.score - a.score || a.at - b.at)
        .slice(0, n).map(r => ({ handle: r.handle, score: r.score, chips: r.chips,
                                 eligible: r.eligible ? 1 : 0 })) };
  }
}

// ── the Worker itself, its ESM turned into something Node will run
function loadWorker(board) {
  const src = fs.readFileSync('./server/src/index.js', 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export \{[^}]*\}[^;]*;?$/gm, '')
    .replace(/^export default /m, 'const WORKER = ')
    .replace(/^export (async function|function|const)/gm, '$1');
  const ctx = { runDaily: E.runDaily, HANDS: E.HANDS, Response, Request, URL, Date, JSON,
                console, Set, Array, String, Number, Object };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src + '\nglobalThis.__W = WORKER;', ctx);
  const env = { BOARD: {
    idFromName: n => n,
    get: () => ({ fetch: async (url, init) => {
      const u = new URL(url);
      if (u.pathname === '/submit')
        return new Response(JSON.stringify(board.submit(JSON.parse(init.body))));
      return new Response(JSON.stringify(board.board(+u.searchParams.get('n') || 100)));
    } })
  } };
  return { worker: ctx.__W, env };
}

(async () => {
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);

  const board = new Board();
  const { worker, env } = loadWorker(board);
  let seen = [];               // every request the game made
  let down = false;            // pull the plug on demand

  const browser = await chromium.launch();
  // a context per player: two people are two devices, and sharing one would also
  // share the saved profile, so the second would never see the age gate
  const newCtx = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.route('**://api.webluff.com/**', async route => {          // the real Worker
      const req = route.request();
      if (down) return route.abort('failed');
      const body = req.postData();
      seen.push({ url: req.url(), method: req.method(), body: body ? JSON.parse(body) : null });
      const request = new Request(req.url(), {
        method: req.method(),
        headers: Object.assign({}, req.headers(), { 'cf-ipcountry': 'US' }),
        body: req.method() === 'POST' ? body : undefined
      });
      request.cf = { regionCode: 'NY' };
      const res = await worker.fetch(request, env);
      route.fulfill({ status: res.status, contentType: 'application/json',
                      body: await res.text() });
    });
    return c;
  };

  console.log('\n1. a run travels from the table to the board');
  const ctx = await newCtx();
  const page = await ctx.newPage();
  page.on('pageerror', e => bad('PAGEERROR ' + e.message));
  await page.goto('file://' + __dirname + '/index.html');
  await PLAY.readyPage(page, DAY, { net: true, handle: 'VIV',
                                    geo: { country: 'US', state: 'NY' } });

  const decisions = await PLAY.playDaily(page, 'plays everything', bad);
  await page.waitForFunction(() => S.dailySent && S.dailySent !== 'sending',
    null, { timeout: 15000 }).catch(() => {});

  // the game now also claims a handle and marks invites seen; this section is
  // about the daily transcript, so count only that
  const posts = seen.filter(s => s.method === 'POST' && /daily\/submit/.test(s.url));
  if (posts.length !== 1) bad(`the game sent ${posts.length} submissions, expected 1`);
  else {
    const sent = posts[0].body;
    if (JSON.stringify(sent.decisions) !== JSON.stringify(decisions))
      bad('the game sent a different transcript than it played\n' +
          `       played ${JSON.stringify(decisions)}\n       sent   ${JSON.stringify(sent.decisions)}`);
    else ok(`the game sent the six decisions it actually played`);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(sent.device || ''))
      bad(`the device token "${sent.device}" is not the shape the server accepts`);
    else ok(`a device token was generated and reused (${sent.device.slice(0, 8)}…)`);
    if ('score' in sent) bad('the game sent a score — the server must be the only thing that scores');
    else ok('no score was sent: there is nothing for a cheat to edit');
  }

  const st = await page.evaluate(() => ({ sent: S.dailySent, rank: S.dailyRank,
    local: S.score, saved: P.daily.server, players: P.daily.players,
    pending: P.daily.pending, banner: document.querySelector('.ban.cash, .ban.hold, .ban.dn')
      ? document.querySelector('.ban.cash, .ban.hold, .ban.dn').innerText : '' }));
  if (st.sent !== 'sent') bad(`the game thinks the run is "${st.sent}"`);
  else if (st.rank !== 1) bad(`first run on an empty board ranked ${st.rank}`);
  else ok(`the board answered: rank ${st.rank} of ${st.players}`);
  if (st.saved !== st.local)
    bad(`the server scored ${st.saved}, the game showed ${st.local}`);
  else ok(`the server independently recomputed the same score (${st.saved})`);
  if (!/FIRST ON THE DAILY/.test(st.banner))
    bad(`the summary does not show the prize: "${st.banner.replace(/\n/g, ' ')}"`);
  else ok(`the summary shows "${st.banner.split('\n')[0]}"`);

  console.log('\n2. the board on screen is the live one');
  // seed the board with other people so ranking is doing something
  for (const [h, sc] of [['ACE', 9999], ['NIT', 10]])
    board.submit({ device: 'seed-' + h + '-000000000000', handle: h, score: sc, chips: 5000,
                   region: 'NY', eligible: 1 });
  await page.evaluate(() => { LIVE = null; screenBoard('daily'); });
  await page.waitForFunction(() => /Live board/.test(document.body.innerText),
    null, { timeout: 8000 }).catch(() => bad('the daily tab never showed the live board'));
  const shown = await page.evaluate(() => ({
    note: (document.querySelector('.fine') || {}).innerText || '',
    rows: [...document.querySelectorAll('.board .lrow')].map(r => ({
      name: (r.querySelector('.nm b') || {}).innerText,
      sub: (r.querySelector('.nm em') || {}).innerText || '',
      val: (r.querySelector('.vl b') || {}).innerText, me: r.classList.contains('me') }))
  }));
  if (shown.rows[0] && shown.rows[0].name !== 'ACE')
    bad(`the live board is not sorted: top row is ${shown.rows[0].name}`);
  else ok(`the live board ranks real entries (${shown.rows.map(r => r.name).join(' > ')})`);
  const me = shown.rows.find(r => r.me);
  if (!me) bad('the player cannot find their own row on the live board');
  else ok(`the player's own row is marked (${me.name}, ${me.val})`);
  // v1 pays stars, so that is what the paying rows have to say
  if (!/3,?000|★/.test(shown.rows[0] && shown.rows[0].sub || ''))
    bad(`the paying rows do not say what they pay: "${shown.rows[0] && shown.rows[0].sub}"`);
  else ok(`the top three rows state the prize (${shown.rows[0].sub})`);
  if (!/\d+ runs? in so far today/.test(shown.note))
    bad(`the note does not say how many have played: "${shown.note.slice(0, 70)}"`);
  else ok('the board says how many runs are in');

  console.log('\n3. one entry per person per day — the first one stands');
  const again = await page.evaluate(async () => {
    const r = await submitDaily(todayKey(), S.tape.slice());
    return r;
  });
  if (!again || !again.already) bad('a second submission was not recognised as a repeat');
  else ok(`a repeat submission is refused politely — the first score (${again.score}) stands`);

  console.log('\n4. a dead network must not cost somebody their run');
  down = true; seen = [];
  const ctx2 = await newCtx();
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => bad('PAGEERROR ' + e.message));
  await p2.goto('file://' + __dirname + '/index.html');
  await PLAY.readyPage(p2, DAY, { net: true, handle: 'OFFL',
                                  geo: { country: 'US', state: 'NY' } });
  await PLAY.playDaily(p2, 'folds everything', bad);
  await p2.waitForFunction(() => S.dailySent && S.dailySent !== 'sending',
    null, { timeout: 20000 }).catch(() => {});
  const off = await p2.evaluate(() => ({ sent: S.dailySent, pending: !!P.daily.pending,
    day: P.daily.pending && P.daily.pending.day,
    hands: P.daily.pending && P.daily.pending.decisions.length,
    banner: [...document.querySelectorAll('.ban')].map(b => b.innerText).join(' | ') }));
  if (off.sent !== 'offline') bad(`an unreachable board left the game in "${off.sent}"`);
  else if (!off.pending) bad('an undelivered run was thrown away');
  else ok(`the run is kept for later (${off.day}, ${off.hands} hands)`);
  if (!/NOT YET ON THE BOARD/.test(off.banner))
    bad(`the player is not told their run is not up yet: "${off.banner}"`);
  else ok('the summary says plainly that the run is saved but not yet on the board');
  if (/\$\d|FIRST ON THE DAILY/.test(off.banner))
    bad('an unsent run still advertised a placing');
  else ok('no prize is claimed against a board the run never reached');

  console.log('\n5. and it goes up by itself next time the game opens');
  down = false;
  const flushed = await p2.evaluate(async () => {
    await flushDaily();
    return { pending: !!P.daily.pending, rank: P.daily.rank, players: P.daily.players,
             device: P.device };
  });
  if (flushed.pending) bad('the queued run was not delivered when the network came back');
  else if (!flushed.rank) bad('the queued run was delivered but no rank came back');
  else ok(`the queued run went up on its own — rank ${flushed.rank} of ${flushed.players}`);
  if (!board.rows.has(flushed.device))
    bad('the flushed run is not actually on the board');
  else ok(`and it is on the board (${board.rows.get(flushed.device).handle}, ` +
          `${board.rows.get(flushed.device).score})`);

  console.log('\n6. and a tampered client still cannot buy itself a prize');
  const forged = await p2.evaluate(async () => {
    // the most obvious attack: a made-up transcript with a made-up score
    const r = await fetch('https://api.webluff.com/v1/daily/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: todayKey(), device: 'forged-device-0000000000',
        handle: 'CHEAT', score: 999999, chips: 999999, age18: true,
        decisions: [{ word: 'ZEBRA', tell: { k: 'pin', c: 'Z', i: 0 }, stake: 100 },
                    ...Array(5).fill({ call: false })] })
    });
    return { status: r.status, body: await r.json() };
  });
  if (forged.status !== 422)
    bad(`a fabricated transcript came back ${forged.status} — expected 422 (the ` +
        `transcript refused), not a different objection: "${forged.body.error}"`);
  else ok(`a fabricated transcript is refused — ${forged.status} "${forged.body.why || forged.body.error}"`);
  const cheated = board.rows.has('forged-device-0000000000');
  if (cheated) bad('the cheat reached the board anyway');
  else ok('nothing from the cheat reached the board');

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
