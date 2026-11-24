import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Regression of the INT-SCAN-01 removal. One final full-resolution capture,
// never a preliminary sample or "best of multiple captures" buffer.
const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const start=html.indexOf('function scanCameraFrame(){');
const end=html.indexOf('function updateCameraInfo(){',start);
assert.ok(start>0&&end>start);
const scanner=html.slice(start,end);
const source=html.slice(html.indexOf('function samePosition('),end);
const corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
const fullCorners=corners.map(p=>({x:p.x*2,y:p.y*2}));

function harness(){
 const elements=new Map(),messages=[];
 const $=id=>{
  if(!elements.has(id))elements.set(id,{hidden:['cameraGrade','photoGrade'].includes(id),disabled:false,
   textContent:'',dataset:{review:'false'},checked:false});
  return elements.get(id);
 };
 const preview={gray:new Uint8Array([1]),width:900,height:1000};
 const final={gray:new Uint8Array([2]),width:1800,height:2000};
 Object.assign($('video'),{videoWidth:900,videoHeight:1000,readyState:4});
 let captures=0,processed=0,blurFinal=false,moveFinal=false,found=true;
 const state={
  $,cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',stableFrames:0,
  previousCorners:null,previousCameraFrame:null,waitingForRemoval:false,
  absentFrames:0,lastCaptureAt:0,captureBusy:false,
  drawVideoFrame:()=>preview,
  detectFiducials:(gray,width)=>{
   if(!found)return {found:false,confidence:0,corners:[]};
   return {found:true,confidence:.96,corners:width===1800
    ?fullCorners.map(p=>({x:p.x+(moveFinal?150:0),y:p.y}))
    :corners};
  },
  captureQuality:frame=>({ok:frame!==final||!blurFinal,
   message:frame===final&&blurFinal?'Aguarde o foco.':'Folha nítida.',sharpness:80}),
  samePosition:()=>true,positionGuides(){},updateCameraInfo(){},
  setCameraProgress(){},markLastReadingPending(){},
  setScanMessage:m=>messages.push(m),
  captureFrameGray:()=>{captures++;return final;},
  mapFramePoints:(points,source,target)=>points.map(p=>({
   x:p.x*target.width/source.width,y:p.y*target.height/source.height})),
  prepareImage:(gray,width,height,{manualCorners})=>{
   processed++;
   assert.equal(gray,final.gray);
   assert.deepEqual([...manualCorners.map(p=>p.x)],fullCorners.map(p=>p.x));
   return {pixels:gray,width,height};
  },
 };
 vm.createContext(state);
 vm.runInContext(scanner,state,{timeout:3000});
 return {state,messages,
  scan(n){for(let i=0;i<n;i++)state.scanCameraFrame()},
  get captures(){return captures},
  get processed(){return processed},
  blur(v){blurFinal=v},move(v){moveFinal=v},present(v){found=v}};
}
test('INT-SCAN-01 removed: no extra full-resolution captures or retained candidate',()=>{
 assert.doesNotMatch(html,/scanBestFrame|scanSelectionEnabled|scanOpticalRank|sampleScanFrame|scanValidFrame|clearScanFrameChoice/);
 assert.match(scanner,/stableFrames>=2/);
 assert.doesNotMatch(scanner,/stableFrames>=3/);
 assert.match(scanner,/captureQuality\(capture,actual,capture\)/);
 assert.match(scanner,/manualCorners:actual\.corners/);
 const h=harness();h.scan(1);
 assert.equal(h.captures,0,'first confirmation never draws a full capture');
 h.scan(1);
 assert.equal(h.captures,1,'second valid confirmation draws only one capture');
 assert.equal(h.processed,1);
 h.scan(4);
 assert.equal(h.captures,1,'sheet removal is required before another capture');
});
test('single-shot rejects blurred final frame and retries cleanly',()=>{
 const h=harness();h.blur(true);h.scan(2);
 assert.equal(h.captures,1);assert.equal(h.processed,0);
 assert.equal(h.state.waitingForRemoval,false);
 assert.match(h.messages.at(-1),/foco/);
 h.blur(false);h.state.lastCaptureAt=0;h.scan(2);
 assert.equal(h.captures,2);assert.equal(h.processed,1);
});
test('single-shot rejects drift of a final fiducial; no stale-frame substitution',()=>{
 const h=harness();h.move(true);h.scan(2);
 assert.equal(h.captures,1);assert.equal(h.processed,0);
 assert.match(h.messages.at(-1),/folha se moveu/);
});
