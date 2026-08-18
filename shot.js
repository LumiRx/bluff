const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://' + __dirname + '/index.html');
  await p.waitForSelector('#hnd'); await p.waitForTimeout(200);
  await p.screenshot({path:'s1-handle.png'});
  await p.fill('#hnd','VIV'); await p.click('#go2');
  await p.waitForSelector('#cash'); await p.waitForTimeout(200);
  await p.screenshot({path:'s2-home.png'});
  // play a match quickly
  await p.click('#cash');
  for (let h=0;h<6;h++){
    if (await p.locator('#pickBtn').count()){
      await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
      await p.waitForSelector('#tellBtn');
      await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];
        let bi=0,best=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>best){best=t.n;bi=i}});e[bi].click()});
      await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
      await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()});
      await p.click('#goBtn');
    } else {
      await p.waitForSelector('#callB',{timeout:25000});
      const wide = await p.evaluate(()=>S.pool.length);
      if (wide>430) await p.click('#foldB');
      else { await p.click('#callB');
        await p.waitForFunction(()=>S.phase==='play'||S.phase==='showdown',null,{timeout:20000});
        if (await p.locator('#board').count()){
          await p.evaluate(()=>{window._p=S.pool.slice()});
          for(let g=0;g<4;g++){
            if(await p.evaluate(()=>S.seats[0].cracked||S.seats[0].guesses.length>=GUESSES))break;
            const w=await p.evaluate(()=>{const me=S.seats[0];
              if(me.guesses.length){const lg=me.guesses[me.guesses.length-1],lm=me.marks[me.marks.length-1];
                window._p=window._p.filter(x=>consistent(x,lg,lm));}
              const q=window._p;
              if(!me.guesses.length){const o=OPEN.filter(x=>q.includes(x));if(o.length)return o[0]}
              return q.length?q[0]:DECK[0]});
            for(const c of w) await p.keyboard.press(c);
            await p.keyboard.press('Enter'); await p.waitForTimeout(550);
          }
        }
      }
    }
    await p.waitForSelector('#ov.on #nx',{timeout:45000});
    await p.click('#nx'); await p.waitForTimeout(300);
  }
  await p.waitForSelector('#ov.on #again'); await p.waitForTimeout(300);
  await p.screenshot({path:'s3-summary.png'});
  await p.click('#sh'); await p.waitForSelector('#cp'); await p.waitForTimeout(200);
  await p.screenshot({path:'s4-share.png'});
  await p.click('#bk'); await p.click('#lb'); await p.waitForSelector('#t1'); await p.waitForTimeout(200);
  await p.screenshot({path:'s5-ladder.png'});
  await p.click('#t2'); await p.waitForTimeout(250);
  await p.screenshot({path:'s6-daily.png'});
  await p.click('#bk'); await p.click('#prof'); await p.waitForSelector('#wipe'); await p.waitForTimeout(200);
  await p.screenshot({path:'s7-profile.png'});
  console.log('shots done');
  await b.close();
})();
