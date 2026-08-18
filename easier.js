/* What actually makes a hand hard, and which lever fixes it cheapest? */
const fs=require('fs');
const RAW=fs.readFileSync(__dirname+'/deckstr.txt','utf8').trim();
const DECK=[],RATE={};
RAW.split(' ').forEach(t=>{const w=t.slice(0,5);DECK.push(w);RATE[w]=+t.slice(5)});
const NW=DECK.length,AL='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const FREQ={};AL.forEach(c=>FREQ[c]=DECK.filter(w=>w.includes(c)).length/NW);
const COMMON=AL.slice().sort((a,b)=>FREQ[b]-FREQ[a]).slice(0,12);

function evaluate(g,w){const r=Array(5).fill('m'),W=w.split(''),G=g.split('');
for(let i=0;i<5;i++)if(G[i]===W[i]){r[i]='h';W[i]=null;G[i]=null;}
for(let i=0;i<5;i++){if(!G[i])continue;const j=W.indexOf(G[i]);if(j>-1){r[i]='n';W[j]=null;}}return r;}
const consistent=(c,g,r)=>evaluate(g,c).join('')===r.join('');
function survivors(t,pool){if(t.k==='pin')return pool.filter(w=>w[t.i]===t.c);
  if(t.k==='float')return pool.filter(w=>w.includes(t.c));
  return pool.filter(w=>![...t.c].some(c=>w.includes(c)));}
function offerTells(word,cap){
  const out=[],seen=new Set();
  const pins=[0,1,2,3,4].map(i=>({k:'pin',c:word[i],i}));pins.sort(()=>Math.random()-.5);
  const fl=[...new Set(word.split(''))].map(c=>({k:'float',c,i:0}));fl.sort(()=>Math.random()-.5);
  let ab=COMMON.filter(c=>!word.includes(c));
  if(ab.length<4)ab=AL.filter(c=>!word.includes(c));
  ab.sort(()=>Math.random()-.5);
  const vd=[{k:'void',c:ab[0]+ab[1],i:0},{k:'void',c:ab[2]+ab[3],i:0}];
  [pins[0],pins[1],fl[0],fl[1],vd[0],vd[1]].forEach(t=>{if(!t)return;
    const k=t.k+t.c+t.i;if(seen.has(k))return;seen.add(k);
    t.n=survivors(t,DECK).length;out.push(t)});
  const ok=cap?out.filter(t=>t.n<=cap):out;
  return (ok.length?ok:out).sort((a,b)=>a.n-b.n);
}
/* "ordinary" words -- what a casual player can actually summon under pressure */
const plain=w=>!/[JQXZVKW]/.test(w)&&new Set(w).size===5;
const EASY=DECK.filter(plain);
const OPEN=['CRANE','SLATE','ADIEU','AUDIO','RAISE','STARE','TRACE','ARISE','LATER','RATIO'];

/* A casual solver: forgets clues often, and can only call to mind ordinary words. */
function solve(target,pool,G,disc,vocab){
  let p=pool,g=OPEN[Math.floor(Math.random()*OPEN.length)];
  if(!p.includes(g))g=p[Math.floor(Math.random()*p.length)];
  for(let t=0;t<G;t++){
    if(g===target)return t+1;
    const r=evaluate(g,target);
    p=p.filter(w=>consistent(w,g,r));
    if(t===G-1)break;
    if(!p.length)return 0;
    let pick=p;
    if(vocab){const e=p.filter(plain);if(e.length)pick=e;}
    g=(Math.random()<disc)?pick[Math.floor(Math.random()*pick.length)]
                          :DECK[Math.floor(Math.random()*NW)];
  }
  return 0;
}
const BANDS=[[0,58],[59,64],[65,69],[70,75],[76,99]];
function deal(skew){
  const b=skew?BANDS.slice(1):BANDS;   /* skew drops the sharpest band from the deal */
  return b.map(x=>{const p=DECK.filter(w=>RATE[w]>=x[0]&&RATE[w]<=x[1]);
    return p[Math.floor(Math.random()*p.length)]}).sort((a,b)=>RATE[a]-RATE[b]);
}
/* the setter plays to win, so the word you face is systematically the sharp one */
function faced(skew,cap){
  const c=deal(skew),w=Math.random()<.62?c[0]:c[Math.floor(Math.random()*3)];
  const o=offerTells(w,cap);
  const baits=o.filter(t=>t.k==='pin'&&t.n>=14&&t.n<=200);
  const t=baits.length&&Math.random()<.55?baits[Math.floor(Math.random()*baits.length)]
        :o[Math.floor(Math.random()*o.length)];
  return [w,t];
}
const PLAYERS={'casual  (forgets a lot, plain words only)':[0.55,true],
               'average (mostly applies clues)':[0.75,true],
               'sharp   (full deck, disciplined)':[0.88,false]};
const N=2500;
function run(label,G,skew,cap){
  console.log('\n'+label);
  console.log('   '+'player'.padEnd(40)+' beats the setter (<=3)   solves it (<=4)   never gets it');
  for(const [nm,[disc,vocab]] of Object.entries(PLAYERS)){
    const hist=[0,0,0,0,0];let miss=0;
    for(let i=0;i<N;i++){
      const [w,t]=faced(skew,cap);
      const n=solve(w,survivors(t,DECK),G,disc,vocab);
      if(n)hist[n]++;else miss++;
    }
    const solved=hist.reduce((a,b)=>a+b,0);
    const win=hist[1]+hist[2]+hist[3];
    const pc=x=>String(Math.round(100*x/N)+'%').padStart(8);
    console.log('   '+nm.padEnd(40)+pc(win)+'          '+pc(solved)+'         '+pc(miss));
  }
}
run('THE PROPOSAL — 4 guesses to solve, but only 3 count for the bet',4,false,250);
