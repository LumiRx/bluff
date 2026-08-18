const GUESSES_MAX = 4;
const { chromium } = require('playwright');
const passGate = require('./gate');
const path = 'file://' + __dirname + '/index.html';

(async () => {
  const browser = await chromium.launch();
  const errs = [], notes = [];
  const bad = m => errs.push(m);

  async function newSession(w, h) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', e => bad(`PAGEERROR ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') bad(`CONSOLE ${m.text()}`); });
    // This suite is about the rules, not the network. The daily server lives at
    // an origin no test should be reaching, so cut it off before the page loads
    // — otherwise every daily match waits out a timeout and the browser logs a
    // failed request that looks like a bug in the game. link.js is where the
    // real request is exercised, against the real Worker.
    await ctx.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
    return { ctx, page };
  }

  async function overflow(page, where) {
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 0) bad(`h-overflow ${o}px @ ${where}`);
  }

  // play one full match; returns session facts
  async function playMatch(page, style) {
    for (let hand = 0; hand < 6; hand++) {
      if (await page.locator('#pickBtn').count()) {
        await page.locator('.wcard').nth(0).click();
        await page.click('#pickBtn');
        await page.waitForSelector('#tellBtn');
        const n = await page.locator('.tell').count();
        if (n < 2) bad(`only ${n} tells offered`);
        // pick the most generous clue that still unlocks a real price
        await page.evaluate(() => {
          const o = S.tellOpts, els = [...document.querySelectorAll('.tell')];
          let bi = 0, best = -1;
          o.forEach((t, i) => { if (t.n <= 200 && t.n > best) { best = t.n; bi = i; } });
          els[bi].click();
        });
        await page.click('#tellBtn');
        await page.waitForSelector('#goBtn');
        const locked = await page.locator('.stk.off').count();
        notes.push(`hand ${hand + 1}: ${3 - locked} of 3 prices unlocked`);
        await page.evaluate(() => { const s = [...document.querySelectorAll('.stk:not(.off)')]; s[s.length - 1].click(); });
        await page.click('#goBtn');
      } else {
        await page.waitForSelector('#callB', { timeout: 25000 });
        const wide = await page.evaluate(() => S.pool.length);
        if (style === 'fold' || wide > 430) { await page.click('#foldB'); }
        else {
          await page.click('#callB');
          // phasePlay sets the phase before it writes the board, so wait on the board
          await page.waitForFunction(
            () => document.getElementById('board') || S.phase === 'showdown',
            null, { timeout: 20000 });
          if (await page.locator('#board').count()) {
            await page.evaluate(() => { window._p = S.pool.slice(); });
            for (let g = 0; g < GUESSES_MAX; g++) {
              if (await page.evaluate(() => S.seats[0].cracked || S.seats[0].guesses.length >= GUESSES)) break;
              const w = await page.evaluate(() => {
                const me = S.seats[0];
                if (me.guesses.length) {
                  const lg = me.guesses[me.guesses.length - 1], lm = me.marks[me.marks.length - 1];
                  window._p = window._p.filter(x => consistent(x, lg, lm));
                }
                const p = window._p;
                if (!me.guesses.length) { const o = (OPEN[S.word.length] || []).filter(x => p.includes(x));
                  if (o.length) return o[0]; }
                return p.length ? p[Math.floor(Math.random() * p.length)]
                                : DECKS[S.word.length][0];
              });
              for (const ch of w) await page.keyboard.press(ch);
              await page.keyboard.press('Enter');
              await page.waitForTimeout(600);
            }
          }
        }
      }
      await page.waitForSelector('#ov.on #nx', { timeout: 45000 });
      await overflow(page, `showdown ${hand + 1}`);
      await page.click('#nx');
      await page.waitForTimeout(350);
      if (hand < 5) await overflow(page, `hand ${hand + 2}`);
    }
    await page.waitForSelector('#ov.on #again', { timeout: 25000 });
    return page.evaluate(() => ({
      chips: S.seats[0].chips,
      total: S.seats.reduce((a, s) => a + s.chips, 0),
      strip: S.strip.map(h => h.sym).join(''),
      daily: S.daily,
      rating: P.rating, bank: P.bankroll, w: P.w, l: P.l, matches: P.matches,
      share: shareText()
    }));
  }

  // ─── 1. onboarding + cash game ───
  console.log('--- cash game ---');
  {
    const { ctx, page } = await newSession(390, 844);
    await page.goto(path);
  await passGate(page);
    await page.waitForSelector('#hnd');
    await overflow(page, 'handle');
    await page.fill('#hnd', 'viv');
    await page.click('#go2');
    await page.waitForSelector('#cash');
    await overflow(page, 'home');
    const store = await page.evaluate(() => Store.live);
    console.log(`  storage available: ${store}`);
    await page.click('#cash');
    const r = await playMatch(page, 'mix');
    if (r.total !== 6000) bad(`CHIP LEAK ${r.total}`);
    if (r.matches !== 1) bad(`match not recorded (${r.matches})`);
    if (r.bank !== 5000 + (r.chips - 1000)) bad(`bankroll wrong: ${r.bank}`);
    if (r.strip.length === 0) bad('empty strip');
    console.log(`  finished ${r.chips} chips · rating ${r.rating} · bank ${r.bank} · ${r.w}-${r.l}`);
    console.log(`  strip ${r.strip}`);
    console.log('  share:\n' + r.share.split('\n').map(x => '    ' + x).join('\n'));
    await overflow(page, 'summary');
    // share / ladder / profile screens
    await page.click('#sh'); await page.waitForSelector('#cp'); await overflow(page, 'share');
    await page.click('#bk'); await page.waitForSelector('#lb');
    await page.click('#lb'); await page.waitForSelector('#t1'); await overflow(page, 'ladder');
    await page.click('#t2'); await page.waitForSelector('.board'); await overflow(page, 'daily board');
    await page.click('#bk'); await page.waitForSelector('#meBtn');
    await page.click('#meBtn'); await page.waitForSelector('#wipe'); await overflow(page, 'profile');
    const prof = await page.evaluate(() => document.getElementById('ovC').innerText.length);
    if (prof < 300) bad('profile screen looks empty');
    await page.click('#bk'); await page.waitForSelector('#cash');
    await ctx.close();
  }

  // ─── 2. persistence across reload ───
  console.log('--- persistence ---');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => bad(`PAGEERROR ${e.message}`));
    await page.goto(path);
  await passGate(page);
    await page.fill('#hnd', 'VIV'); await page.click('#go2');
    await page.waitForSelector('#cash');
    await page.click('#cash');
    const a = await playMatch(page, 'mix');
    await page.reload();
    await page.waitForSelector('#cash', { timeout: 15000 });
    const b = await page.evaluate(() => ({ h: P.handle, r: P.rating, bank: P.bankroll, m: P.matches }));
    if (b.h !== 'VIV' || b.m !== 1 || b.r !== a.rating || b.bank !== a.bank)
      bad(`career did not survive reload: ${JSON.stringify(b)} vs rating ${a.rating} bank ${a.bank}`);
    else console.log(`  survived reload: ${b.h} · ${b.r} · ${b.bank} · ${b.m} match`);
    // second match must move the ladder
    await page.click('#cash');
    const c = await playMatch(page, 'mix');
    if (c.matches !== 2) bad(`second match not recorded (${c.matches})`);
    console.log(`  after 2 matches: rating ${c.rating}, bank ${c.bank}, ${c.w}-${c.l}`);
    await ctx.close();
  }

  // ─── 3. daily table: identical deals for two different players ───
  console.log('--- daily table ---');
  {
    const deals = [];
    for (const who of ['ALPHA', 'BETA']) {
      const { ctx, page } = await newSession(390, 844);
      await page.goto(path);
  await passGate(page);
      await page.fill('#hnd', who); await page.click('#go2');
      await page.waitForSelector('#daily');
      await page.click('#daily');
      const d = await page.evaluate(() => ({
        seats: S.seats.slice(1).map(s => s.name).join(','),
        script: S.script.map(x => (x.word || 'YOU') + ':' + (x.tell ? x.tell.k + x.tell.c : '-') + ':' + (x.stake || 0)).join(' '),
        cards: S.script[0].cards.join(',')
      }));
      deals.push(d);
      const r = await playMatch(page, 'fold');
      const after = await page.evaluate(() => ({ dl: P.daily.last, ds: P.daily.streak, sc: P.daily.score, rating: P.rating }));
      if (!after.dl) bad('daily not recorded');
      if (after.rating !== 1500) bad(`daily moved the rating (${after.rating}) — it should not`);
      // daily should now be locked
      await page.click('#home'); await page.waitForSelector('#daily');
      const locked = await page.locator('#daily.alt').count();
      if (!locked) bad('daily replayable the same day');
      await ctx.close();
    }
    if (deals[0].script !== deals[1].script) bad('daily deals differ between players');
    else console.log('  two players got identical deals: ' + deals[0].script.slice(0, 78) + '…');
    if (deals[0].seats !== deals[1].seats) bad('daily seating differs between players');
    else console.log('  same table: ' + deals[0].seats);
  }

  // ─── 4. small viewport + a folding session ───
  console.log('--- 360x640 ---');
  {
    const { ctx, page } = await newSession(360, 640);
    await page.goto(path);
  await passGate(page);
    await page.fill('#hnd', 'SMOL'); await page.click('#go2');
    await page.waitForSelector('#cash'); await overflow(page, 'home 360');
    await page.click('#cash');
    const r = await playMatch(page, 'fold');
    if (r.total !== 6000) bad(`CHIP LEAK ${r.total}`);
    console.log(`  folded everything: ${r.chips} chips, strip ${r.strip}`);
    await ctx.close();
  }

  console.log('\n--- errors ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
