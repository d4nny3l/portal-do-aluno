import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCameraPresentation} from '../js/camera-presentation.mjs';

function fixture(debug=false){
  const video=new EventTarget(),win=new EventTarget(),doc=new EventTarget(),changes=[];
  win.visualViewport=new EventTarget();Object.assign(win,{innerWidth:390,innerHeight:844});
  Object.assign(doc,{hidden:false});
  const track={readyState:'live',getSettings:()=>({width:1920,height:1080,deviceId:'SECRET',groupId:'SECRET'})};
  const stream={getVideoTracks:()=>[track]};
  Object.assign(video,{videoWidth:1920,videoHeight:1080,srcObject:stream,paused:false,readyState:4,
    getBoundingClientRect:()=>({width:368,height:207}),parentElement:{getBoundingClientRect:()=>({width:370,height:209})},
    plays:0,play(){this.plays++;this.paused=false;return Promise.resolve();}});
  const p=createCameraPresentation({video,window:win,document:doc,debug,onDimensionsChanged:d=>changes.push(d)});
  p.start(stream);
  return {p,video,win,doc,changes,stream};
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
