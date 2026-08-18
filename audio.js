/* Renders every sound offline and measures it. I cannot hear these, so the
   only honest check is numeric: does the buffer contain signal, how loud does
   it peak, how long does it actually last, and does mute really silence it. */
const { chromium } = require('playwright');
const passGate = require('./gate');
const path = 'file://' + __dirname + '/index.html';

const CASES = [
  ['stars', 400],  ['stars', 3000], ['stars', 9000],
  ['start'], ['finish'], ['pay', 0], ['pay', 1],
  ['round', 1], ['round', 3], ['round', 6],
  ['chime'], ['count', 3], ['count', 2], ['count', 1], ['go'],
  ['reward', 200], ['reward', 2500], ['reward', 9000],
  ['chip'], ['tile', 'h'], ['tile', 'n'], ['tile', 'm'],
  ['tap'], ['tick'], ['key'], ['crack'], ['fold'], ['spark'],
  ['deal'], ['warn'], ['bust'], ['no'], ['seal'],
  ['rank', true], ['rank', false]
];

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(path);
  await passGate(page);
  await page.waitForSelector('#hnd');

  // a running music scheduler during an offline render is nonsense; silence it
  await page.evaluate(() => { if (typeof Mus !== 'undefined') Mus.stop(); P.noMusic = true; });

  const rows = await page.evaluate(async (cases) => {
    async function render(name, arg, mute) {
      const SR = 44100, oc = new OfflineAudioContext(1, SR * 4, SR);
      oc.resume = () => {};                 // Snd.ready() calls this; offline hates it
      // the real chain: bus -> limiter -> make-up. Measuring a bare gain node
      // would report a level no player ever hears.
      const g = Snd.build(oc, oc.destination);
      const kc = Snd.ctx, km = Snd.master, kmu = P.mute;
      Snd.ctx = oc; Snd.master = g; P.mute = mute;
      try { arg === undefined ? Snd[name]() : Snd[name](arg); }
      finally { }
      const buf = await oc.startRendering();
      Snd.ctx = kc; Snd.master = km; P.mute = kmu;
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0, last = 0, hot = 0;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        if (a > 0.97) hot++;            // samples pinned against the limiter
        if (a > 0.0008) { last = i; }
      }
      // loudness measured over the sound's own length, not the empty tail --
      // otherwise a short sound always reads quiet whatever its level
      for (let i = 0; i <= last; i++) sum += d[i] * d[i];
      const rms = last ? Math.sqrt(sum / (last + 1)) : 0;
      // a coarse envelope, so the shape of a sound can be checked and not just its level
      const BINS = 40, step = Math.max(1, Math.ceil((last + 1) / BINS)), env = [];
      for (let i = 0; i <= last; i += step) {
        let m = 0;
        for (let j = i; j < Math.min(i + step, last + 1); j++) m = Math.max(m, Math.abs(d[j]));
        env.push(m);
      }
      return { peak, rms, dur: last / SR, db: last ? 20 * Math.log10(rms) : -99, env,
               hot: last ? hot / (last + 1) : 0 };
    }
    const out = [];
    for (const [name, arg] of cases) {
      const on = await render(name, arg, false);
      const off = await render(name, arg, true);
      out.push({ name, arg: arg === undefined ? '' : String(arg), on, off });
    }
    return out;
  }, CASES);

  const bad = [];
  const HERO = ['stars', 'crack', 'rank', 'seal', 'reward', 'start', 'finish', 'go'];
  // the whole game has to actually be loud enough to hear on a phone at half
  // volume; anything the player must notice sits inside a 12 dB window
  const LOUD = -18, QUIET = -30;
  const MICRO = ['tap', 'key', 'tick'];              // deliberately under the action
  console.log('sound            peak   loudness  length   pinned  muted');
  console.log('──────────────────────────────────────────────────────────');
  for (const r of rows) {
    const lbl = (r.name + (r.arg ? '(' + r.arg + ')' : '')).padEnd(15);
    console.log(
      `${lbl} ${r.on.peak.toFixed(3).padStart(6)} ${(r.on.db.toFixed(1) + ' dB').padStart(9)}` +
      ` ${(r.on.dur.toFixed(2) + 's').padStart(7)}  ${(r.on.hot * 100).toFixed(1).padStart(5)}%` +
      `  ${r.off.peak.toFixed(3)}`
    );
    if (r.on.peak < 0.03) bad.push(`${lbl.trim()} is effectively silent (peak ${r.on.peak.toFixed(4)})`);
    // The tanh limiter cannot mathematically exceed 1.0; the 4x oversampling
    // filter rings about 0.4% past it, which is inaudible. What actually
    // matters is how long a sound sits pinned against the ceiling, because
    // that is what sounds crushed.
    if (r.on.peak > 1.02) bad.push(`${lbl.trim()} clips hard (peak ${r.on.peak.toFixed(3)})`);
    if (r.on.hot > 0.02)
      bad.push(`${lbl.trim()} rides the limiter for ${(r.on.hot * 100).toFixed(1)}% of its length — it will sound crushed`);
    if (r.on.dur < 0.025) bad.push(`${lbl.trim()} has no length (${r.on.dur.toFixed(3)}s)`);
    const maxLen = r.name === 'reward' ? 2.6 : 2.2;
    if (r.on.dur > maxLen) bad.push(`${lbl.trim()} drags on for ${r.on.dur.toFixed(2)}s`);
    if (r.off.peak > 0.0005) bad.push(`${lbl.trim()} still sounds when muted (${r.off.peak.toFixed(4)})`);
    // nothing the player needs to notice may sit more than ~10 dB under the heroes
    const floor = HERO.includes(r.name) ? -28 : MICRO.includes(r.name) ? -40 : -34;
    if (r.on.db < floor)
      bad.push(`${lbl.trim()} is buried at ${r.on.db.toFixed(1)} dB — it will be missed`);
    if (HERO.includes(r.name) && r.on.db < LOUD)
      bad.push(`${lbl.trim()} at ${r.on.db.toFixed(1)} dB is too quiet to carry a phone speaker`);
    if (!MICRO.includes(r.name) && r.on.db < QUIET)
      bad.push(`${lbl.trim()} at ${r.on.db.toFixed(1)} dB will be lost in a noisy room`);
  }

  // the round marker has to climb, or it is not telling you anything
  const climb = await page.evaluate(async () => {
    function goertzel(d, sr, f) {
      const k = 2 * Math.cos(2 * Math.PI * f / sr);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - k * s1 * s2)) / d.length;
    }
    const SR = 44100, R = 98, out = [];
    for (let hand = 1; hand <= 6; hand++) {
      const oc = new OfflineAudioContext(1, SR, SR); oc.resume = () => {};
      const g = Snd.build(oc, oc.destination);
      const kc = Snd.ctx, km = Snd.master; Snd.ctx = oc; Snd.master = g; P.mute = false;
      Snd.round(hand);
      const buf = await oc.startRendering();
      Snd.ctx = kc; Snd.master = km;
      const d = buf.getChannelData(0).slice(Math.floor(SR * 0.05), Math.floor(SR * 0.30));
      // which rung of the series is loudest
      let best = 0, bestN = 0;
      [2, 3, 4, 5, 6, 8].forEach(n => {
        const m = goertzel(d, SR, R * n);
        if (m > best) { best = m; bestN = n; }
      });
      out.push({ hand, rung: bestN, hz: Math.round(R * bestN) });
    }
    return out;
  });
  // the count-in has to rise, or three-two-one is just three noises
  const pips = await page.evaluate(async () => {
    function goertzel(d, sr, f) {
      const k = 2 * Math.cos(2 * Math.PI * f / sr);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - k * s1 * s2)) / d.length;
    }
    const SR = 44100, R = 98, out = [];
    for (const n of [3, 2, 1]) {
      const oc = new OfflineAudioContext(1, SR, SR); oc.resume = () => {};
      const g = Snd.build(oc, oc.destination);
      const kc = Snd.ctx, km = Snd.master; Snd.ctx = oc; Snd.master = g; P.mute = false;
      Snd.count(n);
      const buf = await oc.startRendering();
      Snd.ctx = kc; Snd.master = km;
      const d = buf.getChannelData(0).slice(Math.floor(SR * 0.02), Math.floor(SR * 0.25));
      let best = 0, bestN = 0;
      [2, 3, 4, 5, 6, 8].forEach(r => { const m = goertzel(d, SR, R * r);
        if (m > best) { best = m; bestN = r; } });
      out.push({ n, rung: bestN, hz: Math.round(R * bestN) });
    }
    return out;
  });
  console.log('\ncount-in rises: ' +
    pips.map(p => `"${p.n}" ${p.rung}x (${p.hz} Hz)`).join('  →  '));
  for (let i = 1; i < pips.length; i++)
    if (pips[i].rung <= pips[i - 1].rung)
      bad.push(`the count-in does not rise: "${pips[i].n}" is not above "${pips[i - 1].n}"`);

  console.log('\nround marker climbs the series:');
  console.log('  ' + climb.map(c => `hand ${c.hand} → ${c.rung}x (${c.hz} Hz)`).join('   '));
  for (let i = 1; i < climb.length; i++)
    if (climb[i].rung <= climb[i - 1].rung)
      bad.push(`the round marker does not rise: hand ${climb[i].hand} sits at ${climb[i].rung}x, ` +
               `hand ${climb[i - 1].hand} was ${climb[i - 1].rung}x`);

  // the money sound must actually grow with the money
  // the reward must be anticipation -> hold -> resolution, not one undifferentiated
  // blob: there has to be a real dip in energy just before the payoff lands
  const rw = rows.find(r => r.name === 'reward' && r.arg === '2500');
  if (rw) {
    console.log('\nreward shape: ' + rw.on.env.map(v => '▁▂▃▄▅▆▇█'[Math.min(7, Math.round(v / rw.on.peak * 7))]).join(''));
    const peakAt = rw.on.env.indexOf(Math.max(...rw.on.env));
    const win = rw.on.env.slice(Math.max(0, peakAt - 5), peakAt);
    const dip = win.length ? Math.min(...win) : rw.on.peak;
    if (!(dip < rw.on.peak * 0.55))
      bad.push(`the reward has no hold before the payoff (dips only to ${(dip / rw.on.peak * 100).toFixed(0)}%)`);
    else console.log(`  anticipation dips to ${(dip / rw.on.peak * 100).toFixed(0)}% of peak before the release`);
  }

  /* ── is it actually harmonic? ──
     "Harmonic" is measurable, not a matter of taste: the energy should sit on
     integer multiples of one fundamental and nowhere in between. Goertzel at
     each partial, then at deliberately off-series frequencies, and compare. */
  const spec = await page.evaluate(async () => {
    function goertzel(d, sr, f) {
      const k = 2 * Math.cos(2 * Math.PI * f / sr);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - k * s1 * s2)) / d.length;
    }
    async function grab(name) {
      const SR = 44100, oc = new OfflineAudioContext(1, SR * 3, SR);
      oc.resume = () => {};
      const g = Snd.build(oc, oc.destination);
      const kc = Snd.ctx, km = Snd.master, kmu = P.mute;
      Snd.ctx = oc; Snd.master = g; P.mute = false;
      Snd[name]();
      const buf = await oc.startRendering();
      Snd.ctx = kc; Snd.master = km; P.mute = kmu;
      // measure over the sustained middle, past the attack transients
      return buf.getChannelData(0).slice(Math.floor(SR * 0.40), Math.floor(SR * 1.05));
    }
    const R = 98, SR = 44100;
    const out = {};
    for (const name of ['start', 'finish']) {
      const d = await grab(name);
      const partials = [1, 2, 3, 4, 5, 6, 8].map(n => ({ n, mag: goertzel(d, SR, R * n) }));
      // probes that are deliberately NOT in the series
      const between = [1.37, 2.63, 4.41, 6.72, 7.29]
        .map(r => ({ r, mag: goertzel(d, SR, R * r) }));
      out[name] = { partials, between };
    }
    return out;
  });

  for (const [name, r] of Object.entries(spec)) {
    const hMax = Math.max(...r.partials.map(p => p.mag));
    const bMax = Math.max(...r.between.map(p => p.mag));
    const ratio = bMax > 0 ? hMax / bMax : Infinity;
    const bars = r.partials.map(p =>
      `${p.n}x ${'█'.repeat(Math.max(1, Math.round(p.mag / hMax * 8)))}`).join('  ');
    console.log(`\n${name}: fundamental 98 Hz`);
    console.log(`  ${bars}`);
    console.log(`  strongest off-series tone is ${(20 * Math.log10(bMax / hMax)).toFixed(1)} dB down`);
    // every named partial has to actually be present…
    const weak = r.partials.filter(p => p.mag < hMax * 0.02).map(p => p.n + 'x');
    if (weak.length) bad.push(`${name}: partial(s) ${weak.join(', ')} never sounded`);
    // …and nothing may be sitting between them
    if (ratio < 4) bad.push(`${name} is not harmonic — off-series energy is only ${ratio.toFixed(1)}x down`);
  }
  const s = rows.filter(r => r.name === 'stars');
  console.log(`\nstars scales: ${s.map(x => x.arg + '→' + x.on.dur.toFixed(2) + 's').join('  ')}`);
  if (!(s[0].on.dur < s[1].on.dur && s[1].on.dur < s[2].on.dur))
    bad.push('the money sound does not get longer as the money gets bigger');

  console.log('\n--- problems ---');
  console.log(bad.length || errs.length ? [...errs, ...bad].map(x => '  ' + x).join('\n') : '  none');
  await browser.close();
  process.exit(bad.length + errs.length ? 1 : 0);
})();
