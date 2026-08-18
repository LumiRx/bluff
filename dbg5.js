const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV'); await p.click('#go2'); await p.waitForSelector('#store');
  await p.click('#store');
  await p.waitForTimeout(700);
  console.log('cosgrid count:', await p.locator('.cosgrid').count());
  console.log('ovC starts:', (await p.evaluate(()=>document.getElementById('ovC').innerHTML)).slice(0,140));
  console.log('ov has .on:', await p.evaluate(()=>document.getElementById('ov').className));
  const direct=await p.evaluate(()=>{try{screenStore();return document.querySelectorAll('.cosgrid').length;}catch(e){return "THREW "+e.message;}});
  console.log('direct screenStore -> cosgrid nodes:',direct);
  await b.close();
})();
