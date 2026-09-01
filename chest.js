const { chromium } = require('playwright');
const passGate = require('./gate');
(async()=>{
  const b=await chromium.launch();const errs=[];
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  await p.goto('file://'+__dirname+'/index.html');
  await passGate(p);
  await p.fill('#hnd','F'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,6).toUpperCase()); await p.click('#go2'); await p.waitForSelector('#cash');
  console.log('  empty chest strip present:',await p.locator('.chest.idle').count()>0);

  // simulate a run of top-three finishes across days
  const sim=await p.evaluate(()=>{
    const log=[];
    const day=n=>{const d=new Date(Date.now()+n*864e5);
      return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")
        +"-"+String(d.getUTCDate()).padStart(2,"0");};
    // day 0: 1st -> $100
    P.chest.lastWin=""; P.chest.open=0; P.chest.banked=0; P.chest.streak=0;
    const realToday=todayKey;
    window.todayKey=()=>day(0); creditChest(1);
    log.push(['day0 1st', P.chest.open, P.chest.banked, P.chest.streak]);
    // day 1: 2nd -> +$50 (inside 48h)
    window.todayKey=()=>day(1); creditChest(2);
    log.push(['day1 2nd', P.chest.open, P.chest.banked, P.chest.streak]);
    // now let the window lapse: lastWin three days back
    P.chest.lastWin=day(-3); sealIfDue();
    log.push(['window lapsed', P.chest.open, P.chest.banked, P.chest.streak]);
    // fresh run straight to the cap
    window.todayKey=()=>day(0);
    creditChest(1); log.push(['  +$100', P.chest.open, P.chest.banked, P.chest.streak]);
    creditChest(1); log.push(['  +$100', P.chest.open, P.chest.banked, P.chest.streak]);
    creditChest(1); log.push(['  +$100 (caps)', P.chest.open, P.chest.banked, P.chest.streak]);
    
    window.todayKey=realToday;
    return log;
  });
  console.log('  ' + 'step'.padEnd(16)+'open  banked  run');
  sim.forEach(r=>console.log('  '+r[0].padEnd(16)+String('$'+r[1]).padEnd(6)+String('$'+r[2]).padEnd(8)+r[3]));

  await p.evaluate(()=>{P.chest.open=150;P.chest.banked=75;P.chest.streak=2;
    P.chest.lastWin=todayKey();saveP();screenHome();});
  await p.waitForTimeout(250);
  const strip=await p.evaluate(()=>document.querySelector('.cstrip').innerText.replace(/\n/g,' | '));
  console.log('  strip:',strip);
  await p.screenshot({path:'c-home.png',fullPage:true});
  await p.click('#chestBtn'); await p.waitForSelector('#claim'); await p.waitForTimeout(200);
  await p.screenshot({path:'c-chest.png',fullPage:true});
  const claim=await p.evaluate(()=>document.getElementById('claim').textContent);
  console.log('  claim button:',claim);
  await p.click('#claim'); await p.waitForTimeout(300);
  console.log('  unverified claim ->',await p.evaluate(()=>!!document.getElementById('vgo')?'sent to verify':'stayed'));
  console.log(errs.length?'  ERRORS '+errs.join(' | '):'  no js errors');
  await b.close();
})();
