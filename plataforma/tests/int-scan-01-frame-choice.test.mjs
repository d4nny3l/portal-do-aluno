import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createSafeCamera,CAMERA_POLICY} from '../../corretor/v2/scan-safe/camera.mjs';
import {processCapture} from '../../corretor/v2/scan-safe/processor.mjs';
import {readRaster} from '../../corretor/v2/omr/reader.mjs';
import {detectFiducials} from '../../corretor/v2/omr/normalize.mjs';
import {CASES,modelFor} from '../../corretor/v2/scan-safe/validation/optical-corpus.mjs';
import {rotate} from '../../laboratorio/salta-omr-scan-safe-02/js/vision.js';
import {addPaperMargin} from '../../laboratorio/salta-omr-scan-safe-02/js/paper-geometry.js';

const target=()=>({addEventListener(){},removeEventListener(){}});
function paperFrame(w,h,{paper=true}={}){
 const data=new Uint8ClampedArray(w*h*4),pw=w*.76,ph=Math.min(h*.88,pw*1.414);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const px=x-w/2,py=y-h/2,inside=paper&&Math.abs(px)<pw/2&&Math.abs(py)<ph/2;
  let v=inside?225:42;
  if(inside&&py>-ph*.35&&py<ph*.35&&Math.floor(py+ph*.35)%24<2&&Math.abs(px)<pw*.25)v=190;
  data.set([v,v,v,255],(y*w+x)*4);
 }
 return data;
}

// Only DOM/decoded-frame scheduling is simulated. EDGE detection, camera
// policy, tracking, native capture and contour projection remain production code.
function harness({nativeWidth=1152,nativeHeight=1620,onCapture=()=>{}}={}){
 let frameCount=0,now=0,rafId=0,fullReads=0,encodes=0;
 const callbacks=new Map(),captures=[],statuses=[],contours=[],draws=[];
 let native=paperFrame(nativeWidth,nativeHeight),present=true;
 const video={...target(),videoWidth:nativeWidth,videoHeight:nativeHeight,readyState:4,paused:false,
  parentElement:{classList:{add(){},remove(){}}},
  play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},
  getVideoPlaybackQuality:()=>({totalVideoFrames:frameCount})};
 const canvas=role=>({width:0,height:0,hidden:true,
  toDataURL(){encodes++;throw Error('Capture must not encode JPEG.');},toBlob(){encodes++;throw Error('Capture must not encode JPEG.');},
  getContext(){return {
   drawImage(source,x,y,w,h){assert.equal(source,video);draws.push({role,x,y,w,h});},
   getImageData(x,y,w,h){
    if(role==='full'){fullReads++;assert.equal(w,nativeWidth);assert.equal(h,nativeHeight);return {data:native};}
    assert.equal(w,CAMERA_POLICY.DET_W);
    return {data:paperFrame(w,h,{paper:present})};
   },
  };},
 });
 let canvases=0;
 const doc={...target(),hidden:false,querySelectorAll:()=>[],createElement:name=>{assert.equal(name,'canvas');return canvas(canvases++===0?'detection':'full');}};
 const win={...target(),visualViewport:target(),requestAnimationFrame:callback=>{callbacks.set(++rafId,callback);return rafId;},cancelAnimationFrame:id=>callbacks.delete(id)};
 const track={...target(),muted:false,stop(){},getCapabilities:()=>({}),getSettings:()=>({width:nativeWidth,height:nativeHeight})};
 const stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
 const camera=createSafeCamera({video,preview:canvas('presentation'),window:win,document:doc,userAgent:'Chrome AppleWebKit',mediaDevices:{getUserMedia:async()=>stream},
  onCapture:payload=>{captures.push(payload);return onCapture(payload);},onStatus:(message,observation)=>statuses.push({message,observation}),
  onContour:(corners,w,h)=>contours.push({corners,w,h})});
 return {camera,captures,statuses,contours,video,draws,
  tick({fresh=true}={}){now+=CAMERA_POLICY.LOOP_MS;if(fresh)frameCount++;const current=[...callbacks.values()];callbacks.clear();for(const callback of current)callback(now);},
  setNative:data=>{native=data;},present:value=>{present=value;},
  get native(){return native;},get fullReads(){return fullReads;},get encodes(){return encodes;}};
}
async function settle(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}

