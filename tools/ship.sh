#!/bin/bash
# Archive the app and upload it to App Store Connect, from the terminal.
#
#   cd ~/Downloads/bluff && bash tools/ship.sh
#
# This is the half of the job Xcode's Organizer normally does, and doing it here
# instead is not stubbornness: the Organizer's failures are dialogs that say
# "Communication with Apple failed" and swallow the reason, whereas xcodebuild
# prints the actual error. When this breaks, it breaks legibly.
#
# It needs the App Store Connect API key installed first:
#     python3 tools/appstore/asc.py
# That puts the .p8 at ~/.appstoreconnect/private_keys/ with the two IDs beside
# it. The key never appears in this script, in an argument, or in any log.
#
# Safe to run again. Every run stamps a new build number, which is what Apple
# requires — it refuses a build number it has seen before, and that refusal
# arrives after the upload rather than before it.
set -euo pipefail
cd "$(dirname "$0")/.."

# `bash tools/ship.sh --export` re-uses the newest archive in build/ and only
# runs the upload half. The archive is the slow part and it is already signed
# for nothing — all the distribution signing happens at export — so a failed
# upload never needs a rebuild, only a retry.
EXPORT_ONLY=""
[ "${1:-}" = "--export" ] && EXPORT_ONLY=1

TEAM=6X2UDX3SUP                 # Lumi Enterprises Corp.
BUNDLE=gg.bluff.app
SCHEME=App

say()  { printf '\n\033[1;32m==\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m · \033[0m%s\n' "$*"; }
die()  { printf '\n\033[1;31m!!\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || die "This has to run on the Mac."
[ -d ios/App ] || die "No ios/App — run 'bash tools/ios.sh' first."
case "$(xcode-select -p 2>/dev/null)" in
  *Xcode*) : ;;
  *) die "xcode-select is not pointing at Xcode. See tools/ios.sh." ;;
esac

# Xcode stopped shipping the platform SDKs inside the app around Xcode 16 — they
# are separate downloads now. So a freshly installed Xcode opens the project,
# runs pod install, and looks entirely healthy right up until you ask it to build
# for a device, at which point it reports the destination as *ineligible* rather
# than saying the SDK is missing. Catch it here instead of ten minutes into an
# archive.
xcodebuild -showsdks 2>/dev/null | grep -qi iphoneos || die "Xcode has no iOS SDK installed — it cannot build for a device yet.

   This is a several-gigabyte download and it is the only thing in the way:

       xcodebuild -downloadPlatform iOS

   If that complains about an architecture variant (iOS 26 and later split the
   download in two), name the version and the variant. Yours is Apple silicon:

       xcodebuild -downloadPlatform iOS -buildVersion 26.5 -architectureVariant arm64

   Either way it may ask for your password, and it will take a while. The same
   thing lives in Xcode > Settings > Components if you would rather watch a
   progress bar. When it finishes:

       xcodebuild -showsdks | grep -i iphoneos

   should print an iphoneos SDK. Then run this again."

# ── the key ─────────────────────────────────────────────────────────────────
CONF="$HOME/.appstoreconnect/config"
[ -f "$CONF" ] || die "No App Store Connect API key installed yet.

   1. App Store Connect > Users and Access > Integrations > App Store Connect API
      > Team Keys > +.  Name it something you will recognise; Access: **Admin**.
      Admin, not App Manager: the export step asks Apple to mint the iOS
      Distribution certificate through cloud signing, and Apple only lets an
      Admin key do that. An App Manager key archives fine and then fails the
      export with 'Cloud signing permission error'.
      https://appstoreconnect.apple.com/access/integrations/api

   2. Download the AuthKey_XXXXXXXXXX.p8. Apple issues it once and never again —
      put it in your password manager before you do anything else with it.

   3. python3 tools/appstore/asc.py

   Then run this again."

ASC_KEY_ID=$(sed -n 's/^ASC_KEY_ID=//p' "$CONF" | tr -d "\"' ")
ASC_ISSUER_ID=$(sed -n 's/^ASC_ISSUER_ID=//p' "$CONF" | tr -d "\"' ")
KEY="$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8"
[ -n "$ASC_KEY_ID" ] && [ -n "$ASC_ISSUER_ID" ] || die "$CONF is missing ASC_KEY_ID or ASC_ISSUER_ID. Re-run: python3 tools/appstore/asc.py"
[ -f "$KEY" ] || die "The key file is missing: $KEY
   Re-run: python3 tools/appstore/asc.py"
say "using App Store Connect key $ASC_KEY_ID"

