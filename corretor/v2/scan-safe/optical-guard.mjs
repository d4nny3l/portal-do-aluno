// OPTICAL-GUARD-01: candidate-only veto, same aligned gray, no answer key.
// Experimental thresholds from the approved research proposal; acceptance
// depends on hash-verified corpus replay, not the proxy experiment.
const quantile=(values,f)=>values.sort((a,b)=>a-b)[Math.floor((values.length-1)*f)];
export function bilateralEvidence(b,r,p,w,h){
 if(!Number.isFinite(r)||r<=0)return false;
 const left=[],right=[],paper=[];
 for(let y=Math.floor(b.y-r*1.65);y<=b.y+r*1.65;y++)
 for(let x=Math.floor(b.x-r*1.65);x<=b.x+r*1.65;x++){
  if(x<0||y<0||x>=w||y>=h)continue;
  const u=(x-b.x)/r,v=(y-b.y)/r,d2=u*u+v*v,z=p[y*w+x];
  if(Math.abs(v)<=.35&&Math.abs(u)>=.50&&Math.abs(u)<=.76)(u<0?left:right).push(z);
  if(d2>=1.25**2&&d2<=1.65**2)paper.push(z);
 }
 if(Math.min(left.length,right.length)<3||paper.length<12)return false;
 const local=quantile(paper,.75),spread=local-quantile(paper,.25);
 return local-Math.max(quantile(left,.5),quantile(right,.5))>=Math.max(32,3*spread);
}
const at=(p,w,h,x,y)=>{
 x=Math.round(x);y=Math.round(y);
 return x>=0&&x<w&&y>=0&&y<h?p[y*w+x]:null;
};
// Physical square evidence after alignment, including explicitly selected
// manual points. A corner made of blank paper or a small glyph cannot pass.
function square(p,w,h,x,y,sx,sy){
 const center=[],outside=[];
 for(let j=-6;j<=6;j++)for(let i=-6;i<=6;i++){
  const z=at(p,w,h,x+i*sx/10,y+j*sy/10);
  if(z===null)return false;
  const d=Math.max(Math.abs(i),Math.abs(j));
  if(d<=3)center.push(z);
  else if(d===6)outside.push(z);
 }
 const light=quantile(outside,.75),dark=quantile(center,.5);
 return light-dark>=45&&center.filter(z=>z<=light-40).length>=center.length*.85
  &&outside.filter(z=>z>=dark+40).length>=outside.length*.65;
}
// Independent anchors: printed circle perimeters (never answer interiors).
// Each quadrant needs support from several manifest coordinates. The
// comparison uses radial contrast and the known radius, not marker centers
// or a second readRaster. Filled bubbles still retain their printed contour.
function ring(p,w,h,b,sx,sy){
 const x=b.x*sx,y=b.y*sy,rx=b.radiusMm*sx,ry=b.radiusMm*sy;
 if(Math.min(rx,ry)<3)return false;
 let hits=0;
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6,dx=Math.cos(a)*rx,dy=Math.sin(a)*ry;
  const edge=[.90,1,1.10].map(k=>at(p,w,h,x+k*dx,y+k*dy));
  const outer=[1.24,1.36].map(k=>at(p,w,h,x+k*dx,y+k*dy));
  if([...edge,...outer].some(z=>z===null))continue;
  if(Math.max(...outer)-Math.min(...edge)>=28)hits++;
 }
 return hits>=7;
}
export function verifyPrintedGeometry({pixels:p,width:w,height:h},manifest){
 if(!p||p.length!==w*h||!manifest?.paper||!manifest.technicalRegions?.fiducials)return false;
 const sx=w/manifest.paper.widthMm,sy=h/manifest.paper.heightMm;
 const markers=manifest.technicalRegions.fiducials;
 if(markers.length!==4||!markers.every(f=>square(p,w,h,f.x*sx,f.y*sy,f.sizeMm*sx,f.sizeMm*sy)))return false;
 // Distribute anchors across the actual printed question field, including
 // sparse cards with one column or a compact embedded frame.
 const bubbles=manifest.questions.flatMap(q=>q.bubbles||[]);
 if(bubbles.length<2)return false;
 const sorted=[...bubbles].sort((a,b)=>a.y-b.y||a.x-b.x);
 const bands=Array.from({length:Math.min(4,sorted.length)},(_,i)=>sorted.slice(
  Math.floor(i*sorted.length/Math.min(4,sorted.length)),Math.floor((i+1)*sorted.length/Math.min(4,sorted.length))));
 return bands.every(band=>{
  const samples=band.length<=8?band:Array.from({length:8},(_,i)=>band[Math.round(i*(band.length-1)/7)]);
  return samples.filter(b=>ring(p,w,h,b,sx,sy)).length>=Math.ceil(samples.length*.5);
 });
}
