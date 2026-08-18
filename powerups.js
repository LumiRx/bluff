/* ══════════ POWER-UPS ══════════
   Every item hands somebody something. The two that take away -- SCRAMBLE and
   SWAP -- are deliberately built so they never lie to you: the scrambled keys
   still say what they type, and a swapped word still fits the clue everyone
   paid for, with all boards reset so nobody loses deductions they bought. */
const ITEMS={
  hint: {ic:"\u{1F4A1}",lb:"HINT",  target:0,rare:0,phase:"play",
         desc:"Reveals one letter of the word, in place, on your board."},
  gift: {ic:"\u{1F381}",lb:"GIFT",  target:1,rare:0,phase:"play",
         desc:"Hand a live letter to another player. They are told it came from you."},
  peek: {ic:"\u{1F441}",lb:"PEEK",  target:1,rare:0,phase:"play",
         desc:"See a rival's most recent guess and what it scored."},
  seat: {ic:"\u{1F500}",lb:"SEAT",  target:0,rare:0,phase:"action",
         desc:"Move to the back of the betting order and watch everyone act first."},
  mull: {ic:"\u{267B}",  lb:"REDEAL",target:0,rare:0,phase:"deal",
         desc:"Throw your five cards away and take five new ones."},
  scram:{ic:"\u{1F300}",lb:"SCRAM", target:1,rare:0,phase:"play",
         desc:"Shuffles a rival's keyboard for six seconds. The keys move; they never lie."},
  swap: {ic:"\u{1F3B2}",lb:"SWAP",  target:0,rare:1,phase:"play",
         desc:"The word becomes a different one that fits the same clue. Every board resets."}
};
const COMMON_ITEMS=["hint","gift","peek","seat","mull","scram"];
const MAXITEMS=4;

function grantItem(seat,key){
  if(!seat.items)seat.items=[];
  if(seat.items.length>=MAXITEMS)return null;
  const k=key||(rnd()<.045?"swap":COMMON_ITEMS[Math.floor(rnd()*COMMON_ITEMS.length)]);
  seat.items.push(k);
  return k;
}
function spendItem(seat,key){
  const i=seat.items.indexOf(key);
  if(i<0)return false;
  seat.items.splice(i,1);return true;
}
function itemUsableNow(k){
  const it=ITEMS[k];
  if(it.phase==="deal")return S.phase==="deal";
  if(it.phase==="action")return S.phase==="action"&&S.awaitingHuman;
  return S.phase==="play"&&S.seats[0].state==="call"
    &&!S.seats[0].cracked&&S.seats[0].guesses.length<GUESSES;
}
function targetOK(s){
  if(S.arm==="peek")return s.guesses&&s.guesses.length>0;
  if(S.arm==="gift")return s.state==="call"&&!s.cracked;
  if(S.arm==="scram")return s.state==="call"&&!s.cracked;
  return false;
}

function drawTray(){
  const t=$("tray");if(!t)return;
  const me=S.seats[0],its=me.items||[];
  let h="";
  for(let i=0;i<MAXITEMS;i++){
    const k=its[i];
    if(!k){h+="<div class='item empty'></div>";continue;}
    const it=ITEMS[k];
    h+="<div class='item"+(it.rare?" rare":"")+(S.arm===k?" armed":"")
      +(itemUsableNow(k)?"":" empty")+"' data-k='"+k+"' data-i='"+i+"'>"
      +"<div class='ic'>"+it.ic+"</div><div class='lb'>"+it.lb+"</div></div>";
  }
  t.innerHTML=h;
  [...t.querySelectorAll(".item[data-k]")].forEach(el=>{
    const k=el.dataset.k;
    if(!itemUsableNow(k))return;
    el.onclick=()=>armItem(k);
  });
  const hint=$("trayHint");
  if(hint)hint.textContent=S.arm
    ?(ITEMS[S.arm].target?"tap a player to use "+ITEMS[S.arm].lb:ITEMS[S.arm].desc)
    :(its.length?"tap an item to use it":"win hands to earn power-ups");
}
function armItem(k){
  if(S.arm===k){S.arm=null;drawTray();drawTable();return;}
  S.arm=k;
  if(!ITEMS[k].target){useItem(k,null);return;}
  drawTray();drawTable();
  toast(ITEMS[k].desc,2600);
}
function fireItem(seat){if(S.arm)useItem(S.arm,seat);}

function unknownLetter(word,seat){
  /* a letter of the word this player has not already pinned green */
  const known=new Set();
  (seat.marks||[]).forEach((m,gi)=>m.forEach((v,i)=>{if(v==="h")known.add(i);}));
  if(seat.given)seat.given.forEach(i=>known.add(i));
  const spots=[0,1,2,3,4].filter(i=>!known.has(i));
  if(!spots.length)return null;
  return spots[Math.floor(rnd()*spots.length)];
}
function applyLetter(seat,pos,fromName){
  if(!seat.given)seat.given=[];
  seat.given.push(pos);
  const ch=S.word[pos];
  if(seat.you){
    kbState[ch]="h";paintKb();
    const gv=document.querySelector(".brow.given");
    if(gv&&gv.children[pos]){gv.children[pos].className="tile h";gv.children[pos].textContent=ch;}
    eventBanner(fromName?fromName+" GAVE YOU A LETTER":"HINT",
      "The "+["1st","2nd","3rd","4th","5th"][pos]+" letter is "+ch+"."
      +(fromName?" They wanted you to know they know.":""),3000);
  }else{
    seat.pool=(seat.pool||S.pool.slice()).filter(w=>w[pos]===ch);
    if(!seat.pool.length)seat.pool=S.pool.slice();
  }
}

