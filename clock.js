const { chromium } = require('playwright');
const passGate = require('./gate');
(async()=>{
  const b=await chromium.launch();const errs=[];
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/index.html');
  await passGate(p);
  await p.fill('#hnd','VIV'); await p.click('#go2');
  await p.waitForSelector('#speed'); await p.click('#speed');
  for(let h=0;h<4;h++){
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
        const d0=await p.evaluate(()=>({dl:!!S.seats[0].deadline,
          left:Math.round((S.seats[0].deadline-Date.now())/1000),
          ticking:S.seats.filter(x=>x.ticking).length}));
        console.log(`  clock armed: ${d0.dl}, ${d0.left}s left, rings visible on ${d0.ticking} seats (should be 0)`);
        // fast-forward to inside the visible window
        await p.evaluate(()=>{S.seats.forEach(x=>{if(x.deadline)x.deadline=Date.now()+9000;});});
        await p.waitForTimeout(900);
        const d1=await p.evaluate(()=>S.seats.filter(x=>x.ticking).length);
        console.log(`  inside the last 30s: rings visible on ${d1} live seat(s)`);
        await p.screenshot({path:'f-clock.png'});
        // let it run out
        await p.evaluate(()=>{S.seats.forEach(x=>{if(x.deadline)x.deadline=Date.now()+300;});});
        await p.waitForTimeout(1400);
        const d2=await p.evaluate(()=>({you:S.seats[0].state,
          banner:document.getElementById('eventBar').innerText.replace(/\n/g,' ')}));
        console.log(`  after expiry: your state "${d2.you}" | banner "${d2.banner}"`);
        if(d2.you!=='bust'&&d2.you!=='crack')errs.push('clock did not end the hand: '+d2.you);
        break;
      }
    }
    await p.waitForSelector('#ov.on #nx',{timeout:45000}); await p.click('#nx');
    await p.waitForTimeout(250);
  }
  console.log(errs.length?'  ERRORS '+errs.join(' | '):'  no js errors');
  await b.close();
})();
