import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { detectFiducials, normalizeCard, warpFromFiducials } from '../omr/normalize.mjs';

// Same detector with ONLY the new low-light physical gate removed.
// This reconstructs audited PR #48 without changing ranking or first pass.
const source = readFileSync(new URL('../omr/normalize.mjs', import.meta.url),'utf8');
assert.equal(source.split(' && retryQuad.physicalFit').length,2,'only one new acceptance gate');
const beforeSource = source
 .replace('from "./template.mjs?v=20261114v2final"',
   'from '+JSON.stringify(new URL('../omr/template.mjs?v=20261114v2final',import.meta.url).href))
 .replace(' && retryQuad.physicalFit','');
const { detectFiducials: detectBefore } = await import('data:text/javascript;base64,'+Buffer.from(beforeSource).toString('base64'));

// Synthetic light levels only; no camera, PII, student, server or real photo.
const width=900, height=1000;
const markerPoints=[{x:130,y:95},{x:760,y:95},{x:760,y:905},{x:130,y:905}];
const perspectivePoints=[{x:133,y:103},{x:729,y:76},{x:786,y:896},{x:111,y:920}];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function markerSize(points,i,scale=1){
 const p=points[i],prev=points[(i+3)%4],next=points[(i+1)%4];
 const horizontal=distance(p,i%2?prev:next)/194;
 const vertical=distance(p,i%2?next:prev)/281;
 // A real marker is 5.5 x 5.5 mm; scale both axes together.
 return [Math.round(5.5*horizontal*scale),Math.round(5.5*vertical*scale)];
}
function fillRect(pixels,x,y,w,h,ink){
 for(let yy=Math.round(y-(h-1)/2);yy<Math.round(y-(h-1)/2)+h;yy++)
  for(let xx=Math.round(x-(w-1)/2);xx<Math.round(x-(w-1)/2)+w;xx++)
   if(xx>=0&&xx<width&&yy>=0&&yy<height)pixels[yy*width+xx]=ink;
}
function syntheticCard({paper=255,ink=5,shadow=0,count=4,points=markerPoints,scale=1,rect=null,extras=[]}={}){
 const pixels=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)
  pixels[y*width+x]=Math.min(255,paper+Math.round(shadow*y/height));
 for(const [i,{x,y}] of points.slice(0,count).entries()){
  const [w,h]=rect||markerSize(points,i,scale);
  fillRect(pixels,x,y,w,h,ink);
 }
 for(const [x,y,w,h] of extras)fillRect(pixels,x,y,w,h,ink);
 return pixels;
}
function assertCorners(result,points=markerPoints){
 assert.equal(result.found,true);
 assert.ok(result.confidence>=.75);
 assert.equal(result.corners.length,4);
 result.corners.forEach((point,index)=>assert.ok(
  Math.hypot(point.x-points[index].x,point.y-points[index].y)<2,
  'Corner '+index+' '+JSON.stringify(point)
 ));
}
test('bright and moderate captures preserve first pass, geometry and pixels',()=>{
 for(const paper of [255,180,120,90]){
  const pixels=syntheticCard({paper}),det=detectFiducials(pixels,width,height);
  assertCorners(det);
  assert.equal(det.lightingFallback,false);
  const before=detectBefore(pixels,width,height);
  assert.deepEqual(det.corners,before.corners,'original first pass must be bit-identical');
  const result=normalizeCard(pixels,width,height,{outputWidth:420});
  assert.equal(result.width,420);assert.equal(result.height,594);
  const manual=warpFromFiducials(pixels,width,height,before.corners,{outputWidth:420});
  assert.deepEqual(result.pixels,manual.pixels,'no optical-pixel changes');
 }
});
test('very dark paper: valid 5.5-mm markers recover with same normalized pixels',()=>{
 for(const paper of [65,50,45,30]){
  const pixels=syntheticCard({paper}),det=detectFiducials(pixels,width,height);
  assertCorners(det);
  assert.equal(det.lightingFallback,true,'paper '+paper);
  const before=detectBefore(pixels,width,height);
  assert.equal(before.found,true);
  const normalized=normalizeCard(pixels,width,height,{outputWidth:420});
  assert.ok(normalized.pixels.some(v=>v===paper),'do not brighten optical evidence');
 }
});
test('uneven light, small scale changes and realistic perspective preserve recovery',()=>{
 for(const paper of [45,50,60,75]){
  const pixels=syntheticCard({paper,shadow:15}),det=detectFiducials(pixels,width,height);
  assertCorners(det);
  assert.equal(det.lightingFallback,true);
 }
 for(const points of [markerPoints,perspectivePoints]){
  for(const scale of [.90,1,1.10]){
   const pixels=syntheticCard({paper:45,shadow:12,points,scale});
   const result=detectFiducials(pixels,width,height);
   assertCorners(result,points);
   assert.equal(result.lightingFallback,true,'perspective/scale '+scale);
  }
 }
});
test('original negative controls: blank, three markers, incomplete frame',()=>{
 for(const options of [
  {paper:255,count:3},{paper:50,count:3},{paper:55,count:0},
  {paper:10,count:0},{paper:120,count:0,shadow:12},
  {paper:45,count:2},{paper:50,count:3,points:perspectivePoints}
 ]){
  const pixels=syntheticCard(options),det=detectFiducials(pixels,width,height);
  assert.equal(det.found,false,JSON.stringify(options));
 }
});
test('P1 A/B: all three four-object false-marker sizes rejected from same pixels',()=>{
 for(const rect of [[13,9],[25,17],[41,25]]){
  const pixels=syntheticCard({paper:50,ink:0,rect});
  const before=detectBefore(pixels,width,height);
  const after=detectFiducials(pixels,width,height);
  assert.equal(before.found,true,rect.join('x')+' was accepted by audited PR #48');
  assert.equal(before.lightingFallback,true);
  assert.equal(after.found,false,'false object accepted '+rect.join('x'));
 }
});
test('P1: printed-content distractors, displaced dark boxes and incomplete frame are not accepted',()=>{
 const distractors=[[260,250,32,8],[560,345,24,8],[490,700,14,9],[360,790,23,6]];
 for(const options of [
  {paper:48,count:0,extras:distractors},
  {paper:45,count:3,extras:[[440,500,20,7]]},
  {paper:50,count:0,rect:[25,17],extras:[[130,95,25,17],[760,95,25,17],[760,905,25,17],[130,905,25,17],...distractors]},
  {paper:50,count:4,rect:[13,9],extras:distractors},
 ]){
  const pixels=syntheticCard(options);
  assert.equal(detectFiducials(pixels,width,height).found,false,
   'unexpected paper corner from distractors '+JSON.stringify(options));
 }
 const valid=syntheticCard({paper:48,extras:distractors});
 const detected=detectFiducials(valid,width,height);
 assertCorners(detected);
});
test('P1 cost: measure audited PR #48 and candidate on identical 900x1000 rasters',()=>{
 for(const [name,options] of [
  ['bright',{paper:180}],['low-light',{paper:50}],
  ['false-markers',{paper:50,ink:0,rect:[25,17]}]
 ]){
  const pixels=syntheticCard(options);
  const old=[],current=[];
  for(let i=0;i<3;i++){
   let t=performance.now();detectBefore(pixels,width,height);old.push(performance.now()-t);
   t=performance.now();detectFiducials(pixels,width,height);current.push(performance.now()-t);
  }
  const median=values=>[...values].sort((a,b)=>a-b)[1];
  console.log('P1 comparable local benchmark ms:',JSON.stringify({scenario:name,
   before:Math.round(median(old)),after:Math.round(median(current))}));
 }
 // CI runners and JS warm-up vary; no hard performance time assertion
 // or claim of Safari/iPhone performance from this Node benchmark.
});
