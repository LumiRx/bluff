# BLUFF — design note

*Pick a word. Bet they cannot get it.*

Replaces INTEL, which replaced WORD ROYALE. Both of those were Wordle with things bolted on. This one is not a Wordle variant — it is a betting game that happens to use word-guessing as its resolution mechanic, the way poker uses cards.

---

## The shape

Six seats, six hands, one dealer button that moves one place each hand, so everyone sets the word exactly once and guesses five times. A match runs about eight minutes.

On your hand you are dealt **five word cards**. Each one carries a measured crack rate — how often players actually solve that word in three guesses given an ordinary clue. You pick one, and nobody else ever sees the other four.

Then you must **give the table one clue**. You choose from a menu of six: pin a letter to its exact position, float a letter with the position withheld, or void two common letters that are not in the word at all. Beside each option you — and only you — see how many words in the deck still fit afterwards.

Then you **post a price**. Everyone else acts in turn, seeing your clue and who has already called. They fold and keep their chips, or call and get three guesses at your word. It settles one on one at even money: **crack it and you pay them, miss it and they pay you.**

That is the core. Power-ups and an optional clock sit on top of it, and both are described further down — but the hand above is the whole game, and it is playable with neither.

---

## Why it is not another Wordle

Wordle is a solitaire deduction puzzle with a social artefact bolted on afterwards. The pleasure is narrowing. In BLUFF the deduction is still there, but it is no longer what you are being scored on — it is what you are *betting on*. Three things follow from that, and they are the reason this is a different game rather than a reskin.

**You are not always solving.** One hand in six you are on the other side of the table entirely, choosing a word and pricing it. That role has nothing to do with vocabulary and everything to do with reading how a clue will land.

**Most of the decisions are made before a single letter is typed.** Which card, which clue, what price, and — five times out of six — whether to play at all. Folding correctly is a skill, and it is the one that separates players fastest.

**The information is asymmetric and priced.** The setter knows exactly how much they gave away. The table has to judge it by feel. That gap is the game, and it is the thing a daily solo puzzle structurally cannot have.

---

## The two problems that had to be solved

A betting game only works if both roles can profit and neither has a dominant line. Two came up, and both needed a structural fix rather than a tuning pass.

**The setter had no reason to give a real clue.** Left alone, the correct play is to pick the stingiest clue on the menu every time — the one that leaves the most words alive. The table folds, the hand dies, nothing happens. Simulation confirmed it: hoarding beat baiting.

The fix is that **the price you may charge is capped by what you gave away.** A clue leaving 200 words or fewer unlocks the top price of 100. Up to 450 words caps you at 50. Anything wider and you can only charge 25. You cannot starve the table and get rich. The winning line becomes what it should have been all along: find a word where giving away a lot costs you almost nothing.

**Even money has to actually be close to even.** At four guesses a competent player cracks around 70% of words, so calling was free money and setting was a losing proposition. At three guesses the deck now averages exactly 50% — a card played carelessly is a coin flip, and everything above that is skill on one side or the other.

---

## The bait

The best card in the game is a clue that *feels* generous and is not. Pin the last letter of `WATCH` and it looks like a gift; then they drown in BATCH, CATCH, HATCH, LATCH, MATCH and PATCH. A pinned green letter reads as the strongest thing on the menu, which is exactly why it is the one to distrust.

That is not a decorative idea — it is the load-bearing mechanic, and the bots carry the same bias so it can actually be exploited. They over-call pins by about fourteen points of estimated probability, and they barely engage with a double-void at all, because nobody talks themselves into a clue they cannot picture words from.

---

## The numbers, and where they come from

The crack rate on every card is measured, not invented. A human-like constraint solver was run 260 times against each of the 1,060 words at three guesses, with a clue drawn from that word's own menu, filtering candidates against its feedback and forgetting a deduction 22% of the time — because weak players forget deductions rather than reason badly.

The result lands on a mean of 50% and a median of 50%, spread from `PUPPY` at 18% to `ABOVE` at 85%. The hardest cards it found are the ones the Wordle literature already knows about: `PUPPY`, `FOLLY`, `JOLLY`, `HOUND`, `FOUND`, `WATCH`, `HATCH` — dense neighbourhoods and repeated letters, not obscure vocabulary. Every word on the list is one an ordinary speaker knows. Difficulty here is structural, which is what makes it fair.

Deals are stratified so every hand offers one card from each difficulty band. You always have a real choice.

**Strategy simulation**, 700 hands each against five bots:

| setter line | calls drawn | crack rate | chips per hand |
|---|---|---|---|
| sharp card + crowded pin (the bait) | 2.50 | 45% | **+77** |
| sharp card + stingiest clue (stalling) | 0.75 | 34% | +56 |
| random card, random clue | 2.91 | 55% | +31 |
| soft card + generous pin | 4.37 | 71% | **−130** |

Baiting draws three times the action of stalling and pays 38% better, and the naive line is punished hard enough to teach in one hand.

**End-to-end validation** in the shipped build — six full matches driven by a competent player that filters candidates properly and folds any clue leaving more than 430 words standing: **58% crack rate on called hands, +167 chips per hand when setting, finishing 2.3rd of 6 with three outright wins.** Against a 1-in-6 baseline, skill roughly triples the win rate.

---

## Rules reference

| | |
|---|---|
| Seats | 6, bots backfill |
| Hands | 6 — one full orbit, everybody sets once |
| Starting stack | 1,000 chips |
| Ante | 10 per seat to the setter, the price of being dealt in |
| Prices | 25 / 50 / 100, capped by clue generosity |
| Guesses | 3 |
| Settlement | Even money, one on one against the setter |
| Match length | ~8 minutes |

---

## The itch — what carries over between sessions

A single match is a closed loop. What makes people come back is a number they own and can lose. Five things now persist.

**Two scores, two different pulls.** **Bankroll** is the gambler's number: you buy in for 1,000 a match and cash out whatever you finish with, so it swings and it can be taken away. **Rating** is the ladder — Elo-style, starting at 1500, volume-independent, so grinding does not inflate it. Bankroll is what you brag about; rating is what you climb.

