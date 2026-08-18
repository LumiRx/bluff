const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV'); await p.locator('.faces button').nth(9).click(); await p.click('#go2');
  await p.waitForSelector('#cash'); await p.click('#cash');
  await p.waitForTimeout(1200);
  await p.evaluate(()=>document.getElementById('eventBar').classList.remove('on'));
  await p.screenshot({path:'v-deal.png'});
  // setter flow
  await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
  await p.waitForSelector('#tellBtn');
  await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];
    let bi=0,best=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>best){best=t.n;bi=i}});e[bi].click()});
  await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
  await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()});
  await p.click('#goBtn');
  await p.waitForTimeout(900);
  await p.screenshot({path:'v-action.png'});   // chips flying to the pot
  await p.waitForSelector('#ov.on #nx',{timeout:45000});
  await p.click('#nx');
  // next hand: call and play so we see the tray + board
  await p.waitForSelector('#callB',{timeout:25000});
  await p.evaluate(()=>{S.seats[0].items=['hint','gift','peek','swap'];drawTray();});
  await p.screenshot({path:'v-bet.png'});
  await p.click('#callB');
  await p.waitForFunction(()=>S.phase==='play'||S.phase==='showdown',null,{timeout:20000});
  await p.waitForTimeout(500);
  if(await p.locator('#board').count()){
    await p.evaluate(()=>{S.seats[0].items=['hint','gift','peek','swap'];drawTray();});
    for(const c of 'CRANE') await p.keyboard.press(c);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(1000);
    await p.screenshot({path:'v-play.png'});
    // fire the rare one
    await p.evaluate(()=>{S.arm=null;useItem('swap',null);});
    await p.waitForTimeout(700);
    await p.screenshot({path:'v-swap.png'});
  }
  console.log(errs.length?'ERRORS: '+errs.join(' | '):'no js errors');
  await b.close();
})();
