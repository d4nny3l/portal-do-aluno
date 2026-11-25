/* SALTA OMR Capture Lab — margens seguras da folha (sem recorte interno).
 * Detector reconhece contorno; resultado final inclui folga EXTERNA
 * e nunca salva um retângulo parcial encostado na borda do vídeo.
 */
export function fullPaperVisible(corners,w,h,{margin=.012}={}){
 if(!Array.isArray(corners)||corners.length!==4||w<=0||h<=0)return false;
 const mx=Math.max(2.5,w*margin),my=Math.max(2.5,h*margin);
 if(!corners.every(p=>Array.isArray(p)&&p.length===2&&
  Number.isFinite(p[0])&&Number.isFinite(p[1])&&
  p[0]>=mx&&p[0]<=w-mx&&p[1]>=my&&p[1]<=h-my))return false;
 const area=Math.abs(corners.reduce((sum,p,i)=>{
  const n=corners[(i+1)%4];return sum+p[0]*n[1]-n[0]*p[1];
 },0))*.5;
 return area>=.05*w*h;
}
export function addPaperMargin(corners,w,h,{outward=.015}={}){
 if(!Array.isArray(corners)||corners.length!==4)throw new TypeError('Folha sem quatro cantos.');
 const cx=corners.reduce((t,p)=>t+p[0],0)/4,cy=corners.reduce((t,p)=>t+p[1],0)/4;
 return corners.map(([x,y])=>[
  Math.min(w-1,Math.max(0,x+(x-cx)*outward)),
  Math.min(h-1,Math.max(0,y+(y-cy)*outward))
 ]);
}
