"""Swap the freshly built deck block into the game, in place.

splice.py did the one-off surgery that changed the shape of the game. This is
the repeatable part: rebuild the words, then drop them in without touching a
line of logic. Bounded by the first `const RAW=` and the end of `const BAN=`,
which is exactly what tools/emit.py produces.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
block = open(os.path.join(ROOT, "deck-block.js")).read().rstrip() + "\n"

for target in ("index.html",):
    path = os.path.join(ROOT, target)
    src = open(path).read()
    start = src.index("/* ══════════ THE DECK ══════════")
    end = src.index("const BAN=", start)
    end = src.index(";\n", end) + 2
    out = src[:start] + block + src[end:]
    open(path, "w").write(out)
    print(f"{target}: {(end-start)/1024:.0f} KB replaced with {len(block)/1024:.0f} KB")
