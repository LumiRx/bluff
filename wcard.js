const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();const errs=[];
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV'); await p.click('#go2'); await p.waitForSelector('#cash'); await p.click('#cash');
  // force a teach-tier word so the card shows its badge
  await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
  await p.waitForSelector('#tellBtn');
  await p.evaluate(()=>{const teach=DECK.filter(w=>WORD[w].t===1);
    S.card=S.word=teach[Math.floor(Math.random()*teach.length)];
    S.tellOpts=offerTells(S.word);});
  await p.evaluate(()=>{phaseTell();});
  await p.waitForTimeout(200);
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.tell')];
    let bi=0,bs=-1;S.tellOpts.forEach((t,i)=>{if(t.n<=250&&t.n>bs){bs=t.n;bi=i}});e[bi].click()});
  await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
  await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()});
  await p.click('#goBtn');
  await p.waitForSelector('#ov.on #nx',{timeout:45000}); await p.waitForTimeout(400);
  const card=await p.evaluate(()=>{const e=document.querySelector('.wdef');
    return {word:S.word,teach:e.className.includes('teach'),txt:e.innerText.replace(/\n/g,' | ')}});
  console.log('  showdown card:',card.word,card.teach?'[WORTH KNOWING]':'','->',card.txt);
  await p.screenshot({path:'w-showdown.png'});
  // and a plain word
  const plain=await p.evaluate(()=>{const w=DECK.find(x=>WORD[x].t===0);return {w,d:WORD[w]}});
  console.log('  plain word sample:',plain.w,'->',plain.d.p,'·',plain.d.d);
  console.log('  deck:',await p.evaluate(()=>NW),'words, all defined:',
    await p.evaluate(()=>DECK.every(w=>WORD[w]&&WORD[w].d&&WORD[w].p)));
  console.log(errs.length?'  ERRORS '+errs.join(' | '):'  no js errors');
  await b.close();
})();
