const { chromium, devices } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({...devices['iPhone 13'],hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///Users/rick/Downloads/bluff/index.html');
  await passGate(p);
  await p.fill('#hnd','K'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash'); await p.click('#cash');
  const setIfMine=async()=>{ if(await p.locator('#pickBtn').count()){
      await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn'); await p.waitForSelector('#tellBtn');
      await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];let bi=0,bs=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>bs){bs=t.n;bi=i}});e[bi].click()});
      await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
      await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()}); await p.click('#goBtn'); } };
  const nx=async()=>{const n=p.locator('#nx');if(await n.isVisible())await n.click();};
  let t0=Date.now();
  while(!(await p.locator('#callB').count())&&Date.now()-t0<150000){await setIfMine();await nx();await p.waitForTimeout(400);}
  await p.tap('#callB');
  await p.waitForFunction(()=>document.getElementById('board')&&S.phase==='play',null,{timeout:30000});
  await p.waitForTimeout(200);
  const L=await p.evaluate(()=>S.word.length);
  const tapKey=async k=>{await p.locator('.key[data-k="'+k+'"]').tap();await p.waitForTimeout(40);};
  // 1. plain taps land
  await tapKey('Q');await tapKey('Q');
  console.log('1 two taps ->',await p.evaluate(()=>S.cur),'| row shows',await p.evaluate(()=>[...document.querySelector('#r'+S.row).children].map(t=>t.textContent).join('')));
  // 2. audio throws mid-typing: letters must still paint
  await p.evaluate(()=>{Snd.tone=function(){throw new Error('InvalidStateError: interrupted')};});
  await tapKey('Z');
  console.log('2 with audio throwing ->',await p.evaluate(()=>S.cur),'| painted',await p.evaluate(()=>[...document.querySelector('#r'+S.row).children].map(t=>t.textContent).join('')));
  // 3. fill the row with junk, submit (refused), then type: the last letter replaces
  while((await p.evaluate(()=>S.cur.length))<L)await tapKey('Q');
  await tapKey('↵');await p.waitForTimeout(400);
  console.log('3 refused row:',await p.evaluate(()=>S.cur),'guesses',await p.evaluate(()=>S.seats[0].guesses.length));
  await tapKey('A');
  console.log('3b after tapping A on a full row ->',await p.evaluate(()=>S.cur),'(last letter replaced, row not dead)');
  // 4. scramble: tap the button that DISPLAYS 'E' and expect an E
  await p.evaluate(()=>{scrambleKeyboard(4000);});
  await p.waitForTimeout(200);
  const shows=await p.evaluate(()=>{const k=[...document.querySelectorAll('.key')].find(b=>b.textContent==='E');return k?k.dataset.k:null;});
  await p.evaluate(()=>{S.cur='';paintRow();});
  await p.locator('.key').filter({hasText:/^E$/}).first().tap();await p.waitForTimeout(60);
  console.log('4 scrambled: the key showing E typed ->',await p.evaluate(()=>S.cur),'(dataset',shows+')');
  // 5. kb off state after guesses exhausted
  const off=await p.evaluate(()=>document.getElementById('kb').classList.contains('off'));
  console.log('5 kb off during play (should be false):',off);
  await p.evaluate(()=>{S.seats[0].guesses=['AAAAA','BBBBB','CCCCC','DDDDD'].map(w=>w.slice(0,S.word.length));paintKb();});
  console.log('5b kb off when out of guesses (should be true):',await p.evaluate(()=>document.getElementById('kb').classList.contains('off')));
  console.log('errors:',errs.length?errs:'none');
  await b.close();
})().catch(e=>{console.log('KT FAIL',e.message);process.exit(1)});
