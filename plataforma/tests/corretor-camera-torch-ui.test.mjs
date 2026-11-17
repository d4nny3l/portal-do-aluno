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
   els.set(id,{id,hidden:false,disabled:false,checked:false,dataset:{},
    setAttribute(k,v){attrs.set(k,String(v))},getAttribute(k){return attrs.get(k)??null},
    pause(){this.paused=true}});
  }
  return els.get(id);
 }
 const track={};
 const stream={getVideoTracks:()=>[track]};
 let stopped=0;
 const state={
  $:el,cameraStream:stream,cameraUiGeneration:0,cameraOpening:false,cameraTimer:null,
  stableFrames:2,previousCameraFrame:{},previousCorners:{},waitingForRemoval:true,absentFrames:1,
  cameraFrameDimensions:'portrait',captureBusy:false,cameraSession:{stop(){stopped++}},
  clearGuides(){},updateCameraInfo(){},setScanMessage(m){messages.push(m)},
  clearInterval(){},applyCameraControl:async(t,name,value)=>{calls.push({track:t,name,value});return true}
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


// Auditor A-01/A-02/A-03: exercise production functions and DOM interactions.
// These harnesses preserve existing camera and optical modules as-is.
const openingSource=html.slice(html.indexOf("async function startCamera(deviceId=''){"),html.indexOf("$('cameraTorchButton').onclick="));
assert.ok(openingSource.startsWith("async function startCamera(deviceId=''){"));
assert.ok(openingSource.includes('const selectable=devices.filter('));
function uiHarness({available=[{kind:'videoinput',deviceId:'main',label:'Back Camera'}],failPermission=false}={}){
 const {CameraSession,cameraControls,applyCameraControl}=cameraModules;
 const els=new Map(),messages=[],requested=[],tracks=new Map();
 for(const item of available){
  tracks.set(item.deviceId,{
   label:item.label,stopped:0,requests:[],lit:false,
   stop(){this.stopped++},
   getCapabilities(){return item.deviceId==='main'?{torch:true}:{}},
   getSettings(){return {deviceId:item.deviceId,torch:this.lit,width:1280,height:960}},
   async applyConstraints(args){this.requests.push(args);if(args.advanced?.[0]?.torch!==undefined)this.lit=args.advanced[0].torch}
  });
 }
 const stream=track=>({getVideoTracks(){return [track]},getTracks(){return [track]}});
 const media={
  async getUserMedia(args){
   requested.push(args);
   if(failPermission){failPermission=false;throw Object.assign(new Error('blocked'),{name:'NotAllowedError'})}
   const id=args.video.deviceId?.exact||available[0]?.deviceId;
   if(!tracks.has(id))throw new Error('Dispositivo indisponível');
   return stream(tracks.get(id));
  },
  async enumerateDevices(){return available}
 };
 function el(id){
  if(!els.has(id)){
   const attrs=new Map();
   const x={id,hidden:false,disabled:false,checked:false,value:'',textContent:'',dataset:{},options:[],
    classList:{add(){},remove(){},toggle(){}},style:{},
    setAttribute(k,v){attrs.set(k,String(v))},getAttribute(k){return attrs.get(k)??null},
    removeAttribute(k){attrs.delete(k)},replaceChildren(...args){this.options=[...args]},
    add(option){this.options.push(option)},pause(){this.paused=true},
    async play(){this.played=true},addEventListener(){},getBoundingClientRect(){return {width:1,height:1}}};
   els.set(id,x);
  }
  return els.get(id);
 }
 const state={
  $:el,CameraSession,cameraControls,applyCameraControl,Option:class{constructor(label,value){this.text=label;this.value=value}},
  cameraSession:new CameraSession(media),
  cameraStream:null,cameraUiGeneration:0,cameraOpening:false,cameraTimer:null,
  stableFrames:0,previousCorners:null,previousCameraFrame:null,cameraFrameDimensions:'',
  waitingForRemoval:false,absentFrames:0,cameraScratch:null,
  clearGuides(){},positionGuides(){},updateCameraInfo(){},
  setScanMessage(msg){messages.push(msg)},scanCameraFrame(){},
  document:{createElement(){return {width:0,height:0}}},clearInterval(){},
  setInterval(){return 123}
 };
 vm.createContext(state);
 vm.runInContext([productionLine('function syncTorchButton('),productionLine('function stopCamera(){'),openingSource,
  productionLine("$('cameraTorchButton').onclick="),productionLine("$('cameraDevice').onchange=")].join('\n'),state,{timeout:2000});
 return {state,el,tracks,requested,messages};
}
const cameraModules=await import('../../corretor/v2/omr/camera.mjs');

test('A-01 single camera: picker hidden, disabled, automatic rear selected',async()=>{
 const h=uiHarness();
 await h.state.startCamera();
 assert.equal(h.el('cameraDeviceLabel').hidden,true);
 assert.equal(h.el('cameraDevice').disabled,true);
 assert.equal(h.el('cameraDevice').options.length,2);
 assert.equal(h.state.cameraStream.getVideoTracks()[0],h.tracks.get('main'));
 assert.equal(h.el('cameraTorchButton').hidden,false);
 h.state.stopCamera();
 assert.equal(h.tracks.get('main').stopped,1);
});

test('A-01 multiple cameras: original selector visible and switches, stops former torch/session',async()=>{
 const h=uiHarness({available:[
  {kind:'videoinput',deviceId:'ultra',label:'Back Ultra Wide Camera'},
  {kind:'videoinput',deviceId:'main',label:'Back Camera'},
  {kind:'videoinput',deviceId:'front',label:'Front Camera'}
 ]});
 await h.state.startCamera();
 assert.equal(h.state.cameraStream.getVideoTracks()[0],h.tracks.get('main'),'prefer main rear');
 assert.equal(h.el('cameraDeviceLabel').hidden,false);
 assert.equal(h.el('cameraDevice').disabled,false);
 assert.deepEqual(h.el('cameraDevice').options.map(x=>x.value),['','ultra','main','front']);
 assert.ok(h.tracks.get('ultra').stopped>=1,'ultrawide released after selecting main');
 await h.el('cameraTorchButton').onclick();
 assert.equal(h.tracks.get('main').lit,true,'real torch applied');
 h.el('cameraDevice').value='front';
 await h.el('cameraDevice').onchange();
 await Promise.resolve();
 assert.equal(h.tracks.get('main').stopped,1,'prior track stopped');
 assert.equal(h.tracks.get('main').lit,false,'old lamp turned off');
 assert.equal(h.state.cameraStream.getVideoTracks()[0],h.tracks.get('front'));
 assert.equal(h.el('cameraTorchButton').hidden,true,'new track has no torch');
 assert.equal(h.el('cameraDeviceLabel').hidden,false);
 h.state.stopCamera();
 assert.equal(h.el('cameraDeviceLabel').hidden,true);
 assert.equal(h.tracks.get('front').stopped,1);
});

test('A-01 only actual distinct selectable cameras count (not duplicate or empty deviceId)',async()=>{
 const h=uiHarness({available:[
  {kind:'videoinput',deviceId:'main',label:'Back Camera'},
  {kind:'videoinput',deviceId:'main',label:'Duplicate Camera'},
  {kind:'videoinput',deviceId:'',label:'Unknown Camera'}
 ]});
 await h.state.startCamera();
 assert.equal(h.el('cameraDeviceLabel').hidden,true);
 assert.equal(h.el('cameraDevice').disabled,true);
 h.state.stopCamera();
});

test('A-01 permission failure leaves button, file import and retry available',async()=>{
 const h=uiHarness({failPermission:true});
 await h.state.startCamera();
 assert.equal(h.state.cameraStream,null);
 assert.equal(h.el('cameraDeviceLabel').hidden,true);
 assert.equal(h.el('cameraDevice').disabled,true);
 assert.equal(h.el('camera').textContent,'Abrir câmera');
 assert.match(h.messages.at(-1),/Permita o acesso à câmera/);
 await h.state.startCamera();
 assert.ok(h.state.cameraStream,'same session can recover');
 h.state.stopCamera();
});

function preparationHarness({fail=false}={}){
 const els=new Map(),messages=[],s={fail};
 function el(id){
  if(!els.has(id))els.set(id,{id,hidden:id==='manualAlign'||id==='canvas',
   disabled:false,textContent:'',value:'',dataset:{},
   classList:{remove(){},add(){},toggle(){}}});
  return els.get(id);
 }
 const state={
  $:el,rawRaster:null,normalizedRaster:null,manualMode:false,manualPoints:[],
  updateCaptureComparison(){},paintGray(c,gray,width,height){c.width=width;c.height=height;c.hidden=false},
  toPageRaster(gray,width,height){if(s.fail)throw new Error('Fiducials not found');return {pixels:gray,width,height}},
  setScanMessage(message){messages.push(message)},readNormalized(){},
  grayFromRgba(rgba){return new Uint8Array(rgba.length/4).fill(245)},
  cameraStream:{},waitingForRemoval:false,captureFrameGray(){return {gray:new Uint8Array(20).fill(245),width:4,height:5}},
  createImageBitmap:async()=>({width:4,height:5,close(){}}),
  document:{createElement(){return {width:0,height:0,getContext(){return {
   drawImage(){},getImageData(){return {data:new Uint8Array(4*5*4).fill(245)}}}}}}},
 };
 vm.createContext(state);
 vm.runInContext([productionLine('function prepareImage('),productionLine('async function loadPhoto('),
  productionLine("$('file').onchange="),productionLine("$('capture').onclick=")].join('\n'),state,{timeout:2000});
 return {state,el,messages,mode:s};
}
test('A-02 capture button and instructions are concise; automatic scan chain unchanged',()=>{
 assert.match(html,/<button id="capture"[^>]*>Fotografar<\/button>/);
 assert.doesNotMatch(html,/Fotografar para ajustar|fotografar para ajustar/);
 assert.match(html,/function scanCameraFrame\(\)/);
 assert.match(html,/stableFrames>=3/);
 assert.match(html,/captureQuality\(frame,detection,previousCameraFrame\)/);
 assert.match(html,/automatic:true,manualCorners:mapFramePoints\(detection.corners,frame,capture\)/);
 assert.match(html,/corretor-v2\.css\?v=20261117camera2/);
 assert.match(css,/\.scan-actions \.camera-device-picker\[hidden\]\{display:none!important\}/);
 assert.equal((html.match(/id="cameraDevice"/g)||[]).length,1,'one reusable camera selector');
 const mainActions=html.slice(html.indexOf('class="omr-row scan-actions"'),html.indexOf('<details class="camera-settings"'));
 assert.match(mainActions,/id="cameraDeviceLabel" class="camera-device-picker" hidden/);
 assert.match(mainActions,/id="cameraDevice" disabled aria-label="Selecionar câmera"/);
});

test('A-03 valid imported photo keeps camera and optical flow usable',async()=>{
 const h=preparationHarness();
 await h.state.loadPhoto({type:'image/jpeg',size:220});
 assert.equal(h.state.rawRaster.source,'import');
 assert.ok(h.state.normalizedRaster);
 assert.equal(h.el('manualAlign').hidden,true);
 assert.match(h.messages.at(-1),/carregada/);
});

test('A-03 imported picture without four markers reports import-specific recovery, no invisible action',async()=>{
 const h=preparationHarness({fail:true});
 await h.state.loadPhoto({type:'image/jpeg',size:220});
 assert.equal(h.state.normalizedRaster,null);
 assert.equal(h.el('manualAlign').hidden,true);
 assert.equal(h.el('status').textContent,'Não foi possível identificar os quatro marcadores. Importe outra fotografia com a folha inteira e bem enquadrada.');
 assert.equal(h.el('file').disabled,false);
 h.mode.fail=false;
 await h.state.loadPhoto({type:'image/jpeg',size:220});
 assert.ok(h.state.normalizedRaster,'new import works without reload');
 assert.equal(h.el('manualAlign').hidden,true);
});

test('A-03 manual camera capture failing normalization recovers without reload or hidden controls',()=>{
 const h=preparationHarness({fail:true});
 h.el('capture').onclick();
 assert.equal(h.state.waitingForRemoval,false);
 assert.equal(h.el('manualAlign').hidden,true);
 assert.equal(h.el('status').textContent,'Não foi possível identificar os quatro marcadores. Reenquadre a folha e fotografe novamente.');
 assert.equal(h.state.cameraStream!==null,true);
 h.mode.fail=false;
 h.el('capture').onclick();
 assert.equal(h.state.waitingForRemoval,true);
 assert.ok(h.state.normalizedRaster);
 assert.equal(h.el('manualAlign').hidden,true);
});
