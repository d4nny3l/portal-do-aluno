import { enhanceDocument } from '../js/document-enhance.mjs';
import { test } from 'node:test';
function checks(enhance){
  const assert=(condition,name)=>{if(!condition)throw new Error(name);results.push(name)};
  const results=[],w=360,h=480;
  const image=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4, paper=110+120*x/(w-1),ink=(y%29>=13&&y%29<=15&&x>24&&x<336),color=x>245&&x<300&&y>200&&y<216;
    image[i]=color?paper*.85:ink?paper*.28:paper;
    image[i+1]=color?paper*.25:ink?paper*.28:paper;
    image[i+2]=color?paper*.2:ink?paper*.28:paper;image[i+3]=255;
  }
  const old=image.slice(),gray=enhance(image,w,h,"gray"),color=enhance(image,w,h,"color"),bw=enhance(image,w,h,"bw");
  const at=(a,x,y,c=0)=>a[(y*w+x)*4+c];
  const spread=Math.abs(at(gray,40,7)-at(gray,320,7));
  assert(spread<25,"gradient paper uniformity <25 levels");
  assert(at(gray,40,14)<105&&at(gray,320,14)<105,"dark strokes preserved on both sides");
  assert(at(bw,40,14)===0&&at(bw,320,14)===0&&at(bw,40,7)===255&&at(bw,320,7)===255,"binary text and blank distinction");
  assert(at(color,270,207,0)>at(color,270,207,1)+45,"red mark remains red");
  assert(image.every((v,i)=>v===old[i]),"source unmodified");
  assert(enhance(image,w,h,"original").every((v,i)=>v===old[i]),"original bit exact");
  assert([gray,color,bw].every(a=>a.length===image.length&&a.every((v,i)=>i%4!==3||v===255)),"valid RGBA and dimensions");
  const tiny=new Uint8ClampedArray([200,200,200,255]);
  assert(enhance(tiny,1,1,"bw")[0]===255,"tiny flat image");
  let rejected=false;try{enhance(tiny,2,1,"color")}catch{rejected=true}
  assert(rejected,"invalid input rejected");
  return {results,measurements:{gradientSpreadBefore:Math.abs(at(image,40,7)-at(image,320,7)),gradientSpreadAfter:spread}};
}
test('DOC-ENHANCE-01 synthetic regression checks',()=>{console.log(checks(enhanceDocument));});
