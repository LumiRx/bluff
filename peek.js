const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();const errs=[];
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV'); await p.click('#go2');
  await p.waitForSelector('#cash'); await p.click('#cash');
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
        // wait until a rival has actually guessed, then peek
        await p.waitForFunction(()=>S.seats.some(x=>!x.you&&x.guesses.length>0),null,{timeout:20000});
        const r=await p.evaluate(()=>{
          S.seats[0].items=['peek'];drawTray();
          const t=S.seats.find(x=>!x.you&&x.guesses.length);
          S.arm='peek';useItem('peek',t);
          return {name:t.name,shown:document.getElementById('eventBar').classList.contains('on'),
                  html:document.getElementById('eventBar').innerText.replace(/\n/g,' ')};
        });
        console.log(`  PEEK on ${r.name}: banner ${r.shown} -> "${r.html}"`);
        await p.waitForTimeout(250);
        await p.screenshot({path:'v-peek.png'});
        // and the item tray after spending
        console.log('  items left:',await p.evaluate(()=>S.seats[0].items));
        break;
      }
    }
    await p.waitForSelector('#ov.on #nx',{timeout:45000}); await p.click('#nx');
    await p.waitForTimeout(250);
  }
  console.log(errs.length?'  ERRORS '+errs.join('|'):'  no js errors');
  await b.close();
})();
