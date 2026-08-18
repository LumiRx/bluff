# BLUFF

Poker structure, word deduction. You pick a secret word, give the table one clue, name your price,
and bet nobody cracks it. Six seats, six hands, the button rotates so everybody sets the word once.

Two products live in this repo. They share a game and share nothing else.

```
index.html              the game — one file, no dependencies, no build step
dist/                   the shippable web build (manifest, service worker, icons)
server/                 the Worker: the daily board, the player registry, and APNs
site/                   webluff.com — landing page, legal pages, /play/, Pages Functions
contracts/BluffDuel.sol the on-chain heads-up escrow, USDC/USDT
crypto/index.html       the crypto client — web only, never an app store
tools/                  the word pipeline, the engine generator, build + icons
DEPLOY.md               how to ship each piece, and in what order
LAUNCH.md               what is left before submission, ordered by what blocks what
SCALE.md                connection, player capacity, and what it costs
STORE.md                everything App Store Connect and Play Console will ask for
DESIGN.md               why it is built the way it is
```

## The daily server

```bash
cd server && wrangler deploy      # → https://api.webluff.com
```

The one piece that is not static, and the reason the daily board is real rather than generated. It
accepts **the six decisions a player made**, not a score — there is no field in the request for a
score — replays them through the same engine the game runs, and computes the result itself. A
fabricated transcript comes back 422 naming the rule it broke.

Worth being precise about what that does and does not buy you: it makes an *arbitrary* score
impossible to submit. It does not make an *optimal* one impossible, because the daily is
deterministic and the whole script is in the client's memory — anyone who opens dev tools can read
the six words and submit a legal transcript that cracks each on the first guess. That is fine for a
board that pays stars, and it is the thing that has to be fixed before it pays anything else.

One Durable Object per day key, holding a SQLite table. One entry per device per day, and the first
one stands. No login, no email, no personal data: a device makes up its own random token, and
identity is only established at payout, which is the only moment it matters.

If the submission cannot be delivered, the run is queued on the device and sent on next launch, and
the game says plainly that it is saved but not yet up rather than claiming a prize.

## The site

```bash
npx wrangler pages deploy site --project-name=bluff
```

`webluff.com` is the landing page with a playable hand above the fold, `/play/` is the game as an
installable PWA, and `/privacy`, `/terms`, `/rules` and `/support` are the four URLs App Review will
click. The launch-list form needs a KV namespace bound as `SIGNUPS`. See `LAUNCH.md`.

## The store build

**v1 ships free, for everyone, with no money in it.** No prizes, no purchases, no in-app purchases,
no age gate. The daily still has a top three and it pays stars — a score that buys cosmetic looks
only, cannot be bought with money and cannot be cashed out. That takes the App Store rating from
17+ to 4+ and Play from Teen to Everyone, and takes the D-U-N-S number, the NY/FL prize
registrations and the payout rail off the critical path entirely.

Cash is a single flag (`const CASH=false`) rather than deleted code. Turning it back on is a
decision about paperwork and about the daily being unforgeable, not about engineering — see
"What cash would need" in `LAUNCH.md`.

Hands are **four, five or six letters, mixed within one match**. That is not a mode: a four-letter
word hides less, so there is less for a guess to grip, and they fall about a third of the time
against two thirds for six letters. The length is the first read at a table, before the clue.

```bash
npm run build      # dist/
npm run serve      # http://localhost:8080
npm run ios        # Capacitor → Xcode
npm run android    # Capacitor → Android Studio
```

## The crypto build

Heads-up, on-chain, staked in USDC or USDT on Base, Polygon or Arbitrum. **Web only** — Apple and
Google do not approve crypto wagering, so this is not, and cannot be, the same binary.

The hard problem is that the person who picks the word is the person you are betting against.
The contract removes the possibility rather than asking for trust: the setter publishes
`SHA-256(word ‖ salt)` and the clue in plaintext before any money moves, guesses go on-chain, and
the reveal is re-hashed and re-checked against the advertised clue before anything settles. A setter
who would lose cannot escape by staying quiet — silence past the reveal window hands the caller the
whole pot.

`contracts/BluffDuel.sol` is **unaudited**. Do not put real money behind it until it has been.

Deploy it, put the address in `DUEL` at the top of `crypto/index.html`, and the client goes live.

## Rebuilding the words

```bash
python3 tools/build_words.py    # curated lists + hunspell -> decks.json, with a safety audit
python3 tools/rates.py          # measure every word's crack rate by simulation -> rates.json
python3 tools/emit.py           # -> deck-block.js
python3 tools/update_data.py    # drop it into index.html
python3 tools/build_engine.py   # lift the shared core into server/src/engine.js
```

`tools/safety.py` holds the three filters and is the only place a word gets banned. `build_words.py`
refuses to finish if any substring term in the handle filter can be found inside a real word, so the
Scunthorpe problem is impossible by construction rather than merely unlikely.

## Tests

```bash
node test.js     # full match regression, chip conservation, persistence, daily determinism
node words.js    # the deck, the dictionary, and everything that stops a bad word reaching a screen
node friends.js  # two players in two contexts: claimed handles, real friend scores, a real invite
node verify.js   # the server scores whole real matches identically to the game
node link.js     # a real run travels game → server → board → back into the summary
node api.js      # the Worker's routing, validation, and refusal to trust a score
node flow.js     # every screen, every button, in and back out, with the sound hooks counted
node pwa.js      # manifest, gate, official rules, safe areas, service worker, offline
node fair.js     # keccak vectors, commit-reveal, brute force, clue binding, 4030 markings
node audio.js    # every sound rendered offline and measured
node fit.js      # four viewports, no overflow
node music.js    # the bed loops, breathes, changes chord, and stays under the game
node site.js     # every landing and legal URL, the playable demo, and what is still a placeholder
node store.js node home.js node items.js node muck.js node clock.js node chest.js
```

Nineteen suites. They are the reason changes to this thing are cheap.

`words.js` is the one that has to stay green forever. A deck word is chosen by us and shown in large
letters with its meaning underneath; a handle appears on a public board; a table code gets
screenshotted into a group chat. Each is a different filter with a different bar, and the failure
modes are opposite — too loose and the game says something awful, too tight and it refuses to let
somebody be called NIGHTOWL. The suite checks both directions every run.

`verify.js` and `link.js` are the two that gate money, and they answer different questions.
`verify.js` asks whether the server's arithmetic matches the game's, by playing nine whole matches in
a real browser across three days and three playing styles and demanding an identical score.
`link.js` asks whether the game actually *sends* the right thing and does something sensible with
the answer — including with the network pulled out mid-run. A green `verify.js` and a broken
`link.js` is a product where honest players silently lose their entries.
