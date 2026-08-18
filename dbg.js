const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:390,height:844} });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message));
  p.on('console', m => { if(m.type()==='error') console.log('CONSOLE ERR:', m.text()); });
  await p.goto('file://' + __dirname + '/index.html');
  await p.evaluate(() => { window._log=[]; const s=ovShow, h=ovHide;
    window.ovShow=f=>{window._log.push('SHOW '+(f||'').slice(0,40));s(f);};
    window.ovHide=()=>{window._log.push('HIDE '+new Error().stack.split('\n')[2]);h();}; });
  await p.click('#pl');
  await p.waitForTimeout(300);
  console.log('after SIT DOWN — phase:', await p.evaluate(()=>S.phase), 'ov.on:', await p.evaluate(()=>$('ov').classList.contains('on')));
  // setter path
  await p.locator('.wcard').nth(0).click();
  await p.click('#pickBtn');
  await p.waitForSelector('#tellBtn');
  await p.locator('.tell').nth(0).click();
  await p.click('#tellBtn');
  await p.waitForSelector('#goBtn');
  await p.locator('.stk').nth(1).click();
  await p.click('#goBtn');
  for (let i=0;i<24;i++){
    await p.waitForTimeout(1000);
    const st = await p.evaluate(()=>({phase:S.phase, on:$('ov').classList.contains('on'),
      nx:!!$('nx'), states:S.seats.map(s=>s.state+':'+s.guesses.length), tick:!!S.tick,
      log:window._log}));
    console.log(i, JSON.stringify(st));
    if (st.phase==='showdown') break;
  }
  await b.close();
})();
