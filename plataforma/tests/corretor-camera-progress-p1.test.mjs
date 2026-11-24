import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const lines=html.split('\n');
function one(prefix){const found=lines.filter(l=>l.startsWith(prefix));assert.equal(found.length,1,prefix);return found[0]}
const code=[one('function setCameraProgress('),one('function showCameraGrade('),one('function markLastReadingPending('),
 html.slice(html.indexOf('function scanCameraFrame(){'),html.indexOf('function updateCameraInfo(){'))].join('\n');

function setup({fail=false,inconclusive=false}={}){
 const elements=new Map();
 const $=id=>{if(!elements.has(id))elements.set(id,{id,hidden:false,dataset:{},textContent:'',innerHTML:'',checked:false});return elements.get(id)};
 const corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
 const frame={gray:new Uint8Array(900*1000).fill(220),width:900,height:1000};
 let found=true, count=0, failure=fail;
 Object.assign($('video'),{videoWidth:900,videoHeight:1000,readyState:4});
 $('scanScore').hidden=false;$('scanScore').innerHTML='<strong>Nota final 10,00</strong>';$('scanScore').dataset.review='false';
 const state={
  $,cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',stableFrames:0,previousCorners:null,
  previousCameraFrame:null,waitingForRemoval:false,absentFrames:0,lastCaptureAt:0,captureBusy:false,
  drawVideoFrame:()=>frame,detectFiducials:()=>found?{found:true,confidence:.96,corners}:{found:false,corners:[]},
  captureQuality:()=>({ok:true,message:'Folha estável.'}),samePosition:()=>true,
  positionGuides(){},updateCameraInfo(){},setScanMessage(){},captureFrameGray:()=>frame,
  mapFramePoints:x=>x,
  prepareImage(){count++;if(failure)return null;$('scanScore').dataset.review=inconclusive?'true':'false';return frame;}
 };
 vm.createContext(state);vm.runInContext(code,state,{timeout:3000});
 return {state,$,hide:()=>{found=false},show:()=>{found=true},fail:v=>{failure=v},count:()=>count};
}
test('camera indicators reflect stable, real consolidation and recognized card; reset on removal',()=>{
 const h=setup(),s=h.state;
 s.scanCameraFrame();
 assert.equal(h.$('cameraStableStatus').hidden,true);
 assert.equal(h.$('cameraCaptureStatus').hidden,true);
 s.scanCameraFrame();
 assert.equal(h.count(),1);
 for(const id of ['cameraStableStatus','cameraCaptureStatus','cameraReadStatus'])assert.equal(h.$(id).hidden,false,id);
 assert.match(h.$('cameraLiveBadge').textContent,/Aguardando retirada da folha/);
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),1,'no duplicate while sheet present');
 h.hide();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(s.waitingForRemoval,true,'two missing markers must not release the previous sheet');
 s.scanCameraFrame();
 for(const id of ['cameraStableStatus','cameraCaptureStatus','cameraReadStatus'])assert.equal(h.$(id).hidden,true,id);
 h.show();s.lastCaptureAt=0;
 s.scanCameraFrame();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),2);
});
test('failed normalization cannot claim consolidated or recognized; stale score is explicitly labeled',()=>{
 const h=setup({fail:true}),s=h.state;
 s.scanCameraFrame();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),1);assert.equal(s.waitingForRemoval,false);
 assert.equal(h.$('cameraCaptureStatus').hidden,true);
 assert.equal(h.$('cameraReadStatus').hidden,true);
 assert.match(h.$('scanScore').innerHTML,/Última leitura bem-sucedida/);
 assert.equal(h.$('scanScore').dataset.stale,'true');
 assert.equal(h.$('cameraGrade').hidden,true);
 h.fail(false);s.lastCaptureAt=0;
 s.scanCameraFrame();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),2);
 assert.equal(h.$('cameraReadStatus').hidden,false);
});
test('optically inconclusive read cannot claim card recognized even when normalization succeeded',()=>{
 const h=setup({inconclusive:true});
 h.state.scanCameraFrame();h.state.scanCameraFrame();h.state.scanCameraFrame();
 assert.equal(h.$('cameraStableStatus').hidden,false);
 assert.equal(h.$('cameraCaptureStatus').hidden,false);
 assert.equal(h.$('cameraReadStatus').hidden,true);
});