The rating had to be reworked once. The first version added a chip-margin bonus on top of the Elo term, which meant a player who consistently outperformed kept gaining forever with no ceiling. Folding placement and margin into a single performance score *inside* the Elo makes it self-limiting: gains taper as you outgrow the field. Simulated over 200 matches, a player performing at the measured smart-player level (2.3rd of 6, +142 chips) settles at **1818** — reaching SHARP at match 7, ROUNDER at 18, SHARK at 34. An average player sits flat at 1485. A weak one drifts down to 1292 and stops. The ladder converges instead of running away.

**Seven tiers**, poker-native: RAILBIRD, GRINDER, REGULAR, SHARP, ROUNDER, SHARK, LEGEND. Promotion grants one demotion shield, so a single bad session cannot immediately undo a rank you just earned — it costs the shield instead, and the summary tells you it did.

**Fourteen regulars with their own careers.** Each carries a rating, a record, a bankroll and a playing style, and all of it updates after every match. You are seated against the five nearest your own rating, so climbing genuinely puts you in harder games — and because bot skill is derived from rating, higher tables actually crack more of your words. The ladder screen doubles as a read sheet: *"DUKE — cannot pass up a pinned letter"* is both flavour and exploitable information.

**A record worth protecting.** W–L on sessions finished up or down, plus the stats that separate good players from lucky ones: crack rate when you call, how often you held a word you set, how often you scared the table off entirely, and **good laydowns** — of the hands you folded where somebody else played, how often nobody cracked it. That last one is the honest measure of whether your folds were right, and it is the number a serious player will chase.

**The daily table.** One seeded deal per day: same five cards, same words, same clues, same prices, same five regulars, for everyone in the world until midnight. It moves your bankroll and a day streak but deliberately not your rating, so the ladder stays a pure competitive measure and the daily cannot be farmed. Verified by running two separate players through the same date and diffing the generated script — identical. Bot solving is seeded per hand and seat too, so outcomes are comparable and not just the deals.

**The share.** A hand-by-hand strip plus the best hand of the session: `Set SILLY (34%) — 2 called, 0 cracked, +250`. That is a brag with a story attached, which is a better thing to paste into a group chat than a score. The crown in the strip marks a word you set that nobody could crack.

---

## What I deliberately did not build

You asked for the itch gamblers chase. Most of what creates it is legitimate — mastery, a visible ladder, a streak you can break, a session that can swing. Four common mechanics were left out on purpose, and it is worth being explicit about which:

**No loss-chasing prompts.** No "one more hand to win it back" after a losing session. The rebuy is free, silent, and logged.

**Nothing purchasable that touches chips.** Bankroll and rating cannot be bought, and no rebuy is ever sold. The moment a game sells its way out of a loss it stops being a skill ladder.

**No manufactured near-misses.** The deal is never weighted to *almost* let you win. Every crack rate on every card is a measured number and the shuffle is honest. When the summary says you had it narrowed to three, that is true.

**No randomised paid rewards.** No crates, no packs, no pulls.

These are not only the ethical line — they are the regulatory one. Simulated-gambling mechanics and loot boxes are exactly what draws app-store policy enforcement and FTC attention, and a word game does not need that surface. Cosmetics — table felts, card backs, avatar frames — monetise the same player for years without touching the economy.

---

## Storage

Career data lives in browser storage behind a guard that degrades to memory rather than throwing, so the file works in a sandboxed preview too — it just will not remember you there, and the home screen says so plainly. Verified surviving a full page reload with rating, bankroll, handle and match count intact.

---

## The table, and the things on it

The felt got a brass rail, a betting line and a watermark; the seats got faces. Every player is a circle with an animal on it and a ring that carries their state — gold for the button, green when they call, red when they miss, faded when they fold, and a white pulse on whoever is acting. Chip counts sit in pills that flash green or red the moment they move, and **every bet flies**: calling sends a stack of chips arcing from your seat into the pot, and at showdown they fly back out — green to whoever cracked it, red from whoever missed into the setter's stack. The pot counts up rather than snapping.

That last part matters more than it sounds. In poker the money moving across the felt is most of the drama, and a number silently changing under an avatar is not the same event.

---

## Power-ups

Seven items, earned only by playing well — holding a word you set, cracking one, or laying down a hand nobody else could beat. Never sold. You can hold four.

| | | |
|---|---|---|
| 💡 | HINT | Reveals one letter of the word, in place, on your board |
| 🎁 | GIFT | Hands a live letter to another player, and tells them it came from you |
| 🔎 | PEEK | Shows a rival's most recent guess and what it scored |
| 🔀 | SEAT | Moves you to the back of the betting order so you act on more information |
| ♻️ | REDEAL | Setter only — throws your five cards away and takes five new ones |
| 🌀 | SCRAM | Shuffles a rival's keyboard for six seconds |
| 🎲 | SWAP | Rare. The word becomes a different one that fits the same clue; every board resets |

**GIFT is the interesting one.** Handing someone a letter looks like charity and is usually a weapon: if you have folded, arming a caller costs the setter money, and the recipient is told exactly who helped them — so it needles as well as pays. It turns folding from a passive act into a live one.

The two that take something away were the risk, since interference is precisely what made WORD ROYALE confusing. Both are built so they cannot cheat you. **A scrambled keyboard moves its keys but every key still types what it says** — you lose time hunting, not trust, which is the opposite of the old lying-keyboard mechanic. And **a swapped word still satisfies the clue everyone paid for**, with every board on the table reset, so nobody loses a deduction they bought — you lose your narrowing, which is a real cost, not a betrayal. Against a bot, SCRAM slows its pace instead, since it has no keyboard to shuffle; that is the honest equivalent of the time a human loses.

The regulars carry items too and use them on you, which is the only way the mechanic reads as a system rather than a button.

---

## The clock

Speed tables give every player **ninety seconds a hand, and the clock is invisible until thirty seconds remain** — then a ring closes around every live player's avatar and the whole table watches it burn.

