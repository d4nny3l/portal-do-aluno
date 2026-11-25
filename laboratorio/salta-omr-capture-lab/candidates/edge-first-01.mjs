/**
 * EDGE-FIRST-01: detector experimental SEM câmera ou alterações de interface.
 * Reutiliza Scancat (MIT © 2026 Nipun Batra); não modifica a captura estável.
 * Eixos e cantos sempre devolvidos em coordenadas da fotografia de ENTRADA.
 */
import {detectDocument} from "../js/vision.js";

function reduceRGBA(input,w,h,target){
 const ww=Math.max(64,Math.min(w,Math.round(target)));
 const hh=Math.max(64,Math.round(h*ww/w));
 if(ww===w&&hh===h)return{data:input,width:w,height:h};
 const data=new Uint8ClampedArray(ww*hh*4);
 for(let y=0;y<hh;y++)for(let x=0;x<ww;x++){
  const sx=Math.min(w-1,Math.floor((x+.5)*w/ww));
  const sy=Math.min(h-1,Math.floor((y+.5)*h/hh));
  const a=(sy*w+sx)*4,b=(y*ww+x)*4;
  data[b]=input[a];data[b+1]=input[a+1];data[b+2]=input[a+2];data[b+3]=255;
 }
 return {data,width:ww,height:hh};
}
function intensity(a,w,h,x,y){
 if(x<1||y<1||x>=w-1||y>=h-1)return null;
 const o=(Math.round(y)*w+Math.round(x))*4;
 return (a[o]*77+a[o+1]*150+a[o+2]*29)/256;
}
/** Judge a sheet's true contrast step, instead of mistaking tile grout,
 * text frames or thin dark lines for a paper edge.
 * No fixed minimum illumination, no autofocus requirements.
 */
export function borderEvidence(data,w,h,quad){
 if(!Array.isArray(quad)||quad.length!==4)return{valid:false,reason:"no-quad"};
 const cx=quad.reduce((s,p)=>s+p[0],0)/4;
 const cy=quad.reduce((s,p)=>s+p[1],0)/4;
 const step=Math.max(2.5,Math.min(w,h)*.026);
 let sum=0,absolute=0,samples=0,goodSides=0;
 const sides=[];
 for(let i=0;i<4;i++){
  const a=quad[i],b=quad[(i+1)%4];
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<8)return{valid:false,reason:"side-too-short"};
  let nx=-dy/len,ny=dx/len;
  if(((cx-(a[0]+b[0])/2)*nx+(cy-(a[1]+b[1])/2)*ny)<0){nx=-nx;ny=-ny;}
  let side=0,n=0;
  for(let j=0;j<12;j++){
   const t=.14+.72*(j+.5)/12,x=a[0]+t*dx,y=a[1]+t*dy;
   const inside=intensity(data,w,h,x+nx*step,y+ny*step);
   const outside=intensity(data,w,h,x-nx*step,y-ny*step);
   if(inside==null||outside==null)continue;
   const diff=inside-outside;
   sum+=diff;absolute+=Math.abs(diff);side+=diff;samples++;n++;
  }
  if(n<5)return{valid:false,reason:"edge-outside-frame"};
  const mean=side/n;
  sides.push(mean);
  if(Math.abs(mean)>=5)goodSides++;
 }
 const contrast=absolute/(samples||1);
 const polarity=Math.abs(sum)/(absolute||1);
 return{valid:samples>=30&&goodSides>=3&&contrast>=7&&polarity>=.55,
  contrast,polarity,goodSides,sides};
}
function verified(q,rgba,w,h,method){
 if(!q||q.score<.22||q.corners?.length!==4)return null;
 const evidence=borderEvidence(rgba,w,h,q.corners);
 if(!evidence.valid)return null;
 return{found:true,corners:q.corners,source:method,score:q.score,evidence};
}
/** Candidate only. Call from an isolated benchmark.
 * allowFullResolution=true requests an expensive second pass ONLY on misses;
 * for live use the caller must throttle this option (e.g. occasional retries).
 */
export function detectPaperCandidate(rgba,w,h,{
 targetWidth=224,allowFullResolution=false,detector=detectDocument
}={}){
 if(!rgba||rgba.length!==w*h*4||w<96||h<96)
  throw new TypeError("Expected a valid RGBA image");
 const sample=reduceRGBA(rgba,w,h,targetWidth);
 const small=verified(detector(sample.data,sample.width,sample.height),
   sample.data,sample.width,sample.height,"fast");
 if(small){
  return{...small,corners:small.corners.map(([x,y])=>[
   x*w/sample.width,y*h/sample.height
  ]),sampleSize:[sample.width,sample.height]};
 }
 if(allowFullResolution&&sample.width<w){
  const full=verified(detector(rgba,w,h),rgba,w,h,"fallback-full");
  if(full)return{...full,sampleSize:[w,h]};
 }
 return{found:false,corners:null,source:"none",score:0,evidence:null,
  sampleSize:[sample.width,sample.height]};
}
