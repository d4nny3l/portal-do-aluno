import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFramePoints,frameSize,drawVideoFrame,containMapping,guidePoints,CameraSession,cameraRank,cameraControls,applyCameraControl,captureQuality,motionBetween,cameraZoomSnapshot,reduceUnwantedCameraZoom} from '../omr/camera.mjs';

const resolutions=[[1920,1080],[1080,1920],[4032,3024],[3024,4032],[640,480],[480,640],[1280,720],[720,1280]];
test('whole-video conversion uses intrinsic orientation and a longest-edge cap, never CSS or crop',()=>{
 for(const [videoWidth,videoHeight] of resolutions)for(const limit of [900,1800]){
  const video={videoWidth,videoHeight,width:500,height:500};let drawn;
  const canvas={getContext(){return {drawImage(...args){drawn=args},getImageData(){return {data:new Uint8Array(canvas.width*canvas.height*4).fill(255)}}}}};
  const result=drawVideoFrame(video,canvas,limit);
  assert.ok(Math.max(result.width,result.height)<=limit);
  assert.ok(Math.abs(result.width/videoWidth-result.height/videoHeight)<1/Math.min(videoWidth,videoHeight));
  assert.deepEqual(drawn,[video,0,0,result.width,result.height]);assert.equal(result.gray.length,result.width*result.height);assert.equal(result.gray[0],255);
 }
 assert.throws(()=>frameSize(0,0),/iniciando/);
});
test('guides map exactly through letterboxing in both orientations without adding offsets twice',()=>{
 for(const [w,h] of resolutions)for(const [bw,bh] of [[660,600],[358,500],[900,300]]){
  const map=containMapping(w,h,bw,bh),points=guidePoints(w,h).map(map.project);
  assert.ok(Math.abs((points[0].x+points[1].x)/2-bw/2)<1e-8);
  assert.ok(Math.abs((points[0].y+points[3].y)/2-bh/2)<1e-8);
  for(const p of [{x:0,y:0},{x:w,y:h},...guidePoints(w,h)]){const q=map.project(p);assert.ok(Math.abs((q.x-map.x)/map.scale-p.x)<1e-8);assert.ok(Math.abs((q.y-map.y)/map.scale-p.y)<1e-8)}
 }
 const points=guidePoints(1920,1080).map(containMapping(1920,1080,660,600).project);
 assert.ok(Math.abs(points[0].y-145.45)<1e-8);
});
function fakeTrack(label='Back Camera',settings={deviceId:'main',width:1920,height:1440},capabilities={}){
 return {label,stopped:0,constraints:[],stop(){this.stopped++},getSettings:()=>settings,getCapabilities:()=>capabilities,async applyConstraints(c){this.constraints.push(c)}};
}
const streamFor=track=>({getVideoTracks:()=>[track],getTracks:()=>[track]});
test('camera selection prefers labeled rear main to ultrawide, negotiates native frames and releases devices',async()=>{
 const ultra=fakeTrack('Back Ultra Wide Camera',{deviceId:'ultra'}),main=fakeTrack('Back Camera',undefined,{width:{max:4032},height:{max:3024},resizeMode:['none','crop-and-scale']});let calls=[];
 const session=new CameraSession({async getUserMedia(options){calls.push(options);return streamFor(calls.length===1?ultra:main)},async enumerateDevices(){return [{kind:'videoinput',deviceId:'ultra',label:ultra.label},{kind:'videoinput',deviceId:'main',label:main.label}]}});
 const result=await session.open();assert.equal(result.track,main);assert.equal(ultra.stopped,1);assert.equal(calls[0].audio,false);assert.equal(calls[0].video.width,undefined);assert.deepEqual(calls[1].video,{deviceId:{exact:'main'}});
 assert.deepEqual(main.constraints[0],{width:{ideal:2560},height:{ideal:2560},resizeMode:{exact:'none'}});
 session.stop();assert.equal(main.stopped,1);assert.equal(session.stream,null);assert.ok(cameraRank('rear ultra wide')<cameraRank('Back Wide Angle Camera'));assert.ok(cameraRank('Back Triple Camera')<cameraRank('Back Camera'));assert.ok(cameraRank('Câmera grande-angular traseira')>cameraRank('Câmera ultra-angular traseira'));
});
test('denied permission and unavailable APIs fail explicitly; unsupported capabilities still open; restart releases prior track',async()=>{
 await assert.rejects(new CameraSession({getUserMedia:async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'})}}).open(),{name:'NotAllowedError'});
 await assert.rejects(new CameraSession({}).open(),/não oferece/);
 const tracks=[];const session=new CameraSession({getUserMedia:async()=>{const t=fakeTrack();delete t.getCapabilities;delete t.applyConstraints;tracks.push(t);return streamFor(t)}});
 await session.open();await session.open();assert.equal(tracks[0].stopped,1);session.stop();assert.equal(tracks[1].stopped,1);
});
test('stop during a pending permission request releases late stream; stale request cannot stop a newer camera',async()=>{
 let resolve;const late=fakeTrack(),next=fakeTrack();let n=0;
 const session=new CameraSession({getUserMedia:()=>++n===1?new Promise(r=>resolve=r):Promise.resolve(streamFor(next))});
 const pending=session.open();session.stop();await session.open('next');resolve(streamFor(late));await assert.rejects(pending,/cancelada/);assert.equal(late.stopped,1);assert.equal(next.stopped,0);session.stop();
});
test('only supported controls with valid ranges can be applied; failure preserves capture fallback',async()=>{
 const track=fakeTrack('Camera',{}, {zoom:{min:1,max:3,step:.1},torch:true,focusMode:['continuous']});
 assert.deepEqual(Object.keys(cameraControls({})),[]);assert.equal(await applyCameraControl(track,'zoom',4),false);assert.equal(await applyCameraControl(track,'zoom',1),true);
 assert.equal(await applyCameraControl(track,'exposureCompensation',1),false);assert.equal(await applyCameraControl(track,'torch',true),true);assert.equal(await applyCameraControl(track,'focusMode','continuous'),true);
 track.applyConstraints=async()=>{throw Error('unsupported')};assert.equal(await applyCameraControl(track,'torch',false),false);
});
function qualityFixture(value=245){const width=420,height=594,gray=new Uint8Array(width*height).fill(value);for(let y=70;y<530;y+=20)for(let x=70;x<350;x+=20)for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)gray[(y+dy)*width+x+dx]=15;return {gray,width,height}}
const detection={found:true,confidence:.95,corners:[{x:16,y:16},{x:404,y:16},{x:404,y:578},{x:16,y:578}]};
test('auto capture needs lighting, detail, framing and stability beyond four markers; manual is independent',()=>{
 const frame=qualityFixture();assert.equal(captureQuality(frame,detection).ok,false);assert.equal(captureQuality(frame,detection,frame).ok,true);
 assert.match(captureQuality(qualityFixture(50),detection,frame).message,/iluminação/);
 const flat={...frame,gray:new Uint8Array(frame.gray.length).fill(240)};assert.equal(captureQuality(flat,detection,flat).ok,false);
 assert.match(captureQuality(frame,{...detection,corners:detection.corners.map(p=>({x:p.x*.3+100,y:p.y*.3+150}))},frame).message,/Aproxime/);
 assert.match(captureQuality(frame,{...detection,corners:detection.corners.map(p=>({...p,x:p.x-15}))},frame).message,/Centralize/);
 assert.equal(motionBetween(frame,{...frame,width:594,height:420}),Infinity);
 assert.match(captureQuality(frame,detection,{...frame,gray:new Uint8Array(frame.gray.length).fill(20)}).message,/firmemente/);
 const glare=qualityFixture(70);for(let y=20;y<280;y++)for(let x=20;x<200;x++)glare.gray[y*glare.width+x]=255;
 assert.match(captureQuality(glare,detection,glare).message,/reflexos/);
});

test('capture maps the SAME preview markers and refuses an intervening device rotation',()=>{
 const points=[{x:8,y:8},{x:628,y:8},{x:628,y:892},{x:8,y:892}];
 assert.deepEqual(mapFramePoints(points,{width:636,height:900},{width:1272,height:1800}),points.map(p=>({x:p.x*2,y:p.y*2})));
 assert.throws(()=>mapFramePoints(points,{width:636,height:900},{width:1800,height:1272}),/orientação mudou/);
});

test('capability negotiation failure keeps the original stream usable',async()=>{
 const track=fakeTrack('Camera',{}, {width:{max:4096},height:{max:3072},resizeMode:['none']});track.applyConstraints=async()=>{throw Error('not supported')};
 const session=new CameraSession({getUserMedia:async()=>streamFor(track)});const result=await session.open();assert.equal(result.track,track);assert.equal(track.stopped,0);session.stop();
});


test('native zoom: reduce only verified amplification to actual supported min, never assume 1x',async()=>{
 let current=2.5,constrained=null;
 const track={
  getCapabilities:()=>({zoom:{min:.5,max:5,step:.1}}),
  getSettings:()=>({zoom:current,facingMode:'environment',resizeMode:'none'}),
  getConstraints:()=>({zoom:constrained}),
  async applyConstraints(payload){constrained=payload.advanced[0].zoom;current=constrained}
 };
 const before=cameraZoomSnapshot(track);
 assert.equal(before.current,2.5);assert.equal(before.min,.5);
 const result=await reduceUnwantedCameraZoom(track);
 assert.equal(result.attempted,true);assert.equal(result.applied,true);
 assert.equal(result.after.current,.5);
 assert.equal(result.after.constraint,.5);
 assert.equal(current,.5);
 const again=await reduceUnwantedCameraZoom(track);
 assert.equal(again.attempted,false);
});

test('native zoom unsupported, unreported or rejected stays unchanged with safe fallback',async()=>{
 const noCapabilities={getSettings:()=>({zoom:3})};
 assert.equal((await reduceUnwantedCameraZoom(noCapabilities)).attempted,false);
 const unknown={getCapabilities:()=>({zoom:{min:1.3,max:4}}),getSettings:()=>({})};
 assert.equal((await reduceUnwantedCameraZoom(unknown)).attempted,false);
 const blocked={getCapabilities:()=>({zoom:{min:1.3,max:4}}),getSettings:()=>({zoom:2.4}),async applyConstraints(){throw Error('unsupported')}};
 const result=await reduceUnwantedCameraZoom(blocked);
 assert.equal(result.attempted,true);assert.equal(result.applied,false);
 assert.equal(result.after.current,2.4);
 const ignored={getCapabilities:()=>({zoom:{min:1,max:3}}),getSettings:()=>({zoom:2}),async applyConstraints(){}};
 assert.equal((await reduceUnwantedCameraZoom(ignored)).applied,false,'do not claim success when browser ignores constraint');
});

test('rear camera is mandatory on default request and front camera is rejected',async()=>{
 let video;const front=fakeTrack('Front Camera',{deviceId:'front',facingMode:'user'});
 const session=new CameraSession({async getUserMedia(args){video=args.video;return streamFor(front)},async enumerateDevices(){return [{kind:'videoinput',label:'Front Camera',deviceId:'front'}]}});
 await assert.rejects(session.open(),/traseira/);
 assert.equal(video.facingMode.exact,'environment');
 assert.equal(front.stopped,1);
});

test('camera preference: main rear zoom calibration is independent of drawVideoFrame bitmap',async()=>{
 const ultra=fakeTrack('Back Ultra Wide Camera',{deviceId:'ultra',facingMode:'environment'});
 let zoom=2.1;
 const main=fakeTrack('Back Camera',{deviceId:'main',facingMode:'environment',zoom},{zoom:{min:1.2,max:4},width:{max:4096},height:{max:3072}});
 main.getSettings=()=>({deviceId:'main',facingMode:'environment',zoom,width:1920,height:1440});
 main.applyConstraints=async request=>{
  main.constraints.push(request);
  if(request.advanced?.[0]?.zoom!==undefined)zoom=request.advanced[0].zoom;
 };
 const session=new CameraSession({
  async getUserMedia(args){return streamFor(args.video.deviceId?.exact?main:ultra)},
  async enumerateDevices(){return [{kind:'videoinput',deviceId:'ultra',label:ultra.label},{kind:'videoinput',deviceId:'main',label:main.label}]}
 });
 const result=await session.open();
 assert.equal(result.track,main);
 assert.equal(result.zoom.applied,true);
 assert.equal(zoom,1.2);
 assert.equal(ultra.stopped,1);
 session.stop();
});
