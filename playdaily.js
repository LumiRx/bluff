/* Plays a whole daily in a real page, the way a person would: clicking the
   actual buttons and driving the game's own key handler rather than reaching
   into state. Returns the decisions it made, so a test can hand the same
   transcript to the server and demand the same answer.

   One implementation, used by both verify.js and link.js — two copies of this
   would eventually disagree about what "playing the daily" means, and the
   disagreement would look like a server bug. */

const STYLES = {
  'plays everything': { fold: false, solve: true },
  'folds everything': { fold: true, solve: false },
  'calls but misses': { fold: false, solve: false }
};

/* page must already be past the gate, with a handle set and the day frozen. */
async function playDaily(page, style, bad, dbg) {
  const { fold, solve } = typeof style === 'string' ? STYLES[style] : style;
  const say = dbg ? m => console.log('      ' + m) : () => {};
  const decisions = [];

  await page.evaluate(() => startMatch('daily'));

  for (let hand = 0; hand < 6; hand++) {
    // wait until the hand has actually rendered before deciding which kind it
    // is — polling for #pickBtn can catch the gap between hands and take the
    // wrong branch, or catch the previous hand's panel and take it twice
    await page.waitForFunction(
      () => !!document.getElementById('pickBtn') || !!document.getElementById('callB'),
      null, { timeout: 30000 });
    const mine = await page.evaluate(() =>
      !!document.getElementById('pickBtn') && S.seats[0].setter);
    say(`hand ${hand + 1} mine=${mine}`);

    if (mine) {
      // my deal: take the first card, the widest legal clue, the top price
      const chosen = await page.evaluate(() => {
        const w = S.hand5[0];
        [...document.querySelectorAll('.wcard')][0].click();
        return w;
      });
      await page.click('#pickBtn'); await page.waitForSelector('#tellBtn');
      const tell = await page.evaluate(() => {
        const o = S.tellOpts, els = [...document.querySelectorAll('.tell')];
        let bi = 0, best = -1;
        o.forEach((t, i) => { if (t.n <= 200 && t.n > best) { best = t.n; bi = i; } });
        els[bi].click();
        return { k: o[bi].k, c: o[bi].c, i: o[bi].i };
      });
      await page.click('#tellBtn'); await page.waitForSelector('#goBtn');
      const stake = await page.evaluate(() => {
        const s = [...document.querySelectorAll('.stk:not(.off)')];
        s[s.length - 1].click(); return S.stake;
      });
      await page.click('#goBtn');
      decisions.push({ word: chosen, tell, stake });
    } else {
      await page.waitForSelector('#callB', { timeout: 25000 });
      if (fold) { await page.click('#foldB'); decisions.push({ call: false }); }
      else {
        await page.click('#callB');
        // S.phase flips to "play" on the first line of phasePlay, before it
        // writes the board — waiting on the phase races the DOM
        await page.waitForFunction(
          () => document.getElementById('board') || S.phase === 'showdown',
          null, { timeout: 20000 });
        const gs = [];
        const hasBoard = await page.evaluate(() => !!document.getElementById('board'));
        if (!hasBoard) bad(`called hand ${hand + 1}, no board appeared`);
        if (hasBoard) {
          await page.evaluate(() => { window._p = S.pool.slice(); });
          for (let g = 0; g < 4; g++) {
            if (await page.evaluate(() =>
              S.seats[0].cracked || S.seats[0].guesses.length >= GUESSES)) break;
            const w = await page.evaluate(sol => {
              const me = S.seats[0];
              if (me.guesses.length) {
                const lg = me.guesses[me.guesses.length - 1],
                      lm = me.marks[me.marks.length - 1];
                window._p = window._p.filter(x => consistent(x, lg, lm));
              }
              const tried = new Set(me.guesses);
              // a guess is now checked against the word list, so even the
              // deliberately-wrong branch has to pick a real word of the right
              // length rather than any old string
              const deck = DECKS[S.word.length];
              if (!sol) {          // deliberately guess something that cannot be it
                const wrong = deck.filter(x => x !== S.word && !tried.has(x));
                return wrong[me.guesses.length * 37 % wrong.length];
              }
              const live = window._p.filter(x => !tried.has(x));
              return live.length ? live[0] : deck.find(x => !tried.has(x));
            }, solve);
            const took = await page.evaluate(word => {
              for (const ch of word) press(ch);
              const before = S.seats[0].guesses.length;
              press('ENTER');
              return S.seats[0].guesses.length > before;
            }, w);
            say(`guess ${w} took ${took}`);
            if (!took) { bad(`the game refused the guess ${w}`); break; }
            gs.push(w);
            await page.waitForTimeout(560);
          }
        }
        decisions.push({ call: true, guesses: gs });
      }
    }

    try { await page.waitForSelector('#ov.on #nx', { timeout: 30000 }); }
    catch (e) {
      const st = await page.evaluate(() => ({ phase: S.phase, hand: S.hand,
        settling: !!S.settling,
        seats: S.seats.map(x => x.name + ':' + x.state + ':' + x.guesses.length),
        cur: S.cur, ov: document.getElementById('ov').className }));
      bad(`hand ${hand + 1} never finished — ${JSON.stringify(st)}`);
      return decisions;
    }
    await page.click('#nx'); await page.waitForTimeout(320);
  }

  await page.waitForSelector('#ov.on #again', { timeout: 25000 });
  return decisions;
}

/* Everything a page needs before playDaily: past the gate, named, day pinned,
   silent, and with the count-in skipped. */
async function readyPage(page, day, opts) {
  const passGate = require('./gate');
  await passGate(page);
  await page.fill('#hnd', (opts && opts.handle) || 'VIV');
  await page.click('#go2');
  await page.waitForSelector('#cash');
  await page.evaluate(o => {
    window.todayKey = () => o.day;
    P.mute = true; P.noMusic = true;
    if (typeof Mus !== 'undefined') Mus.stop();
    window.countIn = fn => fn();
    if (o.geo) { P.geo = o.geo; P.ageOK = true; P.excluded = false; saveP(); }
    // unless a test is deliberately exercising the daily server, cut the network
    // off fast rather than making every match wait out a 7-second timeout
    if (!o.net) window.fetch = () => Promise.reject(new Error('offline'));
  }, Object.assign({ day }, opts));
}

module.exports = { playDaily, readyPage, STYLES };
