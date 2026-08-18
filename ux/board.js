/* The board, with crests and badges instead of animals. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:414,height:896}, deviceScaleFactor:3 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file:///home/claude/bluff/index.html');
  await p.waitForSelector('#tos'); await p.check('#tos'); await p.click('#gGo');
  await p.waitForSelector('#hnd');
  await p.evaluate(()=>{P.mute=true;P.noMusic=true;if(typeof Mus!=='undefined')Mus.stop();});
  await p.fill('#hnd','VIV'); await p.click('#go2'); await p.waitForSelector('#cash');
  await p.evaluate(() => {
    P.rating=1612;P.bankroll=8450;P.w=14;P.l=7;P.matches=21;P.streak=4;P.bestStreak=7;
    P.setHands=22;P.setHeld=14;P.setNoTakers=7;P.called=62;P.cracked=38;P.missed=21;
    P.foldedN=19;P.foldsJudged=16;P.goodFolds=13;P.bigPot=460;P.busts=3;
    saveP();
    /* the board, dressed with the titles and traits it will really carry */
    const CITY='Los Angeles';
    const demo=[
      {n:'RIVER', v:631, r:{world:1,city:1,cityName:CITY}, p:{setHands:30,setHeld:19,setNoTakers:10,called:70,cracked:44,missed:20,foldedN:14,foldsJudged:12,goodFolds:10,bigPot:520,bestStreak:8,busts:1}},
      {n:'ACE',   v:504, r:{world:2,city:3,cityName:CITY}, p:{setHands:25,setHeld:9,setNoTakers:3,called:90,cracked:41,missed:52,foldedN:6,foldsJudged:5,goodFolds:3,bigPot:210,bestStreak:3,busts:12}},
      {n:'SLIM',  v:473, r:{world:3,city:9,cityName:CITY}, p:{setHands:20,setHeld:6,setNoTakers:2,called:24,cracked:12,missed:9,foldedN:31,foldsJudged:26,goodFolds:22,bigPot:180,bestStreak:2,busts:0}},
      {n:'VIV',   v:412, you:true, r:{world:41,city:1,cityName:CITY}, p:P},
      {n:'NOMAD', v:398, r:{world:52,city:14,cityName:CITY}, p:{setHands:14,setHeld:8,setNoTakers:5,called:30,cracked:14,missed:14,foldedN:15,foldsJudged:13,goodFolds:10,bigPot:410,bestStreak:6,busts:2}},
      {n:'HUSH',  v:361, r:{world:88,city:22,cityName:CITY}, p:{setHands:13,setHeld:3,setNoTakers:1,called:26,cracked:9,missed:16,foldedN:9,foldsJudged:8,goodFolds:4,bigPot:120,bestStreak:1,busts:11}},
    ];
    const rows=demo.map((d,i)=>lrow({i:i,name:d.n,you:d.you,val:d.val||d.v,
      badges:pairBadges(titlesFor(d.r),traitsFor(d.p))}));
    ovShow("<h2>TODAY'S TABLE</h2>"
      +"<div class='tabs'><button>LADDER</button><button class='on'>DAILY</button>"
      +"<button>FRIENDS</button></div>"
      +"<div class='lb-head'><span>10 AUG &middot; LOS ANGELES</span>"
      +"<span style='float:right'>SCORE</span></div>"
      +rows.join("")
      +"<p class='fine'>Titles are held by one player at a time and change hands the "
      +"moment somebody plays better. The rest you earn and keep.</p>",true);
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: __dirname + '/ux-07-board.png' });
  console.log('board captured');
  await b.close();
})();
