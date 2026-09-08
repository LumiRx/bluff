const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{window.__ritual=true;});
  await p.goto('file:///Users/rick/Downloads/bluff/index.html');
  await passGate(p);
  await p.fill('#hnd','R'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash'); await p.click('#cash');
  // get to a decision: poll up to 170s, setting a word whenever it is our hand
  const t0=Date.now();
  while(Date.now()-t0<170000){
    if(await p.locator('#foldB').count())break;
    if(await p.locator('#pickBtn').count()){
      await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
      await p.waitForSelector('#tellBtn');
      await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];let bi=0,bs=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>bs){bs=t.n;bi=i}});e[bi].click()});
      await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
      await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()});
      await p.click('#goBtn');
    }
    const nh=p.locator('#nx');if(await nh.isVisible()){await nh.click();}
    await p.waitForTimeout(500);
  }
  console.log('reached decision after',Math.round((Date.now()-t0)/1000),'s; errors so far:',errs.length?errs:'none');
  await p.waitForTimeout(300);
  await p.screenshot({path:'/tmp/r1-decision.png'});
  const box=await p.locator('#foldB').boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await p.mouse.down();
  await p.waitForTimeout(380);
  await p.screenshot({path:'/tmp/r2-arming.png'});
  await p.waitForTimeout(420);           // past 650ms: committed
  await p.screenshot({path:'/tmp/r3-commit.png'});
  await p.waitForTimeout(450);
  await p.screenshot({path:'/tmp/r4-dealer.png'});
  await p.mouse.up();
  await p.waitForTimeout(1500);
  await p.screenshot({path:'/tmp/r5-after.png'});
  console.log('fold state:',await p.evaluate(()=>S.seats[0].state),'| errors:',errs.length?errs:'none');
  await b.close();
})().catch(e=>{console.log('RITUAL FAIL',e.message);process.exit(1)});
