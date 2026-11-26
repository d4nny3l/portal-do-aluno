import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIntegratedPlan,scoreIntegratedPlan,scoreInputUnits,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {formatScore} from '../../corretor/v2/assessments/score-format.mjs';
import {scorePlanPreview,scoreIntegratedPages} from '../../corretor/v2/scan-safe/score-preview.mjs';
import {createCaptureSession} from '../../corretor/v2/scan-safe/session.mjs';
import {processCapture} from '../../corretor/v2/scan-safe/processor.mjs';
import {createPaperTracker,CAMERA_POLICY,cameraConstraints} from '../../corretor/v2/scan-safe/camera.mjs';
import {normal as removal,moved as movedPaper} from '../../corretor/v2/scan-safe/tests/rearm-fixture.mjs';
import {createCameraPresentation} from '../../laboratorio/salta-omr-scan-safe-02/js/camera-presentation.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const reader=readFileSync(new URL('../../corretor/v2/omr/reader.mjs',import.meta.url),'utf8');
const camera=readFileSync(new URL('../../corretor/v2/scan-safe/camera.mjs',import.meta.url),'utf8');
const processor=readFileSync(new URL('../../corretor/v2/scan-safe/processor.mjs',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
function production(name){
 const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(script);
 assert.ok(match,'current production handler '+name);
 const start=match.index,lineEnd=script.indexOf('\n',start),line=script.slice(start,lineEnd);
 if(line.endsWith('}'))return line;
 const end=script.indexOf('\n}',lineEnd);assert.ok(end>start,'end of '+name);
 return script.slice(start,end+2);
}
function between(start,end){
 const a=script.indexOf(start),b=script.indexOf(end,a);
 assert.ok(a>=0&&b>a,'current production section '+start);return script.slice(a,b);
}
class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.hidden=false;this.disabled=false;
  this.checked=false;this.value='';this.textContent='';this.innerHTML='';this.className='';
  this.classList={remove:()=>{},add:()=>{},toggle:()=>{}};
 }
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes];this.innerHTML='';this.textContent=''}
 setAttribute(k,v){this.attrs[k]=String(v)}
 removeAttribute(k){delete this.attrs[k]}
 querySelector(selector){assert.equal(selector,'.camera-grade-title span');return this.title||(this.title=new Element('span'))}
 getContext(){const canvas=this;return {drawImage(){},putImageData(){},
  getImageData(){return {data:new Uint8ClampedArray(canvas.width*canvas.height*4).fill(220)}}}}
}
function integrationHarness({privatePlan=false,validateSelection=false,places=2}={}){
 const fields=new Map(),bankChecks=[],workerCalls=[],readCalls=[],documentCalls=[],bitmapCloses=[];
 const $=id=>{if(!fields.has(id))fields.set(id,new Element(id));return fields.get(id)};
 const sections=[{sectionId:'s',label:'Objetivas',type:'A-D',items:[{questionId:'q1',number:1,type:'A-D'}]}];
 const template=createTemplate(sections,{identityMode:'seven-digit-code'}),manifest=createCardManifest(template);
 const plan=createIntegratedPlan({metadata:{title:'Sintética',subject:'Teste',kind:'Prova'},sections,
  values:{s:'10'},answers:{q1:'A'},model:manifest,scoreDecimals:places});
 const selection=privatePlan?{plan,manifestHash:manifest.contentHash,template}:null;
 $('scanMaxScore').value='10';$('scanPage').value='1';$('read').disabled=true;$('cameraStage').hidden=true;
 let key=new Map([['q1','A']]),keyValid=true,identity='read',answer='A',state='read',recognition='partial';
 let verifyResolve;
 const privateLibrary={requiresSelectionValidation:()=>validateSelection,
  verifySelection:()=>new Promise(resolve=>{verifyResolve=resolve})};
 const reading=(t=template,options={manifest,page:1})=>({templateId:t.templateId,templateRevision:t.revision,
  contentHash:options.manifest.contentHash,page:options.page,pageCount:t.pageCount,needsReview:identity==='review'||state==='review',
  identity:{state:identity,code:identity==='read'?'0001123':null},observations:[{number:1,questionId:'q1',page:options.page,
   state,answer:state==='read'?answer:null,recognition:state==='read'?recognition:null,marks:answer?[answer]:[]}]});
 const opticalRgba=new Uint8ClampedArray(4*5*4).fill(80),documentRgba=new Uint8ClampedArray(4*5*4).fill(240);
 const dependencies={vision:{frameCorners:(w,h)=>[[0,0],[w,0],[w,h],[0,h]],outputSize:()=>({w:4,h:5}),
  warp:data=>data,enhance:()=>opticalRgba,rotate:(data,w,h)=>({data,w,h})},
  documentEnhance(...args){documentCalls.push(args);return documentRgba},
  detect:()=>({found:true,confidence:.99,corners:[[0,0],[4,0],[4,5],[0,5]]}),
  warp:(gray,w,h)=>({pixels:gray,width:w,height:h}),
  verifyGeometry:()=>true, // Mocked 4×5 raster; independent geometry covered in real capture regressions.
  read(t,pixels,w,h,options){readCalls.push({t,pixels,w,h,options});return reading(t,options)}};
 const scanWorker={cancel(){},async process(payload){workerCalls.push(payload);return processCapture(payload,dependencies)}};
 const handlers=['setScanMessage','setCameraProgress','showCameraGrade','markLastReadingPending','invalidateScan',
  'scanPage','beginPhoto','processPhoto','loadPhoto','calculateScore','renderAnswers','renderHistory','readNormalized',
  'clearPrivateCorrection','clearAssessmentReview','stopCamera'].map(production).join('\n');
 const build=new Function('$','document','initialTemplate','initialManifest','initialSelection','privateLibrary','helpers',
  'parseKey','scanWorker','createSafeCamera','assessmentBank','createImageBitmap','ImageData',`
 const {scoreInputUnits,POINT_SCALE,formatScore,scoreIntegratedPlan,scorePlanPreview,scoreIntegratedPages,createCaptureSession}=helpers;
 let template=initialTemplate,activeManifest=initialManifest,privateSelection=initialSelection,privateModelLoaded=!!initialSelection;
 let activeSvg='',exactScanModel=true,activeObservations=[],activeHistoryEntry=null,rawRaster=null,normalizedRaster=null,currentDocument=null,currentReading=null;
 let manualMode=false,manualPoints=[],captureBusy=false,importBusy=false,scanHistory=[],scoreGeneration=0,modelLoadGeneration=0;
 const scanContext=createCaptureSession(),pageReadings=new Map();
 const ensureScanTemplate=()=>{},drawScanContour=()=>{},syncTorchButton=()=>{},syncScanInputs=()=>{};
 const setPrivateCorrectionUi=()=>{},setExportAvailability=()=>{},updateCaptureComparison=()=>{};
 ${production('paintDocument')}
 ${handlers}
 ${between('const scoreWithoutPrivateSelection=calculateScore;','\nfunction renderAnswers(')}
 ${between('const safeCamera=createSafeCamera({','\nfunction stopCamera(')}
 ${script.split('\n').find(line=>line.startsWith("$('file').onchange="))}
 return {begin:beginPhoto,read:readNormalized,process:processPhoto,load:loadPhoto,score:calculateScore,
  show:showCameraGrade,clear:clearPrivateCorrection,frame:safeCamera.onStatus,capture:safeCamera.onCapture,
  suspended:safeCamera.suspended,observations:()=>activeObservations,history:()=>scanHistory,
  token:()=>scanContext.current,reading:()=>currentReading,selection:()=>privateSelection,
  model:()=>template,setSource:source=>{rawRaster={source}}};
 `);
 const editor=build($,{createElement:tag=>new Element(tag)},template,manifest,selection,privateLibrary,
  {scoreInputUnits,POINT_SCALE,formatScore,scoreIntegratedPlan,scorePlanPreview,scoreIntegratedPages,createCaptureSession},
  ()=>keyValid?{valid:true,answers:key}:{valid:false,error:'Gabarito incompleto'},scanWorker,
  callbacks=>({...callbacks,stop(){}}),{assertCurrentModel:m=>bankChecks.push(m)},
  async()=>({width:4,height:5,close(){bitmapCloses.push(true)}}),class {constructor(data,width,height){Object.assign(this,{data,width,height})}});
 const photo={data:new Uint8ClampedArray(4*5*4).fill(220),w:4,h:5};
 return {$,editor,photo,template,manifest,plan,bankChecks,workerCalls,readCalls,documentCalls,bitmapCloses,
  configure(next){({identity=identity,answer=answer,state=state,recognition=recognition}=next)},
  setKey:next=>{key=new Map(next)},setKeyValid:next=>{keyValid=next},
  resolveValidation:ok=>{assert.ok(verifyResolve);verifyResolve(ok)}};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve()};

