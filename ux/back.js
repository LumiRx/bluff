
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:414,height:896}, deviceScaleFactor:3 });
  const p = await ctx.newPage();
  await p.goto('file:///home/claude/bluff/index.html');
  await p.waitForSelector('#tos'); await p.check('#tos'); await p.click('#gGo');
  await p.waitForSelector('#hnd');
  await p.evaluate(() => { P.mute=true; P.noMusic=true; if(typeof Mus!=='undefined')Mus.stop(); });
  await p.fill('#hnd','VIV'); await p.click('#go2'); await p.waitForSelector('#cash');
  await p.evaluate(() => {
    window.BluffAds={rewarded:async()=>true};
    P.rating=1612;P.w=14;P.l=7;P.matches=21;P.streak=4;
    P.bankroll=240;P.rebuyAt=Date.now()+2*3600e3;P.adRebuys={d:todayKey(),n:2};
    saveP();
    grantStars(1000,"\u2726 1,000\u2605 stars \u2014 back in");
    screenHome();
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: __dirname + '/ux-06-rewarded.png' });
  await b.close();
})();
