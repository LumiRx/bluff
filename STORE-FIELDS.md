# App Store Connect — every field, rewritten for what actually shipped

The listing was written for a free game with no purchases, no ads and no accounts. The app now has
all three. Everything below is rebuilt around what the code does, checked against the code rather
than remembered.

---

## A correction I owe you, and it is good news

I told you three times to expect **17+**. Having gone and read Apple's actual definitions rather
than working from memory, that is wrong, and the distinction matters:

> **Gambling** — betting or wagering with real money, *or with an in-game currency that can be
> exchanged for real money*. Pushes to 17+.
>
> **Simulated Gambling** — betting or wagering **without** real money or exchangeable currency.
> Typically 4+ to 9+.

Stars are purchasable but **cannot be cashed out, sold or transferred**, and there is no path from a
star back to a dollar. That makes BLUFF simulated gambling, not gambling. Expect **9+, possibly
13+** — not 17+.

That is worth more than it sounds. 4+ would drag you into child-directed advertising treatment,
which guts ad rates and adds COPPA obligations. 17+ costs you discovery and puts you next to casino
apps. **9+ or 13+ is exactly where a word game with a shop wants to be**, and it is where the honest
answers land you.

---

## Age rating questionnaire

| Question | Answer | Why |
|---|---|---|
| Gambling | **No** | No real money is ever at stake and no star can become one. Nothing is cashable, sellable or transferable. |
| Simulated Gambling | **Yes** | Players wager an in-game currency at a table with a pot, an ante, a call and a fold. The presentation is poker even though the mechanic is deduction. Answering No here would be the lie that gets found. |
| Contests | **Yes, Infrequent** | The daily leaderboard is a skill contest. No prize of value attaches to it — the top three take stars, which are a score. |
| Loot Boxes | **No** | Nothing randomised is ever sold. Every purchase is a fixed, stated amount of stars. |
| Advertising | **Yes** | One opt-in rewarded video. No banners, no interstitials, nothing that interrupts a hand. |
| User-Generated Content | **Yes, limited** | A nine-character handle and nothing else. Filtered against an abuse list before it can reach a board. No chat, no messaging, no free text anywhere. |
| Unrestricted Web Access | **No** | No browser, no arbitrary links. |
| Violence / Sexual / Horror / Profanity / Drugs / Alcohol | **No** | The word list is filtered three ways at build time and `node words.js` fails the build on a hit. |
| Medical or Wellness | **No** | — |
| Parental Controls / Age Assurance | **No** | Nothing gated by age; there is nothing to gate. |

**Do not be tempted to answer No to Simulated Gambling.** The app is visibly a poker table. A
reviewer who sees a pot and a fold button and a No on that question stops trusting every other
answer on the form.

### Setting 13+ deliberately

You do not pick the tier — Apple computes it from the answers above, and these answers will most
likely produce **9+**. But App Store Connect lets you *voluntarily set a higher rating than the
questionnaire returns*, and here there is a real reason to take it to **13+**.

COPPA attaches to users under 13. An app rated 9+ is reachable by them, which means child-directed
advertising treatment: no personalised ads, a much thinner demand pool, and materially lower AdMob
rates — plus a set of data obligations you would rather not carry for the sake of a currency-wagering
word game. Rating 13+ removes that whole category of problem for the cost of a slightly narrower
audience that was never really the audience anyway.

So: answer the questionnaire honestly, let it return what it returns, then raise the final rating to
13+. That is a legitimate use of the control — it is there for exactly this. What is not legitimate
is bending an answer to reach a number, which is why the answers above stay as they are.

---

## App Privacy — what changed and why

Was **Data Not Collected**. That stopped being true. The declarations now:

| Data | Linked to identity | Used for | Notes |
|---|---|---|---|
| **Phone Number** (Contact Info) | Yes | App Functionality | Never stored. What is written down is `HMAC-SHA256(E.164, PHONE_PEPPER)` under a Worker secret that never enters the database, plus the last four digits so a screen can say ••••0142. Proven by `node auth.js`, which dumps every table and asserts the number is in none of them. |
| **Purchase History** | Yes | App Functionality | Transaction ids and product ids, so a purchase can be credited once and refunded correctly. |
| **User ID** | Yes | App Functionality | The account id and the handle. |
| **Gameplay Content** | Yes | App Functionality | The six daily decisions, so the server can re-score them. |
| **Device ID / Advertising Data** | Yes | **Third-Party Advertising** | AdMob only. This is the declaration that requires an **App Tracking Transparency** prompt and a `PrivacyInfo.xcprivacy` listing Google's tracking domains. |
| Coarse Location | **No** | — | City boards use Cloudflare's request-level geo on the server. No GPS, no permission prompt, nothing collected from the device. |

**Data Used to Track You:** the advertising identifier, once AdMob is live. Nothing else.

---

## Review notes — paste this whole block

