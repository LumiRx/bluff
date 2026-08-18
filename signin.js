/* Signing in, from the player's side.

   The server half is proven by auth.js against a real database. This is the
   other half: that the screens do what they say, that nothing forces a number
   on somebody who just wants to play, and that the one place it IS required —
   buying something — sends you to sign in rather than failing at you.

   node signin.js
*/
const { chromium } = require('/opt/node-tools/node_modules/playwright');
let pass=0; const bad=[];
const ok=m=>{pass++;console.log('   · '+m);};
const no=m=>{bad.push(m);console.log('   ✗ '+m);};
const is=(a,b,m)=>a===b?ok(m):no(`${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

/* the server, as it behaves: a code that only works once, and only the right one */
const SERVER = () => {
  window.__sent = [];
  let code = null, account = null;
  window.fetch = async (url, opts) => {
    const u = String(url), body = opts && opts.body ? JSON.parse(opts.body) : {};
    const auth = (opts && opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '';
    const reply = o => new Response(JSON.stringify(o), { status: 200,
      headers: { 'Content-Type': 'application/json' } });
    if (u.includes('/v1/auth/start')) {
      if (!/^\+[1-9]\d{7,14}$/.test(body.phone))
        return reply({ ok:false, error:'that does not look like a phone number' });
      code = '424242'; window.__sent.push(body.phone);
      return reply({ ok:true, last4: body.phone.slice(-4), sent:false, dev:code });
    }
    if (u.includes('/v1/auth/verify')) {
      if (body.code !== code) return reply({ ok:false, error:'that code is wrong' });
      code = null;                                   // one code, one use
      account = 'a_demo';
      return reply({ ok:true, session:'sess-abc', account, last4:'0142', fresh:true,
                     handle:null, profile:{ rating:1750, matches:40 }, rev:3 });
    }
    if (u.includes('/v1/account/delete')) {
      if (auth !== 'Bearer sess-abc') return reply({ ok:false, error:'signed out' });
      return reply({ ok:true, erased:['VIV'] });
    }
    if (u.includes('/v1/purchase/claim')) return reply({ ok:true, stars:0, items:[] });
    if (u.includes('/v1/player/lookup')) return reply({ found:[] });
    if (u.includes('/v1/player/claim')) return reply({ ok:true, handle:body.handle, yours:true });
    return Promise.reject(new Error('offline'));
  };
};

(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  await ctx.addInitScript(SERVER);
  const p=await ctx.newPage();
  p.on('pageerror',e=>no('PAGEERROR '+e.message));
  await p.goto('file:///home/claude/bluff/index.html');
  await p.waitForSelector('#tos'); await p.check('#tos'); await p.click('#gGo');
  await p.waitForSelector('#hnd');

  console.log('\n1. nobody is asked for a number at the door');
  is(await p.locator('#sgPh').count(),0,'the handle screen has no phone field');
  await p.fill('#hnd','VIV'); await p.click('#go2'); await p.waitForSelector('#cash');
  ok('you get a handle, a home screen and a game without one');
  is(await p.evaluate(()=>SESSION),'','and no session exists');

  console.log('\n2. signing in when you choose to');
  await p.evaluate(()=>{P.rating=1500;P.matches=2;saveP();screenProfile();});
  await p.waitForTimeout(200);
  is(await p.locator('#psign').count()>0,true,'the profile offers it');
  await p.click('#psign'); await p.waitForTimeout(200);
  is(await p.locator('#sgPh').count()>0,true,'which opens the number screen');

  await p.fill('#sgPh','415 555 0142'); await p.click('#sgPhGo'); await p.waitForTimeout(250);
  is((await p.locator('#sgPhErr').innerText()).length>0,true,
     'a number with no country code is refused before anything is sent');
  is(await p.evaluate(()=>window.__sent.length),0,'and nothing was sent');

  await p.fill('#sgPh','+1 415 555 0142'); await p.click('#sgPhGo');
  await p.waitForSelector('#sgCode',{timeout:5000});
  is(await p.evaluate(()=>window.__sent[0]),'+14155550142',
     'a real one is normalised and sent');
  is((await p.locator('#ov').innerText()).includes('0142'),true,
     'the screen shows the last four and not the number');

  console.log('\n3. the code');
  await p.fill('#sgCode','111111'); await p.click('#sgCodeGo'); await p.waitForTimeout(250);
  is((await p.locator('#sgCodeErr').innerText()).includes('wrong'),true,'a wrong code is refused');
  is(await p.evaluate(()=>SESSION),'','and no session is handed out');

  await p.fill('#sgCode','424242'); await p.waitForTimeout(600);
  is(await p.evaluate(()=>SESSION),'sess-abc','the right one signs you in');
  is(await p.evaluate(()=>{try{return localStorage.getItem('bluff.session');}catch(e){return null;}}),
     'sess-abc','and the session survives a reload');
  is(await p.evaluate(()=>P.rating),1750,'the server career is adopted, being the fuller one');
  is(await p.evaluate(()=>P.last4),'0142','the last four are kept for the account screen');

  console.log('\n4. buying sends you to sign in rather than failing at you');
  await p.evaluate(()=>{setSession('');saveP();
    window.BluffIAP={buy:async()=>({store:'apple',transactionId:'t'})};screenStore();});
  await p.waitForTimeout(300);
  const packs=await p.locator('.pack').count();
  is(packs,3,'the shelf is there');
  await p.locator('.pack').first().click(); await p.waitForTimeout(300);
  is(await p.locator('#sgPh').count()>0,true,'tapping a pack signed out opens sign-in');
  is((await p.locator('#ov').innerText()).includes('refund'),true,
     'and says why, in terms of the player rather than of our database');

  console.log('\n5. deleting it');
  await p.evaluate(()=>{setSession('sess-abc');P.last4='0142';saveP();screenProfile();});
  await p.waitForTimeout(250);
  is(await p.locator('#pdel').count()>0,true,'the profile offers deletion, in the app');
  await p.click('#pdel'); await p.waitForTimeout(250);
  is((await p.locator('#ov').innerText()).includes('cannot be undone'),true,
     'with a confirmation that does not soften what it does');
  await p.click('#delYes'); await p.waitForTimeout(500);
  is(await p.evaluate(()=>SESSION),'','and it signs you out');

  console.log('\n--- problems ---');
  if(bad.length){bad.forEach(x=>console.log('  '+x));process.exit(1);}
  console.log(`  none · ${pass} checks passed`);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
