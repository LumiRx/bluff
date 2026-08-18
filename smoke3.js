const { chromium } = require('playwright');
const PLAY = require('./playdaily');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => { errs.push('ERR ' + e.message); console.log('PAGEERROR', e.message); });
  p.on('console', m => { if (m.type() === 'error') { errs.push('C ' + m.text()); console.log('CONSOLE', m.text()); } });
  await p.goto('file://' + __dirname + '/index.html');
  await PLAY.readyPage(p, '2026-08-08');
  const info = await p.evaluate(() => ({
    decks: Object.keys(DECKS).map(k => k + ':' + DECKS[k].length).join(' '),
    guess: [4,5,6].map(L => GDICT[L].length / L).join('/'),
    aeiou: isWord('AEIOU'), crane: isWord('CRANE'), moat: isWord('MOAT'),
    caps: [4,5,6].map(L => TELLCAP(L)).join('/'),
    bands: JSON.stringify(BANDS),
    marks: document.documentElement.classList.contains('marks')
  }));
  console.log(JSON.stringify(info, null, 1));
  await p.evaluate(() => startMatch('daily'));
  await p.waitForSelector('#pickBtn', { timeout: 20000 });
  const deal = await p.evaluate(() => ({ len: S.hand5[0].length,
    cards: S.hand5, rates: S.hand5.map(w => RATE[w]) }));
  console.log('hand 1 deal:', JSON.stringify(deal));
  await p.evaluate(() => { document.querySelectorAll('.wcard')[0].click(); });
  await p.click('#pickBtn'); await p.waitForSelector('#tellBtn');
  const tells = await p.evaluate(() => S.tellOpts.map(t => t.k + t.c + t.i + '=' + t.n));
  console.log('tells:', tells.join(' '));
  await p.evaluate(() => document.querySelectorAll('.tell')[0].click());
  await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
  const stakes = await p.evaluate(() => [...document.querySelectorAll('.stk')].map(
    x => x.textContent.trim().slice(0,6) + (x.classList.contains('off') ? '(off)' : '')));
  console.log('prices:', stakes.join(' '));
  await p.evaluate(() => document.querySelectorAll('.stk:not(.off)')[0].click());
  await p.click('#goBtn');
  await p.waitForSelector('#ov.on #nx', { timeout: 40000 });
  console.log('hand 1 settled ok');
  await p.click('#nx');
  // find a hand we can call, and check the board width matches
  for (let i = 0; i < 5; i++) {
    await p.waitForFunction(() => !!document.getElementById('callB') || !!document.getElementById('pickBtn'),
      null, { timeout: 25000 });
    if (await p.locator('#callB').count()) {
      await p.click('#callB');
      await p.waitForFunction(() => document.getElementById('board') || S.phase === 'showdown',
        null, { timeout: 20000 });
      const w = await p.evaluate(() => ({ len: S.word.length,
        cols: document.querySelectorAll('#r0 .tile').length,
        given: document.querySelectorAll('.brow.given .tile').length }));
      console.log('called a', w.len, 'letter hand; board is', w.cols, 'wide, clue row', w.given);
      // a non-word must be refused
      const probe = await p.evaluate(() => {
        const junk = 'AEIOUY'.slice(0, S.word.length);
        for (const c of junk) press(c);
        const before = S.seats[0].guesses.length;
        press('ENTER');
        const took = S.seats[0].guesses.length > before;
        for (let i = 0; i < 8; i++) press('BACK');
        return { junk, took };
      });
      console.log(`typed ${probe.junk}: ${probe.took ? 'ACCEPTED — bad' : 'refused'}`);
      const real = await p.evaluate(() => {
        const w = S.pool[0];
        for (const c of w) press(c);
        const before = S.seats[0].guesses.length;
        press('ENTER');
        return { w, took: S.seats[0].guesses.length > before };
      });
      console.log(`typed ${real.w}: ${real.took ? 'accepted' : 'REFUSED — bad'}`);
      break;
    }
    await p.waitForSelector('#ov.on #nx', { timeout: 40000 }).catch(()=>{});
    if (await p.locator('#nx').count()) await p.click('#nx');
  }
  console.log('\nerrors:', errs.length ? errs.join('\n  ') : 'none');
  await b.close();
})();
