/* The invite-loop fix, kept as a re-appliable patch rather than only as a diff,
   because two sessions were editing index.html the day it was written and an
   uncommitted change in a shared tree is one `git checkout` from gone.

   Run from the repo root: node tools/invite-loop-patch.js
   Every edit asserts it matched exactly once; if any does not, nothing is
   written. Already-applied edits will report 0 matches — that is the signal it
   is already in, not a failure to investigate.

   What it fixes, in one line each:
     1. codeFromUrl could not read ?c=, which is what /t/ redirects to
     2. a table code did not survive the consent gate the way a friend link did
     3. a coded friend table set S.daily, so it consumed the player's daily,
        credited the chest, and POSTed its transcript to the ranked board, which
        the server refuses — shown to the player as "THIS RUN WAS NOT ACCEPTED"
     4. and, being "daily", it skipped the first-run button rotation and the
        adaptive hints, on the one table growth depends on
   Measured before touching the rotation: the six deals are byte-identical
   whichever seat holds the button, so comparability costs nothing.
   Covered by tcode.js (20 checks). */
const fs = require("fs");
const F = "index.html";
let src = fs.readFileSync(F, "utf8");
const E = [];
const edit = (name, find, repl) => E.push({ name, find, repl });

edit("codeFromUrl",
String.raw`function codeFromUrl(){
  const m=(location.hash+location.search).match(/[/?#&=]t[/=]?([A-Z0-9]{3,6})/i)
        ||location.href.match(/\/t\/([A-Z0-9]{3,6})/i);
  return m?m[1].toUpperCase():null;
}`,
`function codeFromUrl(){
  const m=(location.search+location.hash).match(/[?&#]c=([A-Za-z0-9]{3,12})/)
        ||location.href.match(/\\/t\\/([A-Za-z0-9]{3,12})/i);
  return m?m[1].toUpperCase():null;
}`);

edit("PENDING_CODE", String.raw`var PENDING_ADD=null;`, `var PENDING_ADD=null,PENDING_CODE=null;`);

edit("boot block",
String.raw`  const c=codeFromUrl(),a=addFromUrl();
  if(a)PENDING_ADD=a;
  if(!P.agreed)return screenGate();
  if(c&&P.handle){S.lastCode=c;screenJoin(c);}
  else screenHome();`,
`  const c=codeFromUrl(),a=addFromUrl();
  if(a)PENDING_ADD=a;
  /* somebody opening an invite has not agreed yet and has no handle yet. The
     table waits for them on the other side of the door, the way a friend link
     already does. */
  if(c)PENDING_CODE=c;
  if(!P.agreed)return screenGate();
  if(c&&P.handle){PENDING_CODE=null;S.lastCode=c;return screenJoin(c);}
  screenHome();`);

edit("home consumes the code",
String.raw`  if(!P.handle)return screenHandle();
  if(PENDING_ADD){const a=PENDING_ADD;PENDING_ADD=null;if(a!==P.handle)return screenFriends(a);}`,
`  if(!P.handle)return screenHandle();
  /* the table they were sent comes before anything else on this screen */
  if(PENDING_CODE){const c=PENDING_CODE;PENDING_CODE=null;S.lastCode=c;return screenJoin(c);}
  if(PENDING_ADD){const a=PENDING_ADD;PENDING_ADD=null;if(a!==P.handle)return screenFriends(a);}`);

edit("newGame takes coded",
String.raw`function newGame(isDaily,isSpeed){
  const daily=!!isDaily;`,
`function newGame(isDaily,isSpeed,isCoded){
  const daily=!!isDaily,coded=!!isCoded;`);

edit("button and flags",
String.raw`    hand:0,button:(!daily&&firstRun())?SEATS-1:0,phase:"",word:null,card:null,tell:null,stake:0,pot:0,
    tutorial:P.matches===0,daily:daily,speed:!!isSpeed,strip:[],log:[],tape:[],arm:null,`,
`    hand:0,button:((!daily||coded)&&firstRun())?SEATS-1:0,phase:"",word:null,card:null,tell:null,stake:0,pot:0,
    tutorial:P.matches===0,daily:daily,coded:coded,speed:!!isSpeed,strip:[],log:[],tape:[],arm:null,`);

edit("startMatch passes coded",
String.raw`  newGame(daily||coded,speed);
  if(coded)S.code=code;`,
`  newGame(daily||coded,speed,coded);
  if(coded)S.code=code;`);

edit("assisted",
String.raw`function assisted(){return !(S&&S.daily)&&!P.assistOff;}`,
`/* the ranked daily is the only table that must be identical for everybody.
   A friend's coded table is a comparison, not a leaderboard. */
function theDaily(){return !!(S&&S.daily&&!S.coded);}
function assisted(){return !theDaily()&&!P.assistOff;}`);

edit("item guard", String.raw`  if(S.daily&&!SOLO_ITEMS[k]){`, `  if(theDaily()&&!SOLO_ITEMS[k]){`);
edit("tape guard", String.raw`  if(S.daily)S.tape.push(me.setter`, `  if(theDaily())S.tape.push(me.setter`);

edit("endGame branch",
String.raw`  if(!S.daily){
    rd=ratingDelta(place,me.chips,field,P.rating);`,
`  if(S.coded){
    /* a table you were sent: comparable with whoever sent it, and replayable,
       so it settles in chips and leaves the ladder and the daily alone */
  }else if(!S.daily){
    rd=ratingDelta(place,me.chips,field,P.rating);`);

let fail = 0;
for (const e of E) {
  const n = src.split(e.find).length - 1;
  if (n !== 1) { console.log("FAIL  " + e.name + " — matched " + n + " times"); fail++; continue; }
  src = src.replace(e.find, () => e.repl);
  console.log("ok    " + e.name);
}
if (fail) { console.log("\n" + fail + " edit(s) did not match exactly once. NOTHING WRITTEN."); process.exit(1); }
fs.writeFileSync(F, src);
console.log("\n" + E.length + " edits applied. Now run: node tcode.js");
