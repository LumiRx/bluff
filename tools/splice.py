"""Swap the old single-length deck out of the game and the new one in.

Everything the game knew about words assumed five letters: the parse, the
alphabet stats, the clue menu, the price caps, the solver's openers, the board.
This rewrites that whole region in one pass so the two halves cannot drift.
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "index.html")).read()
block = open(os.path.join(ROOT, "deck-block.js")).read()

start = src.index("const RAW=`")
end = src.index("const NW=DECK.length;") + len("const NW=DECK.length;")

NEW = block + r"""

/* ── three decks, one game ──
   A hand is four, five or six letters, and which it is changes the problem.
   A four-letter word hides less, so there is less for a guess to grip: they
   fall about a third of the time. Six-letter words are more constrained and
   fall about two thirds. So the length is the first thing to read at a table,
   before the clue. */
const LENS=[4,5,6];
const DECKS={},RATE={},WORD={};
LENS.forEach(L=>DECKS[L]=[]);
RAW.split("\n").forEach(line=>{
  const [w,rate,pron,def]=line.split("|");
  if(!w||!DECKS[w.length])return;
  DECKS[w.length].push(w);RATE[w]=+rate;WORD[w]={p:pron,d:def};
});
const AL="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const VOW=/[AEIOUY]/;

/* VOID names two of the twelve commonest letters *at that length*, so even the
   stingiest clue on the menu is worth hearing. */
const COMMON={};
LENS.forEach(L=>{
  COMMON[L]=AL.map(c=>[c,DECKS[L].filter(w=>w.includes(c)).length])
    .sort((a,b)=>b[1]-a[1]).slice(0,12).map(x=>x[0]);
});

/* The clue floor and the price caps were tuned against a 749-word deck as flat
   counts. Held as fractions instead, every length keeps the same feel: a clue
   may never leave more than a third of its deck standing, and you may only
   charge top price for a clue that cut the field to an eighth. */
const TELLCAP_F=250/749, CAP_HI_F=90/749, CAP_MID_F=170/749;
const TELLCAP=L=>Math.round(TELLCAP_F*DECKS[L].length);
function capFor(n,L){
  const N=DECKS[L||5].length;
  return n<=CAP_HI_F*N?100:n<=CAP_MID_F*N?50:25;
}

/* Bands are per length too. SHARP has to mean "hard for a word this size" —
   scored against the five-letter deck, every four-letter card would read SHARP
   and the setter's choice would stop meaning anything. */
const BANDS={};
LENS.forEach(L=>{
  const s=DECKS[L].map(w=>RATE[w]).sort((a,b)=>a-b);
  BANDS[L]=[.2,.4,.6,.8].map(q=>s[Math.floor(q*(s.length-1))]);
});
const BANDNAME=[["SHARP","#1d4a2e","#7fe0a6"],["TRICKY","#3f4020","#dcc06a"],
                ["FAIR","#38341f","#cbb271"],["LOOSE","#40291f","#d69a72"],
                ["SOFT","#3d2320","#df8f86"]];
function bandOf(r,L){
  const b=BANDS[L||5];let i=0;
  while(i<4&&r>b[i])i++;
  return BANDNAME[i];
}

/* ── is that a word? ──
   Until now a guess only had to be five letters with a vowel in it, which made
   AEIOU legal — and in a deduction game a non-word probe is strictly better
   than a real one, because it can test five fresh letters at once. So the board
   rewarded knowing the loophole. Now a guess has to be in the list. */
const GDICT={4:G4,5:G5,6:G6};
function isWord(w){
  const L=w.length,s=GDICT[L];
  if(!s)return false;
  let lo=0,hi=s.length/L-1;
  while(lo<=hi){
    const mid=(lo+hi)>>1,at=s.substr(mid*L,L);
    if(at===w)return true;
    if(at<w)lo=mid+1;else hi=mid-1;
  }
  return false;
}

/* ── and is it something we are willing to put on a screen? ──
   Applied to everything a player can type: handles, friend names, table codes.
   Guesses are covered by the dictionary itself, which was filtered before it
   was built. The substring terms were checked against all 20,436 accepted words
   at build time, so this cannot fire on SKILL, NIGHT, ASSESS or SCUNTHORPE. */
const LEET={"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","8":"b","@":"a",
            "$":"s","!":"i","|":"i","2":"z","9":"g","6":"b"};
function foldText(s){
  return String(s||"").toLowerCase().split("").map(c=>LEET[c]||c)
    .filter(c=>c>="a"&&c<="z").join("");
}
function cleanText(s){
  const n=foldText(s);
  if(!n)return true;
  if(BAN.allow.indexOf(n)>-1)return true;
  if(BAN.off.indexOf(n)>-1)return false;
  return !BAN.sub.some(b=>n.indexOf(b)>-1);
}

const NW=DECKS[5].length;"""

src = src[:start] + NEW + src[end:]
open(os.path.join(ROOT, "index.html"), "w").write(src)
print(f"spliced: {(end-start)/1024:.0f} KB out, {len(NEW)/1024:.0f} KB in")
