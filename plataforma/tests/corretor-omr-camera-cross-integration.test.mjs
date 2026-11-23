import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {scoreInputUnits,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {formatScore} from '../../corretor/v2/assessments/score-format.mjs';

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
  return {canvas,drawImage(){},getImageData(){return {data:new Uint8Array(canvas.width*canvas.height*4).fill(220)}}};
 }
}
const script=[
 production('function showCameraGrade('),production('function markLastReadingPending('),production('function calculateScore('),production('function renderHistory('),
 production('function renderAnswers('),production('function readNormalized('),
 production('async function loadPhoto('),production("$('file').onchange=")
].join('\n');

test('P1 integration: audited reader + camera code, imports, hidden bank gate, no old capture controls',()=>{
 assert.match(html,/reader\.mjs\?v=20261118final1/);
 assert.match(html,/camera\.mjs\?v=20261118wide1/);
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
 $('cameraStage').hidden=true;
 const state={
  $,document:{createElement:tag=>new Element(tag)},template,
  scoreInputUnits,formatScore,POINT_SCALE,
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
 state.prepareImage=(gray,width,height,{source='camera'}={})=>{state.rawRaster={gray,width,height,source};state.normalizedRaster={pixels:gray,width,height};return state.normalizedRaster};
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
 assert.match(h.$('scanScore').innerHTML,/Nota final 10,00/);
 const item=h.$('answers').children[0],select=item.children[1];
 assert.equal(select.value,'A');
 assert.match(item.children[0].textContent,/A reconhecida · marcação parcial/);
 select.value='B';select.onchange();
 assert.equal(s.activeObservations[0].answer,'B');
 assert.match(h.$('scanScore').innerHTML,/Nota final 0,00/);
 assert.match(h.$('status').textContent,/Nenhuma nota foi registrada no Diário/);
});

test('P1 integrated photo import reads immediately and identical file may be selected again',async()=>{
 const h=integrationHarness(),s=h.state;
 h.$('read').disabled=false;
 const photo={type:'image/jpeg',size:220};
 const input=h.$('file');input.value='foto.jpg';
 await input.onchange({target:{files:[photo],value:'foto.jpg'}}); // Direct call to production handler
 assert.equal(h.readCalls.length,1);
 assert.equal(h.messages.at(-1),'');
 assert.equal(h.$('cameraStage').hidden,true);
 assert.equal(h.$('cameraGrade').hidden,true);
 assert.equal(h.$('photoGrade').hidden,false);
 assert.equal(h.$('photoGrade').textContent,'Nota 10,00');
 // Direct handler can be invoked again with the identical file; no manual read button.
 input.value='foto.jpg';
 await input.onchange({target:{files:[photo],value:'foto.jpg'}});
 assert.equal(h.readCalls.length,2);
 assert.equal(h.$('photoGrade').textContent,'Nota 10,00');
 assert.equal(h.$('cameraGrade').hidden,true);
 assert.equal(h.$('cameraStage').hidden,true);
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
 assert.match(h.$('scanScore').innerHTML,/Nota final 10,00/);
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


test('UX-SAFARI-112: visor estavel e recuperacao da superficie WebKit sem reabrir MediaStream',()=>{
 assert.match(html,/#corrigir \.camera-stage\{width:min\(100%,660px\);aspect-ratio:auto;height:auto;min-height:0;border:0;border-radius:0;background:transparent;box-shadow:none\}/);
 assert.match(html,/#corrigir \.camera-stage video\{display:block;width:100%;height:auto;aspect-ratio:auto;object-fit:fill;background:transparent\}/);
 assert.doesNotMatch(html,/#corrigir \.camera-stage\{[^}]*\bvh\b/);
 assert.doesNotMatch(html,/--camera-ratio/);
 assert.doesNotMatch(html,/#corrigir \.camera-stage video\{[^}]*object-fit:cover/);
 assert.match(html,/function replaceCameraVideo\(stream\)\{[\s\S]*?old\.cloneNode\(false\);[\s\S]*?old\.replaceWith\(video\);video\.srcObject=stream;/);
 assert.match(html,/const video=replaceCameraVideo\(stream\);\$\('cameraStage'\)\.hidden=false;await video\.play\(\)/);
 assert.match(html,/function watchSafariCameraViewport\(\)\{[\s\S]*?Math\.abs\(current\.width-previous\.width\)>8\|\|Math\.abs\(current\.height-previous\.height\)<20/);
 assert.match(html,/window\.visualViewport\?\.addEventListener\?\.\('resize',watchSafariCameraViewport\)/);
 assert.match(html,/function stopCamera\(\)\{cameraUiGeneration\+\+;clearTimeout\(safariCameraResyncTimer\)/);
 assert.match(html,/#corrigir #cameraGuides\{display:none!important\}/);
 assert.match(html,/id="video" playsinline autoplay muted/);
});

test('UX-LEITURA-01: comparison follows answers and grade is only near the camera',()=>{
 const corretor=html.slice(html.indexOf('<section class="corretor-card module-view" id="corrigir"'),html.indexOf('</main>'));
 const pos=needle=>corretor.indexOf(needle);
 assert.ok(pos('id="cameraStage"')<pos('id="cameraGrade"'));
 assert.ok(pos('id="cameraGrade"')<pos('id="scanScore"'));
 assert.ok(pos('id="scanScore"')<pos('id="scanFeedback"'));
 assert.ok(pos('id="scanFeedback"')<pos('id="photoGrade"'));
 assert.ok(pos('id="photoGrade"')<pos('id="answers"'));
 assert.ok(pos('id="answers"')<pos('id="captureComparison"'));
 assert.ok(pos('id="captureComparison"')<pos('id="captureHistory"'));
 assert.ok(pos('id="captureComparison"')<pos('id="canvas"'));
 assert.ok(pos('id="canvas"')<pos('id="captureHistory"'));
 assert.equal([...corretor.matchAll(/id="canvas"/g)].length,1,'canvas stays singular');
 assert.match(html,/#corrigir #cameraGuides\{display:none!important\}/);
 for(const id of ['scanScore','photoGrade','cameraGrade','captureComparison','originalCapture','normalizedCapture'])
  assert.equal([...corretor.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 assert.match(html,/#corrigir #scanScore\{display:none!important\}/);
 assert.match(html,/#corrigir #cameraGrade\[hidden\]/);
});

test('UX-LEITURA-01: failed next capture keeps prior grade only in session history',()=>{
 const h=integrationHarness(),s=h.state;
 h.$('read').disabled=false;
 assert.ok(s.readNormalized());
 assert.match(h.$('scanScore').innerHTML,/Nota final 10,00/);
 assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 assert.equal(h.$('cameraGrade').hidden,false);
 assert.equal(h.$('captureHistory').children.length,1);
 s.markLastReadingPending();
 assert.equal(h.$('cameraGrade').hidden,true);
 assert.equal(h.$('scanScore').dataset.stale,'true');
 assert.match(h.$('scanScore').innerHTML,/Última leitura bem-sucedida/);
 s.normalizedRaster=null;
 assert.equal(s.readNormalized(),null);
 s.calculateScore();
 assert.equal(h.$('scanScore').dataset.stale,'true');
 assert.match(h.$('scanScore').innerHTML,/Nota da última leitura 10,00/);
 assert.match(h.$('captureHistory').children[0].textContent,/nota final 10,00/);
});

test('UX-LEITURA-01: pending review has no grade until manually confirmed',()=>{
 const h=integrationHarness(),s=h.state;
 h.$('read').disabled=false;
 s.readNormalized();
 s.markLastReadingPending();
 s.readRaster=()=>({page:1,pageCount:1,identity:{state:'read',code:'0001123'},
  observations:[{number:1,questionId:'q1',state:'review',answer:null,marks:[]}]});
 s.readNormalized();
 assert.equal(h.$('scanScore').dataset.review,'true');
 assert.equal(h.$('cameraGrade').hidden,true);
 assert.doesNotMatch(h.$('scanScore').innerHTML,/Nota final 10,00/);
 const select=h.$('answers').children[0].children[1];
 select.value='A';select.onchange();
 assert.equal(h.$('scanScore').dataset.review,'false');
 assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 assert.match(h.$('scanScore').innerHTML,/Nota final 10,00/);
});


test('UX-LEITURA-02: only the existing grade is overlaid after success, zero retains configured precision',()=>{
 const h=integrationHarness(),s=h.state;
 h.$('read').disabled=false;s.readNormalized({automatic:true});
 assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 assert.equal(h.$('cameraGrade').hidden,false);
 assert.equal(h.$('cameraProgress').hidden,true);
 assert.equal(h.$('cameraLiveBadge').hidden,true);
 const select=h.$('answers').children[0].children[1];select.value='B';select.onchange();
 assert.equal(h.$('cameraGradeValue').textContent,'0,00');
 assert.match(html,/#corrigir #cameraReadStatus\{display:none!important\}/);
 assert.doesNotMatch(html,/Cartão reconhecido e leitura atualizada\.|Cartão reconhecido\. Nota final disponível\./);
});


test('UX-LEITURA-02 final: imported photo shows only formatted note in old position; new read clears stale note',()=>{
 const h=integrationHarness(),s=h.state;
 h.$('read').disabled=false;
 s.rawRaster={source:'import'};
 s.readNormalized();
 for(const value of ['8','8,5','8,50']){
  s.showCameraGrade(value);
  // The scorer approves final grades; the direct helper preserves strings without reformatting.
  assert.equal(h.$('photoGrade').textContent,'Nota '+value);
  assert.equal(h.$('photoGrade').hidden,false);
  assert.equal(h.$('cameraGrade').hidden,true);
 }
 s.markLastReadingPending();
 assert.equal(h.$('photoGrade').hidden,true);
 assert.equal(h.$('cameraGrade').hidden,true);
 s.rawRaster={source:'camera'};
 s.readNormalized();
 assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 assert.equal(h.$('photoGrade').hidden,true);
});


test('UX-VISOR-03: visor e marcadores permanecem sobre a prévia, sem telemetria de câmera',()=>{
 assert.doesNotMatch(html,/id="cameraOverlayInfo"|class="camera-overlay-info"/);
 assert.match(html,/id="cameraGradeValue"/);
 assert.match(html,/#corrigir \.camera-stage\{width:min\(100%,660px\)/);
 assert.match(camera,/constraints\.height=\{ideal:Math\.min\(1440/);
});

test('UX-SAFARI-112 runtime: muda 40 px de viewport e remonta somente o video, preservando a track OMR',async()=>{
 const start=html.indexOf('function onCameraVideoResize(){');
 const end=html.indexOf('function stopCamera(){',start);
 assert.ok(start>0&&end>start,'production recovery helpers must be present');
 const source=html.slice(start,end);
 const stream={tracksStopped:0,getVideoTracks(){return [{stop(){stream.tracksStopped++}}]}};
 let current=null,replacements=0,scheduled=null,scheduledMs=null,updates=0;
 const makeVideo=()=>{
  const video={srcObject:null,paused:false,played:false,videoWidth:1440,videoHeight:1920,
   pause(){this.paused=true},
   cloneNode(){return makeVideo()},
   replaceWith(next){current=next;replacements++},
   addEventListener(){},
   async play(){this.played=true}
  };
  return video;
 };
 current=makeVideo();current.srcObject=stream;
 const initial=current;
 const stage={clientHeight:448,style:{minHeight:'',removeProperty(k){if(k==='min-height')delete this.minHeight;else delete this[k]}}};
 const s={
  $:id=>id==='video'?current:stage,
  cameraStream:stream,cameraOpening:false,captureBusy:false,cameraUiGeneration:3,
  safariCameraResyncBusy:false,safariCameraResyncAt:0,safariCameraResyncTimer:null,
  safariCameraViewport:{width:402,height:754},
  stableFrames:3,previousCorners:{},previousCameraFrame:{},cameraFrameDimensions:'1440x1920',
  innerWidth:402,innerHeight:714,navigator:{userAgent:'iPhone'},
  Date:{now:()=>3000},
  setTimeout(fn,ms){scheduled=fn;scheduledMs=ms;return 12},clearTimeout(){scheduled=null},
  positionGuides(){},updateCameraInfo(){updates++},setScanMessage(){}
 };
 vm.createContext(s);vm.runInContext(source,s,{timeout:2500});
 s.watchSafariCameraViewport();
 assert.equal(scheduledMs,350,'recovery must wait for viewport to stabilize');
 assert.equal(replacements,0,'do not change camera before debounce');
 const fire=scheduled;scheduled=null;fire();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(replacements,1,'one video node is replaced');
 assert.equal(initial.paused,true);
 assert.equal(current.srcObject,stream,'the exact MediaStream is kept');
 assert.equal(current.played,true);
 assert.equal(stream.tracksStopped,0,'no native camera restart');
 assert.equal(s.cameraStream,stream);
 assert.equal(s.stableFrames,0,'optical stability is reset after presentation remount');
 assert.equal(s.cameraFrameDimensions,'');
 assert.equal(stage.style.minHeight,undefined,'no persistent layout spacer');
 assert.ok(updates>0);
 // A 10 px change is not enough to cause another remount.
 s.innerHeight=704;s.watchSafariCameraViewport();
 assert.equal(replacements,1);
 assert.equal(scheduled,null);
});
