#!/bin/bash
# Make the zip that goes to the Mac.
#
# What belongs in it is everything a build or a test needs and nothing that
# could hurt you if the file ended up somewhere it should not. That second half
# is not paranoia — a zip is the easiest thing in the world to forward to
# somebody, and a signing key inside one is a key you have to revoke.
#
#   bash tools/pack.sh
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=${1:-bluff-app.zip}
rm -f "$OUT"

# Refuse rather than filter. A key that is present and excluded is one typo away
# from being a key that is present and included.
if find . -name '*.p8' -o -name '*.p12' -o -name '*.cer' -o -name '*.mobileprovision' \
   -o -name '.env' | grep -q .; then
  echo "!! a credential file is sitting in the tree — move it out before packing" >&2
  find . -name '*.p8' -o -name '*.p12' -o -name '*.cer' -o -name '*.mobileprovision' -o -name '.env' >&2
  exit 1
fi

zip -q -r "$OUT" \
  index.html package.json capacitor.config.json .gitignore \
  assets dist server site tools ux \
  *.js *.md \
  -x '*/node_modules/*' 'node_modules/*' \
  -x '*/.DS_Store' \
  -x 'tools/__pycache__/*' \
  -x '*.p8' '*.p12' '*.cer' '*.mobileprovision' '.env*'

echo "$OUT · $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files · $(du -h "$OUT" | cut -f1)"
