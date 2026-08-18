const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV'); await p.locator('.faces button').nth(9).click(); await p.click('#go2');
  await p.waitForSelector('#cash'); await p.waitForTimeout(250);
  await p.screenshot({path:'f-home.png'});
  await p.click('#invite'); await p.waitForSelector('#qr svg'); await p.waitForTimeout(200);
  await p.screenshot({path:'f-invite.png'});
  const code=await p.evaluate(()=>S.lastCode);
  await p.click('#bk'); await p.click('#howto'); await p.waitForSelector('#ok');
  await p.waitForTimeout(200); await p.screenshot({path:'f-help.png',fullPage:true});
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  console.log('  invite code',code,'| help h-overflow',ov);
  console.log(errs.length?'  ERRORS '+errs.join('|'):'  no js errors');
  await b.close();
})();
