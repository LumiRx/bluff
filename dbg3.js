const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message,'\n',e.stack&&e.stack.split('\n')[1]));
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV');
  const err=await p.evaluate(()=>{
    P.handle="VIV";
    try{ screenHome(); return "ok"; }catch(e){ return e.message+" @@ "+(e.stack||"").split("\n").slice(0,3).join(" | "); }
  });
  console.log('screenHome ->',err);
  for(const fn of ['prizeStrip','chestStrip','inlineBoard','dailyBoard','avatarOf','badge']){
    const r=await p.evaluate(f=>{try{const v=window[f]();return "ok len "+String(v).length;}
      catch(e){return "THREW: "+e.message;}},fn);
    console.log('  '+fn.padEnd(12),r);
  }
  console.log('P.chest:',await p.evaluate(()=>JSON.stringify(P.chest)));
  await b.close();
})();
