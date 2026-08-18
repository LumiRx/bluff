/* ══════════ SCREENS ══════════ */
const avatarOf=h=>{const c=["#e6c069","#7fe0a6","#d69a72","#9db8a8","#cbb271","#d4574e"][hashStr(h||"?")%6];
  return "<span class='av2' style='border-color:"+c+";color:"+c+"'>"+((h||"?")[0]||"?")+"</span>";};

function screenHome(){
  if(!P.handle)return screenHandle();
  const t=tierOf(P.rating),nx=nextTier(P.rating);
  const done=dailyDone();
  ovShow(
   "<div class='hrow'>"+avatarOf(P.handle)
   +"<div class='hwho'><b>"+P.handle+"</b>"+badge(P.rating)+"</div></div>"
   +"<div class='sgrid'>"
     +"<div class='sc'><b>"+P.rating+"</b><span>RATING</span></div>"
     +"<div class='sc'><b>"+P.bankroll.toLocaleString()+"</b><span>BANKROLL</span></div>"
     +"<div class='sc'><b>"+P.w+"–"+P.l+"</b><span>RECORD</span></div>"
     +"<div class='sc'><b>"+(P.streak||0)+"</b><span>STREAK</span></div>"
   +"</div>"
   +(nx?"<div class='prog'><i style='width:"+Math.round(100*(P.rating-t[0])/(nx[0]-t[0]))
     +"%;background:"+t[2]+"'></i></div><p class='fine'>"+(nx[0]-P.rating)
     +" rating to "+nx[1]+"</p>":"<p class='fine'>Top of the ladder.</p>")
   +"<div class='row'><button class='btn' id='cash'>CASH GAME<small>bankroll and rating</small></button></div>"
   +"<div class='row'><button class='btn "+(done?"alt":"go")+"' id='daily'>"
     +(done?"DAILY PLAYED":"DAILY TABLE")+"<small>"
     +(done?"back tomorrow · streak "+P.daily.streak:"same six deals for everyone today")
     +"</small></button></div>"
   +"<div class='row'><button class='btn alt' id='prof'>PROFILE</button>"
   +"<button class='btn alt' id='lead'>LADDER</button>"
   +"<button class='btn alt' id='howto'>RULES</button></div>"
   +(Store.live?"":"<p class='fine warn'>This viewer blocks local storage, so your record "
     +"will not survive a reload. Open the file directly and it persists.</p>"));
  $("cash").onclick=()=>startMatch(false);
  $("daily").onclick=()=>{if(done)return toast("Today is played. Come back tomorrow.");startMatch(true);};
  $("prof").onclick=screenProfile;
  $("lead").onclick=()=>screenBoard("ladder");
  $("howto").onclick=help;
}

function screenHandle(){
  ovShow("<h1>BLUFF</h1>"
   +"<p style='letter-spacing:.1em;font-size:11px;margin-top:2px'>PICK A WORD. BET THEY CANNOT GET IT.</p>"
   +"<div class='ex'><i class='h'>W</i><i></i><i></i><i></i><i class='h'>H</i></div>"
   +"<p>Six seats, six hands, the button rotates. On your hand you choose a secret word, give the "
   +"table <b>one clue</b>, and name your price. Anyone who calls gets three guesses — "
   +"<b>miss and they pay you, crack it and you pay them.</b></p>"
   +"<p>Everything you do from here goes on your record.</p>"
   +"<input id='hnd' maxlength='9' placeholder='PICK A HANDLE' autocomplete='off'>"
   +"<div class='row'><button class='btn' id='go2'>TAKE A SEAT</button></div>");
  const i=$("hnd");i.focus();
  i.oninput=()=>{i.value=i.value.toUpperCase().replace(/[^A-Z0-9]/g,"");};
  i.onkeydown=e=>{if(e.key==="Enter")$("go2").click();};
  $("go2").onclick=()=>{
    const v=i.value.trim();
    if(v.length<2)return toast("two characters or more");
    if(R.some(r=>r.name===v))return toast("a regular already uses that name");
    P.handle=v;saveP();screenHome();
  };
}

