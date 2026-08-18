/* Independent structural + Reed-Solomon syndrome check on the produced matrix. */
const {qrMatrix}=require('./qr.js');
const GF_EXP=new Uint8Array(512),GF_LOG=new Uint8Array(256);
(function(){let x=1;for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;x<<=1;if(x&256)x^=0x11D;}
 for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];})();
const gmul=(a,b)=>(a&&b)?GF_EXP[GF_LOG[a]+GF_LOG[b]]:0;

// known-good QR RS generator polys (spec tables)
const KNOWN={7:[1,127,122,154,164,11,68,117],
             10:[1,216,194,159,111,199,94,95,113,157,193],
             16:[1,59,13,104,189,68,209,30,8,163,65,41,229,98,50,36,59]};
function rsGen(n){let p=[1];for(let i=0;i<n;i++){const q=[1,GF_EXP[i]],r=new Array(p.length+1).fill(0);
 for(let a=0;a<p.length;a++)for(let b=0;b<2;b++)r[a+b]^=gmul(p[a],q[b]);p=r;}return p;}
for(const n of [7,10,16]){
  const g=rsGen(n), ok=JSON.stringify(g)===JSON.stringify(KNOWN[n]);
  console.log(`  RS generator degree ${n}: ${ok?'matches spec table':'MISMATCH '+g.join(',')}`);
}

const M=qrMatrix('bluff.gg/t/PLUM7'), n=M.length;
console.log(`\n  matrix ${n}x${n} (version ${(n-17)/4})`);
const at=(r,c)=>M[r][c];
// finders
function finderOK(r,c){
  for(let i=0;i<7;i++)for(let j=0;j<7;j++){
    const want=(i===0||i===6||j===0||j===6)?1:((i>=2&&i<=4&&j>=2&&j<=4)?1:0);
    if(at(r+i,c+j)!==want)return false;
  } return true;
}
console.log('  finders:',['TL',[0,0]],finderOK(0,0),'TR',finderOK(0,n-7),'BL',finderOK(n-7,0));
// timing
let tOK=true;
for(let i=8;i<n-8;i++){if(at(6,i)!==(i%2===0?1:0))tOK=false;if(at(i,6)!==(i%2===0?1:0))tOK=false;}
console.log('  timing patterns:',tOK);
console.log('  dark module at ('+(n-8)+',8):',at(n-8,8)===1);
// format info: read copy 1 and copy 2, must agree, and decode to level M
function readFmt(){
  let a=0,b=0;
  for(let i=0;i<=5;i++)a|=at(8,i)<<i;
  a|=at(8,7)<<6;a|=at(8,8)<<7;a|=at(7,8)<<8;
  for(let i=9;i<15;i++)a|=at(14-i,8)<<i;
  for(let i=0;i<8;i++)b|=at(n-1-i,8)<<i;
  for(let i=8;i<15;i++)b|=at(8,n-15+i)<<i;
  return [a,b];
}
const [f1,f2]=readFmt();
const unx=f1^0x5412;
console.log('  format copy1 0x'+f1.toString(16),'copy2 0x'+f2.toString(16),
  '(copy2 ignores bit7 = dark module)');
console.log('  ecc level bits:',(unx>>13)&3,'(0 = M)','mask:',(unx>>10)&7);

/* ── full round trip: unmask, read the zigzag, check syndromes, decode ── */
const MASKS=[(r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,
 (r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>((r*c)%2+(r*c)%3)===0,
 (r,c)=>(((r*c)%2+(r*c)%3)%2)===0,(r,c)=>((((r+c)%2)+((r*c)%3))%2)===0];
function decode(M){
  const n=M.length, ver=(n-17)/4;
  const res=[];for(let r=0;r<n;r++)res.push(new Array(n).fill(0));
  const mark=(r,c)=>{if(r>=0&&c>=0&&r<n&&c<n)res[r][c]=1;};
  [[0,0],[0,n-7],[n-7,0]].forEach(([r,c])=>{
    for(let i=-1;i<8;i++)for(let j=-1;j<8;j++)mark(r+i,c+j);});
  for(let i=0;i<n;i++){mark(6,i);mark(i,6);}
  const alignC=[0,18,22,26,30,34][ver-1];
  if(alignC)for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)mark(alignC+i,alignC+j);
  for(let i=0;i<9;i++){mark(8,i);mark(i,8);}
  for(let i=0;i<8;i++){mark(8,n-1-i);mark(n-1-i,8);}
  let a=0;for(let i=0;i<=5;i++)a|=M[8][i]<<i;
  a|=M[8][7]<<6;a|=M[8][8]<<7;a|=M[7][8]<<8;
  for(let i=9;i<15;i++)a|=M[14-i][8]<<i;
  const mask=((a^0x5412)>>10)&7;
  const g=M.map(r=>r.slice());
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(!res[r][c]&&MASKS[mask](r,c))g[r][c]^=1;
  const bits=[];let up=true;
  for(let col=n-1;col>0;col-=2){
    if(col===6)col--;
    for(let k=0;k<n;k++){const row=up?n-1-k:k;
      for(let c=0;c<2;c++){const cc=col-c;if(res[row][cc])continue;bits.push(g[row][cc]);}}
    up=!up;
  }
  const cw=[];for(let i=0;i+8<=bits.length;i+=8){let b=0;for(let k=0;k<8;k++)b=(b<<1)|bits[i+k];cw.push(b);}
  const V=[[26,10,1,16],[44,16,1,28],[70,26,1,44],[100,18,2,32],[134,24,2,43],[172,16,4,27]][ver-1];
  const [total,ecPer,blocks,dataPer]=V;
  const use=cw.slice(0,total);
  // de-interleave
  const dB=[],eB=[];
  for(let b=0;b<blocks;b++){dB.push([]);eB.push([]);}
  let p=0;
  for(let i=0;i<dataPer;i++)for(let b=0;b<blocks;b++)dB[b].push(use[p++]);
  for(let i=0;i<ecPer;i++)for(let b=0;b<blocks;b++)eB[b].push(use[p++]);
  // syndromes must all be zero for an uncorrupted codeword
  let synOK=true;
  for(let b=0;b<blocks;b++){
    const full=dB[b].concat(eB[b]);
    for(let s=0;s<ecPer;s++){
      let acc=0;
      for(let i=0;i<full.length;i++)acc^=gmul(full[i],GF_EXP[(s*(full.length-1-i))%255]);
      if(acc!==0)synOK=false;
    }
  }
  // payload
  const flat=[];for(let i=0;i<dataPer;i++)for(let b=0;b<blocks;b++)flat.push(dB[b][i]);
  const stream=[];dB.forEach(bl=>bl.forEach(x=>{for(let i=7;i>=0;i--)stream.push((x>>i)&1);}));
  let q=0;const take=k=>{let v=0;for(let i=0;i<k;i++)v=(v<<1)|stream[q++];return v;};
  const mode=take(4),len=take(8);
  let out="";for(let i=0;i<len;i++)out+=String.fromCharCode(take(8));
  return {mask,synOK,mode,len,out:decodeURIComponent(escape(out))};
}
console.log('');
for(const t of ['bluff.gg/t/PLUM7','B','https://bluff.gg/t/ZEBRA?ref=VIV']){
  const d=decode(qrMatrix(t));
  console.log(`  ${d.out===t?'ROUND TRIP OK':'ROUND TRIP FAIL'}  mask ${d.mask}  mode ${d.mode}  `
    +`syndromes ${d.synOK?'zero':'NONZERO'}  -> ${JSON.stringify(d.out)}`);
}