Ninety rather than the 120 you suggested, because the problem you described is people leaving the game to look words up. A considered player needs 60–75 seconds for three guesses against this deck, so 120 leaves comfortable room to open a browser tab; 90 does not, without rushing anyone playing honestly. Standard and daily tables have no clock at all — the calm deduction game is still the default, and speed is a table type you choose.

---

## Table codes

**The code is the table.** Anyone who enters the same five characters gets the identical six deals — same cards, same words, same clues, same prices — because the code seeds the deal exactly the way the daily does. That makes the invite real rather than a placeholder waiting on a server: you can send a friend `A4M9U` today, both play it, and the scores are directly comparable.

The QR is a from-scratch encoder — byte mode, error-correction level M, versions 1 to 6, with Reed-Solomon over GF(256), all eight masks scored by the standard penalty rules, and the best one chosen.

It took three attempts to get right, and the verification is worth describing because "it looks like a QR" is not verification. The first version failed to scan while decoding perfectly against my own reader — a shared-convention bug. Structural checks passed (finders, timing, alignment, dark module, data-module counts matching the spec exactly for all six versions; RS generator polynomials matching the published tables at degrees 7, 10 and 16). The break came from noticing OpenCV ships its own QR **encoder**: generating a reference for the same payload and diffing module by module showed the entire data region byte-identical and **only the format-information cells wrong** — my 15-bit string was being written LSB-first where the spec places it MSB-first. All six test payloads now decode correctly through OpenCV's detector, and four of six are byte-identical to its reference encoder (the other two differ only by a legal alternative mask choice).

---

## Friends

A friends list that does three things rather than sitting there as a list of names.

**They appear on a board.** A friend's daily score is derived from their handle and the date, so the same friend shows the same number on everybody's screen. It is a stand-in until the server exists, but it is a *consistent* stand-in — nobody can quietly inflate a friend who is not there to defend it, and the number is stable for anyone who checks twice.

**You can call one out.** Tap a friend and both of you resolve to the same five-character table code, derived from the pair of handles plus the date. Nothing has to be sent. They tap your name on their own list and land on the identical six deals — same words, same clues, same prices — so the two scores actually compare. It is the one piece of real multiplayer that works with no server at all, and it is the piece people will use.

**They have their own tab.** The ladder, the daily and your friends are three tabs on one board, so the small group you actually care about is one tap from the global one you probably do not.

Shared links and QR still seat anyone straight onto the table they point at. What is still missing is a live shared room — that needs the server.

---

## Mucking

You could call a hand and then simply be stuck — no way out, the table waiting on you, and in speed mode a clock running down on a word that will not come. **MUCK** ends the hand on the spot.

It costs exactly what missing costs. That is deliberate: if mucking were cheaper than losing, the correct play would be to call every hand, look at one guess, and buy your way out of the bad ones for half price — which would break even money on the caller's side. Priced at par it buys you an exit and not a discount, so there is nothing to exploit. It takes two taps, and the second one names the price.

The one thing it does give you is a salvage: muck after at least one guess and you keep a power-up out of the wreck. Admitting you are stuck should be worth slightly more than stalling until the clock kills you.

---

## Prizes, monetisation, and the fork we took

The daily prize started life as cash — $100 / $50 / $25 to the top three. Then came the request to sell stars for real money, and those two things cannot coexist.

Illegal gambling is **prize + chance + consideration**. Free entry kept consideration at zero, which was the whole basis for paying cash on a skill leaderboard. Selling the in-game currency puts money *in*, and with money already going *out* as prizes and genuine chance in the deal, all three legs are present at once. It is also, precisely, the dual-currency structure that Connecticut, Montana, New Jersey, California, New York, Indiana, Maine, Oklahoma and Iowa outlawed between 2025 and 2026 — New York's version reaching payment processors and platform vendors as well as operators.

So it was a fork, not a detail: **sell stars, or pay cash. Not both.**

**We took selling.** Every cash prize is gone. The daily top three now takes **3,000 / 1,500 / 750 stars**, the first-month bonus is 10,000 / 5,000 / 2,500 stars, and the chest is denominated in stars. What that buys, beyond a much simpler business: no registration or bonding in Florida and New York, no surety bond, no geo-exclusions, no 1099s, no KYC, no payout rail, and the poker framing stops being a liability because there is no prize to be gambling *for*. The 30-day launch delay went with it — its only purpose was clearing New York's filing window, and there is nothing left to file.

**The line that replaces it:** stars buy *looks only*. Power-ups stay earned and are never sold, and nothing in the store touches a hand, a rating or a place on the board. That is not a legal constraint any more, it is a competitive one — the research on fifteen-year survivors is unambiguous that games selling advantage price out their own mid-tier and collapse their matchmaking, while games selling identity monetise the same player for a decade. Rating stays a measure of play rather than of spend.

The store sells table felts, rails, avatar rings and star tokens, all applied through CSS variables so equipping is instant and persists. Star packs are $1.99 / $4.99 / $9.99, stubbed at the checkout step.

---

## The ladder sits under the game

The leaderboard used to live behind a button, which meant a new player never saw it. It is now the bottom half of the home screen: today's table, the top eight with your row pinned below if you are outside it, prize markers on the first three places, and the countdown to the first payout above it. You see what is being competed for before you have played a hand, which is the entire point of putting money on it.

The full ladder is still one tap away for rating and career records.

---

---

## Making it easier without making it dull

The feedback was that people had to think too hard and would leave. That was measurable, and the measurement was worse than expected: simulating a casual player — one who forgets a clue about half the time and can only summon ordinary words under pressure — the old build let them crack **26% of hands**. They failed three out of four. No amount of polish survives that.

Three things changed, each chosen from a sweep rather than a hunch.

**A smaller, friendlier, fully-written deck.** 1,060 words became **749**, all hand-written with a pronunciation and a definition. The structural monsters are gone — the deck's hardest word is now 32% rather than 18%, and the mean moved from 50% to 66%. A smaller deck also means fewer candidates survive a clue, which helps on its own.

