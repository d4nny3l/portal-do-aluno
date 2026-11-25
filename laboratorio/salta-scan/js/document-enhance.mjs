// SALTA DOC-ENHANCE-01 — original experimental implementation; local only.
// Classical robust tile estimation and Sauvola (Sauvola & Pietikainen, 2000).
export function enhanceDocument(data,w,h,mode="color"){
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||data.length!==w*h*4)throw new RangeError("Invalid RGBA dimensions");
  if(!["color","gray","bw"].includes(mode))return new Uint8ClampedArray(data);
  const n=w*h, out=new Uint8ClampedArray(n*4), lum=new Float32Array(n);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const Y=(r,g,b)=>.299*r+.587*g+.114*b;
  // Fine tiles capture local lighting; robust bright quantiles exclude ordinary ink.
  const tile=Math.max(12,Math.round(Math.min(w,h)/64)), nx=Math.ceil(w/tile),ny=Math.ceil(h/tile);
  const bg=new Float32Array(nx*ny), coarse=new Float32Array(nx*ny);
  const hist=new Uint32Array(256);
  let rs=0,gs=0,bs=0,cs=0;
  const stride=Math.max(1,Math.floor(tile/12));
  for(let ty=0;ty<ny;ty++)for(let tx=0;tx<nx;tx++){
    hist.fill(0);let count=0;
    const x0=tx*tile,x1=Math.min(w,x0+tile),y0=ty*tile,y1=Math.min(h,y0+tile);
    for(let y=y0;y<y1;y+=stride)for(let x=x0;x<x1;x+=stride){
      const j=(y*w+x)*4;hist[Math.round(Y(data[j],data[j+1],data[j+2]))]++;count++;
    }
    let q=0,sum=0;for(;q<255;q++){sum+=hist[q];if(sum>=count*.85)break;}
    bg[ty*nx+tx]=q;
    // Only bright, near-neutral samples can inform global white balance.
    for(let y=y0;y<y1;y+=stride)for(let x=x0;x<x1;x+=stride){
      const j=(y*w+x)*4,r=data[j],g=data[j+1],b=data[j+2],l=Y(r,g,b);
      if(l>=Math.max(100,q-8)&&Math.max(r,g,b)-Math.min(r,g,b)<45){
        rs+=r/l;gs+=g/l;bs+=b/l;cs++;
      }
    }
  }
  const neighbors=[];
  for(let ty=0;ty<ny;ty++)for(let tx=0;tx<nx;tx++){
    neighbors.length=0;
    for(let yy=Math.max(0,ty-3);yy<=Math.min(ny-1,ty+3);yy++)
      for(let xx=Math.max(0,tx-3);xx<=Math.min(nx-1,tx+3);xx++)neighbors.push(bg[yy*nx+xx]);
    neighbors.sort((a,b)=>a-b);
    coarse[ty*nx+tx]=neighbors[Math.floor((neighbors.length-1)*.65)];
  }
  // Reject isolated dark/ink-heavy tiles; retain coherent shadow regions.
  for(let i=0;i<bg.length;i++)bg[i]=Math.max(bg[i],coarse[i]*.70);
  const wr=cs?clamp(cs/Math.max(rs,1),.86,1.16):1;
  const wg=cs?clamp(cs/Math.max(gs,1),.86,1.16):1;
  const wb=cs?clamp(cs/Math.max(bs,1),.86,1.16):1;
  const channel=(v,l,target)=>clamp(v+(target-l),0,255);
  for(let y=0;y<h;y++){
    const gy=clamp((y+.5)/tile-.5,0,ny-1),y0=Math.floor(gy),y1=Math.min(ny-1,y0+1),fy=gy-y0;
    for(let x=0;x<w;x++){
      const i=y*w+x,j=i*4,gx=clamp((x+.5)/tile-.5,0,nx-1),x0=Math.floor(gx),x1=Math.min(nx-1,x0+1),fx=gx-x0;
      const a=bg[y0*nx+x0]*(1-fx)+bg[y0*nx+x1]*fx,b=bg[y1*nx+x0]*(1-fx)+bg[y1*nx+x1]*fx;
      const paper=Math.max(35,a*(1-fy)+b*fy);
      const r=data[j]*wr,g=data[j+1]*wg,bl=data[j+2]*wb,l=Y(r,g,bl);
      const raw=Y(data[j],data[j+1],data[j+2]);
      const chroma=Math.max(data[j],data[j+1],data[j+2])-Math.min(data[j],data[j+1],data[j+2]);
      const ratio=raw/paper;
      // Preserve dark strokes and saturated graphics; brighten paper more aggressively.
      const gain=clamp(246/paper,.85,3.0);
      const mix=1-.45*clamp(chroma/100,0,1);
      const v=clamp(l*(1+(gain-1)*mix),0,255);
      const contrast=clamp((v-9)*255/240,0,255);
      const target=mode==="color"?v+(contrast-v)*.45:contrast;
      lum[i]=target;
      if(mode==="color"){
        out[j]=channel(r,l,target);out[j+1]=channel(g,l,target);out[j+2]=channel(bl,l,target);out[j+3]=255;
      }
    }
  }
  if(mode==="bw"){
    // Sauvola via sliding sums and squared sums; O(width) additional memory.
    const rad=Math.max(7,Math.round(Math.min(w,h)/65)),s=new Float64Array(w),ss=new Float64Array(w);
    const addRow=(y,sign)=>{for(let x=0;x<w;x++){let z=lum[y*w+x];s[x]+=sign*z;ss[x]+=sign*z*z;}};
    for(let y=0;y<=Math.min(h-1,rad);y++)addRow(y,1);
    for(let y=0;y<h;y++){
      if(y>0){if(y-rad-1>=0)addRow(y-rad-1,-1);if(y+rad<h)addRow(y+rad,1);}
      let a=0,b=0;for(let x=0;x<=Math.min(w-1,rad);x++){a+=s[x];b+=ss[x];}
      const rows=Math.min(h-1,y+rad)-Math.max(0,y-rad)+1;
      for(let x=0;x<w;x++){
        if(x>0){if(x-rad-1>=0){a-=s[x-rad-1];b-=ss[x-rad-1];}if(x+rad<w){a+=s[x+rad];b+=ss[x+rad];}}
        const cnt=rows*(Math.min(w-1,x+rad)-Math.max(0,x-rad)+1),m=a/cnt,sd=Math.sqrt(Math.max(0,b/cnt-m*m));
        const t=Math.min(235,m*(1+.20*(sd/128-1)));
        const v=lum[y*w+x]<t?0:255,j=(y*w+x)*4;out[j]=out[j+1]=out[j+2]=v;out[j+3]=255;
      }
    }
    return out;
  }
  // Bounded high-pass sharpening; leave flat areas and strong edges alone.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,j=i*4,v=lum[i],l=lum[y*w+Math.max(0,x-1)],r=lum[y*w+Math.min(w-1,x+1)],u=lum[Math.max(0,y-1)*w+x],d=lum[Math.min(h-1,y+1)*w+x];
    const detail=v-(l+r+u+d)/4;
    const delta=Math.abs(detail)>2&&Math.abs(detail)<48?clamp(detail*.38,-9,9):0;
    if(mode==="gray"){out[j]=out[j+1]=out[j+2]=v+delta;out[j+3]=255;}
    else {out[j]+=delta;out[j+1]+=delta;out[j+2]+=delta;}
  }
  return out;
}
