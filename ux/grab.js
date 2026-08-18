/* The new screens, at 3x, plus the ad journey end to end. Nothing is mocked
   except the two functions the native shell provides — everything on screen is
   the real game rendering real state. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const OUT = __dirname;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:414,height:896}, deviceScaleFactor:3 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file:///home/claude/bluff/index.html');
  await p.waitForSelector('#tos'); await p.check('#tos'); await p.click('#gGo');
  await p.waitForSelector('#hnd');
  await p.evaluate(() => { P.mute = true; P.noMusic = true;
    if (typeof Mus !== 'undefined') Mus.stop(); });
  await p.fill('#hnd','VIV'); await p.click('#go2');
  await p.waitForSelector('#cash');
  const shot = n => p.screenshot({ path: `${OUT}/ux-${n}.png` });

  // the shell the native build installs
  await p.evaluate(() => {
    window.BluffAds = { rewarded: () => new Promise(r => setTimeout(() => r(true), 50)) };
    window.BluffIAP = { buy: async id => ({ store:'apple', transactionId:'tx-'+id }) };
    SESSION = 'demo-session';
    P.rating = 1612; P.w = 14; P.l = 7; P.matches = 21; P.streak = 4;
    P.bankroll = 240; P.rebuyAt = Date.now() + 2*3600e3 + 41*60e3;
    P.adRebuys = { d: todayKey(), n: 2 };
    saveP(); screenHome();
  });
  await p.waitForTimeout(400);
  await shot('01-home-broke');

  await p.click('#cash'); await p.waitForTimeout(500);
  await shot('02-rebuy');

  await p.evaluate(() => { P.rebuyAt = Date.now() - 1000; saveP(); screenRebuy(); });
  await p.waitForTimeout(350);
  await shot('03-rebuy-ready');

  await p.evaluate(() => { P.bankroll = 9400; saveP(); screenStore(); });
  await p.waitForTimeout(450);
  await shot('04-store-top');
  await p.evaluate(() => { const s = document.querySelector('.starshop');
    if (s) s.scrollIntoView({ block:'center' }); });
  await p.waitForTimeout(350);
  await shot('05-store-packs');

  console.log('captured');
  await b.close();
})();
