# BLUFF — store submission kit

Everything here is written to be pasted, not rewritten. Where a field decides whether the app is
approved rather than how it is described, the reasoning is in the margin.

---

## The one thing that decides everything

**There is no money in this app.** No prizes, no purchases, no in-app purchases, no currency that
can be bought or cashed out. That single fact answers almost every hard question a store asks, and
it is why the rating is 4+ rather than 17+.

- **The daily is a leaderboard, not a contest.** Every player in the world is dealt the identical
  six hands each day and the board ranks how well each person played that fixed problem. The top
  three take **stars** — an in-game score.
- **Stars are not a currency.** They cannot be bought with money, cannot be sold, cannot be cashed
  out, and buy nothing but the look of your table. They change no hand, no rating and no place on
  the board. Power-ups are earned in play and are never sold.
- **There is no wagering.** The game is *shaped* like betting — you name a price and other players
  decide whether to pay it — but the only thing at stake is a score.

Answer **No** to every gambling, simulated-gambling, contest and prize question. All three are true.

If cash prizes are ever switched on, this document changes substantially and the rating goes to
17+; see "What cash would need" in `LAUNCH.md`.

---

## App Store Connect

**Name** BLUFF: Word Poker
**Subtitle** Set the word. Bet they miss.
**Bundle ID** gg.webluff.app · **SKU** BLUFF001
**Primary category** Games → Word · **Secondary** Games → Board
**Age rating** expect 9+ or 13+ — questionnaire and reasoning in `STORE-FIELDS.md`
**Price** Free · three consumable star packs at $1.99 / $4.99 / $9.99

### Every text field, the age rating, the privacy labels and the review notes

They live in **`STORE-FIELDS.md`**, rewritten on 11 August 2026 for the build that actually ships —
phone accounts, three consumable star packs and one opt-in rewarded advert. This section used to
carry a second copy and the two disagreed within a day, which is exactly the failure that gets an
app rejected under 2.3.1. One copy now.

**The headline correction in there:** the rating is **not 17+**. Apple defines Gambling as wagering
real money *or a currency exchangeable for it*, and Simulated Gambling as wagering without either.
Stars cannot be cashed out, sold or transferred, so the honest answers are No to Gambling, Yes to
Simulated Gambling, and the tier lands at **9+ or 13+**.

### Review notes — paste this whole block
```
BLUFF is a free word-deduction game. There is no money in it anywhere.

1. NO PRIZES. The daily leaderboard awards in-app "stars" only. There are no cash prizes, no
   sweepstakes and no contest of any kind.

2. NO PURCHASES. The app has no in-app purchases and no purchasable currency. Stars are earned by
   playing and can only be spent on cosmetic table looks. They cannot be bought, sold or redeemed.

3. NO WAGERING. The game borrows poker's structure — a player sets a secret word, gives one clue and
   names a price, and other players choose whether to pay it — but the only stake is an in-app
   score. No real money or purchasable item is ever at risk.

4. NO ACCOUNT AND NO PERSONAL DATA. There is no sign-up. A random token generated on the device is
   the only identifier. On finishing the daily the app sends that token, the chosen handle and the
   six decisions the player made, so the leaderboard can re-score and rank them. Nothing else leaves
   the device.

5. USER-GENERATED CONTENT is limited to a 9-character handle, filtered against an abusive-word list
   before it can appear on a leaderboard. There is no chat, no messaging and no free text anywhere.
   Players may add friends by typing an exact handle; there is no discovery, no search and no way to
   browse other players, so nobody can be contacted by a stranger who does not already know their
   handle.

7. PUSH NOTIFICATIONS are used for one thing: telling a player that a friend has challenged them to
   that day's table. Permission is requested only after the player has added a friend, never on
   first launch, and the app is fully usable if it is declined.

6. ACCOUNT DELETION. There is no account to delete. Profile > Reset Career erases everything the app
   holds on the device.
```

### Age rating questionnaire
| Question | Answer | Why |
|---|---|---|
| Contests | **No** | The daily awards in-app stars, not prizes |
| Simulated gambling | **No** | No casino simulation, and no purchasable currency is ever staked |
| Gambling (real money) | **No** | No stake is ever placed on an outcome |
| Violence / sexual / horror / profanity / drugs | **No** | The word list is filtered for all of these |
| Unrestricted web access | **No** | No browser, no chat |
| User-generated content | **No** | A filtered handle only, checked against an abuse list; no chat, no messaging, no profile text |

Expect **4+** on Apple and **Everyone** on Google Play.

