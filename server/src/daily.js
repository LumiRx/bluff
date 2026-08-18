/* The server-only half of the engine: how a day is set up, how the bots play
   it, and how a submitted transcript is re-scored and checked. Everything
   above this in engine.js is lifted verbatim from the game; this part exists
   only on the server, because only the server needs to judge. */
const consistent = (cand, g, r) => evaluate(g, cand).join("") === r.join("");

/* ── the day, set up exactly the way newGame() sets it up ──
   The order the shared stream is consumed in matters: shuffle the roster,
   build the script, then roll the bot personalities. Change that order and
   every daily in history scores differently. */
function setupDay(dayKey) {
  setSeed(hashStr("bluff-" + dayKey));
  const p = blankRivals();
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const seated = p.slice(0, 5);
  const script = buildScript(seated);
  const bots = seated.map(r => Object.assign({ name: r.name, rating: r.rating, style: r.style },
                                             botParams(r)));
  return { dayKey, seated, script, bots };
}

/* ── a bot deciding whether to pay ──
   Mirrors botDecides(): it estimates its own odds off the clue, misreads them
   by its own optimism, and herds a little toward whoever already called. */
function botCalls(day, hand, seat, bot, word, pool, tell, stake, alreadyCalled) {
  const est = withRng(mulberry32(hashStr(day + ":d" + hand + ":" + seat)),
    () => crackOdds(word, pool, 10));
  const p = Math.min(.97, Math.max(.03, est + bot.optimism * LEGIB[tell.k] + PINBIAS[tell.k]));
  let bar = .5 + bot.tight;
  bar += (stake - 50) / 100 * .06;
  bar -= alreadyCalled * .02;
  return p > bar;
}

/* ── a bot playing the hand out ──
   Same loop the client runs: filter on the last mark if it is disciplined
   enough, open on a known opener, then guess from what is left. */
function botPlays(day, hand, seat, bot, word, pool) {
  const g = mulberry32(hashStr(day + ":h" + hand + ":" + seat));
  return withRng(g, () => {
    let p = pool.slice(), last = null, lastMark = null;
    const guesses = [];
    for (let t = 0; t < GUESSES; t++) {
      if (last && rnd() < bot.skill) p = p.filter(w => consistent(w, last, lastMark));
      if (!p.length) p = pool.slice();
      let pick;
      if (!guesses.length) {
        const o = (OPEN[word.length] || []).filter(w => p.includes(w));
        pick = o.length ? o[Math.floor(rnd() * o.length)] : p[Math.floor(rnd() * p.length)];
      } else pick = p[Math.floor(rnd() * p.length)];
      lastMark = evaluate(pick, word); last = pick;
      guesses.push(pick);
      if (pick === word) break;
    }
    return { guesses, cracked: guesses[guesses.length - 1] === word,
             won: guesses[guesses.length - 1] === word && guesses.length <= BET };
  });
}

/* what a hand is worth on the daily board */
function handScore(role, rate, callers, cracked) {
  if (role === "set") return callers ? (cracked ? Math.max(0, 40 - cracked * 15) : 60 * callers) : 15;
  if (role === "crack") return 100 + (100 - rate);
  if (role === "late") return 30;
  if (role === "miss") return 0;
  return callers ? (cracked ? 0 : 45) : 10;   /* a laydown only scores if it was tested */
}


/* ══════════ ONE DAY, PLAYED ══════════
   Given a day key and what the player decided, produce the score. Pure, and the
   only authority on what a daily was worth.

   Decisions are recorded as the thing chosen, not an index into a list the
   server would otherwise have to regenerate in lockstep: the word, the actual
   clue, the actual price. That means the server never has to guess which six
   options the client happened to offer -- it only has to check that what was
   used was legal, which is the thing that actually matters. */
