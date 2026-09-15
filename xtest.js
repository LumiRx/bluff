// Profile v2 and the X layer. Covers what the roster's other suites do not touch: the cabinet,
// the settings split, the card, connections, the share-to-X intent, and the ?x= callback.
//
// The OAuth endpoints themselves are exercised against the LIVE site, because the whole point
// of them is that they behave sanely when the credentials are NOT bound — which is the state
// this site is in until Viv creates the X app. "Not configured" must be a polite page, never
// a stack trace and never a redirect into X with an empty client_id.
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
const SITE = process.env.SITE || 'https://webluff.com';
const log=[];let bad=0;
const ok=(n,c,note)=>{log.push(`${c?'ok ':'BAD'} ${n}${note?' — '+note:''}`);if(!c)bad++;};

const RICH=()=>{P.matches=14;P.firsts=3;P.w=9;P.l=5;P.rating=1612;P.bestStreak=6;P.streak=2;
  P.setHands=14;P.setHeld=5;P.peakRating=1640;P.peakBank=7300;
  P.bestBluff={word:'EPOXY',rate:45,callers:3,take:300};
  P.bigHand={word:'GAUGE',rate:52,callers:4,take:400};
  P.friends=[{h:'ACE',d:'2026-09-10'},{h:'RICK',d:'2026-09-11'},{h:'MAVE',d:'2026-09-12'}];
  saveP();};

