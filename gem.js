/* Catches the felt at several points in the shimmer cycle so I can see the
   band actually travel, and does it for every table skin. */
const { chromium } = require('playwright');
const passGate = require('./gate');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + __dirname + '/index.html');
  await passGate(p);
  await p.waitForSelector('#hnd');
  await p.fill('#hnd', 'VIV'); await p.click('#go2');
  await p.waitForSelector('#cash');
  await p.click('#cash');
  await p.waitForSelector('#pickBtn');
  await p.evaluate(() => ovHide());

  const table = p.locator('#table');

  // freeze the animation at chosen points in the 9s cycle
  for (const pct of [5, 10, 15, 20, 25]) {
    await p.evaluate(t => {
      const e = document.getElementById('feltEl');
      e.style.setProperty('--x', '1');
      document.getElementById('_f') || (() => {
        const s = document.createElement('style'); s.id = '_f'; document.head.appendChild(s);
      })();
      document.getElementById('_f').textContent =
        `#feltEl::after{animation-play-state:paused;animation-delay:-${t}s}`;
    }, (pct / 100) * 9);
    await p.waitForTimeout(120);
    await table.screenshot({ path: `gem-${String(pct).padStart(2, '0')}.png` });
  }

  // one shot of every stone, all at the same point in the sweep
  const felts = await p.evaluate(() => COSM.felt.map(f => f.id));
  for (const id of felts) {
    await p.evaluate(i => { P.equipped.felt = i; applyCosmetics(); }, id);
    await p.waitForTimeout(90);
    await table.screenshot({ path: `stone-${id}.png` });
  }
  console.log('captured', felts.join(' '));
  await b.close();
})();
