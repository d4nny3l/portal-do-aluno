import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../corretor-v2.css',import.meta.url),'utf8');
const lines=html.split('\n');
function productionLine(prefix){
 const found=lines.filter(line=>line.startsWith(prefix));
 assert.equal(found.length,1,'production handler '+prefix);
 return found[0];
}
const source=[productionLine('function syncTorchButton('),
 productionLine("function stopCamera(){"),
 productionLine("$('cameraTorchButton').onclick=")].join('\n');

function harness(){
 const els=new Map(),calls=[],messages=[];
 function el(id){
  if(!els.has(id)){
   const attrs=new Map();
   els.set(id,{id,hidden:false,disabled:false,checked:false,dataset:{},style:{removeProperty(){}},
    setAttribute(k,v){attrs.set(k,String(v))},getAttribute(k){return attrs.get(k)??null},
    pause(){this.paused=true}});
  }
  return els.get(id);
 }
 const track={};
 const stream={getVideoTracks:()=>[track]};
 let stopped=0;
 const state={
  $:el,cameraStream:stream,cameraUiGeneration:0,cameraOpening:false,cameraTimer:null,safariCameraResyncTimer:null,safariCameraViewport:null,
  stableFrames:2,previousCameraFrame:{},previousCorners:{},waitingForRemoval:true,absentFrames:1,
  cameraFrameDimensions:'portrait',captureBusy:false,cameraSession:{stop(){stopped++}},
  clearGuides(){},updateCameraInfo(){},setScanMessage(m){messages.push(m)},
  clearInterval(){},clearTimeout(){},applyCameraControl:async(t,name,value)=>{calls.push({track:t,name,value});return true}
 };
 vm.createContext(state);
 vm.runInContext(source,state,{timeout:2000});
 return {state,el,calls,messages,getStopped:()=>stopped,track,stream};
}

