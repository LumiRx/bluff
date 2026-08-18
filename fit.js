const { chromium } = require('/opt/node-tools/node_modules/playwright');
const passGate = require('./gate');
(async()=>{
  const b=await chromium.launch();
  for(const [w,h] of [[390,844],[360,640],[430,932],[375,667]]){
    const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto('file://'+__dirname+'/index.html');
  await passGate(p);
    await p.fill('#hnd','VIV'); await p.click('#go2');
    await p.waitForSelector('#cash'); await p.click('#cash');
    let shot=false;
    for(let hand=0;hand<3;hand++){
      if(await p.locator('#pickBtn').count()){
        await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
        await p.waitForSelector('#tellBtn');
        await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];
          let bi=0,bs=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>bs){bs=t.n;bi=i}});e[bi].click()});
        await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
        await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()});
        await p.click('#goBtn');
      } else {
        await p.waitForSelector('#callB',{timeout:25000});
        await p.click('#callB');
        await p.waitForFunction(()=>S.phase==='play'||S.phase==='showdown',null,{timeout:20000});
        if(await p.locator('#board').count()){
          await p.evaluate(()=>{S.seats[0].items=['hint','gift','peek','swap'];drawTray();});
          await p.waitForTimeout(400);
          const v=await p.evaluate(()=>document.getElementById('app').scrollHeight-window.innerHeight);
          const ho=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
          console.log(`  ${w}x${h}  play screen vertical ${v>0?'+'+v:'fits'}px  horizontal ${ho>0?'+'+ho:'ok'}`);
          if(!shot&&w===390){await p.screenshot({path:'v-play.png'});shot=true;}
          if(!shot&&w===360){await p.screenshot({path:'v-play360.png'});shot=true;}
          break;
        }
      }
      await p.waitForSelector('#ov.on #nx',{timeout:45000});
      await p.click('#nx'); await p.waitForTimeout(300);
    }
    if(errs.length)console.log('   ERRORS',errs.join('|'));
    await p.close();
  }
  await b.close();
})();