// Static integration assertions intentionally follow current APIs, while the
// runtime tests below execute those same handlers and the processor contract.
test('integrated scanner retains audited reader and hidden loading gate, with one Worker path and automatic controls',()=>{
 assert.match(processor,/import \{readRaster\} from '\.\.\/omr\/reader\.mjs'/);
 assert.match(html,/scan-safe\/camera\.mjs/);assert.match(html,/scan-safe\/worker-client\.mjs/);
 assert.match(html,/<input id="read" type="hidden" aria-hidden="true">/);
 assert.doesNotMatch(html,/<button[^>]+id="read"|id="capture"|id="cameraDevice"|id="cameraFocus"|id="cameraZoom"/);
 assert.match(html,/if\(\$\('read'\)\.disabled\)throw Error/);
 assert.match(html,/cameraTorchButton/);assert.match(html,/importCardManifest/);assert.match(html,/createCardManifest/);
 assert.doesNotMatch(script,/readRaster\s*\(|reconcile\s*\(/,'the UI does not invoke a second optical path');
 assert.match(reader,/identity\.state === 'review'/);assert.match(reader,/partial\[0\]\.choice/);
 assert.match(reader,/strong\.length > 1/);assert.match(reader,/partial\.length > 1/);assert.match(reader,/const conflict = item/);
 assert.match(reader,/recognition: state === 'read'/);
 assert.match(camera,/mode:'edge'/);assert.match(camera,/decodedFrames/);
 assert.equal(CAMERA_POLICY.STEADY_FRAMES,10);assert.equal(CAMERA_POLICY.LOOP_MS,66);
});

test('loading/private model gate prevents capture before processing; a confirmed automatic partial read remains manually editable',async()=>{
 const h=integrationHarness();
 assert.equal(h.editor.suspended(),true);
 await assert.rejects(h.editor.capture(h.photo),/Aguarde a avaliação terminar/);
 assert.equal(h.workerCalls.length,0);assert.equal(h.readCalls.length,0);assert.equal(h.bankChecks.length,0);
 h.$('read').disabled=false;assert.equal(h.editor.suspended(),false);
 await h.editor.capture(h.photo);
 assert.equal(h.bankChecks.length,1);assert.equal(h.bankChecks[0],h.manifest);
 assert.equal(h.workerCalls.length,1);assert.equal(h.readCalls.length,1);
 assert.match(h.$('scanScore').innerHTML,/Nota final 10,00/);
 const item=h.$('answers').children[0],select=item.children[1];
 assert.equal(select.value,'A');assert.match(item.children[0].textContent,/A reconhecida · marcação parcial/);
 select.value='B';select.onchange();assert.equal(h.editor.observations()[0].answer,'B');
 assert.match(h.$('scanScore').innerHTML,/Nota final 0,00/);
 assert.match(h.$('status').textContent,/Nenhuma nota foi registrada no Diário/);
 assert.equal(h.readCalls.length,1,'manual answer confirmation is not a new optical read');
});

test('the same imported photograph can be selected twice; each import performs one reading and keeps its formatted note in the existing photo position',async()=>{
 const h=integrationHarness();h.$('read').disabled=false;
 const input=h.$('file'),photo={type:'image/jpeg',size:220};
 for(let i=1;i<=2;i++){
  input.files=[photo];input.value='foto.jpg';await input.onchange({target:input});
  assert.equal(input.value,'');assert.equal(h.workerCalls.length,i);assert.equal(h.readCalls.length,i);
  assert.equal(h.bitmapCloses.length,i);assert.equal(h.$('cameraStage').hidden,true);
  assert.equal(h.$('cameraGrade').hidden,true);assert.equal(h.$('photoGrade').hidden,false);
  assert.equal(h.$('photoGrade').textContent,'Nota 10,00');
 }
 for(const formatted of ['8','8,5','8,50']){
  h.editor.show(formatted);assert.equal(h.$('photoGrade').textContent,'Nota '+formatted);
  assert.equal(h.$('cameraGrade').hidden,true,'display helper preserves the approved formatted string');
 }
});

test('one captured RGBA produces independent document and optical products with exactly one read, preserving exact model and page',async()=>{
 const h=integrationHarness();h.$('read').disabled=false;await h.editor.capture(h.photo);
 assert.equal(h.workerCalls.length,1);assert.equal(h.documentCalls.length,1);assert.equal(h.readCalls.length,1);
 const payload=h.workerCalls[0],read=h.readCalls[0];
 assert.equal(payload.template,h.template);assert.equal(payload.manifest,h.manifest);assert.equal(payload.page,1);
 assert.equal(payload.token.contentHash,h.manifest.contentHash);assert.equal(read.options.manifest,h.manifest);
 assert.equal(read.options.page,1);assert.equal(read.options.showCode,true);
 assert.equal(read.pixels[0],80,'document enhancement pixels cannot feed the optical reader');
 assert.equal(h.documentCalls[0][3],'color');assert.equal(h.editor.history().length,1);
});

test('ten stable observations capture once; transient absence and unchanged scenery never rearm; proven withdrawal admits the next sheet',async()=>{
 const h=integrationHarness();h.$('read').disabled=false;const tracker=createPaperTracker();
 const paper={score:.9,support:.8,corners:[[30,30],[354,30],[354,500],[30,500]]};
 const scene=n=>n===0?removal.still:removal.desk;
 async function frame(p,signature,time){const o=tracker.observe(p,384,540,signature,time);h.editor.frame(o.message,o);
  if(o.captureId){await h.editor.capture(h.photo);tracker.finish(o.captureId)}return o;}
 for(let i=0;i<10;i++)await frame(paper,scene(0),i*66);
 assert.equal(h.workerCalls.length,0,'initial geometry plus nine stable observations do not capture');
 await frame(paper,scene(0),660);assert.equal(h.readCalls.length,1);assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 for(let i=0;i<20;i++)await frame(paper,scene(0),1000+i*66);
 assert.equal(h.readCalls.length,1,'stationary paper remains locked');
 for(const t of [3000,3300])await frame(null,scene(.5),t);
 assert.equal(tracker.snapshot().phase,'locked');assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 await frame(paper,scene(0),3400);
 for(const t of [4000,5000,10000])await frame(null,scene(0),t);
 assert.equal(tracker.snapshot().phase,'locked','elapsed time cannot prove withdrawal');
 await frame(movedPaper,removal.moved,10800);
 for(const t of [11000,11200,11450,11700])await frame(null,scene(.5),t);
 assert.equal(tracker.snapshot().phase,'vacant');assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 for(let i=0;i<11;i++)await frame(paper,scene(0),12000+i*66);
 assert.equal(h.readCalls.length,2);assert.equal(h.editor.history().length,2);
});

test('max/key/manual changes recalculate the current public card without rereading and keep zero precision',async()=>{
 const h=integrationHarness();h.$('read').disabled=false;await h.editor.capture(h.photo);
 h.$('scanMaxScore').value='8.50';h.editor.score();assert.equal(h.$('cameraGradeValue').textContent,'8,50');
 h.setKey([['q1','B']]);h.editor.score();assert.equal(h.$('cameraGradeValue').textContent,'0,00');
 const select=h.$('answers').children[0].children[1];select.value='B';select.onchange();
 assert.equal(h.$('cameraGradeValue').textContent,'8,50');
 h.$('scanMaxScore').value='0';h.editor.score();assert.equal(h.$('cameraGradeValue').textContent,'0,00');
 h.setKeyValid(false);h.editor.score();assert.match(h.$('scanScore').innerHTML,/Gabarito necessário/);
 assert.equal(h.$('cameraGrade').hidden,true);assert.equal(h.readCalls.length,1);
});

test('next shutter removes the previous grade from presentation while the numeric session history survives a failed reading',async()=>{
 const h=integrationHarness();h.$('read').disabled=false;await h.editor.capture(h.photo);
 assert.equal(h.$('cameraGrade').hidden,false);assert.equal(h.$('cameraProgress').hidden,true);assert.equal(h.$('cameraLiveBadge').hidden,true);
 h.editor.begin();h.editor.score();
 assert.equal(h.$('cameraGrade').hidden,true);assert.equal(h.$('photoGrade').hidden,true);assert.equal(h.$('scanScore').hidden,true);
 assert.equal(h.$('scanScore').dataset.stale,'true');assert.deepEqual(h.editor.observations(),[]);
 assert.match(h.$('captureHistory').children[0].textContent,/nota final 10,00/);
 assert.equal(h.editor.read(null),null);assert.equal(h.editor.history().length,1);
});

test('question review blocks a grade until explicit teacher confirmation, including a manual blank as zero',async()=>{
 const h=integrationHarness();h.configure({state:'review'});h.$('read').disabled=false;await h.editor.capture(h.photo);
 assert.equal(h.$('scanScore').dataset.review,'true');assert.equal(h.$('cameraGrade').hidden,true);
 const select=h.$('answers').children[0].children[1];select.value='__blank__';select.onchange();
 assert.equal(h.$('scanScore').dataset.review,'false');assert.equal(h.$('cameraGradeValue').textContent,'0,00');
 assert.match(h.$('scanScore').innerHTML,/Nota final 0,00/);assert.equal(h.readCalls.length,1);
});

test('identity pending permits only a local provisional grade after strong or manually reviewed evidence, including private exact format',async()=>{
 for(const privatePlan of [false,true]){
  const h=integrationHarness({privatePlan,places:1});h.$('read').disabled=false;
  h.configure({identity:'review',recognition:'partial'});await h.editor.capture(h.photo);
  assert.equal(h.$('cameraGrade').hidden,true);assert.match(h.$('scanScore').innerHTML,/Leitura inconclusiva/);
  const select=h.$('answers').children[0].children[1];select.value='A';select.onchange();
  assert.equal(h.$('scanScore').dataset.identity,'review');assert.equal(h.$('scanScore').dataset.provisional,'true');
  assert.equal(h.$('cameraGrade').querySelector('.camera-grade-title span').textContent,'NOTA PROVISÓRIA');
  assert.equal(h.$('cameraGradeValue').textContent,privatePlan?'10,0':'10,00');
  assert.equal(h.editor.reading().identity.state,'review');assert.equal(h.editor.reading().identity.code,null);
  assert.equal(h.editor.history()[0].identityPending,true);assert.equal(h.editor.history()[0].provisional,true);
  assert.match(h.$('captureHistory').children[0].textContent,/nota provisória.*identificação pendente/);
  h.configure({recognition:'strong'});await h.editor.capture(h.photo);
  assert.equal(h.$('scanScore').dataset.provisional,'true');assert.equal(h.editor.reading().identity.state,'review');
  assert.equal(h.$('cameraGradeValue').textContent,privatePlan?'10,0':'10,00');
 }
});

test('private selection verification and revocation clear private state while keeping only completed numeric session history',async()=>{
 const h=integrationHarness({privatePlan:true,validateSelection:true});h.$('read').disabled=false;
 await h.editor.capture(h.photo);assert.match(h.$('scanScore').innerHTML,/Conferindo avaliação/);
 assert.equal(h.$('cameraGrade').hidden,true);h.resolveValidation(true);await flush();
 assert.equal(h.$('cameraGradeValue').textContent,'10,00');
 h.editor.clear();assert.equal(h.editor.selection(),null);assert.equal(h.editor.model(),null);assert.equal(h.editor.token(),null);
 assert.equal(h.$('cameraGrade').hidden,true);assert.equal(h.$('scanScore').children.length,0);
 assert.equal(h.$('answerKey').value,'');assert.equal(h.editor.history().length,1);
 assert.deepEqual(Object.keys(h.editor.history()[0]).sort(),['at','correct','count','grade','id','identityPending','provisional','readCount'].sort());
 assert.match(h.$('captureHistory').children[0].textContent,/nota final 10,00/);
});

test('existing camera/photo grade placement stays singular; document image occupies the existing canvas without a comparison panel',()=>{
 const section=html.slice(html.indexOf('<section class="corretor-card module-view" id="corrigir"'),html.indexOf('</main>'));
 const pos=id=>section.indexOf('id="'+id+'"');
 for(const [before,after]of [['cameraStage','cameraGrade'],['cameraGrade','scanScore'],['scanScore','scanFeedback'],
  ['scanFeedback','photoGrade'],['photoGrade','answers'],['answers','canvas'],['canvas','captureHistory']])assert.ok(pos(before)<pos(after));
 for(const id of ['scanScore','photoGrade','cameraGrade','canvas','cameraPreview'])
  assert.equal([...section.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 assert.doesNotMatch(section,/id="captureComparison"|id="originalCapture"|id="normalizedCapture"|camera-overlay-info/);
 assert.doesNotMatch(section,/id="cameraOverlayInfo"/);
 assert.match(html,/#corrigir #scanScore\{display:none!important\}/);assert.match(html,/#corrigir #cameraGrade\[hidden\]/);
 assert.match(html,/#corrigir #cameraGradeValue\{[^}]*font-size:30px/);
 assert.match(html,/#corrigir \.camera-stage\{width:min\(100%,660px\);aspect-ratio:auto;height:auto;min-height:0/);
 assert.match(html,/#corrigir \.camera-stage video\{[^}]*object-fit:contain/);
 assert.doesNotMatch(html,/#corrigir \.camera-stage\{[^}]*\bvh\b|--camera-ratio/);
 assert.match(html,/id="video" playsinline autoplay muted/);assert.match(html,/#corrigir #cameraGuides\{display:none!important\}/);
 assert.doesNotMatch(html,/Cartão reconhecido e leitura atualizada\.|Cartão reconhecido\. Nota final disponível\./);
});

function events(extra={}){
 const listeners=new Map();return {...extra,addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
  removeEventListener(name,fn){listeners.get(name)?.delete(fn)},emit(name){for(const fn of listeners.get(name)||[])fn()}};
}
test('WebKit presentation keeps the exact stream and full frame through viewport changes, orientation and cancelled picker',async()=>{
 const frames=new Map(),draws=[],dimensions=[];let sequence=0,playCount=0,stopCount=0;
 const track=events({getSettings:()=>({width:1920,height:1080}),stop(){stopCount++},readyState:'live'});
 const stream={getVideoTracks:()=>[track]},classes=new Set();
 const rect=()=>({width:390,height:390*video.videoHeight/video.videoWidth});
 const video=events({videoWidth:1920,videoHeight:1080,readyState:4,paused:false,srcObject:stream,
  parentElement:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},getBoundingClientRect:()=>rect()},
  getBoundingClientRect:()=>rect(),play(){playCount++;this.paused=false;return Promise.resolve()}});
 const preview={width:0,height:0,hidden:true,getContext:()=>({drawImage:(...args)=>draws.push(args)})};
 const file=events(),viewport=events({width:390,height:700,scale:1});
 const win=events({innerWidth:390,innerHeight:700,visualViewport:viewport,getComputedStyle:()=>({objectFit:'contain'}),
  requestAnimationFrame(fn){const id=++sequence;frames.set(id,fn);return id},cancelAnimationFrame(id){frames.delete(id)}});
 const doc=events({hidden:false,querySelectorAll:()=>[file]});
 const presentation=createCameraPresentation({video,preview,window:win,document:doc,onDimensionsChanged:d=>dimensions.push(d)});
 const tick=time=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn(time)};
 presentation.start(stream);tick(0);
 assert.deepEqual(draws[0],[video,0,0,1920,1080]);assert.equal(preview.width,1920);assert.equal(preview.height,1080);
 assert.equal(presentation.snapshot().presentation,'canvas');assert.equal(preview.hidden,false);assert.ok(classes.has('canvas-preview'));
 for(const height of [690,680,670,660,390,700]){viewport.height=height;viewport.emit('resize')}
 assert.equal(dimensions.length,1,'toolbar/keyboard alone cannot change native geometry');
 video.videoWidth=1080;video.videoHeight=1920;win.emit('orientationchange');tick(40);
 assert.equal(dimensions.length,2);assert.deepEqual(draws.at(-1),[video,0,0,1080,1920]);
 assert.equal(presentation.snapshot().ratios.rendered,presentation.snapshot().ratios.intrinsic);
 file.emit('click');video.paused=true;file.emit('cancel');await flush();
 assert.equal(playCount,1);assert.equal(video.srcObject,stream);assert.equal(stopCount,0);
 assert.equal(cameraConstraints('iPhone Safari').video.width.ideal,1920);
 assert.equal(cameraConstraints('Chrome').video.width.ideal,3840);
 presentation.stop();assert.equal(preview.hidden,true);assert.equal(preview.width,0);assert.equal(frames.size,0);
 assert.equal(stopCount,0,'detaching presentation never stops the camera track');
});
