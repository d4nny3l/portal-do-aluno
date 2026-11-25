import { enhanceDocument } from '../js/document-enhance.mjs';
import { test } from 'node:test';
import { enhance as legacy } from '../js/vision.js';
import assert from 'node:assert/strict';
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

function additionalTests(candidate,legacy){
 const w=360,h=480,pix=(a,x,y,c=0)=>a[(y*w+x)*4+c],make=(f)=>{const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set([...f(x,y),255],(y*w+x)*4);return a;};
 const panel=make((x,y)=>x>110&&x<260&&y>180&&y<320?[130,130,130]:[220,220,220]),shadow=make((x,y)=>{let v=x<180?90:230;return [v,v,v]}),warm=make(()=>[215,190,160]);
 const outputs={};
 for(const [key,im,pt] of [["panel",panel,[185,250]],["shadowBoundary",shadow,[175,7]],["warm",warm,[40,7]]]){
   const values=[legacy,candidate].map(f=>{const a=f(im,w,h,"color");return [0,1,2].map(c=>pix(a,...pt,c))});outputs[key]={legacy:values[0],candidate:values[1]};
 }
 return outputs;
}
test('document content and lighting comparison',()=>{const m=additionalTests(enhanceDocument,legacy);assert.ok(m.panel.candidate[0]<=185);assert.ok(m.shadowBoundary.candidate[0]>=210);assert.ok(Math.max(...m.warm.candidate)-Math.min(...m.warm.candidate)<=25);});
