"""Build the three answer decks and the guess dictionary.

Answer decks come from curated lists — words a person actually knows — filtered
for safety and checked for spelling against the system dictionary.

The guess dictionary is the opposite: as generous as possible, so a player who
types a real word is never told it is not one. It comes from hunspell's base
forms plus its own suffix rules expanded, which is how hunspell itself decides
what is a word.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import safety

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIC = "/usr/share/hunspell/en_US.dic"
AFF = "/usr/share/hunspell/en_US.aff"


# ── hunspell ────────────────────────────────────────────────────────────────
def load_hunspell():
    """Return every word hunspell would accept, at lengths 3..7."""
    bases = []
    with open(DIC, encoding="utf-8", errors="ignore") as f:
        next(f)
        for line in f:
            line = line.strip()
            if not line:
                continue
            word, _, flags = line.partition("/")
            if word.isalpha() and word.isascii():
                bases.append((word, flags))

    # parse the suffix rules
    rules = {}
    with open(AFF, encoding="utf-8", errors="ignore") as f:
        for line in f:
            p = line.split()
            if len(p) >= 5 and p[0] == "SFX" and p[2] != "Y" and p[2] != "N":
                flag, strip, add, cond = p[1], p[2], p[3], p[4]
                rules.setdefault(flag, []).append((strip, add, cond))

    out = set()
    for word, flags in bases:
        if word.islower():
            out.add(word)
        for flag in flags:
            for strip, add, cond in rules.get(flag, []):
                if cond != "." and not re.search("(?:" + cond + ")$", word):
                    continue
                stem = word[:-len(strip)] if strip != "0" and word.endswith(strip) else word
                if strip != "0" and not word.endswith(strip):
                    continue
                new = stem + ("" if add == "0" else add)
                if new.isalpha() and new.islower():
                    out.add(new)
    return {w.upper() for w in out if 3 <= len(w) <= 7}


# ── the curated answer decks ────────────────────────────────────────────────
def load_curated(length):
    words = set()
    for part in ("am", "nz"):
        p = os.path.join(ROOT, f"w{length}-{part}.txt")
        with open(p) as f:
            for line in f:
                w = line.strip().upper()
                if w:
                    words.add(w)
    return words


def main():
    hun = load_hunspell()
    print(f"hunspell accepts {len(hun)} words at 3-7 letters")

    report = {"rejected": {}, "decks": {}, "guess": {}}
    decks = {}

    for L in (4, 5, 6):
        raw = load_curated(L)
        kept, drops = [], {"length": [], "unsafe": [], "unknown": [], "shape": []}
        for w in sorted(raw):
            if len(w) != L:
                drops["length"].append(w)
            elif not safety.deck_ok(w):
                drops["unsafe"].append(w)
            elif not re.search("[AEIOUY]", w):
                drops["shape"].append(w)
            else:
                # hunspell is advisory here, not a gate: this dictionary is
                # missing words as ordinary as READ, INTO and UNDER, so letting
                # it veto a curated word would quietly delete good ones
                if w not in hun:
                    drops["unknown"].append(w)
                kept.append(w)
        decks[L] = kept
        report["rejected"][L] = drops
        print(f"\n{L} letters: {len(raw)} curated → {len(kept)} kept")
        for why, ws in drops.items():
            if ws:
                verb = "not in the system dictionary, kept anyway" if why == "unknown" \
                       else f"dropped for {why}"
                print(f"   {verb} ({len(ws)}): {' '.join(ws[:14])}"
                      + (" …" if len(ws) > 14 else ""))

    # ── the old five-letter deck, so nothing that already worked is lost ──
    old = os.path.join(ROOT, "wordlist.txt")
    if os.path.exists(old):
        prev = {l.strip().upper() for l in open(old) if l.strip()}
        safe_prev = [w for w in sorted(prev) if len(w) == 5 and safety.deck_ok(w)]
        dropped = sorted(w for w in prev if not safety.deck_ok(w))
        added = [w for w in safe_prev if w not in set(decks[5])]
        print(f"\nthe old 749-word deck: {len(dropped)} unsafe, {len(added)} carried over")
        if dropped:
            print("   REMOVED FROM THE OLD DECK: " + " ".join(dropped))
        decks[5] = sorted(set(decks[5]) | set(added))
        report["old_removed"] = dropped

    # ── the guess dictionary: as generous as it can safely be ──
    prev_all = set()
    old_path = os.path.join(ROOT, "wordlist.txt")
    if os.path.exists(old_path):
        prev_all = {l.strip().upper() for l in open(old_path) if l.strip()}
    guess = {}
    for L in (4, 5, 6):
        g = {w for w in hun
             if len(w) == L and re.search("[AEIOUY]", w) and safety.guess_ok(w)}
        # every answer must be guessable, and nothing that used to be a word
        # should stop being one
        g |= set(decks[L])
        g |= {w for w in prev_all if len(w) == L and safety.guess_ok(w)}
        guess[L] = sorted(g)
        print(f"guess dictionary, {L} letters: {len(g)}")

    for L in (4, 5, 6):
        print(f"final deck {L}: {len(decks[L])}")

    # the substring filter is only safe if it cannot match a real word
    vocab = [w for L in (4, 5, 6) for w in guess[L]] + \
            [w for L in (4, 5, 6) for w in decks[L]]
    collisions = safety.validate_substring(vocab)
    if collisions:
        print("\nSUBSTRING FILTER WOULD BLOCK REAL WORDS — fix tools/safety.py:")
        for term, hits in collisions.items():
            print(f"   \"{term}\" appears inside: {' '.join(hits)}")
        sys.exit(1)
    print(f"\nsubstring filter: {len(safety.SUBSTRING)} terms, none collide with "
          f"any of the {len(set(vocab))} words the game accepts")

    with open(os.path.join(ROOT, "decks.json"), "w") as f:
        json.dump({"decks": {str(k): v for k, v in decks.items()},
                   "guess": {str(k): v for k, v in guess.items()}}, f)
    with open(os.path.join(ROOT, "word-report.json"), "w") as f:
        json.dump(report, f, indent=1)
    print("\nwrote decks.json")


if __name__ == "__main__":
    main()