**Every clue now has a floor.** No tell may leave more than 250 words standing. A starved clue was the single most demoralising thing in the game — you were being asked to guess with nothing. Average words alive after a clue fell from about 180 to 85.

**Four guesses, but only three carry the bet.** This is the one that matters. The sweep showed the guess count dominates everything else, but simply granting a fourth guess pushed crack rates to 84% and killed the setter's role outright. So the fourth guess exists and settles nothing: **crack it inside three and you beat the setter; the fourth is a free swing that finishes the word and pays nobody.**

That separation is the whole fix, because the two failures feel completely different. Losing a bet after solving the word is poker. Never seeing the word at all is just being told you are stupid. Measured across the three player models:

| | beats the setter (≤3) | actually solves it | never gets it |
|---|---|---|---|
| casual | 38% | 60% | 40% |
| average | 49% | 75% | 25% |
| sharp | 57% | 84% | 16% |

The wager stays balanced on a real skill spread centred near even money, while the number of hands that end in nothing drops by a third for casual players and by more than half for everyone else.

**A live candidate counter** sits under the board — *"14 words still fit"*, turning gold when it drops under seven. The hard part of a word game for a casual player is recall, not deduction, and a counter tells you when the answer is nearly cornered so you keep pushing instead of giving up. It costs nothing competitively because it is derived from information you already have.

---

## Teaching the words

Every one of the 749 words carries how to say it and what it means, shown on the showdown card the moment the word is revealed. **129 of them are marked *worth knowing*** — words like QUELL, TACIT, NADIR, GLEAN, FEIGN — and they get a badge. These are not obscure; they are words most people half-recognise and could not define, which is exactly the band where learning one feels good rather than punishing.

The point is that a hand you lost still teaches you something. Failing to crack IMBUE and then being told it means *to fill through and through*, pronounced im-BYOO, is a better ending than a bare reveal.

---

## Layout cleanup

The action panel was three lines of prose explaining the same arithmetic every hand. It is now a glanceable row of three figures — to call, what you win, how many guesses — with one line of text underneath for the part that actually varies. The board tightened to fit four rows, the free-swing row is dotted and labelled so nobody mistakes it for a real guess, and the whole play screen fits without scrolling at 360×640, 375×667, 390×844 and 430×932.

---

## Sound

Every sound in the game is synthesised at load time out of oscillators and filtered noise. There are no audio files, nothing to fetch, and nothing added to the download — and each sound is a handful of numbers I can retune rather than an asset I would have to re-record.

The one that matters is money. Winning stars plays a run of coins up a pentatonic scale with a metal transient on every note, then the drawer sliding and shutting. It scales with the amount: a small pot is four coins, a big one is nine and climbs higher, so a good result is audibly bigger rather than the same clip played again. It fires the moment a hand pays, not only when the match settles, because the hand is where the feeling is.

Every hand opens with its own marker, and the marker climbs. Hand one sounds the octave, hand six the fifteenth — six hands, six rungs of the same series the match opened on — so you can hear how deep into the match you are without looking at the header.

### The count-in

Naming your price rings a chime: the price is set and the table is open. Then, once the betting closes and before the keyboard appears, the table counts you in — **3, 2, 1, GO** across the felt, three rising pips and a double bell.

It is not decoration. Nothing moves during it: the bots are not ticking yet, the speed clock has not started, so the count is a real pause and everyone genuinely begins together. The pips climb the same series as everything else (3×, 4×, 5×), and the GO is the bell twice at the octave above.

Two details matter. It only runs for someone who actually **called** — a player who folded is watching, and does not need to be counted in to nothing. And it is **skippable**: touch anything and it rings the bell and gets out of the way, because nobody should be held at a countdown they have watched a hundred times.

The chime, the pips, the starting bell and the round marker are all built from one `bell()` — a hard transient with partials from the same series ringing underneath — so everything that has to cut through a room sounds like it came from the same instrument.

Around it: a chord when the table opens and its answer when it closes, chips landing on a bet, a pitched blip per tile as the row turns over — high for a hit, mid for a near, dull for a miss — a rising chord for cracking a word, a sawtooth drop for busting, a soft riffle at every deal, a per-second tick through the last ten seconds of the speed clock, and a fanfare on promotion.

### Opening, closing, and the payout

A match opens and closes on a matched pair, and the pair is one idea: **the harmonic series of a single root, arriving in order.** Seven voices at 1×, 2×, 3×, 4×, 5×, 6× and 8× of G2, entering about fifty milliseconds apart. Because every voice is an exact integer multiple of the same fundamental they share partials the whole way up, and the ear fuses them into one tone opening rather than a chord of separate notes. That fusion is what "harmonic" actually buys you.

The opening deals them from the bottom up, so the sound expands outward. The close is the identical seven arriving from the top and settling onto the fundamental — same material, opposite direction, so the two read as a pair rather than two unrelated noises.

The first attempt at the opening glided the root up a fifth underneath fixed upper voices. It was clever and it sounded wrong: a moving pitch beats against stationary ones for the whole length of the slide. There is no pitch movement anywhere in it now. The motion is voices arriving, not notes bending.

Because "harmonic" is measurable rather than a matter of taste, the test measures it: a Goertzel filter at each partial and again at deliberately off-series frequencies. Energy sits on the series and the strongest thing between the partials is about 27 dB down. Any future edit that puts a note somewhere it does not belong fails the build. The same measurement confirms the round marker actually rises — 2×, 3×, 4×, 5×, 6×, 8× across the six hands — and that the count-in climbs with it, 3× to 4× to 5×, rather than merely being intended to.

Between the last hand and the summary, the stars are shown actually moving. They come out of the middle of the table and tumble into the stacks that finished ahead, biggest share first, with each seat lighting up as it is paid. The numbers appear afterwards. The reward should be watched before it is read.

### On harmonics, and on the frequency question