### Privacy — App Privacy nutrition labels
**Declare: Identifiers → Device ID and User ID, linked to the user, App Functionality, NOT used for
tracking.** Since friends became real this is no longer a Data Not Collected app, and answering it
that way would be wrong.

What is actually collected, and nothing else:

- **A random device token**, generated on the device. The only identifier held. Not the advertising
  identifier, and useless for recognising anybody anywhere else.
- **The handle the player claims** — a chosen display name, which is a User ID under Apple's
  definitions because it is how one player is distinguished from another.
- **A push token**, only if the player turns notifications on.
- **What they decided in the daily**, so the board can re-score it. Gameplay content, App
  Functionality.

Still true: no name, no email, no address, no location, no contacts, no advertising identifier, no
analytics SDK, nothing shared with third parties and nothing sold. Answer **No** to "used for
tracking" on every item — none of it is combined with data from other companies.

`PrivacyInfo.xcprivacy` needs `NSPrivacyTracking = false`, an empty tracking domains array, and a
required-reason entry for `UserDefaults` (`CA92.1` — access is limited to the app itself).

### Screenshots
6.9" (1320×2868) and 6.5" (1242×2688) are the required sets; iPad only if you ship for iPad.
Order matters more than count — the first two are the only ones most people see:

1. A live table mid-hand, clue visible, price on screen — make this a **four-letter** hand
2. The call-or-fold decision with the two buttons
3. A cracked word, tiles green — make this a **six-letter** hand, so the two shots together show
   that the length changes
4. The daily board with the podium
5. The showdown teaching the word — pronunciation and meaning
6. The store, showing looks-only

---

## Google Play Console

**Title (30)** `BLUFF: Word Poker`
**Short description (80)** `Pick a secret word. Give one clue. Bet the table can't crack it.`
**Full description** — reuse the App Store body above; Play allows 4000 characters.
**Category** Games → Word · **Tags** Word, Puzzle, Board
**Content rating** IARC questionnaire → answer **No** to every contest, sweepstakes, gambling and
simulated-gambling question. Expect **Everyone / PEGI 3**.

### Data safety form
- Data collected: **No**
- Data shared: **No**
- Encrypted in transit: **Yes** (nothing transmitted, but the app is served over HTTPS)
- Users can request deletion: **Yes** — Profile → Reset career wipes everything on-device

### Real-money gambling declaration
Answer **No** to "Does your app contain real-money gambling?". It does not: there is no wagering and
no money. If Play's reviewer follows up, send the six-point block from the App Store review notes —
it answers the same questions.

---

## Building the binaries

The whole game is one HTML file with no dependencies, so both stores get the same web build inside
a thin native shell.

```bash
npm install                 # capacitor only
npm run build               # dist/ = index.html + manifest + sw + icons
npx cap add ios
npx cap add android
npm run ios                 # opens Xcode
npm run android             # opens Android Studio
```

`capacitor.config.json` already sets the app id (`gg.webluff.app`), the splash, the status bar and
the background colour. Two things are not in it and must be done by hand once:

**iOS.** In Xcode: set the deployment target to iOS 14, set Display Name to `BLUFF`, drop
`dist/icons/appstore-1024.png` into the AppIcon set (it has no alpha channel — the store rejects
alpha), and set the launch screen background to `#0A1210`. Add `PrivacyInfo.xcprivacy` as described
above. Portrait only.

**Android.** In `AndroidManifest.xml` set `android:screenOrientation="portrait"` and
`android:hardwareAccelerated="true"`. Generate the adaptive icon from
`dist/icons/maskable-512.png` — its content already sits inside the safe 80% so nothing is clipped
by the mask. `targetSdk 35`, `minSdk 24`. Sign with Play App Signing.

### Before you submit
- Bump `version` in `package.json` — the build script stamps it into the service-worker cache key,
  so an old build can never outlive a deploy
- `node pwa.js` — proves the manifest is installable, the gate behaves, the rules cover every
  required point, and the game opens with the network off
- `node test.js && node flow.js` — full regression and the complete screen walk
- Confirm the region gate actually blocks: install, select Tennessee, and check the trophy strip
  shows stars rather than dollars

---

## While there is no money in it

Keep it that way deliberately rather than by accident. The moment anything in this app can be bought
— even a cosmetic — the store answers change, the rating changes, and the wall between "a game
shaped like betting" and "a betting game" starts needing a lawyer rather than a paragraph.

If you do want prizes later, `LAUNCH.md` has the list: the daily has to become unforgeable first
(the whole day's script currently sits in the client's memory), one-entry-per-device has to become
one-payout-per-person, and then it is an entity, state registrations, a payout rail and a
skill-gaming lawyer. None of that is on the critical path today, which is the point.
