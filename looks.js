/* Final look-over: the table mid-hand, the showdown that teaches the word,
   the summary board, and the profile with the sound switch. */
const { chromium } = require('playwright');
const passGate = require('./gate');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
  await p.goto('file://' + __dirname + '/index.html');
  await passGate(p);
  await p.waitForSelector('#hnd');
  await p.fill('#hnd', 'VIV'); await p.click('#go2');
  await p.waitForSelector('#cash');
  await p.click('#cash');

  for (let hand = 0; hand < 6; hand++) {
    if (await p.locator('#pickBtn').count()) {
      if (hand === 0) { await p.waitForTimeout(300); await p.screenshot({ path: 'f1-deal.png' }); }
      await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
      await p.waitForSelector('#tellBtn');
      await p.evaluate(() => {
        const o = S.tellOpts, e = [...document.querySelectorAll('.tell')];
        let bi = 0, best = -1; o.forEach((t, i) => { if (t.n <= 200 && t.n > best) { best = t.n; bi = i; } });
        e[bi].click();
      });
      await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
      await p.evaluate(() => { const s = [...document.querySelectorAll('.stk:not(.off)')]; s[s.length - 1].click(); });
      await p.click('#goBtn');
    } else {
      await p.waitForSelector('#callB', { timeout: 25000 });
      await p.click('#callB');
      // phasePlay sets S.phase before it writes #board, so waiting on the phase
      // and then looking for the board loses that race and hangs the hand
      await p.waitForFunction(
        () => document.getElementById('board') || S.phase === 'showdown',
        null, { timeout: 20000 });
      if (await p.locator('#board').count()) {
        await p.evaluate(() => { window._p = S.pool.slice(); });
        for (let g = 0; g < 4; g++) {
          if (await p.evaluate(() => S.seats[0].cracked || S.seats[0].guesses.length >= GUESSES)) break;
          const w = await p.evaluate(() => {
            const me = S.seats[0];
            if (me.guesses.length) {
              const lg = me.guesses[me.guesses.length - 1], lm = me.marks[me.marks.length - 1];
              window._p = window._p.filter(x => consistent(x, lg, lm));
            }
            const tried = new Set(me.guesses);
            const live = window._p.filter(x => !tried.has(x));
            return live.length ? live[0] : DECKS[S.word.length].find(x => !tried.has(x));
          });
          for (const c of w) await p.keyboard.press(c);
          await p.keyboard.press('Enter');
          await p.waitForTimeout(600);
          if (hand === 1 && g === 1) await p.screenshot({ path: 'f2-play.png' });
        }
      }
    }
    await p.waitForSelector('#ov.on #nx', { timeout: 45000 });
    if (hand === 1) { await p.waitForTimeout(400); await p.screenshot({ path: 'f3-showdown.png', fullPage: true }); }
    await p.click('#nx'); await p.waitForTimeout(350);
  }
  await p.waitForSelector('#ov.on #again', { timeout: 25000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'f4-summary.png', fullPage: true });
  await p.click('#home'); await p.waitForSelector('#cash');
  await p.click('#meBtn'); await p.waitForSelector('#psnd');
  await p.screenshot({ path: 'f5-profile.png', fullPage: true });
  console.log('errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
