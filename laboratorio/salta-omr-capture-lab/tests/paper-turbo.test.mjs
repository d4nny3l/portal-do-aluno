// node --experimental-default-type=module laboratorio/salta-omr-capture-lab/tests/paper-turbo.test.mjs
import assert from 'node:assert/strict';
import {sampleQuality,shouldCapture,selectBestFrame} from '../js/quality.js';

const W=320,H=448;
function page({dark=false,blur=0}={}){
 const rgba=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const paper=x>16&&x<W-16&&y>16&&y<H-16;
  const bars=paper&&x>40&&x<W-40&&y>50&&y<400&&
   Math.floor(y/15)%2===0&&x%80<42;
  const v=bars?(dark?12:20):paper?(dark?112:240):(dark?45:165);
  const k=(y*W+x)*4;
  rgba[k]=rgba[k+1]=rgba[k+2]=v;rgba[k+3]=255;
 }
 if(blur){
  const base=rgba.slice();
  for(let y=3;y<H-3;y++)for(let x=3;x<W-3;x++){
   let sum=0;for(let i=-blur;i<=blur;i++)sum+=base[(y*W+x+i)*4];
   const k=(y*W+x)*4,v=Math.round(sum/(2*blur+1));
   rgba[k]=rgba[k+1]=rgba[k+2]=v;
  }
 }
 return rgba;
}
const corners=[[16,16],[W-16,16],[W-16,H-16],[16,H-16]];
const clear=sampleQuality(page(),W,H,corners);
const blurry=sampleQuality(page({blur:3}),W,H,corners);
const dim=sampleQuality(page({dark:true}),W,H,corners);
assert.ok(clear.sharpness>blurry.sharpness,'Nitidez deve diminuir com borrão');
assert.ok(dim.score>0,'Pouca luz não é erro automático');
assert.equal(shouldCapture({consecutive:1,stable:1,score:.6,support:.7,sharpness:20}),false,'Não fotografar no primeiro contorno isolado');
assert.equal(shouldCapture({consecutive:2,stable:1,score:.44,support:.7,sharpness:20}),true,'Captura rápida com folha presente');
assert.equal(shouldCapture({consecutive:3,stable:0,score:.55,support:.6,sharpness:12}),true,'Permitir mão tremendo com contorno confiável');
assert.equal(shouldCapture({consecutive:3,stable:0,score:.17,support:.1,sharpness:2}),false,'Não disparar falso retângulo');
assert.equal(shouldCapture({consecutive:6,stable:0,ageMs:350,score:.33,support:.3,sharpness:7}),true,'Tentativa limitada para folha em movimento');
const first={quality:{score:10}},better={quality:{score:16}},same={quality:{score:10.1}};
assert.equal(selectBestFrame(first,better),better);
assert.equal(selectBestFrame(first,same),first,'Mudança muito pequena não justifica troca');
console.log('PAPER-TURBO-01: testes de qualidade e captura PASSARAM.');
