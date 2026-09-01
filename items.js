const { chromium } = require('playwright');
const passGate = require('./gate');
(async()=>{
  const b=await chromium.launch();
  const errs=[];const bad=m=>errs.push(m);
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>bad('PAGEERROR '+e.message));
  p.on('console',m=>{if(m.type()==='error')bad('CONSOLE '+m.text())});
  await p.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
  await p.goto('file://'+__dirname+'/index.html');
  await passGate(p);
  await p.fill('#hnd','F'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,6).toUpperCase()); await p.click('#go2');
  await p.waitForSelector('#cash'); await p.click('#cash');

  // hand 1: you set -> test REDEAL
  await p.waitForSelector('#pickBtn');
  const before=await p.evaluate(()=>{S.seats[0].items=['mull'];drawTray();return S.hand5.join(',')});
  await p.evaluate(()=>useItem('mull',null));
  await p.waitForTimeout(200);
  const after=await p.evaluate(()=>S.hand5.join(','));
  console.log(`  REDEAL: cards ${before===after?'UNCHANGED (fail)':'changed'}  ${before.slice(0,23)} -> ${after.slice(0,23)}`);
  if(before===after)bad('redeal did not change the cards');

  await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
  await p.waitForSelector('#tellBtn');
  await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];
    let bi=0,bs=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>bs){bs=t.n;bi=i}});e[bi].click()});
  await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
  await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()});
  await p.click('#goBtn');
  await p.waitForSelector('#ov.on #nx',{timeout:45000}); await p.click('#nx');

  // hand 2: test SEAT during the action, then the play-phase items
  await p.waitForSelector('#callB',{timeout:25000});
  const ordBefore=await p.evaluate(()=>{S.seats[0].items=['seat'];drawTray();return S.order.join(',')+'|'+S.oi});
  await p.evaluate(()=>useItem('seat',null));
  await p.waitForTimeout(1600);
  const ordAfter=await p.evaluate(()=>S.order.join(','));
  console.log(`  SEAT SWAP: order ${ordBefore.split('|')[0]} -> ${ordAfter} (you should be last)`);
  if(ordAfter.split(',').pop()!=='0')bad('seat swap did not move you last');

  await p.waitForSelector('#callB',{timeout:25000});
  await p.click('#callB');
  await p.waitForFunction(()=>S.phase==='play'||S.phase==='showdown',null,{timeout:20000});
  await p.waitForTimeout(400);
  if(await p.locator('#board').count()){
    // HINT
    const h=await p.evaluate(()=>{
      S.seats[0].items=['hint','gift','peek','scram','swap'];drawTray();
      const kb0=Object.keys(kbState).length;
      useItem('hint',null);
      return {kb0,kb1:Object.keys(kbState).length,given:S.seats[0].given.length};
    });
    console.log(`  HINT: keyboard letters known ${h.kb0} -> ${h.kb1}, positions given ${h.given}`);
    if(h.given<1)bad('hint gave nothing');
    // GIFT to a live rival
    const g=await p.evaluate(()=>{
      const t=S.seats.find(x=>!x.you&&x.state==='call'&&!x.cracked);
      if(!t)return null;
      const p0=(t.pool||S.pool).length;
      S.arm='gift';useItem('gift',t);
      return {name:t.name,p0,p1:t.pool.length};
    });
    console.log(g?`  GIFT: ${g.name} candidate pool ${g.p0} -> ${g.p1}`:'  GIFT: no live target');
    if(g&&g.p1>g.p0)bad(`gift widened the target pool (${g.p0} -> ${g.p1})`);
    // PEEK
    const pk=await p.evaluate(()=>{
      const t=S.seats.find(x=>!x.you&&x.guesses.length);
      if(!t)return null;
      S.arm='peek';useItem('peek',t);
      return document.getElementById('eventBar').classList.contains('on');
    });
    console.log('  PEEK: banner shown:',pk);
    // SCRAM on a bot slows it
    const sc=await p.evaluate(()=>{
      const t=S.seats.find(x=>!x.you&&x.state==='call'&&!x.cracked);
      if(!t)return null;
      const p0=t.pace;S.arm='scram';useItem('scram',t);
      return {name:t.name,p0,p1:t.pace};
    });
    console.log(sc?`  SCRAM: ${sc.name} pace ${sc.p0}ms -> ${sc.p1}ms`:'  SCRAM: no target');
    if(sc&&sc.p1<=sc.p0)bad('scramble did not slow the target');
    // SWAP
    const sw=await p.evaluate(()=>{
      const w0=S.word, tell=S.tell;
      S.seats[0].items=['swap'];
      const rows0=S.seats.filter(x=>x.state==='call').map(x=>x.guesses.length);
      useItem('swap',null);
      const fits=survivors(tell,DECKS[S.word.length]).includes(S.word);
      return {w0,w1:S.word,fits,rows0,rows1:S.seats.filter(x=>x.state==='call').map(x=>x.guesses.length)};
    });
    console.log(`  SWAP: ${sw.w0} -> ${sw.w1} | still fits the clue: ${sw.fits} | guesses ${JSON.stringify(sw.rows0)} -> ${JSON.stringify(sw.rows1)}`);
    if(sw.w0===sw.w1)bad('swap did not change the word');
    if(!sw.fits)bad('swapped word does not satisfy the clue that was paid for');
    if(sw.rows1.some(x=>x!==0))bad('swap did not reset every board');
  } else console.log('  (folded out of the play phase this run)');

  // scrambled keyboard keeps honest labels
  await p.evaluate(()=>{if(document.querySelector('.key'))scrambleKeyboard(400)});
  const honest=await p.evaluate(()=>[...document.querySelectorAll('.key')]
    .filter(k=>/^[A-Z]$/.test(k.dataset.k)).every(k=>k.textContent===k.dataset.k));
  console.log('  SCRAMBLE: every key still types what it says:',honest);
  if(!honest)bad('scrambled keyboard lies about its keys');

  console.log(errs.length?'\n  FAILURES:\n   '+errs.join('\n   '):'\n  all item checks passed, no js errors');
  await b.close();
  process.exit(errs.length?1:0);
})();
