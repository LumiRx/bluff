# The commands, in order

Everything below is copy-paste. Four blocks, and they are independent of each other except that the
site should be live before a reviewer ever sees the app — the support and privacy URLs in the listing
are links a human clicks, and a 404 there is a rejection on its own.

Run them in whatever order suits your afternoon. Block 1 is the one that has been blocking everything
else, so it goes first here.

---

## 1. The build

The zip has no `ios/` and no `node_modules/` in it, so unzipping over the top of what is already in
`~/Downloads/bluff` replaces the code and leaves the Xcode project you already created alone.

```bash
cd ~/Downloads && unzip -oq bluff-app.zip -d bluff
cd bluff && bash tools/ios.sh
```

That one script does all of it: installs, builds the web bundle, raises the iOS deployment target to
15.0 in the three places that have to agree, deletes the stale `Podfile.lock` that was keeping the
CocoaPods error alive, installs the purchase and ad plugins, runs the `pod install` that failed last
time, generates the icons, flattens the alpha out of the App Store icon, writes the export-compliance
and tracking keys into `Info.plist`, drops the privacy manifest in, stamps the version, and opens
Xcode.

**It is safe to run again.** Nothing in it touches App Store Connect and nothing in it is one-way.

### What you do in Xcode

The script prints these at the end too. Five things, once; after that it is Archive and nothing else.

1. Blue **App** in the sidebar → **App** target → **Signing & Capabilities** → tick *Automatically
   manage signing*, Team **Lumi Enterprises Corp. (6X2UDX3SUP)**.
2. Same tab → **+ Capability** → add **Push Notifications** and **In-App Purchase**.
3. Right-click the yellow **App** folder → **Add Files to "App"…** → pick
   `PrivacyInfo.xcprivacy` → make sure **App** is ticked under *Add to targets*.
   The file is already on disk; this is the step that puts it in the bundle. Skip it and Apple emails
   you an ITMS-91053 about an hour after upload.
4. **General** → icon is there, **iPhone Orientation** = Portrait only, and **Version** reads
   `3.0.0` and nothing else. Apple takes at most three period-separated integers, digits only, so
   `3.0.0-alpha.1` is a valid npm version and an invalid iOS one — Xcode archives it happily and
   App Store Connect refuses the upload twenty minutes later. The Build field underneath is a
   timestamp and is fine as it stands.
5. Device menu at the top → **Any iOS Device (arm64)** → **Product ▸ Archive** → when the Organizer
   opens, **Distribute App ▸ App Store Connect ▸ Upload**.

Then wait. TestFlight shows "Processing" after five to thirty minutes and there is nothing you can do
to hurry it. If the build never appears, the reason is in the email on the developer account, not in
the browser.

### If `pod install` still fails

Take the pods apart and rebuild them, which fixes the case where a cached spec repo is the thing
disagreeing:

```bash
cd ~/Downloads/bluff/ios/App
rm -rf Pods Podfile.lock
pod repo update
pod install
```

---

## 2. The site

This is what stops the privacy and support URLs from 404ing, and `webluff.com/play` is a real
installable version of the game — which is worth having live regardless of what Apple does.

```bash
cd ~/Downloads/bluff
npx wrangler login                # first time only, opens a browser
npx wrangler pages deploy site --project-name=bluff
```

`site/play/` already carries the current build. If you change the game later, refresh it first,
because the version number is what busts the service worker's cache:

```bash
npm run build && cp -r dist/. site/play/
npx wrangler pages deploy site --project-name=bluff
```

Then in the Cloudflare dashboard: **Custom domains** → add `webluff.com` and `www.webluff.com`, and
**Functions → KV bindings** → bind a namespace as `SIGNUPS` or the launch-list form quietly keeps
nothing.

---

## 3. The server

```bash
cd ~/Downloads/bluff/server
npx wrangler deploy
curl https://api.webluff.com/v1/health
```

That last line should answer `{"ok":true,"day":"…"}`. If it does not resolve, the custom domain has
not attached yet — **Workers & Pages → bluff-daily → Settings → Domains & Routes**.

