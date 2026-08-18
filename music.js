/* The bed is generated, so it can be rendered offline exactly as a player hears
   it: same voices, same limiter, same make-up. Checks that it is actually
   music (it loops, it changes chord, it has a pulse), that it sits under the
   effects rather than over them, that it ducks, and that mute means mute. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const passGate = require('./gate');
const path = 'file://' + __dirname + '/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);
  page.on('pageerror', e => bad('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') bad('CONSOLE ' + m.text()); });
  await page.goto(path);
  await passGate(page);
  await page.waitForSelector('#hnd');

  console.log('\n0. every track, rendered end to end');
  const all = await page.evaluate(async () => {
    const SR = 44100, out = [];
    for (let ti = 0; ti < Mus.TRACKS.length; ti++) {
      const T = Mus.TRACKS[ti], spb = 60 / T.bpm, bar = spb * 4;
      const oc = new OfflineAudioContext(1, Math.ceil(SR * (bar * T.bars + 2)), SR);
      oc.resume = () => {};
      const bus = Snd.build(oc, oc.destination);
      const g = oc.createGain(); g.gain.value = Mus.level; g.connect(bus);
      for (let i = 0; i < T.bars; i++) Mus.barAt(oc, g, i, 0.2 + i * bar, ti);
      const buf = await oc.startRendering();
      const d = buf.getChannelData(0);
      // energy per bar, so a build and a drop are visible as numbers
      const bars = [];
      for (let i = 0; i < T.bars; i++) {
        let s = 0, n = 0;
        for (let j = Math.floor((0.2 + i * bar) * SR); j < Math.floor((0.2 + (i + 1) * bar) * SR); j++) {
          s += d[j] * d[j]; n++;
        }
        bars.push(Math.sqrt(s / n));
      }
      let peak = 0, sum = 0;
      for (const x of d) { const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
      out.push({ id: T.id, n: T.n, bpm: T.bpm, mood: T.mood, nbars: T.bars, bars,
                 peak, db: 20 * Math.log10(Math.sqrt(sum / d.length)) });
    }
    return out;
  });
  for (const t of all) {
    const hi = Math.max(...t.bars);
    const spark = t.bars.map(v => '▁▂▃▄▅▆▇█'[Math.min(7, Math.round(v / hi * 7))]).join('');
    console.log(`   · ${t.n.padEnd(12)} ${String(t.bpm).padStart(3)} bpm  ${t.mood.padEnd(5)} ` +
      `${t.db.toFixed(1)} dB  ${spark}`);
    if (t.peak > 0.99) bad(`${t.n} peaks at ${t.peak.toFixed(3)}`);
    if (t.db < -34) bad(`${t.n} rendered too quiet to hear (${t.db.toFixed(1)} dB)`);
    if (t.db > -16) bad(`${t.n} at ${t.db.toFixed(1)} dB is too loud to think over`);
  }
  // the drop track has to actually drop: the bar before it must be the quietest
  // and the bar after it near the loudest
  const surge = all.find(t => t.id === 'surge');
  if (surge) {
    const hush = surge.bars[7], drop = surge.bars[8], quietest = Math.min(...surge.bars);
    const loudest = Math.max(...surge.bars);
    if (hush !== quietest) bad('the bar before the drop is not the quietest bar in SURGE');
    else if (drop < loudest * 0.85) bad('the drop is not one of the loudest bars');
    else ok(`SURGE drops properly: bar 8 is ${(drop / hush).toFixed(1)}x the bar before it`);
  }

  console.log('\n1. the default loop, rendered');
  const r = await page.evaluate(async () => {
    Mus.track = 0;                       // measure DEEP specifically
    const SR = 44100;
    async function render(bars, from) {
      const spb = 60 / Mus.cur().bpm, bar = spb * 4;
      const oc = new OfflineAudioContext(1, Math.ceil(SR * bar * bars) + SR, SR);
      oc.resume = () => {};
      const bus = Snd.build(oc, oc.destination);
      const g = oc.createGain(); g.gain.value = Mus.level; g.connect(bus);
      for (let i = 0; i < bars; i++) Mus.barAt(oc, g, (from || 0) + i, 0.05 + i * bar);
      const buf = await oc.startRendering();
      return Array.from(buf.getChannelData(0));
    }
    const loopA = await render(8, 0);
    const loopB = await render(8, 8);          // the next time round
    const oneBar = await render(1, 0);
    const spb = 60 / Mus.cur().bpm;
    return { loopA, loopB, oneBar, spb, bpm: Mus.cur().bpm, level: Mus.level,
             chords: Mus.cur().ch.length, name: Mus.cur().n };
  });

  const stats = d => {
    let peak = 0, sum = 0;
    for (const x of d) { const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
    const rms = Math.sqrt(sum / d.length);
    return { peak, rms, db: 20 * Math.log10(rms) };
  };
  const A = stats(r.loopA), B = stats(r.loopB);
  console.log(`   · ${r.name}: ${r.bpm} BPM, ${r.chords} chords, 8-bar loop ` +
    `(${(r.spb * 4 * 8).toFixed(1)}s) at ${A.db.toFixed(1)} dB, peak ${A.peak.toFixed(3)}`);
  if (A.peak > 0.99) bad(`the bed peaks at ${A.peak.toFixed(3)} — it will crush the effects`);
  if (A.rms < 0.005) bad('the bed rendered essentially silent');

  // it has to actually loop: bar 8 must be the same material as bar 0
  const diff = Math.abs(A.db - B.db);
  if (diff > 1.5) bad(`the loop does not repeat cleanly (${A.db.toFixed(1)} vs ${B.db.toFixed(1)} dB)`);
  else ok(`the loop comes round: pass two is within ${diff.toFixed(2)} dB of pass one`);

  console.log('\n2. it is music, not a drone');
  // a pulse: energy per beat should rise and fall, not sit flat
  const beats = [];
  const SR = 44100, n = Math.floor(r.spb * SR);
  for (let b = 0; b < 32; b++) {
    const seg = r.loopA.slice(Math.floor(0.05 * SR) + b * n, Math.floor(0.05 * SR) + (b + 1) * n);
    if (seg.length) beats.push(stats(seg).rms);
  }
  const lo = Math.min(...beats), hi = Math.max(...beats);
  if (hi / lo < 1.15) bad(`no dynamics across the bar — ${(hi / lo).toFixed(2)}x, that is a drone`);
  else ok(`it breathes: ${(hi / lo).toFixed(2)}x between the quietest and loudest beat`);

  // and the chord actually changes: measure the root of bar 0 against bar 2
  const roots = await page.evaluate(async () => {
    function goertzel(d, sr, f) {
      const k = 2 * Math.cos(2 * Math.PI * f / sr);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - k * s1 * s2)) / d.length;
    }
    const SR = 44100, spb = 60 / Mus.cur().bpm, bar = spb * 4, out = [];
    for (const b of [0, 2, 4, 6]) {
      const oc = new OfflineAudioContext(1, Math.ceil(SR * bar) + SR, SR); oc.resume = () => {};
      const bus = Snd.build(oc, oc.destination);
      const g = oc.createGain(); g.gain.value = Mus.level; g.connect(bus);
      Mus.barAt(oc, g, b, 0.05);
      const buf = await oc.startRendering();
      const d = buf.getChannelData(0).slice(Math.floor(SR * 0.5), Math.floor(SR * 1.6));
      const cands = Mus.cur().ch.map(c => c.s);
      let best = 0, bestF = 0;
      cands.forEach(f => { const m = goertzel(d, SR, f); if (m > best) { best = m; bestF = f; } });
      out.push({ bar: b, root: Math.round(bestF) });
    }
    return out;
  });
  const uniq = new Set(roots.map(x => x.root));
  console.log('   · roots by bar: ' + roots.map(x => `${x.bar}→${x.root}Hz`).join('  '));
  if (uniq.size < 3) bad(`only ${uniq.size} distinct chord roots across the loop — it is a vamp, not a progression`);
  else ok(`${uniq.size} distinct chord roots across the eight bars`);

  console.log('\n3. it stays under the game');
  const sfx = await page.evaluate(async () => {
    const SR = 44100, oc = new OfflineAudioContext(1, SR * 3, SR); oc.resume = () => {};
    const g = Snd.build(oc, oc.destination);
    const kc = Snd.ctx, km = Snd.master; Snd.ctx = oc; Snd.master = g; P.mute = false;
    Snd.stars(3000);
    const buf = await oc.startRendering();
    Snd.ctx = kc; Snd.master = km;
    const d = buf.getChannelData(0);
    let sum = 0, last = 0;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.0008) last = i;
    for (let i = 0; i <= last; i++) sum += d[i] * d[i];
    return 20 * Math.log10(Math.sqrt(sum / (last + 1)));
  });
  const head = sfx - A.db;
  console.log(`   · money lands at ${sfx.toFixed(1)} dB, the bed sits at ${A.db.toFixed(1)} dB`);
  if (head < 8) bad(`only ${head.toFixed(1)} dB between the music and the money — the bed is too loud to think over`);
  else if (head > 22) bad(`${head.toFixed(1)} dB down, nobody will hear the music at all`);
  else ok(`${head.toFixed(1)} dB of headroom — present, but never in the way`);

  console.log('\n4. the controls');
  const ctl = await page.evaluate(() => {
    const out = {};
    P.mute = false; P.noMusic = false; out.onByDefault = Mus.wanted();
    P.noMusic = true;                 out.musicOff = Mus.wanted();
    P.noMusic = false; P.mute = true; out.allMuted = Mus.wanted();
    P.mute = false;
    return out;
  });
  if (!ctl.onByDefault) bad('music is off by default');
  if (ctl.musicOff) bad('turning the music off did not turn it off');
  if (ctl.allMuted) bad('the master mute does not silence the music');
  ok('music toggle and master mute both reach it');

  // rotation must not repeat, and must never hand you the banger unasked
  const rot = await page.evaluate(() => {
    P.track = 'auto'; Mus.forced = null; Mus.order = []; Mus.oi = 0;
    const seen = [];
    for (let i = 0; i < 12; i++) seen.push(Mus.TRACKS[Mus.choose()].id);
    let repeat = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) repeat++;
    Mus.forced = 'surge';
    const forced = Mus.TRACKS[Mus.choose()].id;
    Mus.forced = null;
    return { seen, repeat, forced, hype: seen.filter(x => x === 'surge').length };
  });
  console.log('   · rotation: ' + rot.seen.join(' → '));
  if (rot.repeat) bad(`the rotation played the same track twice running ${rot.repeat} time(s)`);
  if (rot.hype) bad('shuffle handed out the drop track unasked');
  if (rot.forced !== 'surge') bad(`a speed table got "${rot.forced}" instead of SURGE`);
  else ok('shuffle never repeats and never picks the banger; a speed table forces it');

  // the profile has to expose it
  await page.fill('#hnd', 'VIV'); await page.click('#go2');
  await page.waitForSelector('#cash');
  await page.click('#meBtn'); await page.waitForSelector('#pmus');
  await page.click('#pmus');
  if (!await page.evaluate(() => P.noMusic)) bad('the profile music switch does nothing');
  else ok('the switch is in the profile, next to the sound one');
  await page.click('#pmus');

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
