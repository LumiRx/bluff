// Main-thread stall hunt: play many hands by clicking like a person (real mouse clicks), while a
// heartbeat runs in the page. If the heartbeat stops for >4s the debugger pauses and prints the stack.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const HANDS=+process.argv[2]||8;
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{window.__talkAlways=true;window.__hb=Date.now();setInterval(()=>{window.__hb=Date.now();},100);});
  const client=await ctx.newCDPSession(p);
  await client.send('Debugger.enable');
  let paused=null;client.on('Debugger.paused',e=>{paused=e.callFrames.slice(0,12).map(f=>f.functionName+':'+(f.location.lineNumber+1));});
  const errs=[];p.on('pageerror',async e=>{let ctx='';try{ctx=await Promise.race([p.evaluate(()=>{try{return 'hand '+S.hand+' phase '+S.phase+' oi '+S.oi+'/'+(S.order&&S.order.length)+' pool '+(S.pool?S.pool.length:S.pool)}catch(x){return '?'}}),new Promise(r=>setTimeout(()=>r('(busy)'),1500))]);}catch(x){}errs.push(e.message.slice(0,120)+' @ '+ctx+'\n      '+String(e.stack||'').split('\n').slice(1,4).map(x=>x.trim().replace(/file:\/\/\S*index.html/,'index.html')).join(' < '));});
  await p.goto('file:///Users/rick/Downloads/bluff/index.html'); await passGate(p);
  await p.fill('#hnd','H'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash');
  await p.click('#cash');
  const t0=Date.now();let hands=0,lastHb=Date.now(),stalls=0,clicks=0;
  let misses=0;const tap=async sel=>{clicks++;try{await p.locator(sel).first().click({timeout:2500});return true;}catch(e){misses++;return false;}};
  const hb=async()=>{const v=await Promise.race([p.evaluate(()=>window.__hb),new Promise(r=>setTimeout(()=>r(null),4500))]);
    if(v===null||Date.now()-v>4000){stalls++;console.log('STALL detected at hand',hands,'after',Math.round((Date.now()-t0)/1000)+'s');
      try{await client.send('Debugger.pause');await new Promise(r=>setTimeout(r,800));}catch(e){}
      console.log('  stack:',paused?paused.join(' < '):'(no pause)');process.exit(3);} };
  while(hands<HANDS&&Date.now()-t0<400000){
    await hb();
    const st=await p.evaluate(()=>({ph:(()=>{try{return S.phase}catch(e){return null}})(),cards:!!document.querySelector('.wcard'),pick:!!document.getElementById('pickBtn'),tell:!!document.querySelector('.tell'),stk:!!document.querySelector('#stk > *'),call:!!(document.getElementById('callB')&&document.getElementById('callB').offsetParent),kb:(()=>{const k=document.getElementById('kb');return !!(k&&!k.classList.contains('off')&&S.seats&&!S.seats[0].cracked)})(),nx:!!(document.getElementById('nx')&&document.getElementById('nx').offsetParent),cur:(()=>{try{return S.cur}catch(e){return ''}})()}));
    if(st.cards&&st.pick){await tap('.wcard');await tap('#pickBtn');continue;}
    if(st.tell){await tap('.tell');await tap('#tellBtn');continue;}
    if(st.stk){await tap('#stk > *');await tap('#goBtn');continue;}
    if(st.call){await tap('#callB');continue;}
    if(st.kb){const w=await p.evaluate(()=>S.word);let okk=true;for(const ch of w){if(!await tap(`.key[data-k="${ch}"]`)){okk=false;break;}}if(okk)await tap('.key[data-k="↵"]');await p.waitForTimeout(700);continue;}
    if(st.nx){hands++;await tap('#nx');continue;}
    await p.waitForTimeout(200);
  }
  console.log(`STALL HUNT: ${hands} hands · ${clicks} real clicks · ${stalls} stalls · ${misses} missed taps · ${Math.round((Date.now()-t0)/1000)}s · page errors ${errs.length}`);
  if(errs.length)console.log(errs.join('\n'));
  await b.close();process.exit(stalls?3:0);
})().catch(e=>{console.log('STALL HUNT FAIL',e.message.slice(0,700));process.exit(2)});
