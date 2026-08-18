const { chromium } = require('/opt/node-tools/node_modules/playwright');
const passGate = require('./gate');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
  await p.goto('file://' + __dirname + '/index.html');
  await passGate(p);
  await p.fill('#hnd', 'VIV'); await p.click('#go2');
  await p.waitForSelector('#cash');
  await p.screenshot({ path: 'n-home.png' });
  await p.evaluate(() => { P.mute = true; P.noMusic = true; Mus.stop(); window.countIn = f => f(); });
  // find a four-letter and a six-letter hand to show the range
  for (const want of [4, 6]) {
    for (let t = 0; t < 40; t++) {
      await p.evaluate(() => startMatch('cash'));
      await p.waitForTimeout(250);
      const len = await p.evaluate(() => (S.hand5 && S.hand5[0] && S.hand5[0].length) || 0);
      if (len === want) break;
    }
    await p.waitForSelector('#pickBtn', { timeout: 10000 }).catch(() => {});
    await p.screenshot({ path: `n-deal${want}.png` });
    await p.evaluate(() => document.querySelectorAll('.wcard')[0].click());
    await p.click('#pickBtn'); await p.waitForSelector('#tellBtn');
    await p.screenshot({ path: `n-tell${want}.png` });
  }
  // a board mid-hand, so the tile shapes show
  for (let t = 0; t < 30; t++) {
    await p.evaluate(() => startMatch('cash'));
    await p.waitForTimeout(300);
    if (await p.locator('#callB').count()) break;
    if (await p.locator('#pickBtn').count()) {
      await p.evaluate(() => document.querySelectorAll('.wcard')[0].click());
      await p.click('#pickBtn'); await p.waitForSelector('#tellBtn');
      await p.evaluate(() => document.querySelectorAll('.tell')[0].click());
      await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
      await p.evaluate(() => document.querySelectorAll('.stk:not(.off)')[0].click());
      await p.click('#goBtn');
      await p.waitForSelector('#ov.on #nx', { timeout: 30000 }).catch(()=>{});
      if (await p.locator('#nx').count()) await p.click('#nx');
      await p.waitForTimeout(400);
    }
    if (await p.locator('#callB').count()) break;
  }
  if (await p.locator('#callB').count()) {
    await p.click('#callB');
    await p.waitForFunction(() => document.getElementById('board') || S.phase === 'showdown',
      null, { timeout: 20000 }).catch(()=>{});
    await p.evaluate(() => { const w = S.pool[0]; for (const c of w) press(c); press('ENTER'); });
    await p.waitForTimeout(900);
    await p.evaluate(() => { const w = S.pool[1] || S.pool[0]; for (const c of w) press(c); press('ENTER'); });
    await p.waitForTimeout(900);
    await p.screenshot({ path: 'n-board.png' });
  }
  console.log('shots done');
  await b.close();
})();
