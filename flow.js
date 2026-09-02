/* A walk through the whole game the way a player meets it: every screen, every
   button, in and back out again. Anything that leaves you stranded, throws, or
   silently does nothing is a bug even if the maths underneath is perfect.
   The sound hooks are counted rather than heard -- if a moment is supposed to
   make a noise, this proves the call actually got reached. */
const { chromium } = require('playwright');
const passGate = require('./gate');
const path = 'file://' + __dirname + '/index.html';

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const bad = m => { errs.push(m); console.log('   ✗ ' + m); };
  const ok = m => console.log('   · ' + m);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // The daily server is link.js's business and friends.js owns the two-player
  // flow — but adding a friend now checks that the handle belongs to somebody,
  // so this stub answers that one call and refuses the rest. Refusing
  // everything would make the friends section untestable here; answering
  // everything would duplicate friends.js.
  await ctx.addInitScript(() => {
    window.fetch = (url, opts) => {
      const u = String(url);
      const reply = o => Promise.resolve(new Response(JSON.stringify(o),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (u.includes('/v1/player/lookup'))
        return reply({ found: decodeURIComponent((u.split('handles=')[1] || '')).split(',') });
      if (u.includes('/v1/player/claim'))
        return reply({ ok: true, handle: (JSON.parse(opts.body).handle), yours: true });
      return Promise.reject(new Error('offline'));
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => bad('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') bad('CONSOLE ' + m.text()); });

  const at = s => page.locator(s).count().then(n => n > 0);
  async function overflow(where) {
    const o = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 0) bad(`${where}: ${o}px of horizontal overflow`);
  }
  // click something, expect a landmark, and expect a way back out
  async function hop(label, click, landmark, back) {
    await page.click(click);
    try { await page.waitForSelector(landmark, { timeout: 4000 }); }
    catch (e) { return bad(`${label}: ${click} never reached ${landmark}`); }
    await overflow(label);
    if (back) {
      if (!await at(back)) return bad(`${label} is a dead end — no ${back}`);
      await page.click(back);
      try { await page.waitForSelector('#cash', { timeout: 4000 }); }
      catch (e) { return bad(`${label}: could not get home again`); }
    }
    ok(label);
  }

  await page.goto(path);
  await passGate(page);
  await page.waitForSelector('#hnd');
  await overflow('handle screen');

  console.log('\n1. getting in');
  await page.fill('#hnd', 'A'); await page.click('#go2');
  if (!await at('#hnd')) bad('a one-character handle was accepted');
  else ok('a one-character handle is refused');
  await page.fill('#hnd', 'MAVE'); await page.click('#go2');
  if (!await at('#hnd')) bad('a handle that collides with a regular was accepted');
  else ok('a handle already used by a regular is refused');
  await page.fill('#hnd', 'VIV'); await page.click('#go2');
  await page.waitForSelector('#cash');
  ok('handle accepted, home reached');
  await overflow('home');

  console.log('\n2. every door on the home screen');
  await hop('rules book', '#howto', '#ovC', '.btn');
  await page.waitForSelector('#cash');
  await hop('profile behind your name', '#meBtn', '#wipe', '#bk');
  await hop('store', '#store', '.cosgrid', '#bk');
  /* v1.0 ships with no way to spend money. A price tag whose button does nothing
     is an App Review rejection and a lie to the player, so the shelf stays empty
     until StoreKit is real — this asserts it stayed empty. */
  await page.click('#store'); await page.waitForSelector('.cosgrid');
  if (await at('.packs')) bad('the store is offering star packs with no checkout behind them');
  else ok('no purchasable packs on the shelf');
  await page.click('#bk'); await page.waitForSelector('#cash');
  await hop('invite / table code', '#invite', '#qr', '#bk');
  await hop('friends', '#fri', '#fadd', '#bk');
  await hop('the ladder', '#lead', '#t1', '#bk');
  if (await at('#chestBtn')) await hop('prize chest', '#chestBtn', '#claim', '#bk');
  else ok('no chest yet, nothing to open');

  console.log('\n3. the three boards');
  await page.click('#lead'); await page.waitForSelector('#t1');
  for (const [tab, label] of [['#t1', 'ladder'], ['#t2', 'daily'], ['#t3', 'friends']]) {
    await page.click(tab); await page.waitForTimeout(150);
    const n = await page.locator('.board .lrow').count();
    if (!n) bad(`${label} board rendered no rows`);
    else ok(`${label} board: ${n} rows`);
    await overflow(label + ' board');
  }
  // friends tab with nobody added should still show you, and offer a way to add
  if (!await at('#addf')) bad('friends board offers no way to add a friend');
  await page.click('#addf'); await page.waitForSelector('#fadd');

  console.log('\n4. friends and a challenge');
  await page.fill('#fn', 'VIV'); await page.click('#fadd');
  if (await page.locator('.fr').count()) bad('you were allowed to add yourself');
  else ok('you cannot add yourself');
  for (const h of ['MAVE', 'ODDS']) { await page.fill('#fn', h); await page.click('#fadd'); await page.waitForTimeout(120); }
  await page.fill('#fn', 'MAVE'); await page.click('#fadd');
  const nf = await page.locator('.fr').count();
  if (nf !== 2) bad(`friend list has ${nf} entries, expected 2 (duplicate slipped in?)`);
  else ok('two friends added, duplicate refused');

  const who = await page.locator('.fr').first().getAttribute('data-h');
  await page.click('.fr'); await page.waitForSelector('#dgo');
  await overflow('challenge');
  const duel = await page.evaluate(h => ({
    who: h,
    shown: document.querySelector('.code').textContent.trim(),
    derivedA: challengeCode('VIV', h),
    derivedB: challengeCode(h, 'VIV')
  }), who);
  if (duel.shown !== duel.derivedA || duel.derivedA !== duel.derivedB)
    bad(`challenge codes disagree: shown ${duel.shown}, VIV→${who} ${duel.derivedA}, ${who}→VIV ${duel.derivedB}`);
  else ok(`both players derive the same table (${duel.shown} vs ${who}) without exchanging anything`);

  // that table must actually deal
  await page.click('#dgo');
  await page.waitForFunction(() => S.seats && S.seats.length === 6, null, { timeout: 8000 });
  const codeSet = await page.evaluate(() => S.code);
  if (codeSet !== duel.shown) bad(`challenge started table ${codeSet}, not ${duel.shown}`);
  else ok('the challenge deals its own table');

  console.log('\n5. a full hand, with the sound hooks counted');
  await page.evaluate(() => {
    window._snd = {};
    // count the named sounds, leave the synthesis primitives alone
    Object.keys(Snd).filter(k => typeof Snd[k] === 'function' &&
      !['boot', 'arm', 'ready', 'tone', 'noise', 'wave', 'harm'].includes(k)).forEach(k => {
        const f = Snd[k].bind(Snd);
        Snd[k] = function (...a) { window._snd[k] = (window._snd[k] || 0) + 1; return f(...a); };
      });
  });
  // restart into a cash game so the run is clean
  await page.evaluate(() => startMatch('cash'));

  let sawWordCard = 0, sawFold = 0, sawPlay = 0;
  for (let hand = 0; hand < 6; hand++) {
    if (await at('#pickBtn')) {
      await page.locator('.wcard').nth(0).click();
      await page.click('#pickBtn'); await page.waitForSelector('#tellBtn');
      await page.evaluate(() => {
        const o = S.tellOpts, e = [...document.querySelectorAll('.tell')];
        let bi = 0, best = -1; o.forEach((t, i) => { if (t.n <= 200 && t.n > best) { best = t.n; bi = i; } });
        e[bi].click();
      });
      await page.click('#tellBtn'); await page.waitForSelector('#goBtn');
      await page.evaluate(() => { const s = [...document.querySelectorAll('.stk:not(.off)')]; s[s.length - 1].click(); });
      await page.click('#goBtn');
    } else {
      await page.waitForSelector('#callB', { timeout: 25000 });
      if (hand === 1) { await page.click('#foldB'); sawFold++; }
      else {
        await page.click('#callB'); sawPlay++;
        if (sawPlay <= 2) {
          // the count-in has to be on screen, and has to actually count
          const seen = [];
          // one atomic read of both, or a poll can land between GO appearing
          // and the phase flipping and miss it
          for (let t = 0; t < 45; t++) {
            const v = await page.evaluate(() => {
              const el = document.getElementById('cd');
              return { t: el && el.classList.contains('on') ? el.textContent.trim() : '',
                       playing: S.phase === 'play' };
            });
            if (v.t && seen[seen.length - 1] !== v.t) seen.push(v.t);
            if (v.playing && seen.indexOf('GO') > -1) break;
            await page.waitForTimeout(70);
          }
          if (seen.join(' ') !== '3 2 1 GO')
            bad(`the count-in showed "${seen.join(' ')}" instead of "3 2 1 GO"`);
          else if (sawPlay === 1) ok('count-in on screen: 3 · 2 · 1 · GO, then the keyboard');
          if (sawPlay === 2) {
            // and it must be escapable for anyone who has seen it enough.
            // This probe fires its own sounds, so the counters are put back
            // afterwards — a test should not show up in its own numbers.
            // ...and the phase too. The probe forces S.phase to drive countIn,
            // and if the hand's own count-in had already handed over by then,
            // leaving it forced strands the game in a phase it has left.
            const snap = await page.evaluate(() => JSON.stringify(
              { snd: window._snd, phase: S.phase }));
            const skipped = await page.evaluate(() => new Promise(res => {
              const t0 = Date.now();
              S.phase = 'action';
              countIn(() => res(Date.now() - t0));
              setTimeout(() => dispatchEvent(new PointerEvent('pointerdown')), 120);
            }));
            // if the hand's own count-in handed over while the probe ran, the
            // board exists and the phase must be 'play' — restoring the older
            // snapshot would strand the hand in a phase it has left
            await page.evaluate(b => { const s = JSON.parse(b);
              window._snd = s.snd;
              S.phase = document.getElementById('board') ? 'play' : s.phase; }, snap);
            if (skipped > 700) bad(`tapping through the count-in took ${skipped}ms — it did not skip`);
            else ok(`the count-in can be tapped through (${skipped}ms)`);
          }
        }
        // phasePlay sets S.phase on its first line and writes #board after, so
        // waiting on the phase and then looking for the board races it — and
        // losing that race silently skips the guessing and hangs the hand
        await page.waitForFunction(
          /* the board element is created a beat before S.phase flips to
             'play', and press() drops every key until it does — waiting on the
             element alone is the race that made this suite flaky */
          () => (document.getElementById('board') && S.phase === 'play')
                || S.phase === 'showdown',
          null, { timeout: 20000 });
        if (await at('#board')) {
          if (hand === 2) {
            // a rubbish word must be refused, and the row must still be editable
            // after. The row is as wide as the hand now, so fill it exactly.
            const L = await page.evaluate(() => S.word.length);
            for (let i = 0; i < L; i++) await page.keyboard.press('Z');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);
            if (await page.evaluate(() => S.seats[0].guesses.length))
              bad('a string that is not a word was accepted as a guess');
            for (let i = 0; i < L + 2; i++) await page.keyboard.press('Backspace');
            if (await page.evaluate(() => S.cur.length))
              bad('backspace could not clear a refused word — the player would be stuck');
            else ok('a refused word can be backspaced away');
          }
          await page.evaluate(() => { window._p = S.pool.slice(); });
          for (let g = 0; g < 4; g++) {
            if (await page.evaluate(() => S.seats[0].cracked || S.seats[0].guesses.length >= GUESSES)) break;
            const w = await page.evaluate(() => {
              const me = S.seats[0];
              if (me.guesses.length) {
                const lg = me.guesses[me.guesses.length - 1], lm = me.marks[me.marks.length - 1];
                window._p = window._p.filter(x => consistent(x, lg, lm));
              }
              const tried = new Set(me.guesses);
              const live = window._p.filter(x => !tried.has(x));
              return live.length ? live[0]
                                 : DECKS[S.word.length].find(x => !tried.has(x));
            });
            // a guess is checked against the word list now, so a refused one
            // leaves a full row and every later keystroke is ignored — which
            // used to hang the hand instead of saying anything
            if (!w) { bad(`nothing left to guess on hand ${hand + 1}`); break; }
            const before = await page.evaluate(() => S.seats[0].guesses.length);
            for (const c of w) await page.keyboard.press(c);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(600);
            if (await page.evaluate(b => S.seats[0].guesses.length === b, before)) {
              bad(`the game refused the guess ${w} on hand ${hand + 1}`);
              await page.evaluate(() => { S.cur = ''; paintRow(); });
              break;
            }
          }
        }
      }
    }
    try { await page.waitForSelector('#ov.on #nx', { timeout: 40000 }); }
    catch (e) {
      const st = await page.evaluate(() => ({
        phase: S.phase, settling: !!S.settling, row: S.row, cur: S.cur,
        word: S.word, mine: S.seats[0].guesses,
        seats: S.seats.map(x => x.name + ':' + x.state + ':' + x.guesses.length +
          (x.cracked ? ':cracked' : ''))
      }));
      bad(`hand ${hand + 1} never finished — ${JSON.stringify(st)}`);
      break;
    }
    if (await page.locator('#ovC .wdef').count()) sawWordCard++;
    await overflow('showdown ' + (hand + 1));
    await page.click('#nx');
    if (hand === 5) {
      // the last hand pays out on the table before any numbers appear
      try {
        await page.waitForSelector('.chip.star', { timeout: 4000 });
        const seen = await page.evaluate(() => ({
          stars: document.querySelectorAll('.chip.star').length,
          big: document.querySelectorAll('.chip.star.big').length,
          lit: document.querySelectorAll('.seat.paid').length
        }));
        ok(`payout: ${seen.stars} stars in flight, ${seen.big} of them the top share, ` +
           `${seen.lit} seat(s) lit up`);
        if (!seen.lit) bad('stars flew but no seat was marked as being paid');
      } catch (e) { bad('the match ended with no stars going anywhere'); }
    }
    await page.waitForTimeout(350);
  }
  await page.waitForSelector('#ov.on #again', { timeout: 25000 });

  if (sawWordCard !== 6) bad(`the word was taught on ${sawWordCard} of 6 showdowns`);
  else ok('every showdown teaches the word — how to say it and what it means');

  const snd = await page.evaluate(() => window._snd);
  const must = { round: 'a hand starting', chime: 'the price being named',
    count: 'the count-in', go: 'the bell that starts a hand',
    chip: 'chips going in', tile: 'letters turning over',
    key: 'typing', fold: 'laying one down', no: 'a word that is not a word',
    stars: 'money landing', tap: 'buttons' };
  if ((snd.round || 0) < 6) bad(`only ${snd.round} of 6 hands were marked out loud`);
  // three pips and one bell for every hand the player actually called
  if ((snd.count || 0) !== (snd.go || 0) * 3)
    bad(`count-in is uneven: ${snd.count} pips against ${snd.go} bells (expected 3 per bell)`);
  if ((snd.go || 0) < 1) bad('no hand was ever counted in');
  if (!(snd.stars || snd.reward)) bad('money never landed in a whole match');
  if (!snd.start) bad('the match started in silence');
  if (!snd.finish) bad('the match ended in silence');
  if (!(snd.reward || snd.pay)) bad('nobody was paid out loud');
  Object.entries(must).forEach(([k, what]) => {
    if (!snd[k]) bad(`nothing sounds for ${what} (Snd.${k} never fired)`);
  });
  ok('sounds fired: ' + Object.entries(snd).map(([k, v]) => `${k}×${v}`).join(' '));
  if (!(snd.crack || snd.bust)) bad('neither cracking nor busting made a sound');

  // and when the winner is you, the full reward plays instead of a polite ping
  const win = await page.evaluate(() => new Promise(res => {
    window._snd.reward = 0; window._snd.pay = 0;
    runPayout([{ i: 0, you: true, chips: 1900, name: 'YOU' },
               { i: 1, chips: 1100, name: 'X' },
               { i: 2, chips: 400, name: 'Y' }],
      () => res({ reward: window._snd.reward, pay: window._snd.pay, flagged: !!S.rewarded }));
  }));
  if (!win.reward || !win.flagged) bad(`finishing ahead did not fire the reward (${JSON.stringify(win)})`);
  else ok(`when you win: reward ×${win.reward}, other winners get ×${win.pay} — and the summary knows not to pay you twice`);

  const chips = await page.evaluate(() => S.seats.reduce((a, s) => a + s.chips, 0));
  if (chips !== 6000) bad(`chips leaked: table holds ${chips}, should hold 6000`);
  else ok('every star accounted for at the end of the match');

  console.log('\n6. out of the summary');
  await page.click('#sh'); await page.waitForSelector('#cp');
  await overflow('share sheet');
  await page.click('#bk');
  try { await page.waitForSelector('#again', { timeout: 4000 });
        ok('share sheet returns you to your summary, not somewhere else'); }
  catch (e) { bad('leaving the share sheet does not land back on the summary'); }
  await page.click('#lb'); await page.waitForSelector('#t1');
  ok('the summary can reach the ladder');
  await page.click('#bk'); await page.waitForSelector('#cash');
  ok('and the ladder gets you home');

  console.log('\n7. muting silences it');
  if (await page.evaluate(() => {
    const b = document.getElementById('sndBtn'), o = document.getElementById('ov');
    return b && o && o.classList.contains('on');
  })) ok('the header toggle is behind the menu — the reachable one is on the home screen');
  await page.click('#hsnd');
  const muted = await page.evaluate(() => {
    window._snd2 = 0;
    const before = P.mute;
    const c = Snd.ready();
    return { mute: P.mute, ready: c === null, before };
  });
  if (!muted.mute || !muted.ready) bad('the mute button did not actually silence the engine');
  else ok('mute stops every sound at the source');
  await page.click('#hsnd');
  if (await page.evaluate(() => P.mute)) bad('unmute did not stick');
  else ok('and unmute brings it back');
  // and the same switch must be findable in the profile
  await page.click('#meBtn'); await page.waitForSelector('#psnd');
  await page.click('#psnd');
  const viaProfile = await page.evaluate(() => P.mute);
  await page.click('#psnd');
  if (!viaProfile || await page.evaluate(() => P.mute)) bad('the profile sound switch does not work');
  else ok('the same switch is in the profile');
  await page.click('#bk'); await page.waitForSelector('#cash');

  console.log('\n8. the speed table');
  await page.click('#speed');
  await page.waitForFunction(() => S.speed === true, null, { timeout: 8000 });
  const clock = await page.evaluate(() => ({ total: CLOCK_TOTAL, show: CLOCK_SHOW }));
  ok(`speed armed: ${clock.total / 1000}s a hand, hidden until the last ${clock.show / 1000}s`);
  await page.evaluate(() => screenHome());
  await page.waitForSelector('#cash');

  console.log('\n9. a reload keeps everything');
  const before = await page.evaluate(() => ({ h: P.handle, r: P.rating, b: P.bankroll, f: (P.friends || []).length }));
  await page.reload(); await page.waitForSelector('#cash', { timeout: 15000 });
  const after = await page.evaluate(() => ({ h: P.handle, r: P.rating, b: P.bankroll, f: (P.friends || []).length }));
  if (JSON.stringify(before) !== JSON.stringify(after))
    bad(`reload lost something: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  else ok(`career, stars and ${after.f} friends survived the reload`);

  console.log('\n--- problems ---');
  console.log(errs.length ? errs.map(e => '  ' + e).join('\n') : '  none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
