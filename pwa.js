/* Serves dist/ over real http, because a service worker will not register from
   file:// and an install prompt will not fire without a valid manifest. Checks
   the things the stores and the browser actually check, then pulls the network
   out from under the game to prove it still opens. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
                '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f === '/') f = '/index.html';
  const p = path.join(DIST, f);
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end('no');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream',
                       'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(8137, r));
  const base = 'http://localhost:8137/';
  const browser = await chromium.launch();
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);

  // an iPhone-shaped viewport, because the insets only matter where there is a notch
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true
  });
    // the player registry is friends.js's business; here an attempted call just
  // logs a failed request that reads like a bug in the game
  await ctx.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
  const page = await ctx.newPage();
  page.on('pageerror', e => bad('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') bad('CONSOLE ' + m.text()); });

  console.log('\n1. the manifest');
  const man = await (await page.request.get(base + 'manifest.webmanifest')).json();
  for (const k of ['name', 'short_name', 'start_url', 'display', 'background_color',
                   'theme_color', 'icons'])
    if (!man[k]) bad(`manifest is missing ${k}`);
  if (man.short_name.length > 12) bad(`short_name "${man.short_name}" will be truncated on a home screen`);
  const need = ['192x192', '512x512'];
  for (const n of need)
    if (!man.icons.some(i => i.sizes === n)) bad(`no ${n} icon — installability requires one`);
  if (!man.icons.some(i => (i.purpose || '').includes('maskable')))
    bad('no maskable icon — Android will letterbox it inside the adaptive mask');
  for (const i of man.icons) {
    const r = await page.request.get(base + i.src);
    if (!r.ok()) bad(`icon 404: ${i.src}`);
  }
  ok(`${man.icons.length} icons all present, "${man.short_name}", display ${man.display}`);

  console.log('\n2. the front door');
  await page.goto(base);
  await page.waitForSelector('#tos');
  // with no money in the game there is nothing to gate on: no age check, no
  // region, no excluded states. The one thing left is agreeing to the rules.
  const gate = await page.evaluate(() => ({
    age: !!document.getElementById('age18'),
    ctry: !!document.getElementById('ctry'),
    text: document.getElementById('ovC').innerText
  }));
  if (gate.age || gate.ctry) bad('the age and region gate is still in the way of a free game');
  else ok('one step to sit down: agree to the rules');
  if (/\$|cash prize|18\+|18 or older/i.test(gate.text))
    bad(`the front door still mentions money or an age bar: "${gate.text.slice(0, 90)}"`);
  else ok('and it promises no money, because there is none');
  await page.click('#gGo');
  if (!await page.locator('#tos').count()) bad('it opened without agreeing to anything');
  else ok('it will not open until you agree');
  await page.check('#tos'); await page.click('#gGo');
  await page.waitForSelector('#hnd');
  await page.fill('#hnd', 'VIV'); await page.click('#go2');
  await page.waitForSelector('#cash');
  const strip = await page.evaluate(() => ({
    s: document.querySelector('.pstrip').innerText.replace(/\n/g, ' '),
    cash: cashEligible(), flag: CASH
  }));
  if (strip.flag || strip.cash) bad('cash prizes are switched on in a build meant to be free');
  if (/\$/.test(strip.s)) bad('the home screen advertises money: ' + strip.s);
  else ok(`the daily pays stars, and says so: "${strip.s}"`);

  console.log('\n3. the paperwork App Review will read');
  await page.click('#przBtn'); await page.waitForSelector('#rls');
  await page.click('#rls'); await page.waitForTimeout(150);
  const rules = await page.evaluate(() => document.getElementById('ovC').innerText);
  // the rules a reviewer reads have to describe the game that actually ships:
  // free, all ages, stars not money, one run a day, scored on the server
  const musts = [
    [/identical six/i, 'that everyone gets the same deals'],
    [/no money|nothing to buy|cannot be bought/i, 'that there is no money in it'],
    [/star/i, 'what the daily pays'],
    [/four, five or six|4, 5 or 6/i, 'the word lengths'],
    [/re-scored|re\u2011scored|scored on our side/i, 'that runs are verified'],
    [/UTC/, 'the closing time']
  ];
  musts.forEach(([re, what]) => { if (!re.test(rules)) bad(`the house rules never state ${what}`); });
  const mustnot = [[/\$\s?\d/, 'a dollar amount'], [/1099|W-9/i, 'tax paperwork'],
                   [/18 or older|18\+/i, 'an age bar'], [/Tennessee/i, 'excluded states']];
  mustnot.forEach(([re, what]) => { if (re.test(rules)) bad(`the house rules still mention ${what}`); });
  ok(`house rules cover all ${musts.length} required points and no money (${rules.length} chars)`);

  console.log('\n4. installed-app chrome');
  const box = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('app'));
    return { top: s.paddingTop, bottom: s.paddingBottom,
             ho: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  if (box.ho > 0) bad(`${box.ho}px horizontal overflow at 393x852`);
  else ok(`safe-area padding applied (top ${box.top}, bottom ${box.bottom}), no overflow`);

  console.log('\n5. the service worker');
  await page.goto(base);
  const reg = await page.evaluate(() =>
    navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false));
  if (!reg) bad('the service worker never activated');
  else ok('service worker active');
  await page.waitForTimeout(700);

  // now take the network away entirely
  await ctx.setOffline(true);
  const off = await browser.newContext({ viewport: { width: 393, height: 852 } });
  await ctx.pages()[0].goto(base, { waitUntil: 'domcontentloaded' }).catch(e => bad('offline reload failed: ' + e.message));
  const alive = await page.evaluate(() =>
    typeof DECKS !== 'undefined' && [4, 5, 6].reduce((a, L) => a + DECKS[L].length, 0)).catch(() => 0);
  if (!alive) bad('the game does not open with the network off');
  else ok(`opens offline with the full ${alive}-word deck`);
  await ctx.setOffline(false);
  await off.close();

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  server.close();
  process.exit(errs.length ? 1 : 0);
})();
