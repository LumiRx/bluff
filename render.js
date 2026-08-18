/* Renders the bed and the effects to real audio files, through the exact chain
   the game plays them through, so they can be listened to instead of described.
   Writes 16-bit WAV; ffmpeg turns them into mp3 afterwards. */
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const passGate = require('./gate');
const fs = require('fs');

const SR = 44100;

function wav(samples, sr) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + __dirname + '/index.html');
  await passGate(page);
  await page.waitForSelector('#hnd');
  await page.evaluate(() => { if (typeof Mus !== 'undefined') Mus.stop(); });

  // ── every track, two passes each, with a duck near the end of the calm ones
  //    so you can hear what a payout does to them
  const tracks = await page.evaluate(() => Mus.TRACKS.map(t => ({ id: t.id, n: t.n })));
  for (let ti = 0; ti < tracks.length; ti++) {
    console.log(`rendering ${tracks[ti].n}…`);
    const d = await page.evaluate(async (ti) => {
      const SR = 44100, T = Mus.TRACKS[ti], spb = 60 / T.bpm, bar = spb * 4;
      const BARS = T.bars * 2;
      const oc = new OfflineAudioContext(1, Math.ceil(SR * (bar * BARS + 2.5)), SR);
      oc.resume = () => {};
      const bus = Snd.build(oc, oc.destination);
      const g = oc.createGain(); g.gain.value = Mus.level; g.connect(bus);
      for (let i = 0; i < BARS; i++) Mus.barAt(oc, g, i, 0.2 + i * bar, ti);
      if (T.mood !== 'hype') {
        [BARS - 6, BARS - 2].forEach(b => {
          const t = 0.2 + b * bar;
          g.gain.setValueAtTime(Mus.level, t);
          g.gain.linearRampToValueAtTime(Mus.level * 0.28, t + 0.05);
          g.gain.linearRampToValueAtTime(Mus.level, t + 0.75);
        });
      }
      const buf = await oc.startRendering();
      return Array.from(buf.getChannelData(0));
    }, ti);
    fs.writeFileSync(`bluff-${tracks[ti].id}.wav`, wav(d, SR));
    console.log(`  ${(d.length / SR).toFixed(1)}s`);
  }

  // ── the effects, in the order a hand actually produces them
  console.log('rendering the effects…');
  const CUES = [
    ['start', undefined, 2.2], ['round', 1, 1.0], ['chime', undefined, 1.4],
    ['count', 3, 0.5], ['count', 2, 0.5], ['count', 1, 0.5], ['go', undefined, 1.6],
    ['key', undefined, 0.16], ['key', undefined, 0.16], ['key', undefined, 0.16],
    ['tile', 'm', 0.22], ['tile', 'n', 0.22], ['tile', 'h', 0.22], ['tile', 'm', 0.22],
    ['tile', 'h', 0.9],
    ['chip', undefined, 0.5], ['no', undefined, 0.8], ['fold', undefined, 1.0],
    ['crack', undefined, 1.6], ['bust', undefined, 1.2], ['spark', undefined, 0.9],
    ['warn', undefined, 0.8], ['tick', undefined, 0.35], ['tick', undefined, 0.35],
    ['tick', undefined, 0.9],
    ['stars', 900, 1.6], ['pay', 0, 0.9], ['reward', 4000, 2.6],
    ['rank', true, 1.6], ['seal', undefined, 1.2], ['finish', undefined, 2.4]
  ];
  const sfx = await page.evaluate(async (cues) => {
    const SR = 44100;
    const total = cues.reduce((a, c) => a + c[2], 0.4);
    const oc = new OfflineAudioContext(1, Math.ceil(SR * total), SR);
    oc.resume = () => {};
    const g = Snd.build(oc, oc.destination);
    const kc = Snd.ctx, km = Snd.master, kmu = P.mute;
    Snd.ctx = oc; Snd.master = g; P.mute = false;
    // schedule every cue in one render by offsetting each call's `at`
    let t = 0.2;
    for (const [name, arg, gap] of cues) {
      const shift = t;
      const tone = Snd.tone.bind(Snd), noise = Snd.noise.bind(Snd), harm = Snd.harm.bind(Snd);
      Snd.tone = o => tone(Object.assign({}, o, { at: (o.at || 0) + shift }));
      Snd.noise = o => noise(Object.assign({}, o, { at: (o.at || 0) + shift }));
      Snd.harm = o => harm(Object.assign({}, o, { at: (o.at || 0) + shift }));
      arg === undefined ? Snd[name]() : Snd[name](arg);
      Snd.tone = tone; Snd.noise = noise; Snd.harm = harm;
      t += gap;
    }
    const buf = await oc.startRendering();
    Snd.ctx = kc; Snd.master = km; P.mute = kmu;
    return Array.from(buf.getChannelData(0));
  }, CUES);
  fs.writeFileSync('bluff-sounds.wav', wav(sfx, SR));
  console.log(`  ${(sfx.length / SR).toFixed(1)}s, ${CUES.length} cues`);

  await browser.close();
})();
