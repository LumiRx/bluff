/* Who you are sat against, and the thing this must never do.

   Matching people slightly above their level is good design. Tuning that band
   against somebody's wallet is a different thing wearing the same clothes, and
   from outside the two are indistinguishable — which is exactly why it gets
   asserted here rather than promised in a comment.

   node seat.js
*/
const { chromium } = require('playwright');
/* Handles are claimed permanently on the server and every suite hardcoded the
   same one, so the first suite to run took it and the rest died on "VIV is
   taken". Node-side only — never reference this inside page.evaluate. */
const HANDLE = 'V' + Date.now().toString(36).slice(-4).toUpperCase();
let pass=0; const bad=[];
const ok=m=>{pass++;console.log('   · '+m);};
const no=m=>{bad.push(m);console.log('   ✗ '+m);};
const is=(a,b,m)=>a===b?ok(m):no(`${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:414,height:896}});
  p.on('pageerror',e=>no('PAGEERROR '+e.message));
  await p.goto('file://' + __dirname + '/index.html');
  await p.waitForSelector('#tos'); await p.check('#tos'); await p.click('#gGo');
  await p.waitForSelector('#hnd'); await p.fill('#hnd',HANDLE); await p.click('#go2');
  /* v1 ships with CASH=false, so #cash is in the DOM but hidden. This wait is
     only a "home screen is ready" marker, so wait for attachment, not visibility. */
  await p.waitForSelector('#cash',{state:'attached'});

  /* many draws, so this is about the distribution and not about one lucky seed */
  const draw = (rating, extra) => p.evaluate(([r,x]) => {
    Object.assign(P,{rating:r},x||{}); saveP();
    const out=[];
    for(let i=0;i<400;i++) out.push(seatRivals().map(s=>s.rating));
    return out;
  }, [rating, extra]);

  console.log('\n1. the band sits above you');
  {
    const tables=await draw(1500);
    const all=tables.flat();
    const mean=all.reduce((a,b)=>a+b,0)/all.length;
    ok(`mean opponent rating ${Math.round(mean)} against a player on 1500`);
    is(mean>1500,true,'the average opponent is stronger than the player');
    is(mean<1500+220,true,'but inside the cap, not merely "stronger"');
  }

  console.log('\n2. the cap holds');
  {
    const CAP=await p.evaluate(()=>SEAT_CAP);
    const floor=await p.evaluate(()=>Math.min(...R.map(r=>r.rating)));
    ok(`the room's weakest regular is ${floor}, so the cap can only bind above that`);
    for(const r of [1400,1600,1800]){
      const worst=Math.max(...(await draw(r)).flat());
      is(worst-r<=CAP,true,`on ${r}, the strongest seat is +${worst-r}, within the ${CAP} cap`);
    }
    /* below the room's floor there is nobody at your level and pretending
       otherwise would mean inventing an opponent. What matters is that it
       degrades to the gentlest table available rather than a random one. */
    const weakest=await p.evaluate(()=>R.slice().sort((a,b)=>a.rating-b.rating)
                                        .slice(0,5).map(r=>r.rating).sort((a,b)=>a-b).join());
    const tables=await draw(1200);
    const always=tables.every(t=>t.slice().sort((a,b)=>a-b).join()===weakest);
    is(always,true,'under the floor, all 400 draws are the room\'s five weakest — no lucky seed');
    is(Math.max(...tables.flat())<=floor+120,true,
       `which is the bottom of the room (+${Math.max(...tables.flat())-floor}) and not the middle of it`);
  }

  console.log('\n3. always somebody you can beat');
  {
    let tablesWithoutOne=0;
    for(const r of [1400,1500,1700]){
      for(const t of await draw(r)) if(!t.some(x=>x<=r)) tablesWithoutOne++;
    }
    is(tablesWithoutOne,0,'no table is uniformly stronger than the player, in 1,200 draws');
    const floor=await p.evaluate(()=>Math.min(...R.map(r=>r.rating)));
    const under=(await draw(floor-100)).some(t=>t.some(x=>x<=floor-100));
    is(under,false,'below the room\'s floor nobody is weaker, and it does not pretend otherwise');
  }

  console.log('\n4. the thing it must never do');
  {
    /* same rating, wildly different money. If the seating differed at all, the
       matchmaker would be reading the wallet. */
    const poor=await p.evaluate(()=>{
      Object.assign(P,{rating:1500,bankroll:0,busts:40,rebuyAt:Date.now()+9e6});
      P.adRebuys={d:todayKey(),n:5};saveP();
      setSeed(12345); return seatRivals().map(s=>s.name);
    });
    const rich=await p.evaluate(()=>{
      Object.assign(P,{rating:1500,bankroll:250000,busts:0,rebuyAt:0});
      P.adRebuys={d:todayKey(),n:0};saveP();
      setSeed(12345); return seatRivals().map(s=>s.name);
    });
    is(poor.join(','),rich.join(','),
       'a player with nothing and a player with 250,000 stars get the identical table');

    const src=await p.evaluate(()=>seatRivals.toString());
    for(const word of ['bankroll','busts','rebuy','adRebuys','purchase','stars'])
      is(src.includes(word),false,`seatRivals never mentions ${word}`);
  }

  console.log('\n5. and it still says so out loud');
  {
    await p.evaluate(()=>{P.rating=1500;saveP();screenBoard('ladder');});
    await p.waitForTimeout(250);
    const t=await p.locator('#ov').innerText();
    is(t.includes('a little above your own'),true,'the ladder screen tells the player the rule');
    is(t.includes('at or below'),true,'including the seat they can beat');
  }

  console.log('\n--- problems ---');
  if(bad.length){bad.forEach(x=>console.log('  '+x));process.exit(1);}
  console.log(`  none · ${pass} checks passed`);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
