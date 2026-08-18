const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const errs=[];
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  await p.goto('file://'+__dirname+'/index.html');
  await p.waitForSelector('#hnd');
  await p.fill('#hnd','VIV');
  await p.locator('.faces button').nth(3).click();
  await p.click('#go2');
  await p.waitForSelector('#cash');
  console.log('  home ok, modes:',await p.locator('#cash,#speed,#daily,#invite,#join,#fri').count());
  // invite screen + QR
  await p.click('#invite'); await p.waitForSelector('#qr svg');
  const qrInfo=await p.evaluate(()=>({code:S.lastCode,
    box:document.querySelector('#qr svg').getAttribute('viewBox')}));
  console.log('  invite: code',qrInfo.code,'qr viewBox',qrInfo.box);
  await p.click('#bk'); await p.waitForSelector('#cash');
  await p.click('#fri'); await p.waitForSelector('#fadd');
  await p.fill('#fn','DANA'); await p.click('#fadd');
  await p.waitForSelector('.fr');
  console.log('  friends stored:',await p.evaluate(()=>P.friends.map(f=>f.h).join(',')));
  await p.click('#bk'); await p.waitForSelector('#cash');
  // speed table
  await p.click('#speed');
  await p.waitForTimeout(600);
  const st=await p.evaluate(()=>({speed:S.speed,items:S.seats[0].items,
    botItems:S.seats.slice(1).map(x=>x.items.length)}));
  console.log('  speed match started:',st.speed,'| your items:',st.items,'| bot items:',st.botItems);
  const seats=await p.locator('.seat').count();
  const faces=await p.evaluate(()=>[...document.querySelectorAll('.seat .ava')].map(a=>a.textContent.trim()[0]));
  console.log('  seats rendered:',seats,'faces:',faces.join(' '));
  await p.screenshot({path:'v-deal.png'});
  console.log(errs.length?'  ERRORS: '+errs.join(' | '):'  no js errors');
  await b.close();
})();
