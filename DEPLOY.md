# Deploying

Three things ship, on their own schedules, from one repo: the site, the daily server, and the app
builds. Nothing here needs a CI pipeline — each is a single command — but the order matters the
first time, because the game will start asking for the API the moment it is live.

Everything is Cloudflare. You already own `webluff.com` there.

---

## 0. Once, before anything else

```bash
npm install -g wrangler     # or npx wrangler, everywhere below
wrangler login
```

---

## 1. The daily server

This is the piece that makes the board real, and it has to exist before the site goes live —
otherwise the first players submit runs into nothing and are told their run is saved but not up yet,
which is true but is a bad first impression.

```bash
cd server
wrangler deploy
```

That does three things: uploads the Worker, creates the `DailyBoard` Durable Object class, and runs
the `v1` SQLite migration. The migration only runs once; re-deploying afterwards is just an upload.

Then, in the dashboard:

1. **Workers & Pages → bluff-daily → Settings → Domains & Routes.** `wrangler.toml` already asks for
   `api.webluff.com` as a custom domain, so this should already be there. If it is not, add it —
   Cloudflare creates the DNS record for you.
2. Confirm it: `curl https://api.webluff.com/v1/health` → `{"ok":true,"day":"…"}`.

**If you want the API somewhere else**, change the `pattern` in `server/wrangler.toml` and the `API`
constant at the top of the daily-server section in `index.html`. They have to agree; the game will
not discover it.

### Push notifications

The Worker sends them; it just needs the key. Until these three secrets exist, `apns.configured()`
is false and every send is skipped — the invite is still recorded, so the feature degrades to
"they find out when they next open the app" rather than breaking.

```bash
cd server
wrangler secret put APNS_KEY        # the whole .p8, including the BEGIN/END lines
wrangler secret put APNS_KEY_ID     # 10 characters, from the filename
wrangler secret put APNS_TEAM_ID    # 10 characters, top right of the developer portal
```

The APNs Auth Key is a **different** `.p8` from the App Store Connect key and is confusingly also
called `AuthKey_XXXXXXXXXX.p8`. Keep them apart: mixing them up gives a 403 that explains nothing.
Create it at Certificates, Identifiers & Profiles → Keys → **+** → Apple Push Notifications service.

One key covers development and production. A device registered from a debug build needs the sandbox
host, which is why the client reports its platform as `ios-dev` in that case.

### Accounts and sign-in codes

```bash
cd server
wrangler secret put PHONE_PEPPER      # 32+ random bytes, once, forever
wrangler secret put SMS_PROVIDER      # twilio | messagebird | log
wrangler secret put TWILIO_SID
wrangler secret put TWILIO_TOKEN
wrangler secret put TWILIO_SERVICE    # or TWILIO_FROM
wrangler secret put SMS_COUNTRIES     # +1 to start; every extra country is extra exposure
```

`PHONE_PEPPER` is the key every phone number is hashed under. **Changing it orphans every account
in existence** — the hashes stop matching and nobody can sign in again. Generate it once, put it in
the password manager next to the `.p8` files, and never rotate it casually.

Until `SMS_PROVIDER` is set, sign-in reports that it is not switched on. In `log` mode the code is
written to the Worker log and the response says nothing was delivered, so the whole flow is testable
without a vendor.

### Purchases

```bash
cd server
wrangler secret put ASC_KEY      # the App Store Connect .p8, whole — same key as the CLI
wrangler secret put ASC_KEY_ID
wrangler secret put ASC_ISSUER
wrangler secret put BUNDLE_ID    # gg.webluff.app
wrangler secret put PLAY_SA      # the Play service-account JSON, whole
```

Until those exist, a purchase attempt is told plainly that purchases are not switched on. The
product identifiers in `server/src/purchases.js` are the contract: they have to match what is
declared in App Store Connect and Play Console **exactly**, and the star amounts live in that file
and nowhere else — the client has no say in how much it bought.

US traffic also needs **A2P 10DLC brand and campaign registration** before carriers will deliver.
Unregistered messages are filtered silently rather than bounced. See `MONETIZE.md`.

### What the server does and does not do

It accepts a day, a device token, a handle and six decisions. It re-plays those decisions through
the same engine the game runs and computes the score itself. **A score is never accepted from a
client** — there is nowhere in the request to put one. A fabricated transcript is refused with a 422
naming the specific rule it broke.

