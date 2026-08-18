/* Economy balance simulation for BLUFF.
   Reuses the exact game logic to answer the question the design hinges on:
   can a setter actually make money, and is calling ever a close decision? */
const fs = require('fs');
const RAW = fs.readFileSync(__dirname + '/deckstr.txt', 'utf8').trim();
const DECK = [], RATE = {};
RAW.split(' ').forEach(t => { const w = t.slice(0, 5); DECK.push(w); RATE[w] = +t.slice(5); });
const NW = DECK.length;
const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function evaluate(g, w) {
  const r = Array(5).fill('m'), W = w.split(''), G = g.split('');
  for (let i = 0; i < 5; i++) if (G[i] === W[i]) { r[i] = 'h'; W[i] = null; G[i] = null; }
  for (let i = 0; i < 5; i++) { if (!G[i]) continue; const j = W.indexOf(G[i]); if (j > -1) { r[i] = 'n'; W[j] = null; } }
  return r;
}
const consistent = (c, g, r) => evaluate(g, c).join('') === r.join('');
function survivors(t, pool) {
  if (t.k === 'pin') return pool.filter(w => w[t.i] === t.c);
  if (t.k === 'float') return pool.filter(w => w.includes(t.c));
  return pool.filter(w => !w.includes(t.c));
}
function offerTells(word) {
  const out = [], seen = new Set();
  const pins = [0, 1, 2, 3, 4].map(i => ({ k: 'pin', c: word[i], i })); pins.sort(() => Math.random() - .5);
  const fl = [...new Set(word.split(''))].map(c => ({ k: 'float', c, i: 0 })); fl.sort(() => Math.random() - .5);
  const ab = AL.filter(c => !word.includes(c)); ab.sort(() => Math.random() - .5);
  const vd = ab.slice(0, 6).map(c => ({ k: 'void', c, i: 0 }));
  [pins[0], pins[1], fl[0], fl[1], vd[0], vd[1]].forEach(t => {
    if (!t) return; const k = t.k + t.c + t.i; if (seen.has(k)) return; seen.add(k);
    t.n = survivors(t, DECK).length; out.push(t);
  });
  return out.sort((a, b) => a.n - b.n);
}
const OPEN = ['CRANE', 'SLATE', 'ADIEU', 'AUDIO', 'RAISE', 'STARE', 'TRACE', 'ARISE', 'LATER', 'RATIO'];
function solveOnce(target, pool, disc) {
  let p = pool, g = OPEN[Math.floor(Math.random() * OPEN.length)];
  if (!p.includes(g)) g = p[Math.floor(Math.random() * p.length)];
  for (let t = 0; t < 4; t++) {
    if (g === target) return t + 1;
    const r = evaluate(g, target);
    p = p.filter(w => consistent(w, g, r));
    if (t === 3) break;
    if (!p.length) return 0;
    g = (Math.random() < disc) ? p[Math.floor(Math.random() * p.length)] : DECK[Math.floor(Math.random() * NW)];
  }
  return 0;
}
const crackOdds = (t, p, n) => { let s = 0; for (let i = 0; i < n; i++) if (solveOnce(t, p, .78)) s++; return s / n; };

const BANDS = [[0, 42], [43, 55], [56, 66], [67, 76], [77, 99]];
function dealCards() {
  return BANDS.map(b => { const p = DECK.filter(w => RATE[w] >= b[0] && RATE[w] <= b[1]); return p[Math.floor(Math.random() * p.length)]; })
    .sort((a, b) => RATE[a] - RATE[b]);
}
const ANTE = 10, STAKES = [25, 50, 100], SEATS = 6;
function mkBot() {
  return { optimism: -.18 + Math.random() * .40, tight: -.10 + Math.random() * .26, skill: .55 + Math.random() * .34 };
}

