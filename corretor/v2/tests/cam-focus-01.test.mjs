import test from 'node:test';
import assert from 'node:assert/strict';
import {captureQuality,markerCorePixels,CameraSession,applyCameraControl,requestContinuousFocus} from '../omr/camera.mjs';

// Pixel-only synthetic fixtures: the same quadrilateral is checked against the
// previous 18% occupancy rule and the new effective-resolution path.
function card(width,height,w,h,marker){
 const gray=new Uint8Array(width*height).fill(215),x=Math.floor((width-w)/2),y=Math.floor((height-h)/2);
 const fill=(left,top,ww,hh,value)=>{
  for(let j=top;j<top+hh;j++)gray.fill(value,j*width+left,j*width+left+ww);
 };
 fill(x-10,y-10,w+21,h+21,245);
 for(let j=y+15;j<y+h-15;j+=15)for(let i=x+15;i<x+w-15;i+=15)fill(i,j,5,5,15);
 const corners=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 for(const p of corners)fill(p.x-Math.floor(marker/2),p.y-Math.floor(marker/2),marker,marker,10);
 return {frame:{gray,width,height},detection:{found:true,confidence:.95,corners}};
}
function blur(frame,radius){
 const {gray,width,height}=frame,temp=new Float64Array(gray.length),out=new Uint8Array(gray.length);
 for(let y=0;y<height;y++){
  let sum=0;for(let k=-radius;k<=radius;k++)sum+=gray[y*width+Math.max(0,k)];
  for(let x=0;x<width;x++){temp[y*width+x]=sum/(2*radius+1);sum+=gray[y*width+Math.min(width-1,x+radius+1)]-gray[y*width+Math.max(0,x-radius)];}
 }
 for(let x=0;x<width;x++){
  let sum=0;for(let k=-radius;k<=radius;k++)sum+=temp[Math.max(0,k)*width+x];
  for(let y=0;y<height;y++){out[y*width+x]=Math.round(sum/(2*radius+1));sum+=temp[Math.min(height-1,y+radius+1)*width+x]-temp[Math.max(0,y-radius)*width+x];}
 }
 return {...frame,gray:out};
}
test('CAM-FOCUS-01 same pixels: sharp distant A4 passes only with real final resolution and marker detail',()=>{
 const {frame,detection}=card(600,900,210,300,6);
 const q=captureQuality(frame,detection,frame,{captureSize:{width:1200,height:1800}});
 assert.ok(q.area<.18&&q.area>=.08,'legacy area gate rejected this exact frame');
 assert.equal(q.ok,true,JSON.stringify(q));
 assert.equal(q.effectiveEdge,420);
 assert.equal(markerCorePixels(frame,detection.corners),6);
 assert.equal(captureQuality(frame,detection,frame).ok,false,'no native resolution, no exception');
 const full=card(1200,1800,420,600,12);
 assert.equal(captureQuality(full.frame,full.detection,full.frame).ok,true);
});
test('CAM-FOCUS-01 near blurred sheet rejected; ideal sheet stays eligible',()=>{
 const {frame,detection}=card(600,900,420,600,12);
 assert.equal(captureQuality(frame,detection,frame).ok,true);
 const defocused=blur(frame,10);
 const q=captureQuality(defocused,detection,defocused);
 assert.equal(q.ok,false);
 assert.match(q.message,/foco/);
});
test('CAM-FOCUS-01 reduced embedded synthetic ratios: detail required; no bypass on motion or missing markers',()=>{
 for(const [w,h] of [[200,320],[210,315],[220,293]]){
  const {frame,detection}=card(600,900,w,h,8);
  const opt={captureSize:{width:1200,height:1800}};
  assert.equal(captureQuality(frame,detection,frame,opt).ok,true);
  assert.equal(captureQuality(frame,detection,null,opt).ok,false);
  assert.equal(captureQuality(frame,{...detection,found:false},frame,opt).ok,false);
  const weak=card(600,900,w,h,2);
  assert.equal(captureQuality(weak.frame,weak.detection,weak.frame,opt).ok,false);
 }
});
test('CAM-FOCUS-01 native focus capability, ignored constraint and unsupported browser',async()=>{
 const make=(supported,mode)=>({label:'Back Camera',calls:[],stop(){},getSettings:()=>({facingMode:'environment',focusMode:mode}),getCapabilities:()=>supported?{focusMode:['continuous']}: {},async applyConstraints(c){this.calls.push(c)}});
 for(const supported of [true,false]){
  const track=make(supported,undefined);
  const session=new CameraSession({getUserMedia:async()=>({getVideoTracks:()=>[track],getTracks:()=>[track]})});
  await session.open();
  assert.equal(track.calls.some(c=>c.advanced?.[0]?.focusMode==='continuous'),supported);
  session.stop();
 }
 assert.equal(await applyCameraControl(make(true,'manual'),'focusMode','continuous'),false);
});

test('CAM-FOCUS-01 optional focus constraint timeout leaves a usable fallback',async()=>{
 const track={getCapabilities:()=>({focusMode:['continuous']}),applyConstraints:()=>new Promise(()=>{})};
 assert.equal(await requestContinuousFocus(track,5),false);
});
