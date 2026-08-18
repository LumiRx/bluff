# Before you press Submit for Review

**Upload a build today. Do not submit it for review yet.**

Those are two different buttons and only one of them is a good idea right now. Getting a binary into
TestFlight de-risks the whole native pipeline — signing, provisioning, the push entitlement, the
icon, the launch screen — and costs an afternoon. Submitting for App Review today would be rejected
on at least five independent grounds, and each rejection round costs days and puts a mark on a brand
new developer account.

Here is the honest state, checked against the code rather than remembered.

---

## Why review would reject it

**1. There is no build.** The `ios/` project now exists on your Mac but `pod install` has never
completed, so nothing has been archived and TestFlight is still empty. `tools/ios.sh` fixes the
CocoaPods failure and carries it the rest of the way; `RUN.md` is the command. Nothing else on this
list matters until a binary uploads.

**2. ~~The listing describes a different app.~~ Done** — The metadata was written for the free version and the
app has changed underneath it:

| The listing says | The app now does |
|---|---|
| "No ads, no purchases, no account, no tracking" | rewarded video, three star packs, phone accounts |
| Screenshot 10: *0 ads · 0 accounts · 0 pay to win* | **fixed** — now *0 pay to win · 6 deals everybody gets · $0 to enter* |
| Price: Free, no in-app purchases | three consumables at $1.99 / $4.99 / $9.99 |

That is not a technicality. Metadata that contradicts the binary is Guideline 2.3.1 — and it is the
kind of mismatch a reviewer notices in the first thirty seconds.

**3. The age rating answers are wrong.** ~~It will come out 17+.~~ **Corrected 11 August:** Apple
defines Gambling as wagering real money *or a currency exchangeable for it*; stars are neither, so
the honest answers are No to Gambling and Yes to Simulated Gambling, landing at **9+ or 13+**. The
questionnaire still has to be redone — it currently says No to everything — but the outcome is much
better than I said. Answers and reasoning are in `STORE-FIELDS.md`. **Done.**

**4. ~~The App Privacy labels are wrong.~~ Done** — Declared *Data Not Collected*. The app now takes a phone
number, records purchases, and — once AdMob is live — an advertising identifier. `PrivacyInfo.xcprivacy`
is written and `tools/ios.sh` installs it (you add it to the target in Xcode, one click). The ATT
prompt is wired to fire once, at the moment somebody chooses to watch an ad — not at cold launch,
which is what drives opt-in into the teens. The App Store Connect answers still have to be typed in
to match it, entry for entry.

**5. ~~The privacy policy says the app collects nothing.~~ Done** — rewritten, along with every other
page on the site that claimed no ads, no purchases or nothing to buy. Postal address and Delaware
governing law are in. `node site.js` reports no placeholders left.

**6. The IAP products do not exist in App Store Connect.** A build calling StoreKit for three
undeclared product ids is Guideline 2.1. They have to be created as consumables named exactly
`gg.bluff.stars.handful`, `.stack`, `.vault`, and submitted alongside the build.

**7. ~~Nobody can buy anything.~~ Done** — the sign-in screens exist and are wired: `screenSignIn`,
`screenCode`, session token on every call, delete-account in Profile. `node signin.js` proves it is
never forced, required only to buy, and really deletes. What is still missing is the *server* side of
the transaction: `ASC_KEY` and the three product records. Those are console work, not code.

**8. The support and privacy URLs 404.** The site has never been deployed. App Review clicks both.

**9. The AdMob unit ids are Google's public test ids.** Shipping those earns nothing; shipping live
ids in a test build is how an AdMob account gets suspended.

**10. The bridges have never run.** `BluffIAP.buy()` and `BluffAds.rewarded()` have been exercised
against stubs in a headless browser and never once on a device.

---

## What to do instead, in order

**Today — get a build into TestFlight.** Download `bluff-app.zip` from the chat, then:

```
cd ~/Downloads && unzip -oq bluff-app.zip -d bluff
cd bluff && bash tools/ios.sh
```

`RUN.md` has that plus the site, the server, the secrets and the Xcode steps, in order.

Nothing about that touches App Review. It compiles, uploads, and lets you hold the thing on a phone
— which is where you will find the layout problems no headless browser can show you.

**Today — start the things with queues.** A2P 10DLC brand and campaign registration, the Paid Apps
agreement, and banking and tax in App Store Connect. Every one of them has a review that takes days
and none of them can be hurried later.

**This week — the three product records**, the age-rating questionnaire redone, and the AdMob app
created for real unit ids.

**Then the last of the code** — a real purchase in the sandbox, on a device, end to end: buy a pack,
watch the server verify it, watch the stars land, kill the app mid-purchase and watch them land
anyway. That is the one path that has only ever run against a stub.

**Then rewrite the metadata and the privacy policy to match what shipped**, and only then submit.
*(Done — `STORE-FIELDS.md`, and every legal page.)*

**One decision still yours, and a lawyer's:** whether the terms carry an arbitration clause and a
class-action waiver. I deliberately did not write one. They are real trade-offs with real
consequences and a template should not make that call — a lawyer should, with you.

---

## What is genuinely ready

The server. `node auth.js`, `node pay.js`, `node ledger.js`, `node econ.js` — 120 checks across
phone sign-in, purchase verification, the star ledger and the rebuy economy, plus `signin.js`,
`board.js`, `seat.js`, `flow.js`, `test.js`, `items.js` and `pwa.js` on the game itself. The
matchmaker is proved money-blind: the same rating with 0 stars and with 250,000 gets the identical
table, and the function is asserted never to mention a bankroll. A forged receipt is worth nothing, a replayed
one is worth nothing, the phone number is never stored, and a copy of the database is not a
credential. Ten screenshots and three app previews at the right sizes. The build script.

The gap is not the engineering. It is that the app grew into a different product than the one whose
paperwork is sitting in App Store Connect, and the paperwork has to catch up before a reviewer sees
either.
