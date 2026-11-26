import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIntegratedPlan,scoreIntegratedPlan,scoreInputUnits,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {formatScore} from '../../corretor/v2/assessments/score-format.mjs';
import {scorePlanPreview,scoreIntegratedPages} from '../../corretor/v2/scan-safe/score-preview.mjs';
import {createCaptureSession} from '../../corretor/v2/scan-safe/session.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';

// Execute current production handlers, including the real private scorer wrapper,
// against a minimal DOM and controlled Worker. No historical page or scorer copy.
const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
function production(name){
 const pattern=new RegExp('^(?:async )?function '+name+'\\(','m'),match=pattern.exec(script);
 assert.ok(match,'current production handler '+name);
 const start=match.index,lineEnd=script.indexOf('\n',start),firstLine=script.slice(start,lineEnd);
 if(firstLine.endsWith('}'))return firstLine;
 const end=script.indexOf('\n}',lineEnd);
 assert.ok(end>start,'end of production handler '+name);
 return script.slice(start,end+2);
}
function between(start,end){
 const a=script.indexOf(start),b=script.indexOf(end,a);
 assert.ok(a>=0&&b>a,'current production section '+start);
 return script.slice(a,b);
}
class Node {
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.hidden=false;this.value='';
  this.className='';this.textContent='';this.innerHTML='';this.disabled=false;
  this.classList={remove(){},add(){}};
 }
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children];this.innerHTML='';this.textContent=''}
 setAttribute(k,v){this.attrs[k]=v}
 removeAttribute(k){delete this.attrs[k]}
 querySelector(selector){assert.equal(selector,'.camera-grade-title span');return this.title||(this.title=new Node('span'))}
}
function fixture({privatePlan=false,places=2,validateSelection=false}={}){
 const fields=Object.fromEntries(['answers','status','scanScore','cameraGrade','cameraGradeValue','photoGrade',
  'cameraProgress','cameraLiveBadge','cameraStableStatus','cameraCaptureStatus','cameraReadStatus','cameraGuideStatus',
  'scanFeedback','canvas','manualAlign','manualHelp','read','scanPage','captureHistory','video','cameraPreview',
  'scanFlash'].map(id=>[id,new Node('div')]));
 fields.scanMaxScore={value:'10'};fields.scanPage.value='1';
 const $=id=>{assert.ok(fields[id],id);return fields[id]};
 const sections=[{sectionId:'first',label:'Primeiro',type:'A-D',items:[1,2].map(number=>({questionId:'q'+number,number,type:'A-D'}))},
  {sectionId:'second',label:'Segundo',type:'A-D',items:[{questionId:'q3',number:3,type:'A-D'}]}];
 const template=createTemplate(sections,{identityMode:'seven-digit-code'}),manifest=createCardManifest(template);
 const plan=createIntegratedPlan({metadata:{title:'Sintética',subject:'Teste',kind:'Prova'},sections,
  values:{first:'1.2345',second:'8.7655'},answers:{q1:'A',q2:'A',q3:'A'},model:manifest,scoreDecimals:places});
 const selection=privatePlan?{plan,manifestHash:manifest.contentHash,template}:null;
 let key=new Map([['q1','A'],['q2','A'],['q3','A']]),valid=true,cancelCount=0,verifyResolve;
 let workerProcess=async()=>{throw Error('Nenhum marcador localizado')};
 const privateLibrary={requiresSelectionValidation:()=>validateSelection,
  verifySelection:()=>new Promise(resolve=>{verifyResolve=resolve})};
 const handlers=['setScanMessage','setCameraProgress','showCameraGrade','markLastReadingPending','invalidateScan',
  'scanPage','beginPhoto','processPhoto','loadPhoto','calculateScore','renderAnswers','renderHistory','readNormalized'].map(production).join('\n');
 const build=new Function('$','document','initialTemplate','initialManifest','initialSelection','privateLibrary','helpers',
  'parseKey','scanWorker','createSafeCamera',`
 const {scoreInputUnits,POINT_SCALE,formatScore,scoreIntegratedPlan,scorePlanPreview,scoreIntegratedPages,createCaptureSession}=helpers;
 let template=initialTemplate,activeManifest=initialManifest,privateSelection=initialSelection;
 let activeObservations=[],activeHistoryEntry=null,rawRaster=null,normalizedRaster=null,currentDocument=null,currentReading=null;
 let manualMode=false,manualPoints=[],captureBusy=false,importBusy=false,scanHistory=[],scoreGeneration=0,modelLoadGeneration=0;
 const scanContext=createCaptureSession(),pageReadings=new Map(),assessmentBank=null;
 const ensureScanTemplate=()=>{},paintDocument=()=>{},drawScanContour=()=>{},syncTorchButton=()=>{};
 const clearPrivateCorrection=()=>{privateSelection=null;invalidateScan()};
 ${handlers}
 ${between('const scoreWithoutPrivateSelection=calculateScore;','\nfunction renderAnswers(')}
 ${between('const safeCamera=createSafeCamera({','\nfunction stopCamera(')}
 return {begin:beginPhoto,read:readNormalized,process:processPhoto,load:loadPhoto,score:calculateScore,
  frame:safeCamera.onStatus,capture:safeCamera.onCapture,invalidate:invalidateScan,
  observations:()=>activeObservations,current:()=>currentReading,history:()=>scanHistory,
  token:()=>scanContext.current,setSource:source=>{rawRaster={source}},
  setManifest:manifest=>{activeManifest=manifest},setSelection:selection=>{privateSelection=selection}};
 `);
 const editor=build($,{createElement:tag=>new Node(tag)},template,manifest,selection,privateLibrary,
  {scoreInputUnits,POINT_SCALE,formatScore,scoreIntegratedPlan,scorePlanPreview,scoreIntegratedPages,createCaptureSession},
  ()=>valid?{valid:true,answers:key}:{valid:false,error:'Gabarito incompleto'},
  {cancel(){cancelCount++},process:input=>workerProcess(input)},callbacks=>callbacks);
 const observations=(answers=['A','B','C'])=>answers.map((answer,index)=>({questionId:'q'+(index+1),number:index+1,
  page:1,state:'read',recognition:'strong',answer,marks:[answer]}));
 const page=(answers,identityState='read')=>({templateId:template.templateId,templateRevision:template.revision,
  contentHash:manifest.contentHash,page:1,pageCount:1,identity:{state:identityState,code:identityState==='read'?'0001123':null},
  observations:observations(answers),needsReview:identityState==='review'});
 const accept=(reading=page())=>{const token=editor.begin();assert.equal(editor.read(reading,{token}),reading);return token};
 return {fields,editor,page,accept,template,manifest,plan,selection,
  setKey:next=>{key=new Map(next)},setValid:next=>{valid=next},setWorker:next=>{workerProcess=next},
  resolveValidation:ok=>{assert.ok(verifyResolve);verifyResolve(ok)},cancelCount:()=>cancelCount,
  row:i=>fields.answers.children[i].children[1]};
}
const hiddenGrade=fields=>{
 assert.equal(fields.cameraGrade.hidden,true);assert.equal(fields.cameraGradeValue.textContent,'');
 assert.equal(fields.photoGrade.hidden,true);assert.equal(fields.photoGrade.textContent,'');
 assert.equal(fields.scanScore.hidden,true);
};
const flush=async()=>{await Promise.resolve();await Promise.resolve()};

