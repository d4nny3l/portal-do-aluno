import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_POLICY,cameraConstraints,createPaperTracker,createSafeCamera} from '../camera.mjs';
import {createCaptureSession} from '../session.mjs';
const paper={score:.9,support:.8,corners:[[30,30],[354,30],[354,500],[30,500]]};
const partial={...paper,corners:[[0,0],[354,30],[354,500],[30,500]]};
const scene=n=>({valid:true,energy:.1,edges:Array(264).fill(n)});
function leaf(t,now=0){let r;for(let i=0;i<11;i++)r=t.observe(paper,384,540,scene(0),now+i*66);return r;}
function withdraw(t,now){for(const dt of [0,200,450,700])t.observe(null,384,540,scene(.5),now+dt);}
test('exact frozen parameters and native browser negotiation, no forced aspect ratio',()=>{
 assert.deepEqual(CAMERA_POLICY,{STEADY_FRAMES:10,DET_W:384,LOOP_MS:66,MIN_SCORE:.22,SMOOTH:.45,MAX_SIDE:2600});
 for(const ua of ['iPhone AppleWebKit CriOS','Macintosh AppleWebKit Safari'])assert.equal(cameraConstraints(ua).video.width.ideal,1920);
 assert.equal(cameraConstraints('Chrome AppleWebKit').video.width.ideal,3840);
 assert.equal(cameraConstraints('Chrome').video.aspectRatio,undefined);
});
test('ten stable observations; stationary paper and clock alone never rearm',()=>{
 const t=createPaperTracker();const capture=leaf(t);assert.equal(capture.captureId,1);
 t.finish(1);for(let i=0;i<100;i++)assert.equal(t.observe(paper,384,540,scene(0),i*1000).captureId,undefined);
 for(let i=0;i<100;i++)t.observe(null,384,540,scene(0),i*1000);
 assert.equal(t.snapshot().phase,'locked');
});
test('transient absence, partial paper, slow reader and orientation do not bypass lock',()=>{
 const t=createPaperTracker();leaf(t);
 t.observe(null,384,540,scene(.5),1000);t.observe(null,384,540,scene(.5),1300);
 t.observe(partial,384,540,scene(.5),1400);assert.equal(t.snapshot().phase,'locked');
 withdraw(t,2000);assert.equal(t.snapshot().phase,'vacant');
 assert.equal(t.observe(paper,384,540,scene(0),3000).captureId,undefined);
 assert.equal(t.snapshot().phase,'vacant');t.finish(1);assert.equal(leaf(t,4000).captureId,2);
 t.finish(2);t.resetGeometry();withdraw(t,6000);assert.equal(t.snapshot().phase,'locked','first changed-geometry scene becomes reference, not proof');
});
test('100 sequential cards with proven withdrawals and unique IDs, no arbitrary cap',()=>{
 const t=createPaperTracker();
 for(let i=1;i<=100;i++){
  assert.equal(leaf(t,i*3000).captureId,i);assert.equal(t.finish(i),true);
  withdraw(t,i*3000+800);
 }
 assert.equal(t.snapshot().phase,'vacant');
 assert.equal(leaf(t,400000).captureId,101,'no 100-card retention/capture ceiling');
});
test('slow Worker gap keeps the paper reference; dimension reset never treats an empty desk as paper',()=>{
 const t=createPaperTracker();leaf(t);t.finish(1);
 t.resetGeometry({preserveReference:true});withdraw(t,10000);assert.equal(t.snapshot().phase,'vacant');
 assert.equal(leaf(t,12000).captureId,2);t.finish(2);t.resetGeometry();
 withdraw(t,14000);assert.equal(t.snapshot().phase,'locked');
 t.observe(paper,384,540,scene(0),16000);withdraw(t,17000);assert.equal(t.snapshot().phase,'vacant');
 assert.equal(leaf(t,19000).captureId,3);
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
