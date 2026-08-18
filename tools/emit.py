"""Emit the JavaScript data block the game embeds.

Three things go in:
  RAW   — every answer word, with its measured crack rate, pronunciation and
          meaning. One line each; the word's own length says which deck it is in.
  GUESS — every word the game will accept as a guess, as one sorted, fixed-width
          string per length. No separators are needed because every word in a
          bucket is the same length, so a guess is a binary search over slices.
          Stored plainly: it is sorted English, so the transport compresses it
          far better than any scheme worth hand-rolling.
  BAN   — the safety lists, compiled.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import safety

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

decks = json.load(open(os.path.join(ROOT, "decks.json")))
rates = json.load(open(os.path.join(ROOT, "rates.json")))
defs = json.load(open(os.path.join(ROOT, "defs-new.json")))

# the old deck still has the best pronunciations and definitions — prefer them
legacy = {}
src = open(os.path.join(ROOT, "index.html")).read()
if "const RAW" in src:
    blk = src.split("const RAW=`", 1)[1].split("`;", 1)[0]
    for line in blk.split("\n"):
        p = line.split("|")
        if len(p) >= 3 and len(p[0]) > 5:
            legacy[p[0][:5]] = (p[1], p[2])

lines, missing = [], []
for LS in ("4", "5", "6"):
    for w in sorted(decks["decks"][LS]):
        pron, definition = legacy.get(w) or defs.get(w) or ("", "")
        if not definition:
            missing.append(w)
            pron, definition = w, "a word in the deck"
        definition = definition.replace("|", "/").replace("`", "'")[:58]
        pron = pron.replace("|", "").replace("`", "")[:22] or w
        lines.append(f"{w}|{rates[LS][w]}|{pron}|{definition}")

if missing:
    print(f"WARNING: {len(missing)} words have no definition: {' '.join(missing[:20])}")

raw = "\n".join(lines)

guess = {}
for LS in ("4", "5", "6"):
    ws = sorted(decks["guess"][LS])
    assert all(len(w) == int(LS) for w in ws)
    guess[LS] = "".join(ws)

ban = {
    "off": sorted(safety.OFFENSIVE),
    "sub": sorted(safety.SUBSTRING),
    "allow": sorted(safety.ALLOW),
}

out = []
out.append("/* ══════════ THE DECK ══════════\n"
           "   word | crack rate | how to say it | what it means\n"
           "   The rate is measured, not guessed: every word was played at forty\n"
           "   times by a solver under the real rules. Four-letter words fall about\n"
           "   a third of the time and six-letter words two thirds, which is why the\n"
           "   length of a hand is itself a read. */")
out.append("const RAW=`" + raw + "`;")
out.append("/* Every word the game accepts as a guess: one sorted, fixed-width string\n"
           "   per length, searched by halving. Nonsense probes like AEIOU used to be\n"
           "   legal and were strictly better than real words, because they could test\n"
           "   five fresh letters at once. */")
for LS in ("4", "5", "6"):
    out.append(f"const G{LS}=\"{guess[LS]}\";")
out.append("/* The safety lists, compiled from tools/safety.py. `sub` is checked as a\n"
           "   substring of anything a player types; every term in it is verified at\n"
           "   build time against all " + str(sum(len(v) for v in decks['guess'].values()))
           + " words the game accepts, so it can never\n   fire on a real one. */")
out.append("const BAN=" + json.dumps(ban, separators=(",", ":")) + ";")

block = "\n".join(out)
open(os.path.join(ROOT, "deck-block.js"), "w").write(block)
print(f"answers {len(lines)}  guessable {sum(len(v)//int(k) for k, v in guess.items())}")
print(f"block {len(block)/1024:.0f} KB "
      f"(raw {len(raw)/1024:.0f} KB, guess {sum(len(v) for v in guess.values())/1024:.0f} KB)")