function useItem(k,seat){
  const me=S.seats[0];
  if(!spendItem(me,k)){S.arm=null;drawTray();return;}
  S.arm=null;
  if(k==="hint"){
    const p=unknownLetter(S.word,me);
    if(p==null)toast("you already have every letter");
    else applyLetter(me,p,null);
  }
  else if(k==="gift"&&seat){
    const p=unknownLetter(S.word,seat);
    if(p==null)toast(seat.name+" already has it all");
    else{applyLetter(seat,p,P.handle);
      toast("You handed "+seat.name+" the "+["1st","2nd","3rd","4th","5th"][p]+" letter",2800);}
  }
  else if(k==="peek"&&seat){
    const g=seat.guesses[seat.guesses.length-1];
    const m=seat.marks[seat.marks.length-1];
    eventBanner("PEEK — "+seat.name,
      g.split("").map((c,i)=>"<b style='display:inline-block;width:20px;padding:3px 0;margin:0 1px;"
      +"border-radius:3px;font-size:13px;background:"+(m[i]==="h"?"#3fa96b":m[i]==="n"?"#d8a13f":"#2c3d36")
      +";color:"+(m[i]==="m"?"#7f9a8d":"#0b1a12")+"'>"+c+"</b>").join(""),3400);
  }
  else if(k==="scram"&&seat){
    /* a bot has no keyboard to shuffle, so the honest equivalent is losing
       the time a human loses hunting for moved keys */
    seat.pace=Math.round(seat.pace*2.1);seat.nextAt=Date.now()+3200;
    toast(seat.name+" is fumbling for the keys",2600);
  }
  else if(k==="seat"){
    if(S.order&&S.oi<S.order.length){
      const mine=S.order.indexOf(0);
      if(mine>-1){S.order.splice(mine,1);S.order.push(0);}
      S.awaitingHuman=false;
      eventBanner("SEAT CHANGED","You act last now. Everyone else shows their hand first.",2400);
      drawTable();drawTray();return stepAction();
    }
  }
  else if(k==="mull"){
    S.hand5=dealCards();S.card=null;
    phaseDeal(true);
    return;
  }
  else if(k==="swap"){doWordSwap(P.handle);return;}
  drawTray();drawTable();
}

/* ══════════ WORD SWAP ══════════
   Fair by construction: the replacement still satisfies the clue people paid
   for, and every board resets so nobody is punished for deductions made
   against the old word. */
function doWordSwap(byName){
  const pool=survivors(S.tell,DECK).filter(w=>w!==S.word);
  if(!pool.length)return toast("nothing else fits the clue");
  S.word=pool[Math.floor(rnd()*pool.length)];
  S.seats.forEach(s=>{
    if(s.state==="call"||s.state==="crack"||s.state==="bust"){
      s.guesses=[];s.marks=[];s.cracked=false;s.state="call";s.given=[];
      s.pool=S.pool.slice();s.last=null;s.nextAt=Date.now()+1400+rnd()*1800;
    }
  });
  const me=S.seats[0];
  if(me.state==="call"){
    kbState={};seedKb();S.row=0;S.cur="";
    if($("board")){buildBoard();paintKb();}
  }
  S.settling=false;
  if(!S.tick)S.tick=setInterval(botTick,140);
  drawRivals();drawTable();drawTray();
  eventBanner("\u{1F3B2} WORD SWAPPED",
    byName+" burned the die. The word is gone — a different one that fits the same clue "
    +"has taken its place, and every board on the table just reset.",4200);
}

/* ══════════ SCRAMBLE ══════════ */
let scramTimer=null;
function scrambleKeyboard(ms){
  const keys=[...document.querySelectorAll(".key")].filter(k=>/^[A-Z]$/.test(k.dataset.k));
  if(!keys.length)return;
  const orig=keys.map(k=>k.dataset.k);
  const sh=orig.slice();
  for(let i=sh.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));
    const t=sh[i];sh[i]=sh[j];sh[j]=t;}
  const put=arr=>keys.forEach((k,i)=>{k.textContent=arr[i];k.dataset.k=arr[i];
    k.onclick=()=>press(arr[i]);});
  put(sh);paintKb();
  eventBanner("\u{1F300} KEYBOARD SCRAMBLED",
    "Your keys have moved. They still type what they say — you just have to find them.",2600);
  clearTimeout(scramTimer);
  scramTimer=setTimeout(()=>{put(orig);paintKb();},ms);
}

/* ══════════ BOTS USING ITEMS ══════════ */
function botItemTick(){
  if(S.phase!=="play")return;
  const me=S.seats[0];
  S.seats.forEach(b=>{
    if(b.you||b.state!=="call"||b.cracked||!b.items||!b.items.length)return;
    if(b.nextItem&&Date.now()<b.nextItem)return;
    b.nextItem=Date.now()+7000+rnd()*9000;
    if(rnd()>.42)return;
    const k=b.items[Math.floor(rnd()*b.items.length)];
    if(k==="scram"&&me.state==="call"&&!me.cracked&&me.guesses.length<GUESSES){
      spendItem(b,k);scrambleKeyboard(6000);
      toast(b.name+" scrambled your keyboard",2600);
    }else if(k==="gift"&&me.state==="call"&&!me.cracked){
      const p=unknownLetter(S.word,me);
      if(p!=null){spendItem(b,k);applyLetter(me,p,b.name);}
    }else if(k==="hint"){
      spendItem(b,k);
      const p=unknownLetter(S.word,b);
      if(p!=null)applyLetter(b,p,null);
    }else if(k==="swap"&&b.guesses.length>=2){
      spendItem(b,k);doWordSwap(b.name);
    }
  });
}
