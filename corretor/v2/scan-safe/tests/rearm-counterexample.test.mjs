// Adversarial truth: the card stays in place; fresh black frames obscure it.
// Passing this reproduction test means G6 is BLOCKED, not that rearm is safe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createPaperTracker} from '../camera.mjs';
import {experimentalPaperDetector} from '../../../../laboratorio/salta-omr-scan-safe-02/js/experimental-detector.mjs';
import {sceneSignature} from '../../../../laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs';
test('G6 blocker: fresh lens-obscured frames can rearm the same card without paper withdrawal',()=>{
 const w=384,h=576,src=new Uint8ClampedArray(gunzipSync(readFileSync(new URL('../validation/moderate-A.rgba.gz',import.meta.url))));
 const paper=new Uint8ClampedArray(w*h*4),covered=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;paper.set([37,51,67,255],i);covered.set([0,0,0,255],i);
  if(x>=30&&x<354&&y>=38&&y<496){
   const source=(Math.min(1272,Math.floor((y-38)*1273/458))*900+Math.min(899,Math.floor((x-30)*900/324)))*4;
   paper.set(src.subarray(source,source+4),i);
  }
 }
 const q=experimentalPaperDetector(paper,w,h,{mode:'edge'}),absent=experimentalPaperDetector(covered,w,h,{mode:'edge'});
 assert.ok(q?.score>=.22);assert.equal(absent,null);
 const reference=sceneSignature(paper,w,h),occluded=sceneSignature(covered,w,h),tracker=createPaperTracker();
 let first,second;for(let i=0;i<11;i++)first=tracker.observe(q,w,h,reference,i*66);
 assert.equal(first.captureId,1);tracker.finish(first.captureId);
 for(const now of [1000,1220,1440,1660])tracker.observe(absent,w,h,occluded,now);
 assert.equal(tracker.snapshot().phase,'vacant');
 for(let i=0;i<11;i++)second=tracker.observe(q,w,h,reference,1800+i*66);
 assert.equal(second.captureId,2,'same original pixels recaptured; no synthetic paper removal occurred');
});