Each voice is built from a real harmonic series rather than a stock oscillator: partial *n* sits at exactly *n* times the root, and the partial amplitudes decide the timbre. This is not ornamental. Intervals drawn from the series — octave 2:1, fifth 3:2, major third 5:4 — physically share partials with the root, and shared partials are the reason a chord reads as *resolved* rather than merely loud. The payout chord is 4:5:6:8:10:12:16, straight off the series.

Each voice also gets a gentle lift around 2–4 kHz, which is where the ear is most sensitive. That is a real effect with a real name (the equal-loudness contours), and it lets a reward cut through without being turned up.

There is no frequency that triggers dopamine, and anything claiming one — 528 Hz and its relatives — is not supported. What the actual work shows (Salimpoor et al., *Nature Neuroscience*, 2011) is that dopamine tracks **anticipation and resolution**: release in the caudate *before* a musical peak and in the accumbens *at* it. The lever is structure, not hertz.

So the reward is built as structure. It runs in three parts: a rising swell with a reel of clicks that slows down (anticipation, 440 ms), a beat of near silence (the hold), then the harmonic chord arriving all at once on top of the coin cascade (release). The measured envelope shows exactly that shape — energy drops to effectively zero right before the peak. That dip is the whole point, and the test now fails the build if it disappears.

### Making it loud enough

The first build was quiet, and the reason was an architecture mistake rather than a number: the level sat *before* the limiter. Pushing gain into a compressor only makes it squash harder. The chain is now bus → compressor → make-up gain → tanh ceiling, with the make-up after the compressor where it actually raises the output, and a tanh saturator last because a compressor with a 3 ms attack still lets transients through and with this much make-up they would tear. tanh cannot mathematically exceed ±1; quiet material passes almost untouched and loud material rounds off.

That is about 10 dB louder across the board. The heroes sit near −13 dBFS, which is where game effects belong, and nothing is pinned against the ceiling for more than a tenth of a percent of its length.

Two measurement bugs fell out of that. The offline renderer had been measuring a bare gain node, so every level in the test had been a number no player ever heard — it now builds the identical chain. And the peak check was flagging 1.003 as clipping when that is the 4× oversampling filter ringing past a mathematically hard ceiling; the test now measures what actually matters, which is how long a sound sits pinned at the top.

### The silent switch

On iOS, Web Audio obeys the ringer switch, so a phone in silent mode plays nothing — and that reads to a player as "this game has no sound" rather than "my phone is muted". Playing a scrap of generated silence through an ordinary audio element on the first touch moves the app into the playback audio session, and Web Audio stops being muted with the ringer.

I cannot hear any of it, so the tuning was done numerically: an `OfflineAudioContext` renders each sound and reports peak, length, and loudness measured over the sound's own duration rather than over silence. That last detail is what made the balance possible — measured naively, a short sound always reads quiet. Everything now sits within about 10 dB of the money sound except the deliberate micro-clicks under typing, nothing clips, and mute genuinely silences the engine at the source rather than turning the volume down. There is a toggle on the home screen next to the rules, one in the profile, and one in the game header. It is worth someone with ears telling me what to move.

---

## The table is a stone

The felt was flat. It is now cut like a gem: a domed body, a fixed field of facets that turns very slowly so there is structure for light to catch on, and one specular band that crosses the table in under three seconds and then rests for six. A glint you notice, not a searchlight sweeping back and forth.

The colour of the light comes from whichever table you have equipped, so the whole set became stones — emerald, sapphire, ruby, onyx, pearl, amethyst — and each throws back its own highlight. The animation respects `prefers-reduced-motion`.

---

## The board

The leaderboard was a table of small grey rows and nobody's eye stopped on it. It is now one row shape used everywhere in the game — the home board, the ladder, the daily, the friends tab and the end-of-match standings all read identically.

The rank numeral is the anchor: plain for the field, struck in gold, silver and bronze for the podium. Your own row is a solid highlighted bar with a gold edge, so you find yourself before you have finished reading. The number being judged is the largest thing in the row, with the prize on the podium rows as a pill beside it.

The regulars now arrive with a record derived from their rating rather than 0–0. A ladder where every name has played nothing reads like an empty room on the day it matters most.

---

## The store

The store was confusing and it looked cheap, and those turned out to be the same problem: it was selling colour swatches instead of selling the thing.

Everything on sale lives on one object — the table — so the store now shows that object. A working miniature table sits at the top wearing whatever you are looking at: cloth, trim, the ring round your face, the mark on your chips, with the gleam running across it. Tap something and the preview changes immediately.

Then the cards themselves stopped being paint chips. Every table and trim card is its own miniature table, so you are looking at the result rather than at a rectangle of green. Trim cards show the trim wrapped around the cloth you already play on, and table cards show the stone wearing the trim you already own. Ring cards show your actual face inside the ring. Chip cards show a real chip with the real mark on it. The specular streak is offset differently on each card — one identical highlight stamped across six of them was a large part of why the old grid read as printed rather than made.

The categories were labelled TABLE, RAIL, RING, TOKEN with nothing explaining what a rail or a token was. They are now TABLE, TRIM, RING, CHIPS, each with a line underneath saying what it changes.

State is now legible at a glance rather than three shades of the same grey: an **ON** chip in gold on what you are wearing, **OWNED** on what you have, a price on what you do not, and anything you cannot afford dimmed.

And buying is no longer one tap. Tapping something you do not own **tries it on** — the preview changes, the card is marked TRYING, and nothing is spent. A separate button then says exactly what you are about to do: *BUY AMETHYST — 9,000★, leaves you 11,000★*. Nine thousand stars was previously one stray tap away.

The star packs moved into their own framed panel under a divider, so the part you buy with stars and the part you buy with money no longer blur into each other.

---

## Shipping it

### The one decision the store build turns on

Apple treats a game of chance for money and a contest of skill for money as different products under
different rules, and the difference decides whether this can be submitted at all.

