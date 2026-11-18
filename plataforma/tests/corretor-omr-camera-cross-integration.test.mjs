import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const reader=readFileSync(new URL('../../corretor/v2/omr/reader.mjs',import.meta.url),'utf8');
const camera=readFileSync(new URL('../../corretor/v2/omr/camera.mjs',import.meta.url),'utf8');
const lines=html.split('\n');
function production(prefix){
 const found=lines.filter(line=>line.startsWith(prefix));
 assert.equal(found.length,1,'Expected one production handler '+prefix);
 return found[0];
}
class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.hidden=false;
  this.disabled=false;this.checked=false;this.value='';this.textContent='';
  this.className='';
  this.classList={remove:k=>{this.className=this.className.split(/\s+/).filter(x=>x!==k).join(' ')},add(){},toggle(){}};
 }
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes]}
 setAttribute(k,v){this.attrs[k]=String(v)}
 removeAttribute(k){delete this.attrs[k]}
 getContext(){
  const canvas=this;
  return {drawImage(){},getImageData(){return {data:new Uint8Array(canvas.width*canvas.height*4).fill(220)}}};
 }
}
const script=[
 production('function calculateScore('),production('function renderHistory('),
 production('function renderAnswers('),production('function readNormalized('),
 production('async function loadPhoto('),production(" $('file').onchange=")
].join('\n');

test('P1 integration: audited reader + camera code, imports, hidden bank gate, no old capture controls',()=>{
 assert.match(html,/reader\.mjs\?v=20261117partial1/);
 assert.match(html,/camera\.mjs\?v=20261117autocamera1/);
 assert.match(html,/<input id="read" type="hidden" aria-hidden="true">/);
 assert.doesNotMatch(html,/<button[^>]+id="read"|id="capture"|id="cameraDevice"/);
 assert.match(html,/recognition==='partial'/);
 assert.match(html,/Marcação parcial reconhecida automaticamente/);
 assert.match(html,/if\(\$\('read'\)\.disabled\)throw new Error/);
 assert.match(html,/stableFrames>=3/);
 assert.match(html,/waitingForRemoval/);
 assert.match(html,/function scanCameraFrame\(\)/);
 assert.match(html,/cameraTorchButton/);
 assert.match(reader,/identity\.state === 'review'/);
 assert.match(reader,/partial\[0\]\.choice/);
 assert.match(reader,/recognition: state === 'read'/);
 assert.match(camera,/reduceUnwantedCameraZoom/);
 assert.match(camera,/cameraZoomSnapshot/);
});

function integrationHarness(){
 const fields=new Map(),messages=[],readCalls=[],bankChecks=[];
 function $(id){
  if(!fields.has(id))fields.set(id,new Element(id));
  return fields.get(id);
 }
 const template={pageCount:1,questions:[{questionId:'q1',choices:['A','B','C','D']}]};
 $('scanMaxScore').value='10';
 $('read').disabled=true;
 const state={
  $,document:{createElement:tag=>new Element(tag)},template,
  activeManifest:{templateId:'synthetic-only'},normalizedRaster:{pixels:new Uint8Array(100).fill(220),width:10,height:10},
  headerState:{showStudentCode:true},currentPage:1,activeObservations:[],scanHistory:[],
  replaceLastCapture:false,activeHistoryEntry:null,
  ensureScanTemplate(){},
  assessmentBank:{assertCurrentModel(m){bankChecks.push(m)}},
  parseKey(){return {valid:true,answers:new Map([['q1','A']])}},
  readRaster(t,p,w,h,options){
   readCalls.push({t,p,w,h,options});
   return {page:1,pageCount:1,identity:{state:'read',code:'0001123'},
    observations:[{number:1,questionId:'q1',state:'read',answer:'A',recognition:'partial',marks:['A']}]};
  },
  setScanMessage(message){messages.push(message)},
  grayFromRgba(rgba){return new Uint8Array(rgba.length/4).fill(220)},
  createImageBitmap:async()=>({width:4,height:5,close(){}}),
 };
 vm.createContext(state);
 vm.runInContext(script,state,{timeout:2500});
 return {state,$,messages,readCalls,bankChecks};
}