The daily itself still needs no login. A device makes up its own random token and that token is the
only thing connecting today's entry to the same person. Sign-in exists alongside that, not in front
of it: it is asked for when somebody wants their record to survive the device or wants to buy
something, and the number itself is never written down — what the database holds is an HMAC of it
under `PHONE_PEPPER`, plus the last four digits. `node auth.js` dumps every table and asserts the
number is in none of them.

### Cost

Durable Objects need the Workers Paid plan: **$5/month**. Inside that, the included requests and
duration cover roughly 50,000 daily players. See `SCALE.md` for the arithmetic.

---

## 2. The site

```bash
npx wrangler pages deploy site --project-name=bluff
```

Then in the dashboard:

1. **Custom domains** → `webluff.com` and `www.webluff.com`.
2. **Functions → KV namespace bindings** → bind a namespace as `SIGNUPS`, or the launch-list form
   silently stores nothing. It fails soft deliberately — a broken form should not look like a broken
   product — so verify the binding rather than trusting the form's own confirmation.
3. **Web Analytics** → on. Cookie-free, so it does not change the privacy policy.

`site/play/` is the game, so `webluff.com/play/` is a fully installable PWA and a valid ad
destination. `_redirects` already maps the extensionless legal URLs, plus `/privacy-policy` and
`/tos` (which ad platforms look for by those exact names) and `/t/CODE` for shared table codes.

**Every deploy of the game must go through `npm run build` first**, because that is what stamps the
version into the service worker's cache key:

```bash
npm run build           # bumps dist/sw.js to the version in package.json
cp -r dist/. site/play/
npx wrangler pages deploy site --project-name=bluff
```

Skipping the version bump leaves returning players on the previous build forever. That used to be
cosmetic. It is not any more: a stale client can produce a transcript the current server refuses, and
the player would be told their run was not accepted through no fault of their own. **Bump
`package.json` version on any release that touches game logic.**

---

## 3. The app builds

```bash
npm run build
npm run ios         # Capacitor → Xcode
npm run android     # Capacitor → Android Studio
```

`STORE.md` has every field App Store Connect and Play Console will ask for, already written.

### The App Store Connect API key

`tools/appstore/README.md` is the runbook. Short version, **on your Mac**:

```bash
cd ~/Downloads && unzip -oq bluff-app.zip -d bluff
python3 bluff/tools/appstore/asc.py          # asks the questions, then verifies
python3 bluff/tools/appstore/asc.py builds gg.webluff.app
```

The `.p8` is a private signing key and Apple issues it once. It goes on the Mac and in a password
manager, and nowhere else — not in this repo, not in a chat window, not in a CI log. `.gitignore`
refuses `*.p8`, `AuthKey_*` and `.appstoreconnect/` as a backstop, but the real protection is that
the key never enters the working tree.

---

## Release checklist

```bash
node test.js      # match regression, chip conservation, persistence, daily determinism
node verify.js    # the server scores whole matches identically to the game
node link.js      # a real run travels game → server → board → back into the summary
node api.js       # the Worker's routing, validation, and refusal to trust a score
node flow.js      # every screen, every button, in and back out
node site.js      # every landing and legal URL, and what is still a placeholder
node words.js     # the deck, the dictionary, and the abuse filters in both directions
node friends.js   # two players, two devices: claimed handles, real scores, a challenge that lands
node pwa.js       # manifest, front door, rules, safe areas, offline
node auth.js      # phone sign-in: the number is never stored, the database is not a credential
node pay.js       # purchases: a forged, replayed or stolen receipt is worth nothing
node econ.js      # the rebuy rule, and the daily staying free on an empty bankroll
node ledger.js    # the books: nothing minted, nothing counted twice, every star accounted for
node signin.js    # the sign-in screens: never forced, required only to buy, deletable in-app
node board.js     # world and city ranks, and the badges computed from rows the server holds
node seat.js      # who you are sat against — and that it cannot see the wallet
```

`verify.js` and `link.js` are the two that gate the board. If either goes red, do not deploy the server
and the game out of step — an honest player being told their run is invalid is the worst failure
this product has. `words.js` is the third: it is what stops a bad word reaching a screen.

---

## Rolling back

```bash
cd server && wrangler rollback          # the Worker
npx wrangler pages deployment list --project-name=bluff   # then promote an older one in the dashboard
```

Board data survives a Worker rollback: it lives in the Durable Object, not the Worker. A rollback
that changes scoring rules mid-day would rank runs scored under two different rulesets against each
other, so if it comes to that, prefer rolling forward and honouring the day.
