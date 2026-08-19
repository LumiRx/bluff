# Connecting the App Store Connect API key

Run all of this **on your Mac**. The `.p8` is a private signing key: anyone holding it can act on
your developer account, and Apple lets you download it exactly once.

It should exist in two places — your Mac and your password manager — and nowhere else. Not in this
repo, not in a chat window, not in a CI log, not in a screenshot.

---

## 1. Create the key

App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** → **Team
Keys** → **+**

- **Name**: something you will recognise later, e.g. `bluff-ci`
- **Access**: **App Manager** is enough to upload builds and manage versions. Do not use Admin
  unless you actually need it — this key will end up on more than one machine eventually.

Apple gives you three things:

| | where it is | is it secret |
|---|---|---|
| `AuthKey_XXXXXXXXXX.p8` | downloads once, never again | **yes — this is the credential** |
| Key ID | in the filename, and in the table | no, an identifier |
| Issuer ID | at the top of the same page | no, an identifier |

Put the `.p8` in your password manager **now**, before you do anything else.

## 2. Install it

One file, and it is in the repo:

```bash
python3 tools/appstore/asc.py
```

If nothing has been downloaded yet — no repo, no zip — `tools/appstore/asc-min.py` is a 45-line
version of the same thing that can be pasted straight into Terminal inside a heredoc. It installs
the key and verifies it; the full `asc.py` adds the `apps`, `builds` and `token` commands.

**No arguments.** It asks the questions instead, which is deliberate: arguments end up in
`~/.zsh_history` and in `ps`, and there are no placeholders to copy wrong. (`<issuer-id>` pasted
into zsh is a redirect, not a word — the shell gives up with `parse error near '\n'` before the
script ever runs.)

It finds the newest `AuthKey_*.p8` in Downloads, reads the **Key ID out of the filename**, and asks
you for the one thing it cannot work out — the Issuer ID. Drag-and-dropped paths, quoted paths and
`~` paths all work. If you paste the Key ID or your Team ID by mistake it says so rather than
failing later with a 401.

The key ends up at `~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8`, mode `600` — where
`xcrun`, Transporter and fastlane all look — with the two IDs beside it. One copy of the secret on
disk; `~/private_keys` is symlinked to the same file for the tools that only check there.

There is no non-interactive form on purpose. For CI, set `ASC_KEY_ID` and `ASC_ISSUER_ID` in the
environment and put the key at `~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8` yourself —
the client commands read both from the environment first.

## 3. Prove it works

The installer runs this itself at the end. To check again later:

```bash
python3 bluff/tools/appstore/asc.py whoami
```

```
✓ key XXXXXXXXXX works
  issuer 69a6de7f-…
  0 app(s) on this account
```

A **401** almost always means the Issuer ID and the key are from different accounts, or the key was
revoked. A **403** means the key's role is too weak.

`asc.py` needs nothing installed — standard library plus the `openssl` that is already on your Mac.
It mints the ES256 JWT App Store Connect requires and calls the API directly. Other commands:

```bash
python3 .../asc.py apps                 # bundle ids and app ids
python3 .../asc.py builds gg.webluff.app  # uploaded builds and processing state
python3 .../asc.py token                # a 20-minute bearer token, for curl
```

---

## 4. Create the app record

Nothing can be uploaded until the record exists. In App Store Connect → **Apps** → **+**:

- **Platform**: iOS
- **Name**: `BLUFF: Word Poker`
- **Primary language**: English (U.S.)
- **Bundle ID**: `gg.webluff.app` — this must already exist as an App ID in the Developer portal
  (Certificates, Identifiers & Profiles → Identifiers). Create it there first if it is not in the
  dropdown.
- **SKU**: anything internal and permanent, e.g. `BLUFF001`

`STORE.md` has every other field already written, ready to paste — description, keywords, review
notes, and the age-rating answers.

> **Bundle ID note.** `capacitor.config.json` currently says `gg.webluff.app`. The domain is
> `webluff.com`, so `com.webluff.app` would be the conventional choice. It does not matter
> technically, but a bundle ID cannot be changed after the first upload — so decide now, and if you
> change it, change `capacitor.config.json` too.

## 5. Upload a build

```bash
npm run build
npm run ios          # Capacitor sync, then opens Xcode
```

In Xcode: set the team, set the version and build number, then **Product → Archive → Distribute
App → App Store Connect**. Xcode will use the same API key.

Or from the command line, once you have an `.ipa`:

```bash
source ~/.appstoreconnect/config
xcrun altool --upload-app -f BLUFF.ipa -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
```

Nothing to fill in — that reads the two IDs back out of the file step 2 wrote, and `altool` finds
the key itself at the path step 2 installed it to. Then watch it process:

```bash
python3 .../asc.py builds gg.webluff.app
```

Processing usually takes 5–30 minutes. `VALID` means it is ready to attach to a version.

---

## If the key leaks

Revoke it immediately in **Users and Access → Integrations**, then create a new one and re-run
step 2 (run the installer again). Revoking is instant and breaks nothing that is already uploaded. There is no way to rotate
a `.p8` in place — the key *is* the file.

## What is deliberately not here

No key material, no IDs, and no `.env` in the repo. `.gitignore` refuses `*.p8`, `AuthKey_*` and
`.appstoreconnect/` so a stray `git add -A` cannot commit one, but the real protection is that the
key never enters the working tree in the first place.
