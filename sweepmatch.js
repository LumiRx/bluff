// In-match control sweep: every control on deal / tell / price / action / play / summary responds.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const log=[];let bad=0;const T0=Date.now();
const ok=(name,cond,note)=>{log.push(`${cond?'ok ':'BAD'} ${String(name).padEnd(40)}${note?' — '+note:''}`);if(!cond)bad++;};
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  await p.addInitScript(()=>{window.__talkAlways=true;});
  await p.goto('file:///Users/rick/Downloads/bluff/index.html');
  await passGate(p);
  await p.fill('#hnd','M'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash');
  const phase=()=>p.evaluate(()=>{try{return S.phase}catch(e){return null}});
  const nextIfOffered=async()=>{if(await p.evaluate(()=>{const b=document.getElementById('nx');return !!(b&&b.offsetParent!==null)})){await p.click('#nx');log.push('    (NEXT HAND clicked)');await p.waitForTimeout(400);return true;}return false;};
  const waitPhase=async(ph,ms)=>{const t=Date.now();const want=Array.isArray(ph)?ph:[ph];while(Date.now()-t<ms){const c=await phase();if(want.includes(c))return c;await p.waitForTimeout(150);}return await phase();};
  const selIdx=sel=>p.evaluate(s=>[...document.querySelectorAll(s)].findIndex(e=>e.classList.contains('sel')),sel);
  await p.evaluate(()=>startMatch('cash'));
  ok('start cash → deal', await waitPhase('deal',4000)==='deal');
  const nCards=await p.locator('.wcard').count(); ok('deal: 5 cards',nCards===5,String(nCards));
  ok('deal: pickBtn starts disabled', await p.locator('#pickBtn').isDisabled());
  for(let i=0;i<nCards;i++){await p.locator('.wcard').nth(i).click();const s=await selIdx('.wcard');ok(`deal: card ${i} selects`,s===i,String(s));}
  ok('deal: pickBtn enabled after pick', !(await p.locator('#pickBtn').isDisabled()));
  await p.click('#pickBtn'); ok('CHOOSE A TELL → tell', await waitPhase('tell',3000)==='tell');
  const nTells=await p.locator('.tell').count(); ok('tell: options ≥2',nTells>=2,String(nTells));
  ok('tell: tellBtn starts disabled', await p.locator('#tellBtn').isDisabled());
  for(let i=0;i<nTells;i++){await p.locator('.tell').nth(i).click();const s=await selIdx('.tell');ok(`tell: option ${i} selects`,s===i,String(s));}
  await p.click('#tellBtn'); ok('SET THE DIFFICULTY → price', await waitPhase('price',3000)==='price');
  const stk=await p.evaluate(()=>[...document.querySelectorAll('#stk > *')].map(e=>({t:e.textContent.trim().replace(/\s+/g,' ').slice(0,14),has:!!e.onclick})));
  ok('price: stake options', stk.length>=2, JSON.stringify(stk));
  ok('price: goBtn starts disabled', await p.locator('#goBtn').isDisabled());
  let lastSel=-1;
  for(let i=0;i<stk.length;i++){ await p.locator('#stk > *').nth(i).click(); const s=await selIdx('#stk > *'); if(stk[i].has){ok(`price: stake ${stk[i].t} selects`,s===i,String(s));lastSel=i;} else ok(`price: stake ${stk[i].t} over cap stays inert`,s===lastSel,String(s)); }
  ok('price: goBtn enabled after stake', !(await p.locator('#goBtn').isDisabled()));
  await p.click('#goBtn'); ok('DEAL IT → action', await waitPhase('action',3000)==='action');
  ok('setter sees no fold/call', (await p.locator('#foldB').count())===0);
  // hand 1 plays out among the bots; wait for hand 2 where a bot sets and we act
  let t=Date.now(),seen=false;
  while(Date.now()-t<150000){ if(await p.evaluate(()=>!!(document.getElementById('foldB')&&document.getElementById('callB')&&S.phase==='action'))){seen=true;break;} await nextIfOffered(); await p.waitForTimeout(300); }
  ok('hand 2: FOLD + CALL offered', seen, `after ${Math.round((Date.now()-t)/1000)}s, phase ${await phase()}`);
  if(seen){
    const chips0=await p.evaluate(()=>S.seats[0].chips);
    ok('talk bar mounted during action', (await p.locator('#talkBar').count())===1);
    ok('talk bar visible during action', await p.locator('#talkBar').isVisible());
    const rx=await p.evaluate(()=>[...document.querySelectorAll('#talkBar .rx')].map(b=>b.dataset.rx));
    ok('talk bar: 5 reactions', rx.length===5, rx.join(','));
    for(const k of rx){ const n0=await p.locator('#talk .say.you').count(); await p.locator(`#talkBar .rx[data-rx="${k}"]`).dispatchEvent('pointerdown'); await p.waitForTimeout(250); const n1=await p.locator('#talk .say.you').count(); const txt=await p.evaluate(()=>{const s=[...document.querySelectorAll('#talk .say.you')].pop();return s?s.textContent.trim():''}); ok(`react ${k} → your bubble`, n1>n0||txt.length>0, txt); await p.waitForTimeout(1900); }
    await p.click('#callB'); ok('CALL → play', await waitPhase('play',20000)==='play', `chips ${chips0}→${await p.evaluate(()=>S.seats[0].chips)}`);
    ok('CALL charged the stake', await p.evaluate(c=>S.seats[0].chips<c,chips0));
    const key=k=>p.locator(`.key[data-k="${k}"]`).dispatchEvent('pointerdown');
    ok('keyboard on', !(await p.evaluate(()=>document.getElementById('kb').classList.contains('off'))));
    ok('talk bar hidden while typing', !(await p.locator('#talkBar').isVisible()));
    await key('A');await key('B');
    ok('keys A,B → cur "AB"', (await p.evaluate(()=>S.cur))==='AB', await p.evaluate(()=>S.cur));
    await key('⌫'); ok('⌫ → cur "A"', (await p.evaluate(()=>S.cur))==='A');
    await key('⌫');
    const row0=await p.evaluate(()=>document.getElementById('r0')&&document.getElementById('r0').textContent.trim());
    ok('row painted empty after clears', row0==='' , JSON.stringify(row0));
    // hit ENTER on a short/invalid word: should flag the row, not submit
    const L=await p.evaluate(()=>S.word.length);
    for(let i=0;i<L;i++)await key('Z');
    await key('↵'); await p.waitForTimeout(120);
    const bad0=await p.evaluate(()=>{const r=document.getElementById('r0');const t=document.getElementById('toast');return (r?r.className:'')+' toast:'+(t&&t.classList.contains('on')?t.textContent:'')});
    const g0=await p.evaluate(()=>S.seats[0].guesses.length);
    ok('ZZZ… rejected (row .bad + toast, no guess used)', /bad/.test(bad0)&&/word list/.test(bad0)&&g0===0, `${bad0} guesses=${g0}`);
    for(let i=0;i<L;i++)await key('⌫');
    // the mid-hand hint item, if we hold one
    const items=await p.evaluate(()=>[...document.querySelectorAll('#tray .item:not(.empty)')].map(e=>e.textContent.trim().replace(/\s+/g,' ').slice(0,16)));
    log.push('    tray items: '+(items.join(' | ')||'none'));
    // now crack it
    const w=await p.evaluate(()=>S.word);
    for(const ch of w)await key(ch);
    await key('↵'); await p.waitForTimeout(1600);
    ok('typed the word → cracked', await p.evaluate(()=>!!S.seats[0].cracked), `word ${w}`);
    ok('keyboard off after crack', await p.evaluate(()=>document.getElementById('kb').classList.contains('off')));
    await p.waitForTimeout(300);
    ok('talk bar back after crack', await p.locator('#talkBar').isVisible());
    // hand 3: fold path
    t=Date.now();seen=false;
    while(Date.now()-t<150000){ if(await p.evaluate(()=>!!(document.getElementById('foldB')&&S.phase==='action'))){seen=true;break;} await nextIfOffered(); await p.waitForTimeout(300); }
    ok('hand 3: FOLD offered', seen, `after ${Math.round((Date.now()-t)/1000)}s, phase ${await phase()}`);
    if(seen){
      await p.click('#foldB'); await p.waitForTimeout(600);
      ok('FOLD (fast path) folds', await p.evaluate(()=>S.seats[0].state==='fold'), await p.evaluate(()=>S.seats[0].state));
    }
  }
  // summary + share controls (render from the live state)
  await p.evaluate(()=>{try{clearInterval(S.tick);}catch(e){}});
  await p.evaluate(()=>{const sorted=S.seats.slice().sort((a,b)=>b.chips-a.chips);const me=S.seats[0];S.session={delta:0,place:1+sorted.indexOf(me),rd:0,before:P.rating,promo:null,chips:me.chips,score:S.score||0,standings:sorted};S.phase='payout';});
  await p.evaluate(()=>screenSummary(true));
  await p.waitForTimeout(300);
  for(const [id,expect] of [['sh','share sheet'],['lb','board'],['home','home']]){
    await p.evaluate(()=>screenSummary(true)); await p.waitForTimeout(200);
    const h0=await p.evaluate(()=>document.getElementById('ovC').innerHTML);
    const has=await p.locator('#'+id).count(); if(!has){ok(`summary #${id} present`,false);continue;}
    await p.click('#'+id); await p.waitForTimeout(400);
    const h1=await p.evaluate(()=>document.getElementById('ovC').innerHTML);
    ok(`summary #${id} → ${expect}`, h1!==h0);
  }
  await p.evaluate(()=>screenSummary(true)); await p.waitForTimeout(200);
  ok('summary #again present', (await p.locator('#again').count())===1);
  await p.evaluate(()=>screenShare()); await p.waitForTimeout(300);
  const shareBtns=await p.evaluate(()=>[...document.querySelectorAll('#ovC button, #ovC .btn')].filter(e=>e.offsetParent!==null).map(e=>(e.id?'#'+e.id+' ':'')+e.textContent.trim().replace(/\s+/g,' ').slice(0,22)));
  log.push('    share controls: '+shareBtns.join(' | '));
  console.log(log.join('\n'));
  console.log(`\nMATCH SWEEP ${bad?'FAIL':'PASS'} · ${log.length} checks · ${bad} bad · page errors ${errs.length} · ${Math.round((Date.now()-T0)/1000)}s`);
  if(errs.length)console.log(errs.join('\n'));
  await b.close(); process.exit(bad?1:0);
})().catch(e=>{console.log(log.join('\n'));console.log('MATCH SWEEP CRASH',e.message);process.exit(2)});
