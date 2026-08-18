/* ══════════ TABLE CODES ══════════
   A code IS the table. It seeds the deal, so everyone who enters the same code
   plays the identical six hands and the scores are directly comparable --
   which makes the invite real rather than a placeholder for a server. */
const CODE_AB="ACDEFGHJKLMNPQRTUVWXY3479";
function makeCode(){
  let c="";for(let i=0;i<5;i++)c+=CODE_AB[Math.floor(Math.random()*CODE_AB.length)];
  return c;
}
const tableLink=c=>"bluff.gg/t/"+c;

function screenTable(code){
  const c=code||S.lastCode||makeCode();
  S.lastCode=c;
  let qr="";
  try{qr=qrSvg(tableLink(c),190);}catch(e){qr="<div class='fine'>code too long for a QR</div>";}
  ovShow("<h2>YOUR TABLE</h2>"
   +"<p class='fine'>Anyone who enters this code plays the <b>same six deals</b> you do, "
   +"so the scores line up. Send it, or hold the code up and let them scan it.</p>"
   +"<div id='qr'>"+qr+"</div>"
   +"<div class='code'>"+c+"</div>"
   +"<p class='fine'>"+tableLink(c)+"</p>"
   +"<div class='row'><button class='btn alt' id='cpc'>COPY INVITE</button>"
   +"<button class='btn go' id='ply'>PLAY THIS TABLE</button></div>"
   +"<div class='row'><button class='btn alt' id='newc'>NEW CODE</button>"
   +"<button class='btn alt' id='bk'>BACK</button></div>",true);
  $("cpc").onclick=()=>{
    const t=(P.handle||"Someone")+" dealt you in at BLUFF — table "+c+"\n"+tableLink(c);
    try{navigator.clipboard.writeText(t);toast("invite copied");}catch(e){toast("select and copy");}
  };
  $("ply").onclick=()=>startMatch("code",c);
  $("newc").onclick=()=>screenTable(makeCode());
  $("bk").onclick=screenHome;
}

function screenJoin(pre){
  ovShow("<h2>JOIN A TABLE</h2>"
   +"<p class='fine'>Type the five-character code a friend sent you, or scan their QR "
   +"with your camera and follow the link.</p>"
   +"<input id='jc' maxlength='5' placeholder='TABLE CODE' autocomplete='off' "
   +"value='"+(pre||"")+"'>"
   +"<div class='row'><button class='btn go' id='jgo'>SIT DOWN</button></div>"
   +"<div class='row'><button class='btn alt' id='bk'>BACK</button></div>",true);
  const i=$("jc");i.focus();
  i.oninput=()=>{i.value=i.value.toUpperCase().replace(/[^A-Z0-9]/g,"");};
  i.onkeydown=e=>{if(e.key==="Enter")$("jgo").click();};
  $("jgo").onclick=()=>{
    const v=i.value.trim();
    if(v.length<3)return toast("that code looks short");
    S.lastCode=v;startMatch("code",v);
  };
  $("bk").onclick=screenHome;
}

/* ══════════ FRIENDS ══════════ */
function screenFriends(){
  const fr=P.friends||[];
  ovShow("<h2>FRIENDS</h2>"
   +(fr.length?"<div class='frlist'>"+fr.map((f,i)=>
      "<div class='fr'><span class='f'>"+faceOf(f.h)+"</span><b>"+f.h+"</b>"
      +"<u>added "+prettyDate(f.d)+"</u>"
      +"<button class='x' data-i='"+i+"'>&times;</button></div>").join("")+"</div>"
     :"<p class='fine'>Nobody here yet. Add the handles of people you play with and "
      +"they show up on your invites.</p>")
   +"<input id='fn' maxlength='9' placeholder='ADD A HANDLE' autocomplete='off'>"
   +"<div class='row'><button class='btn' id='fadd'>ADD</button></div>"
   +"<div class='row'><button class='btn alt' id='inv'>MAKE A TABLE</button>"
   +"<button class='btn alt' id='bk'>BACK</button></div>",true);
  const i=$("fn");
  i.oninput=()=>{i.value=i.value.toUpperCase().replace(/[^A-Z0-9]/g,"");};
  i.onkeydown=e=>{if(e.key==="Enter")$("fadd").click();};
  $("fadd").onclick=()=>{
    const v=i.value.trim();
    if(v.length<2)return toast("two characters or more");
    if(!P.friends)P.friends=[];
    if(P.friends.some(x=>x.h===v))return toast("already on the list");
    P.friends.push({h:v,d:todayKey()});saveP();screenFriends();
  };
  [...document.querySelectorAll(".fr .x")].forEach(b=>{
    b.onclick=()=>{P.friends.splice(+b.dataset.i,1);saveP();screenFriends();};
  });
  $("inv").onclick=()=>screenTable(makeCode());
  $("bk").onclick=screenHome;
}

/* a shared link drops you straight onto that table */
function codeFromUrl(){
  const m=(location.hash+location.search).match(/[/?#&=]t[/=]?([A-Z0-9]{3,6})/i)
        ||location.href.match(/\/t\/([A-Z0-9]{3,6})/i);
  return m?m[1].toUpperCase():null;
}