```
BLUFF is a word-deduction game shaped like poker. Six players are dealt a table; on your turn you
choose a secret word, give the table one clue, and set a price. Everyone else decides whether to
pay it. It is a game of deduction wearing poker's structure.

1. NO REAL-MONEY GAMBLING. Stars are an in-app score. They cannot be cashed out, sold, transferred
   or exchanged for anything of value, inside the app or outside it. There is no payout mechanism
   anywhere in the product and no code path that could become one. We have answered YES to
   Simulated Gambling because players do wager stars at a table, and NO to Gambling because no real
   money or convertible currency is ever at stake.

2. NO CONTEST PRIZES. The daily leaderboard ranks skill on a fixed problem — every player in the
   world receives the identical six hands each day. The top three receive stars. There are no cash
   prizes, no sweepstakes and no prize of value of any kind.

3. THE DAILY IS FREE AND CANNOT BE BOUGHT INTO. It costs no stars, requires no stake, and is
   playable on an empty balance. Nothing purchasable affects a daily score or a daily ranking. Every
   run is re-scored on our server from the decisions that produced it; a score is never accepted
   from a client.

4. IN-APP PURCHASES are three consumable star packs. Stars are a table stake and buy cosmetic table
   looks. They do not affect the odds of any hand, the rating, or the daily board. Purchases are
   verified server-side against the App Store Server API before any star is credited; the client
   cannot state an amount.

5. ADS are a single opt-in rewarded video, offered only when a player has run out of stars, capped
   at five a day. No banners, no interstitials, nothing that interrupts play. A player who never
   watches one is never blocked — the free stake returns every four hours regardless.

6. ACCOUNTS are optional. The game is fully playable, including the daily, without one. A phone
   number is requested only when a player wants their record to survive the device, or wants to
   make a purchase. The number is not stored: we keep an HMAC of it under a server secret plus the
   last four digits. Account deletion is available in-app at Profile > Delete Account and really
   deletes, releasing the handle.

7. USER-GENERATED CONTENT is a nine-character handle, filtered against an abusive-word list before
   it can appear anywhere. There is no chat, no messaging and no free text. Friends are added by
   typing an exact handle; there is no discovery or search, so a stranger cannot reach anybody.

TEST ACCOUNT: not required — the app is fully playable on first launch with no sign-in.
```

---

## Promotional text — 164 / 170

```
Six seats, six hands, and the deal rotates. On your hand you pick a secret word, give the table one
clue, and name your price. The whole world plays the same daily.
```

## Keywords — 93 / 100

```
daily,puzzle,deduction,letters,brain,strategy,guess,vocabulary,spelling,anagram,wordgame,solo
```

## Support / Marketing URL

```
https://webluff.com/support
https://webluff.com
```

---

## Description — 3,147 / 4,000

Only the first three lines show before "more". The last two sections exist because a listing that
hides its own monetization gets one-starred by the people who find it, and because every sentence in
them is checkable against the build.

```
Most word games hand you a puzzle and ask you to solve it. BLUFF deals you a table and asks a harder question: is this one worth playing at all?

Six seats. Six hands. The deal rotates, so everyone sets the word exactly once.

On your hand you are dealt five candidate words with the crack rate printed on each — how often that word gets solved in three guesses, given an ordinary clue. Pick one, give the table exactly one clue about it, and name your price. Everyone else looks at that clue and makes a single decision: pay to guess, or fold and keep their stars.

Call, and you get four guesses — but only the first three beat the setter. Crack it and the setter pays you. Miss and you pay them. Fold and it costs you nothing, and a laydown you were right to make still scores.

That one decision is the whole game. A generous clue draws callers and caps what you are allowed to charge. A mean clue scares the table off and wins you almost nothing. The stars are in a word that looks beatable and is not.

THE DAILY IS FREE AND ALWAYS WILL BE

Every player in the world is dealt the identical six hands until midnight. It costs no stars, needs no stake, and cannot be blocked by an empty bankroll. The board ranks decisions — what you cracked, what you held, and what you were right to refuse — and every run is re-scored on our side from the decisions that produced it. There is nothing you could buy that would move you up it.

WHAT IS IN IT

• Four, five and six-letter hands, mixed in the same match. A short word hides less and gives a guess less to grip, which is what makes four letters the hardest thing at the table
• Titles held by one player at a time — best in the world, best in your city — that change hands the moment somebody plays better
• Badges you earn by playing, and some you would rather not: THE ROCK, CALLING STATION, MOST BULLIED, NOBODY CALLS
• A rating and a public win-loss record that follow you, and a ladder that seats you against players your own size
• Friends by exact handle, playing your deals, with a challenge that lands on their phone
• Power-ups earned at the table and never sold: a free letter, a gift to a rival, a peek at their board, a scrambled keyboard, a seat change, a rare word swap
• Speed tables at 90 seconds a hand, the clock invisible until the last 30 seconds
• Private tables by code or QR, so a table of six can be your six
• 3,576 answers, each shown at the end of the hand with how to say it and what it means
• Every tile carries a shape as well as a colour, so nothing here depends on colour vision

STARS, PLAINLY

Stars are your stake at a table and they buy the look of your felt. You win them by playing. If you run out, the house stakes you again every four hours for free, or you can watch a short video, or you can buy some — your choice, and the first one always works. Nothing you buy changes a hand, a rating, or a place on the daily board, and stars cannot be cashed out or transferred.

Ads are opt-in only. There are no banners and nothing interrupts a hand — the single ad in the game is a video you can choose to watch when you have run dry, in exchange for a stake.
```

---

## Price and availability

**Free**, with three in-app purchases:

| Product ID | Type | Stars | Price |
|---|---|---|---|
| `gg.bluff.stars.handful` | Consumable | 5,000 | $1.99 |
| `gg.bluff.stars.stack` | Consumable | 16,500 | $4.99 |
| `gg.bluff.stars.vault` | Consumable | 46,000 | $9.99 |

Those identifiers are a contract with `server/src/purchases.js`. The star amounts live only on the
server — the client has no say in how much it bought, which is what `node pay.js` proves.
