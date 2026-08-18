/* The rebuy rule: busting has to mean something, and the daily has to stay free. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
let pass=0; const bad=[];
const ok=m=>{pass++;console.log('   · '+m);};
const no=m=>{bad.push(m);console.log('   ✗ '+m);};
const is=(a,b,m)=>a===b?ok(m):no(`${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:414,height:896}});
  p.on('pageerror',e=>no('PAGEERROR '+e.message));
  await p.goto('file:///home/claude/bluff/index.html');
  await p.waitForSelector('#tos'); await p.check('#tos'); await p.click('#gGo');
  await p.waitForSelector('#hnd'); await p.fill('#hnd','VIV'); await p.click('#go2');
  await p.waitForSelector('#cash');

  console.log('\n1. busting');
  await p.evaluate(()=>{P.bankroll=120;P.rebuyAt=0;saveP();screenHome();});
  await p.waitForTimeout(200);
  await p.click('#cash'); await p.waitForTimeout(400);
  is(await p.locator('#rbDaily').count()>0,true,'a cash table with no stake shows the rebuy screen');
  is(await p.locator('#rbFree').count(),0,'no free-stake button while the clock is running');
  is((await p.locator('#ov').innerText()).includes('stakes you again in'),true,
     'but the promise of one is on screen');
  is(await p.locator('#rbDaily').count()>0,true,'and the free daily is offered first');
  is(await p.evaluate(()=>P.rebuyAt>Date.now()),true,'and the clock actually started');
  is(await p.evaluate(()=>P.bankroll),120,'no silent top-up any more');

  console.log('\n2. the daily is never blocked');
  await p.click('#rbDaily'); await p.waitForTimeout(700);
  is(await p.locator('#ov.on').count(),0,'the rebuy screen gets out of the way');
  is(await p.locator('#rbDaily').isVisible(),false,'nothing of it is left on screen');
  is(await p.evaluate(()=>!!S&&S.daily===true),true,'and it really is the daily');

  console.log('\n3. the clock pays out');
  await p.evaluate(()=>{P.rebuyAt=Date.now()-1000;P.bankroll=0;saveP();});
  is(await p.evaluate(()=>stakeUp()),true,'once the clock is up the house stakes you');
  is(await p.evaluate(()=>P.bankroll),1000,'back to the buy-in');
  is(await p.evaluate(()=>P.rebuyAt),0,'and the clock is cleared');
  await p.evaluate(()=>{P.bankroll=0;P.rebuyAt=Date.now()-1;saveP();screenRebuy();});
  await p.waitForTimeout(150);
  is(await p.locator('#rbFree').count()>0,true,'and the button is there when it is ready');
  is(await p.evaluate(()=>{P.bankroll=0;P.rebuyAt=Date.now()+3600e3;saveP();return stakeUp();}),
     false,'but not before');

  console.log('\n4. no shelf without a till');
  await p.evaluate(()=>{P.bankroll=9000;saveP();screenStore();});
  await p.waitForTimeout(300);
  is(await p.locator('.pack').count(),0,'star packs do not render with no purchase bridge');
  is(await p.evaluate(()=>Pay.live),false,'because Pay.live is false in a browser');
  is(await p.evaluate(()=>Ads.live),false,'and so is Ads.live');

  console.log('\n5. with a till');
  await p.evaluate(()=>{
    window.BluffIAP={buy:async id=>({store:'apple',transactionId:'tx-'+id})};
    window.BluffAds={rewarded:async()=>true};
    screenStore();
  });
  await p.waitForTimeout(300);
  is(await p.locator('.pack').count(),3,'three packs appear once the shell provides one');
  const ids=await p.evaluate(()=>PACKS.map(k=>k.id));
  is(ids.join(','),'gg.bluff.stars.handful,gg.bluff.stars.stack,gg.bluff.stars.vault',
     'and their identifiers match the server catalogue');

  console.log('\n6. an ad is worth a stake, five times a day');
  await p.evaluate(()=>{P.bankroll=0;P.rebuyAt=Date.now()+3600e3;P.adRebuys={d:todayKey(),n:0};saveP();});
  is(await p.evaluate(()=>Ads.left()),5,'five to start');
  is(await p.evaluate(async()=>await Ads.rewarded()),true,'watching one counts');
  is(await p.evaluate(()=>Ads.left()),4,'and is spent');
  await p.evaluate(async()=>{for(let i=0;i<6;i++)await Ads.rewarded();});
  is(await p.evaluate(()=>Ads.left()),0,'the daily allowance runs out');
  is(await p.evaluate(async()=>await Ads.rewarded()),false,'and stops paying');

  console.log('\n--- problems ---');
  if(bad.length){bad.forEach(x=>console.log('  '+x));process.exit(1);}
  console.log(`  none · ${pass} checks passed`);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
