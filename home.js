const { chromium } = require('/opt/node-tools/node_modules/playwright');
const passGate = require('./gate');
(async()=>{
  const b=await chromium.launch();const errs=[];
  for(const [w,h,tag] of [[390,844,'390'],[360,640,'360']]){
    const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
    p.on('pageerror',e=>errs.push(e.message));
    p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
    await p.goto('file://'+__dirname+'/index.html');
  await passGate(p);
    await p.fill('#hnd','VIV'); await p.locator('.faces button').nth(9).click(); await p.click('#go2');
    await p.waitForSelector('#cash'); await p.waitForTimeout(300);
    if(tag==='390'){
      const info=await p.evaluate(()=>({
        rows:document.querySelectorAll('.board .lrow').length,
        me:document.querySelectorAll('.board .lrow.me').length,
        medals:document.querySelectorAll('.board .lrow.m1,.board .lrow.m2,.board .lrow.m3').length,
        prize:document.querySelector('.pstrip').innerText.replace(/\n/g,' | '),
        verified:P.verified, ho:document.documentElement.scrollWidth-document.documentElement.clientWidth
      }));
      console.log('  board rows on home:',info.rows,'| medals',info.medals,'| your row',info.me,'| h-overflow',info.ho);
      if(!info.rows) errs.push('the home board is empty');
      if(info.medals!==3) errs.push('podium is not three rows ('+info.medals+')');
      if(info.me!==1) errs.push('your own row is not marked exactly once ('+info.me+')');
      console.log('  banner:',info.prize);
      await p.screenshot({path:'h-home.png',fullPage:true});
      // verify flow
            await p.reload(); await p.waitForSelector('#cash');
      console.log('  survives reload:',await p.evaluate(()=>!!P.handle));
    } else {
      const ho=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      console.log('  360 home h-overflow:',ho);
      await p.screenshot({path:'h-home360.png',fullPage:true});
    }
    await p.close();
  }
  console.log(errs.length?'  ERRORS '+errs.join(' | '):'  no js errors');
  await b.close();
})();
