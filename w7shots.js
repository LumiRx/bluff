/* wave 7 — the four screens, on a phone, with a record worth looking at */
const { chromium } = require('playwright');
const passGate = require('/Users/rick/Downloads/bluff/gate');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type()==='error') console.log('CONSOLE ' + m.text()); });
  await p.goto('file:///Users/rick/Downloads/bluff/index.html');
  await p.waitForTimeout(600);
  // through the gate and the handle
  await passGate(p);
  // run-unique, per the project's own rule — a hardcoded handle claims a row
  // on the live registry and then collides with the next run of this script
  const HAND = 'W' + Date.now().toString(36).slice(-4).toUpperCase();
  await p.fill('#hnd', HAND); await p.click('#go2');
  await p.waitForSelector('#cash', { timeout: 8000 });
  await p.waitForTimeout(500);
  // a career worth a cabinet
  await p.evaluate(() => {
    Object.assign(P, {
      matches: 14, firsts: 3, w: 9, l: 5, rating: 1612, streak: 4, bestStreak: 6,
      peakRating: 1690, peakBank: 21400, bankroll: 12850, busts: 1, level: 7,
      setHands: 22, setHeld: 10, setNoTakers: 4, setChips: 3100,
      called: 31, cracked: 12, late: 2, foldedN: 18, foldsJudged: 15, goodFolds: 11, callChips: -900,
      bestBluff: { word: 'EPOXY', rate: 45, callers: 3, take: 900 },
      bigHand: { word: 'GAUGE', rate: 52, callers: 4, take: 1400 },
      friends: [{h:'ACE',d:'2026-09-10'},{h:'RIVER',d:'2026-09-11'},
                {h:'MAVE',d:'2026-09-12'},{h:'JINX',d:'2026-09-13'}],
      x: { handle: 'playwebluff', verified: 1 }
    });
    saveP(); screenProfile();
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'w7-profile.png' });
  await p.evaluate(() => screenSettings()); await p.waitForTimeout(500);
  await p.screenshot({ path: 'w7-settings.png' });
  await p.evaluate(() => screenRecord()); await p.waitForTimeout(500);
  await p.screenshot({ path: 'w7-record.png' });
  await p.evaluate(() => screenCard()); await p.waitForTimeout(900);
  await p.screenshot({ path: 'w7-card.png' });
  await p.evaluate(() => {
    S.strip = [{ sym: SYM.up, role: 'set', callers: 3, cracked: 0, d: 900, word: 'EPOXY', rate: 45 },
               { sym: SYM.fold }, { sym: SYM.up }, { sym: SYM.down }, { sym: SYM.up }, { sym: SYM.fold }];
    S.session = { delta: 900, place: 1 };
    screenShare();
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: 'w7-share.png' });
  console.log('five shots');
  await b.close();
})();
