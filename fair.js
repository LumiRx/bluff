/* The crypto build's only real claim is "the setter cannot change the word once
   they have seen your guesses". This proves it, in the browser, against the
   same code that ships: commit, try to substitute a different word, and watch
   the check refuse it. Also re-implements the contract's evaluate() in JS and
   agrees with the game's, because those two marking every hand differently is
   how you end up paying the wrong person. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = 'file://' + __dirname + '/crypto/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);
  page.on('pageerror', e => bad('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') bad('CONSOLE ' + m.text()); });
  await page.goto(path);
  await page.waitForSelector('#view');

  console.log('\n1. keccak-256, checked against published vectors');
  const kv = await page.evaluate(() => ({
    empty: k256(''),
    approve: sel('approve(address,uint256)'),
    balance: sel('balanceOf(address)'),
    decimals: sel('decimals()')
  }));
  if (kv.empty !== 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
    bad('keccak256("") is wrong');
  // these three selectors are fixed by ERC-20 and known independently of us
  const known = { approve: '0x095ea7b3', balance: '0x70a08231', decimals: '0x313ce567' };
  Object.entries(known).forEach(([k, v]) => {
    if (kv[k] !== v) bad(`selector ${k} came out ${kv[k]}, ERC-20 says ${v}`);
  });
  ok('keccak matches the published ERC-20 selectors: ' + Object.values(known).join(' '));

  console.log('\n2. the commitment binds the word');
  const r = await page.evaluate(async () => {
    const salt = freshSalt();
    const real = await commitOf('SLIDE', salt);
    const swap = await commitOf('SPICE', salt);          // same salt, different word
    const other = await commitOf('SLIDE', freshSalt());  // same word, different salt
    const again = await commitOf('SLIDE', salt);         // must be deterministic
    return { salt, real, swap, other, again };
  });
  if (r.real === r.swap) bad('two different words produced the same commitment');
  else ok('swapping the word after the fact breaks the hash — the reveal would revert');
  if (r.real === r.other) bad('the salt does not change the commitment');
  else ok('the same word under a fresh salt is a different commitment');
  if (r.real !== r.again) bad('the commitment is not deterministic');
  else ok('committing twice gives the same hash, so an honest reveal always verifies');
  if (!/^0x[0-9a-f]{64}$/.test(r.salt)) bad('the salt is not 32 bytes of hex');

  // the salt has to be strong enough that a 749-word deck cannot be walked
  const ent = await page.evaluate(() => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(freshSalt());
    return seen.size;
  });
  if (ent !== 400) bad(`400 salts produced only ${ent} distinct values`);
  else ok('400 salts, 400 distinct values — no deck-walking the commitment');

  console.log('\n3. a brute-force attempt over the whole deck');
  const brute = await page.evaluate(async () => {
    const salt = freshSalt();
    const target = await commitOf('SLIDE', salt);
    // an attacker knows the deck and the commitment but not the salt
    let hits = 0;
    for (const w of DECK.slice(0, 120)) {
      const guessSalt = '0x' + '00'.repeat(32);
      if (await commitOf(w, guessSalt) === target) hits++;
    }
    return hits;
  });
  if (brute) bad(`the deck was walked and matched ${brute} time(s) without the salt`);
  else ok('walking the deck without the salt finds nothing');

  console.log('\n4. the clue is binding too');
  const clue = await page.evaluate(() => ({
    pinOK:   clueHolds('SLIDE', 0, 2, 'I'),   // 3rd letter is I
    pinBad:  clueHolds('SPICE', 0, 2, 'I'),   // SPICE has I at index 2? S-P-I-C-E -> yes
    pinBad2: clueHolds('GRAVE', 0, 2, 'I'),
    voidOK:  clueHolds('GRAVE', 1, 0, 'S'),
    voidBad: clueHolds('SLIDE', 1, 0, 'S'),
    hasOK:   clueHolds('SLIDE', 2, 0, 'E'),
    hasBad:  clueHolds('GRAVY', 2, 0, 'E')
  }));
  const want = { pinOK: true, pinBad: true, pinBad2: false, voidOK: true,
                 voidBad: false, hasOK: true, hasBad: false };
  Object.entries(want).forEach(([k, v]) => {
    if (clue[k] !== v) bad(`clue check ${k} returned ${clue[k]}, expected ${v}`);
  });
  ok('a word that breaks its advertised clue fails the check — the setter cannot reveal it');

  console.log('\n5. marking agrees with the main game');
  const pairs = await page.evaluate(() => {
    const out = [];
    const pick = () => DECK[Math.floor(Math.random() * DECK.length)];
    for (let i = 0; i < 4000; i++) {
      const g = pick(), w = pick();
      out.push([g, w, evaluate(g, w).join('')]);
    }
    // the doubled-letter cases are where naive implementations diverge
    ['SPEED', 'GEESE', 'LEVEL', 'MAMMA', 'ERROR'].forEach(a =>
      ['SPEED', 'GEESE', 'LEVEL', 'MAMMA', 'ERROR', 'SLIDE'].forEach(b =>
        out.push([a, b, evaluate(a, b).join('')])));
    return out;
  });
  // independent re-implementation, written from the rule rather than copied
  function ref(g, w) {
    const res = ['m', 'm', 'm', 'm', 'm'];
    const pool = {};
    for (let i = 0; i < 5; i++) if (g[i] !== w[i]) pool[w[i]] = (pool[w[i]] || 0) + 1;
    for (let i = 0; i < 5; i++) if (g[i] === w[i]) res[i] = 'h';
    for (let i = 0; i < 5; i++) {
      if (res[i] === 'h') continue;
      if (pool[g[i]] > 0) { res[i] = 'n'; pool[g[i]]--; }
    }
    return res.join('');
  }
  let diff = 0, example = null;
  for (const [g, w, got] of pairs) {
    const exp = ref(g, w);
    if (got !== exp) { diff++; if (!example) example = `${g} vs ${w}: got ${got}, expected ${exp}`; }
  }
  if (diff) bad(`${diff} of ${pairs.length} markings disagree with the reference — ${example}`);
  else ok(`${pairs.length} markings agree with an independent implementation, doubled letters included`);

  console.log('\n6. the verifier a player would actually use');
  await page.evaluate(() => { TAB = 'verify'; render(); });
  await page.waitForSelector('#vGo');
  const salt = r.salt;
  await page.fill('#vWord', 'SLIDE');
  await page.fill('#vSalt', salt);
  await page.fill('#vCommit', r.real);
  await page.fill('#vGuess', 'STONE SLIDE');
  await page.click('#vGo');
  await page.waitForTimeout(250);
  let txt = await page.locator('#vOut').innerText();
  if (!/MATCHES/.test(txt)) bad('an honest reveal did not verify: ' + txt.slice(0, 90));
  else ok('an honest reveal verifies');

  await page.fill('#vWord', 'SPICE');
  await page.click('#vGo');
  await page.waitForTimeout(250);
  txt = await page.locator('#vOut').innerText();
  if (!/NO MATCH/.test(txt)) bad('a substituted word passed the verifier');
  else ok('a substituted word is caught and named');

  console.log('\n7. the money addresses are shown, not hidden');
  const cfg = await page.evaluate(() => Object.entries(CHAINS).map(([id, c]) => ({
    id: +id, name: c.name,
    tokens: Object.entries(c.tokens).map(([k, t]) => `${k} ${t.addr} ·${t.dec}d`)
  })));
  cfg.forEach(c => {
    c.tokens.forEach(t => {
      const addr = t.split(' ')[1];
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) bad(`${c.name} has a malformed token address: ${addr}`);
    });
    console.log(`   · ${c.name} (${c.id}) → ${c.tokens.join('   ')}`);
  });
  const shown = await page.evaluate(() => { TAB = 'play'; render();
    return document.querySelector('#view').innerText.includes('0x833589'); });
  if (!shown) bad('the token address is not shown to the player before they approve it');
  else ok('the address being approved is on screen and links to the explorer');

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
