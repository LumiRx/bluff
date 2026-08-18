# Accounts, purchases and ads — what changes and in what order

Four decisions were taken on 10 August 2026 and they change the product, not just the build:

1. **Hold the submission.** One launch, with monetization already in it.
2. **Stars become stakeable and purchasable**, and the free rebuy gets weakened so that running
   dry is a real moment.
3. **Rewarded video** for a rebuy or a power-up.
4. **Phone-number accounts**, so a record survives the phone and people can find each other.

Every one of those is defensible. Together they turn a 4+ game that collects nothing into a 17+
game that collects a phone number and sells a currency you wager. That is a normal product — most
of the top-grossing word games are exactly this — but it is a different product from the one whose
store listing is sitting in App Store Connect right now, and the listing has to be rebuilt around
it rather than edited.

---

## What is already done

`server/src/accounts.js`, `server/src/sms.js`, wired into the `Players` durable object and the
Worker. `node auth.js` runs the real SQL against a real SQLite database and proves 40 things,
including the two that matter if this ever goes wrong.

**The phone number is never stored.** Not encrypted, not "hashed" with something a rainbow table
eats for breakfast — a ten-digit space falls to brute force in minutes. What is written down is
`HMAC-SHA256(E.164, PHONE_PEPPER)`, where the pepper is a Worker secret that never touches the
database. Sending a message needs the plaintext and we have it at that moment, because the player
just typed it; we do not need it afterwards, so we do not keep it. The last four digits are kept on
their own so a screen can say "sent to ••••0142". The test dumps every table and asserts the number
is not in any of them.

**A copy of the database does not let you sign in as anybody.** Session tokens are stored as
hashes, so the row is not the token. The test lifts a row straight out of the `sessions` table and
proves it does not work as a credential. Codes are stored the same way.

The rest of it: six digits, ten minutes, five attempts and then the code is burned rather than
slowed; thirty seconds between messages, four an hour per number, twelve an hour per address; an
allowlist of countries checked before anything reaches a carrier. That last one is not
belt-and-braces. **SMS pumping** is an industry, not a hypothetical: a bot requests codes to premium
ranges and somebody collects a cut of the carrier revenue. Firms have lost six figures in a weekend
to an unguarded `/send-code`. The allowlist is the only control that works *before* the money is
spent.

Signing in adopts what the device already had — the handle, the rating, the record — rather than
starting anyone over, which is the whole point of the change. Deleting an account really deletes it
and puts the handle back on the shelf, because Apple requires that of any app that lets you make
one, and because a promise about a phone number you cannot withdraw is not worth making.

### Secrets to set — none of these ever go in a chat window

```bash
cd server
wrangler secret put PHONE_PEPPER      # 32+ random bytes; changing it orphans every account
wrangler secret put SMS_PROVIDER      # twilio | messagebird | log
wrangler secret put TWILIO_SID
wrangler secret put TWILIO_TOKEN
wrangler secret put TWILIO_SERVICE    # or TWILIO_FROM
wrangler secret put SMS_COUNTRIES     # e.g. +1,+44 — start with one
```

Until `SMS_PROVIDER` exists, sign-in reports that it is not switched on rather than pretending. In
`log` mode the code goes to the Worker log and the response says plainly that nothing was
delivered, which is a state the client has to handle anyway — a carrier dropping a message looks
identical from the outside.

---

## The three things that gate the launch date

These have queues in front of them. Nothing in the code can shorten them, and starting them late is
the most likely reason this slips.

**A2P 10DLC registration.** Since 2023 every US carrier requires a registered brand and campaign
before a business can send application-to-person SMS. Unregistered traffic is filtered or blocked
outright — it does not bounce loudly, it quietly does not arrive. Registration means an EIN, a
company address, a sample message and a use-case declaration, with fees and a review that takes
days and can be rejected and resubmitted. Toll-free verification is the alternative and has its own
queue. **Start this first, today, before any of the app work**, because everything else here can be
built in parallel and this cannot be hurried.

**Banking and tax in App Store Connect and Google Play.** You cannot sell anything until the paid
agreements are signed and the bank and tax forms are accepted. That is a real-world identity and
banking process with its own review time.

**AdMob account and app registration**, plus an ads.txt entry if you serve web. Faster than the
other two, but it is not instant.

---

## What the app still needs

In dependency order. The server is done; everything below is client and store work.

**Sign-in.** A phone screen and a code screen, with the number optional at first launch. Apple 5.1.1
lets you require an account when the app is genuinely account-based — leaderboards, friends and a
portable record qualify — but the first hand should still be playable before anyone types a number,
or the funnel dies at the door. Add **Sign in with Apple** alongside it: it costs a day, removes the
whole SMS bill for anyone who takes it, and the moment any third-party login appears Apple requires
it anyway. **In-app account deletion is mandatory**, not optional.

**The rebuy rule.** This is the design decision the monetization actually rests on, and it does not
exist yet. Today `startMatch` silently refills you to the 1,000 buy-in the moment you drop below it,
so there is no reason on earth to buy stars. The shape that works: one free refill on a timer, a
rewarded video for an immediate one, and packs for people who want neither. Pick the timer and the
video reward before writing the StoreKit code, because the numbers decide whether any of it earns.

**StoreKit 2 and Play Billing**, with **server-side receipt validation**. Client-side validation of
a consumable currency is forgeable in an afternoon, and stars are now worth forging because they
are worth money. The Worker gets a `/v1/purchase/verify` that talks to Apple and Google directly
and credits the account — never the device.

**AdMob rewarded video.** See the open question below about where it goes.

**Age rating and review notes.** Expect **17+ / 18+**. Simulated gambling stops being a clean No the
moment a purchasable currency is wagered at a table with a pot, a button, an ante, a call and a
fold — reviewers respond to presentation as much as to mechanics. `STORE.md`'s review-notes block
argues the current build and is now wrong end to end; it needs rewriting around what is true after
this, which is: no cash prize, no cash out, no real-money wagering, and a purchasable in-app score.

**App Privacy labels.** From *Data Not Collected* to Contact Info (phone number, linked to identity),
Purchases, and — once AdMob is in — Identifiers and Usage Data used for advertising, with an ATT
prompt and a `PrivacyInfo.xcprivacy` listing tracking domains. The privacy policy is rewritten, not
amended: it currently says the app collects nothing, and that stops being true.

**The store assets.** Screenshot 10 says *0 ads · 0 accounts · 0 pay to win* and dies outright.
Screenshot 9 is fine. The description's closing line dies. Two new shots are needed — the sign-in
and whatever the star shelf becomes — and the promotional text can stay.

---

## One thing I could not decide for you

The rewarded slot was specified as "while users are waiting for their friends to finish their
hands." **That wait does not exist in the game.** Friends play the same six daily deals whenever
they like; nobody sits on a screen waiting for them. Building a table where you genuinely wait on a
human is asynchronous multiplayer, which is weeks of work and a different product.

There is a real wait, though, and it is bigger than you would guess. Timing the recording for the
app previews: the player presses DEAL IT at 15.9 seconds and the hand resolves at 32.3. **Sixteen
seconds, every hand, six hands a match** — watching five bots decide whether to call. It is the most
common idle moment in the game by a wide margin, and it is the natural home for a rewarded or
interstitial slot.

So the choice is between an ad in that gap, an ad on the bust-and-rebuy moment, or building async
tables so the friend-wait becomes real. The first two exist today.
