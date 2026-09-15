/* tcode.js — the invite loop, end to end.
   /t/<CODE> 302s to /play/?c=CODE, so this drives the game at the URL the
   redirect actually produces, including from a phone that has never played.
   Also checks that a coded table is treated as a friend's table and not as the
   ranked daily. Run: node tcode.js */
const { chromium } = require('playwright');
const passGate = require('./gate');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const FILE = 'file://' + __dirname + '/index.html';

(async () => {
  const b = await chromium.launch();
  const page = async (q) => {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => { console.log('PAGEERROR ' + e.message); fails++; });
    p.on('console', m => { if (m.type() === 'error') { console.log('CONSOLE ' + m.text()); fails++; } });
    await p.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
    await p.goto(FILE + (q || ''));
    return p;
  };
  const name = () => 'C' + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase();

  /* ── 1. the shape the redirect produces, read cold ── */
  {
    const p = await page('?c=ACDEF&utm_source=share&utm_medium=invite');
    ok(await p.evaluate(() => codeFromUrl()) === 'ACDEF', 'a post-redirect ?c= URL yields its code');
    ok(await p.evaluate(() => PENDING_CODE) === 'ACDEF', 'the code is held while the gate is up');
    ok(await p.isVisible('#tos'), 'a first-ever visitor still meets the door first');
    await passGate(p);
    await p.fill('#hnd', name()); await p.click('#go2');
    await p.waitForSelector('#jc', { timeout: 15000 });
    ok(await p.inputValue('#jc') === 'ACDEF', 'and the table is waiting on the far side, code filled in');
    ok(await p.evaluate(() => PENDING_CODE) === null, 'the held code is cleared once it is used');
    await p.close();
  }

  /* ── 2. a player who already has a handle goes straight there ── */
  {
    const p = await page();
    await passGate(p); await p.fill('#hnd', name()); await p.click('#go2');
    await p.waitForSelector('#cash');
    const seed = await p.evaluate(() => JSON.stringify(Store.get('bluff.profile', {})));
    await p.close();
    const q = await page('?c=ACDEF&utm_source=share&utm_medium=invite');
    await q.evaluate(s => { Store.set('bluff.profile', JSON.parse(s)); }, seed);
    await q.reload();
    await q.waitForSelector('#jc', { timeout: 15000 });
    ok(await q.inputValue('#jc') === 'ACDEF', 'a returning player lands on the table directly');
    await q.close();
  }

  /* ── 3. no regressions on the other two link shapes ── */
  {
    const p = await page('?add=VIV&utm_source=share&utm_medium=add');
    ok(await p.evaluate(() => codeFromUrl()) === null, 'a friend link is not mistaken for a table code');
    ok(await p.evaluate(() => addFromUrl()) === 'VIV', 'a friend link still reads its handle');
    await p.close();
    const q = await page();
    await passGate(q); await q.fill('#hnd', name()); await q.click('#go2');
    ok(await q.isVisible('#cash') || await q.isVisible('#first'), 'a bare /play/ still reaches home');
    await q.close();
  }

  /* ── 4. a coded table is a friend's table, not the ranked daily ── */
  {
    const p = await page();
    await passGate(p); await p.fill('#hnd', name()); await p.click('#go2');
    await p.waitForSelector('#cash');

    const coded = await p.evaluate(() => {
      P.matches = 5; P.assistOff = false; P.level = 2;
      startMatch('code', 'ACDEF');
      return { daily: S.daily, coded: S.coded, theDaily: theDaily(), assisted: assisted(), code: S.code };
    });
    ok(coded.coded === true, 'a coded table is flagged as coded');
    ok(coded.theDaily === false, 'and is not the ranked daily');
    ok(coded.assisted === true, 'so a struggling player gets help on it');

    const real = await p.evaluate(() => {
      P.matches = 5; startMatch('daily');
      return { theDaily: theDaily(), assisted: assisted() };
    });
    ok(real.theDaily === true, 'the daily still reports as the daily');
    ok(real.assisted === false, 'and is never assisted');

    /* the deals are what a code promises, and the button must not move them */
    const words = await p.evaluate(() => {
      const at = b => { setSeed(hashStr('bluff-table-ACDEF')); newGame(true, false, true); S.button = b;
        return JSON.stringify((S.script || []).map(h => h.cards)); };
      return at(0) === at(5);
    });
    ok(words, 'the six deals are identical whichever seat holds the button');

    /* a first-timer opening an invite gets the caller-first hand too */
    const firstRun = await p.evaluate(() => {
      window.__fresh = true; P.matches = 0;
      startMatch('code', 'ACDEF');
      return { button: S.button, youSetter: !!S.seats[0].setter };
    });
    ok(firstRun.button === 5 && firstRun.youSetter === false,
       'a first-ever player arriving from an invite is called on, not dealt to');

    /* and finishing it settles in chips only */
    const settle = await p.evaluate(() => {
      window.__fresh = false; P.matches = 5; P.rating = 1500;
      P.daily = Object.assign({}, P.daily, { last: '' });
      startMatch('code', 'ACDEF');
      S.hand = 6; S.seats.forEach((s, i) => { s.chips = 1000 + i; });
      const rating = P.rating, last = P.daily.last;
      try { endGame(); } catch (e) { return { threw: String(e.message) }; }
      return { ratingMoved: P.rating !== rating, dailyConsumed: P.daily.last !== last,
               taped: (S.tape || []).length };
    });
    ok(!settle.threw, 'a coded table settles without throwing' + (settle.threw ? ' (' + settle.threw + ')' : ''));
    ok(settle.dailyConsumed === false, 'playing a friend\'s table does not consume your daily');
    ok(settle.ratingMoved === false, 'and does not move the ladder, because a code is replayable');
    ok(settle.taped === 0, 'and records no transcript, so nothing is posted to the board');
    await p.close();
  }

  await b.close();
  console.log(fails ? '\n' + fails + ' check(s) failed' : '\ntcode: all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('THREW ' + e.message); process.exit(1); });
