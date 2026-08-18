/* The board that knows where you are.

   Titles are scarce and therefore worth taking, which makes them worth forging.
   So the whole point of these checks is that a rank is something the server
   computed from rows it holds, and a city is something it read off the
   connection — never a field the client filled in. A client that could name its
   own city would name the emptiest one on earth and be first in it by lunchtime.

   node board.js
*/
const { DatabaseSync } = require('node:sqlite');
let pass=0; const problems=[];
const ok=m=>{pass++;console.log('   · '+m);};
const bad=m=>{problems.push(m);console.log('   ✗ '+m);};
const is=(a,b,m)=>a===b?ok(m):bad(`${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

function storage(){
  const db=new DatabaseSync(':memory:');
  return { sql:{ exec(q,...p){ const st=db.prepare(q);
    if(/^\s*(SELECT|PRAGMA|WITH)/i.test(q)){const r=st.all(...p);return {toArray:()=>r};}
    st.run(...p); return {toArray:()=>[]}; } } };
}

(async()=>{
  const { DailyBoard } = await import('./server/src/board.js');
  const mk = () => new DailyBoard({ storage: { sql: storage().sql } }, {});
  const post = (b, e) => b.fetch(new Request('https://board/submit',
    { method:'POST', body: JSON.stringify(e) })).then(r=>r.json());
  const get = (b, q) => b.fetch(new Request('https://board/board?'+q)).then(r=>r.json());

  const LA='Los Angeles, CA', NY='New York, NY';
  const dev = n => 'dev-'+String(n).padStart(20,'0');

  console.log('\n1. a day, two cities');
  const b = mk();
  const seed = async () => {
    for (let i=0;i<25;i++) await post(b,{device:dev('la'+i),handle:'LA'+i,
      score:900-i*10,chips:100,city:LA,
      stats:{called:40,missed:30,setHands:20,setHeld:5,foldedN:5,foldsJudged:14,goodFolds:4}});
    for (let i=0;i<25;i++) await post(b,{device:dev('ny'+i),handle:'NY'+i,
      score:950-i*10,chips:100,city:NY,
      stats:{called:10,missed:2,setHands:20,setHeld:14,foldedN:30,foldsJudged:20,goodFolds:18}});
  };
  await seed();
  const world = await get(b,'n=100');
  is(world.rows[0].handle,'NY0','the world board is sorted on score');
  is(world.rows[0].world,1,'and the top row is told it is first in the world');
  is(world.rows[0].cityName,NY,'carrying the city it was played from');
  is(world.rows[0].stats.called,10,'and the numbers the badges derive from');

  console.log('\n2. the city board');
  const la = await get(b,'n=100&city='+encodeURIComponent(LA));
  is(la.rows.length,25,'a city board holds only that city');
  is(la.rows[0].handle,'LA0','sorted on score within it');
  is(la.rows[0].cityRank,1,'and its leader is told they are first in the city');
  is(la.rows[0].world,null,'not first in the world, which they are not');
  is(la.players,25,'with its own population');

  console.log('\n3. a city nobody plays in');
  const thin = mk();
  for (let i=0;i<5;i++) await post(thin,{device:dev('t'+i),handle:'T'+i,score:500-i,
    chips:0,city:'Lewes, DE'});
  const t = await get(thin,'n=100&city='+encodeURIComponent('Lewes, DE'));
  is(t.thin,true,'a board with too few players says so');
  is(t.rows.length,0,'and shows nobody');
  is(t.floor,20,'naming the floor, so the interface can say how close it is');

  console.log('\n4. the badges the board feeds');
  const G = require('fs').readFileSync('index.html','utf8');
  const src = G.slice(G.indexOf('const TITLES='), G.indexOf('const badgeChip='));
  const fn = new Function('return (function(){'+src+
    'return {titlesFor:titlesFor,traitsFor:traitsFor};})()');
  const { titlesFor, traitsFor } = fn();
  is(titlesFor({world:1})[0].n,'BEST IN THE WORLD','rank one is the world title');
  is(titlesFor({city:1,cityName:LA})[0].n,'BEST IN LOS ANGELES, CA','city one is the city title');
  is(titlesFor({world:41})[0].n,'WORLD TOP 100','forty-first is top 100 and nothing grander');
  is(titlesFor({world:900}).length,0,'nine hundredth holds no title at all');
  /* this player folded 30 of 40 hands faced, so THE ROCK is the verdict, and it
     outranks BEST BLUFFER deliberately — the funnier badge wins the slot */
  is(traitsFor(world.rows[0].stats)[0].n,'THE ROCK',
     'and the traits come out of the same row the server sent');
  is(traitsFor(la.rows[0].stats)[0].n,'MOST BULLIED','a different player, a different verdict');
  is(traitsFor({}).length,0,'a player with no history yet wears nothing');

  console.log('\n5. the first entry stands');
  const again = await post(b,{device:dev('la0'),handle:'LA0',score:99999,chips:0,city:LA});
  is(again.already,true,'a second submission on the same device is refused');
  const after = await get(b,'n=3');
  is(after.rows[0].handle,'NY0','so a huge second score does not take the world title');

  console.log('\n--- problems ---');
  if(problems.length){problems.forEach(p=>console.log('  '+p));process.exit(1);}
  console.log(`  none · ${pass} checks passed`);
})().catch(e=>{console.error(e);process.exit(1);});
