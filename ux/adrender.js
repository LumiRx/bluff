const { chromium } = require('/opt/node-tools/node_modules/playwright');
const plan = require('./adplan.json');
(async () => {
  const b = await chromium.launch();
  for (const s of plan) {
    const p = await b.newPage({ viewport:{width:s.w,height:s.h}, deviceScaleFactor:3 });
    await p.goto('file://' + s.page); await p.waitForTimeout(200);
    await p.screenshot({ path: s.out }); await p.close();
  }
  console.log('ad frames rendered'); await b.close();
})();