test('D02: current camera grade survives searching, temporary loss and cancelled/invalid import until the next shutter',async()=>{
 const h=fixture();h.accept();
 assert.match(h.fields.scanScore.innerHTML,/Nota final 3,33 \/ 10,00/);
 assert.equal(h.fields.cameraGradeValue.textContent,'3,33');
 for(const observation of [{stable:0,phase:'searching'},{stable:5,phase:'tracking'},{stable:10,phase:'locked'}]){
  h.editor.frame('Aguardando a folha',observation);
  assert.equal(h.fields.cameraGrade.hidden,false);assert.equal(h.fields.cameraGradeValue.textContent,'3,33');
 }
 await h.editor.load(undefined);
 await h.editor.load({type:'application/pdf',size:1});
 await h.editor.load({type:'image/png',size:36*1024*1024});
 assert.equal(h.fields.cameraGradeValue.textContent,'3,33');assert.equal(h.editor.history().length,1);
 const token=h.editor.begin();
 assert.equal(token.captureId,2);assert.equal(h.cancelCount(),2);hiddenGrade(h.fields);
 assert.equal(h.fields.scanScore.dataset.stale,'true');assert.deepEqual(h.editor.observations(),[]);
 assert.equal(h.editor.current(),null);assert.equal(h.fields.answers.children.length,0);
 h.fields.scanMaxScore.value='20';h.setKey([['q1','A'],['q2','B'],['q3','A']]);h.editor.score();
 hiddenGrade(h.fields);
});