test('P1 integrated read: loading gate blocks, automatic partial scores, teacher override recalculates',()=>{
 const h=integrationHarness(),s=h.state;
 assert.equal(s.readNormalized({automatic:true}),null);
 assert.equal(h.readCalls.length,0);
 assert.match(h.$('status').textContent,/Aguarde a avaliação terminar/);
 h.$('read').disabled=false;
 const result=s.readNormalized({automatic:true});
 assert.equal(result.observations[0].recognition,'partial');
 assert.equal(h.readCalls.length,1);
 assert.equal(h.bankChecks.length,1);
 assert.equal(h.$('scanScore').dataset.review,'false');
 assert.match(h.$('scanScore').innerHTML,/Nota provisória 10,00/);
 const item=h.$('answers').children[0],select=item.children[1];
 assert.equal(select.value,'A');
 assert.match(item.children[0].textContent,/A reconhecida · marcação parcial/);
 select.value='B';select.onchange();
 assert.equal(s.activeObservations[0].answer,'B');
 assert.match(h.$('scanScore').innerHTML,/Nota provisória 0,00/);
 assert.match(h.$('status').textContent,/não foi registrada no Diário/);
});

test('P1 integrated photo import reads immediately and identical file may be selected again',async()=>{
 const h=integrationHarness(),s=h.state;
 h.$('read').disabled=false;
 const photo={type:'image/jpeg',size:220};
 const input=h.$('file');input.value='foto.jpg';
 await input.onchange({target:{files:[photo],value:'foto.jpg'}}); // Direct call to production handler
 assert.equal(h.readCalls.length,1);
 assert.match(h.messages.at(-1),/Fotografia importada e processada/);
 // Direct handler can be invoked again with the identical file; no manual read button.
 input.value='foto.jpg';
 await input.onchange({target:{files:[photo],value:'foto.jpg'}});
 assert.equal(h.readCalls.length,2);
});

test('P1 integrated scanner triggers partial grade, avoids duplicate sheet and accepts next sheet',()=>{
 const h=integrationHarness(),s=h.state;
 h.$('read').disabled=false;
 const frame={gray:new Uint8Array(900*1000).fill(220),width:900,height:1000};
 const corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
 let found=true,captureCount=0;
 Object.assign(s,{
  cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',stableFrames:0,
  previousCameraFrame:null,previousCorners:null,waitingForRemoval:false,absentFrames:0,
  captureBusy:false,lastCaptureAt:0,
  drawVideoFrame:()=>frame,detectFiducials:()=>found?{found:true,confidence:.96,corners}:{found:false,corners:[]},
  captureQuality:()=>({ok:true,message:'Folha estável.'}),samePosition:()=>true,
  positionGuides(){},updateCameraInfo(){},captureFrameGray:()=>frame,
  mapFramePoints:c=>c,
  prepareImage(gray,width,height,options){
   captureCount++;
   s.normalizedRaster={pixels:gray,width,height};
   return options.automatic && !s.readNormalized({automatic:true})?null:s.normalizedRaster;
  }
 });
 Object.assign(h.$('video'),{videoWidth:900,videoHeight:1000,readyState:4});
 Object.assign(h.$('cameraLiveBadge'),{dataset:{found:'false'}});
 const scanner=html.slice(html.indexOf('function scanCameraFrame(){'),html.indexOf('function updateCameraInfo(){'));
 assert.ok(scanner.startsWith('function scanCameraFrame(){'));
 vm.runInContext(scanner,s,{timeout:2500});
 for(let i=0;i<4;i++)s.scanCameraFrame();
 assert.equal(captureCount,1);
 assert.equal(h.readCalls.length,1);
 assert.match(h.$('scanScore').innerHTML,/Nota provisória 10,00/);
 for(let i=0;i<4;i++)s.scanCameraFrame();
 assert.equal(captureCount,1,'No duplicate while first card remains');
 found=false;s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(s.waitingForRemoval,false,'Removal releases scanner');
 found=true;s.lastCaptureAt=0;
 for(let i=0;i<4;i++)s.scanCameraFrame();
 assert.equal(captureCount,2,'Next card accepted after removal');
 assert.equal(h.readCalls.length,2);
 assert.equal(s.scanHistory.length,2);
});

test('P1 adversarial and historical coverage remains in combined source',()=>{
 // The original PR #51 reader tests execute independently in the same CI.
 assert.match(reader,/strong\.length > 1/);
 assert.match(reader,/partial\.length > 1/);
 assert.match(reader,/const conflict = item/);
 assert.match(reader,/identity\.state === 'review'/);
 assert.match(html,/importCardManifest/);
 assert.match(html,/createCardManifest/);
 assert.match(html,/readRaster\(template,normalizedRaster\.pixels/);
 assert.doesNotMatch(html,/document\.body\.append\(.+scanScore/);
});