# ── is the thing about to be archived the current game? ─────────────────────
# `cap sync` copies dist/ into ios/App/App/public, and tools/ios.sh puts the
# purchase and ad bridge in there afterwards. Archiving without that step gives
# you a build where the shop renders nothing and the ad button never appears --
# which looks like a design decision rather than a missing file, and would take
# a TestFlight round trip to notice.
PUB=ios/App/App/public
[ -f "$PUB/index.html" ] || die "$PUB/index.html is missing — run 'bash tools/ios.sh' first."
grep -q native-bridge "$PUB/index.html" \
  || die "the native bridge is not in the build at $PUB/index.html.
   Archiving now would ship an app with no purchases and no ads.
   Run 'bash tools/ios.sh' first — it is safe to run again."
if [ dist/index.html -nt "$PUB/index.html" ]; then
  warn "dist/index.html is newer than the copy in the app — run 'bash tools/ios.sh' to sync it"
fi

# ── version and build ───────────────────────────────────────────────────────
# CFBundleShortVersionString is at most three period-separated integers and
# nothing else. "3.0.0-alpha.1" is a valid npm version and an invalid iOS one,
# and Xcode archives it happily before App Store Connect refuses the upload.
PKGVER=$(node -p "require('./package.json').version")
VERSION=$(node -p "const m=String(process.argv[1]).match(/^\d+(\.\d+){0,2}/); m?m[0]:'1.0.0'" "$PKGVER")
BUILD=$(date +%Y%m%d%H%M)

PBX=ios/App/App.xcodeproj/project.pbxproj
[ -f "$PBX" ] || die "No $PBX"
cp "$PBX" "$PBX.bak"           # so a bad edit is one `mv` away from undone

# The entitlements file does not have to be a member of the target — the build
# setting is a path, and Xcode reads it from there. That matters here because it
# means push notifications can be turned on without opening the project.
ENT=ios/App/App/App.entitlements
if [ ! -f "$ENT" ]; then
  cat > "$ENT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- "production" is right for every build that leaves this machine. A debug
       build installed from Xcode gets the sandbox host automatically; TestFlight
       and the App Store both use production, and a development entitlement in an
       uploaded build is a token that registers and then never receives. -->
  <key>aps-environment</key>
  <string>production</string>
</dict>
</plist>
PLIST
  say "wrote $ENT (push notifications)"
fi

