// Candidate-only G6 evidence. No optical reading, timing, camera negotiation
// or frozen laboratory changes. Conservative: unknown/ambiguous surfaces block.
const GRID=24,PATTERN=12;
const COLOR_TOL=24,FOREGROUND_TOL=32;
const distance=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const luminance=c=>.299*c[0]+.587*c[1]+.114*c[2];
const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function sample(rgba,w,h,x,y){
 const i=(Math.max(0,Math.min(h-1,Math.floor(y)))*w+Math.max(0,Math.min(w-1,Math.floor(x))))*4;
 return [rgba[i],rgba[i+1],rgba[i+2]];
}
function averageAt(rgba,w,h,locate,count){
 const sum=[0,0,0];
 for(let j=0;j<count;j++)for(let i=0;i<count;i++){
  const c=sample(rgba,w,h,...locate((i+.5)/count,(j+.5)/count));
  for(let k=0;k<3;k++)sum[k]+=c[k];
 }
 return sum.map(x=>x/(count*count));
}
const project=(q,u,v)=>q[0].map((_,i)=>
 (1-v)*((1-u)*q[0][i]+u*q[1][i])+v*((1-u)*q[3][i]+u*q[2][i]));
export function withdrawalFrame(rgba,w,h,corners){
 if(!rgba||!Number.isInteger(w)||!Number.isInteger(h)||w<24||h<24||rgba.length!==w*h*4)return null;
 const cells=[];
 for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
  cells.push({x:(x+.5)*w/GRID,y:(y+.5)*h/GRID,
   color:averageAt(rgba,w,h,(u,v)=>[(x+u)*w/GRID,(y+v)*h/GRID],4)});
 }
 let pattern=null;
 if(corners?.length===4&&corners.every(finitePoint)){
  pattern=[];
  for(let y=0;y<PATTERN;y++)for(let x=0;x<PATTERN;x++)
   pattern.push(luminance(averageAt(rgba,w,h,(u,v)=>project(corners,(x+u)/PATTERN,(y+v)/PATTERN),5)));
 }
 return {w,h,cells,pattern};
}
export function usableWithdrawalFrame(frame,w,h){
 return !!(frame&&frame.w===w&&frame.h===h&&frame.cells?.length===GRID*GRID&&
  frame.cells.some(c=>Math.max(...c.color)>=12)); // near-total blackout is not an exposed desk
}
function edgeDistances(q,p){
 const cx=mean(q.map(c=>c[0])),cy=mean(q.map(c=>c[1]));
 return q.map((a,i)=>{
  const b=q[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  const sign=Math.sign(dx*(cy-a[1])-dy*(cx-a[0]));
  return len?sign*(dx*(p.y-a[1])-dy*(p.x-a[0]))/len:NaN;
 });
}
const boundary=(q,w,h)=>Math.min(...q.flatMap(([x,y])=>[x,w-x,y,h-y]));
export function withdrawalReference(frame,corners){
 if(!frame||!usableWithdrawalFrame(frame,frame.w,frame.h)||!frame.pattern||
    Math.max(...frame.pattern)-Math.min(...frame.pattern)<18)return null;
 const q=corners.map(p=>[...p]),margin=Math.min(frame.w,frame.h)*.018;
 const sides=Array.from({length:4},()=>[]),inside=[];
 for(let i=0;i<frame.cells.length;i++){
  const cell=frame.cells[i],d=edgeDistances(q,cell);
  if(d.every(v=>v>margin))inside.push(i);
  else if(Math.min(...d)<-margin)sides[d.indexOf(Math.min(...d))].push(i);
 }
 // Every edge needs independent, visible surroundings; a tightly cropped
 // sheet or a foreground covering a side is not an adequate reference.
 if(sides.some(s=>s.length<4)||inside.length<16)return null;
 const anchors=sides.flat();
 const palette=anchors.map(i=>frame.cells[i].color);
 // Require a coherent support surface, not arbitrary colors from unrelated
 // objects. Mild material/lighting variations remain acceptable.
 const center=[0,1,2].map(k=>{const v=palette.map(c=>c[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];});
 if(palette.filter(c=>distance(c,center)<=COLOR_TOL).length<palette.length*.95)return null;
 const foreground=inside.filter(i=>distance(frame.cells[i].color,center)>FOREGROUND_TOL);
 if(foreground.length<4)return null;
 return {w:frame.w,h:frame.h,q,pattern:[...frame.pattern],sides,anchors:frame.cells.map(c=>c.color),center,foreground};
}
export function withdrawalMotion(ref,frame,q){
 if(!ref||!frame?.pattern||q?.length!==4||!q.every(finitePoint))return false;
 const scale=Math.min(ref.w,ref.h);
 const dx=mean(q.map((p,i)=>p[0]-ref.q[i][0])),dy=mean(q.map((p,i)=>p[1]-ref.q[i][1]));
 // Require coherent displacement towards an edge, not jitter, rotation,
 // shrinking, spurious border loss or a new quad with a different pattern.
 if(Math.hypot(dx,dy)<.035*scale||q.some((p,i)=>Math.hypot(p[0]-ref.q[i][0]-dx,p[1]-ref.q[i][1]-dy)>.025*scale)||
    boundary(ref.q,ref.w,ref.h)-boundary(q,ref.w,ref.h)<.015*scale)return false;
 const error=mean(frame.pattern.map((v,i)=>Math.abs(v-ref.pattern[i])));
 const features=ref.pattern.map((v,i)=>({v,i})).filter(p=>Math.abs(p.v-mean(ref.pattern))>=16);
 return features.length>=3&&error<=20&&features.filter(p=>Math.abs(frame.pattern[p.i]-p.v)<=32).length>=features.length*.75;
}
export function withdrawalSurface(ref,frame){
 if(!ref||!usableWithdrawalFrame(frame,ref.w,ref.h))return false;
 // Verify the actual stationary surroundings independently on all four sides.
 if(ref.sides.some(side=>side.filter(i=>distance(frame.cells[i].color,ref.anchors[i])<=COLOR_TOL).length<side.length*.9))return false;
 // All sampled cells must look like the exposed support; in particular the
 // prior distinctive paper cells cannot still contain the captured paper.
 if(frame.cells.some(c=>distance(c.color,ref.center)>COLOR_TOL))return false;
 return ref.foreground.every(i=>distance(frame.cells[i].color,ref.anchors[i])>8);
}
