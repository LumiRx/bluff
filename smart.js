/* Plays as a competent human: filters candidates properly, folds thin clues.
   Confirms in the real browser build that a good player can crack words and win chips. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const errs=[]; let calls=0, cracks=0, folds=0, sets=0, setterNet=0;
  const finals=[], places=[];
  const MATCHES = 6;
  for (let m=0;m<MATCHES;m++){
    const p = await b.newPage({ viewport:{width:390,height:844} });
    p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
    await p.goto('file://'+__dirname+'/index.html');
    await p.click('#pl');
    for (let h=0;h<6;h++){
      if (await p.locator('#pickBtn').count()){
        sets++;
        const before = await p.evaluate(()=>S.seats[0].chips);
        // strategy: sharpest card, then the crowded pin that still unlocks a real price
        await p.evaluate(()=>{ const c=[...document.querySelectorAll('.wcard')]; c[0].click(); });
        await p.click('#pickBtn'); await p.waitForSelector('#tellBtn');
        await p.evaluate(()=>{
          const opts=S.tellOpts, els=[...document.querySelectorAll('.tell')];
          let best=0,bi=0;
          opts.forEach((t,i)=>{ const score=(t.k==='pin'?1000:0)+Math.min(t.n,200);
            if(t.n<=200&&score>best){best=score;bi=i;} });
          els[bi].click();
        });
        await p.click('#tellBtn'); await p.waitForSelector('#goBtn');
        await p.evaluate(()=>{ const s=[...document.querySelectorAll('.stk:not(.off)')]; s[s.length-1].click(); });
        await p.click('#goBtn');
        await p.waitForSelector('#ov.on #nx',{timeout:45000});
        setterNet += (await p.evaluate(()=>S.seats[0].chips)) - before;
      } else {
        await p.waitForSelector('#callB',{timeout:25000});
        // fold anything that leaves too much of the deck standing
        const wide = await p.evaluate(()=>S.pool.length);
        if (wide > 430){ folds++; await p.click('#foldB'); }
        else {
          calls++; await p.click('#callB');
          await p.waitForFunction(()=>S.phase==='play'||S.phase==='showdown',null,{timeout:20000});
          if (await p.locator('#board').count()){
            await p.evaluate(()=>{ window._pool=S.pool.slice(); });
            for (let g=0; g<3; g++){
              const done = await p.evaluate(()=>S.seats[0].cracked||S.seats[0].guesses.length>=GUESSES);
              if (done) break;
              const w = await p.evaluate(()=>{
                const me=S.seats[0];
                if(me.guesses.length){
                  const lg=me.guesses[me.guesses.length-1], lm=me.marks[me.marks.length-1];
                  window._pool=window._pool.filter(x=>consistent(x,lg,lm));
                }
                const pool=window._pool;
                if(!me.guesses.length){
                  const o=OPEN.filter(x=>pool.includes(x));
                  if(o.length) return o[Math.floor(Math.random()*o.length)];
                }
                return pool.length?pool[Math.floor(Math.random()*pool.length)]
                                  :DECK[Math.floor(Math.random()*NW)];
              });
              for (const ch of w) await p.keyboard.press(ch);
              await p.keyboard.press('Enter');
              await p.waitForTimeout(650);
            }
            if (await p.evaluate(()=>S.seats[0].cracked)) cracks++;
          }
        }
        await p.waitForSelector('#ov.on #nx',{timeout:45000});
      }
      await p.click('#nx'); await p.waitForTimeout(350);
    }
    await p.waitForSelector('#ag',{timeout:20000});
    const r = await p.evaluate(()=>{
      const sorted=S.seats.slice().sort((a,b)=>b.chips-a.chips);
      return {chips:S.seats[0].chips, place:sorted.indexOf(S.seats[0])+1,
              total:S.seats.reduce((a,s)=>a+s.chips,0)};
    });
    if (r.total!==6000) errs.push('CHIP LEAK '+r.total);
    finals.push(r.chips); places.push(r.place);
    await p.close();
  }
  await b.close();
  const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
  console.log(`${MATCHES} matches as a competent player`);
  console.log(`  called ${calls}, folded ${folds}  ->  crack rate ${(100*cracks/Math.max(calls,1)).toFixed(0)}% (${cracks}/${calls})`);
  console.log(`  setting: ${sets} hands, net ${(setterNet/Math.max(sets,1)).toFixed(0)} chips per set`);
  console.log(`  final stack: avg ${avg(finals).toFixed(0)} (started 1000), best ${Math.max(...finals)}, worst ${Math.min(...finals)}`);
  console.log(`  placement: avg ${avg(places).toFixed(1)} of 6, wins ${places.filter(x=>x===1).length}/${MATCHES}`);
  console.log(errs.length?'  errors: '+errs.join(' | '):'  errors: none');
})();
