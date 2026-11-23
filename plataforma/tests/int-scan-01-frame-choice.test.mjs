
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const start=html.indexOf('let scanBestFrame=null,scanSelectionEnabled=true;');
const scanner=html.indexOf('function scanCameraFrame(){',start);
const end=html.indexOf('function updateCameraInfo(){',scanner);
assert.ok(start>0&&scanner>start&&end>scanner);
const source=html.slice(start,end);
const corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
const fullCorners=corners.map(p=>({x:p.x*2,y:p.y*2}));

function harness({layout='v2',enabled=true,values={2:2,3:1},mismatch=false,oversize=false}={}){
 const template=createTemplate([{type:'A-E',count:60,label:'Questões'}],{
  templateId:'int-scan-synthetic-'+layout,layoutVersion:layout,identityMode:'seven-digit-code'});
 const activeManifest=Object.freeze({schemaVersion:layout,questionCount:60,contentHash:'same-synthetic-manifest-'+layout});
 const elements=new Map(),messages=[],samples=[];
 const $=id=>{
  if(!elements.has(id))elements.set(id,{hidden:['cameraGrade','photoGrade'].includes(id),
   textContent:'',dataset:{review:'false'},checked:false});
  return elements.get(id);
 };
 const video={videoWidth:900,videoHeight:1000,readyState:4};
 let tick=0,captures=0,selected=null;
 const preview={gray:new Uint8Array([10]),width:900,height:1000};
 const state={
  $,template,activeManifest,
  cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',stableFrames:0,previousCorners:null,
  previousCameraFrame:null,waitingForRemoval:false,absentFrames:0,lastCaptureAt:0,captureBusy:false,
  drawVideoFrame:()=>{tick++;return preview},
  detectFiducials:(gray,width)=>{
   const final=width===1800;
   return {found:true,confidence:.96,corners:final?(mismatch?fullCorners.map(p=>({x:p.x+100,y:p.y})):fullCorners):corners};
  },
  samePosition:()=>true,
  captureQuality:frame=>({ok:true,message:'Folha estável.',brightness:175,
   contrast:100,sharpness:frame.width===1800?frame.gray[0]*20:30,glare:false}),
  positionGuides(){},updateCameraInfo(){},
  setScanMessage:message=>messages.push(message),
  setCameraProgress(){},
  markLastReadingPending(){},
  captureFrameGray(){
   captures++;
   const pixel=values[tick]??1;
   const width=1800,height=oversize?3000:2000;
   const capture={gray:new Uint8Array(width*height).fill(pixel),width,height};
   samples.push({tick,pixel,bytes:capture.gray.byteLength});
   return capture;
  },
  mapFramePoints:(points,source,target)=>{
   if(Math.abs(source.width/source.height/ (target.width/target.height)-1)>.005)
    throw new Error('Orientação alterada');
   return points.map(p=>({x:p.x*target.width/source.width,y:p.y*target.height/source.height}));
  },
  prepareImage(gray,width,height,{manualCorners}){
   selected={pixel:gray[0],width,height,corners:manualCorners,template,manifest:activeManifest};
   return {pixels:gray,width,height};
  },
 };
 elements.set('video',video);
 vm.createContext(state);
 vm.runInContext(source,state,{timeout:3000});
 if(!enabled)vm.runInContext('scanSelectionEnabled=false',state);
 return {
  state,messages,samples,get selected(){return selected},get captures(){return captures},
  get tick(){return tick},get retainedBytes(){
   return vm.runInContext('scanBestFrame?.capture.gray.byteLength??0',state);
  },
  scan(count=3){for(let i=0;i<count;i++)state.scanCameraFrame()},
 };
}

for(const layout of ['v1','v2']){
 test('INT-SCAN-01 paired A/B 60-question A4 '+layout+': same frames and manifest, optical-only choice',t=>{
  const a=harness({layout,enabled:false});
  const b=harness({layout,enabled:true});
  const a0=performance.now();a.scan();const aMs=performance.now()-a0;
  const b0=performance.now();b.scan();const bMs=performance.now()-b0;
  assert.equal(a.tick,3);assert.equal(b.tick,3);
  assert.equal(a.selected.pixel,1,'#114 published flow uses final stable snapshot');
  assert.equal(b.selected.pixel,2,'higher measured sharpness from second stable snapshot wins');
  assert.equal(a.selected.manifest.contentHash,b.selected.manifest.contentHash);
  assert.equal(a.selected.template.questions.length,60);
  assert.equal(b.selected.template.questions.length,60);
  assert.equal(a.captures,1);assert.equal(b.captures,2);
  assert.equal(a.samples[0].tick,3);assert.deepEqual(b.samples.map(s=>s.tick),[2,3]);
  assert.deepEqual(b.selected.corners,fullCorners,'corners come from selected full-resolution frame');
  assert.equal(b.state.waitingForRemoval,true);
  assert.equal(b.retainedBytes,0,'release candidate after processing');
  assert.ok(b.samples.every(s=>s.bytes<=5_000_000));
  t.diagnostic('synthetic only: A capture draws='+a.captures+', B='+b.captures+
   ', A='+aMs.toFixed(1)+'ms, B='+bMs.toFixed(1)+
   'ms (Node fixture timings; NOT phone latency or OMR accuracy)');
 });
}

test('INT-SCAN-01: geometry drift rejects candidate and final frame; no normalization or duplicate',()=>{
 const h=harness({mismatch:true});
 h.scan();
 assert.equal(h.selected,null);
 assert.equal(h.state.waitingForRemoval,false);
 assert.equal(h.state.captureBusy,false);
 assert.match(h.messages.at(-1),/folha se moveu/);
});
test('INT-SCAN-01: oversized candidate disables experiment and falls back to #114',()=>{
 const h=harness({oversize:true});
 h.scan();
 assert.equal(h.selected,null,'#114 geometry/orientation gate still applies');
 assert.equal(vm.runInContext('scanSelectionEnabled',h.state),false);
 assert.equal(h.state.waitingForRemoval,false);
 assert.match(h.messages.at(-1),/Orientação alterada/);
});
test('INT-SCAN-01: no answer key, identity or scoring data is read by frame selector',()=>{
 const part=html.slice(start,scanner);
 assert.doesNotMatch(part,/readRaster|scoreIntegratedPlan|answerKey|studentCode|renderAnswers|calculateScore/);
 assert.match(part,/5_000_000/);
 assert.match(part,/Date.now\(\)-started>180/);
 assert.match(html,/function recoverSafariVideo\(\)/);
 assert.match(html,/if\(!actual.found\|\|actual.confidence<.7/);
});
