const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
  p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE:',m.text())});
  await p.goto('file://'+__dirname+'/index.html');
  await p.waitForTimeout(600);
  console.log('handle input present:',await p.locator('#hnd').count());
  console.log('overlay html length:',await p.evaluate(()=>document.getElementById('ovC').innerHTML.length));
  console.log('body text:',(await p.evaluate(()=>document.body.innerText)).slice(0,220).replace(/\n/g,' | '));
  await b.close();
})();
