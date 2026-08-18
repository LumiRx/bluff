# Retention, matchmaking, social and pricing

Written 10 August 2026, against a request that was mostly straightforward and had one thing in it
I want to argue with before anybody builds it.

---

## The books — done, and what they can honestly claim

`server/src/ledger.js`, `node ledger.js`, 32 checks. Every star that exists is an append-only row;
a balance is `SELECT SUM(delta)`. Nothing is ever edited, because a `balance` column somebody
updates cannot answer the only question that matters after something goes wrong, which is *where
did this come from*.

Reconciliation runs after every match and every purchase. The client says what it thinks it has,
the ledger says what it should have, and where they disagree by more than a few hundred stars the
ledger wins and the gap is recorded with a name. A client that has decided it holds four million
stars is told, politely, that it holds what it earned.

**What is prevented, what is only detected.** The daily is verifiable: its deals come from a seed
everybody shares, so the server re-plays the decisions and computes the score itself. A forged
daily is not caught, it is impossible. A cash match is *not* verifiable — it runs on the player's
device against bots from a random seed nobody else holds, and any claim that we validate it would
be a lie. What the server does instead is bound it (a hand cannot swing past what the rules allow),
rate-limit it (thirty matches an hour is already more than anybody plays), and reconcile it. That
is detection, not prevention, and calling it anything else would be the kind of oversold control
that gets trusted right up until it matters.

Flags raised: `impossible_swing`, `match_velocity`, `match_volume`, `overdrawn`,
`stars_from_nowhere`, `stars_missing`. Nothing here bans anybody. It flags, because automatic bans
on heuristics punish the wrong people and the sweep exists so a human can look.

Still to add: device and IP clustering (many accounts, one phone), purchase-then-refund abuse via
Apple's server notifications, and a nightly cron over `anomalies()`.

---

## Matchmaking — the part I want to argue with

The request was to pair people against opponents a little better than them **so they lose more and
buy more**. I'll build the first half and not the second, and it's worth being precise about why,
because the two halves look similar and are not.

**Matching people slightly above their level is good design.** It is how every ranked ladder works,
it is where learning happens, and a player who wins 45% of the time stays far longer than one who
wins 80%. I'll build that: opponents drawn from a band just above the player's rating, disclosed in
the interface the way the ladder screen already describes it.

**Tuning that band against somebody's wallet is a different thing wearing the same clothes**, and
it fails on three counts that all cost money:

- **It is the thing regulators are actively looking at.** The FTC's action against Epic over
  Fortnite's design ran to $520M. EA has been in court over Dynamic Difficulty Adjustment in
  Ultimate Team — the specific allegation being that difficulty was tuned to drive card purchases.
  Belgium and the Netherlands moved on adjacent mechanics. This is not a theoretical exposure and
  it lands hardest on exactly the design being described.
- **It is worse under the rating we are heading for.** Stakeable purchasable currency already takes
  this to 17+ and a close read under App Review 5.3. "We adjust difficulty to increase purchases"
  is the sentence that turns a skill game with a shop into something a reviewer reads as a house
  edge.
- **It breaks the only claim the product actually owns.** Screenshot nine says *a rating that moves
  both ways*. The description says the board *ranks decisions rather than luck*. The daily's entire
  argument — the one in the review notes, the one that keeps this out of the gambling bucket — is
  that everybody gets the identical problem and the ranking is honest. A matchmaker tuned for
  revenue makes all of that untrue, and it only takes one player with a spreadsheet to prove it.
  Word-game players are exactly the people who make spreadsheets.

The commercial goal behind the request is real and I want to serve it. The honest levers that hit
the same number:

- **Win rate near 45–50%**, which is where competitive games find their longest sessions
- **Streak stakes** — the pot grows on a run, so a good run is worth protecting, which is tension
  the player chose rather than tension applied to them
- **The rebuy clock**, already built: four hours is long enough to be worth skipping and short
  enough that nobody is ever stuck
- **Rated tables with a real entry**, where the stake buys standing rather than a better chance
- **Friends**, which is worth more than all of the above put together and is item four below

---

