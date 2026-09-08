// Screen-level control sweep v2: label-addressed, reloads after any match start,
// and counts icon/class changes as effects (sound toggle, switches).
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const SCREENS=[
 ['home','screenHome()'],['profile','screenProfile()'],['board-ladder','screenBoard("ladder")'],['board-daily','screenBoard("daily")'],['board-friends','screenBoard("friends")'],
 ['friends','screenFriends()'],['invites','screenInvites()'],['table','screenTable()'],['join','screenJoin()'],['code','screenCode()'],['duel','screenDuel("ACE")'],
 ['store','screenStore()'],['chest','screenChest()'],['rebuy','screenRebuy()'],['prize','screenPrize()'],['signin','screenSignIn()'],
 ['legal-privacy','screenLegal("privacy")'],['legal-terms','screenLegal("terms")'],['gate','screenGate(true)'],['handle','screenHandle()'],['help','help()'],['share','screenShare()']];
const SEL="button:not([disabled]), .btn:not([disabled]), .toggle, .alt2, .wcard, .item:not(.empty), .tab, [data-f], .fr, .fr .x, .hme, .hbook, .sc[data-go], .rowbtn";
const labelOf=el=>(el.id?'#'+el.id+' ':'')+(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,26);
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource/.test(m.text()))errs.push('console:'+m.text().slice(0,140))});
  const onboard=async()=>{await p.goto('file:///Users/rick/Downloads/bluff/index.html');await p.waitForSelector('#tos',{timeout:1500}).then(()=>passGate(p)).catch(()=>{});
    if(await p.locator('#hnd').count()){await p.fill('#hnd','W'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());await p.click('#go2');}
    await p.waitForSelector('#cash',{timeout:8000}).catch(()=>{});};
  await onboard();
  const report=[];let dead=0,total=0;
  const sig=()=>p.evaluate(()=>({ov:document.getElementById('ov').classList.contains('on'),html:(document.getElementById('ovC')||{}).innerHTML,body:document.body.innerText.length,
    snd:(document.getElementById('sndBtn')||{}).innerHTML,stage:(document.getElementById('stage')||{}).innerHTML.length,cls:[...document.querySelectorAll('.toggle,.tab,.alt2,.rx')].map(e=>e.className).join('|')}));
  for(const [name,open] of SCREENS){
    try{ await p.evaluate(open); }catch(e){report.push(`${name}: OPEN FAILED ${e.message.slice(0,80)}`);continue;}
    await p.waitForTimeout(350);
    const labels=await p.evaluate(({s})=>{const seen={};return [...document.querySelectorAll(s)].filter(e=>e.offsetParent!==null).map(e=>{const l=(e.id?'#'+e.id+' ':'')+(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\s+/g,' ').slice(0,26);seen[l]=(seen[l]||0)+1;return [l,seen[l]-1];});},{s:SEL});
    for(const [label,dup] of labels){
      const errBefore=errs.length;
      try{ await p.evaluate(open); }catch(e){}
      await p.waitForTimeout(250);
      const before=await sig();
      const hit=await p.evaluate(({s,label,dup})=>{let k=0;const els=[...document.querySelectorAll(s)].filter(e=>e.offsetParent!==null);for(const e of els){const l=(e.id?'#'+e.id+' ':'')+(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\s+/g,' ').slice(0,26);if(l===label){if(k===dup){e.click();return true;}k++;}}return false;},{s:SEL,label,dup});
      if(!hit){report.push(`${name.padEnd(14)} ${label.padEnd(34)} → (gone on re-open)`);continue;}
      await p.waitForTimeout(450);
      const after=await sig();
      const toast=await p.evaluate(()=>{const t=document.getElementById('toast');return t&&t.classList.contains('on')?t.textContent:''});
      const changed=after.html!==before.html||after.ov!==before.ov||after.body!==before.body||after.snd!==before.snd||after.stage!==before.stage||after.cls!==before.cls;
      const inMatch=await p.evaluate(()=>{try{return !!(S.seats&&S.seats.length)}catch(e){return false}});
      const effect=errs.length>errBefore?'ERROR '+errs.slice(errBefore).join(' | '):inMatch?'started a match':changed?(after.ov?'screen changed':'closed overlay'):toast?'toast: '+toast:'NO EFFECT';
      total++; if(/NO EFFECT|ERROR/.test(effect))dead++;
      report.push(`${name.padEnd(14)} ${label.padEnd(34)} → ${effect}`);
      if(inMatch){await p.evaluate(()=>{try{clearInterval(S.tick);}catch(e){}});await onboard();}
    }
  }
  console.log(report.join('\n'));
  console.log(`\nTOTAL ${total} controls · ${dead} no-effect/error · page errors: ${errs.length}`);
  if(errs.length)console.log(errs.slice(0,12).join('\n'));
  await b.close();
})().catch(e=>{console.log('SWEEP FAIL',e.message);process.exit(1)});
