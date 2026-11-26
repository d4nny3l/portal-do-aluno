import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_POLICY,cameraConstraints,createPaperTracker,createSafeCamera} from '../camera.mjs';
import {createCaptureSession} from '../session.mjs';
import {W,H,paper,partial,moved,nudge,normal,makeWithdrawalFixture as fixture} from './rearm-fixture.mjs';
function observe(t,q,frame,now){return t.observe(q,W,H,frame,now)}
function leaf(t,now=0,f=normal,frame=f.still){let r;for(let i=0;i<11;i++)r=observe(t,paper,frame,now+i*66);return r;}
function deskFrames(t,now,f=normal,offsets=[0,200,450,700]){for(const dt of offsets)observe(t,null,f.desk,now+dt);}
function withdraw(t,now,f=normal,{slow=false}={}){
 if(slow)observe(t,nudge,f.nudge,now-180);
 observe(t,moved,f.moved,now-132);
 if(slow)observe(t,partial,f.partial,now-66);
 deskFrames(t,now,f);
}
test('exact frozen parameters and native browser negotiation, no forced aspect ratio',()=>{
 assert.deepEqual(CAMERA_POLICY,{STEADY_FRAMES:10,DET_W:384,LOOP_MS:66,MIN_SCORE:.22,SMOOTH:.45,MAX_SIDE:2600});
 for(const ua of ['iPhone AppleWebKit CriOS','Macintosh AppleWebKit Safari'])assert.equal(cameraConstraints(ua).video.width.ideal,1920);
 assert.equal(cameraConstraints('Chrome AppleWebKit').video.width.ideal,3840);
 assert.equal(cameraConstraints('Chrome').video.aspectRatio,undefined);
});
test('stationary paper, missing contour and time alone never rearm',()=>{
 const t=createPaperTracker();assert.equal(leaf(t).captureId,1);t.finish(1);
 for(let i=0;i<100;i++)assert.equal(observe(t,paper,normal.still,1000+i*1000).captureId,undefined);
 for(let i=0;i<100;i++)observe(t,null,normal.still,102000+i*1000);
 deskFrames(t,210000);assert.equal(t.snapshot().phase,'locked','desk with no observed movement is ambiguous');
 assert.equal(leaf(t,212000).captureId,undefined);
});
test('temporary black, dark and bright obstruction, invalid frame, partial sheet, intense shadow cannot rearm',()=>{
 for(const obstruction of [normal.black,normal.darkCover,normal.brightCover,null,normal.shadow,normal.partial]){
  const t=createPaperTracker();leaf(t);t.finish(1);
  for(const dt of [0,220,440,660,1000])observe(t,null,obstruction,1000+dt);
  assert.equal(t.snapshot().phase,'locked');assert.equal(leaf(t,3000).captureId,undefined);
 }
 const t=createPaperTracker();leaf(t);t.finish(1);
 observe(t,moved,normal.shadowMoved,1000); // changed pattern, not reliable displacement
 observe(t,partial,normal.partial,1200);
 for(const dt of [0,220,440,660])observe(t,null,normal.partial,1400+dt);
 assert.equal(t.snapshot().phase,'locked');
 assert.equal(leaf(t,3000).captureId,undefined);
});
test('no blackout can complete a previously observed displacement or carry evidence across it',()=>{
 const t=createPaperTracker();leaf(t);t.finish(1);
 observe(t,moved,normal.moved,1000);
 for(const dt of [0,220,440,660])observe(t,null,normal.black,1100+dt);
 deskFrames(t,2200);
 assert.equal(t.snapshot().phase,'locked','blackout cancels motion evidence');
 assert.equal(leaf(t,4000).captureId,undefined);
});
for(const [name,color] of [['light',[230,230,230]],['dark',[18,22,26]],['blue',[37,51,67]]]){
 test('legitimate quick and slow withdrawal on '+name+' desk; similar and identical next cards',()=>{
  const f=fixture(color);
  for(const slow of [false,true]){
   const t=createPaperTracker();assert.equal(leaf(t,0,f).captureId,1);t.finish(1);
   withdraw(t,1000,f,{slow});assert.equal(t.snapshot().phase,'vacant');
   assert.equal(leaf(t,2000,f,slow?f.other:f.still).captureId,2);
   t.finish(2);assert.equal(leaf(t,4000,f,slow?f.other:f.still).captureId,undefined);
  }
 });
}
test('four observations AND original evidence span; partial or detected paper resets absence',()=>{
 const t=createPaperTracker();leaf(t);t.finish(1);observe(t,moved,normal.moved,1000);
 deskFrames(t,1100,normal,[0,100,200,300]);assert.equal(t.snapshot().phase,'locked');
 observe(t,partial,normal.partial,1500);
 deskFrames(t,1600,normal,[0,200,450]);assert.equal(t.snapshot().phase,'locked');
 observe(t,null,normal.desk,2300);assert.equal(t.snapshot().phase,'vacant');
});
test('slow read completion cannot let a new sheet cross the in-flight capture',()=>{
 const t=createPaperTracker();leaf(t);withdraw(t,2000);assert.equal(t.snapshot().phase,'vacant');
 assert.equal(leaf(t,3000).captureId,undefined);assert.equal(t.snapshot().phase,'vacant');
 assert.equal(t.finish(99),false);assert.equal(leaf(t,5000).captureId,undefined);
 assert.equal(t.finish(1),true);assert.equal(leaf(t,6000).captureId,2);
});
test('100 sequential cards with proven withdrawals and unique IDs, no arbitrary cap',()=>{
 const t=createPaperTracker();
 for(let i=1;i<=100;i++){
  assert.equal(leaf(t,i*3000).captureId,i);assert.equal(t.finish(i),true);
  withdraw(t,i*3000+1000);
 }
 assert.equal(t.snapshot().phase,'vacant');
 assert.equal(leaf(t,400000).captureId,101,'no 100-card retention/capture ceiling');
});
test('slow Worker gap and orientation reset invalidate motion; new geometry needs new paper evidence',()=>{
 const t=createPaperTracker();leaf(t);t.finish(1);
 observe(t,moved,normal.moved,1000);t.resetGeometry({preserveReference:true});
 deskFrames(t,10000);assert.equal(t.snapshot().phase,'locked');
 assert.equal(leaf(t,12000).captureId,undefined);
 withdraw(t,14000);assert.equal(t.snapshot().phase,'vacant');
 assert.equal(leaf(t,16000).captureId,2);t.finish(2);t.resetGeometry();
 deskFrames(t,18000);assert.equal(t.snapshot().phase,'locked');
 observe(t,paper,normal.still,20000);withdraw(t,21000);assert.equal(t.snapshot().phase,'vacant');
 assert.equal(leaf(t,23000).captureId,3);
});
test('featureless or fully black supporting scene remains ambiguous, never time-rearms',()=>{
 for(const color of [[0,0,0],[37,51,67],[230,230,230]]){
  const f=fixture(color,false),t=createPaperTracker();leaf(t,0,f);t.finish(1);
  withdraw(t,2000,f);assert.equal(t.snapshot().phase,'locked');assert.equal(leaf(t,4000,f).captureId,undefined);
 }
});
test('camera pan and interruption by a bright obstruction do not establish withdrawal',()=>{
 for(const interruption of ['panned','brightCover']){
  const t=createPaperTracker();leaf(t);t.finish(1);
  if(interruption==='panned')observe(t,moved,normal.panned,1000);
  else {observe(t,moved,normal.moved,1000);observe(t,null,normal.brightCover,1100);}
  deskFrames(t,2000);assert.equal(t.snapshot().phase,'locked');
  assert.equal(leaf(t,4000).captureId,undefined);
 }
});
test('capture/session/hash/revision/page pin prevents delayed identity/result crossing',()=>{
 const s=createCaptureSession(),model={templateId:'synthetic',revision:1,pageCount:1},manifest={templateId:'synthetic',revision:1,contentHash:'hash'};
 const a=s.begin(model,manifest,1);assert.equal(s.accepts(a),true);
 const b=s.begin(model,manifest,1);assert.equal(s.accepts(a),false);assert.equal(s.accepts(b),true);
 s.invalidate();assert.equal(s.accepts(b),false);
 const c=s.begin(model,manifest,1);assert.ok(c.sessionId>b.sessionId);assert.ok(c.captureId>b.captureId);
 assert.equal(s.accepts({...c,contentHash:'other'}),false);assert.throws(()=>s.begin(model,manifest,2));
});
function rig(getUserMedia,ua='iPhone AppleWebKit'){
 const target=()=>({addEventListener(){},removeEventListener(){}});
 const video={...target(),videoWidth:1920,videoHeight:1080,paused:false,readyState:2,
  parentElement:{classList:{add(){},remove(){}}},play(){return Promise.resolve();},pause(){}};
 const canvas=()=>({getContext:()=>({drawImage(){}}),width:0,height:0,hidden:true});
 const doc={...target(),hidden:false,querySelectorAll:()=>[],createElement:canvas};
 const win={...target(),requestAnimationFrame:()=>1,cancelAnimationFrame(){},visualViewport:target()};
 const messages=[],states=[];
 const camera=createSafeCamera({video,preview:canvas(),mediaDevices:{getUserMedia},userAgent:ua,window:win,document:doc,
  onCapture(){throw Error('No frame was requested in this lifecycle test.');},onStatus:m=>messages.push(m),onState:s=>states.push(s)});
 return {camera,video,messages,states};
}
function stream(){
 let stops=0,constraints=[];const t={addEventListener(){},stop(){stops++;},getCapabilities:()=>({}),
  getSettings:()=>({width:1920,height:1080}),applyConstraints:async c=>constraints.push(c)};
 return {value:{getTracks:()=>[t],getVideoTracks:()=>[t]},stops:()=>stops,constraints,track:t};
}
test('permission denied is not retried; unsupported controls fail without changing resolution',async()=>{
 let calls=0;const r=rig(async()=>{calls++;throw Object.assign(Error('denied'),{name:'NotAllowedError'});});
 await r.camera.start();assert.equal(calls,1);assert.equal(r.camera.active,false);assert.match(r.messages.at(-1),/Permita/);
 const s=stream(),ok=rig(async()=>s.value);await ok.camera.start();assert.equal(ok.camera.active,true);
 assert.equal(await ok.camera.torch(true),false);assert.equal(s.constraints.length,0);ok.camera.stop();assert.equal(s.stops(),1);
});
test('capture stop/restart releases old tracks; permission response after cancellation is stopped',async()=>{
 const streams=[stream(),stream()];let calls=0;const r=rig(async()=>streams[calls++].value);
 await r.camera.start();r.camera.stop();await r.camera.start();assert.equal(calls,2);
 assert.equal(streams[0].stops(),1);assert.equal(streams[1].stops(),0);r.camera.stop();assert.equal(streams[1].stops(),1);
 let release;const late=stream(),q=rig(()=>new Promise(resolve=>{release=resolve;}));
 const starting=q.camera.start();q.camera.stop();release(late.value);await starting;
 assert.equal(late.stops(),1);assert.equal(q.video.srcObject,null);assert.equal(q.camera.active,false);
});
test('only incompatible native acquisition retries and Safari never renegotiates its track',async()=>{
 const s=stream(),requests=[];s.track.getCapabilities=()=>({focusMode:['continuous'],torch:true});
 const r=rig(async c=>{requests.push(c);if(requests.length===1)throw Object.assign(Error('resolution'),{name:'OverconstrainedError'});return s.value;});
 await r.camera.start();assert.equal(requests.length,2);assert.deepEqual(requests[1],{video:{facingMode:'environment'},audio:false});
 assert.equal(s.constraints.length,0);assert.equal(await r.camera.torch(true),true);
 assert.deepEqual(s.constraints,[{advanced:[{torch:true}]}]);r.camera.stop();
});
test('unsupported optional capabilities never close an otherwise usable native stream',async()=>{
 const s=stream();s.track.getCapabilities=()=>{throw Object.assign(Error('unsupported'),{name:'NotSupportedError'});};
 const r=rig(async()=>s.value,'Chrome AppleWebKit');await r.camera.start();
 assert.equal(r.camera.active,true);assert.equal(await r.camera.torch(true),false);assert.equal(s.stops(),0);r.camera.stop();
});
