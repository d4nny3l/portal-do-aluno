/* SALTA OMR LAB — capture quality and motion policy.
   Pure functions: no camera access, no persistent data, no external libraries.
   Measurements compare real captured frames; they do not hallucinate pixels.
*/
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function sampleQuality(rgba,width,height,corners=null){
 if(!rgba||rgba.length!==width*height*4||width<16||height<16)
  throw new RangeError('Quadro inválido para avaliar nitidez.');
 const xs=corners?.map(p=>p[0])||[0,width],ys=corners?.map(p=>p[1])||[0,height];
 const l=clamp(Math.min(...xs),0,width-2),r=clamp(Math.max(...xs),1,width-1);
 const t=clamp(Math.min(...ys),0,height-2),b=clamp(Math.max(...ys),1,height-1);
 const marginX=(r-l)*.09,marginY=(b-t)*.09;
 const x0=Math.max(2,Math.ceil(l+marginX)),x1=Math.min(width-3,Math.floor(r-marginX));
 const y0=Math.max(2,Math.ceil(t+marginY)),y1=Math.min(height-3,Math.floor(b-marginY));
 const step=Math.max(1,Math.ceil(Math.max(width,height)/850));
 const lum=(x,y)=>{let p=(y*width+x)*4;return (rgba[p]*77+rgba[p+1]*150+rgba[p+2]*29)/256};
 let contrast=0,edges=0,brightness=0,clip=0,n=0;
 for(let y=y0;y<=y1;y+=step*2){
  for(let x=x0;x<=x1;x+=step*2){
   const center=lum(x,y);
   // Laplacian high-frequency energy: blurry edges must score LESS, not more.
   const dx=lum(x+step,y)-lum(x-step,y);
   const dy=lum(x,y+step)-lum(x,y-step);
   const gradient=Math.hypot(dx,dy);
   const lap=Math.abs(4*center-lum(x-step,y)-lum(x+step,y)-lum(x,y-step)-lum(x,y+step));
   contrast+=Math.min(lap*lap,25000);
   if(gradient>=12)edges++;
   brightness+=center;
   if(center<10||center>250)clip++;
   n++;
  }
 }
 if(!n)return {sharpness:0,edgeDensity:0,brightness:0,clipping:1,score:0};
 const sharpness=Math.sqrt(contrast/n),edgeDensity=edges/n;
 const mean=brightness/n,clipping=clip/n;
 // Brightness is not confused with focus. Penalize only severe under/over-exposure.
 const exposure=clamp((mean-18)/42,0,1)*clamp((252-mean)/25,0,1);
 // Focus comparison is relative within the short burst, never a calibrated DPI.
 const score=sharpness*exposure*(1-.25*clipping);
 return {sharpness,edgeDensity,brightness:mean,clipping,score};
}

export function shouldCapture({consecutive=0,stable=0,ageMs=0,score=0,support=0,sharpness=0}={}){
 if(consecutive<2||score<.22)return false;
 // Normal fast path: two clearly recognized paper outlines.
 if(stable>=1&&support>=.48&&score>=.28)return true;
 // Weak edges/low light: one more observation reduces false paper locking.
 if(consecutive>=3&&stable>=1&&support>=.25&&score>=.22)return true;
 // Trembling phone: accept successive high-confidence quads without requiring
 // exact position stability, but never a lone accidental rectangle.
 if(consecutive>=3&&score>=.5&&support>=.45&&sharpness>=6)return true;
 // Conservative time-bounded fallback for a readable moving document.
 return consecutive>=6&&ageMs>=320&&score>=.3&&support>=.28&&sharpness>=4;
}

export function selectBestFrame(first,second){
 if(!first)return second;
 if(!second)return first;
 return second.quality.score>first.quality.score*1.045?second:first;
}
