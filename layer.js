/* ══════════ RNG — seeded so the daily table is identical for everyone ══════════ */
let rnd=Math.random;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function setSeed(s){rnd=(s==null)?Math.random:mulberry32(s);}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);
  h=Math.imul(h,16777619);}return h>>>0;}
function todayKey(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")
  +"-"+String(d.getDate()).padStart(2,"0");}
function prettyDate(k){const[y,m,d]=k.split("-");return +d+" "+
  ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1];}

/* ══════════ STORAGE — degrades to memory rather than throwing ══════════ */
const Store={
  live:(function(){try{localStorage.setItem("_b","1");localStorage.removeItem("_b");return true;}
    catch(e){return false;}})(),
  mem:{},
  get(k,d){try{const v=this.live?localStorage.getItem(k):this.mem[k];
    return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{const s=JSON.stringify(v);if(this.live)localStorage.setItem(k,s);else this.mem[k]=s;}
    catch(e){}}
};

/* ══════════ PROFILE ══════════ */
const BUYIN=1000;
function blankProfile(){return{
  handle:"",made:todayKey(),
  bankroll:5000,rating:1500,peakRating:1500,peakBank:5000,shield:0,
  matches:0,w:0,l:0,firsts:0,busts:0,
  streak:0,bestStreak:0,
  setHands:0,setHeld:0,setNoTakers:0,setChips:0,setCrackedBy:0,
  called:0,cracked:0,missed:0,foldedN:0,foldsJudged:0,goodFolds:0,callChips:0,
  bigPot:0,bigHand:null,bestBluff:null,
  daily:{last:"",streak:0,best:0,score:null}
};}
let P=Object.assign(blankProfile(),Store.get("bluff.profile",{}));
const saveP=()=>Store.set("bluff.profile",P);

const TIERS=[[0,"RAILBIRD","#7f9a8d"],[1350,"GRINDER","#9db8a8"],[1450,"REGULAR","#cbb271"],
  [1550,"SHARP","#e6c069"],[1650,"ROUNDER","#d69a72"],[1750,"SHARK","#7fe0a6"],
  [1875,"LEGEND","#fff3cf"]];
function tierOf(r){let t=TIERS[0];TIERS.forEach(x=>{if(r>=x[0])t=x;});return t;}
function nextTier(r){for(const t of TIERS)if(t[0]>r)return t;return null;}
const badge=r=>{const t=tierOf(r);return "<span class='tier' style='color:"+t[2]
  +";border-color:"+t[2]+"55'>"+t[1]+"</span>";};

/* ══════════ THE REGULARS — they carry their own rating and record ══════════ */
const ROSTER=[
 ["RIVER",1712,"tricky","baits more than anyone at this table"],
 ["ACE",  1783,"tricky","the best regular in the room"],
 ["SLIM", 1668,"tight", "folds anything that looks thin"],
 ["ODDS", 1655,"solid", "counts the words in their head"],
 ["MAVE", 1621,"tricky","prices high and dares you"],
 ["REX",  1596,"solid", "grinds small edges, never tilts"],
 ["NOMAD",1544,"solid", "plays it straight, hard to read"],
 ["VANE", 1509,"solid", "balanced, occasionally brilliant"],
 ["JINX", 1478,"loose", "calls light and pays for it"],
 ["COIN", 1435,"tight", "waits all session for one spot"],
 ["TILT", 1420,"loose", "chases, and you can feel it"],
 ["DUKE", 1389,"loose", "cannot pass up a pinned letter"],
 ["HUSH", 1361,"tight", "folds too much, loses slowly"],
 ["PIP",  1332,"loose", "new, and it shows"]
];
const blankRivals=()=>ROSTER.map(r=>({name:r[0],rating:r[1],style:r[2],note:r[3],
  bank:5000+Math.round((r[1]-1500)*7),m:0,w:0,l:0}));
let R=Store.get("bluff.rivals",null);
if(!R||!R.length||R.length!==ROSTER.length)R=blankRivals();
const saveR=()=>Store.set("bluff.rivals",R);

/* seat you against regulars near your own rating -- climbing means harder tables */
function seatRivals(){
  const pool=R.slice().sort((a,b)=>Math.abs(a.rating-P.rating)-Math.abs(b.rating-P.rating)).slice(0,9);
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));
    const t=pool[i];pool[i]=pool[j];pool[j]=t;}
  return pool.slice(0,5);
}
function botParams(r){
  const t=Math.max(0,Math.min(1,(r.rating-1300)/500));
  const so=r.style==="loose"?.12:r.style==="tight"?-.10:0;
  const st=r.style==="tight"?.11:r.style==="loose"?-.11:0;
  return{skill:.50+t*.42,
    optimism:(rnd()*2-1)*(.34-t*.20)+so,
    tight:st+(rnd()*.16-.08),
    baity:r.style==="tricky"?.85:.42+t*.32,
    pace:1400+rnd()*2000};
}

/* ══════════ RATING ══════════ */
function ratingDelta(place,chips,field,rating){
  const s=(SEATS-place)/(SEATS-1);
  const e=1/(1+Math.pow(10,(field-rating)/400));
  return Math.round(40*(s-e)+Math.max(-12,Math.min(12,(chips-BUYIN)/1000*12)));
}

/* ══════════ THE DAILY TABLE ══════════ */
/* Same six deals for everyone, everywhere, until midnight. */
function dailyDone(){return P.daily.last===todayKey();}
function dailyBoard(){
  const k=todayKey(),out=[];
  R.forEach(r=>{
    const g=mulberry32(hashStr(k+r.name));
    const t=Math.max(0,Math.min(1,(r.rating-1300)/500));
    /* skill shifts the centre of the distribution, variance stays large */
    const v=(g()+g()+g())/3;
    out.push({name:r.name,rating:r.rating,
      score:Math.round(BUYIN+(v-.5)*1400+(t-.5)*420)});
  });
  if(P.daily.score!=null&&P.daily.last===k)
    out.push({name:P.handle||"YOU",rating:P.rating,score:P.daily.score,you:true});
  return out.sort((a,b)=>b.score-a.score);
}

/* ══════════ SHARE ══════════ */
const SYM={held:"\u{1F451}",up:"\u{1F7E9}",down:"\u{1F7E5}",fold:"⬜"};
function stripOf(list){return list.map(h=>h.sym).join("");}
function shareText(){
  const s=S.session;
  const head=S.daily?"BLUFF · daily "+prettyDate(todayKey()):"BLUFF · cash";
  let out=head+"\n"+stripOf(S.strip)+"  "+(s.delta>=0?"+":"")+s.delta+"\n";
  const best=S.strip.filter(h=>h.role==="set").sort((a,b)=>b.d-a.d)[0];
  if(best&&best.d>0)
    out+="Set "+best.word+" ("+best.rate+"%) — "+best.callers+" called, "
      +best.cracked+" cracked, "+(best.d>=0?"+":"")+best.d+"\n";
  out+=tierOf(P.rating)[1]+" "+P.rating+" · "+P.w+"-"+P.l;
  if(P.streak>1)out+=" · "+P.streak+" up in a row";
  return out+"\nbluff.gg";
}
