import assert from "node:assert/strict";
import {test} from "node:test";
import {experimentalPaperDetector} from "../js/experimental-detector.mjs";

const W=288,H=406;
function frame({paper=true,bg=40,white=205}={}){
 const rgba=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const inside=paper&&x>32&&x<256&&y>43&&y<360;
  let v=inside?white:bg;
  if(inside&&y%29<2&&x>70&&x<205)v=Math.max(0,v-38);
  const k=(y*W+x)*4;rgba[k]=rgba[k+1]=rgba[k+2]=v;rgba[k+3]=255;
 }
 return rgba;
}

test("edge é padrão, retorna quatro cantos na escala original e preserva suporte",()=>{
 const r=experimentalPaperDetector(frame(),W,H);
 assert.ok(r);
 assert.equal(r.method,"edge-first-01");
 assert.equal(r.corners.length,4);
 assert.ok(r.support>.4);
 assert.ok(r.corners.every(([x,y])=>x>=0&&x<=W&&y>=0&&y<=H));
});
test("modo primary usa exatamente o detector original",()=>{
 const data=frame(),reference={corners:[[1,2],[3,4],[5,6],[7,8]],score:.42,support:.48};
 let primary=0,edge=0;
 const r=experimentalPaperDetector(data,W,H,{mode:"primary",
 baseline:()=>{primary++;return reference},
 edge:()=>{edge++;return {found:false}}});
 assert.equal(r,reference);
 assert.equal(primary,1);
 assert.equal(edge,0);
});
test("edge não executa fallback pesado em todos os quadros",()=>{
 const flags=[],dummy=frame();
 const e=(input,w,h,options)=>{flags.push(options.allowFullResolution);return {found:false}};
 for(let misses=0;misses<28;misses++)
  assert.equal(experimentalPaperDetector(dummy,W,H,{mode:"edge",misses,edge:e}),null);
 assert.equal(flags.length,28);
 assert.equal(flags.filter(Boolean).length,3);
 assert.equal(flags[6],true);
 assert.equal(flags[15],true);
 assert.equal(flags[24],true);
});
test("importação pode solicitar tentativa de quadro completo",()=>{
 const flags=[];
 experimentalPaperDetector(frame(),W,H,{mode:"edge",fullResolution:true,
 edge:(d,w,h,o)=>{flags.push(o.allowFullResolution);return {found:false}}});
 assert.deepEqual(flags,[true]);
});
test("não reporta folha em fundo uniforme",()=>{
 assert.equal(experimentalPaperDetector(frame({paper:false}),W,H),null);
});
test("nenhum estado de captura/câmera é mantido no adaptador",()=>{
 const p=experimentalPaperDetector(frame(),W,H);
 const q=experimentalPaperDetector(frame(),W,H);
 assert.deepEqual(p.corners,q.corners);
 assert.throws(()=>experimentalPaperDetector(frame(),W,H,{mode:"desconhecido"}),TypeError);
});
