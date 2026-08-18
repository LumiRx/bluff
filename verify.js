/* The server can only be trusted to pay people if it computes the same score
   the game did. This plays real matches in the real client, records what the
   player decided, then hands those decisions to the server engine and demands
   an identical number. Anything else means an honest player would be rejected
   — or a cheat accepted — and the whole prize is unsafe. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const passGate = require('./gate');
const PLAY = require('./playdaily');
const E = require('./server/src/engine.js');

const DAYS = ['2026-08-08', '2026-08-09', '2026-11-30', '2027-01-01', '2026-02-29'];

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);

  console.log('\n1. the day itself — same seating, same script, same personalities');
  {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', e => bad('PAGEERROR ' + e.message));
    await page.goto('file://' + __dirname + '/index.html');
    await passGate(page);
    await page.fill('#hnd', 'VIV'); await page.click('#go2');
    await page.waitForSelector('#cash');

    for (const day of DAYS) {
      const client = await page.evaluate(d => {
        // pin the clock, then set the day up exactly as startMatch would
        setSeed(hashStr('bluff-' + d));
        const pool = blankRivals(), p = pool.slice();
        for (let i = p.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t;
        }
        const seated = p.slice(0, 5);
        const script = buildScript(seated);
        const bots = seated.map(r => botParams(r));
        return {
          seated: seated.map(x => x.name),
          script: script.map(h => h.word ? `${h.word}|${h.tell.k}${h.tell.c}${h.tell.i}|${h.stake}`
                                         : 'YOU:' + h.cards.join(',')),
          bots: bots.map(b => [b.skill, b.optimism, b.tight].map(v => v.toFixed(6)).join('/'))
        };
      }, day);

      const s = E.setupDay(day);
      const server = {
        seated: s.seated.map(x => x.name),
        script: s.script.map(h => h.word ? `${h.word}|${h.tell.k}${h.tell.c}${h.tell.i}|${h.stake}`
                                         : 'YOU:' + h.cards.join(',')),
        bots: s.bots.map(b => [b.skill, b.optimism, b.tight].map(v => v.toFixed(6)).join('/'))
      };
      const diff = [];
      if (client.seated.join() !== server.seated.join()) diff.push('seating');
      if (client.script.join() !== server.script.join()) diff.push('script');
      if (client.bots.join() !== server.bots.join()) diff.push('bot personalities');
      if (diff.length) {
        bad(`${day}: ${diff.join(', ')} differ`);
        diff.forEach(k => console.log(`       client ${JSON.stringify(client[k === 'bot personalities' ? 'bots' : k]).slice(0, 150)}\n       server ${JSON.stringify(server[k === 'bot personalities' ? 'bots' : k]).slice(0, 150)}`));
      } else ok(`${day}: ${server.seated.join(', ')} · ${server.script[1]}`);
    }
    await page.close();
  }

  console.log('\n2. whole matches — does the score agree');
  // three different playing styles, so the comparison covers setting, cracking,
  // missing and folding rather than one lucky path
  const STYLES = Object.keys(PLAY.STYLES).map(n => Object.assign({ n }, PLAY.STYLES[n]));

  for (const day of DAYS.slice(0, 3)) {
    for (const style of STYLES) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      page.on('pageerror', e => bad('PAGEERROR ' + e.message));
      await page.goto('file://' + __dirname + '/index.html');
      await PLAY.readyPage(page, day);

      const decisions = await PLAY.playDaily(page, style,
        m => bad(`${day} / ${style.n}: ${m}`), !!process.env.VDBG);
      const client = await page.evaluate(() => ({ score: S.score, chips: S.seats[0].chips,
        strip: S.strip.map(h => `${h.role}:${h.callers}/${h.cracked}`).join(' ') }));

      // the game records its own transcript for the server; if that disagrees
      // with what the test just watched happen, every honest player is at risk
      const tape = await page.evaluate(() => S.tape);
      if (JSON.stringify(tape) !== JSON.stringify(decisions))
        bad(`${day} / ${style.n}: the game's own transcript is not what it played\n` +
            `       played ${JSON.stringify(decisions)}\n       taped  ${JSON.stringify(tape)}`);

      const server = E.runDaily(day, decisions);
      if (!server.ok) bad(`${day} / ${style.n}: the engine rejected an honest transcript — ${server.error}`);
      else if (server.score !== client.score || server.chips !== client.chips) {
        bad(`${day} / ${style.n}: score ${client.score} vs ${server.score}, chips ${client.chips} vs ${server.chips}`);
        console.log('       client ' + client.strip);
        console.log('       server ' + server.hands.map(h => `${h.role}:${h.callers}/${h.cracked}`).join(' '));
      } else ok(`${day} / ${style.n}: ${server.score} points, ${server.chips} chips — agreed`);
      await ctx.close();
    }
  }

  console.log('\n3. what the engine refuses');
  const day = DAYS[0];
  const base = E.setupDay(day);
  const legalWord = base.script[0].cards[0];
  const legalTell = (() => { const t = E.withRng(E.mulberry32(7), () => E.offerTells(legalWord));
    return t.find(x => x.n <= E.TELLCAP(legalWord.length)) || t[0]; })();
  const good = [{ word: legalWord, tell: { k: legalTell.k, c: legalTell.c, i: legalTell.i },
                  stake: Math.min(25, E.capFor(legalTell.n, legalWord.length)) }];
  for (let h = 1; h < 6; h++) good.push({ call: false });
  if (!E.runDaily(day, good).ok) bad('a legal transcript was rejected');
  else ok('a legal transcript is accepted');

  // hand 2's word decides the shape of a legal guess now, so the forgeries are
  // built from it rather than from a hard-coded five-letter string
  const h2 = base.script[1].word, L2 = h2.length;
  const other = E.DECKS[L2].filter(w => w !== h2);
  const five = n => other.slice(0, n);
  const junk = () => 'Z'.repeat(L2);
  const wrongLen = () => E.DECKS[L2 === 4 ? 6 : 4][0];

  const CHEATS = [
    ['a word that was never dealt', d => { d[0].word = 'ZEBRA'; }],
    ['a clue that is not true of the word', d => { d[0].tell = { k: 'pin', c: 'Q', i: 0 }; }],
    ['a price over the cap for that clue', d => { d[0].stake = 100;
      d[0].tell = { k: 'void', c: 'QX', i: 0 }; }],
    ['a price that is not a price', d => { d[0].stake = 999; }],
    ['a fifth guess', d => { d[1] = { call: true, guesses: five(5) }; }],
    ['a guess that is not a word', d => { d[1] = { call: true, guesses: [junk()] }; }],
    ['a guess of the wrong length', d => { d[1] = { call: true, guesses: [wrongLen()] }; }],
    ['playing on after the word fell', d => {
      const sc = base.script[1]; d[1] = { call: true, guesses: [sc.word, other[0]] }; }],
    ['five hands instead of six', d => { d.pop(); }]
  ];
  for (const [what, mutate] of CHEATS) {
    const d = JSON.parse(JSON.stringify(good));
    mutate(d);
    const r = E.runDaily(day, d);
    if (r.ok) bad(`the engine accepted ${what}`);
    else ok(`refuses ${what} — "${r.error}"`);
  }

  // and the thing the whole design turns on: a claimed score is never trusted
  const forged = JSON.parse(JSON.stringify(good));
  forged.score = 99999; forged[0].score = 99999;
  const r = E.runDaily(day, forged);
  if (r.score > 2000) bad('a claimed score leaked into the result');
  else ok(`a forged score is ignored entirely — the engine computed ${r.score} from the decisions`);

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
