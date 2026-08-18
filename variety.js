/* What mix of clue types does a daily session actually serve up? */
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/index.html','utf8');
const js=src.match(/<script>([\s\S]*)<\/script>/)[1];
// stub the DOM so the game module can be evaluated headlessly
const stub={getElementById:()=>({classList:{add(){},remove(){},contains:()=>false},
  style:{},dataset:{},appendChild(){},insertAdjacentHTML(){},focus(){},
  set innerHTML(v){},get innerHTML(){return""},set textContent(v){},addEventListener(){},onclick:null}),
  querySelectorAll:()=>[],addEventListener(){},documentElement:{}};
const sandbox={document:stub,window:{},localStorage:undefined,navigator:{},
  setTimeout(){},setInterval(){},clearInterval(){},Date,Math,JSON,console};
const ctx=require('vm').createContext(sandbox);
try{require('vm').runInContext(js,ctx);}catch(e){console.log('load:',e.message);}
const G=ctx;
const counts={pin:0,float:0,void:0}, prices={25:0,50:0,100:0};
let days=0;
for(let d=0;d<40;d++){
  const key="2026-08-"+String((d%28)+1).padStart(2,"0");
  G.setSeed(G.hashStr("bluff-"+key));
  const sc=G.buildScript([{style:"tricky"},{style:"solid"},{style:"loose"},{style:"tight"},{style:"solid"}]);
  days++;
  sc.forEach(h=>{if(h.tell){counts[h.tell.k]++;prices[h.stake]++;}});
}
const tot=counts.pin+counts.float+counts.void;
console.log(`${days} daily sessions, ${tot} bot-set hands`);
console.log('  clue types:',Object.entries(counts).map(([k,v])=>`${k} ${Math.round(100*v/tot)}%`).join('  '));
console.log('  prices:',Object.entries(prices).map(([k,v])=>`${k} ${Math.round(100*v/tot)}%`).join('  '));
