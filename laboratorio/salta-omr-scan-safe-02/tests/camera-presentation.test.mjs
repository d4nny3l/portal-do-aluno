import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCameraPresentation} from '../js/camera-presentation.mjs';

function fixture(debug=false,withPreview=false,useVideoFrameCallback=true){
  const video=new EventTarget(),win=new EventTarget(),doc=new EventTarget(),changes=[];
  const input=new EventTarget(),callbacks=new Map(),draws=[],classes=new Set();let nextId=0,now=0,videoFrameRequests=0;
  doc.querySelectorAll=()=>[input];
  win.visualViewport=new EventTarget();Object.assign(win,{innerWidth:390,innerHeight:844});
  Object.assign(doc,{hidden:false});
  const track={readyState:'live',getSettings:()=>({width:1920,height:1080,deviceId:'SECRET',groupId:'SECRET'})};
  const stream={getVideoTracks:()=>[track]};
  Object.assign(video,{videoWidth:1920,videoHeight:1080,srcObject:stream,paused:false,readyState:4,
    getBoundingClientRect:()=>({width:368,height:207}),parentElement:{getBoundingClientRect:()=>({width:370,height:209}),
      classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}},
    plays:0,play(){this.plays++;this.paused=false;return Promise.resolve();}});
  const schedule=cb=>{callbacks.set(++nextId,cb);return nextId;},cancel=id=>callbacks.delete(id);
  Object.assign(win,{requestAnimationFrame:schedule,cancelAnimationFrame:cancel});
  if(useVideoFrameCallback)Object.assign(video,{requestVideoFrameCallback:cb=>{videoFrameRequests++;return schedule(cb);},cancelVideoFrameCallback:cancel});
  const preview=withPreview?{hidden:true,width:0,height:0,getContext:()=>({drawImage:(...args)=>draws.push(args)})}:null;
  const p=createCameraPresentation({video,preview,window:win,document:doc,debug,onDimensionsChanged:d=>changes.push(d)});
  p.start(stream);
  function frame(){const [id,callback]=callbacks.entries().next().value;callbacks.delete(id);now+=40;callback(now);}
  return {p,video,win,doc,changes,stream,input,preview,callbacks,draws,classes,frame,get videoFrameRequests(){return videoFrameRequests;}};
}
test('actual video dimensions drive geometry, never track settings or viewport dimensions',()=>{
  const {p,video,win,changes}=fixture();
  assert.equal(changes.length,1);
  video.videoWidth=1080;video.videoHeight=1920;video.dispatchEvent(new Event('resize'));
  assert.deepEqual(changes[1],{width:1080,height:1920,previous:{width:1920,height:1080}});
  for(const e of ['resize','orientationchange'])win.dispatchEvent(new Event(e));
  win.visualViewport.dispatchEvent(new Event('resize'));
  assert.equal(changes.length,2,'ordinary viewport changes do not reset optical state');
  video.videoWidth=720;video.videoHeight=1280;
  assert.equal(p.sync('frame'),true,'frame guard catches delayed/missing resize event');
  assert.equal(changes.length,3);p.stop();
});
test('missing metadata is transient and cannot replace last valid geometry',()=>{
  const {p,video,changes}=fixture();
  video.videoWidth=video.videoHeight=0;video.dispatchEvent(new Event('resize'));
  assert.equal(changes.length,1);
  video.videoWidth=1920;video.videoHeight=1080;video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(changes.length,1);p.stop();
});
test('late events and foreign streams cannot mutate a closed session',()=>{
  const {p,video,changes}=fixture();
  video.srcObject={};video.videoWidth=720;video.dispatchEvent(new Event('resize'));
  assert.equal(changes.length,1);
  p.stop();video.dispatchEvent(new Event('resize'));p.sync();
  assert.equal(changes.length,1);
});
test('visible return resumes same paused element once, hidden return does not play',async()=>{
  const {p,video,doc,win,stream}=fixture();
  doc.hidden=true;video.paused=true;doc.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();assert.equal(video.plays,0);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));win.dispatchEvent(new Event('pageshow'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(video.plays,1);assert.equal(video.srcObject,stream);p.stop();
});
test('closing during asynchronous resume cannot play old video',async()=>{
  const {p,video,doc}=fixture();video.paused=true;doc.dispatchEvent(new Event('visibilitychange'));p.stop();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(video.plays,0);
});
test('play rejection is handled without reopening the camera',async()=>{
  const {p,video,doc}=fixture(true);video.paused=true;video.play=()=>Promise.reject(Error('suspended'));
  doc.dispatchEvent(new Event('visibilitychange'));await new Promise(resolve=>setImmediate(resolve));
  assert.ok(p.events.some(e=>e.reason==='play-rejected'));p.stop();
});
test('diagnostics are opt-in, bounded and exclude identifiers and image data',()=>{
  const off=fixture();off.win.dispatchEvent(new Event('resize'));assert.equal(off.p.events.length,0);off.p.stop();
  const {p,win}=fixture(true);
  for(let i=0;i<200;i++)win.dispatchEvent(new Event('resize'));
  assert.equal(p.events.length,160);
  assert.doesNotMatch(JSON.stringify(p.events),/SECRET|deviceId|groupId|label|gray|rgba|credential/i);p.stop();
});
test('file change, cancellation and picker focus resume playback without visibilitychange or new dimensions',async()=>{
  const {p,video,input,win,changes,stream}=fixture();
  for(const event of ['change','cancel','focus']){
    input.dispatchEvent(new Event('click'));video.paused=true;
    (event==='focus'?win:input).dispatchEvent(new Event(event));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(video.paused,false,event);assert.equal(video.srcObject,stream);
  }
  assert.equal(video.plays,3);assert.equal(changes.length,1);p.stop();
  video.paused=true;input.dispatchEvent(new Event('change'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(video.plays,3,'closed picker listener removed');
});
test('WebKit presentation copies full native frames, handles source resize and retains last frame during picker interruption',()=>{
  const {p,video,preview,callbacks,draws,classes,frame}=fixture(true,true);
  assert.equal(callbacks.size,1);frame();
  assert.equal(preview.hidden,false);assert.ok(classes.has('canvas-preview'));
  assert.deepEqual(draws[0],[video,0,0,1920,1080]);
  assert.deepEqual([preview.width,preview.height],[1920,1080]);
  video.readyState=0;video.videoWidth=video.videoHeight=0;frame();
  assert.equal(draws.length,1);assert.deepEqual([preview.width,preview.height],[1920,1080],'hold valid frame instead of collapsing');
  Object.assign(video,{readyState:4,videoWidth:720,videoHeight:1280});frame();
  assert.deepEqual(draws[1],[video,0,0,720,1280]);
  assert.deepEqual([preview.width,preview.height],[720,1280]);
  assert.equal(callbacks.size,1,'one presentation subscription, independent of detector');
  p.stop();assert.equal(callbacks.size,0);assert.equal(preview.hidden,true);assert.ok(!classes.has('canvas-preview'));
  assert.deepEqual([preview.width,preview.height],[0,0],'release canvas buffer');
});
test('picker returns coalesce preview subscriptions, and late frames from a closed session cannot paint',async()=>{
  const {p,video,input,callbacks,draws,frame}=fixture(false,true);
  frame();const stale=[...callbacks.values()][0];
  video.paused=true;input.dispatchEvent(new Event('change'));input.dispatchEvent(new Event('cancel'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(callbacks.size,1);assert.equal(video.plays,1);
  p.stop();stale();assert.equal(draws.length,1);assert.equal(callbacks.size,0);
});
test('canvas without video frame callbacks uses one cancellable animation subscription',()=>{
  const {p,callbacks,draws,frame}=fixture(false,true,false);
  frame();assert.equal(draws.length,1);assert.equal(callbacks.size,1);
  p.stop();assert.equal(callbacks.size,0);
});
test('preview advances without waiting for a native video compositor callback',()=>{
  const f=fixture(false,true);
  assert.equal(f.videoFrameRequests,0);
  f.frame();f.frame();assert.equal(f.draws.length,2);
  assert.equal(f.callbacks.size,1);f.p.stop();
});