test('no unprotected bank-test link or visible alignment/settings; real lamp control is a button',()=>{
 assert.doesNotMatch(html,/id="bankTestEntry"|Abrir Banco de Avaliações — testes protegidos/);
 assert.match(html,/<button id="manualAlign"[^>]*hidden[^>]*aria-hidden="true"/);
 assert.match(html,/<details class="camera-settings" hidden inert aria-hidden="true">/);
 assert.match(css,/\.scan-actions \[data-internal-control\],\.camera-settings\[hidden\]\{display:none!important\}/);
 assert.match(html,/<button id="cameraTorchButton"[^>]*hidden disabled aria-pressed="false" aria-label="Ligar iluminação da câmera"/);
 assert.match(html,/id="cameraTorchButton"[^>]*>\s*<span aria-hidden="true">💡<\/span> Luz/);
 assert.match(html,/syncTorchButton\(Boolean\(controls\.torch\),Boolean\(settings\.torch\)\)/);
 assert.match(html,/cameraSession\.open\(deviceId\)/);
 assert.match(html,/function toPageRaster\(/);
});

test('supported torch toggles real constraint, accessible pressed state and shuts off on stop',async()=>{
 const h=harness(),b=h.el('cameraTorchButton');
 h.state.syncTorchButton(true,false);
 assert.equal(b.hidden,false);
 assert.equal(b.disabled,false);
 assert.equal(b.getAttribute('aria-pressed'),'false');
 await b.onclick();
 assert.deepEqual(h.calls.map(c=>[c.name,c.value]),[['torch',true]]);
 assert.equal(b.getAttribute('aria-pressed'),'true');
 assert.equal(b.getAttribute('aria-label'),'Desligar iluminação da câmera');
 assert.equal(h.el('cameraTorch').checked,true);
 await b.onclick();
 assert.deepEqual(h.calls.map(c=>[c.name,c.value]),[['torch',true],['torch',false]]);
 assert.equal(b.getAttribute('aria-pressed'),'false');
 await b.onclick();
 h.state.stopCamera();
 assert.deepEqual(h.calls.map(c=>[c.name,c.value]),[['torch',true],['torch',false],['torch',true],['torch',false]]);
 assert.equal(h.getStopped(),1);
 assert.equal(b.hidden,true);
 assert.equal(b.disabled,true);
 assert.equal(b.getAttribute('aria-pressed'),'false');
 assert.equal(h.state.cameraStream,null);
 assert.equal(h.el('camera').textContent,'Abrir câmera');
});

test('unsupported torch stays hidden and failure never simulates light or breaks camera',async()=>{
 const h=harness(),b=h.el('cameraTorchButton');
 h.state.syncTorchButton(false,false);
 await b.onclick();
 assert.equal(h.calls.length,0);
 assert.equal(b.hidden,true);
 h.state.syncTorchButton(true,false);
 h.state.applyCameraControl=async()=>false;
 await b.onclick();
 assert.equal(b.getAttribute('aria-pressed'),'false');
 assert.equal(b.disabled,false);
 assert.match(h.messages.at(-1),/indisponível/);
 assert.equal(h.state.cameraStream,h.stream);
});

test('async completion from old camera never updates newer camera UI',async()=>{
 const h=harness(),b=h.el('cameraTorchButton');
 h.state.syncTorchButton(true,false);
 let resolve;
 h.state.applyCameraControl=()=>new Promise(r=>{resolve=r});
 const pending=b.onclick();
 h.state.cameraStream={getVideoTracks:()=>[{}]};
 resolve(true);
 await pending;
 assert.equal(b.getAttribute('aria-pressed'),'false');
 // The next camera open synchronizes capability and state itself.
 assert.match(html,/syncTorchButton\(Boolean\(controls\.torch\),Boolean\(settings\.torch\)\)/);
});


// Camera-autonomy P1: exercise production camera opening and frame scanner.
const openingSource=html.slice(html.indexOf("async function startCamera(deviceId=''){"),html.indexOf("$('cameraTorchButton').onclick="));
assert.ok(openingSource.startsWith("async function startCamera(deviceId=''){"));
const cameraModules=await import('../../corretor/v2/omr/camera.mjs');

function uiHarness({available=[{kind:'videoinput',deviceId:'main',label:'Back Camera'}],failPermission=false,failMain=false}={}){
 const {CameraSession,cameraControls,applyCameraControl}=cameraModules;
 const els=new Map(),messages=[],requested=[],tracks=new Map();
 for(const item of available){
  tracks.set(item.deviceId,{
   label:item.label,stopped:0,requests:[],lit:false,
   stop(){this.stopped++},
   getCapabilities(){return item.deviceId==='main'?{torch:true}:{}},
   getSettings(){return {deviceId:item.deviceId,facingMode:/front/i.test(item.label)?'user':'environment',torch:this.lit,width:1280,height:960}},
   async applyConstraints(args){this.requests.push(args);if(args.advanced?.[0]?.torch!==undefined)this.lit=args.advanced[0].torch}
  });
 }
 const stream=track=>({getVideoTracks(){return [track]},getTracks(){return [track]}});
 const media={
  async getUserMedia(args){
   requested.push(args);
   if(failPermission){failPermission=false;throw Object.assign(new Error('blocked'),{name:'NotAllowedError'})}
   const id=args.video.deviceId?.exact||available[0]?.deviceId;
   if(failMain&&args.video.deviceId?.exact==='main')throw new Error('Main busy');
   if(!tracks.has(id))throw new Error('Dispositivo indisponível');
   return stream(tracks.get(id));
  },
  async enumerateDevices(){return available}
 };
 function el(id){
  if(!els.has(id)){
   const attrs=new Map();
   const x={id,hidden:false,disabled:false,checked:false,value:'',textContent:'',dataset:{},options:[],
    classList:{add(){},remove(){},toggle(){}},style:{removeProperty(){}},
    setAttribute(k,v){attrs.set(k,String(v))},getAttribute(k){return attrs.get(k)??null},
    removeAttribute(k){attrs.delete(k)},pause(){this.paused=true},
    async play(){this.played=true},addEventListener(){}};
   els.set(id,x);
  }
  return els.get(id);
 }
 const state={
  $:el,CameraSession,cameraControls,applyCameraControl,
  cameraSession:new CameraSession(media),
  cameraStream:null,cameraUiGeneration:0,cameraOpening:false,cameraTimer:null,safariCameraResyncTimer:null,safariCameraViewport:null,
  stableFrames:0,previousCorners:null,previousCameraFrame:null,cameraFrameDimensions:'',
  waitingForRemoval:false,absentFrames:0,cameraScratch:null,
  clearGuides(){},positionGuides(){},updateCameraInfo(){},
  setScanMessage(msg){messages.push(msg)},scanCameraFrame(){},
  replaceCameraVideo(stream){const video=el('video');video.srcObject=stream;return video},
  innerWidth:402,innerHeight:754,window:{visualViewport:{height:754}},
  document:{createElement(){return {width:0,height:0}}},clearInterval(){},clearTimeout(){},
  setInterval(){return 123}
 };
 vm.createContext(state);
 vm.runInContext([productionLine('function syncTorchButton('),productionLine('function cameraViewportSize()'),productionLine('function stopCamera(){'),openingSource,
  productionLine("$('cameraTorchButton').onclick=")].join('\n'),state,{timeout:2000});
 return {state,el,tracks,requested,messages};
}

test('P1 auto rear: one camera starts without picker, torch still available and releases correctly',async()=>{
 const h=uiHarness();
 await h.state.startCamera();
 assert.equal(h.requested[0].video.facingMode.exact,'environment');
 assert.equal(h.state.cameraStream.getVideoTracks()[0],h.tracks.get('main'));
 assert.equal(h.el('cameraTorchButton').hidden,false);
 assert.match(h.messages.at(-1),/Centralize o cartão/,'instrução de enquadramento sem telemetria');
 assert.doesNotMatch(html,/id="cameraDevice"|id="cameraDeviceLabel"/);
 h.state.stopCamera();assert.equal(h.tracks.get('main').stopped,1);
});
test('P1 prefers physical rear main over virtual/ultrawide, releases old stream and lamp',async()=>{
 const h=uiHarness({available:[
  {kind:'videoinput',deviceId:'ultra',label:'Back Ultra Wide Camera'},
  {kind:'videoinput',deviceId:'main',label:'Back Camera'},
  {kind:'videoinput',deviceId:'front',label:'Front Camera'}
 ]});
 await h.state.startCamera();
 assert.equal(h.state.cameraStream.getVideoTracks()[0],h.tracks.get('main'));
 assert.ok(h.tracks.get('ultra').stopped>=1);
 await h.el('cameraTorchButton').onclick();
 assert.equal(h.tracks.get('main').lit,true);
 h.state.stopCamera();
 assert.equal(h.tracks.get('main').lit,false);
 assert.equal(h.tracks.get('main').stopped,1);
});
test('P1 rear fallback recovers when preferred main camera is unavailable',async()=>{
 const h=uiHarness({available:[
  {kind:'videoinput',deviceId:'ultra',label:'Back Ultra Wide Camera'},
  {kind:'videoinput',deviceId:'main',label:'Back Camera'},
 ],failMain:true});
 await h.state.startCamera();
 assert.equal(h.state.cameraStream.getVideoTracks()[0],h.tracks.get('ultra'));
 assert.ok(h.requested.some(x=>x.video.deviceId?.exact==='main'));
 h.state.stopCamera();
});
test('P1 front-only device is refused, permission failure retries without locking UI',async()=>{
 const front=uiHarness({available:[{kind:'videoinput',deviceId:'front',label:'Front Camera'}]});
 await front.state.startCamera();
 assert.equal(front.state.cameraStream,null);
 assert.match(front.messages.at(-1),/traseira não está disponível/);
 const denied=uiHarness({failPermission:true});
 await denied.state.startCamera();
 assert.equal(denied.state.cameraStream,null);
 assert.match(denied.messages.at(-1),/Permita o acesso à câmera/);
 await denied.state.startCamera();
 assert.ok(denied.state.cameraStream);
 denied.state.stopCamera();
});
test('P1 camera controls remain capability-gated; scanner owns capture',()=>{
 assert.match(html,/<span id="cameraFocusLabel" hidden><button id="cameraFocus" type="button">Solicitar foco<\/button><\/span>/);
 assert.match(html,/const finalQuality=captureQuality\(capture,actual,capture\);\s*if\(!finalQuality.ok\)throw/);
 assert.doesNotMatch(html,/id="capture"|id="cameraDevice"|id="cameraDeviceLabel"/);
 assert.match(html,/<input id="read" type="hidden" aria-hidden="true">/);
 assert.doesNotMatch(html,/<button[^>]*id="read"/);
 assert.match(html,/if\(\$\('read'\)\.disabled\)throw new Error\('Aguarde a avaliação/);
 assert.doesNotMatch(html,/Fotografar para ajustar|Você também pode fotografar/);
 assert.match(html,/function scanCameraFrame\(\)/);
 assert.match(html,/stableFrames>=3/);
 assert.match(html,/captureQuality\(frame,detection,previousCameraFrame,\{captureSize\}\)/);
 assert.match(html,/projected=mapFramePoints\(detection.corners,frame,capture\)/);
 assert.match(html,/actual=detectFiducials\(capture\.gray,capture\.width,capture\.height,\{manifest:typeof activeManifest==='undefined'\?null:activeManifest\}\)/);
 assert.match(html,/const chosen=prior&&nowScore!==null/);
 assert.match(html,/manualCorners:chosen.actual.corners/);
 assert.match(html,/actual=detectFiducials\(capture\.gray,capture\.width,capture\.height,\{manifest:typeof activeManifest==='undefined'\?null:activeManifest\}\)/);
 assert.match(html,/corretor-v2\.css\?v=20261121ux79c1/);
 assert.match(html,/camera\.mjs\?v=20261124focus52/);
 assert.match(css,/\.camera-stage video\{object-position:center;transform:none\}/);
});

function preparationHarness({fail=false}={}){
 const els=new Map(),messages=[],s={fail,readCount:0};
 function el(id){
  if(!els.has(id))els.set(id,{id,hidden:id==='manualAlign'||id==='canvas',
   disabled:false,textContent:'',value:'',dataset:{},classList:{remove(){},add(){},toggle(){}}});
  return els.get(id);
 }
 const state={
  $:el,rawRaster:null,normalizedRaster:null,manualMode:false,manualPoints:[],
  updateCaptureComparison(){},paintGray(c,gray,width,height){c.width=width;c.height=height;c.hidden=false},
  toPageRaster(gray,width,height){if(s.fail)throw new Error('Fiducials not found');return {pixels:gray,width,height}},
  setScanMessage(message){messages.push(message)},readNormalized(){s.readCount++;return {observations:[]}},
  grayFromRgba(rgba){return new Uint8Array(rgba.length/4).fill(245)},
  createImageBitmap:async()=>({width:4,height:5,close(){}}),
  document:{createElement(){return {width:0,height:0,getContext(){return {
   canvas:this,drawImage(){},getImageData(){return {data:new Uint8Array(4*5*4).fill(245)}}}}}}},
 };
 vm.createContext(state);
 vm.runInContext([productionLine('function prepareImage('),productionLine('async function loadPhoto('),
  productionLine("$('file').onchange=")].join('\n'),state,{timeout:2000});
 return {state,el,messages,mode:s};
}
test('P1 photo imported is normalized and READ immediately without extra button',async()=>{
 const h=preparationHarness();
 await h.state.loadPhoto({type:'image/jpeg',size:220});
 assert.equal(h.state.rawRaster.source,'import');
 assert.ok(h.state.normalizedRaster);
 assert.equal(h.mode.readCount,1);
 assert.equal(h.el('manualAlign').hidden,true);
 assert.match(h.messages.at(-1),/Leitura inconclusiva/);
});
test('P1 invalid photo remains retryable including the same file; no invisible action',async()=>{
 const h=preparationHarness({fail:true});
 await h.state.loadPhoto({type:'image/jpeg',size:220});
 assert.equal(h.state.normalizedRaster,null);
 assert.equal(h.el('manualAlign').hidden,true);
 assert.match(h.el('status').textContent,/Importe outra fotografia/);
 h.mode.fail=false;
 await h.state.loadPhoto({type:'image/jpeg',size:220});
 assert.ok(h.state.normalizedRaster);
 assert.equal(h.mode.readCount,1);
});

const scanner=html.slice(html.indexOf('function scanCameraFrame(){'),html.indexOf('function updateCameraInfo(){'));
assert.ok(scanner.startsWith('function scanCameraFrame(){'));
function scanHarness(){
 const messages=[],h={scans:0,fail:false,found:true};
 const gray=new Uint8Array(900*1000).fill(220),corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
 const frame={gray,width:900,height:1000};
 const video={videoWidth:900,videoHeight:1000,readyState:4};
 const badge={dataset:{found:'false'},textContent:''};
 const state={
  cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',
  cameraBusy:false,captureBusy:false,stableFrames:0,previousCorners:null,
  previousCameraFrame:null,waitingForRemoval:false,absentFrames:0,lastCaptureAt:0,
  $:id=>id==='video'?video:id==='cameraLiveBadge'?badge:{},
  drawVideoFrame:()=>frame,detectFiducials:()=>h.found?{found:true,confidence:.95,corners}:{found:false,corners:[]},
  samePosition:()=>true,captureQuality:()=>({ok:true,message:'Folha estável.'}),
  updateCameraInfo(){},positionGuides(){},setScanMessage(message){messages.push(message)},
  captureFrameGray:()=>frame,mapFramePoints:x=>x,
  prepareImage(){h.scans++;return h.fail?null:{width:900,height:1000}},
 };
 vm.createContext(state);
 vm.runInContext(scanner,state,{timeout:2000});
 return {state,messages,h,video};
}
test('P1 stable frames capture automatically once, wait for removal and then accept next card',()=>{
 const {state,h}=scanHarness();
 state.scanCameraFrame();state.scanCameraFrame();
 assert.equal(h.scans,0);
 state.scanCameraFrame();assert.equal(h.scans,1);
 for(let n=0;n<4;n++)state.scanCameraFrame();
 assert.equal(h.scans,1,'one photo per sheet');
 h.found=false;state.scanCameraFrame();state.scanCameraFrame();
 assert.equal(state.waitingForRemoval,true);
 state.scanCameraFrame();
 assert.equal(state.waitingForRemoval,false);
 h.found=true;state.lastCaptureAt=0;
 state.scanCameraFrame();state.scanCameraFrame();state.scanCameraFrame();
 assert.equal(h.scans,2,'next card after removal');
});
test('P1 failed auto normalization does not trap the session or demand manual photograph',()=>{
 const {state,h}=scanHarness();h.fail=true;
 state.scanCameraFrame();state.scanCameraFrame();state.scanCameraFrame();
 assert.equal(h.scans,1);
 assert.equal(state.waitingForRemoval,false);
 assert.equal(state.stableFrames,0);
 h.fail=false;state.lastCaptureAt=0;
 state.scanCameraFrame();state.scanCameraFrame();state.scanCameraFrame();
 assert.equal(h.scans,2);
 assert.equal(state.waitingForRemoval,true);
});
