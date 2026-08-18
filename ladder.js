/* Does the ladder converge, and how long does a good player take to climb? */
const ROSTER=[1712,1783,1668,1655,1621,1596,1544,1509,1478,1435,1420,1389,1361,1332];
const SEATS=6,BUYIN=1000;
function delta(place,chips,field,rating){
  const pl=(SEATS-place)/(SEATS-1);
  const mg=Math.max(0,Math.min(1,.5+(chips-BUYIN)/2000));
  const s=.7*pl+.3*mg, e=1/(1+Math.pow(10,(field-rating)/400));
  return Math.round(44*(s-e));
}
const TIERS=[[0,'RAILBIRD'],[1350,'GRINDER'],[1450,'REGULAR'],[1550,'SHARP'],
             [1650,'ROUNDER'],[1750,'SHARK'],[1875,'LEGEND']];
const tier=r=>{let t=TIERS[0];TIERS.forEach(x=>{if(r>=x[0])t=x});return t[1]};
function field(rating){
  return ROSTER.slice().sort((a,b)=>Math.abs(a-rating)-Math.abs(b-rating))
    .slice(0,5).reduce((a,b)=>a+b,0)/5;
}
// Skill levels expressed as average placement + average chips, from the measured
// smart-player run (2.3rd, +142) and worse/better variants.
const PLAYERS={
  'strong  (2.3rd, +142)':[2.3,1142],
  'good    (2.8rd, +60)' :[2.8,1060],
  'average (3.5rd, 0)'   :[3.5,1000],
  'weak    (4.4rd, -120)':[4.4, 880],
};
for(const [name,[pl,ch]] of Object.entries(PLAYERS)){
  let r=1500; const marks={};
  for(let m=1;m<=200;m++){
    r+=delta(pl,ch,field(r),r);
    const t=tier(r); if(!marks[t])marks[t]=m;
  }
  const path=Object.entries(marks).map(([t,m])=>t+'@'+m).join(' → ');
  console.log(name.padEnd(24)+'settles '+Math.round(r)+' ('+tier(r)+')   '+path);
}
