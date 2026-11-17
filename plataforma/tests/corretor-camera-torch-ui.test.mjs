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
