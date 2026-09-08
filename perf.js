// Performance harness: boot timing, long tasks, timer/rAF churn, drawTable/drawRivals counts and a CPU
// self-time profile across three hands. Numbers only — nothing here changes the game.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const FILE=process.argv[2]||'file:///Users/rick/Downloads/bluff/index.html';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{
    window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)]);}).observe({type:'longtask',buffered:true});}catch(e){}
    window.__timers={to:0,iv:0,cb:0};const oT=window.setTimeout,oI=window.setInterval;
    window.setTimeout=function(f,ms,...a){window.__timers.to++;return oT(function(){window.__timers.cb++;return typeof f==='function'?f.apply(this,a):eval(f)},ms)};
    window.__live=new Set();window.setInterval=function(f,ms,...a){window.__timers.iv++;const id=oI(function(){window.__timers.cb++;return f.apply(this,a)},ms);window.__live.add(id);return id};const oC=window.clearInterval;window.clearInterval=function(id){window.__live.delete(id);return oC(id)};
    window.__raf=0;const oR=window.requestAnimationFrame;window.requestAnimationFrame=function(f){window.__raf++;return oR(f)};
    window.__talkAlways=true;
  });
  const client=await ctx.newCDPSession(p);
  await client.send('Performance.enable');
  const t0=Date.now();
  await p.goto(FILE);
  const boot=await p.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {dcl:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd),domInteractive:Math.round(n.domInteractive)};});
  await p.waitForSelector('#gGo');
  const firstScreen=Date.now()-t0;
  const bootLT=await p.evaluate(()=>window.__lt.slice());
  const heap0=await p.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null);
  console.log('BOOT: domInteractive',boot.domInteractive,'ms · DCL',boot.dcl,'ms · load',boot.load,'ms · first screen ~'+firstScreen+'ms (incl. launch) · heap',heap0,'MB');
  console.log('  long tasks during boot:',bootLT.length?bootLT.map(x=>x[1]+'ms@'+x[0]).join(' '):'none');
  console.log('  html chars',await p.evaluate(()=>document.documentElement.outerHTML.length),'· DOM nodes',await p.evaluate(()=>document.getElementsByTagName('*').length),'· style rules',await p.evaluate(()=>[...document.styleSheets].reduce((a,s)=>a+s.cssRules.length,0)));
  await passGate(p);
  await p.fill('#hnd','F'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash');
  await p.evaluate(()=>{window.__dt=0;window.__dr=0;window.__dtray=0;const o=drawTable;drawTable=function(){window.__dt++;return o.apply(this,arguments)};const o2=drawRivals;drawRivals=function(){window.__dr++;return o2.apply(this,arguments)};const o3=drawTray;drawTray=function(){window.__dtray++;return o3.apply(this,arguments)};window.__lt.length=0;window.__timers.cb=0;window.__raf=0;});
  await client.send('Profiler.enable');await client.send('Profiler.setSamplingInterval',{interval:500});
  await client.send('Profiler.start');
  const th=Date.now();
  await p.evaluate(()=>startMatch('cash'));
  const phase=()=>p.evaluate(()=>{try{return S.phase}catch(e){return null}});
  const key=k=>p.locator(`.key[data-k="${k}"]`).dispatchEvent('pointerdown');
  let hands=0,idle=0;const HANDS=3;
  while(hands<HANDS&&Date.now()-th<240000){
    const ph=await phase();
    if(ph==='deal'&&await p.locator('.wcard').count()){await p.locator('.wcard').nth(0).click();await p.click('#pickBtn');await p.waitForSelector('.tell');await p.locator('.tell').nth(0).click();await p.click('#tellBtn');await p.waitForSelector('#stk > *');await p.locator('#stk > *').nth(0).click();await p.click('#goBtn');continue;}
    if(ph==='action'&&await p.evaluate(()=>{const b=document.getElementById('callB');return !!(b&&b.offsetParent!==null)})){await p.click('#callB');continue;}
    if(ph==='play'&&await p.evaluate(()=>{const kb=document.getElementById('kb');return kb&&!kb.classList.contains('off')&&!S.seats[0].cracked})){
      // one wrong-but-valid guess first (to exercise marks), then the word
      const w=await p.evaluate(()=>S.word);
      const wrong=await p.evaluate(()=>{const d=DECKS[S.word.length]||[];return d.find(x=>x!==S.word)||S.word});
      for(const ch of wrong)await key(ch); await key('↵'); await p.waitForTimeout(900);
      if(!(await p.evaluate(()=>S.seats[0].cracked))){for(const ch of w)await key(ch); await key('↵'); await p.waitForTimeout(600);}
      continue;}
    if(await p.evaluate(()=>{const b=document.getElementById('nx');return !!(b&&b.offsetParent!==null)})){hands++;await p.click('#nx');await p.waitForTimeout(300);continue;}
    await p.waitForTimeout(250);
  }
  const secs=(Date.now()-th)/1000;
  await p.waitForTimeout(3000);
  const after=await p.evaluate(()=>({live:[...window.__live].length,chips:document.querySelectorAll('#chipLayer .chip').length,bubbles:document.querySelectorAll('#talk .say').length,phase:(()=>{try{return S.phase}catch(e){return null}})()}));
  console.log('  3s after the last hand: live intervals',after.live,'· chips left',after.chips,'· bubbles left',after.bubbles,'· phase',after.phase);
  const {profile}=await client.send('Profiler.stop');
  const churn=await p.evaluate(()=>({dt:window.__dt,dr:window.__dr,dtray:window.__dtray,cb:window.__timers.cb,iv:window.__timers.iv,raf:window.__raf,lt:window.__lt.slice(),heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,talk:document.querySelectorAll('#talk .say').length,chips:document.querySelectorAll('#chipLayer .chip').length,nodes:document.getElementsByTagName('*').length}));
  console.log(`PLAY: ${hands} hands in ${secs.toFixed(0)}s · drawTable ${churn.dt} (${(churn.dt/secs).toFixed(2)}/s) · drawRivals ${churn.dr} · drawTray ${churn.dtray} · timer callbacks ${churn.cb} (${(churn.cb/secs).toFixed(1)}/s) · intervals made ${churn.iv} · rAF ${churn.raf} · heap ${churn.heap}MB · DOM nodes ${churn.nodes} · leftover bubbles ${churn.talk} · leftover chips ${churn.chips}`);
  const lt=churn.lt;console.log('  long tasks during play:',lt.length,lt.length?'· worst '+Math.max(...lt.map(x=>x[1]))+'ms · total '+lt.reduce((a,x)=>a+x[1],0)+'ms':'');
  const self=new Map();const nodes=new Map(profile.nodes.map(n=>[n.id,n]));
  const total=profile.timeDeltas.reduce((a,b)=>a+b,0);
  profile.samples.forEach((id,i)=>{const n=nodes.get(id);const cf=n.callFrame;const k=(cf.functionName||'(anon)')+':'+cf.lineNumber;self.set(k,(self.get(k)||0)+(profile.timeDeltas[i]||0));});
  const top=[...self.entries()].filter(([k])=>!/^\(idle\)|^\(program\)|^\(garbage/.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,16);
  const idleT=(self.get('(idle):-1')||0);
  console.log('  CPU: '+(total/1000).toFixed(0)+'ms sampled, '+(100*idleT/total).toFixed(1)+'% idle. Self-time top:');
  top.forEach(([k,v])=>console.log('   ',(v/1000).toFixed(0).padStart(6)+'ms',(100*v/total).toFixed(1).padStart(5)+'%',k));
  await b.close();
})().catch(e=>{console.log('PERF FAIL',e.message);process.exit(1)});
