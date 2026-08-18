#!/bin/bash
# Build the iOS app up to the point where only Xcode can finish the job.
#
# Everything done for the store so far has been metadata — screenshots, text,
# URLs. None of it is a build. A build is a compiled binary that has to be
# archived on a Mac and uploaded, and TestFlight stays empty until that happens.
# This script does every part of that a script can do.
#
#   cd ~/Downloads/bluff && bash tools/ios.sh
#
# It is safe to run more than once. Nothing here touches App Store Connect.
set -euo pipefail

cd "$(dirname "$0")/.."
say() { printf '\n\033[1;32m==\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m!!\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || die "This has to run on the Mac. Xcode only exists there."
command -v node >/dev/null || die "node is not installed — https://nodejs.org"
# `xcodebuild` exists as a stub even when only the Command Line Tools are
# installed, so its presence proves nothing. What matters is where xcode-select
# is pointing: at a real Xcode.app, or at the CLT directory that cannot build
# an app. Checking the wrong one is how this fails deep inside `pod install`
# with an error about a directory rather than about Xcode.
DEVDIR="$(xcode-select -p 2>/dev/null || true)"
XCAPP="$(ls -d /Applications/Xcode*.app 2>/dev/null | head -1)"
case "$DEVDIR" in
  *Xcode*) : ;;
  *)
    if [ -n "$XCAPP" ]; then
      say "Xcode is installed but not selected — pointing at it now (needs your password)"
      sudo xcode-select -s "$XCAPP/Contents/Developer"
      sudo xcodebuild -license accept 2>/dev/null || true
    else
      die "Full Xcode is not installed — only the Command Line Tools are.
   Capacitor needs real Xcode to run pod install and to archive.

   1. Open the Mac App Store, search Xcode, install it. It is about 10GB and
      it takes a while, so start it and come back.
   2. Open Xcode once and let it finish installing its components.
   3. Then:
        sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
        sudo xcodebuild -license accept
   4. Re-run this script. It will pick up where it left off."
    fi
    ;;
esac
xcodebuild -version >/dev/null 2>&1 || die "xcodebuild still will not run. Open Xcode once, let it
   finish installing components, accept the licence, then try again."

if ! command -v pod >/dev/null; then
  say "CocoaPods is missing — Capacitor needs it to make the iOS project"
  if command -v brew >/dev/null; then brew install cocoapods
  else die "Install CocoaPods first:  sudo gem install cocoapods"; fi
fi