function screenProfile(){
  const crack=P.called?Math.round(100*P.cracked/P.called):0;
  const held=P.setHands?Math.round(100*P.setHeld/P.setHands):0;
  const read=P.foldsJudged?Math.round(100*P.goodFolds/P.foldsJudged):0;
  const row=(a,b,c)=>"<tr><td>"+a+"</td><td class='d'>"+(c||"")+"</td><td>"+b+"</td></tr>";
  ovShow(
   "<div class='hrow'>"+avatarOf(P.handle)+"<div class='hwho'><b>"+P.handle+"</b>"
   +badge(P.rating)+"<em>at the table since "+prettyDate(P.made)+"</em></div></div>"
   +"<div class='sgrid'>"
     +"<div class='sc'><b>"+P.rating+"</b><span>RATING</span></div>"
     +"<div class='sc'><b>"+P.bankroll.toLocaleString()+"</b><span>BANKROLL</span></div>"
     +"<div class='sc'><b>"+P.w+"–"+P.l+"</b><span>RECORD</span></div>"
   +"</div>"
   +"<div class='sect'>THE TABLE</div><table class='lb'>"
   +row("Matches",P.matches)
   +row("Won outright",P.firsts,P.matches?Math.round(100*P.firsts/P.matches)+"%":"")
   +row("Best streak",P.bestStreak,"current "+P.streak)
   +row("Peak rating",P.peakRating,"peak bank "+P.peakBank.toLocaleString())
   +(P.busts?row("Busted","<span style='color:#d4574e'>"+P.busts+"</span>","rebought"):"")
   +"</table>"
   +"<div class='sect'>WHEN YOU SET</div><table class='lb'>"
   +row("Hands set",P.setHands)
   +row("Held it",P.setHeld,held+"% of the time")
   +row("Scared them off",P.setNoTakers,"nobody called")
   +row("Chips taken",(P.setChips>=0?"+":"")+P.setChips)
   +"</table>"
   +"<div class='sect'>WHEN THEY SET</div><table class='lb'>"
   +row("Called",P.called)
   +row("Cracked it",P.cracked,crack+"% crack rate")
   +row("Folded",P.foldedN,read+"% good laydowns")
   +row("Chips taken",(P.callChips>=0?"+":"")+P.callChips)
   +"</table>"
   +(P.bestBluff?"<div class='sect'>BEST BLUFF</div><div class='hl'><b>"+P.bestBluff.word+"</b>"
     +"<span>"+P.bestBluff.rate+"% card · "+P.bestBluff.callers+" called · nobody cracked it</span>"
     +"<u>+"+P.bestBluff.take+"</u></div>":"")
   +(P.bigHand?"<div class='sect'>BIGGEST HAND</div><div class='hl'><b>"+P.bigHand.word+"</b>"
     +"<span>"+P.bigHand.rate+"% card · "+P.bigHand.callers+" called</span>"
     +"<u>+"+P.bigHand.take+"</u></div>":"")
   +"<div class='row'><button class='btn alt' id='wipe'>RESET CAREER</button>"
   +"<button class='btn' id='bk'>BACK</button></div>");
  $("bk").onclick=screenHome;
  $("wipe").onclick=function(){
    if(this.dataset.armed){const h=P.handle;P=blankProfile();P.handle=h;R=blankRivals();
      saveP();saveR();toast("career wiped");screenHome();return;}
    this.dataset.armed="1";this.textContent="TAP AGAIN TO WIPE";this.classList.add("dan");
  };
}

function screenBoard(tab){
  const t=tab||"ladder";
  let body;
  if(t==="ladder"){
    const all=R.map(r=>({name:r.name,rating:r.rating,bank:r.bank,w:r.w,l:r.l,note:r.note}))
      .concat([{name:P.handle,rating:P.rating,bank:P.bankroll,w:P.w,l:P.l,you:true,
                note:"that is you"}])
      .sort((a,b)=>b.rating-a.rating);
    body=all.map((r,i)=>"<tr"+(r.you?" class='me'":"")+"><td class='pos'>"+(i+1)+"</td>"
      +"<td>"+r.name+"<em>"+r.note+"</em></td>"
      +"<td class='d'>"+r.w+"–"+r.l+"</td>"
      +"<td>"+badge(r.rating)+"<br><span class='rt'>"+r.rating+"</span></td></tr>").join("");
  }else{
    const b=dailyBoard();
    body=b.map((r,i)=>"<tr"+(r.you?" class='me'":"")+"><td class='pos'>"+(i+1)+"</td>"
      +"<td>"+r.name+"</td><td class='d'>"+tierOf(r.rating)[1]+"</td>"
      +"<td>"+(r.score>=BUYIN?"+":"")+(r.score-BUYIN)+"</td></tr>").join("");
    if(!dailyDone())body+="<tr><td colspan='4' class='d' style='text-align:center;padding:10px'>"
      +"you have not played today</td></tr>";
  }
  ovShow("<h2>"+(t==="ladder"?"THE LADDER":"TODAY&rsquo;S TABLE")+"</h2>"
   +"<div class='tabs'><button class='"+(t==="ladder"?"on":"")+"' id='t1'>LADDER</button>"
   +"<button class='"+(t==="daily"?"on":"")+"' id='t2'>DAILY</button></div>"
   +"<table class='lb board'>"+body+"</table>"
   +"<p class='fine'>"+(t==="ladder"
     ?"Regulars carry their own rating and record. You are seated against the ones nearest yours, "
      +"so climbing puts you in tougher games."
     :"Everyone gets the same six deals until midnight. Scores are chips above the 1,000 buy-in.")
   +"</p>"
   +"<div class='row'><button class='btn' id='bk'>BACK</button></div>");
  $("t1").onclick=()=>screenBoard("ladder");
  $("t2").onclick=()=>screenBoard("daily");
  $("bk").onclick=screenHome;
}

function screenShare(){
  const txt=shareText();
  ovShow("<h2>SHARE THE SESSION</h2>"
   +"<div class='card'>"+txt.split("\n").map((l,i)=>
      "<div class='cl"+(i===1?" big":"")+"'>"+l+"</div>").join("")+"</div>"
   +"<div class='row'><button class='btn' id='cp'>COPY</button></div>"
   +"<div class='row'><button class='btn alt' id='bk'>BACK</button></div>"
   +"<p class='fine'>The strip is the session hand by hand. "+SYM.held+" is a word you set that "
   +"nobody cracked — the one worth bragging about.</p>");
  $("cp").onclick=()=>{try{navigator.clipboard.writeText(txt);toast("copied");}catch(e){toast("select and copy");}};
  $("bk").onclick=()=>screenSummary(true);
}
