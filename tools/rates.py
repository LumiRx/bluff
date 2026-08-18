"""Measure how often each word actually falls.

The rate is the point of the deck. It is what bands a card as SHARP or SOFT,
what the setter is really choosing between, and what the score pays out on. It
cannot be guessed at — it has to be played.

So: for every word, pick a clue the way the game would, work out what the clue
leaves standing, and run a solver at it many times under the real rules — three
guesses that count. The fraction that fall is the rate.

Done per length, because a four-letter word and a six-letter word are different
problems and sharing a number between them would be a lie.
"""
import json, os, random, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BET = 3                    # guesses that carry the wager
TRIALS = 40
DISCIPLINE = 0.78          # how often the solver plays inside the live pool

# the fractions the original 749-word deck was tuned to, kept as fractions so
# every length behaves the same way
CAP_HI, CAP_MID, TELLCAP_F = 90 / 749, 170 / 749, 250 / 749


def pattern_matrix(words, L):
    """P[g][t] = the marking guess g produces against target t, as an int."""
    N = len(words)
    A = np.array([[ord(c) - 65 for c in w] for w in words], dtype=np.int8)
    base = (A[:, :, None] == np.arange(26, dtype=np.int8)[None, None, :]).sum(axis=1).astype(np.int8)
    pw = np.array([3 ** i for i in range(L)], dtype=np.int32)
    rows = np.arange(N)
    P = np.empty((N, N), dtype=np.int32)
    for gi in range(N):
        g = A[gi]
        res = np.zeros((N, L), dtype=np.int8)
        green = (A == g[None, :])
        res[green] = 2
        cnt = base.copy()
        for i in range(L):
            cnt[green[:, i], g[i]] -= 1
        for i in range(L):
            cand = rows[~green[:, i]]
            hit = cand[cnt[cand, g[i]] > 0]
            res[hit, i] = 1
            cnt[hit, g[i]] -= 1
        P[gi] = res.astype(np.int32) @ pw
    return P


def offer_tells(word, deck, common, alphabet, rng, tellcap):
    """The same six candidates the game offers, and what each leaves standing."""
    L = len(word)
    pins = [{"k": "pin", "c": word[i], "i": i} for i in range(L)]
    rng.shuffle(pins)
    fl = [{"k": "float", "c": c, "i": 0} for c in dict.fromkeys(word)]
    rng.shuffle(fl)
    absent = [c for c in common if c not in word]
    if len(absent) < 4:
        absent = [c for c in alphabet if c not in word]
    rng.shuffle(absent)
    vd = [{"k": "void", "c": absent[0] + absent[1], "i": 0},
          {"k": "void", "c": absent[2] + absent[3], "i": 0}]
    out, seen = [], set()
    for t in [pins[0], pins[1], fl[0], fl[1] if len(fl) > 1 else None, vd[0], vd[1]]:
        if not t:
            continue
        key = t["k"] + t["c"] + str(t["i"])
        if key in seen:
            continue
        seen.add(key)
        t["n"] = len(survivors(t, deck))
        out.append(t)
    ok = [t for t in out if t["n"] <= tellcap]
    return sorted(ok or out, key=lambda t: t["n"])


def survivors(t, pool):
    if t["k"] == "pin":
        return [w for w in pool if w[t["i"]] == t["c"]]
    if t["k"] == "float":
        return [w for w in pool if t["c"] in w]
    return [w for w in pool if not any(c in w for c in t["c"])]


def main():
    data = json.load(open(os.path.join(ROOT, "decks.json")))
    out = {}
    for LS, deck in data["decks"].items():
        L = int(LS)
        deck = sorted(deck)
        N = len(deck)
        idx = {w: i for i, w in enumerate(deck)}
        tellcap = int(TELLCAP_F * N)
        print(f"\n{L} letters — {N} words, clue floor {tellcap}")
        alphabet = [chr(65 + i) for i in range(26)]
        counts = {c: sum(1 for w in deck if c in w) for c in alphabet}
        common = [c for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:12]]
        print("   void pool:", "".join(common))

        print("   pattern matrix…", end="", flush=True)
        P = pattern_matrix(deck, L)
        print(" done")

        rng = random.Random(20260808 + L)
        rates = {}
        for wi, w in enumerate(deck):
            tells = offer_tells(w, deck, common, alphabet, rng, tellcap)
            wins = 0
            for _ in range(TRIALS):
                t = tells[rng.randrange(len(tells))]
                pool = np.array([idx[x] for x in survivors(t, deck)], dtype=np.int32)
                live = pool
                got = False
                for turn in range(BET):
                    if len(live) == 0:
                        break
                    if rng.random() < DISCIPLINE:
                        g = int(live[rng.randrange(len(live))])
                    else:
                        g = rng.randrange(N)
                    if g == wi:
                        got = True
                        break
                    live = live[P[g][live] == P[g][wi]]
                if got:
                    wins += 1
            rates[w] = round(100 * wins / TRIALS)
            if wi % 400 == 0:
                print(f"   {wi}/{N}", end="\r", flush=True)
        vals = sorted(rates.values())
        print(f"   rate: min {vals[0]}  median {vals[len(vals)//2]}  max {vals[-1]}"
              f"  mean {sum(vals)/len(vals):.1f}")
        out[LS] = rates

    json.dump(out, open(os.path.join(ROOT, "rates.json"), "w"))
    print("\nwrote rates.json")


if __name__ == "__main__":
    main()
