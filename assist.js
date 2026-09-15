/* assist.js — the adaptive hint ladder.
   Checks the read (1-10), what each level hands a caller, that the daily is
   never assisted, and that HINT can reveal every position of a four- and a
   six-letter word. Run: node assist.js */
const { chromium } = require('playwright');
const passGate = require('./gate');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => { console.log('PAGEERROR ' + e.message); fails++; });
  p.on('console', m => { if (m.type() === 'error') { console.log('CONSOLE ' + m.text()); fails++; } });
  await p.addInitScript(() => { window.fetch = () => Promise.reject(new Error('offline')); });
  await p.goto('file://' + __dirname + '/index.html');
  await passGate(p);
  await p.fill('#hnd', 'A' + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase());
  await p.click('#go2');
  await p.waitForSelector('#cash');

  /* ── the read ── */
  const mk = (n, crackRate, avgRows) => ({ n, crackRate, avgRows });
  const curve = await p.evaluate(cases => cases.map(c => {
    const cracked = Math.round(c.n * c.crackRate);
    P.form = Array.from({ length: c.n }, (_, i) => i < cracked ? 1 : 0);
    P.called = c.n; P.cracked = cracked; P.late = 0; P.missed = c.n - cracked;
    P.rows = cracked * c.avgRows;
    return levelRead();
  }), [mk(0,0,0), mk(20,0,0), mk(20,.25,3), mk(20,.5,3), mk(20,.7,2.5), mk(20,1,1.5)]);
  ok(curve[0] === 3, 'no record reads as level 3 (got ' + curve[0] + ')');
  ok(curve[1] === 1, '0 of 20 cracked reads as level 1 (got ' + curve[1] + ')');
  ok(curve[5] === 10, '20 of 20 cracked fast reads as level 10 (got ' + curve[5] + ')');
  ok(curve.every((v, i) => i === 0 || v >= curve[i - 1] || i === 1), 'the curve rises with the record');
  ok(curve.every(v => v >= 1 && v <= 10), 'every read lands inside 1-10');

  /* ── the ladder ── */
  const lad = await p.evaluate(() => [1,2,3,4,5,6,7,8,9,10].map(l => assistFor(l)));
  ok(lad[0].hints === 2 && lad[0].autoAt === 2, 'level 1 gets two hints and auto-spends after 2 misses');
  ok(lad[4].hints === 0 && lad[4].sample === 2, 'level 5 keeps examples, loses the free hint');
  ok(lad.slice(6).every(a => !a.hints && !a.autoAt && !a.sample), 'levels 7-10 are the shipped game, untouched');

  /* ── hysteresis ── */
  const step = await p.evaluate(() => {
    P.level = 3; P.form = Array.from({length:20},()=>1); P.called=20;P.cracked=20;P.late=0;P.missed=0;P.rows=30;
    const a = settleLevel(), c = settleLevel();
    return [a, c];
  });
  ok(step[0] === 4 && step[1] === 5, 'the level moves one step at a time (got ' + step.join(',') + ')');

  /* ── the daily is never assisted ── */
  const daily = await p.evaluate(() => {
    P.level = 1; P.assistOff = false;
    S = S || {}; S.daily = true; const off = assisted();
    S.daily = false; const on = assisted();
    P.assistOff = true; const muted = assisted();
    P.assistOff = false;
    return { off, on, muted };
  });
  ok(daily.off === false, 'no assist on the daily');
  ok(daily.on === true, 'assist on an open table');
  ok(daily.muted === false, 'the switch in settings turns it off');

  /* ── a four-letter hand is met one level lower ── */
  const lens = await p.evaluate(() => { P.level = 5; P.assistOff = false;
    return { four: handLevel(4), five: handLevel(5), six: handLevel(6) }; });
  ok(lens.four === 4 && lens.five === 5 && lens.six === 5, 'four-letter hands drop one level');

  /* ── HINT can reach every position, at every word length ── */
  const reach = await p.evaluate(() => {
    const out = {};
    for (const L of [4, 5, 6]) {
      const word = 'ABCDEF'.slice(0, L);
      const seat = { marks: [], given: [] }, seen = new Set();
      for (let i = 0; i < 400; i++) {
        const pos = unknownLetter(word, seat);
        if (pos == null) break;
        if (pos < 0 || pos >= L) { seen.add('OUT:' + pos); break; }
        seen.add(pos);
      }
      out[L] = [...seen].sort().join(',');
    }
    return out;
  });
  ok(reach[4] === '0,1,2,3', 'four-letter: every position reachable, none out of range (' + reach[4] + ')');
  ok(reach[5] === '0,1,2,3,4', 'five-letter: every position reachable (' + reach[5] + ')');
  ok(reach[6] === '0,1,2,3,4,5', 'six-letter: the last letter is reachable (' + reach[6] + ')');

  /* ── a beginner is actually dealt the hints ── */
  const dealt = await p.evaluate(() => {
    P.level = 1; P.matches = 5; P.assistOff = false;
    startMatch('cash');
    return (S.seats[0].items || []).filter(x => x === 'hint').length;
  });
  ok(dealt >= 2, 'a level 1 player is dealt two free hints (got ' + dealt + ')');

  const none = await p.evaluate(() => {
    P.level = 9; P.matches = 5;
    startMatch('cash');
    return (S.seats[0].items || []).filter(x => x === 'hint').length;
  });
  ok(none <= 1, 'a level 9 player is dealt no free hint (got ' + none + ')');

  await b.close();
  console.log(fails ? '\n' + fails + ' check(s) failed' : '\nassist: all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('THREW ' + e.message); process.exit(1); });
