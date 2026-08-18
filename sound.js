/* ══════════ SOUND ══════════
   Everything here is synthesised at runtime through the Web Audio API. No
   files, no fetches, no bytes on the wire -- and every sound is a handful of
   numbers I can tune rather than an asset I would have to re-record. */
const Snd={
  ctx:null, on:true, master:null,
  boot(){
    if(this.ctx)return this.ctx;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    try{
      this.ctx=new AC();
      this.master=this.ctx.createGain();
      this.master.gain.value=.34;
      this.master.connect(this.ctx.destination);
    }catch(e){this.ctx=null;}
    return this.ctx;
  },
  ready(){
    const c=this.boot();
    if(!c)return null;
    if(c.state==="suspended")c.resume();
    return this.on?c:null;
  },
  /* one shaped tone */
  tone(o){
    const c=this.ready();if(!c)return;
    const t=c.currentTime+(o.at||0);
    const osc=c.createOscillator(),g=c.createGain();
    osc.type=o.type||"triangle";
    osc.frequency.setValueAtTime(o.f,t);
    if(o.to)osc.frequency.exponentialRampToValueAtTime(Math.max(20,o.to),t+o.dur);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(o.vol||.3,t+(o.atk||.006));
    g.gain.exponentialRampToValueAtTime(0.0001,t+o.dur);
    let node=osc;
    if(o.bp){
      const f=c.createBiquadFilter();
      f.type="bandpass";f.frequency.value=o.bp;f.Q.value=o.q||6;
      osc.connect(f);node=f;
    }
    node.connect(g);g.connect(this.master);
    osc.start(t);osc.stop(t+o.dur+.03);
  },
  /* a burst of filtered noise -- the transient that makes metal sound like metal */
  noise(o){
    const c=this.ready();if(!c)return;
    const t=c.currentTime+(o.at||0),len=Math.max(.02,o.dur);
    const buf=c.createBuffer(1,Math.ceil(c.sampleRate*len),c.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
    const src=c.createBufferSource();src.buffer=buf;
    const f=c.createBiquadFilter();
    f.type=o.lp?"lowpass":"bandpass";
    f.frequency.setValueAtTime(o.f||2200,t);
    if(o.to)f.frequency.exponentialRampToValueAtTime(Math.max(60,o.to),t+len);
    f.Q.value=o.q||1.2;
    const g=c.createGain();
    g.gain.setValueAtTime(o.vol||.18,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+len);
    src.connect(f);f.connect(g);g.connect(this.master);
    src.start(t);src.stop(t+len+.02);
  },

  /* ── the money sound ──
     A bright run up a pentatonic scale with a coin transient on every note.
     Scales with how much you won: more stars, more coins, higher run. */
  stars(amount){
    const n=Math.max(3,Math.min(8,3+Math.floor((amount||0)/1200)));
    const scale=[0,2,4,7,9,12,14,16];
    for(let i=0;i<n;i++){
      const at=i*.055;
      const f=740*Math.pow(2,scale[i%scale.length]/12);
      this.noise({at:at,dur:.035,f:3400,q:2.4,vol:.10});
      this.tone({at:at,f:f,dur:.20,type:"triangle",vol:.26,atk:.004});
      this.tone({at:at,f:f*2.01,dur:.13,type:"sine",vol:.10,atk:.004});
    }
    /* the till closing */
    this.tone({at:n*.055+.02,f:1180,to:1760,dur:.34,type:"triangle",vol:.20});
    this.noise({at:n*.055+.02,dur:.22,f:5200,to:900,q:1.1,vol:.08});
  },
  chip(){
    this.noise({dur:.045,f:2600,q:3,vol:.15});
    this.tone({f:420,to:260,dur:.09,type:"sine",vol:.16});
  },
  tick(){ this.tone({f:880,dur:.035,type:"sine",vol:.07}); },
  key(){ this.tone({f:520,dur:.028,type:"sine",vol:.05}); },
  good(){ this.tone({f:660,dur:.10,type:"triangle",vol:.18});
          this.tone({at:.07,f:990,dur:.13,type:"triangle",vol:.15}); },
  near(){ this.tone({f:520,dur:.10,type:"triangle",vol:.13}); },
  miss(){ this.tone({f:200,to:120,dur:.26,type:"sine",vol:.20}); },
  crack(){
    [0,4,7,12].forEach((s,i)=>{
      this.tone({at:i*.062,f:523.25*Math.pow(2,s/12),dur:.38,type:"triangle",vol:.24});
    });
    this.noise({at:.20,dur:.5,f:6000,to:1400,q:.8,vol:.07});
  },
  fold(){ this.noise({dur:.20,f:1800,to:300,q:.9,vol:.11,lp:true}); },
  spark(){
    for(let i=0;i<5;i++)
      this.tone({at:i*.03,f:1400+Math.random()*1800,dur:.09,type:"sine",vol:.10});
  },
  deal(){ this.noise({dur:.09,f:1500,to:700,q:1,vol:.12,lp:true}); },
  warn(){ this.tone({f:740,dur:.09,type:"square",vol:.09});
          this.tone({at:.13,f:740,dur:.09,type:"square",vol:.09}); },
  bust(){ this.tone({f:300,to:110,dur:.42,type:"sawtooth",vol:.13,bp:600,q:3}); },
  rank(){
    [0,7,12,16,19].forEach((s,i)=>
      this.tone({at:i*.075,f:392*Math.pow(2,s/12),dur:.55,type:"triangle",vol:.20}));
    this.noise({at:.3,dur:.7,f:7000,to:1200,q:.7,vol:.06});
  }
};
