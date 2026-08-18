/* ══════════ QR ENCODER ══════════
   Byte mode, error-correction level M, versions 1-6. Enough for a table link,
   small enough to scan off a phone screen held up to another phone. */
const QRV=[ /* [totalCodewords, ecPerBlock, blocks, dataPerBlock, capacityBytes, alignCentre] */
  [ 26,10,1,16, 14,0],
  [ 44,16,1,28, 26,18],
  [ 70,26,1,44, 42,22],
  [100,18,2,32, 62,26],
  [134,24,2,43, 84,30],
  [172,16,4,27,106,34]
];
const GF_EXP=new Uint8Array(512),GF_LOG=new Uint8Array(256);
(function(){let x=1;for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;
  x<<=1;if(x&256)x^=0x11D;}
  for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];})();
const gmul=(a,b)=>(a&&b)?GF_EXP[GF_LOG[a]+GF_LOG[b]]:0;

function rsGen(n){
  let p=[1];
  for(let i=0;i<n;i++){
    const q=[1,GF_EXP[i]],r=new Array(p.length+1).fill(0);
    for(let a=0;a<p.length;a++)for(let b=0;b<2;b++)r[a+b]^=gmul(p[a],q[b]);
    p=r;
  }
  return p;
}
function rsEncode(data,n){
  const gen=rsGen(n),res=new Array(n).fill(0);
  for(const d of data){
    const f=d^res[0];
    res.shift();res.push(0);
    if(f)for(let i=0;i<n;i++)res[i]^=gmul(gen[i+1],f);
  }
  return res;
}

