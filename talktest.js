const { chromium, devices } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({...devices['iPhone 13'],hasTouch:true,isMobile:true,deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{window.__talkAlways=true;});
  await p.goto('file:///Users/rick/Downloads/bluff/index.html');
  await passGate(p);
  await p.fill('#hnd','T'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash'); await p.click('#cash');
  const setIfMine=async()=>{ if(await p.locator('#pickBtn').count()){
      await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn'); await p.waitForSelector('#tellBtn');
      await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];let bi=0,bs=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>bs){bs=t.n;bi=i}});e[bi].click()});
      await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
      await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()}); await p.click('#goBtn'); } };
  const nx=async()=>{const n=p.locator('#nx');if(await n.isVisible())await n.click();};
  let t0=Date.now(),shots=0;
  while(!(await p.locator('#callB').count())&&Date.now()-t0<150000){
    await setIfMine();await nx();
    if(await p.evaluate(()=>document.querySelectorAll('.say.on').length)&&shots<1){await p.screenshot({path:'/tmp/t0-bot-bubble.png'});shots++;}
    await p.waitForTimeout(300);}
  await p.waitForTimeout(600);
  console.log('bar mounted:',await p.locator('#talkBar').count(),'| bubbles seen so far:',shots);
  await p.screenshot({path:'/tmp/t1-decision-bar.png'});
  await p.locator('#talkBar .rx[data-rx="bluff"]').tap();
  await p.waitForTimeout(350);
  await p.screenshot({path:'/tmp/t2-you-bluff.png'});
  await p.waitForTimeout(1500);
  await p.screenshot({path:'/tmp/t3-reply.png'});
  console.log('bubbles now:',await p.evaluate(()=>[...document.querySelectorAll('.say')].map(e=>e.dataset.seat+':'+e.textContent).join(' | ')));
  await p.tap('#callB');
  await p.waitForFunction(()=>document.getElementById('board')&&S.phase==='play',null,{timeout:30000});
  const v=await p.evaluate(()=>document.getElementById('app').scrollHeight-window.innerHeight);
  console.log('390x844 play overflow with bar:',v,'| bar in play:',await p.locator('#talkBar').count());
  await p.waitForTimeout(3500);
  await p.screenshot({path:'/tmp/t4-play-bar.png'});
  console.log('errors:',errs.length?errs:'none');
  await b.close();
})().catch(e=>{console.log('TT FAIL',e.message);process.exit(1)});
