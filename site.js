/* Serves site/ the way Cloudflare Pages will — including _redirects, so the
   extensionless legal URLs App Review clicks actually resolve — then checks the
   things that decide whether an ad converts and a submission passes. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain' };

// the same rewrites _redirects declares, so the test hits what production hits
const REWRITE = { '/privacy': '/privacy.html', '/terms': '/terms.html',
  '/rules': '/rules.html', '/support': '/support.html', '/faq': '/faq.html',
  '/vs-wordle': '/vs-wordle.html',
  '/privacy-policy': '/privacy.html', '/tos': '/terms.html' };

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (REWRITE[f]) f = REWRITE[f];
  if (f.endsWith('/')) f += 'index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(8142, r));
  const base = 'http://localhost:8142';
  const browser = await chromium.launch();
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true });
  /* /api/hit is a Pages Function. Under a static file server it 404s, which is a
     local artefact rather than a defect — stub it for every page in the run. */
  await ctx.route('**/api/hit', r => r.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => bad('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') bad('CONSOLE ' + m.text()); });

  console.log('\n1. every page App Review and an ad will land on');
  const PAGES = [['/', 'landing'], ['/privacy', 'privacy'], ['/terms', 'terms'],
                 ['/rules', 'rules'], ['/support', 'support'], ['/faq', 'faq'],
                 ['/vs-wordle', 'the comparison'], ['/play/', 'the game'],
                 ['/robots.txt', 'robots'], ['/sitemap.xml', 'sitemap'],
                 ['/llms.txt', 'llms.txt'], ['/og.png', 'social card']];
  for (const [url, label] of PAGES) {
    const r = await page.request.get(base + url);
    if (!r.ok()) bad(`${label} (${url}) returned ${r.status()}`);
  }
  ok(`${PAGES.length} URLs all resolve, including the extensionless legal paths`);

  console.log('\n2. the landing page');
  await page.goto(base + '/');
  await page.waitForSelector('#dboard');
  const meta = await page.evaluate(() => ({
    title: document.title,
    desc: document.querySelector('meta[name=description]')?.content || '',
    og: document.querySelector('meta[property="og:image"]')?.content || '',
    canon: document.querySelector('link[rel=canonical]')?.href || '',
    h1: document.querySelector('h1')?.innerText.replace(/\n/g, ' ') || '',
    ctas: [...document.querySelectorAll('.btn')].map(b => b.textContent.trim()).slice(0, 3),
    ho: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  if (meta.title.length > 62) bad(`title is ${meta.title.length} chars — Google truncates near 60`);
  if (meta.desc.length < 70 || meta.desc.length > 165)
    bad(`meta description is ${meta.desc.length} chars — aim for 120–160`);
  if (!/webluff\.com/.test(meta.og)) bad('og:image is not an absolute webluff.com URL');
  if (!/webluff\.com/.test(meta.canon)) bad('canonical is not set to webluff.com');
  if (meta.ho > 0) bad(`${meta.ho}px of horizontal overflow on mobile`);
  ok(`"${meta.h1}" · ${meta.desc.length}-char description · CTAs ${JSON.stringify(meta.ctas)}`);

  // v1 ships with no money in it, so the page must not imply otherwise anywhere
  const body = await page.evaluate(() => document.body.innerText);
  for (const [re, what] of [[/\$\s?\d/, 'a dollar amount'],
                            [/cash prize/i, 'a cash prize'],
                            [/18 or older|18\+/i, 'an age requirement that no longer exists'],
                            [/Tennessee/i, 'the excluded states'],
                            [/no purchase is necessary/i, 'a no-purchase-necessary line']])
    if (re.test(body)) bad(`the landing page still mentions ${what}`);
  ok('the landing page mentions no money, no age gate and no excluded states');
  for (const [re, what] of [[/free/i, 'that it is free'],
                            [/star/i, 'what the daily actually pays'],
                            [/four|4[ -]?letter/i, 'the variable word length']])
    if (!re.test(body)) bad(`the landing page never states ${what}`);
  ok('and it does state that it is free, what the daily pays, and the word lengths');

  console.log('\n3. the playable demo — this is what an ad is paying for');
  // deal a known hand: the demo picks its word at random from a list that
  // contains the word this test types, and a hand that ends on the first guess
  // is a live demo behaving correctly, not a bug — so pin it
  await page.evaluate(() => deal('GRAVE'));
  const before = await page.evaluate(() => document.getElementById('dboard').innerHTML);
  for (const ch of 'SLIDE') await page.keyboard.press(ch);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({
    html: document.getElementById('dboard').innerHTML,
    marked: document.querySelectorAll('#dboard i.h, #dboard i.n, #dboard i.m').length,
    state: document.getElementById('dstate').innerText
  }));
  if (after.html === before) bad('the demo did not respond to a guess');
  else if (after.marked < 5) bad(`only ${after.marked} tiles were marked`);
  else ok(`a guess marks the row (${after.marked} tiles) and says "${after.state.slice(0, 54)}…"`);

  // and the on-screen keyboard works for people who never touch a hardware key
  await page.evaluate(() => { const k = [...document.querySelectorAll('.k')]
    .find(x => x.textContent === 'G'); k && k.click(); });
  if (!await page.evaluate(() => document.getElementById('dboard').innerText.includes('G')))
    bad('the on-screen keyboard does nothing');
  else ok('the on-screen keyboard works too');

  // a visitor who busts out must not be left with a dead widget — this is an ad
  // landing page, and the second hand is the one that sells
  const out = await page.evaluate(async () => {
    deal('GRAVE');
    for (const w of ['SLIDE', 'PLANK', 'FROST'])
      { for (const ch of w) key(ch); key('='); }
    return { state: document.getElementById('dstate').innerText,
             again: !!document.getElementById('dagain') };
  });
  if (!/It was GRAVE/.test(out.state)) bad(`busting out says "${out.state.slice(0, 60)}"`);
  else if (!out.again) bad('a busted demo offers no way to play another hand');
  else {
    const revived = await page.evaluate(() => {
      document.getElementById('dagain').click();
      const fresh = document.getElementById('dboard').innerText.replace(/\s/g, '') === '';
      const k = [...document.querySelectorAll('.k')].find(x => x.textContent === 'G');
      k && k.click();
      return { fresh, types: document.getElementById('dboard').innerText.includes('G') };
    });
    if (!revived.fresh) bad('"deal another" left the old guesses on the board');
    else if (!revived.types) bad('"deal another" did not bring the keyboard back');
    else ok('busting out offers another hand, and the fresh hand takes input');
  }

  console.log('\n4. the launch-list form');
  await page.route('**/api/notify', r => r.fulfill({ status: 200, body: '{"ok":true,"stored":true}' }));
  await page.fill('#nemail', 'someone@example.com');
  await page.click('#nf button');
  await page.waitForTimeout(250);
  const msg = await page.evaluate(() => document.getElementById('nmsg').innerText);
  if (!/(you are in|on the list)/i.test(msg)) bad(`the form said "${msg}" instead of confirming`);
  else ok('the form posts and confirms');

  console.log('\n5. the legal pages say the things they have to');
  const MUST = {
    '/privacy': [[/local storage|on your device/i, 'where data lives'],
                 [/do not.*sell|not.*sold/i, 'the no-sale statement'],
                 [/decisions/i, 'what actually leaves the device'],
                 [/no account|without an account/i, 'that there is no account'],
                 [/info@webluff\.com/, 'a contact address']],
    '/terms': [[/cannot be exchanged for money/i, 'that stars are not money'],
               [/third-party beneficiaries/i, 'the Apple clause'],
               [/as-is|as is/i, 'the warranty disclaimer']],
    '/rules': [[/star/i, 'what the daily pays'],
               [/skill|decision/i, 'the skill basis'],
               [/identical six/i, 'that everybody gets the same deals'],
               [/one run|once per|first run/i, 'the one-entry rule'],
               [/UTC/, 'the closing time']],
    '/support': [[/ringer switch/i, 'the iPhone sound answer'],
                 [/info@webluff\.com/, 'a real address']]
  };
  const NOMONEY = [[/\$\s?\d/, 'a dollar amount'], [/cash prize/i, 'a cash prize'],
                   [/1099|W-9/i, 'winner tax paperwork'], [/sweepstakes/i, 'a sweepstakes'],
                   [/18 years of age|18 or older/i, 'an age bar']];
  for (const [url, checks] of Object.entries(MUST)) {
    await page.goto(base + url);
    const t = await page.evaluate(() => document.body.innerText);
    const missing = checks.filter(([re]) => !re.test(t)).map(([, w]) => w);
    if (missing.length) bad(`${url} never states: ${missing.join(', ')}`);
    else ok(`${url} covers all ${checks.length} required points`);
    const leftover = NOMONEY.filter(([re]) => re.test(t)).map(([, w]) => w);
    if (leftover.length) bad(`${url} still mentions ${leftover.join(', ')}`);
    const ho = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ho > 0) bad(`${url}: ${ho}px of horizontal overflow`);
  }

  // every placeholder has to be findable, not discovered by a lawyer later
  console.log('\n6. what is still a placeholder');
  const holes = [];
  for (const f of ['index.html', 'privacy.html', 'terms.html', 'rules.html', 'support.html', 'faq.html', 'vs-wordle.html']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // only bracketed prose, not array indexing in the demo script
    const m = t.match(/\[[A-Z][A-Za-z ]{3,50}(?:&mdash;|—)[^\]]{0,40}\]/g);
    if (m) holes.push(`${f}: ${[...new Set(m)].join(', ')}`);
  }
  if (holes.length) console.log('   ! ' + holes.join('\n   ! '));
  else ok('no placeholders left');

  console.log('\n7. what an answer engine sees');
  // structured data has to parse and describe the right kind of thing
  await page.goto(base + '/');
  const ld = await page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent));
  let types = [];
  for (const raw of ld) {
    try { const o = JSON.parse(raw); types.push(o['@type']); }
    catch (e) { bad('a JSON-LD block does not parse: ' + e.message); }
  }
  for (const need of ['VideoGame', 'WebSite', 'HowTo'])
    if (!types.includes(need)) bad(`the landing page has no ${need} structured data`);
  ok(`landing structured data: ${types.join(', ')}`);

  await page.goto(base + '/faq');
  const faq = await page.evaluate(() => {
    const s = document.querySelector('script[type="application/ld+json"]');
    const o = s ? JSON.parse(s.textContent) : null;
    return { type: o && o['@type'], n: o && o.mainEntity ? o.mainEntity.length : 0,
             onPage: document.querySelectorAll('h3').length,
             qs: o && o.mainEntity ? o.mainEntity.map(q => q.name) : [] };
  });
  if (faq.type !== 'FAQPage') bad('the FAQ has no FAQPage structured data');
  else if (faq.n !== faq.onPage)
    bad(`FAQ markup lists ${faq.n} questions but the page shows ${faq.onPage}`);
  else ok(`FAQ: ${faq.n} questions, markup and page agree`);
  // the questions people actually type have to be among them
  for (const q of [/different from wordle/i, /free/i, /real money/i, /gambling/i])
    if (!faq.qs.some(x => q.test(x))) bad(`the FAQ never asks about ${q}`);
  ok('the FAQ covers the four questions people actually type');

  // an answer engine lifts a self-contained paragraph; check they are that
  const answers = await page.evaluate(() =>
    [...document.querySelectorAll('h3 + p')].map(p => p.textContent.trim()));
  const thin = answers.filter(a => a.length < 120).length;
  const vague = answers.filter(a => /^(it|this|that|they)\b/i.test(a)).length;
  if (thin) bad(`${thin} answers are too short to be lifted as a standalone quote`);
  if (vague) bad(`${vague} answers open with a pronoun and do not stand alone`);
  else ok(`all ${answers.length} answers stand alone (median ${
    answers.map(a => a.length).sort((a, b) => a - b)[answers.length >> 1]} chars)`);

  // llms.txt has to be real content, not a stub
  const llms = await (await page.request.get(base + '/llms.txt')).text();
  for (const [re, what] of [[/^# BLUFF/m, 'a title'], [/^> /m, 'a summary blockquote'],
                            [/## Facts/, 'a facts section'], [/webluff\.com\/play/, 'a play link'],
                            [/3,?576|3576/, 'the deck size'],
                            [/free/i, 'that it costs nothing']])
    if (!re.test(llms)) bad(`llms.txt is missing ${what}`);
  ok(`llms.txt: ${llms.split('\n').length} lines, ${llms.length} chars`);

  // robots has to actually let the answer engines in, or none of this matters
  const robots = await (await page.request.get(base + '/robots.txt')).text();
  const blocks = robots.split(/\n(?=User-agent)/i);
  for (const ua of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot', 'Google-Extended']) {
    const b = blocks.find(x => new RegExp('^User-agent:\\s*' + ua + '\\s*$', 'mi').test(x));
    if (!b) bad(`robots.txt never mentions ${ua}`);
    else if (/Disallow:\s*\//i.test(b)) bad(`robots.txt blocks ${ua} — it can never cite you`);
  }
  ok('robots.txt lets the answer engines in by name');
  if (!/Sitemap: https:\/\/webluff\.com\/sitemap\.xml/.test(robots))
    bad('robots.txt does not point at the sitemap');

  // and the sitemap has to list everything that exists
  const sm = await (await page.request.get(base + '/sitemap.xml')).text();
  for (const p of ['/faq', '/vs-wordle', '/rules', '/play/'])
    if (!sm.includes('https://webluff.com' + p)) bad(`the sitemap omits ${p}`);
  ok(`sitemap lists ${(sm.match(/<url>/g) || []).length} URLs`);

  console.log('\n8. the game still runs from /play/');
  await page.goto(base + '/play/');
  await page.waitForSelector('#tos');
  const deck = await page.evaluate(() => typeof DECKS === 'undefined' ? null : ({
    sizes: [4, 5, 6].map(L => DECKS[L].length),
    guess: [4, 5, 6].reduce((a, L) => a + GDICT[L].length / L, 0),
    cash: typeof CASH !== 'undefined' && CASH
  }));
  if (!deck) bad('the game did not boot at /play/');
  else {
    ok(`the game boots at /play/ with ${deck.sizes.reduce((a, b) => a + b, 0)} answers `
       + `(${deck.sizes.join(' / ')}) and ${deck.guess} guessable words`);
    // the deployed copy is the one that has to be free, not just the source
    if (deck.cash) bad('the build served from /play/ still has cash prizes switched on');
    else ok('and cash prizes are off in the build that actually ships');
  }

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  server.close();
  process.exit(errs.length ? 1 : 0);
})();