/* ─── setter strategies ─── */
const STRATS = {
  'bait  (sharp card + crowded pin)': cards => {
    const w = cards[0], o = offerTells(w);
    const baits = o.filter(t => t.k === 'pin' && t.n >= 14);
    return [w, baits.length ? baits[Math.floor(Math.random() * baits.length)] : o[0], 100];
  },
  'hide  (sharp card + thinnest tell)': cards => {
    const w = cards[0], o = offerTells(w);
    return [w, o[o.length - 1], 100];
  },
  'random (any card, any tell)': cards => {
    const w = cards[Math.floor(Math.random() * 5)], o = offerTells(w);
    return [w, o[Math.floor(Math.random() * o.length)], STAKES[Math.floor(Math.random() * 3)]];
  },
  'naive (softest card + big pin)': cards => {
    const w = cards[4], o = offerTells(w);
    const p = o.filter(t => t.k === 'pin');
    return [w, p.length ? p[0] : o[0], 100];
  },
  'bait small (sharp card + pin, low price)': cards => {
    const w = cards[0], o = offerTells(w);
    const baits = o.filter(t => t.k === 'pin' && t.n >= 14);
    return [w, baits.length ? baits[Math.floor(Math.random() * baits.length)] : o[0], 25];
  },
};

const N = 1500;
console.log(`${N} hands per strategy · 5 guessers · ante ${ANTE} · even money\n`);
console.log('strategy                                  calls  crack%   setter net/hand   caller net/hand');
console.log('─'.repeat(96));
for (const [name, fn] of Object.entries(STRATS)) {
  let calls = 0, cracks = 0, net = 0, callerNet = 0, poolSum = 0;
  for (let h = 0; h < N; h++) {
    const [word, tell, stake] = fn(dealCards());
    const pool = survivors(tell, DECK);
    poolSum += pool.length;
    let hand = ANTE * (SEATS - 1);
    for (let s = 0; s < 5; s++) {
      const b = mkBot();
      const est = Math.min(.97, Math.max(.03, crackOdds(word, pool, 14) + b.optimism));
      let bar = .5 + b.tight + (stake - 50) / 100 * .06;
      if (est <= bar) { callerNet -= ANTE; continue; }
      calls++;
      const solved = solveOnce(word, pool.slice(), b.skill) > 0;
      if (solved) { cracks++; hand -= stake; callerNet += stake - ANTE; }
      else { hand += stake; callerNet -= stake + ANTE; }
    }
    net += hand;
  }
  console.log(
    name.padEnd(42) +
    (calls / N).toFixed(2).padStart(5) +
    (calls ? (100 * cracks / calls).toFixed(0) : '—').padStart(8) + '%' +
    (net / N).toFixed(1).padStart(16) +
    (callerNet / N / 5).toFixed(1).padStart(18) +
    '   (avg pool after tell: ' + Math.round(poolSum / N) + ')');
}

/* ─── how hard is a hand once you have called? ─── */
console.log('\ncrack rate for a caller, by tell type (competent solver, discipline .85):');
const byKind = {};
for (let i = 0; i < 2500; i++) {
  const cards = dealCards(), w = cards[Math.floor(Math.random() * 5)];
  const o = offerTells(w), t = o[Math.floor(Math.random() * o.length)];
  const pool = survivors(t, DECK);
  const ok = solveOnce(w, pool, .85) > 0;
  const key = t.k + (t.k === 'pin' ? (t.n >= 14 ? ' (crowded)' : ' (thin)') : '');
  byKind[key] = byKind[key] || [0, 0, 0];
  byKind[key][0]++; byKind[key][1] += ok ? 1 : 0; byKind[key][2] += pool.length;
}
Object.entries(byKind).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0]).forEach(([k, v]) =>
  console.log('  ' + k.padEnd(18) + (100 * v[1] / v[0]).toFixed(0).padStart(4) + '%   n=' + String(v[0]).padStart(4) +
    '   avg pool ' + Math.round(v[2] / v[0])));
