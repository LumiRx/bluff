#!/usr/bin/env python3
"""Repair the /t/ invite loop in site/play/index.html.

Two defects, both confirmed against production on 15 Sept 2026:

  (a) /t/CODE redirects to /play/?c=CODE, but codeFromUrl() matched only
      ?t= / &t= / /t/ -- so against the URL the redirect actually produces it
      returned null. Every recipient of every invite link landed on home.
  (b) The boot sequence ran screenGate() BEFORE storing the code, so a
      first-ever visitor -- the only kind an invite produces -- lost it.

Also captures the arrival's utm tags once, at first touch, so the signup that
follows is attributed to the person who sent the link instead of to "app".
?c= is the TABLE code on every link we mint, so it counts as a creator code
only when utm_source says creator -- otherwise the creator bucket fills up
with random five-character strings.

Idempotent: re-running on an already-patched file reports "already applied"
and changes nothing. Run from the repo root.
"""
import re, sys, pathlib

P = pathlib.Path("site/play/index.html")
S = pathlib.Path("site/play/sw.js")
if not P.exists():
    sys.exit("run me from the repo root (site/play/index.html not found)")

s = P.read_text(encoding="utf-8")
if "afterEntry" in s and "catchOrigin" in s:
    print("already applied — nothing to do"); sys.exit(0)

EDITS = [
("""function codeFromUrl(){
  const m=(location.hash+location.search).match(/[/?#&=]t[/=]?([A-Z0-9]{3,6})/i)
        ||location.href.match(/\\/t\\/([A-Z0-9]{3,6})/i);""",
 """function codeFromUrl(){
  /* The /t/ and /c/ Functions redirect to /play/?c=CODE, so ?c= is the form that
     actually arrives. ?t= and /t/ stay accepted: old links are still out there,
     and a dead invite is the most expensive bug this game can have. */
  const m=(location.hash+location.search).match(/[?&#](?:c|t)=([A-Z0-9]{3,6})\\b/i)
        ||location.href.match(/\\/[tc]\\/([A-Z0-9]{3,6})/i);"""),

("var PENDING_ADD=null;",
 """var PENDING_ADD=null;
/* ── where this player came from ──
   The /t/, /c/ and /add/ Functions put utm tags on the URL they redirect to. If
   we do not read them on the very first visit they are gone by the time anybody
   signs up, and every signup is filed as "app" no matter who sent them. Read
   once, kept on the device, never overwritten -- first touch earned it. */
function catchOrigin(){
  try{
    if(P.origin&&P.origin.source)return;
    const q=new URLSearchParams(location.search),o={};
    const g=k=>{const v=q.get(k);return v?String(v).slice(0,40):null;};
    if(g("utm_source"))o.utm_source=g("utm_source");
    if(g("utm_medium"))o.utm_medium=g("utm_medium");
    if(g("utm_campaign"))o.utm_campaign=g("utm_campaign");
    /* ?c= is the TABLE code on every link we mint, friend and creator alike, so
       it is a creator code only when the creator route says so. Reading it
       otherwise files every friend invite under creator:<random five chars>. */
    if(o.utm_source==="creator"&&g("c"))o.c=g("c");
    if(o.utm_source){o.source=o.utm_source;o.at=Date.now();P.origin=o;saveP();}
  }catch(e){}
}
function originTags(plat){
  const o=P.origin||{};
  if(o.c)return {c:o.c,utm_campaign:o.utm_campaign||undefined};
  if(o.utm_source)return {utm_source:o.utm_source,utm_medium:o.utm_medium||undefined,
                          utm_campaign:o.utm_campaign||undefined};
  return {utm_source:"app",utm_medium:plat};
}"""),

("""        body:JSON.stringify({email:v,utm_source:"app",utm_medium:plat})});""",
 """        body:JSON.stringify(Object.assign({email:v},originTags(plat)))});"""),

("/* a shared link drops you straight onto that table */",
 """/* a shared link drops you straight onto that table */
/* Where somebody goes once they are through the door: the table they were
   invited to if there is one, otherwise home. */
function afterEntry(){
  const c=S.lastCode;
  if(c&&P.handle)return screenJoin(c);
  screenHome();
}"""),

("""      if(back)return screenHome();
      P.handle?screenHome():screenHandle();""",
 """      if(back)return screenHome();
      P.handle?afterEntry():screenHandle();"""),

("""    P.handle=v;P.claimed=!!(r&&r.ok);saveP();
    screenHome();""",
 """    P.handle=v;P.claimed=!!(r&&r.ok);saveP();
    afterEntry();"""),

("""  const c=codeFromUrl(),a=addFromUrl();
  if(a)PENDING_ADD=a;
  if(!P.agreed)return screenGate();
  if(c&&P.handle){S.lastCode=c;screenJoin(c);}
  else screenHome();""",
 """  catchOrigin();
  const c=codeFromUrl(),a=addFromUrl();
  if(a)PENDING_ADD=a;
  /* hold the invite BEFORE the gate: a first-ever visitor has no handle and no
     agreement yet, and dropping the code here is how an invitation silently
     turns into a generic home screen. */
  if(c)S.lastCode=c;
  if(!P.agreed)return screenGate();
  if(c&&P.handle)screenJoin(c);
  else screenHome();"""),
]

n0 = len(s)
for old, new in EDITS:
    n = s.count(old)
    if n != 1:
        sys.exit(f"ANCHOR DRIFT ({n} matches) — the file moved under this patch:\n  {old.strip().splitlines()[0][:90]}")
    s = s.replace(old, new)
P.write_text(s, encoding="utf-8")
print(f"index.html  {n0} -> {len(s)}  (+{len(s)-n0})")

w = S.read_text(encoding="utf-8")
cur = re.search(r"const CACHE = '([^']+)'", w).group(1)
if cur != "bluff-v1.1.4":
    S.write_text(re.sub(r"const CACHE = '[^']+'", "const CACHE = 'bluff-v1.1.4'", w), encoding="utf-8")
    print(f"sw.js CACHE {cur} -> bluff-v1.1.4")
else:
    print("sw.js CACHE already bluff-v1.1.4")
print("\nnow:  cd site && npx wrangler pages deploy . --project-name=bluff --branch=main")
print("require BOTH 'Compiled Worker successfully' AND 'Uploading Functions bundle'")
