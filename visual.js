/* ══════════ AVATARS ══════════ */
const FACES=["\u{1F98A}","\u{1F43B}","\u{1F43A}","\u{1F989}","\u{1F438}","\u{1F988}",
"\u{1F419}","\u{1F985}","\u{1F40D}","\u{1F981}","\u{1F42F}","\u{1F428}","\u{1F99D}",
"\u{1F437}","\u{1F42E}","\u{1F435}","\u{1F984}","\u{1F409}","\u{1F47D}","\u{1F916}",
"\u{1F3A9}","\u{1F480}","\u{1F427}","\u{1F9A9}"];
const faceOf=n=>FACES[hashStr(n||"?")%FACES.length];
const myFace=()=>P.face||faceOf(P.handle||"?");

/* ══════════ TABLE ══════════ */
const SEATPOS=[[50,86],[13,64],[19,16],[50,6],[81,16],[87,64]];
const POTPOS=[50,44];
let lastChips={};

function drawTable(){
  if(!S.seats)return;
  const t=$("table");
  [...t.querySelectorAll(".seat")].forEach(e=>e.remove());
  S.seats.forEach((s,i)=>{
    const c=["seat"];
    if(s.you)c.push("you","btm");
    if(s.setter)c.push("setter");
    if(s.state==="fold")c.push("out");
    if(s.state==="call")c.push("callst");
    if(s.state==="crack")c.push("crack");
    if(s.state==="bust")c.push("bust");
    if(s.acting)c.push("acting");
    if(S.arm&&ITEMS[S.arm].target&&!s.you&&targetOK(s))c.push("targetable");
    if(s.ticking)c.push("ticking");
    const d=document.createElement("div");
    d.className=c.join(" ");
    d.style.left=SEATPOS[i][0]+"%";d.style.top=SEATPOS[i][1]+"%";
    let tag="";
    if(s.setter)tag="<div class='tag wait'>SETTER</div>";
    else if(s.state==="call")tag="<div class='tag call'>IN "+S.stake+"</div>";
    else if(s.state==="fold")tag="<div class='tag fold'>FOLD</div>";
    else if(s.state==="crack")tag="<div class='tag call'>CRACKED</div>";
    else if(s.state==="bust")tag="<div class='tag fold'>MISSED</div>";
    const prev=lastChips[i];
    const move=prev==null?"":(s.chips>prev?" up":(s.chips<prev?" dn":""));
    lastChips[i]=s.chips;
    const frac=s.ticking?Math.max(0,Math.min(1,(s.deadline-Date.now())/CLOCK_SHOW)):1;
    d.innerHTML=
      "<div class='ava'>"+(s.you?myFace():faceOf(s.name))
      +(s.setter?"<div class='btnD'>D</div>":"")
      +"<i class='ring'></i>"
      +"<svg class='clk' viewBox='0 0 100 100'><circle cx='50' cy='50' r='46' "
      +"stroke='"+(frac<.34?"#d4574e":"#e6c069")+"' stroke-dasharray='289' "
      +"stroke-dashoffset='"+(289*(1-frac)).toFixed(1)+"'/></svg>"
      +"</div>"
      +"<div class='nm'>"+s.name+"</div>"
      +"<div class='ch"+move+"'>"+s.chips+"</div>"+tag;
    if(S.arm&&ITEMS[S.arm].target&&!s.you&&targetOK(s))
      d.onclick=()=>fireItem(s);
    t.appendChild(d);
  });
  $("hHand").textContent=Math.min(S.hand+1,HANDS)+"/"+HANDS;
  $("hChips").textContent=S.seats[0].chips;
  setPot(S.pot);
}

/* pot counts up rather than jumping */
let potShown=0,potAnim=null;
function setPot(v){
  const el=$("potVal");if(!el)return;
  if(potAnim)clearInterval(potAnim);
  const from=potShown,d=v-from;
  if(!d){el.textContent=v;potShown=v;return;}
  const t0=Date.now();
  potAnim=setInterval(()=>{
    const k=Math.min(1,(Date.now()-t0)/480);
    el.textContent=Math.round(from+d*(1-Math.pow(1-k,3)));
    if(k>=1){clearInterval(potAnim);potAnim=null;potShown=v;}
  },28);
  potShown=v;
}

/* ══════════ CHIPS IN FLIGHT ══════════ */
function chipCount(amt){return amt>=100?5:amt>=50?4:amt>=25?3:2;}
function flyChips(from,to,n,kind){
  const layer=$("chipLayer");if(!layer)return;
  const A=from==null?POTPOS:SEATPOS[from];
  const B=to==null?POTPOS:SEATPOS[to];
  for(let k=0;k<n;k++){
    const c=document.createElement("div");
    c.className="chip"+(kind?" "+kind:"");
    c.style.left=A[0]+"%";c.style.top=A[1]+"%";
    c.style.transitionDelay=(k*65)+"ms";
    layer.appendChild(c);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      c.style.left=(B[0]+(Math.random()*9-4.5))+"%";
      c.style.top=(B[1]+(Math.random()*9-4.5))+"%";
    }));
    setTimeout(()=>{c.style.opacity="0";},640+k*65);
    setTimeout(()=>{c.remove();},1050+k*65);
  }
}
function betAnim(seatIdx,amt){flyChips(seatIdx,null,chipCount(amt),null);}
function payAnim(seatIdx,amt,win){flyChips(null,seatIdx,chipCount(amt),win?"green":"red");}

/* ══════════ EVENT BANNER ══════════ */
let evTimer=null;
function eventBanner(title,body,ms){
  const b=$("eventBar");if(!b)return;
  b.innerHTML="<b>"+title+"</b><span>"+body+"</span>";
  b.classList.add("on");
  clearTimeout(evTimer);
  evTimer=setTimeout(()=>b.classList.remove("on"),ms||2600);
}
