// Regression of the exact G6 counterexample using the real EDGE detector,
// original corpus pixels and freshly delivered (not frozen) black frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createPaperTracker} from '../camera.mjs';
import {withdrawalFrame} from '../withdrawal.mjs';
import {deskPixel} from './rearm-fixture.mjs';
import {experimentalPaperDetector} from '../../../../laboratorio/salta-omr-scan-safe-02/js/experimental-detector.mjs';
import {sceneSignature,structuralChange} from '../../../../laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs';
const w=384,h=576,src=new Uint8ClampedArray(gunzipSync(readFileSync(new URL('../validation/moderate-A.rgba.gz',import.meta.url))));
function compose({x0=30,paper=true,desk=[37,51,67],textured=false}={}){
 const rgba=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;rgba.set([...deskPixel(w,h,x,y,desk,textured),255],i);
  if(paper&&x>=x0&&x<x0+324&&y>=38&&y<496){
   const source=(Math.min(1272,Math.floor((y-38)*1273/458))*900+Math.min(899,Math.floor((x-x0)*900/324)))*4;
   rgba.set(src.subarray(source,source+4),i);
  }
 }
 const q=experimentalPaperDetector(rgba,w,h,{mode:'edge'});
 return {q,rgba,frame:withdrawalFrame(rgba,w,h,q?.corners)};
}
const still=compose(),covered=compose({paper:false,desk:[0,0,0]}),textured=compose({textured:true}),desk=compose({paper:false,textured:true}),moved=compose({x0:8,textured:true});
const observe=(t,p,now)=>t.observe(p.q,w,h,p.frame,now);
function capture(t,from,frame=still){let result;for(let i=0;i<11;i++)result=observe(t,frame,from+i*66);return result;}
test('G6 regression: four fresh black frames over 660 ms never rearm the same unchanged sheet',()=>{
 assert.ok(still.q?.score>=.22);assert.equal(covered.q,null);
 assert.equal(structuralChange(sceneSignature(still.rgba,w,h),sceneSignature(covered.rgba,w,h)),true,'exact old gate still accepts this counterexample');
 const t=createPaperTracker(),first=capture(t,0);assert.equal(first.captureId,1);t.finish(1);
 for(const now of [1000,1220,1440,1660])observe(t,covered,now);
 assert.equal(t.snapshot().phase,'locked');
 assert.equal(capture(t,1800).captureId,undefined);
 assert.equal(t.snapshot().cardId,1);
});
test('G6 positive control: real detector + observed movement + same visible desk permit another identical sheet',()=>{
 assert.ok(moved.q?.score>=.22);assert.equal(desk.q,null);
 const t=createPaperTracker();assert.equal(capture(t,0,textured).captureId,1);t.finish(1);
 observe(t,moved,1000);
 for(const now of [1100,1320,1540,1760])observe(t,desk,now);
 assert.equal(t.snapshot().phase,'vacant');
 assert.equal(capture(t,2000,textured).captureId,2);
});
