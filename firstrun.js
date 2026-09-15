// The cold start, end to end. Everything else in the roster onboards fresh and then drives the
// full home, so the game hides the first-run screens under automation unless a suite asks for
// them (window.__fresh, the same seam as __ritual and __talkAlways). This is the suite that asks.
//
// What it protects: a new player reaches a keyboard on their FIRST hand. Before 1.1.4 the button
// started on seat 0, which is you, so hand one was always YOUR DEAL — five word cards, a tell and
// a price before a single letter, roughly ninety seconds of a word game with no words in it.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const log=[];let bad=0;
const ok=(n,c,note)=>{log.push(`${c?'ok ':'BAD'} ${n}${note?' — '+note:''}`);if(!c)bad++;};

(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.addInitScript(()=>{window.__fresh=true;});
  const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
  const t0=Date.now();
  await p.goto('file:///Users/rick/Downloads/bluff/index.html');

  await p.waitForSelector('#tos');
  ok('the door is one checkbox and one button', (await p.locator('#ovC button').count())===1);
  await passGate(p);
  await p.fill('#hnd','F'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash');

  /* the quiet home: one line, one button, and nothing that reads zero */
  const ids=await p.evaluate(()=>[...document.querySelectorAll('#ovC button')].map(e=>e.id).filter(Boolean));
  ok('first home offers exactly one way to start', ids.filter(x=>['cash','speed','daily'].includes(x)).length===1, ids.join(','));
  ok('…and it is PLAY YOUR FIRST HAND', /PLAY YOUR FIRST HAND/.test(await p.locator('#cash').textContent()));
  for(const gone of ['speed','daily','store','invite','fri','przBtn','chestBtn','lead'])
    ok(`no ${gone} on the first home`, (await p.locator('#'+gone).count())===0);
  ok('no stat grid of zeros', (await p.locator('#ovC .sgrid').count())===0);

  /* the first hand is a hand you can play */
  await p.click('#cash');
  await p.waitForSelector('#callB',{timeout:30000});
  ok('hand 1: a regular sets, you are called on to act', await p.evaluate(()=>!S.seats[0].setter));
  ok('hand 1: FOLD and CALL are both offered', (await p.locator('#foldB').count())===1&&(await p.locator('#callB').count())===1);
  ok('hand 1: a clue is on screen', /letter|contains|no [A-Z]/i.test(await p.locator('#tellBar').innerText()));
  ok('hand 1: the caller tutorial is the one showing', /Judge the clue/.test(await p.locator('#ovC, #stage').first().innerText()));
  const toCall=Date.now()-t0;
  ok('a decision inside 30s of a cold start', toCall<30000, Math.round(toCall/1000)+'s');

  await p.click('#callB');
  await p.waitForFunction(()=>document.getElementById('board')&&S.phase==='play',null,{timeout:30000});
  const toKb=Date.now()-t0;
  ok('a live keyboard inside 45s of a cold start', toKb<45000, Math.round(toKb/1000)+'s');
  ok('the keyboard is on', !(await p.evaluate(()=>document.getElementById('kb').classList.contains('off'))));
  const key=k=>p.locator(`.key[data-k="${k}"]`).dispatchEvent('pointerdown');
  await key('A');await key('B');
  ok('it types', (await p.evaluate(()=>S.cur))==='AB');
  await key('⌫');await key('⌫');

  /* hand 2 is where setting becomes legible, and that is where its tutorial belongs */
  const w=await p.evaluate(()=>S.word);for(const ch of w)await key(ch);await key('↵');
  let t=Date.now();while(Date.now()-t<60000){if(await p.evaluate(()=>{const b=document.getElementById('nx');return !!(b&&b.offsetParent)}))break;await p.waitForTimeout(250);}
  ok('hand 1 finishes', (await p.locator('#nx').count())===1);
  await p.click('#nx'); await p.waitForTimeout(600);
  ok('hand 2: now you set', await p.evaluate(()=>!!S.seats[0].setter));
  ok('hand 2: the setter tutorial arrives with the hand it explains',
     /Where the advantage is/.test(await p.locator('#stage').innerText()));

  /* and the full home is waiting once there is a record */
  await p.evaluate(()=>{try{clearInterval(S.tick);}catch(e){}P.matches=1;saveP();screenHome();});
  await p.waitForTimeout(300);
  const back=await p.evaluate(()=>[...document.querySelectorAll('#ovC button')].map(e=>e.id).filter(Boolean));
  ok('after one match the home opens up', ['cash','speed','daily','store','invite','fri'].every(x=>back.includes(x)), back.join(','));
  ok('no page errors across the cold start', errs.length===0, errs.join(' | '));

  console.log(log.join('\n'));
  console.log(`\nFIRST RUN ${bad?'FAIL':'PASS'} · ${log.length} checks · ${bad} bad · page errors ${errs.length}`);
  await b.close();process.exit(bad?1:0);
})().catch(e=>{console.log(log.join('\n'));console.log('FIRST RUN CRASH',e.message.slice(0,300));process.exit(2)});