## Leaderboards

The daily board exists. Two more, both cheap:

**Global all-time**, on rating rather than stars, so it is a measure of play and not of spend. This
matters: a leaderboard topped by whoever bought the most is a leaderboard nobody screenshots.

**City**, from Cloudflare's `cf.city` on the request — coarse, server-side, no GPS, no permission
prompt and nothing new in the privacy labels. A city board is the single best sharing hook a word
game has, because being ninth in the world is abstract and being first in Tulsa is a text you send
your brother. Needs a minimum population per city (say 20 players) before it appears, or the first
person in a small town is permanently first and it reads as broken.

---

## Game Center, and sharing

**Game Center** is worth doing and nearly free: leaderboards, achievements, and — the actual prize
— friend discovery through an identity graph the player already has, with no contact upload and no
new privacy disclosure. It also gives iOS players a sign-in that costs no SMS.

**Sharing** should stay a share sheet, not an integration. Nobody wants to connect Facebook to a
word game, and asking for it costs installs. The existing emoji strip is the right shape — it is
what made Wordle spread — and it wants a city rank and a challenge link in it.

**Contact matching** is the powerful one and the one to be careful with. We already hold phone
numbers as HMACs under a server pepper, so a contact list can be matched hash-to-hash without any
number being uploaded in the clear. That is the right way to build it. It still needs an explicit
opt-in that says what happens, because a game that quietly reads your address book is a story, and
it needs a way for somebody to be unfindable.

**Adding a friend** should be: a link, a QR code, a Game Center friend, or a handle typed in. All
four exist or nearly exist. The missing piece is a share link that survives the App Store — open a
challenge link without the app installed and it should land on `webluff.com/t/CODE`, play in the
browser, and carry the code into the app after install.

---

## Pricing

### One-off packs — live, tested, and the identifiers are the contract

| Pack | Stars | Price | Buy-ins |
|---|---|---|---|
| Handful | 5,000 | $1.99 | 5 |
| Stack | 16,500 | $4.99 | 16 |
| Vault | 46,000 | $9.99 | 46 |

Product ids live in `server/src/purchases.js` and must match App Store Connect and Play **exactly**.
The star amounts live there and nowhere else — the client has no say in how much it bought.

The middle tier is deliberately the best value per dollar and carries the flag; almost all revenue
in this shape of game comes from the middle and top tiers, and the $1.99 exists mainly to make the
$4.99 look sensible.

### Subscription — worth doing, and not as a currency drip

The mistake would be "500 stars a day for $4.99." It prices the thing the game already gives away
free every four hours, and it makes the subscriber a worse player rather than a happier one.

What a subscription should sell is **the friction, not the currency**:

| | Free | **Rounder — $4.99/mo or $39.99/yr** |
|---|---|---|
| The daily | every day | every day |
| Rebuy after busting | 4 hours, or an ad | immediate, always |
| Ads | rewarded only, opt-in | none |
| Table looks | earned with stars | the subscriber set included |
| Boards | global, city, friends | plus a rating graph and per-word history |
| Private tables | yes | plus persistent named tables |

That converts the players who are already engaged, costs nothing to the ones who are not, and never
sells an advantage at a table — which keeps *nothing in here buys a win* true, keeps the rating
claim intact, and keeps the App Review argument in one piece.

Auto-renewing subscriptions need their own work: a group in App Store Connect, server-to-server
notifications so a lapse is noticed, restore-purchases, and the subscription terms in the
description and on `webluff.com/terms`. Apple rejects subscription apps for missing that text more
often than for anything else.

---

## On "addicted"

Worth separating two things that get said in the same breath. A game people want to play for hours,
that they think about between sessions and send to their friends, is the goal and everything above
serves it. A game engineered so that people who want to stop cannot is a different product, it
mostly extracts from the small number of people least able to afford it, and it is the reason the
rules above exist at all.

The word-game audience is broad, older on average than most mobile gaming, and it churns hard
against anything that feels like a slot machine. The daily ritual, an honest rating, and a friend
who beat you by nine points are what make this one stick. That is also, conveniently, what makes it
defensible.