test('CAM-114: one missing fiducial frame does not erase stable corner reference or permit capture',()=>{
 const h=setup(),s=h.state;
 s.scanCameraFrame();
 assert.equal(s.stableFrames,1);
 h.hide();s.scanCameraFrame();
 assert.equal(s.stableFrames,0);
 assert.equal(s.previousCorners?.corners.length,4,'preserve reference through one optical dropout');
 assert.equal(h.count(),0);
 h.show();s.scanCameraFrame();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),1,'two new valid frames permit capture while keeping final optical checks');
});

function captureFrameHarness(){
 const preview={gray:new Uint8Array([1]),width:900,height:1000};
 const capture={gray:new Uint8Array([2]),width:900,height:1000};
 const corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
 const elements=new Map(), messages=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,dataset:{},textContent:'',checked:false});return elements.get(id)};
 Object.assign($('video'),{videoWidth:900,videoHeight:1000,readyState:4});
 let offset=75,missing=false,blurred=false,calls=0,manualCorners;
 const state={$,cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',stableFrames:0,
  previousCorners:null,previousCameraFrame:null,waitingForRemoval:false,absentFrames:0,lastCaptureAt:0,captureBusy:false,
  drawVideoFrame:()=>preview,detectFiducials:(gray)=>gray===capture.gray
   ?missing?{found:false,confidence:0,corners:[]}:{found:true,confidence:.98,corners:corners.map(p=>({x:p.x+offset,y:p.y}))}
   :{found:true,confidence:.96,corners},
  captureQuality:frame=>frame===capture&&blurred?({ok:false,message:'Aguarde o foco.'}):({ok:true,message:'Folha estável.'}),samePosition:()=>true,
  positionGuides(){},updateCameraInfo(){},setScanMessage(message){messages.push(message)},captureFrameGray:()=>capture,
  mapFramePoints:(points,source,target)=>{if(Math.abs(source.width/source.height-target.width/target.height)>.005)throw new Error('Orientação alterada');return points.map(p=>({x:p.x*target.width/source.width,y:p.y*target.height/source.height}))},
  prepareImage(gray,width,height,options){calls++;manualCorners=options.manualCorners;return {gray,width,height}},
 };
 vm.createContext(state);vm.runInContext(code,state,{timeout:3000});
 return {state,messages,capture,offset:v=>offset=v,missing:v=>missing=v,blurred:v=>blurred=v,calls:()=>calls,corners:()=>manualCorners};
}

test('CAM-114: final image moving relative to preview is rejected, then a matching capture recovers',()=>{
 const h=captureFrameHarness(),s=h.state;
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.calls(),0,'drift must not send preview corners into the final capture');
 assert.equal(s.waitingForRemoval,false);
 assert.equal(s.captureBusy,false);
 assert.match(h.messages.at(-1),/folha se moveu/);
 h.offset(7);s.lastCaptureAt=0;
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.calls(),1);
 assert.equal(h.corners()[0].x,107,'normalize using corners measured from captured pixels');
 assert.equal(s.waitingForRemoval,true);
});

test('CAM-114: missing fiducials in captured frame fail safely, then retry without manual intervention',()=>{
 const h=captureFrameHarness(),s=h.state;
 h.missing(true);
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.calls(),0);
 assert.equal(s.waitingForRemoval,false);
 assert.match(h.messages.at(-1),/Marcadores instáveis/);
 h.missing(false);h.offset(0);s.lastCaptureAt=0;
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.calls(),1);
});

test('CAM-114: orientation changes between preview and capture never reach perspective correction',()=>{
 const h=captureFrameHarness(),s=h.state;
 h.capture.width=1000;h.capture.height=900;
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.calls(),0);
 assert.equal(s.waitingForRemoval,false);
 assert.match(h.messages.at(-1),/Orientação alterada/);
});

test('CAM-FOCUS-01: sharp preview cannot authorize a blurred final capture; retry succeeds',()=>{
 const h=captureFrameHarness(),s=h.state;
 h.offset(0);h.blurred(true);
 for(let i=0;i<2;i++)s.scanCameraFrame();
 assert.equal(h.calls(),0);
 assert.equal(s.waitingForRemoval,false);
 assert.equal(s.captureBusy,false);
 assert.match(h.messages.at(-1),/foco/);
 h.blurred(false);s.lastCaptureAt=0;
 for(let i=0;i<2;i++)s.scanCameraFrame();
 assert.equal(h.calls(),1);
 assert.equal(s.waitingForRemoval,true);
});
