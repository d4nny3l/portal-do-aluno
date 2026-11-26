// Regression of the exact G6 counterexample using the real EDGE detector,
// original corpus pixels and freshly delivered (not frozen) black frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createPaperTracker} from '../camera.mjs';
import {withdrawalFrame,withdrawalReference,withdrawalMotion,withdrawalSurface} from '../withdrawal.mjs';
import {deskPixel} from './rearm-fixture.mjs';
import {experimentalPaperDetector} from '../../../../laboratorio/salta-omr-scan-safe-02/js/experimental-detector.mjs';
import {sceneSignature,structuralChange} from '../../../../laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs';
const w=384,h=576,src=new Uint8ClampedArray(gunzipSync(readFileSync(new URL('../validation/moderate-A.rgba.gz',import.meta.url))));
function compose({x0=30,y0=38,pw=324,ph=458,paper=true,desk=[37,51,67],textured=false}={}){
 const rgba=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;rgba.set([...deskPixel(w,h,x,y,desk,textured),255],i);
  if(paper&&x>=x0&&x<x0+pw&&y>=y0&&y<y0+ph){
   const source=(Math.min(1272,Math.floor((y-y0)*1273/ph))*900+Math.min(899,Math.floor((x-x0)*900/pw)))*4;
   rgba.set(src.subarray(source,source+4),i);
  }
 }
 const q=experimentalPaperDetector(rgba,w,h,{mode:'edge'});
 return {q,rgba,frame:withdrawalFrame(rgba,w,h,q?.corners)};
}
const still=compose(),covered=compose({paper:false,desk:[0,0,0]}),textured=compose({x0:52,y0:50,pw:280,ph:396,textured:true}),desk=compose({paper:false,textured:true}),moved=compose({x0:27,y0:50,pw:280,ph:396,textured:true});
const observe=(t,p,now)=>t.observe(p.q,w,h,p.frame,now);
function capture(t,from,frame=still){let result;for(let i=0;i<11;i++)result=observe(t,frame,from+i*66);return result;}
test('historical black-frame counterexample: no capture in darkness or in-flight overlap, but no withdrawal lock after completion',()=>{
 assert.ok(still.q?.score>=.22);assert.equal(covered.q,null);
 assert.equal(structuralChange(sceneSignature(still.rgba,w,h),sceneSignature(covered.rgba,w,h)),true,'historical withdrawal gate could mistake obstruction for removal');
 const t=createPaperTracker(),first=capture(t,0);assert.equal(first.captureId,1);
 for(const now of [1000,1220,1440,1660])assert.equal(observe(t,covered,now).captureId,undefined);
 assert.equal(capture(t,1800).captureId,undefined,'in-flight capture remains exclusive');
 assert.equal(t.finish(1),true);
 for(const now of [3000,3220,3440,3660])assert.equal(observe(t,covered,now).captureId,undefined);
 assert.equal(t.snapshot().phase,'ready');assert.equal(capture(t,3800).captureId,2,'owner explicitly permits rereading without proof of a different physical sheet');
});
test('real detector accepts next stable sheet on featureless desk without a removal sequence',()=>{
 const t=createPaperTracker();assert.equal(capture(t,0,still).captureId,1);t.finish(1);
 assert.equal(capture(t,1000,still).captureId,2);
});
