// Where does a botTick interval leak from? Log every botTick setInterval/clearInterval with hand+phase,
// play with real clicks until the first page error, then dump the log.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{window.__talkAlways=true;window.__tk=[];const oI=window.setInterval,oC=window.clearInterval;const st=()=>{try{return 'h'+S.hand+'/'+S.phase}catch(e){return '?'}};
    window.setInterval=function(f,ms,...a){const id=oI(f,ms,...a);if(f&&f.name==='botTick')window.__tk.push('SET '+id+' @'+st()+' '+new Error().stack.split('\n').slice(2,4).map(x=>x.trim().replace(/.*index.html:/,'L')).join('<'));return id;};
    window.clearInterval=function(id){window.__tk.push('CLR '+id+' @'+st()+' '+new Error().stack.split('\n').slice(2,3).map(x=>x.trim().replace(/.*index.html:/,'L')).join(''));return oC(id);};});
  const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)+' '+String(e.stack||'').split('\n').slice(1,2).join('').trim().replace(/.*index.html:/,'L')));
  await p.goto('file:///Users/rick/Downloads/bluff/index.html'); await passGate(p);
  await p.fill('#hnd','T'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash'); await p.click('#cash');
  const t0=Date.now();let hands=0;
  const tap=async sel=>{try{await p.locator(sel).first().click({timeout:2500});return true;}catch(e){return false;}};
  while(hands<8&&Date.now()-t0<300000&&!errs.length){
    const st=await p.evaluate(()=>({cards:!!document.querySelector('.wcard'),tell:!!document.querySelector('.tell'),stk:!!document.querySelector('#stk > *'),call:!!(document.getElementById('callB')&&document.getElementById('callB').offsetParent),kb:(()=>{const k=document.getElementById('kb');return !!(k&&!k.classList.contains('off')&&S.seats&&!S.seats[0].cracked)})(),nx:!!(document.getElementById('nx')&&document.getElementById('nx').offsetParent)}));
    if(st.cards){await tap('.wcard');await tap('#pickBtn');continue;}
    if(st.tell){await tap('.tell');await tap('#tellBtn');continue;}
    if(st.stk){await tap('#stk > *');await tap('#goBtn');continue;}
    if(st.call){await tap('#callB');continue;}
    if(st.kb){const w=await p.evaluate(()=>S.word);let okk=true;for(const ch of w){if(!await tap(`.key[data-k="${ch}"]`)){okk=false;break;}}if(okk)await tap('.key[data-k="↵"]');await p.waitForTimeout(700);continue;}
    if(st.nx){hands++;await tap('#nx');continue;}
    await p.waitForTimeout(200);
  }
  const tk=await p.evaluate(()=>window.__tk);
  console.log('hands',hands,'errors',errs.length,'· first error:',errs[0]||'none');
  console.log(tk.join('\n'));
  await b.close();
})().catch(e=>{console.log('TICKHUNT FAIL',e.message.slice(0,300));process.exit(2)});