function qrMatrix(text){
  const bytes=[];
  for(const ch of unescape(encodeURIComponent(text)))bytes.push(ch.charCodeAt(0));
  let v=0;
  while(v<QRV.length&&bytes.length>QRV[v][4])v++;
  if(v>=QRV.length)throw new Error("payload too long for a version 6 QR");
  const [total,ecPer,blocks,dataPer,,alignC]=QRV[v];
  const ver=v+1,size=17+ver*4;

  /* bit stream */
  const bits=[];
  const push=(val,len)=>{for(let i=len-1;i>=0;i--)bits.push((val>>i)&1);};
  push(4,4);push(bytes.length,8);
  bytes.forEach(b=>push(b,8));
  const cap=blocks*dataPer*8;
  for(let i=0;i<4&&bits.length<cap;i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const pad=[0xEC,0x11];let pi=0;
  while(bits.length<cap){push(pad[pi++%2],8);}

  /* data codewords -> blocks -> interleave with EC */
  const dw=[];
  for(let i=0;i<bits.length;i+=8){let b=0;for(let k=0;k<8;k++)b=(b<<1)|bits[i+k];dw.push(b);}
  const dBlocks=[],eBlocks=[];
  for(let b=0;b<blocks;b++){
    const chunk=dw.slice(b*dataPer,(b+1)*dataPer);
    dBlocks.push(chunk);eBlocks.push(rsEncode(chunk,ecPer));
  }
  const out=[];
  for(let i=0;i<dataPer;i++)for(let b=0;b<blocks;b++)out.push(dBlocks[b][i]);
  for(let i=0;i<ecPer;i++)for(let b=0;b<blocks;b++)out.push(eBlocks[b][i]);
  if(out.length!==total)throw new Error("codeword count "+out.length+" != "+total);

  /* grid */
  const m=[],res=[];
  for(let r=0;r<size;r++){m.push(new Array(size).fill(0));res.push(new Array(size).fill(0));}
  const setF=(r,c,v)=>{m[r][c]=v;res[r][c]=1;};
  const finder=(r,c)=>{
    for(let i=-1;i<8;i++)for(let j=-1;j<8;j++){
      const rr=r+i,cc=c+j;
      if(rr<0||cc<0||rr>=size||cc>=size)continue;
      const on=(i>=0&&i<=6&&(j===0||j===6))||(j>=0&&j<=6&&(i===0||i===6))
        ||(i>=2&&i<=4&&j>=2&&j<=4);
      setF(rr,cc,on?1:0);
    }
  };
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(let i=8;i<size-8;i++){setF(6,i,i%2===0?1:0);setF(i,6,i%2===0?1:0);}
  if(alignC){
    const cs=[6,alignC];
    cs.forEach(r=>cs.forEach(c=>{
      if((r===6&&c===6)||(r===6&&c===size-7)||(r===size-7&&c===6))return;
      for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)
        setF(r+i,c+j,(Math.abs(i)===2||Math.abs(j)===2||(i===0&&j===0))?1:0);
    }));
  }
  setF(size-8,8,1);                                  /* dark module */
  for(let i=0;i<9;i++){                              /* reserve format areas */
    if(i!==6){if(!res[8][i])setF(8,i,0);if(!res[i][8])setF(i,8,0);}
  }
  for(let i=0;i<8;i++){
    if(!res[8][size-1-i])setF(8,size-1-i,0);
    if(!res[size-1-i][8])setF(size-1-i,8,0);
  }

  /* zigzag placement */
  let bi=0,up=true;
  const stream=[];
  out.forEach(b=>{for(let i=7;i>=0;i--)stream.push((b>>i)&1);});
  for(let col=size-1;col>0;col-=2){
    if(col===6)col--;
    for(let k=0;k<size;k++){
      const row=up?size-1-k:k;
      for(let c=0;c<2;c++){
        const cc=col-c;
        if(res[row][cc])continue;
        m[row][cc]=bi<stream.length?stream[bi++]:0;
      }
    }
    up=!up;
  }

  const MASKS=[
    (r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,
    (r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>((r*c)%2+(r*c)%3)===0,
    (r,c)=>(((r*c)%2+(r*c)%3)%2)===0,(r,c)=>((((r+c)%2)+((r*c)%3))%2)===0
  ];
  const fmtBits=mask=>{
    /* level M = 00, then 3 mask bits, BCH(15,5), XOR 0x5412 */
    let d=(0<<3)|mask,e=d<<10;
    for(let i=4;i>=0;i--)if(e&(1<<(i+10)))e^=0x537<<i;
    return ((d<<10)|e)^0x5412;
  };
  const applyFmt=(g,mask)=>{
    const f=fmtBits(mask);
    /* placement order runs MSB first: bit 14 lands at (8,0) */
    const bit=i=>(f>>(14-i))&1;
    const c1=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
              [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const c2=[];
    for(let i=0;i<7;i++)c2.push([size-1-i,8]);
    for(let i=7;i<15;i++)c2.push([8,size-15+i]);
    c1.forEach((p,i)=>{g[p[0]][p[1]]=bit(i);});
    c2.forEach((p,i)=>{g[p[0]][p[1]]=bit(i);});
    g[size-8][8]=1;
  };
  const penalty=g=>{
    let p=0;
    for(let r=0;r<size;r++)for(const dir of [0,1]){
      let run=1;
      for(let c=1;c<size;c++){
        const a=dir?g[c-1][r]:g[r][c-1],b=dir?g[c][r]:g[r][c];
        if(a===b)run++;else{if(run>=5)p+=3+(run-5);run=1;}
      }
      if(run>=5)p+=3+(run-5);
    }
    for(let r=0;r<size-1;r++)for(let c=0;c<size-1;c++){
      const v=g[r][c];
      if(v===g[r][c+1]&&v===g[r+1][c]&&v===g[r+1][c+1])p+=3;
    }
    const pat=[1,0,1,1,1,0,1,0,0,0,0];
    for(let r=0;r<size;r++)for(let c=0;c<=size-11;c++){
      let h=true,v=true;
      for(let i=0;i<11;i++){if(g[r][c+i]!==pat[i])h=false;if(g[c+i][r]!==pat[i])v=false;}
      if(h)p+=40;if(v)p+=40;
    }
    let dark=0;g.forEach(row=>row.forEach(x=>dark+=x));
    p+=Math.floor(Math.abs(dark*100/(size*size)-50)/5)*10;
    return p;
  };

  let best=null,bestP=Infinity;
  for(let mask=0;mask<8;mask++){
    const g=m.map(r=>r.slice());
    for(let r=0;r<size;r++)for(let c=0;c<size;c++)
      if(!res[r][c]&&MASKS[mask](r,c))g[r][c]^=1;
    applyFmt(g,mask);
    const p=penalty(g);
    if(p<bestP){bestP=p;best=g;}
  }
  return best;
}

function qrSvg(text,px){
  const m=qrMatrix(text),n=m.length,q=2,S=n+q*2,s=px||(S*5);
  let d="";
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)
    if(m[r][c])d+="M"+(c+q)+" "+(r+q)+"h1v1h-1z";
  return "<svg width='"+s+"' height='"+s+"' viewBox='0 0 "+S+" "+S+"' "
    +"shape-rendering='crispEdges' xmlns='http://www.w3.org/2000/svg'>"
    +"<rect width='"+S+"' height='"+S+"' fill='#f3ecdb'/>"
    +"<path d='"+d+"' fill='#0a1210'/></svg>";
}
if(typeof module!=="undefined")module.exports={qrMatrix,qrSvg};