# The store version and the package version are not the same kind of string, and
# assuming they were is a validation failure you only discover after a twenty
# minute archive. CFBundleShortVersionString has to be at most three
# period-separated integers and nothing else — "3.0.0-alpha.1" is a perfectly
# good npm version and an invalid iOS one, and Xcode will archive it happily
# before App Store Connect refuses the upload. So take the numbers and drop the
# rest: 3.0.0-alpha.1 -> 3.0.0, 2.1 -> 2.1, 1.2.3.4 -> 1.2.3.
PKGVER=$(node -p "require('./package.json').version")
VERSION=$(node -p "
  const m = String(process.argv[1]).match(/^\d+(\.\d+){0,2}/);
  m ? m[0] : '1.0.0'" "$PKGVER")
[ "$VERSION" = "$PKGVER" ] || say "store version $VERSION (from package version $PKGVER — Apple takes digits only)"
IOS_MIN=15.0    # what the ad SDK needs; iOS 15 is ~everything still in use
# 12 digits, well inside Apple's 18-character ceiling, and you can read the date
# off it. Every upload needs a number Apple has not seen before.
BUILD=$(date +%Y%m%d%H%M)

say "npm install"
npm install --silent

say "building the web bundle (this is what gets wrapped)"
npm run build

# The order of the next four steps is the whole ballgame, and getting it wrong
# is what produced "CocoaPods could not find compatible versions for pod
# CapacitorCommunityAdmob ... required a higher minimum deployment target".
#
# `npx cap add ios` does not just copy a template — it ends by running
# `pod install`. Capacitor writes that Podfile asking for iOS 13, and the Google
# Mobile Ads SDK the AdMob plugin pulls in will not install below 15. So if the
# ad plugin is already in node_modules when the project is created, creation
# itself fails. Create the project first, raise the floor, and only then bring
# the plugins in.
if [ ! -d ios ]; then
  say "creating the iOS project"
  # `|| true` because if pods do fail here, the directory and the Podfile have
  # already been written, and the patch below is exactly what fixes them. Dying
  # here would leave you one command short of a working project.
  npx cap add ios || true
else
  say "iOS project already exists — reusing it"
fi
[ -d ios ] || die "cap add ios did not produce an ios/ directory. Run 'npx cap add ios' on its own and read what it says."

# Three places have to agree on the minimum, and missing any one of them brings
# the same error back wearing a different pod's name: the Podfile (which decides
# what CocoaPods is even allowed to resolve), the Xcode project (which decides
# what your own target builds against), and every pod target (which decides what
# the dependencies build against, and is the one people forget).
say "raising the iOS deployment target to $IOS_MIN (the ad SDK needs it)"
node - "$IOS_MIN" <<'JS'
const fs = require('fs');
const min = process.argv[2];
const pod = 'ios/App/Podfile';
if (fs.existsSync(pod)) {
  let s = fs.readFileSync(pod, 'utf8');
  s = /^platform :ios/m.test(s)
    ? s.replace(/^platform :ios, ?'[0-9.]+'/m, `platform :ios, '${min}'`)
    : `platform :ios, '${min}'\n` + s;
  if (!s.includes('IPHONEOS_DEPLOYMENT_TARGET')) {
    const loop =
`  installer.pods_project.targets.each do |t|
    t.build_configurations.each do |c|
      c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${min}'
    end
  end`;
    s = s.includes('assertDeploymentTarget(installer)')
      ? s.replace(/([ \t]*assertDeploymentTarget\(installer\))/, `$1\n${loop}`)
      : s + `\npost_install do |installer|\n${loop}\nend\n`;
  }
  // and if a previous run wrote a different floor, move it rather than leave two
  s = s.replace(/IPHONEOS_DEPLOYMENT_TARGET'\] = '[0-9.]+'/g,
                `IPHONEOS_DEPLOYMENT_TARGET'] = '${min}'`);
  fs.writeFileSync(pod, s);
  console.log('   Podfile -> ' + min);
}
const pbx = 'ios/App/App.xcodeproj/project.pbxproj';
if (fs.existsSync(pbx)) {
  fs.writeFileSync(pbx, fs.readFileSync(pbx, 'utf8')
    .replace(/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/g, `IPHONEOS_DEPLOYMENT_TARGET = ${min};`));
  console.log('   Xcode project -> ' + min);
}
JS
# A lock file written by the failed attempt pins the old resolution and CocoaPods
# will happily reuse it, so the error survives the fix that was supposed to end it.
rm -f ios/App/Podfile.lock

say "installing the purchase and ad plugins"
npm i --silent cordova-plugin-purchase @capacitor-community/admob

say "syncing the native project (this is the pod install that has to work)"
npx cap sync ios

# The bridge goes into the copy Capacitor just made, not into dist/. dist/ is the
# web build and gets published to webluff.com/play, where a script tag pointing
# at a file that only exists inside the app is a 404 on every page load. Sync is
# the last thing that writes to App/public, so injecting after it is safe — and
# it has to be redone after every sync, which is why it lives here and not in
# something you have to remember.
say "adding the native bridge to the app build only"
PUB=ios/App/App/public
cp tools/native-bridge.js "$PUB/native-bridge.js"
grep -q native-bridge "$PUB/index.html" || /usr/bin/sed -i '' \
  's#</body>#<script src="native-bridge.js"></script></body>#' "$PUB/index.html"
grep -q native-bridge "$PUB/index.html" || die "could not add the bridge to $PUB/index.html — without it there are no purchases and no ads in the build"

say "generating icons and the launch screen"
npx --yes @capacitor/assets generate --ios \
  --iconBackgroundColor '#0a1210' --splashBackgroundColor '#0a1210' || \
  echo "   (asset generation failed — set the icon by hand in Xcode, see below)"

# The App Store icon is rejected outright if it carries an alpha channel, and
# the generator sometimes writes one. Flatten whatever landed in the app icon set.
say "flattening any alpha out of the app icon"
python3 - <<'PY' || true
import glob, os
try:
    from PIL import Image
except ImportError:
    raise SystemExit(0)
n = 0
for f in glob.glob('ios/App/App/Assets.xcassets/AppIcon.appiconset/*.png'):
    im = Image.open(f)
    if im.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGB', im.size, (10, 18, 16))
        im = im.convert('RGBA')
        bg.paste(im, mask=im.split()[-1])
        bg.save(f)
        n += 1
print(f'   flattened {n} icon file(s)')
PY

# Export compliance. The app uses exactly one kind of encryption: HTTPS to our
# own API, which is the operating system's, and which the regulations exempt.
# It implements no cryptography of its own — the only call to `crypto` anywhere
# in index.html is getRandomValues for a device token, and a random number is
# not encryption. Declaring that here means App Store Connect stops asking on
# every single upload, and stops offering you the CCATS paperwork detour that
# answering Yes by accident leads to.
say "declaring export compliance (uses only exempt HTTPS)"
PLIST=ios/App/App/Info.plist
if [ -f "$PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Delete :ITSAppUsesNonExemptEncryption" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST"

  # The tracking prompt's one line of text. iOS will not show the prompt at all
  # without it — the call returns "denied" immediately and silently, which looks
  # exactly like a player who said no, so nothing tells you it is missing.
  /usr/libexec/PlistBuddy -c "Delete :NSUserTrackingUsageDescription" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :NSUserTrackingUsageDescription string This lets us show ads that pay enough to keep the daily free. Say no and you still get ads, still get stars for watching one, and nothing in the game changes." "$PLIST"

  # AdMob refuses to serve without the app id in the plist, and the failure is a
  # crash on the first ad rather than a message. This is the public test id; the
  # real one comes from the AdMob console when the app is created there.
  if ! /usr/libexec/PlistBuddy -c "Print :GADApplicationIdentifier" "$PLIST" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Add :GADApplicationIdentifier string ca-app-pub-3940256099942544~1458002511" "$PLIST"
  fi
fi

# Apple's scanner reads this out of the bundle and emails about anything missing
# within minutes of the upload. Being in the folder is not enough — it has to be
# a member of the App target, which is the step below that Xcode has to do.
say "installing the privacy manifest"
cp tools/PrivacyInfo.xcprivacy ios/App/App/PrivacyInfo.xcprivacy
node - <<'JS'
const fs=require('fs'), p='ios/App/App.xcodeproj/project.pbxproj';
if(fs.existsSync(p)&&!fs.readFileSync(p,'utf8').includes('PrivacyInfo.xcprivacy'))
  console.log('   ⚠︎  add PrivacyInfo.xcprivacy to the App target in Xcode — see step 3 below');
else console.log('   already in the target');
JS

say "stamping version $VERSION build $BUILD"
PBX=ios/App/App.xcodeproj/project.pbxproj
[ -f "$PBX" ] && /usr/bin/sed -i '' \
  -e "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/g" \
  -e "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD;/g" "$PBX"

cat <<EOF

$(printf '\033[1;32m==\033[0m') ready. Xcode is opening.

Five things to do there, once, and then it is Archive from now on:

  1. Click the blue "App" at the top of the left sidebar, then the "App" target,
     then "Signing & Capabilities".
       · tick "Automatically manage signing"
       · Team: Lumi Enterprises Corp. (6X2UDX3SUP)
       · Bundle Identifier should already read gg.bluff.app

  2. Still on that tab, press "+ Capability" and add "Push Notifications", and
     add "In-App Purchase" while you are there.
     Without it the invite notifications fail silently on a real device — the
     code runs, the token never arrives, and nothing tells you why.

  3. Add the privacy manifest to the target. It is already on disk at
     ios/App/App/PrivacyInfo.xcprivacy but Xcode does not know about it:
       · right-click the yellow "App" folder in the sidebar > Add Files to "App"…
       · pick PrivacyInfo.xcprivacy
       · make sure "App" is ticked under "Add to targets", then Add
     Skip this and the file is not in the bundle, Apple's scanner finds nothing,
     and you get an ITMS-91053 email an hour after upload.

  4. General tab: check the icon appears, set "iPhone Orientation" to Portrait
     only, and check the Version field reads exactly $VERSION — digits and dots,
     nothing else, because that is all Apple accepts there. The deployment target
     is already set to $IOS_MIN.

  5. Pick "Any iOS Device (arm64)" from the device menu at the top — not a
     simulator, you cannot archive a simulator build — then:
         Product > Archive
     When the Organizer opens: Distribute App > App Store Connect > Upload.

Then wait. The build shows up in TestFlight as "Processing" after five to
thirty minutes, and you cannot do anything to hurry it. If it never appears,
check the email on the developer account — Apple sends the reason there rather
than showing it in the browser.

Version $VERSION, build $BUILD. Every upload needs a build number Apple has not
seen before, which is why this one is a timestamp.

EOF

npx cap open ios
