const fs=require('fs');
const RAW=fs.readFileSync(__dirname+'/deckstr.txt','utf8').trim();
const DECK=[],RATE={};RAW.split(' ').forEach(t=>{const w=t.slice(0,5);DECK.push(w);RATE[w]=+t.slice(5)});
const NW=DECK.length,AL='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
// deck frequency of each letter -> which letters make a VOID worth hearing
const FREQ={};AL.forEach(c=>FREQ[c]=DECK.filter(w=>w.includes(c)).length/NW);
const COMMON=AL.slice().sort((a,b)=>FREQ[b]-FREQ[a]).slice(0,12);
console.log('12 most common letters (void pool):',COMMON.join(''),
  '\ncoverage',COMMON.map(c=>c+':'+(FREQ[c]*100).toFixed(0)+'%').join(' '),'\n');

function evaluate(g,w){const r=Array(5).fill('m'),W=w.split(''),G=g.split('');
for(let i=0;i<5;i++)if(G[i]===W[i]){r[i]='h';W[i]=null;G[i]=null;}
for(let i=0;i<5;i++){if(!G[i])continue;const j=W.indexOf(G[i]);if(j>-1){r[i]='n';W[j]=null;}}return r;}
const consistent=(c,g,r)=>evaluate(g,c).join('')===r.join('');
function survivors(t,pool){if(t.k==='pin')return pool.filter(w=>w[t.i]===t.c);
  if(t.k==='float')return pool.filter(w=>w.includes(t.c));return pool.filter(w=>![...t.c].some(c=>w.includes(c)));}
function offerTells(word,strictVoid,cap){
  const out=[],seen=new Set();
  const pins=[0,1,2,3,4].map(i=>({k:'pin',c:word[i],i}));pins.sort(()=>Math.random()-.5);
  const fl=[...new Set(word.split(''))].map(c=>({k:'float',c,i:0}));fl.sort(()=>Math.random()-.5);
  let ab=COMMON.filter(c=>!word.includes(c));
  if(ab.length<4)ab=AL.filter(c=>!word.includes(c));
  ab.sort(()=>Math.random()-.5);
  const vd=strictVoid?[{k:'void',c:ab[0]+ab[1],i:0},{k:'void',c:ab[2]+ab[3],i:0}]
                     :ab.slice(0,2).map(c=>({k:'void',c,i:0}));
  [pins[0],pins[1],fl[0],fl[1],vd[0],vd[1]].forEach(t=>{if(!t)return;
    const k=t.k+t.c+t.i;if(seen.has(k))return;seen.add(k);t.n=survivors(t,DECK).length;out.push(t)});
  const ok=cap?out.filter(t=>t.n<=cap):out;
  return (ok.length?ok:out).sort((a,b)=>a.n-b.n);
}
const OPEN=['CRANE','SLATE','ADIEU','AUDIO','RAISE','STARE','TRACE','ARISE','LATER','RATIO'];
function solveOnce(target,pool,disc,G){
  let p=pool,g=OPEN[Math.floor(Math.random()*OPEN.length)];
  if(!p.includes(g))g=p[Math.floor(Math.random()*p.length)];
  for(let t=0;t<G;t++){if(g===target)return t+1;const r=evaluate(g,target);
    p=p.filter(w=>consistent(w,g,r));if(t===G-1)break;if(!p.length)return 0;
    g=(Math.random()<disc)?p[Math.floor(Math.random()*p.length)]:DECK[Math.floor(Math.random()*NW)];}
  return 0;}
const crackOdds=(t,p,n,G)=>{let s=0;for(let i=0;i<n;i++)if(solveOnce(t,p,.78,G))s++;return s/n};
const BANDS=[[0,42],[43,55],[56,66],[67,76],[77,99]];
const dealCards=()=>BANDS.map(b=>{const p=DECK.filter(w=>RATE[w]>=b[0]&&RATE[w]<=b[1]);
  return p[Math.floor(Math.random()*p.length)]}).sort((a,b)=>RATE[a]-RATE[b]);
let ANTE=10;const SEATS=6;
let CAP=[130,380];let CAPN=0;let PAYOUT=1;
const capFor=n=>n<=CAP[0]?100:n<=CAP[1]?50:25;
// Humans cannot compute how many words survive a clue -- they eyeball it, and a
// revealed green letter feels like far more information than it is. That bias is
// modelled here, and it is the whole reason a bait can be profitable.
const PINBIAS={pin:.14,float:.05,void:-.03};
const LEGIB={pin:1,float:.75,void:.45};
const mkBot=()=>({optimism:-.30+Math.random()*.60,tight:-.12+Math.random()*.28,skill:.55+Math.random()*.34});

const STRATS={
 'BAIT   sharp card, crowded pin':(c,sv)=>{const w=c[0],o=offerTells(w,sv,CAPN);
   const b=o.filter(t=>t.k==='pin'&&t.n>=14&&t.n<=CAP[0]);
   const t=b.length?b[(Math.random()*b.length)|0]:o[0];return[w,t,capFor(t.n)]},
 'HIDE   sharp card, thinnest tell':(c,sv)=>{const w=c[0],o=offerTells(w,sv,CAPN);
   const t=o[o.length-1];return[w,t,capFor(t.n)]},
 'RANDOM any card, any tell':(c,sv)=>{const w=c[(Math.random()*5)|0],o=offerTells(w,sv,CAPN);
   const t=o[(Math.random()*o.length)|0];
   return[w,t,Math.min([25,50,100][(Math.random()*3)|0],capFor(t.n))]},
 'NAIVE  soft card, big pin':(c,sv)=>{const w=c[4],o=offerTells(w,sv,CAPN);
   const p=o.filter(t=>t.k==='pin');const t=p.length?p[0]:o[0];return[w,t,capFor(t.n)]},
};
function run(G,sv,N){
  console.log('strategy                            calls  crack%   setter/hand   caller/hand   pool  stake');
  for(const [nm,fn] of Object.entries(STRATS)){
    let calls=0,cracks=0,net=0,cn=0,ps=0,stk=0;
    for(let h=0;h<N;h++){
      const [word,tell,stake]=fn(dealCards(),sv);
      const pool=survivors(tell,DECK);ps+=pool.length;stk+=stake;
      let hand=ANTE*(SEATS-1);
      for(let s=0;s<5;s++){const b=mkBot();
        const est=Math.min(.97,Math.max(.03,crackOdds(word,pool,8,G)+b.optimism*LEGIB[tell.k]+PINBIAS[tell.k]));
        const bar=(1/(1+PAYOUT))+b.tight+(stake-50)/100*.06;
        if(est<=bar){cn-=ANTE;continue}
        calls++;
        if(solveOnce(word,pool.slice(),b.skill,G)>0){cracks++;hand-=stake*PAYOUT;cn+=stake*PAYOUT-ANTE}
        else{hand+=stake;cn-=stake+ANTE}}
      net+=hand;}
    console.log(nm.padEnd(36)+(calls/N).toFixed(2).padStart(5)+
      (calls?(100*cracks/calls).toFixed(0):'--').padStart(8)+'%'+
      (net/N).toFixed(1).padStart(13)+(cn/N/5).toFixed(1).padStart(14)+
      String(Math.round(ps/N)).padStart(7)+String(Math.round(stk/N)).padStart(7));
  }
}
const N=900;
for(const cap of [[130,380],[200,450],[280,540]]){
  for(const ante of [10,0]){
    CAP=cap; ANTE=ante;
    console.log(`\n### price ceiling 100 at <=${cap[0]} words, 50 at <=${cap[1]} · ante ${ante}`);
    run(3,true,700);
  }
}