test('D02: a real camera shutter invalidates the previous grade even when the Worker cannot normalize the new sheet',async()=>{
 const h=fixture();h.accept();
 let finish;
 h.setWorker(()=>new Promise(resolve=>{finish=resolve}));
 const capturing=h.editor.capture({data:new Uint8ClampedArray(4),w:1,h:1});
 hiddenGrade(h.fields);assert.equal(h.editor.token().captureId,2);
 finish({token:h.editor.token(),document:null,sourceOptical:{gray:new Uint8Array(1),width:1,height:1},
  optical:null,reading:null,error:{message:'Confira os quatro marcadores.'}});
 await capturing;
 assert.equal(h.fields.manualAlign.hidden,false);assert.match(h.fields.status.textContent,/quatro marcadores/);
 h.fields.scanMaxScore.value='12';h.editor.score();hiddenGrade(h.fields);
 assert.equal(h.editor.history().length,1,'failed sheet does not acquire the preceding grade');
});

test('current public arithmetic and manual review retain exact formatting; next import uses the existing photo grade surface',()=>{
 const h=fixture();h.accept();
 h.fields.scanMaxScore.value='20';h.editor.score();assert.equal(h.fields.cameraGradeValue.textContent,'6,67');
 h.setKey([['q1','A'],['q2','B'],['q3','A']]);h.editor.score();assert.equal(h.fields.cameraGradeValue.textContent,'13,33');
 h.row(2).value='A';h.row(2).onchange();assert.equal(h.fields.cameraGradeValue.textContent,'20,00');
 h.setValid(false);h.editor.score();assert.match(h.fields.scanScore.innerHTML,/Gabarito necessário/);
 assert.equal(h.fields.cameraGrade.hidden,true);
 h.setValid(true);h.editor.score();assert.equal(h.fields.cameraGradeValue.textContent,'20,00');
 const token=h.editor.begin();h.editor.setSource('import');h.editor.read(h.page(['B','B','C']),{token});
 assert.equal(h.fields.cameraGrade.hidden,true);assert.equal(h.fields.photoGrade.hidden,false);
 assert.equal(h.fields.photoGrade.textContent,'Nota 6,67');assert.equal(h.fields.scanScore.dataset.stale,'false');
 assert.doesNotMatch(h.fields.scanScore.innerHTML,/Última leitura/);
});

test('D05: public pending identity yields a visibly provisional local grade and remains pending after manual correction',()=>{
 const h=fixture();h.accept(h.page(undefined,'review'));
 assert.equal(h.fields.scanScore.dataset.identity,'review');assert.equal(h.fields.scanScore.dataset.provisional,'true');
 assert.match(h.fields.scanScore.innerHTML,/Nota provisória 3,33 \/ 10,00/);
 assert.equal(h.fields.cameraGrade.querySelector('.camera-grade-title span').textContent,'NOTA PROVISÓRIA');
 assert.equal(h.editor.current().identity.state,'review');assert.equal(h.editor.current().identity.code,null);
 assert.match(h.fields.status.textContent,/não está vinculada/);
 assert.equal(h.editor.history()[0].identityPending,true);assert.equal(h.editor.history()[0].provisional,true);
 h.row(1).value='A';h.row(1).onchange();assert.equal(h.fields.cameraGradeValue.textContent,'6,67');
 assert.equal(h.fields.scanScore.dataset.identity,'review');assert.equal(h.editor.current().identity.state,'review');
 assert.match(h.fields.captureHistory.children[0].textContent,/nota provisória 6,67.*identificação pendente/);
});

test('D05: partial and inconclusive evidence cannot silently become a provisional numeric grade',()=>{
 for(const patch of [{state:'review',answer:null},{recognition:'partial'}]){
  const h=fixture(),reading=h.page(undefined,'review');Object.assign(reading.observations[0],patch);h.accept(reading);
  assert.match(h.fields.scanScore.innerHTML,/Leitura inconclusiva/);assert.equal(h.fields.cameraGrade.hidden,true);
  assert.equal(h.editor.history()[0].grade,undefined);
  h.row(0).value='A';h.row(0).onchange();
  assert.match(h.fields.scanScore.innerHTML,/Nota provisória 3,33/);
  assert.equal(h.editor.current().identity.state,'review');
 }
 const h=fixture();h.setValid(false);h.accept(h.page(undefined,'review'));
 assert.match(h.fields.scanScore.innerHTML,/Gabarito necessário/);assert.equal(h.fields.cameraGrade.hidden,true);
});

