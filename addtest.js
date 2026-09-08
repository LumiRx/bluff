// /add/<handle> flow: ?add=RICK opens friends pre-filled and presses ADD; unknown handle offers an invite.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const log=[];let bad=0;const ok=(n,c,note)=>{log.push(`${c?'ok ':'BAD'} ${n}${note?' — '+note:''}`);if(!c)bad++;};
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  const H='Q'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase();
  // 1. fresh device, link first: gate → handle → friends with the name typed
  await p.goto('file:///Users/rick/Downloads/bluff/index.html?add=zz9nobody7&utm_source=share&utm_medium=add');
  await passGate(p);
  await p.fill('#hnd','A'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2');
  await p.waitForSelector('#fn',{timeout:8000});
  ok('after onboarding the friends screen opens', true);
  ok('handle is pre-filled', (await p.inputValue('#fn'))==='ZZ9NOBODY', await p.inputValue('#fn'));
  await p.waitForTimeout(3500);
  const note=await p.evaluate(()=>{const n=document.getElementById('fnote');return n?n.textContent.trim():''});
  const toast=await p.evaluate(()=>document.getElementById('toast').textContent);
  ok('unknown handle → invite offer (or offline toast)', /hasn’t sat down yet/.test(note)||/cannot check/.test(toast), note||toast);
  ok('SEND THEM AN INVITE button present when known-missing', !/hasn’t/.test(note)||!!(await p.locator('#fsend').count()));
  // 2. share-first empty state
  await p.evaluate(()=>screenFriends()); await p.waitForTimeout(200);
  const order=await p.evaluate(()=>[...document.querySelectorAll('#ovC button,#ovC input')].filter(e=>e.offsetParent!==null).map(e=>e.id||e.className));
  ok('share button comes before the handle input', order.indexOf('fsh')>-1&&order.indexOf('fsh')<order.indexOf('fn'), order.join(','));
  await p.click('#fqr'); await p.waitForTimeout(200);
  ok('SHOW MY QR reveals a QR', (await p.locator('#fqrbox #qr svg').count())===1);
  await p.click('#fqr'); await p.waitForTimeout(100);
  ok('second tap hides it', !(await p.locator('#fqrbox').isVisible()));
  // 3. self-add guard: ?add=<own handle> must not loop
  const me=await p.evaluate(()=>P.handle);
  await p.goto('file:///Users/rick/Downloads/bluff/index.html?add='+me); await p.waitForTimeout(800);
  ok('own handle in the link → home, not friends', !!(await p.locator('#cash').count()));
  // 4. home labels
  const labels=await p.evaluate(()=>['cash','invite','fri','store'].map(id=>{const e=document.getElementById(id);return e?e.textContent.replace(/\s+/g,' ').trim():'-'}));
  ok('home labels', labels[0].startsWith('QUICK TABLE')&&labels[1]==='INVITE A FRIEND'&&labels[2]==='FRIENDS', labels.join(' | '));
  await p.evaluate(()=>screenTable()); await p.waitForTimeout(150);
  ok('table h2 DEAL THEM IN', (await p.locator('#ovC h2').first().textContent())==='DEAL THEM IN');
  await p.evaluate(()=>screenDuel('ACE')); await p.waitForTimeout(150);
  ok('duel has no QR', (await p.locator('#ovC #qr').count())===0);
  ok('duel code demoted', (await p.locator('#ovC .code.sm').count())===1);
  const dorder=await p.evaluate(()=>[...document.querySelectorAll('#ovC > *')].map(e=>e.className||e.tagName));
  ok('duel leads with the head-to-head', dorder[1]==='duelrow', dorder.slice(0,3).join(','));
  await p.waitForTimeout(2500);
  const dsent=await p.evaluate(()=>document.getElementById('dsent').textContent);
  ok('duel status copy is never a network error', !/could not reach/.test(dsent), dsent);
  // 5. profile: seat ask above stats; zero record collapses
  await p.evaluate(()=>screenProfile()); await p.waitForTimeout(150);
  const porder=await p.evaluate(()=>[...document.querySelectorAll('#ovC .seatask, #ovC .sect')].map(e=>e.className==='sect'?e.textContent:'SEATASK'));
  ok('profile: seat ask before the record', porder.indexOf('SEATASK')>-1&&porder.indexOf('SEATASK')<porder.findIndex(x=>/RECORD|THE TABLE/.test(x)), porder.join(' > '));
  ok('profile: zero matches → one line', porder.includes('THE RECORD')&&!porder.includes('THE TABLE'));
  await p.evaluate(()=>{P.matches=3;screenProfile();}); await p.waitForTimeout(150);
  ok('profile: with matches → full tables', (await p.locator('#ovC .sect',{hasText:'THE TABLE'}).count())===1&&(await p.locator('#ovC .sect',{hasText:'WHEN THEY SET'}).count())===1);
  // 6. handle screen copy + HOW IT WORKS; help toggle
  await p.evaluate(()=>screenHandle()); await p.waitForTimeout(150);
  ok('handle: short copy', (await p.locator('#ovC p').count())<=4, String(await p.locator('#ovC p').count()));
  await p.click('#hhow'); await p.waitForTimeout(150);
  ok('HOW IT WORKS opens help', (await p.locator('#ok').count())===1);
  await p.evaluate(()=>document.getElementById('helpBtn').click()); await p.waitForTimeout(150);
  ok('? again closes help', (await p.locator('#ok').count())===0);
  // 7. rebuy free claim with stars in hand → home
  await p.evaluate(()=>screenRebuy()); await p.waitForTimeout(150);
  if(await p.locator('#rbFree').count()){await p.click('#rbFree');await p.waitForTimeout(200);ok('rbFree with stars → home',!!(await p.locator('#cash').count()));}
  else log.push('    (rbFree not offered — clock running)');
  // 8. inputs styled
  await p.evaluate(()=>screenJoin()); await p.waitForTimeout(100);
  const bg=await p.evaluate(()=>getComputedStyle(document.getElementById('jc')).borderRadius);
  ok('join input dressed', bg==='9px', bg);
  console.log(log.join('\n'));
  console.log(`\nADD TEST ${bad?'FAIL':'PASS'} · ${log.length} checks · ${bad} bad · page errors ${errs.length}`);
  if(errs.length)console.log(errs.join('\n'));
  await b.close();process.exit(bad?1:0);
})().catch(e=>{console.log(log.join('\n'));console.log('ADD TEST CRASH',e.message);process.exit(2)});
