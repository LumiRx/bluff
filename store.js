const { chromium } = require('playwright');
const passGate = require('./gate');
(async()=>{
  const b=await chromium.launch();const errs=[];
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  await p.goto('file://'+__dirname+'/index.html');
  await passGate(p);
  await p.fill('#hnd','VIV'); await p.locator('.faces button').nth(9).click(); await p.click('#go2');
  await p.waitForSelector('#cash'); await p.waitForTimeout(250);
  const home=await p.evaluate(()=>({
    ho:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    prize:document.querySelector('.pstrip').innerText.replace(/\n/g,' '),
    chest:document.querySelector('.cstrip').innerText.replace(/\n/g,' '),
    hasProfileBtn:!!document.getElementById('prof'),
    hasBook:!!document.getElementById('howto'),
    hasMe:!!document.getElementById('meBtn')
  }));
  console.log('  prize strip:',home.prize);
  console.log('  chest strip:',home.chest);
  console.log('  profile button removed:',!home.hasProfileBtn,'| book present:',home.hasBook,
              '| name tappable:',home.hasMe,'| h-overflow',home.ho);
  await p.screenshot({path:'s-home.png',fullPage:true});
  // name -> profile
  await p.click('#meBtn'); await p.waitForSelector('#wipe');
  console.log('  tapping the name opens the profile: true');
  await p.click('#bk'); await p.waitForSelector('#store');
  // book -> rules
  await p.click('#howto'); await p.waitForSelector('#ok');
  await p.click('#ok'); await p.waitForSelector('#store');
  // store
  await p.evaluate(()=>{P.bankroll=20000;saveP();});
  await p.click('#store'); await p.waitForSelector('.cosgrid');
  await p.waitForTimeout(200);
  await p.screenshot({path:'s-store.png',fullPage:true});
  const before=await p.evaluate(()=>({bank:P.bankroll,
    felt:getComputedStyle(document.documentElement).getPropertyValue('--feltA').trim()}));

  // every card is a miniature of the actual table, and the preview wears
  // whatever you are looking at
  const shape=await p.evaluate(()=>({
    minis:document.querySelectorAll('.cos .sw.mini').length,
    cards:document.querySelectorAll('.cos').length,
    preview:!!document.querySelector('.prev .pfelt'),
    note:document.querySelector('.catnote').textContent
  }));
  if(shape.minis!==shape.cards)errs.push(`only ${shape.minis} of ${shape.cards} cards show a table`);
  if(!shape.preview)errs.push('the store has no live preview');
  console.log(`  ${shape.cards} cards, all miniature tables · preview live · note "${shape.note}"`);

  // one tap on something you do not own must NOT spend anything
  const felted=p.locator('.cos').nth(5);
  await felted.click(); await p.waitForTimeout(250);
  const tried=await p.evaluate(()=>({bank:P.bankroll,owned:(P.owned||[]).length,
    picked:!!document.querySelector('.cos.pick'),
    buy:document.getElementById('cbuy')?document.getElementById('cbuy').innerText.replace(/\n/g,' '):null,
    prevFelt:document.querySelector('.prev').style.getPropertyValue('--feltA').trim()}));
  if(tried.bank!==before.bank||tried.owned)errs.push('a single tap bought something outright');
  if(!tried.picked||!tried.buy)errs.push('trying an item on did not offer a buy step');
  console.log(`  one tap = try it on: still ${tried.bank} stars, preview now ${tried.prevFelt}, button "${tried.buy}"`);

  // the second, deliberate tap is the one that spends
  await p.click('#cbuy'); await p.waitForTimeout(300);
  const after=await p.evaluate(()=>({bank:P.bankroll,owned:P.owned,equipped:P.equipped,
    felt:getComputedStyle(document.documentElement).getPropertyValue('--feltA').trim()}));
  console.log(`  bought AMETHYST felt: stars ${before.bank} -> ${after.bank} · owned ${JSON.stringify(after.owned)}`);
  console.log(`  --feltA ${before.felt} -> ${after.felt}`);
  // token swap changes the glyph everywhere
  await p.locator('.tabs button[data-t="token"]').click(); await p.waitForTimeout(150);
  await p.locator('.cos').nth(4).click(); await p.waitForTimeout(250);
  await p.click('#cbuy'); await p.waitForTimeout(300);
  const tok=await p.evaluate(()=>({tok:getComputedStyle(document.documentElement).getPropertyValue('--tok').trim(),
    st:st(1234)}));
  console.log('  token swapped ->',tok.tok,'| st(1234) =',tok.st);
  // too expensive
  await p.evaluate(()=>{P.bankroll=100;saveP();screenStore('felt');});
  await p.waitForSelector('.cosgrid');
  await p.locator('.cos').nth(4).click(); await p.waitForTimeout(300);
  const poor=await p.evaluate(()=>({bank:P.bankroll,
    locked:document.querySelectorAll('.cos.locked').length,
    btn:document.getElementById('cbuy')?document.getElementById('cbuy').innerText.replace(/\n/g,' '):null,
    disabled:document.getElementById('cbuy')?document.getElementById('cbuy').disabled:null}));
  if(!poor.disabled)errs.push('the buy button was live with no stars to spend');
  console.log(`  cannot afford -> "${poor.btn}" (disabled ${poor.disabled}) · ${poor.locked} cards dimmed · stars still ${poor.bank}`);
  await p.screenshot({path:'s-store2.png',fullPage:true});
  // persists
  await p.reload(); await p.waitForSelector('#cash');
  const kept=await p.evaluate(()=>({eq:P.equipped,
    felt:getComputedStyle(document.documentElement).getPropertyValue('--feltA').trim()}));
  console.log('  survives reload:',JSON.stringify(kept.eq),'| felt',kept.felt);
  console.log(errs.length?'  ERRORS '+errs.join(' | '):'  no js errors');
  await b.close();
})();