test('private pending identity uses exact pinned weights and 0/1/2 decimals without false read or altered hash',()=>{
 for(const [places,grade]of [[0,'1'],[1,'0,6'],[2,'0,62']]){
  const h=fixture({privatePlan:true,places}),before=JSON.stringify({manifest:h.manifest,plan:h.plan});
  h.accept(h.page(undefined,'review'));
  assert.match(h.fields.scanScore.innerHTML,new RegExp('Nota provisória '+grade.replace(',','[,]')));
  assert.equal(h.fields.cameraGradeValue.textContent,grade);assert.equal(h.editor.current().identity.state,'review');
  assert.equal(h.fields.scanScore.dataset.identity,'review');assert.equal(h.fields.scanScore.dataset.provisional,'true');
  assert.equal(h.editor.history()[0].provisional,true);
  const blocks=h.fields.scanScore.children.at(-1);assert.equal(blocks.attrs['aria-label'],'Notas por bloco');
  assert.equal(blocks.children.length,4);
  assert.equal(JSON.stringify({manifest:h.manifest,plan:h.plan}),before);
  assert.equal(scoreIntegratedPlan(h.plan,h.editor.observations(),{manifest:h.manifest,template:h.template,
   identityState:'review',identityMode:'seven-digit-code',pageCount:1}).complete,false);
 }
});

test('result acceptance rejects old captures, sessions, model/hash/revision/page before showing a new grade',()=>{
 const h=fixture({privatePlan:true}),oldToken=h.accept();
 const token=h.editor.begin();hiddenGrade(h.fields);
 assert.equal(h.editor.read(h.page(),{token:oldToken}),null);hiddenGrade(h.fields);
 for(const patch of [{templateId:'other'},{templateRevision:99},{contentHash:'other'},{page:2},{pageCount:2}]){
  assert.equal(h.editor.read({...h.page(),...patch},{token}),null);hiddenGrade(h.fields);
 }
 h.editor.invalidate();assert.equal(h.editor.read(h.page(),{token}),null);hiddenGrade(h.fields);
 h.accept(h.page(['B','A','A']));assert.equal(h.fields.cameraGradeValue.textContent,'9,38');
 assert.equal(h.editor.current().identity.code,'0001123');
});

test('private selection validation resolving after the next shutter cannot revive the preceding capture grade',async()=>{
 const h=fixture({privatePlan:true,validateSelection:true});h.accept(h.page(undefined,'review'));
 assert.match(h.fields.scanScore.innerHTML,/Conferindo avaliação/);assert.equal(h.fields.cameraGrade.hidden,true);
 h.editor.begin();h.resolveValidation(true);await flush();hiddenGrade(h.fields);
 assert.equal(h.editor.history()[0].grade,undefined);
});

test('a Worker result finishing after a newer shutter is discarded before raster, history or grade presentation',async()=>{
 const h=fixture();h.accept();
 let finish,processingToken;
 h.setWorker(input=>{processingToken=input.token;return new Promise(resolve=>{finish=resolve})});
 const pending=h.editor.process({data:new Uint8ClampedArray(4),w:1,h:1});
 const newer=h.editor.begin();assert.ok(newer.captureId>processingToken.captureId);
 finish({token:processingToken,document:null,sourceOptical:{gray:new Uint8Array(1),width:1,height:1},
  optical:null,reading:h.page(['A','A','A'])});
 await pending;hiddenGrade(h.fields);
 assert.equal(h.editor.history().length,1);assert.equal(h.editor.current(),null);
 h.editor.read(h.page(['B','B','B']),{token:newer});
 assert.equal(h.fields.cameraGradeValue.textContent,'0,00');assert.equal(h.editor.history().length,2);
});

test('private hash mismatch blocks even a complete pending-identity response',()=>{
 const h=fixture({privatePlan:true});h.editor.setSelection({...h.selection,manifestHash:'other'});
 h.accept(h.page(undefined,'review'));
 assert.match(h.fields.scanScore.innerHTML,/Modelo incompatível/);assert.equal(h.fields.cameraGrade.hidden,true);
 assert.equal(h.editor.history()[0].grade,undefined);
});
