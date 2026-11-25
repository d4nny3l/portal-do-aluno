import assert from "node:assert/strict";
import {test} from "node:test";
import {detectPaperCandidate,borderEvidence} from "../candidates/edge-first-01.mjs";
import {detectDocument} from "../js/vision.js";

const W=288,H=406;
function frame({bg=42,paper=225,tilt=0,size=.76,grid=false,empty=false,noise=0,seed=2}={}){
 const a=new Uint8ClampedArray(W*H*4);
 let random=seed>>>0,pw=W*size,ph=Math.min(H*.88,pw*1.414),cx=W/2,cy=H/2;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const dx=x-cx,dy=y-cy;
  const px=dx*Math.cos(tilt)+dy*Math.sin(tilt);
  const py=-dx*Math.sin(tilt)+dy*Math.cos(tilt);
  const page=!empty&&Math.abs(px)<pw/2&&Math.abs(py)<ph/2;
  let v=page?paper:bg;
  if(grid&&(x%56<2||y%73<2))v=bg+37;
  if(page&&py>-ph*.35&&py<ph*.35&&
   Math.floor(py+ph*.35)%24<2&&Math.abs(px)<pw*.25)
   v=Math.max(0,v-35);
  if(noise){
   random=(Math.imul(random,1664525)+1013904223)>>>0;
   v+=noise*(random/4294967296-.5);
  }
  const k=(y*W+x)*4;
  a[k]=a[k+1]=a[k+2]=Math.max(0,Math.min(255,Math.round(v)));
  a[k+3]=255;
 }
 return a;
}
const positives=[
 ["folha clara",{bg:43,paper:224}],
 ["folha escura",{bg:5,paper:38}],
 ["folha e fundo próximos",{bg:76,paper:93}],
 ["folha inclinada",{bg:42,paper:208,tilt:.18,size:.58}],
 ["fundo com linhas",{bg:46,paper:194,grid:true}],
 ["ruído e pouca luz",{bg:20,paper:71,noise:9}]
];
for(const [name,params] of positives){
 test("reconhece "+name,()=>{
  const image=frame(params);
  const result=detectPaperCandidate(image,W,H);
  assert.equal(result.found,true,"Detector deve encontrar folha deste cenário sintético");
  assert.equal(result.corners.length,4);
  assert.equal(result.source,"fast");
  assert.ok(result.evidence.goodSides>=3);
  assert.ok(result.corners.every(([x,y])=>x>=0&&x<=W&&y>=0&&y<=H));
  const baseline=detectDocument(image,W,H);
  assert.ok(baseline,"O caso deve manter detector primário como referência");
 });
}
test("não fotografa uma mesa com rejuntes sem folha",()=>{
 const result=detectPaperCandidate(frame({empty:true,bg:41,grid:true}),W,H,{
  allowFullResolution:true
 });
 assert.equal(result.found,false);
});
test("não inventa folha em uma parede uniforme",()=>{
 assert.equal(detectPaperCandidate(frame({empty:true,bg:35}),W,H).found,false);
});
test("não altera os pixels nem exige câmera, WebKit, HTML ou estabilidade",()=>{
 const input=frame({bg:8,paper:43}),copy=input.slice();
 detectPaperCandidate(input,W,H,{allowFullResolution:true});
 assert.deepEqual(input,copy);
});
test("retorna os cantos na escala da fonte, não no canvas reduzido",()=>{
 const r=detectPaperCandidate(frame(),W,H,{targetWidth:192});
 assert.equal(r.found,true);
 assert.equal(r.sampleSize[0],192);
 assert.ok(Math.max(...r.corners.map(([x])=>x))>192);
});
test("ausência de contraste suficiente não produz reconhecimento fictício",()=>{
 const r=detectPaperCandidate(frame({bg:5,paper:5}),W,H);
 assert.equal(r.found,false);
});
test.todo("folha muito pequena/distante — aprimorar com fotos reais rotuladas sem fabricar bolhas");
test("pontos das bordas inexistentes são recusados",()=>{
 assert.equal(borderEvidence(frame(),W,H,null).valid,false);
});