So the money is attached to exactly one thing. **The daily is the contest**: every player in the
world is dealt the identical six hands, and the board ranks how well each person played a fixed
problem. That is skill, and prizes ride there. **The cash game is not the contest** — it has hidden
words and real chance in it, so it pays stars and rating and never money. No prize is reachable from
a cash table, and nothing that happens at one moves the daily board.

Entry is free, once a day, for everybody. Stars buy cosmetics only: they cannot be spent on the
daily, cannot improve a placing, and are not an input to the ranking. That wall is the whole legal
argument, and the moment a purchase can influence a daily placing — even indirectly — the contest
becomes something else.

### The gate

Two questions before anything else: how old you are, and where you are. They decide whether money is
on the table for you and nothing else. Prizes are switched off under 18, for the nine US states that
restrict prize contests, and for anyone who has excluded themselves — and in every one of those
cases the app **says so plainly** and hands over the entire game anyway. Same board, same ladder,
same record, stars instead of dollars. Hiding the money and letting people wonder would be worse
product and worse compliance.

The official rules, the privacy note, the region control and self-exclusion all sit one tap from the
trophy strip and again in the profile. They are written to be read, because a contest people cannot
understand is a contest they do not trust — and App Review reads them too.

### The app

One HTML file with no dependencies means the build is a copy, a version stamp, and a check that
every icon the manifest promises exists. It installs as a PWA and wraps in Capacitor for both stores
from the same source. Service worker is stale-while-revalidate, so the game opens instantly with the
network off and picks up the new build next launch; the cache key is the version, so an old build
cannot outlive a deploy. Safe-area insets on all four edges, no rubber-band, no double-tap zoom.

`pwa.js` serves `dist/` over real http and checks the things that actually get checked: the manifest
is installable, the gate cannot be walked past empty, a Tennessee player sees stars where a New York
player sees dollars, the official rules cover every required point, and the game still opens with
the network pulled out from under it.

---

## The crypto build

Separate product, web only, staked in USDC or USDT on Base, Polygon or Arbitrum. It is not the same
binary as the store build and cannot be: neither store approves crypto wagering.

### The problem worth solving

In a hidden-word game for money, the person who picks the word is the person you are betting
against. Everything else is detail. The contract removes the possibility of them changing it rather
than asking you to trust them:

The setter publishes `SHA-256(word ‖ salt)` **and the clue in plaintext** before a cent moves. The
word is hidden; the promise about it is not. The caller matches the stake and guesses on-chain —
public, which costs nothing when only one person is guessing. The setter reveals, and the contract
re-hashes: a different word produces a different hash and the reveal reverts. It also re-checks the
clue, so a setter who lied about it cannot reveal at all. Then it marks every guess itself and pays.
No oracle, no server, no signature from anybody.

The case that makes it safe to sit down at is the setter who would lose and simply goes quiet.
**Silence is a loss.** Once the reveal window closes, anyone can call `claimTimeout` and the entire
pot goes to the caller — so staying quiet is strictly worse than losing honestly, and there is never
a reason to prefer it.

SHA-256 rather than keccak for the commitment, deliberately: Solidity has it as a cheap precompile
and the browser has it natively, so both sides compute the identical hash with nothing in between
and a player can verify a hand in their own browser with no library and no wallet.

### What is trusted, stated plainly

The owner can name which stablecoins are accepted and can lower the fee. They cannot touch a table,
decide a hand, move a stake, or pause the escrow. There is deliberately no pause function, because a
pause on an escrow is a freeze on other people's money.

### The details that bite

USDT does not return a bool from `transfer`, so a plain `IERC20` call reverts against it on some
chains — both directions go through a low-level call that accepts empty returndata or an explicit
true and nothing else. Pulls are balance-checked before and after, so a fee-on-transfer token cannot
silently short the pot. The salt is 32 bytes from the system CSPRNG, because with a 749-word deck a
weak salt would let anyone brute-force the commitment in milliseconds.

The client shows the token address it is about to let you approve, links it to the explorer, and
reads `symbol()` and `decimals()` from that address before proceeding. A pasted or poisoned address
cannot get past that quietly.

### What is proven, and what is not

`fair.js` runs against the shipping code: keccak against published vectors and independently against
the fixed ERC-20 selectors, the commitment binding a word, 400 salts producing 400 distinct values,
a brute-force walk of the deck finding nothing, the clue check rejecting a word that breaks it, and
4,030 markings agreeing with an independently written implementation — doubled letters included,
which is where naive implementations diverge and pay the wrong person.

**The contract itself is unaudited.** It could not be compiled or fuzzed in this environment, and
that is the real risk in the crypto build — not the game. It should not hold real money until it has
been through a security review.

---

## The music

Written here rather than licensed. A track bought "royalty free" is still a file to ship, an
attribution line to honour, a licence to keep on record and a third-party-content declaration at
submission — and it cannot react to anything. This is a few hundred bytes of arithmetic that belongs
to nobody but the project.

There are four, and they rotate.

**DEEP** (104 BPM) is the eight-bar vamp — Gm9, Ebmaj7, Cm9, Dm7, two bars each. Slow harmonic
rhythm on purpose: a filtered pad, a sub on the root, a soft four-on-the-floor kick, offbeat hats,
and a plucked pentatonic figure that only appears on alternate bars so the loop breathes.

**NIGHT DRIVE** (96 BPM) is the quietest thing here — Cm, Abmaj7, Ebmaj9, Bbsus, half-time, almost
no top end. It is what plays while somebody stares at four candidates.

**NEON** (114 BPM) is Bb–F–Gm–Eb, the loop every uplifting house record is built on, with offbeat
bass and a plucked line that is an actual tune rather than an arpeggio.

**SURGE** (126 BPM) is the one with the drop. Sixteen bars with a real shape: six of build with the
filter opening and a snare roll that doubles every couple of bars until it is a blur, then **one bar
where the kick disappears entirely**, then eight bars of drop — hard kick with a click on top,
offbeat sub, and a sawtooth hook. Taking the kick away for that one bar is the whole trick; it is
what makes putting it back feel like something. The test measures it: bar 8 comes back at 4.2× the
bar before it, and it fails the build if the hush is ever not the quietest bar in the track.