test('INT-SCAN-01: ten stable decoded observations produce one native frame, projected corners and external margin without JPEG',async()=>{
 const h=harness();await h.camera.start();
 try{
  for(let i=0;i<CAMERA_POLICY.STEADY_FRAMES;i++){h.tick();assert.equal(h.captures.length,0);}
  h.tick();await settle();
  assert.equal(h.captures.length,1);assert.equal(h.fullReads,1);assert.equal(h.encodes,0);
  const capture=h.captures[0],last=h.contours.filter(c=>c.corners).at(-1);
  assert.equal(capture.data,h.native,'final native pixels are used, never the 384 px detector raster');
  assert.deepEqual([capture.w,capture.h],[1152,1620]);assert.equal(capture.data.length,1152*1620*4);
  assert.equal(last.w,384);assert.equal(last.h,540);
  const projected=last.corners.map(([x,y])=>[x*capture.w/last.w,y*capture.h/last.h]);
  assert.deepEqual(capture.corners,addPaperMargin(projected,capture.w,capture.h));
  for(let i=0;i<4;i++){
   const c=capture.corners[i],p=projected[i];
   assert.ok(Math.hypot(c[0]-capture.w/2,c[1]-capture.h/2)>Math.hypot(p[0]-capture.w/2,p[1]-capture.h/2),'margin expands outward rather than cropping inside paper');
  }
  assert.deepEqual(h.draws.filter(d=>d.role==='full'),[{role:'full',x:0,y:0,w:1152,h:1620}]);
  // #140 intentionally rearms after the operation, even on the same sheet.
  for(let i=0;i<20;i++)h.tick();await settle();
  assert.equal(h.fullReads,2,'each completed stable cycle takes exactly one native frame');
  assert.equal(h.captures.length,2);assert.equal(h.encodes,0);
 }finally{h.camera.stop();}
});

test('INT-SCAN-01: repeated decoded frame cannot supply stability and missing paper cannot trigger native capture',async()=>{
 const h=harness();await h.camera.start();
 try{
  h.tick();for(let i=0;i<20;i++)h.tick({fresh:false});
  assert.equal(h.fullReads,0,'elapsed time cannot turn one decoded preview into ten observations');
  h.present(false);for(let i=0;i<15;i++)h.tick();
  assert.equal(h.captures.length,0);
  h.present(true);for(let i=0;i<11;i++)h.tick();await settle();
  assert.equal(h.captures.length,1);
 }finally{h.camera.stop();}
});

const spec=CASES.find(c=>c.id==='moderate-A'),model=modelFor(spec);
const fixture=new Uint8ClampedArray(gunzipSync(readFileSync(new URL('../../corretor/v2/scan-safe/validation/moderate-A.rgba.gz',import.meta.url))));
const fixtureWidth=900,fixtureHeight=fixture.length/(fixtureWidth*4);
function payload(data,w,h,captureId=1){return {data,w,h,corners:[[0,0],[w,0],[w,h],[0,h]],...model,page:1,showCode:true,
 token:{captureId,sessionId:1,templateId:model.template.templateId,templateRevision:model.template.revision,contentHash:model.manifest.contentHash,page:1}};}

test('INT-SCAN-01: one production processor reads the real final raster in portrait and rotated landscape',()=>{
 let reads=0;
 const dependencies={read:(...args)=>{reads++;return readRaster(...args);}};
 for(const quarterTurns of [0,1]){
  const rotated=rotate(fixture,fixtureWidth,fixtureHeight,quarterTurns);
  const result=processCapture(payload(rotated.data,rotated.w,rotated.h,quarterTurns+1),dependencies);
  assert.equal(result.error,undefined);assert.equal(result.metrics.readCalls,1);
  assert.equal(result.reading.contentHash,model.manifest.contentHash);
  assert.equal(result.reading.identity.code,'0001123');
  assert.equal(result.reading.observations[0].answer,'A');
 }
 assert.equal(reads,2,'exactly one real reader call per final photo; no second path');
});

