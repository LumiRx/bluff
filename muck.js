const { chromium } = require('playwright');
const passGate = require('./gate');
(async()=>{
  const b=await chromium.launch();const errs=[];
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  await p.goto('file://'+__dirname+'/index.html');
  await passGate(p);
  await p.fill('#hnd','F'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,6).toUpperCase()); await p.click('#go2');
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
        console.log('  muck button present before any guess:',await p.locator('#muckBtn').count()>0);
        for(const c of 'CRANE') await p.keyboard.press(c);
        await p.keyboard.press('Enter'); await p.waitForTimeout(900);
        const before=await p.evaluate(()=>({chips:S.seats[0].chips,stake:S.stake,
          items:S.seats[0].items.length,setter:S.seats[S.button].chips}));
        await p.click('#muckBtn');
        const armed=await p.evaluate(()=>document.getElementById('muckBtn').textContent);
        console.log('  first tap arms it:',JSON.stringify(armed));
        await p.screenshot({path:'m-armed.png'});
        await p.click('#muckBtn');
        await p.waitForTimeout(500);
        const after=await p.evaluate(()=>({state:S.seats[0].state,items:S.seats[0].items.length,
          banner:document.getElementById('eventBar').innerText.replace(/\n/g,' ')}));
        console.log(`  after mucking: state "${after.state}", items ${before.items} -> ${after.items}`);
        console.log(`  banner: "${after.banner}"`);
        await p.screenshot({path:'m-mucked.png'});
        await p.waitForSelector('#ov.on #nx',{timeout:45000});
        const settled=await p.evaluate(()=>({chips:S.seats[0].chips,total:S.seats.reduce((a,x)=>a+x.chips,0),
          score:S.score,setter:S.seats[S.button].chips}));
        const setterGain=settled.setter-before.setter;
        console.log(`  setter collected ${setterGain} (stake ${before.stake} + antes) · you kept ${settled.chips}`);
        console.log(`  table total ${settled.total} · daily score so far ${settled.score}`);
        if(setterGain<before.stake)errs.push(`setter only got ${setterGain}, expected at least the stake ${before.stake}`);
        if(settled.total!==6000)errs.push('CHIP LEAK '+settled.total);
        break;
      }
    }
    await p.waitForSelector('#ov.on #nx',{timeout:45000}); await p.click('#nx');
    await p.waitForTimeout(250);
  }
  console.log(errs.length?'\n  FAILURES: '+errs.join(' | '):'\n  muck works, no js errors');
  await b.close();
})();
