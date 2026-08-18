const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:360,height:640}});
  await p.goto('file://'+__dirname+'/index.html');
  await p.fill('#hnd','VIV'); await p.click('#go2'); await p.waitForSelector('#cash'); await p.click('#cash');
  for(let h=0;h<3;h++){
    if(await p.locator('#pickBtn').count()){
      await p.locator('.wcard').nth(0).click(); await p.click('#pickBtn');
      await p.waitForSelector('#tellBtn');
      await p.evaluate(()=>{const o=S.tellOpts,e=[...document.querySelectorAll('.tell')];
        let bi=0,bs=-1;o.forEach((t,i)=>{if(t.n<=200&&t.n>bs){bs=t.n;bi=i}});e[bi].click()});
      await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
      await p.evaluate(()=>{const s=[...document.querySelectorAll('.stk:not(.off)')];s[s.length-1].click()});
      await p.click('#goBtn');
    } else {
      await p.waitForSelector('#callB',{timeout:25000}); await p.click('#callB');
      await p.waitForFunction(()=>S.phase==='play'||S.phase==='showdown',null,{timeout:20000});
      if(await p.locator('#board').count()){
        await p.waitForTimeout(300);
        const m=await p.evaluate(()=>{
          const g=id=>{const e=document.getElementById(id);return e?Math.round(e.getBoundingClientRect().height):0;};
          const q=s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().height):0;};
          return {app:document.getElementById('app').scrollHeight, win:window.innerHeight,
            hdr:g('hdr'), table:g('table'), tell:q('#tellBar'), rivals:g('rivals'),
            board:g('board'), cands:g('cands'), tray:g('tray'), hint:g('trayHint'), kb:g('kb')};
        });
        const sum=m.hdr+m.table+m.tell+m.rivals+m.board+m.cands+m.tray+m.hint+m.kb;
        console.log(`  window ${m.win}  content ${m.app}  (over by ${m.app-m.win})`);
        Object.entries(m).forEach(([k,v])=>{if(!['app','win'].includes(k))console.log('    '+k.padEnd(8)+v);});
        console.log('    '+'sum'.padEnd(8)+sum);
        break;
      }
    }
    await p.waitForSelector('#ov.on #nx',{timeout:45000}); await p.click('#nx'); await p.waitForTimeout(250);
  }
  await b.close();
})();