function runDaily(dayKey, decisions) {
  const day = setupDay(dayKey);
  const err = m => ({ ok: false, error: m });
  if (!Array.isArray(decisions) || decisions.length !== HANDS)
    return err(`expected ${HANDS} hands, got ${Array.isArray(decisions) ? decisions.length : "none"}`);

  let score = 0, chips = BUYIN;
  const hands = [];

  for (let h = 0; h < HANDS; h++) {
    const button = h % SEATS;
    const dec = decisions[h] || {};
    let word, tell, stake;

    if (button === 0) {
      /* the player's own deal: they chose all three, so all three get checked */
      const cards = day.script[h] && day.script[h].cards;
      if (!cards) return err(`hand ${h + 1}: no cards in the script`);
      word = String(dec.word || "").toUpperCase();
      if (cards.indexOf(word) < 0)
        return err(`hand ${h + 1}: ${word || "(nothing)"} was not one of the five dealt`);
      tell = dec.tell;
      if (!tell || ["pin", "float", "void"].indexOf(tell.k) < 0)
        return err(`hand ${h + 1}: no clue given`);
      /* a clue has to be true of the word, and no wider than the floor allows */
      const holds = tell.k === "pin" ? word[tell.i] === tell.c
                  : tell.k === "float" ? word.indexOf(tell.c) > -1
                  : ![...String(tell.c)].some(c => word.indexOf(c) > -1);
      if (!holds) return err(`hand ${h + 1}: the clue is not true of ${word}`);
      const cap = TELLCAP(word.length);
      const n = survivors(tell, DECKS[word.length]).length;
      if (n > cap) return err(`hand ${h + 1}: that clue leaves ${n} words, over the ${cap} floor`);
      tell = { k: tell.k, c: tell.c, i: tell.i | 0, n };
      stake = dec.stake | 0;
      if (STAKES.indexOf(stake) < 0) return err(`hand ${h + 1}: ${stake} is not a price`);
      if (stake > capFor(n, word.length))
        return err(`hand ${h + 1}: ${stake} is over the ${capFor(n, word.length)} cap for that clue`);
    } else {
      const sc = day.script[h];
      word = sc.word; tell = sc.tell; stake = sc.stake;
    }

    const pool = survivors(tell, DECKS[word.length]);
    const rate = RATE[word];

    /* seats act in button order, and each one herds a little toward whoever
       has already paid, so the order is part of the arithmetic */
    const order = [];
    for (let k = 1; k < SEATS; k++) order.push((button + k) % SEATS);

    let called = 0, cracked = 0, callers = 0;
    let myRole = "fold", myGuesses = [];

    for (const seat of order) {
      if (seat === 0) {
        if (!dec.call) { myRole = "fold"; continue; }
        called++; callers++;
        const gs = (dec.guesses || []).map(g => String(g).toUpperCase());
        if (gs.length > GUESSES) return err(`hand ${h + 1}: ${gs.length} guesses, ${GUESSES} allowed`);
        /* a guess has to be the right length and an actual word — the old rule
           was five letters with a vowel, which made AEIOU legal and strictly
           better than a real word, because it could test a whole row of fresh
           letters at once */
        for (const g of gs) {
          if (g.length !== word.length)
            return err(`hand ${h + 1}: "${g}" is not ${word.length} letters`);
          if (!isWord(g)) return err(`hand ${h + 1}: "${g}" is not in the word list`);
        }
        myGuesses = gs;
        const hit = gs.indexOf(word);
        if (hit > -1) {
          if (hit !== gs.length - 1) return err(`hand ${h + 1}: play continued after the word fell`);
          myRole = (hit + 1) <= BET ? "crack" : "late";
          if (myRole === "crack") cracked++;
        } else myRole = "miss";
      } else {
        const bot = day.bots[seat - 1];
        if (!botCalls(dayKey, h, seat, bot, word, pool, tell, stake, called)) continue;
        called++; callers++;
        const r = botPlays(dayKey, h, seat, bot, word, pool);
        if (r.won) cracked++;
      }
    }

    const role = button === 0 ? "set" : myRole;
    const s = handScore(role, rate, callers, cracked);
    score += s;

    /* and the chips, so the board can show a stack as well as a score */
    let d;
    if (role === "set") {
      d = ANTE * (SEATS - 1) + (callers - cracked) * stake - cracked * stake;
    } else if (role === "crack") d = stake - ANTE;
    else if (role === "late" || role === "miss") d = -stake - ANTE;
    else d = -ANTE;
    chips += d;

    hands.push({ hand: h + 1, role, word, rate, callers, cracked, stake, score: s, delta: d,
                 guesses: myGuesses });
  }

  return { ok: true, dayKey, score, chips, hands };
}

