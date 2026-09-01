# What is left before submission

v1 ships **free, for everyone, with no money in it**. That was a deliberate decision and it deleted
most of this document: with no prize promotion there is no entity requirement, no state
registrations, no payout rail and no age gate, and the store rating drops from 17+ to 4+.

What is left is mechanical.

---

## Blocking

**1. Fill in the placeholders.** `[LEGAL ENTITY]` appears on every page of the site and
`[STATE / COUNTRY]` in the terms. `node site.js` lists them all on every run. You still need a name
to publish under and a real support address.

**2. ~~Developer accounts.~~ Done.** The App Store Connect API key is wired up —
`tools/appstore/README.md` has the install and the verification. Google Play is $25 once, when you
get to it.

**Decide the bundle ID before the first upload.** `capacitor.config.json` says `gg.bluff.app` but
the domain is `webluff.com`, so `com.webluff.app` is the conventional choice. It makes no technical
difference — but a bundle ID **cannot be changed after the first upload**, so it is worth thirty
seconds now rather than a new app record later.

**3. Deploy the server before the site.** `DEPLOY.md` has the order. The daily board is real and
server-scored; if the site goes up first, the first players submit runs into nothing and are told
their run is saved but not yet up. True, but a poor first impression.

---

## Mechanical, and quick

**Assets and metadata** — all the copy, keywords, review notes and rating answers are in `STORE.md`,
ready to paste.

- **Screenshots**: 6.9" (1320×2868) and 6.5" (1242×2688) for Apple, plus a Play feature graphic
  (1024×500). Six shots, in the order given in `STORE.md`; the first two are the only ones most
  people see. Make one of them a four-letter hand and one a six — the variable length is the thing
  that is new and it does not read from a description.
- **App icon**: `dist/icons/appstore-1024.png` is already alpha-free, which is what the store
  rejects people for.
- **`PrivacyInfo.xcprivacy`**: `NSPrivacyTracking = false`, empty tracking domains, one
  required-reason entry for `UserDefaults` (`CA92.1`).
- **Export compliance**: HTTPS only, no proprietary cryptography, so it is exempt — but you still
  have to answer. Add `ITSAppUsesNonExemptEncryption = false` to `Info.plist`.
- **Content rights**: "no third-party content". True, and worth knowing why — every sound and the
  whole music bed are synthesised at runtime, so there is no licence to declare and nothing anybody
  can claim. The word list is built from a curated set plus the system dictionary; no third-party
  word list ships.
- **Age rating**: answer **No** to every gambling, contest and prize question, because there are
  none. Expect 4+ on Apple and Everyone on Play. There is no chat and no user-generated content
  beyond a handle, which is filtered.
- **Account deletion**: Apple requires in-app deletion for apps with accounts. BLUFF has no account;
  Reset Career erases everything on device. Say exactly that in the review notes.

**Store URLs** — all four exist and are checked on every run of `node site.js`: `webluff.com`,
`/privacy`, `/terms`, `/support`.

---

## Deploying

`DEPLOY.md` is the full runbook. The short version:

```bash
cd server && wrangler deploy                              # api.webluff.com
npm run build && cp -r dist/. site/play/                  # stamps the SW cache key
npx wrangler pages deploy site --project-name=bluff       # webluff.com
```

**Bump `package.json` version on any release that touches game logic.** That is what changes the
service worker's cache key. A stale client can produce a transcript the current server refuses, and
the player would be told their honest run is invalid.

---

## What cash would need, when you want it

Cash is one flag (`const CASH=false` in `index.html`). Everything it used to switch — the age gate,
the region gate, the excluded states, the prize strip, the official rules — is still there and comes
back with it. What has to be true first:

**1. The daily has to be unforgeable.** Right now the whole day's script is built in the client, so
the six words sit in memory before the first hand is played. Server verification means a *made-up*
score is impossible; it does not stop somebody reading the words and submitting a legal transcript
that cracks each on the first guess, which scores about 4× a strong honest run. The fix is for the
server to deal the daily hand by hand and mark the guesses, so the word never reaches the client
until showdown — roughly a week, and the same machinery live multiplayer needs anyway.

**2. One entry per device is not a real control.** Clearing site data buys another run. Keep entry
frictionless and verify identity at *payout* instead, deduplicating per person rather than per
device — which you need for tax paperwork regardless.

**3. The paperwork.** An entity and a D-U-N-S number (free, ~2 weeks). NY and FL registration and
bonding above a threshold, RI its own filing, all with deadlines *before* the promotion starts. A
payout rail: W-9 collection, 1099-MISC at $600/year, identity verification. And a skill-gaming and
sweepstakes lawyer, state by state — the structure is defensible but that is a starting position
for the conversation, not a substitute for it.

**4. The board has to stop mixing house regulars into real runs.** It labels them now, which is
honest, but a board that pays money should carry only people.

---

## Running ads against it

The landing page is built for this. The playable demo sits above the fold on desktop and directly
under the headline on mobile — a visitor plays one hand before deciding whether to care, which is
the entire conversion argument.

- **The claim to lead with** is still *"Wordle tells you what to guess. BLUFF makes you decide
  whether to guess at all."* That is the differentiator and it is in the H1.
- **The second claim** is the one that is new: hands are four, five or six letters, and a
  four-letter word is the hardest thing at the table because there is less of it to grip.
- **No compliance copy is required any more.** There is no prize, so there is nothing to disclaim —
  which also means the ad account is a normal one rather than a prize-promotion one, and Meta and
  Google stop being a problem.
- **The social card** (`og.png`) is 1200×630.
- Point paid traffic at `/play/` for install intent and at `/` for anything that needs explaining.

---

## What I would not wait for

Live multiplayer. The single-player game is finished, the daily gives people a reason to come back,
and the challenge flow already puts two friends on identical hands without a server. Ship, find out
whether anyone folds and enjoys it, and build tables once you know the answer.
