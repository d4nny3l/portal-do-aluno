/* SALTA OMR Capture Lab — detector de 4 marcadores físicos.
   Usa o detector SALTA oficial, mas transforma centros internos dos
   quadrados pretos nos cantos EXTERNOS da folha por homografia.
   Não depende de bordas brancas ou cor do fundo.
*/
import {detectFiducials} from '../../../corretor/v2/omr/normalize.mjs';

const IDS=Object.freeze(['fiducial-tl','fiducial-tr','fiducial-br','fiducial-bl']);
const FALLBACK=Object.freeze({
 mode:'full-page',schemaVersion:'salta-layout-manifest-v2',
 paper:Object.freeze({widthMm:210,heightMm:297}),
 technicalRegions:Object.freeze({fiducials:Object.freeze([
  {markerId:IDS[0],x:8,y:8,sizeMm:5.5},
  {markerId:IDS[1],x:202,y:8,sizeMm:5.5},
  {markerId:IDS[2],x:202,y:289,sizeMm:5.5},
  {markerId:IDS[3],x:8,y:289,sizeMm:5.5}
 ])})
});

export const DEFAULT_MARKER_GEOMETRY=FALLBACK;

// Mantém só geometria publicável. Nunca recebe gabarito, notas ou identificação.
export function markerGeometry(manifest){
 if(!manifest)return FALLBACK;
 const w=manifest.paper?.widthMm,h=manifest.paper?.heightMm;
 const marks=manifest.technicalRegions?.fiducials;
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<60||w>210||h<80||h>297||
    !Array.isArray(marks)||marks.length!==4||
    marks.some((m,i)=>m?.markerId!==IDS[i]||m?.sizeMm!==5.5||
      m?.x!==(i===0||i===3?8:w-8)||m?.y!==(i<2?8:h-8)))
  throw new TypeError('Geometria dos quatro marcadores incompatível com o padrão SALTA.');
 const mode=manifest.mode==='embedded'?'embedded':'full-page';
 if(mode==='embedded'&&manifest.schemaVersion!=='salta-layout-manifest-v2')
  throw new TypeError('Quadro incorporado exige manifesto geométrico V2 exato.');
 return Object.freeze({
  mode,schemaVersion:manifest.schemaVersion,
  paper:Object.freeze({widthMm:w,heightMm:h}),
  technicalRegions:Object.freeze({fiducials:Object.freeze(
    marks.map(m=>Object.freeze({markerId:m.markerId,x:m.x,y:m.y,sizeMm:5.5}))
  )})
 });
}

function solve8(A,b){
 const m=A.map((row,i)=>[...row,b[i]]);
 for(let col=0;col<8;col++){
  let pivot=col;
  for(let row=col+1;row<8;row++)
   if(Math.abs(m[row][col])>Math.abs(m[pivot][col]))pivot=row;
  if(Math.abs(m[pivot][col])<1e-10)throw new RangeError('Marcadores quase colineares.');
  if(pivot!==col)[m[col],m[pivot]]=[m[pivot],m[col]];
  const base=m[col][col];
  for(let c=col;c<9;c++)m[col][c]/=base;
  for(let r=0;r<8;r++){
   if(r===col)continue;
   const mul=m[r][col];
   for(let c=col;c<9;c++)m[r][c]-=mul*m[col][c];
  }
 }
 return m.map(row=>row[8]);
}
function homography(sources,targets){
 const A=[],b=[];
 for(let i=0;i<4;i++){
  const {x,y}=sources[i],{x:u,y:v}=targets[i];
  A.push([x,y,1,0,0,0,-u*x,-u*y]);
  A.push([0,0,0,x,y,1,-v*x,-v*y]);
  b.push(u,v);
 }
 return solve8(A,b);
}
function project(H,x,y){
 const d=H[6]*x+H[7]*y+1;
 if(!Number.isFinite(d)||Math.abs(d)<1e-8)throw new RangeError('Perspectiva degenerada.');
 return {x:(H[0]*x+H[1]*y+H[2])/d,y:(H[3]*x+H[4]*y+H[5])/d};
}
function area(points){
 return Math.abs(points.reduce((sum,p,i)=>{
  const q=points[(i+1)%4];return sum+p.x*q.y-q.x*p.y;
 },0)/2);
}
function validPageCorners(quad,width,height){
 const t=quad.map((p,i)=>{
  const q=quad[(i+1)%4],r=quad[(i+2)%4];
  return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);
 });
 if(!t.every(x=>x>width*height*.00005))return false;
 if(area(quad)/(width*height)<.10)return false;
 // Pequenos desvios de extrapolação são tolerados. Uma folha cortada, não.
 const tolX=Math.max(2,width*.015),tolY=Math.max(2,height*.015);
 return quad.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  p.x>=-tolX&&p.x<=width+tolX&&p.y>=-tolY&&p.y<=height+tolY);
}
function grayscale(rgba){
 const output=new Uint8Array(rgba.length/4);
 for(let i=0,j=0;i<output.length;i++,j+=4)
  output[i]=Math.round(rgba[j]*.299+rgba[j+1]*.587+rgba[j+2]*.114);
 return output;
}

export function findMarkerPage(rgba,width,height,manifest=null,{
 minConfidence=.70,detect=detectFiducials
}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||
    !rgba||rgba.length!==width*height*4)
  throw new TypeError('Fotografia inválida para buscar os quatro marcadores.');
 const model=markerGeometry(manifest),gray=grayscale(rgba);
 const found=detect(gray,width,height,{manifest:model.mode==='embedded'?model:null});
 if(!found?.found||found.confidence<minConfidence||found.corners?.length!==4)
  return {found:false,reason:'markers',confidence:found?.confidence||0,markers:[]};
 const markers=found.corners.map(p=>({x:p.x,y:p.y}));
 const physical=model.technicalRegions.fiducials;
 try{
  const H=homography(physical,markers),{widthMm:w,heightMm:h}=model.paper;
  const page=[project(H,0,0),project(H,w,0),project(H,w,h),project(H,0,h)];
  if(!validPageCorners(page,width,height))
   return {found:false,reason:'outside',confidence:found.confidence,markers};
  return {
   found:true,reason:'ok',confidence:found.confidence,
   corners:page.map(p=>[p.x,p.y]),
   markers:markers.map(p=>[p.x,p.y])
  };
 }catch{
  return {found:false,reason:'perspective',confidence:found.confidence,markers};
 }
}