Shuffle walks the three calm ones and never plays the same twice running. It **never hands you
SURGE unasked** — a banger under a thinking game is the wrong instinct — but a speed table forces
it, because ninety seconds a hand has earned it. The profile has a picker if you want to choose.

Every track is a pure function of the bar number, so all four render offline and get measured on
every run: level, peak, whether the loop comes round, whether the chords actually change, and for
SURGE whether the drop drops.

It sits **11 dB under the money sound** and ducks to about a quarter of its level whenever something
actually happens — a payout, a cracked word, the bell that starts a hand. It stops when the tab is
hidden. It has its own switch in the profile, separate from the sound effects, and the master mute
reaches both.

`music.js` checks that the loop actually comes round (pass two within 0.00 dB of pass one), that it
breathes rather than drones (2.7× between the quietest and loudest beat), that four distinct chord
roots appear across the eight bars, that the headroom under the effects stays inside a sane window,
and that shuffle neither repeats nor leaks the drop track into ordinary play.

`render.js` writes all four tracks and a 29-second montage of every effect out to real audio files
through the exact chain the game plays them through, because "trust me, it sounds good" is not a
thing anybody should have to accept.

Writing it surfaced a real bug: the scheduler read the audio context from a global at schedule time,
so anything that swapped that global — the offline renderer, for instance — left it building nodes
on one context and connecting them to another. It now holds its own reference and stops itself if
they ever disagree.---

## Three word lengths, and why they are mixed

A hand is four, five or six letters, and the five cards a setter is dealt are always the same length
as each other. Which length it is changes the problem, and not by a little:

| | words | cracked in three |
|---|---|---|
| four letters | 953 | **32%** |
| five letters | 1,394 | 48% |
| six letters | 1,229 | **68%** |

That gap is the interesting part, and it runs the opposite way to most people's intuition. A longer
word feels harder because there is more of it. In fact there is more of it *to grip*: six letters
give a guess six positions to land on and a much more constrained set of words that fit. Four
letters hide less information but also offer less purchase, so a four-letter word is the hardest
thing at the table.

Which makes the length a **read**, before the clue. Somebody setting a four-letter word with a
generous-looking pin is doing something quite different from somebody setting a six-letter word with
the same clue, and the price they name should tell you which.

Mixing them inside one match rather than splitting them into three tables was the other decision.
Three tables would have been cleaner to reason about and would have split a launch audience three
ways on the day nobody is there yet. Mixed, every player sees all three shapes in six hands, and the
daily stays one board.

**Everything that was a flat number had to become a fraction.** The clue floor was "no clue may
leave more than 250 words standing" and the price caps were 90 and 170 — all tuned against a
749-word deck. Held as counts, a float on a common letter would have been legal at four letters and
illegal at six for no reason anybody could feel. They are now the same *share* of whichever deck the
hand is drawn from, so a clue that cuts the field to an eighth charges top price at every length.
The difficulty bands are per-length quintiles for the same reason: scored against the five-letter
deck, every four-letter card would have read SHARP and the setter's choice would have stopped
meaning anything.

---

## The words, and the three filters

The deck went from 749 words to 3,576, and 20,429 words are accepted as guesses. Both numbers matter
for different reasons, and the way they were built is different.

**Answers are curated.** They come from lists written for the purpose — words an average adult
recognises instantly — then checked for spelling against the system dictionary, filtered for safety,
and measured. The system dictionary is *advisory* here, not a gate: the one on this machine is
missing words as ordinary as READ, INTO and UNDER, and letting it veto a curated word would have
quietly deleted good ones.

**Guesses are generous.** A player who types WARTY and is told it is not a word has been lied to,
and that is the failure mode that matters on this side. So the guess list is everything the
dictionary knows, expanded through its own affix rules, minus only the genuinely offensive.

### Why a guess has to be a word now

It used to be enough for a guess to be five letters with a vowel in it, which made AEIOU legal. In a
deduction game a non-word probe is not a novelty — it is **strictly better than a real word**,
because it can test a whole row of fresh letters at once without wasting positions on structure. The
board was quietly ranking people who knew that. Requiring a real word closes it, and closes a second
thing as a side effect: guesses are visible to anyone holding a PEEK, and a dictionary that was
filtered before it was built cannot be used to spell something at somebody.

### The three filters

They are genuinely different jobs, and conflating them is what produces a filter that blocks SKILL
for containing "kill" and lets real abuse through because the author got tired.

1. **The deck** — words *we* choose to display, so the bar is highest. Out goes anything offensive,
   and also anything merely grim: disease, weapons, drugs, religion, politics. None of that is
   offensive; it just is not what this game is. Three independent reviewers then read the finished
   list as if it were being shown to a child, and what they flagged came out too — including
   BEAVER, DOODLE, CHERRY, SLANT, SLOPE, BRAVE, BROAD, BLAZE, SKUNK and TINKER, every one an
   ordinary English word with an unfortunate second life. The old 749-word deck lost thirteen words
   on this pass, among them SHINE and SPADE, which are slurs most people have never heard used that
   way.
2. **Guesses** — exact match against the offensive list only.
3. **Handles, friend names and table codes** — the only one that needs substring matching, because
   the input is adversarial rather than drawn from a dictionary.

**The substring list is validated against the dictionary itself.** If any term in it can be found
inside a word the game accepts, the build fails. That is what makes the Scunthorpe problem
impossible rather than merely unlikely, and it is not hypothetical: the check rejected "rape"
(GRAPE, DRAPE, THERAPIST), "shit" (MISHIT) and "wank" (SWANK) on the first run. Two of those were
recoverable with a short allow-list; "rape" was not, because THERAPIST is a name somebody will
want, so it is caught by exact match instead. A filter that refuses to let somebody call themselves
THERAPIST has stopped being a safety feature.

Table codes are five random characters, which will eventually spell something — so `makeCode` rolls
again if they do.

---

## The clue does not arrive on colour alone

