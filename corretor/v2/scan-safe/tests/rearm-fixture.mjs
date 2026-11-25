// Synthetic desk marks are fixed in world coordinates, independent of paper.
// Low-contrast blocks model visually identifiable surface features, not fiducials.
import {withdrawalFrame} from '../withdrawal.mjs';
export const W=384,H=540;
export const paper={score:.9,support:.8,corners:[[30,30],[354,30],[354,500],[30,500]]};
export const shift=(q,dx,dy=0)=>({...q,corners:q.corners.map(([x,y])=>[x+dx,y+dy])});
export const partial=shift(paper,-100),moved=shift(paper,-22),nudge=shift(paper,-4);
export function deskPixel(w,h,x,y,desk,textured=true,pan=0){
 const u=(x+pan)/w,v=y/h;
 const mark=textured&&((u<.042&&v>.16&&v<.36)||(u>.958&&v>.43&&v<.68)||
  (v<.042&&u>.20&&u<.43)||(v>.958&&u>.57&&u<.80));
 return mark?desk.map(n=>n>220?n-20:n+20):desk;
}
export function makeWithdrawalFixture(desk=[37,51,67],textured=true){
 function frame(q,{cover=null,shadow=false,variant=0,pan=0}={}){
  const rgba=new Uint8ClampedArray(W*H*4),[x0,y0]=q?.corners[0]||[0,0],x1=q?.corners[2][0]||0,y1=q?.corners[2][1]||0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   let color=deskPixel(W,H,x,y,desk,textured,pan);
   if(q&&x>=x0&&x<x1&&y>=y0&&y<y1){
    const u=(x-x0)/(x1-x0),v=(y-y0)/(y1-y0);
    const mark=(u>.15&&u<.85&&Math.floor(v*12)%3===1&&Math.floor(u*12)%4!==variant);
    const shade=shadow&&x>W*.45?70:0;
    color=mark?[30,30,30]:[242-shade,242-shade,242-shade];
   }
   if(cover)color=cover;
   rgba.set([...color,255],(y*W+x)*4);
  }
  return withdrawalFrame(rgba,W,H,q?.corners);
 }
 return {still:frame(paper),moved:frame(moved),partial:frame(partial),nudge:frame(nudge),other:frame(paper,{variant:1}),
  otherMoved:frame(moved,{variant:1}),desk:frame(null),black:frame(null,{cover:[0,0,0]}),
  darkCover:frame(null,{cover:[10,10,10]}),brightCover:frame(null,{cover:[245,245,245]}),
  shadow:frame(paper,{shadow:true}),shadowMoved:frame(moved,{shadow:true}),
  panned:frame(moved,{pan:22}),pannedDesk:frame(null,{pan:22})};
}
export const normal=makeWithdrawalFixture();
