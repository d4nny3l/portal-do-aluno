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
const samePosition=html.match(/^function samePosition\(.*$/m)?.[0];
const progress=html.match(/^function setCameraProgress\(.*$/m)?.[0];
assert.ok(samePosition&&progress,'production stability and progress functions must be present');
const source=[samePosition,progress,scanner].join('\n');
const corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
const fullCorners=corners.map(p=>({x:p.x*2,y:p.y*2}));

function harness(){
 const elements=new Map(),messages=[];
 const $=id=>{
  if(!elements.has(id))elements.set(id,{hidden:['cameraGrade','photoGrade','cameraStableStatus','cameraCaptureStatus','cameraReadStatus'].includes(id),disabled:false,
   textContent:'',dataset:{review:'false'},checked:false});
  return elements.get(id);
 };
 const preview={gray:new Uint8Array([1]),width:900,height:1000};
 const final={gray:new Uint8Array([2]),width:1800,height:2000};
 Object.assign($('video'),{videoWidth:900,videoHeight:1000,readyState:4});
 let captures=0,processed=0,blurFinal=false,moveFinal=false,found=true,movePreview=false,now=10000;
 const state={
  $,Date:{now:()=>now},cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',stableFrames:0,
  previousCorners:null,previousCameraFrame:null,waitingForRemoval:false,
  absentFrames:0,lastCaptureAt:0,captureBusy:false,
  drawVideoFrame:()=>preview,
  detectFiducials:(gray,width)=>{
   if(!found)return {found:false,confidence:0,corners:[]};
   return {found:true,confidence:.96,corners:width===1800
    ?fullCorners.map(p=>({x:p.x+(moveFinal?150:0),y:p.y}))
    :corners.map((p,i)=>({x:p.x+(movePreview&&i===0?100:0),y:p.y}))};
  },
  captureQuality:frame=>({ok:frame!==final||!blurFinal,
   message:frame===final&&blurFinal?'Aguarde o foco.':'Folha nítida.',sharpness:80}),
  positionGuides(){},updateCameraInfo(){},markLastReadingPending(){},
  setScanMessage:m=>{messages.push(m);$('cameraGuideStatus').textContent=m;},
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
 vm.runInContext(source,state,{timeout:3000});
 return {state,messages,$,advance(ms){now+=ms},
  scan(n){for(let i=0;i<n;i++)state.scanCameraFrame()},
  get captures(){return captures},
  get processed(){return processed},
  blur(v){blurFinal=v},move(v){moveFinal=v},movePreview(v){movePreview=v},present(v){found=v}};
}
test('INT-SCAN-01 removed: no extra full-resolution captures or retained candidate',()=>{
 assert.doesNotMatch(html,/scanBestFrame|scanSelectionEnabled|scanOpticalRank|sampleScanFrame|scanValidFrame|clearScanFrameChoice/);
 assert.match(scanner,/stableFrames>=2/);
 assert.doesNotMatch(scanner,/stableFrames>=3/);
 assert.match(scanner,/captureQuality\(capture,actual,capture\)/);
 assert.match(scanner,/manualCorners:actual\.corners/);
 const h=harness();h.scan(1);
 assert.equal(h.state.stableFrames,0,'first preview is the reference, not a confirmation');
 assert.equal(h.captures,0);
 h.scan(1);
 assert.equal(h.state.stableFrames,1);
 assert.equal(h.captures,0,'first confirmation never draws a full capture');
 h.scan(1);
 assert.equal(h.state.stableFrames,2);
 assert.equal(h.captures,1,'second valid confirmation draws only one capture');
 assert.equal(h.processed,1);
 h.scan(4);
 assert.equal(h.captures,1,'sheet removal is required before another capture');
});
test('single-shot rejects blurred final frame and retries cleanly',()=>{
 const h=harness();h.blur(true);h.scan(3);
 assert.equal(h.captures,1);assert.equal(h.processed,0);
 assert.equal(h.state.waitingForRemoval,false);
 assert.match(h.messages.at(-1),/foco/);
 h.blur(false);h.advance(2000);h.scan(3);
 assert.equal(h.captures,2);assert.equal(h.processed,1);
});
test('single-shot rejects drift of a final fiducial; no stale-frame substitution',()=>{
 const h=harness();h.move(true);h.scan(3);
 assert.equal(h.captures,1);assert.equal(h.processed,0);
 assert.match(h.messages.at(-1),/folha se moveu/);
});

test('single-shot shows stable indicator during cooldown, resets on drift, and never captures early',()=>{
 const h=harness();h.state.lastCaptureAt=10000;
 const indicators=()=>['cameraStableStatus','cameraCaptureStatus','cameraReadStatus'].map(id=>h.$(id).hidden);
 h.scan(1);
 assert.equal(h.state.stableFrames,0);
 assert.deepEqual(indicators(),[true,true,true]);
 assert.match(h.$('cameraGuideStatus').textContent,/0\/2/);
 h.scan(1);
 assert.equal(h.state.stableFrames,1);
 assert.deepEqual(indicators(),[true,true,true]);
 assert.match(h.$('cameraGuideStatus').textContent,/1\/2/);
 h.scan(1);
 assert.equal(h.state.stableFrames,2);
 assert.equal(h.$('cameraGuideStatus').textContent,'Validando captura…');
 assert.deepEqual(indicators(),[false,true,true],'stable visible before any final capture');
 assert.equal(h.captures,0);assert.equal(h.processed,0);
 h.movePreview(true);h.scan(1);
 assert.equal(h.state.stableFrames,0,'one drifting marker invalidates stability');
 assert.deepEqual(indicators(),[true,true,true]);
 h.movePreview(false);h.scan(3);
 assert.equal(h.state.stableFrames,2);
 assert.deepEqual(indicators(),[false,true,true]);
 h.advance(1999);h.scan(1);
 assert.equal(h.captures,0,'cooldown still enforced at 1999 ms');
 assert.deepEqual(indicators(),[false,true,true]);
 h.advance(1);h.scan(1);
 assert.equal(h.captures,1);assert.equal(h.processed,1);
 assert.deepEqual(indicators(),[false,false,false],'all indicators visible only after validated capture');
 h.scan(3);assert.equal(h.captures,1,'no duplicate before removal');
});
