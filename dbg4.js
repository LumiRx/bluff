const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV'); await p.click('#go2'); await p.waitForSelector('#store');
  const r=await p.evaluate(()=>{try{screenStore();return "ok";}
    catch(e){return e.message+" @@ "+(e.stack||"").split("\n").slice(0,2).join(" | ");}});
  console.log('screenStore ->',r);
  console.log('owns("f1"):',await p.evaluate(()=>{try{return owns("f1");}catch(e){return "THREW "+e.message;}}));
  console.log('tokChar():',await p.evaluate(()=>{try{return tokChar();}catch(e){return "THREW "+e.message;}}));
  console.log('P.owned:',await p.evaluate(()=>JSON.stringify(P.owned)),'P.equipped:',await p.evaluate(()=>JSON.stringify(P.equipped)));
  await b.close();
})();