# ── Info.plist ──────────────────────────────────────────────────────────────
# Written here rather than only in tools/ios.sh because these are archive-time
# correctness, and an archive built without them is a wasted upload. Idempotent:
# each key is deleted and rewritten, so running this again is a no-op.
PLIST=ios/App/App/Info.plist
[ -f "$PLIST" ] || die "No $PLIST — run 'bash tools/ios.sh' first."
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" >/dev/null 2>&1 || true; }
set_key() { pb "Delete :$1"; /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$PLIST" >/dev/null; }

say "writing Info.plist keys"

# Only written when ADS=1. Google's SDK reads this at start-up and raises
# if it is absent — the app dies on launch, before anything of ours runs, and
# the crash log points at GADMobileAds rather than at the missing key. This is
# real id only: ADMOB_APP_ID must be set, because the sample id earns nothing
# and Apple has rejected builds that ship placeholder ad content.
if [ "${ADS:-0}" = "1" ]; then
  [ -n "${ADMOB_APP_ID:-}" ] || die "ADS=1 but ADMOB_APP_ID is unset. Never ship Google's sample id."
  set_key GADApplicationIdentifier string "$ADMOB_APP_ID"
  echo "   GADApplicationIdentifier = $ADMOB_APP_ID"
else
  pb "Delete :GADApplicationIdentifier"
  echo "   GADApplicationIdentifier removed (v1 ships with no ad SDK; ADS=1 to re-enable)"
fi

# Uses exactly one kind of encryption: HTTPS to our own API, which is the
# operating system's and which the regulations exempt. Declaring it here stops
# App Store Connect asking on every upload — and stops the CCATS paperwork
# detour that answering Yes by accident leads to.
set_key ITSAppUsesNonExemptEncryption bool false
echo "   ITSAppUsesNonExemptEncryption = false"

# Only written when ADS=1. Without this string iOS does not show the prompt: the request
# returns "denied" immediately and silently, which is indistinguishable from a
# player who said no, so nothing tells you it is missing.
if [ "${ADS:-0}" = "1" ]; then
  set_key NSUserTrackingUsageDescription string "This lets us show ads that pay enough to keep the daily free. Say no and you still get ads, still get stars for watching one, and nothing in the game changes."
  echo "   NSUserTrackingUsageDescription"
else
  pb "Delete :NSUserTrackingUsageDescription"
  echo "   NSUserTrackingUsageDescription removed (no tracking without an ad SDK)"
fi

# Capacitor's template allows landscape. The game is portrait, the store
# screenshots are portrait, and a landscape rotation on a table that assumes
# portrait is a bug report waiting to be filed.
pb "Delete :UISupportedInterfaceOrientations"
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations array" \
  -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" \
  "$PLIST" >/dev/null
echo "   portrait only"

# On disk is not enough — Apple reads it out of the bundle, which means it has to
# be a member of the App target, and that is a click in Xcode this cannot do.
# Put it in place anyway so the click is the only step left.
[ -f tools/PrivacyInfo.xcprivacy ] && cp tools/PrivacyInfo.xcprivacy ios/App/App/PrivacyInfo.xcprivacy
grep -q PrivacyInfo.xcprivacy "$PBX" \
  || warn "PrivacyInfo.xcprivacy is on disk but not in the App target — expect an ITMS-91053 email. Fix before submitting, not before TestFlight."

say "stamping version $VERSION build $BUILD"
[ "$VERSION" = "$PKGVER" ] || warn "package.json says $PKGVER; Apple takes digits only, so the store version is $VERSION"
node - "$TEAM" "$VERSION" "$BUILD" <<'JS'
const fs = require('fs');
const [team, version, build] = process.argv.slice(2);
const p = 'ios/App/App.xcodeproj/project.pbxproj';
let s = fs.readFileSync(p, 'utf8');

/* Every setting below belongs to the App target, and the reliable way to find
   the App target's build configurations -- without parsing the whole pbxproj --
   is that they are the only ones carrying PRODUCT_BUNDLE_IDENTIFIER. Anchor on
   that line, then set each key beside it: replace it where it already exists in
   the same block, insert it there when it does not. */
const want = {
  DEVELOPMENT_TEAM: team,
  CODE_SIGN_STYLE: 'Automatic',
  CODE_SIGN_ENTITLEMENTS: 'App/App.entitlements',
  MARKETING_VERSION: version,
  CURRENT_PROJECT_VERSION: build,
};
/* Delete first, then insert. Editing in place instead -- replace where present,
   add where absent -- means tracking which copy of a key belongs to which
   configuration block, and getting that subtly wrong leaves Debug holding the
   new value and Release holding the old one, which is invisible until you
   wonder why the uploaded build has last week's number on it. */
for (const k of Object.keys(want))
  s = s.replace(new RegExp(`^[ \\t]*${k} = [^;\\n]*;[ \\t]*\\n`, 'gm'), '');

let touched = 0;
s = s.replace(/([ \t]*)PRODUCT_BUNDLE_IDENTIFIER = [^;\n]*;/g, (line, indent) => {
  touched++;
  return line + '\n' + Object.entries(want)
    .map(([k, v]) => `${indent}${k} = ${/[^A-Za-z0-9._/]/.test(v) ? `"${v}"` : v};`)
    .join('\n');
});
if (!touched) { console.error('   could not find the App target in the project'); process.exit(1); }
fs.writeFileSync(p, s);
console.log(`   ${touched} build configuration(s): team ${team}, version ${version}, build ${build}`);
JS

# ── archive ─────────────────────────────────────────────────────────────────
# -allowProvisioningUpdates is what registers the App ID, enables push on it and
# issues the profile, so nothing here needs the Signing & Capabilities tab. It
# needs the API key to do that, which is why the key is a prerequisite and not a
# convenience.
ARCHIVE="$PWD/build/BLUFF-$BUILD.xcarchive"
mkdir -p build
if [ -n "$EXPORT_ONLY" ]; then
  ARCHIVE=$(ls -td "$PWD"/build/*.xcarchive 2>/dev/null | head -1)
  [ -n "$ARCHIVE" ] || die "no archive in build/ to export — run without --export first"
  say "re-using $ARCHIVE"
  # the binary carries the number it was archived with, not the one just stamped
  BUILD=$(basename "$ARCHIVE" .xcarchive); BUILD=${BUILD#BLUFF-}
  say "that archive is build $BUILD — the upload will carry that number"
fi
if [ -z "$EXPORT_ONLY" ]; then
# The Podfile's post_install turns the module verifier off for the pod targets
# (Cordova's vendored headers fail it). cap sync's own pod install has been seen
# to skip that hook, and the archive then dies in VerifyModule on CordovaPlugins.
# One more pod install is cheap; archiving without the setting is a wasted run.
say "regenerating the Pods project (module verifier off for pod targets)"
( cd ios/App && pod install >/tmp/ship-pods.log 2>&1 ) || die "pod install failed — see /tmp/ship-pods.log"
grep -q "ENABLE_MODULE_VERIFIER = NO" ios/App/Pods/Pods.xcodeproj/project.pbxproj \
  || die "the Pods project still has the module verifier on — check the post_install hook in ios/App/Podfile"
say "archiving — this takes a few minutes and prints a lot"
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  archive || die "the archive failed. The real error is above this line — Xcode prints a lot
   before it, so search upwards for the word 'error'.

   Two that come up here:

   · anything about provisioning or 'Push Notifications' capability — the API key
     may not have the role to change the App ID. Delete ios/App/App/App.entitlements
     and run this again; that drops push, which nothing else in v1 depends on, and
     it can be added from Xcode later.

   · 'No account for team' — the key is fine but Xcode wants the Apple ID too.
     Xcode > Settings > Accounts, sign in, then run this again."

[ -d "$ARCHIVE" ] || die "the archive was not produced. The real error is above this line."
say "archived $ARCHIVE"
fi

# ── upload ──────────────────────────────────────────────────────────────────
# `destination: upload` sends it straight to App Store Connect rather than
# writing an .ipa to disk for you to drag into Transporter.
#
# The `method` value was renamed in Xcode 15.3: "app-store" became
# "app-store-connect", and the old name is accepted but warns. Write whichever
# this Xcode wants rather than guessing.
# awk reads to EOF: 'head -1' closes the pipe early and, under pipefail, the
# SIGPIPE it hands xcodebuild aborts the whole script right after the archive.
XCVER=$(xcodebuild -version | awk 'NR==1{print $2}')
METHOD=$(node -p "
  const [maj, min = 0] = String(process.argv[1]).split('.').map(Number);
  (maj > 15 || (maj === 15 && min >= 3)) ? 'app-store-connect' : 'app-store'" "$XCVER")
OPTS="$PWD/build/ExportOptions.plist"
cat > "$OPTS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>$METHOD</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

say "uploading to App Store Connect (Xcode $XCVER, method $METHOD)"
XLOG="$PWD/build/export-$BUILD.log"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OPTS" \
  -exportPath "$PWD/build/export-$BUILD" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" 2>&1 | tee "$XLOG" || {
if grep -q "Cloud signing permission error" "$XLOG"; then die "the App Store Connect key cannot cloud-sign.

   The key ($ASC_KEY_ID) does not have the Admin role, and only an Admin key may
   create the iOS Distribution certificate. A key's role cannot be changed —
   make a new one:

   1. https://appstoreconnect.apple.com/access/integrations/api
      Team Keys > +, Access: Admin. Download the new .p8 — put it in the
      password manager first, Apple issues it once.
   2. python3 tools/appstore/asc.py     (installs the new key)
   3. bash tools/ship.sh --export       (re-uses this archive, skips the rebuild)

   Revoke the old App Manager key afterwards; two live keys is one to lose.

   No new key today? The same upload works through Xcode with your Apple ID:
   sign in at Xcode > Settings > Accounts, then:  open $ARCHIVE
   and in the Organizer: Distribute App > App Store Connect > Upload."
fi
die "the upload failed. Common causes, in the order they happen:

   · 'No suitable application records were found' — the app record in App Store
     Connect does not have the bundle id $BUNDLE. Check it at
     https://appstoreconnect.apple.com/apps

   · 'The provided entity includes an attribute with a value that has already
     been used' — that build number has been uploaded before. Run this again; it
     stamps a new one every time.

   · anything about the Paid Applications agreement — that blocks in-app purchase
     products, not uploads, so it is not this. Read the error again.

   The archive is kept at $ARCHIVE, so a retry does not rebuild from scratch:
   bash tools/ship.sh --export   re-uses it, or hand it to Xcode with
   'open $ARCHIVE' and use the Organizer instead."
}

cat <<EOF

$(printf '\033[1;32m==\033[0m') uploaded. $BUNDLE $VERSION ($BUILD)

Watch it arrive:

    python3 tools/appstore/asc.py builds $BUNDLE

It shows up as PROCESSING within a few minutes and turns VALID when Apple has
finished with it — usually five to thirty minutes, occasionally longer, and
there is nothing that makes it faster. If it never appears at all, the reason is
in the email on the developer account rather than anywhere in the browser.

Two things arrive by email and are worth reading rather than deleting:

  · ITMS-91053 — a missing privacy manifest entry. Expected on this build if you
    have not added PrivacyInfo.xcprivacy to the App target in Xcode yet. It names
    the exact API and category, which makes it a to-do list rather than a
    rejection. Fix before you submit for review, not before TestFlight.

  · anything with the word "Invalid" in the subject — that one did not process,
    and the mail says why.

EOF