test('INT-SCAN-01: a malformed three-corner detector result is rejected before reading and a valid photo recovers',()=>{
 let reads=0;const dependencies={read:(...args)=>{reads++;return readRaster(...args);}};
 // Explicit fault injection at the detector contract; raster/warp/reader remain real.
 const rejected=processCapture(payload(fixture,fixtureWidth,fixtureHeight),{...dependencies,detect:(...args)=>{
  const actual=detectFiducials(...args);assert.equal(actual.found,true);
  return {...actual,corners:actual.corners.slice(0,3)};
 }});
 assert.equal(rejected.error?.code,'FIDUCIALS_NOT_FOUND');assert.equal(rejected.reading,null);
 assert.equal(rejected.metrics.readCalls,0);assert.equal(reads,0);
 const recovered=processCapture(payload(fixture,fixtureWidth,fixtureHeight,2),dependencies);
 assert.equal(recovered.error,undefined);assert.equal(recovered.metrics.readCalls,1);assert.equal(reads,1);
 assert.equal(recovered.reading.contentHash,model.manifest.contentHash);assert.equal(recovered.reading.observations[0].answer,'A');
});

test('INT-SCAN-01 regression: erased A4 marker cannot be replaced by print; zero read and no grade',()=>{
 const missing=fixture.slice();
 // Exact original contraprova, not a new artificial failure.
 for(let y=15;y<55;y++)for(let x=15;x<55;x++)missing.set([255,255,255,255],(y*fixtureWidth+x)*4);
 let legacy,reads=0;
 const result=processCapture(payload(missing,fixtureWidth,fixtureHeight),{
  detect:(gray,w,h,options)=>{
   legacy=detectFiducials(gray,w,h,{manifest:options.manifest});
   return detectFiducials(gray,w,h,options);
  },
  read:(...args)=>{reads++;return readRaster(...args);},
 });
 assert.equal(legacy.found,true);assert.equal(legacy.corners.length,4);
 assert.ok(Math.hypot(legacy.corners[0].x-8*fixtureWidth/210,legacy.corners[0].y-8*fixtureHeight/297)>100,'historical path substitutes print');
 assert.ok(['FIDUCIALS_NOT_FOUND','FIDUCIALS_INVALID'].includes(result.error?.code));
 assert.equal(reads,0);assert.equal(result.metrics.readCalls,0);assert.equal(result.reading,null);
});

test('INT-SCAN-01: sharp preview never replaces an unusable final photo; #140 may retry a new stable cycle',async()=>{
 let reads=0;
 const h=harness({onCapture:photo=>{
  const result=processCapture({...payload(photo.data,photo.w,photo.h),corners:photo.corners},{read:(...args)=>{reads++;return readRaster(...args);}});
  assert.equal(result.error?.code,'FIDUCIALS_NOT_FOUND');assert.equal(result.reading,null);assert.equal(result.metrics.readCalls,0);
  throw Error(result.error.message);
 }});
 // Final-frame defocus/overexposure erased optical detail; earlier low-resolution
 // observations still show a sheet. The preview must never rescue this photo.
 const unusable=new Uint8ClampedArray(1152*1620*4).fill(255);h.setNative(unusable);
 await h.camera.start();
 try{
  for(let i=0;i<11;i++)h.tick();await settle();
  assert.equal(h.captures.length,1);assert.equal(h.captures[0].data,unusable);assert.equal(reads,0);
  for(let i=0;i<20;i++)h.tick();await settle();
  assert.equal(h.fullReads,2,'#140 permits a fresh stable cycle after failure');
  assert.equal(h.captures.length,2);assert.equal(reads,0,'unusable full rasters cannot become optical reads');
  assert.match(h.statuses.map(s=>s.message).join('\n'),/Marcadores insuficientes/);
 }finally{h.camera.stop();}
});
