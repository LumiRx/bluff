// Screenshots of the caller decision + guess board at three viewports.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const fs=require('fs');const dir='/Users/rick/Downloads/bluff/out/shots';fs.mkdirSync(dir,{recursive:true});
const VPS=process.env.VP?[process.env.VP.split('x').map(Number)]:[[393,852],[390,844],[375,667]];
const FILE=process.argv[2]||'file:///Users/rick/Downloads/bluff/index.html';
(async()=>{
  const b=await chromium.launch();
  for(const [w,h] of VPS){
    const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const p=await ctx.newPage();
    await p.addInitScript(()=>{window.__talkAlways=true;});
    await p.goto(FILE); await p.waitForSelector('#tos'); await p.waitForTimeout(400); await p.screenshot({path:`${dir}/gate-${w}x${h}.png`}); await passGate(p);
    await p.fill('#hnd','S'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
    await p.click('#go2'); await p.waitForSelector('#cash');
    await p.screenshot({path:`${dir}/home-${w}x${h}.png`});
    await p.evaluate(()=>screenProfile()); await p.waitForTimeout(300);
    await p.screenshot({path:`${dir}/profile-${w}x${h}.png`});
    await p.evaluate(()=>screenFriends()); await p.waitForTimeout(300);
    await p.screenshot({path:`${dir}/friends-${w}x${h}.png`});
    await p.evaluate(()=>screenDuel('ACE')); await p.waitForTimeout(600);
    await p.screenshot({path:`${dir}/duel-${w}x${h}.png`});
    await p.evaluate(()=>screenTable()); await p.waitForTimeout(300);
    await p.screenshot({path:`${dir}/table-${w}x${h}.png`});
    await p.evaluate(()=>{P.handle='';saveP();screenHandle();}); await p.waitForTimeout(300);
    await p.screenshot({path:`${dir}/handle-${w}x${h}.png`});
    await p.evaluate(()=>{P.handle='SHOT';saveP();});
    await p.evaluate(()=>startMatch('cash'));
    await p.waitForSelector('.wcard'); await p.waitForTimeout(400);
    await p.screenshot({path:`${dir}/deal-${w}x${h}.png`});
    await p.locator('.wcard').nth(2).click(); await p.click('#pickBtn'); await p.waitForSelector('.tell');
    await p.locator('.tell').nth(0).click(); await p.click('#tellBtn'); await p.waitForSelector('#stk');
    await p.locator('#stk > *').nth(0).click(); await p.click('#goBtn');
    // wait for hand 2 caller decision
    let t=Date.now(),seen=false;
    while(Date.now()-t<120000){ if(await p.evaluate(()=>!!(document.getElementById('foldB')&&document.getElementById('callB')&&S.phase==='action'))){seen=true;break;}
      if(await p.evaluate(()=>{const b=document.getElementById('nx');return !!(b&&b.offsetParent!==null)})){await p.click('#nx');} await p.waitForTimeout(300); }
    if(!seen){console.log('no caller decision at',w,h);await ctx.close();continue;}
    await p.waitForTimeout(500);
    await p.screenshot({path:`${dir}/caller-${w}x${h}.png`});
    await p.click('#callB'); 
    t=Date.now(); while(Date.now()-t<20000){ if(await p.evaluate(()=>S.phase==='play'))break; await p.waitForTimeout(150); }
    await p.waitForTimeout(900);
    await p.screenshot({path:`${dir}/board-${w}x${h}.png`});
    const key=k=>p.locator(`.key[data-k="${k}"]`).dispatchEvent('pointerdown');
    for(const ch of 'CRANE'.slice(0,await p.evaluate(()=>S.word.length)))await key(ch);
    await p.waitForTimeout(200);
    await p.screenshot({path:`${dir}/board-typed-${w}x${h}.png`});
    const geo=await p.evaluate(()=>{const r=id=>{const e=document.getElementById(id);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]};return {potLbl:r('potLbl'),potVal:r('potVal'),center:r('center'),table:r('table'),stage:r('stage'),kb:r('kb'),board:r('board'),vh:innerHeight,doc:document.documentElement.scrollHeight}});
    console.log(w+'x'+h,JSON.stringify(geo));
    for(const ch of 'CRANE'.slice(0,await p.evaluate(()=>S.word.length)))await key('⌫');
    const wd=await p.evaluate(()=>S.word);for(const ch of wd)await key(ch);await key('↵');
    let tt=Date.now();while(Date.now()-tt<90000){if(await p.evaluate(()=>{const b=document.getElementById('nx');return !!(b&&b.offsetParent!==null)}))break;await p.waitForTimeout(250);}
    await p.waitForTimeout(900); await p.screenshot({path:`${dir}/result-${w}x${h}.png`});
    await ctx.close();
  }
  await b.close();
})().catch(e=>{console.log('SHOTS FAIL',e.message);process.exit(1)});
