import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFiducials, normalizeCard, warpFromFiducials } from '../omr/normalize.mjs';

// Synthetic light levels only; no identity, photograph or remote service.
const width=900, height=1000;
const markerPoints=[{x:130,y:95},{x:760,y:95},{x:760,y:905},{x:130,y:905}];
function syntheticCard({paper=255,ink=5,shadow=0,count=4}={}){
 const pixels=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)
  pixels[y*width+x]=Math.min(255,paper+Math.round(shadow*y/height));
 for(const {x:cx,y:cy} of markerPoints.slice(0,count))
  for(let y=cy-8;y<=cy+8;y++)for(let x=cx-12;x<=cx+12;x++)pixels[y*width+x]=ink;
 return pixels;
}
function assertCorners(result){
 assert.equal(result.found,true);
 assert.ok(result.confidence>=.75);
 assert.equal(result.corners.length,4);
 result.corners.forEach((point,index)=>assert.ok(
  Math.hypot(point.x-markerPoints[index].x,point.y-markerPoints[index].y)<2,
  'Corner '+index+' '+JSON.stringify(point)
 ));
}
test('bright and moderate captures preserve existing geometry and avoid fallback',()=>{
 for(const paper of [255,180,120,90]){
  const pixels=syntheticCard({paper}),det=detectFiducials(pixels,width,height);
  assertCorners(det);
  assert.equal(det.lightingFallback,false);
  const result=normalizeCard(pixels,width,height,{outputWidth:420});
  assert.equal(result.width,420);assert.equal(result.height,594);
  const manual=warpFromFiducials(pixels,width,height,markerPoints,{outputWidth:420});
  assert.deepEqual(result.pixels,manual.pixels,'no optical-pixel changes');
 }
});
test('very dark paper retries only marker segmentation, not bubble evidence',()=>{
 for(const paper of [65,50,45,30]){
  const pixels=syntheticCard({paper}),det=detectFiducials(pixels,width,height);
  assertCorners(det);
  assert.equal(det.lightingFallback,true,'paper '+paper);
  const normalized=normalizeCard(pixels,width,height,{outputWidth:420});
  assert.ok(normalized.pixels.some(v=>v===paper),'do not brighten evidence');
 }
});
test('uneven light and shadows recover geometrically valid corner markers',()=>{
 for(const paper of [45,50,60,75]){
  const det=detectFiducials(syntheticCard({paper,shadow:15}),width,height);
  assertCorners(det);
  assert.equal(det.lightingFallback,true);
 }
});
test('blank, missing-marker and flat dark captures never invent corners',()=>{
 for(const options of [{paper:255,count:3},{paper:50,count:3},{paper:55,count:0},{paper:10,count:0},{paper:120,count:0,shadow:12}]){
  const det=detectFiducials(syntheticCard(options),width,height);
  assert.equal(det.found,false,JSON.stringify(options));
 }
});