(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
  await p.goto('file:///Users/rick/Downloads/bluff/index.html'); await passGate(p);
  await p.fill('#hnd','X'+Math.random().toString(36).replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase());
  await p.click('#go2'); await p.waitForSelector('#cash');

  /* ── a new player's profile ── */
  await p.evaluate(()=>screenProfile()); await p.waitForTimeout(250);
  ok('new profile: the cabinet is honest about being empty',
     /Empty\./.test(await p.locator('#ovC').innerText()));
  ok('new profile: no trophy placeholders', (await p.locator('#ovC .cabi').count())===0);
  ok('new profile: connections invite you to find someone', (await p.locator('#pfr').count())===1);
  ok('the settings button is there', (await p.locator('#pset').count())===1);
  for(const gone of ['psnd','pmus','ptalk','pmk','wipe','prls','ppriv'])
    ok(`no ${gone} on the profile any more`, (await p.locator('#'+gone).count())===0);

  /* ── a played-in profile ── */
  await p.evaluate(RICH); await p.evaluate(()=>screenProfile()); await p.waitForTimeout(250);
  const cab=await p.evaluate(()=>[...document.querySelectorAll('.cabi .k')].map(e=>e.textContent));
  ok('the cabinet fills with what was earned', cab.length>0, cab.join(' · '));
  ok('…and is capped at four so connections stay reachable', cab.length<=4, String(cab.length));
  ok('best bluff leads the shelf', cab[0]==='BEST BLUFF', cab[0]);
  ok('connections list the friends', (await p.locator('.conx .cx').count())===3);
  ok('a connection opens the challenge', await (async()=>{
      await p.locator('.conx .cx').first().click(); await p.waitForTimeout(300);
      const t=await p.locator('#ovC h2').first().textContent();
      await p.evaluate(()=>screenProfile()); await p.waitForTimeout(150);
      return /YOU vs/.test(t);})());

  /* ── settings kept everything ── */
  await p.click('#pset'); await p.waitForTimeout(250);
  for(const id of ['psnd','pmus','ptalk','phlp','pmk','prls','prp','ppriv','wipe','bk'])
    ok(`settings still has ${id}`, (await p.locator('#'+id).count())===1);
  ok('the track picker came with it', (await p.locator('.trk .tb').count())>=5);
  const before=await p.evaluate(()=>!!P.mute);
  await p.click('#psnd'); await p.waitForTimeout(120);
  ok('a settings toggle still writes the profile', (await p.evaluate(()=>!!P.mute))!==before);
  await p.click('#psnd'); await p.waitForTimeout(120);
  await p.click('#bk'); await p.waitForTimeout(200);
  ok('settings goes back to the profile', (await p.locator('#pset').count())===1);

  /* ── the record moved rather than vanished ── */
  await p.click('#prec'); await p.waitForTimeout(250);
  ok('the full record still has every table', (await p.locator('#ovC .lb tr').count())>=12);
  ok('…including the read level', /Read level/.test(await p.locator('#ovC').innerText()));
  await p.click('#bk'); await p.waitForTimeout(200);

  /* ── the card ── */
  await p.click('#pcard'); await p.waitForTimeout(250);
  const card=await p.evaluate(()=>cardText());
  ok('the card names you and your tier', /BLUFF —/.test(card)&&/SHARP/.test(card), card.split('\n')[1]);
  ok('the card carries what you held', /EPOXY/.test(card));
  ok('the card has no wagering words',
     !/\b(bet|stake|pot|ante|bankroll|showdown|wager)\b/i.test(card), card.replace(/\n/g,' | '));
  ok('the card lines animate in order', (await p.evaluate(()=>{
      const l=[...document.querySelectorAll('.card .cl')];
      return l.length>0&&l.every((e,i)=>e.style.getPropertyValue('--i')===String(i));})));
  ok('POST TO X is offered', (await p.locator('#cx').count())===1);

  /* ── the intent, not the API ── */
  const intent=await p.evaluate(()=>{let got='';const o=window.open;window.open=u=>{got=u;return null;};
    try{postToX('hello','card');}finally{window.open=o;}return got;});
  ok('share to X opens x.com/intent/post', intent.startsWith('https://x.com/intent/post?'), intent.slice(0,44));
  ok('…with the text pre-filled', /text=hello/.test(intent));
  ok('…and a tagged link so /api/stats can attribute it',
     /utm_source%3Dx/.test(intent)&&/utm_medium%3Dcard/.test(intent));
  ok('nothing is posted on the player’s behalf — no api.x.com anywhere in the client',
     (await p.evaluate(()=>!/api\.x\.com/.test(document.documentElement.innerHTML))));

  /* ── the session strip carries the same offer as the card ── */
  await p.evaluate(()=>{S.strip=[{sym:SYM.up,role:"set",callers:2,cracked:0,d:120,word:"EPOXY",rate:45},
                         {sym:SYM.fold,role:"call",callers:0,cracked:0,d:0}];
                 S.session={delta:120,place:2};});
  await p.evaluate(()=>screenShare()); await p.waitForTimeout(250);
  ok('the session strip offers POST TO X too', (await p.locator('#sx').count())===1);
  ok('…and its lines animate in order', (await p.evaluate(()=>{
      const l=[...document.querySelectorAll('.card .cl')];
      return l.length>0&&l.every((e,i)=>e.style.getPropertyValue('--i')===String(i));})));
  const sint=await p.evaluate(()=>{let got='';const o=window.open;window.open=u=>{got=u;return null;};
    try{document.getElementById('sx').click();}finally{window.open=o;}return got;});
  ok('…tagged as the strip, so the two are told apart in /api/stats',
     sint.startsWith('https://x.com/intent/post?')&&/utm_medium%3Dstrip/.test(sint),
     (sint.match(/utm_medium%3D\w+/)||[''])[0]);
  await p.evaluate(()=>ovHide&&ovHide()); await p.waitForTimeout(150);

  /* ── the callback lands the handle ── */
  await p.goto('file:///Users/rick/Downloads/bluff/index.html?x=playwebluff&xv=1');
  await p.waitForTimeout(900);
  ok('a returning callback saves the handle', (await p.evaluate(()=>P.x&&P.x.handle))==='playwebluff');
  ok('…and marks it verified', (await p.evaluate(()=>!!(P.x&&P.x.verified))));
  await p.evaluate(()=>screenProfile()); await p.waitForTimeout(250);
  ok('the profile shows the connected handle', /@playwebluff/.test(await p.locator('.xrow').innerText()));
  ok('…with a way to disconnect', (await p.locator('#pxoff').count())===1);
  await p.click('#pxoff'); await p.waitForTimeout(300);
  ok('disconnect clears it', !(await p.evaluate(()=>P.x)));
  ok('…and offers to connect again', (await p.locator('#pxon').count())===1);
  ok('a callback without xv is not called verified', await (async()=>{
      await p.goto('file:///Users/rick/Downloads/bluff/index.html?x=someone');
      await p.waitForTimeout(700);
      return (await p.evaluate(()=>!!(P.x&&P.x.handle)))&&!(await p.evaluate(()=>!!(P.x&&P.x.verified)));})());
  ok('a junk handle in the URL is ignored', await (async()=>{
      await p.goto("file:///Users/rick/Downloads/bluff/index.html?x=" + encodeURIComponent('<script>x'));
      await p.waitForTimeout(700);
      const h=await p.evaluate(()=>P.x&&P.x.handle);
      return !h||/^[A-Za-z0-9_]{1,15}$/.test(h);})());

  /* ── the live endpoints behave with no credentials bound ── */
  const st=await p.request.get(SITE+'/api/x/start?back='+encodeURIComponent(SITE+'/play/'),{maxRedirects:0});
  const body=st.status()<300?await st.text():'';
  ok('/api/x/start answers without credentials', st.status()===200||st.status()===302, 'HTTP '+st.status());
  if(st.status()===200){
    ok('…as a readable page, not a stack trace', /Not connected yet/.test(body));
    ok('…and never redirects into X with an empty client_id', !/oauth2\/authorize/.test(body));
  } else {
    ok('…by redirecting to X with a real client_id',
       /client_id=[^&]+/.test(st.headers().location||''));
  }
  /* ── the bio link ── */
  const chan=await p.request.get(SITE+'/c/x',{maxRedirects:0});
  const cl=chan.headers().location||'';
  ok('/c/x is attributed to X, not to the streamer campaign',
     /utm_source=x\b/.test(cl)&&!/streamer-challenge/.test(cl), cl.replace(SITE,''));
  ok('…and does not hand a stranger a table code named X', !/[?&]c=/.test(cl));
  ok('…while a real creator code still pays the creator', await (async()=>{
      const r=await p.request.get(SITE+'/c/ABC123',{maxRedirects:0});
      const l=r.headers().location||'';
      return /c=ABC123/.test(l)&&/utm_campaign=streamer-challenge/.test(l);})());
  ok('…and an invite link is still an invite', await (async()=>{
      const r=await p.request.get(SITE+'/t/ABC123',{maxRedirects:0});
      const l=r.headers().location||'';
      return /c=ABC123/.test(l)&&/utm_medium=invite/.test(l);})());

  const cb=await p.request.get(SITE+'/api/x/callback?error=access_denied',{maxRedirects:0});
  ok('/api/x/callback handles a cancelled sign-in', cb.status()===200, 'HTTP '+cb.status());
  ok('…and says nothing changed', /Nothing changed/.test(await cb.text()));

  ok('no page errors anywhere in the profile layer', errs.length===0, errs.join(' | '));
  console.log(log.join('\n'));
  console.log(`\nPROFILE + X ${bad?'FAIL':'PASS'} · ${log.length} checks · ${bad} bad · page errors ${errs.length}`);
  await b.close();process.exit(bad?1:0);
})().catch(e=>{console.log(log.join('\n'));console.log('PROFILE + X CRASH',e.message.slice(0,300));process.exit(2)});
