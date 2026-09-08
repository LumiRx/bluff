#!/bin/zsh
# The full suite roster, one at a time, exit codes stamped to the working tree.
# Nothing else may build or deploy while this runs (test.js has 45s waits that flake under load).
# Run in Terminal on the Mac: zsh suites.sh   → summary in /tmp/roster.log, per-suite logs in /tmp/suite-*.log
cd "$(dirname "$0")" || exit 1
export NODE_ENV=development          # this shell otherwise prunes devDependencies on npm install
: > /tmp/roster.log
echo "commit $(git rev-parse --short HEAD 2>/dev/null) · $(date -u +%FT%TZ) · version $(node -p "require('./package.json').version")" >> /tmp/roster.log
for f in auth pay ledger econ signin board seat site test flow fit muck items store home clock chest \
         kbtest talktest ritual seatask sweep2 sweepmatch addtest dbltap; do
  s=$(date +%s); node $f.js > /tmp/suite-$f.log 2>&1; rc=$?; e=$(date +%s)
  echo "$f exit $rc $((e-s))s" >> /tmp/roster.log
done
echo DONE >> /tmp/roster.log
cat /tmp/roster.log
