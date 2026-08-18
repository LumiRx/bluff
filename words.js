/* The words, and what stops a bad one reaching a screen.

   This is the suite that has to stay green forever. A deck word is chosen by us
   and shown in large letters with a definition under it; a handle appears on a
   public board; a table code gets screenshotted into a group chat. Each of
   those is a different filter with a different bar, and the failure modes are
   opposite: too loose and the game says something awful, too tight and it
   refuses to let somebody be called NIGHTOWL.

   So this checks both directions, every time. */
const { chromium } = require('playwright');
const passGate = require('./gate');

(async () => {
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
  const page = await ctx.newPage();
  page.on('pageerror', e => bad('PAGEERROR ' + e.message));
  await page.goto('file://' + __dirname + '/index.html');

  console.log('\n1. the deck itself');
  const deck = await page.evaluate(() => ({
    sizes: [4, 5, 6].map(L => DECKS[L].length),
    total: [4, 5, 6].reduce((a, L) => a + DECKS[L].length, 0),
    wrongLen: [4, 5, 6].flatMap(L => DECKS[L].filter(w => w.length !== L)).slice(0, 5),
    dupes: (() => { const seen = new Set(), d = [];
      [4, 5, 6].forEach(L => DECKS[L].forEach(w => { if (seen.has(w)) d.push(w); seen.add(w); }));
      return d.slice(0, 5); })(),
    notGuessable: [4, 5, 6].flatMap(L => DECKS[L].filter(w => !isWord(w))).slice(0, 5),
    noDef: [4, 5, 6].flatMap(L => DECKS[L].filter(w => !WORD[w] || !WORD[w].d)).slice(0, 5),
    shortDef: [4, 5, 6].flatMap(L => DECKS[L].filter(w => WORD[w] && WORD[w].d &&
      WORD[w].d.trim().length < 2)).slice(0, 5),
    guessable: [4, 5, 6].map(L => GDICT[L].length / L)
  }));
  ok(`${deck.total} answers — ${deck.sizes.join(' / ')} at four, five and six letters`);
  ok(`${deck.guessable.reduce((a, b) => a + b, 0)} words accepted as guesses `
     + `(${deck.guessable.join(' / ')})`);
  if (deck.wrongLen.length) bad(`words in the wrong deck: ${deck.wrongLen.join(' ')}`);
  if (deck.dupes.length) bad(`the same word appears twice: ${deck.dupes.join(' ')}`);
  if (deck.notGuessable.length) bad(`answers that cannot be typed: ${deck.notGuessable.join(' ')}`);
  else ok('every answer is a word the game will accept as a guess');
  if (deck.noDef.length) bad(`answers with no definition: ${deck.noDef.join(' ')}`);
  else ok('every answer teaches how to say it and what it means');
  if (deck.shortDef.length) bad(`suspiciously short definitions: ${deck.shortDef.join(' ')}`);

  console.log('\n2. nothing offensive can be dealt');
  // a broad independent sweep, not the same list the build filtered with
  const SWEEP = ['fuck', 'shit', 'cunt', 'piss', 'bitch', 'whore', 'slut', 'rape', 'nigg',
    'fag', 'kike', 'spic', 'coon', 'dago', 'gook', 'wank', 'penis', 'vagina', 'boob',
    'tits', 'cock', 'dick', 'anus', 'arse', 'porn', 'jizz', 'semen', 'nazi', 'kill',
    'murder', 'suicide', 'heroin', 'cocaine', 'corpse', 'rapist'];
  const dirty = await page.evaluate(sweep => {
    const out = [];
    [4, 5, 6].forEach(L => DECKS[L].forEach(w => {
      const l = w.toLowerCase();
      sweep.forEach(t => { if (l === t) out.push(w + ' (exact ' + t + ')'); });
    }));
    return out;
  }, SWEEP);
  if (dirty.length) bad(`the deck can deal: ${dirty.join(', ')}`);
  else ok(`none of ${SWEEP.length} sampled terms can be dealt as an answer`);

  // guesses are visible to a rival holding a PEEK, so the offensive ones are
  // refused. Violence and drug words are not: KILL and HEROIN are ordinary
  // English, and a dictionary that denies they are words is lying to a player
  // for no gain.
  const OFFENSIVE_ONLY = SWEEP.filter(t =>
    !['kill', 'murder', 'heroin', 'corpse', 'suicide', 'cocaine', 'nazi'].includes(t));
  const dirtyGuess = await page.evaluate(sweep =>
    sweep.filter(t => [4, 5, 6].includes(t.length) && isWord(t.toUpperCase())), OFFENSIVE_ONLY);
  if (dirtyGuess.length) bad(`accepted as guesses (a rival can PEEK at these): ${dirtyGuess.join(' ')}`);
  else ok('and none of the offensive ones can be typed as a guess either');

  console.log('\n3. handles — the hard direction');
  // the filter must be harsh on intent and harmless to ordinary names
  const MUSTBLOCK = ['FUCKER', 'SHITLORD', 'CUNT', 'N1GGER', 'NIGGA', 'PU55Y', '5H1TTY',
    'WANKER', 'DILDO', 'FAGGOT', 'RAPE', 'TWAT', 'WH0RE', 'B1TCH', 'SLUT99'];
  const MUSTPASS = ['NIGHTOWL', 'SKILLZ', 'CLASSIC', 'ASSESS', 'SCUNTHORP', 'THERAPIST',
    'MISHIT', 'SWANKY', 'GRAPE', 'ANALOG', 'SPICE', 'KNIGHT', 'BUTTER', 'VIV', 'ACE',
    'WORDNERD', 'MRSPOCK', 'BIGDOG', 'COCKBURN'];
  const res = await page.evaluate(([b, p]) => ({
    leaked: b.filter(h => cleanText(h)),
    blocked: p.filter(h => !cleanText(h))
  }), [MUSTBLOCK, MUSTPASS]);
  if (res.leaked.length) bad(`these got through as handles: ${res.leaked.join(' ')}`);
  else ok(`all ${MUSTBLOCK.length} abusive handles refused, leet spellings included`);
  if (res.blocked.length) bad(`these ordinary handles were refused: ${res.blocked.join(' ')}`);
  else ok(`all ${MUSTPASS.length} innocent handles accepted — no Scunthorpe problem`);

  // and the filter is actually wired to the input, not just defined
  await passGate(page);
  await page.fill('#hnd', 'FUCKER');
  await page.click('#go2');
  if (await page.locator('#hnd').count() === 0)
    bad('the handle screen accepted an abusive handle');
  else ok('the handle screen refuses one for real, not just in theory');
  await page.fill('#hnd', 'VIV'); await page.click('#go2');
  await page.waitForSelector('#cash', { timeout: 8000 });
  ok('and lets an ordinary one through');

  console.log('\n4. table codes');
  const codes = await page.evaluate(() => {
    const seen = [], bad = [];
    for (let i = 0; i < 4000; i++) { const c = makeCode(); seen.push(c); if (!cleanText(c)) bad.push(c); }
    return { n: seen.length, bad: bad.slice(0, 6), uniq: new Set(seen).size };
  });
  if (codes.bad.length) bad(`generated codes that read badly: ${codes.bad.join(' ')}`);
  else ok(`${codes.n} generated table codes, ${codes.uniq} distinct, none read badly`);

  console.log('\n5. friends');
  const fr = await page.evaluate(() => {
    screenFriends();
    const i = document.querySelector('#fh') || document.querySelector('input');
    if (!i) return 'no input';
    i.value = 'SHITLORD';
    const btn = [...document.querySelectorAll('button')].find(b => /ADD/i.test(b.textContent));
    if (!btn) return 'no button';
    btn.click();
    return (P.friends || []).some(x => /SHIT/i.test(x.h)) ? 'accepted' : 'refused';
  });
  if (fr === 'accepted') bad('an abusive friend name reached the friends board');
  else if (typeof fr === 'string' && fr.startsWith('no ')) bad(`could not test friends: ${fr}`);
  else ok('an abusive friend name is refused too');

  console.log('\n6. a guess has to be a word');
  const probes = await page.evaluate(() => ({
    junk: ['AEIOU', 'ZZZZZ', 'QQQQ', 'AAAAAA', 'XYZZY'].filter(w => isWord(w)),
    real: ['CRANE', 'MOAT', 'PLANET', 'ABOUT', 'TIDY'].filter(w => !isWord(w))
  }));
  if (probes.junk.length) bad(`nonsense still accepted: ${probes.junk.join(' ')}`);
  else ok('AEIOU, ZZZZZ and friends are refused — probes have to be real words now');
  if (probes.real.length) bad(`real words refused: ${probes.real.join(' ')}`);
  else ok('ordinary words are accepted at every length');

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
