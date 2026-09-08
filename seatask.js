const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///Users/rick/Downloads/bluff/index.html');
  await passGate(p);
  await p.fill('#hnd','S'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash');
  // profile: the permanent YOUR SEAT card
  await p.click('.pava, #prof, [data-go=profile]').catch(()=>{});
  if(!(await p.locator('#seatAsk').count())){ await p.evaluate(()=>screenProfile()); await p.waitForTimeout(400); }
  await p.evaluate(()=>{const c=document.getElementById('ovC');const el=document.getElementById('seatAsk');if(el)el.scrollIntoView({block:'center'});});
  await p.waitForTimeout(300);
  await p.screenshot({path:'/tmp/s1-seat-card.png'});
  await p.fill('#seatMail','probe+card-sept7@webluff.invalid');
  await p.click('#seatGo');
  await p.waitForTimeout(1800);
  await p.screenshot({path:'/tmp/s2-seat-kept.png'});
  console.log('kept text:',await p.evaluate(()=>{const e=document.getElementById('seatAsk');return e?e.innerText.replace(/\n+/g,' | '):'(card gone)'}));
  console.log('P.seat:',await p.evaluate(()=>JSON.stringify(P.seat)));
  console.log('errors:',errs.length?errs:'none');
  await b.close();
})().catch(e=>{console.log('SEAT FAIL',e.message);process.exit(1)});