### Secrets

Every one of these prompts for the value and reads it from the terminal. **Do not put any of them on
the command line** — arguments land in `~/.zsh_history` and are visible to `ps` while the command
runs.

Generate the pepper first and put it in your password manager *before* you paste it anywhere:

```bash
openssl rand -base64 48
```

`PHONE_PEPPER` is the key every phone number is hashed under. Changing it later orphans every account
in existence — the hashes stop matching and nobody can sign in again. Generate it once, store it, and
never rotate it casually.

```bash
cd ~/Downloads/bluff/server
npx wrangler secret put PHONE_PEPPER      # paste what openssl printed
npx wrangler secret put SMS_PROVIDER      # type: log
```

Those two are enough to make sign-in work end to end. In `log` mode the code is written to the Worker
log and the response says plainly that nothing was delivered — the whole flow is testable before
Twilio exists. Watch it with `npx wrangler tail`.

When the A2P 10DLC registration clears, switch it over:

```bash
npx wrangler secret put SMS_PROVIDER      # twilio
npx wrangler secret put TWILIO_SID
npx wrangler secret put TWILIO_TOKEN
npx wrangler secret put TWILIO_SERVICE    # or TWILIO_FROM
npx wrangler secret put SMS_COUNTRIES     # +1
```

And when the App Store Connect key and the three IAP products exist:

```bash
npx wrangler secret put ASC_KEY           # the whole .p8, BEGIN and END lines included
npx wrangler secret put ASC_KEY_ID
npx wrangler secret put ASC_ISSUER
npx wrangler secret put BUNDLE_ID         # gg.webluff.app
```

Until those four are set, a purchase attempt is told plainly that purchases are not switched on —
which is the right failure. It does not credit anything optimistically.

---

## 4. Checking it yourself

None of this needs a Mac. It is the same suite that has to be green before any deploy.

```bash
cd ~/Downloads/bluff
node auth.js      # the phone number is never stored; a copy of the database is not a credential
node pay.js       # a forged, replayed or stolen receipt is worth nothing
node ledger.js    # nothing minted, nothing counted twice, every star accounted for
node econ.js      # the rebuy rule, and the daily staying free on an empty bankroll
node signin.js    # sign-in is never forced, required only to buy, deletable in-app
node board.js     # world and city ranks, and the badges computed server-side
node seat.js      # who you are sat against — and that it cannot see the wallet
node site.js      # every legal URL, and what is still a placeholder
```

The two long ones, worth running before a release and not before a coffee — about four minutes each:

```bash
node test.js      # match regression, chip conservation, persistence, daily determinism
node flow.js      # every screen, every button, in and back out
```

---

## What still is not done, and who has to do it

Nothing on this list is code. It is all console work with a queue attached, which is why it is worth
starting today even though the build is the exciting part.

- **A2P 10DLC brand and campaign registration** in Twilio. Days. Until it clears, US carriers filter
  verification texts silently rather than bouncing them, so this is the long pole on sign-in.
- **Paid Apps agreement, banking and tax** in App Store Connect. Without it the IAP products cannot
  even be created, let alone bought.
- **The three consumables**, named exactly `gg.bluff.stars.handful`, `.stack`, `.vault`. Those strings
  are a contract with `server/src/purchases.js`; a character out and the purchase verifies against
  nothing.
- **The AdMob app and two real unit ids**, then swap them into `tools/native-bridge.js` and the
  `GADApplicationIdentifier` in `Info.plist`. Shipping the test ids earns nothing.
- **The age-rating questionnaire**, redone per `STORE-FIELDS.md` — it currently answers No to
  everything, and the honest answers land at 9+, which you then raise to 13+ by hand.
- **The App Privacy answers**, which have to match `PrivacyInfo.xcprivacy` entry for entry. A
  disagreement between the two is a rejection.
- **One real sandbox purchase on a device**, including killing the app mid-purchase and watching the
  stars arrive anyway. That path is tested against a stub and has never run on hardware.
- **The arbitration clause decision**, which is yours and a lawyer's. I deliberately did not write
  one.