Green pin, amber float, grey void. That is the entire information channel of this game, and roughly
one man in twelve cannot reliably separate those three. In a free puzzle that is an accessibility
gap; on a board that ranks people it is somebody being unable to compete.

Every tile state now carries a shape as well: a filled dot for a pinned letter, a hollow diamond for
a floating one, a slash for a dead one. On by default, with a toggle in the profile — default on,
because the people who need it are exactly the people who will not know to go looking for a setting.

---

## The daily server, and why it takes decisions instead of a score

Cash on the daily was the decision that forced this. Everything else in the game can be local,
because everything else is either private to one player or derived from the date. A prize cannot be:
somebody has to know who won, and the moment a number worth $100 travels from a phone to a server,
the interesting question is what stops that number being typed in by hand.

The usual answer is to validate the score — sign it, obfuscate it, sanity-check it against a
plausible range. All of those are speed bumps on a road that leads to the same place, because the
number is still authored on the attacker's machine.

So the request has no score in it. It carries what the player *decided*: for their own deal, which
of the five cards they set, which clue they gave and what price they named; for every other hand,
whether they called or folded and every word they guessed. The server takes those decisions, replays
them through the same engine the game runs — same deck, same seeded deal, same bots, same
arithmetic — and produces the score itself. There is nowhere in the protocol to put a forged number,
which is a stronger property than refusing to believe one.

That only works because the daily was already deterministic. The same design decision that lets two
strangers compare a score honestly is the one that lets a server recompute it. Being able to reuse it
this way was luck, but the kind you get from picking determinism early.

**What the engine refuses.** A word that was not among the five dealt. A clue that is not true of the
word. A clue wider than the floor allows, or a price above that clue's cap. A price that is not one
of the three prices. A fifth guess. A guess that is not a guessable word. Play continuing after the
word had already fallen. The wrong number of hands. Each refusal comes back naming the rule, because
the one thing worse than accepting a cheat is telling an honest player "invalid" and nothing else.

**One entry per device per day, and the first one stands.** Allowing a better score to replace an
earlier one turns a contest of skill into a contest of attempts — which is precisely what the
official rules promise it is not, so the storage layer enforces the promise rather than the UI.

**No account.** There is no login, no email, no password and no personal data. A device generates a
random token and that token is the only thing tying today's entry to the same person. That is weaker
than real accounts against a determined multi-accounter, and it is still the right trade: identity
only actually matters at the moment money moves, so verify it there, for the three people a day who
win, rather than charging every honest player a signup.

**The score is not the same object as the stars.** Stars, the chest, and the rating are all banked
locally the instant a hand settles and never wait on a network. Only the cash placing waits, because
a prize can only be claimed against the board that pays it. Showing "FIRST — $100" off the offline
board would be promising money against a fiction, so the trophy needs a rank the server confirmed and
every other state says what is actually true: still sending, could not reach, or not eligible here.

**A dead network must not cost somebody their run.** If the submission cannot be delivered it is kept
on the device and sent on the next launch, and the summary says so in words rather than implying a
prize. This is the failure that would actually hurt — somebody finishing a good run on a train and
losing it — so it is the one with a test that plays a real match with the network pulled out, checks
the run is kept, checks nothing advertises money, then restores the network and checks the run goes
up by itself.

### The bug that made all of this necessary to test properly

Building the server turned up a bug that had been sitting in the game since the daily was written:
`shuffle` was implemented as `.sort(() => Math.random() - 0.5)`. That is a well-known bad shuffle,
but the reason it broke here is subtler than bias. V8 sorts a five-element array by a different
algorithm than a larger one, and the version in Node reached a different permutation than the one in
Chrome — *from the identical sequence of comparator values*. Seeding the random number generator did
not help, because the seed was doing its job perfectly; the sort was not.

The visible symptom was that the server and the game disagreed about which clues had been offered on
some days, which would have rejected honest transcripts at random. Fisher–Yates fixed it. What the
episode is really about is that "deterministic" is a claim about the whole stack, not about your own
code, and the only way to know you have it is to run both sides and compare — which is what
`verify.js` now does on every change, nine whole matches at a time.

---

## What is next

**Validate the fold.** Send it to five friends. The single question that matters is whether anyone *folds and enjoys it*. If people call every hand regardless of the clue, the betting layer is decoration and the game is just a short Wordle. If they start saying "no, that clue is a trap" out loud, it works — and that sentence is also the marketing.

**Then multiplayer.** Cloudflare Durable Objects, one object per table, server-authoritative so the word never reaches a client. Private invite links, bot backfill to six so nobody sees an empty table. Two to four weeks.

**Then the things a betting game earns that a puzzle does not:** a chip ladder across sessions, hand histories worth reviewing, and a shareable result that reports a *decision* rather than a score — "folded four, cracked two, took 1,400 off the table" is a better thing to paste into a group chat than a grid of squares.

---

## Known gaps

~~Guess validation is lenient~~ — fixed: a guess must now be in a 20,429-word dictionary, per length.

~~**No colour-blind mode**~~ — fixed: every tile state carries a shape as well as a colour, on by default.

Bots are local rather than networked. The daily board is real — scored server-side from the transcript — but the rivals at your table are still local bots, and the board falls back to a generated one when the server cannot be reached. Those generated rows are now labelled "house regular" and styled differently, which is honest; on a board that ever pays money they should not appear at all.

**The daily is verifiable but not unforgeable.** The whole day's script is built in the client, so anyone who opens dev tools can read all six words before playing. Server scoring makes an arbitrary score impossible to submit; it does not stop a legal transcript that cracks every word first guess, which scores about 4x a strong honest run. That is acceptable for a board that pays stars and is the blocking fix before it pays anything else. The remedy is for the server to deal the daily hand by hand.

The deck is 3,576 words across three lengths, each with a measured crack rate and a plain-English meaning. That is a real deck rather than a prototype one, but it is curated by hand and the tail will show: expect to add words for years.

The sound was tuned by measurement rather than by ear, so the balance is defensible but not necessarily *right*. It needs one pass from someone who can hear it.
