const { chromium } = require('playwright');
const { qrSvg } = require('./qr.js');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const has = await p.evaluate(()=>typeof BarcodeDetector!=='undefined');
  console.log('  Chromium BarcodeDetector available:', has);
  if (!has) { await b.close(); return; }
  const tests=['bluff.gg/t/PLUM7','bluff.gg/t/QX7K2','https://bluff.gg/t/ZEBRA?ref=VIV','B'];
  let ok=0;
  for (const t of tests){
    const svg=qrSvg(t,320);
    await p.setContent(`<body style="margin:0;background:#fff;padding:40px">${svg}</body>`);
    const got = await p.evaluate(async ()=>{
      const d=new BarcodeDetector({formats:['qr_code']});
      const bmp=await createImageBitmap(await (await fetch('data:image/svg+xml;base64,'+
        btoa(document.body.innerHTML))).blob()).catch(()=>null);
      const el=document.querySelector('svg');
      const s=new XMLSerializer().serializeToString(el);
      const im=new Image();
      await new Promise(r=>{im.onload=r;im.src='data:image/svg+xml;base64,'+btoa(s);});
      const cv=document.createElement('canvas');cv.width=400;cv.height=400;
      const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,400,400);
      cx.drawImage(im,40,40,320,320);
      const r=await d.detect(cv);
      return r.length?r[0].rawValue:'';
    });
    const good=got===t; ok+=good;
    console.log(`  ${good?'PASS':'FAIL'} ${JSON.stringify(t.slice(0,34))} -> ${JSON.stringify(got.slice(0,34))}`);
  }
  console.log(`  ${ok}/${tests.length} decoded by Chromium`);
  await b.close();
})();
