// Synthetic Auth, in-memory D1 and actual private client/controller. No remote API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,scope,packet,definition as legacyDefinition} from './helpers.mjs';
import {createTemplate,createLegacyTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest,DEFAULT_CARD_HEADER} from '../../corretor/v2/omr/render.mjs';
import {createIntegratedPlan,scoreIntegratedPlan} from '../../corretor/v2/assessments/block-scoring.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord} from '../../corretor/v2/assessments/private-contract-adapter.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {editorFromPrivateRecord,assertLibraryModel,mountAssessmentLibrary,EMBEDDED_LIBRARY_VERSION} from '../../plataforma/avaliacoes-biblioteca.mjs';
import {buildPrintDocument} from '../../corretor/v2/omr/export.mjs';
import {readFileSync} from 'node:fs';
import {createEditorSnapshot} from '../../corretor/v2/assessments/editor-snapshot.mjs';

function model({type='A-E',width=120,height=180,identityMode='none',legacy=false}={}){
 const sections=[{sectionId:'block',label:'Bloco',order:0,count:3,type,items:Array.from({length:3},(_,i)=>({questionId:'question-'+(i+1),originalOrder:i+1,number:i+1,type}))}];
 const header={...DEFAULT_CARD_HEADER,title:'Sintética',institution:'Escola sintética',subject:'Matemática',className:'Turma sintética',date:'2026-11-24',visible:{...DEFAULT_CARD_HEADER.visible},customFields:[],showStudentCode:identityMode==='seven-digit-code',logoWidthMm:22,secondaryLogoWidthMm:22,logoAspect:1,secondaryLogoAspect:1};
 const template=(legacy?createLegacyTemplate:createTemplate)(sections,{layoutVersion:legacy?'v1':'v2',revision:8,title:header.title,identityMode,mode:'embedded',embeddedSize:{widthMm:width,heightMm:height},metadata:header});
 const manifest=createCardManifest(template,header,{sectionFrameStyle:'content'});
 const plan=type==='CDU'?null:createIntegratedPlan({metadata:{title:header.title,subject:header.subject,kind:'Prova',date:header.date,className:header.className},sections,values:{block:'10'},answers:Object.fromEntries(template.questions.map(q=>[q.questionId,q.choices[0]])),display:'both',model:manifest,scoreDecimals:1});
 const editor={version:1,sections,header,layoutRevision:8,nextQuestionNumber:4,nextSectionOrder:1,fields:{assessmentTitle:header.title,assessmentKind:'Prova',assessmentSubject:header.subject,assessmentClass:header.className,assessmentDate:header.date,identityMode,cardMode:'embedded',embeddedWidth:String(width),embeddedHeight:String(height),columnCount:'auto',type,count:'3',sectionLabel:''},showInstructions:false};
 const editorSnapshot=type==='CDU'||legacy?undefined:createEditorSnapshot(editor,manifest);
 return {sections,header,template,manifest,plan,editor,editorSnapshot};
}
const client=(h,fetchOverride)=>createPrivateAssessmentClient({
 enabled:true,baseUrl:'https://synthetic/assessments/v1',
 fetchFn:fetchOverride||((url,init={})=>{
  const u=new URL(url);
  return h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:init.method||'GET',...(init.body?{data:JSON.parse(init.body)}:{})});
 })
});
const counts=h=>({...h.db.sqlite.prepare('SELECT (SELECT count(*) FROM av_assessments) roots,(SELECT count(*) FROM av_revisions) revisions,(SELECT count(*) FROM av_requests) receipts').get()});

for(const [type,width,height,identityMode] of [['A-D',100,160,'none'],['A-E',120,180,'manual'],['C-E',180,240,'seven-digit-code']])test(`embedded ${type} ${width}x${height}: exact save/read, physical print, duplicate, immutable edit and selected grading`,async()=>{
 const h=await harness();try{
  const m=model({type,width,height,identityMode}),snapshot=JSON.stringify(m.manifest),a=client(h);
  assert.equal((await a.session()).embeddedLibraryVersion,EMBEDDED_LIBRARY_VERSION);
  assertLibraryModel(m);
  const op=a.prepareSave({...m,scope,status:'issued'}),saved=await a.saveAndVerify(op),id=saved.record.id;
  assert.deepEqual(saved.record.definition,definitionFromLocalPlan(m.plan,m.manifest,m.editorSnapshot));assert.equal(saved.record.manifestHash,m.manifest.contentHash);
  assert.equal((await a.saveAndVerify(op)).receipt.replayed,true);assert.deepEqual(counts(h),{roots:1,revisions:1,receipts:1});
  const previous=structuredClone(m.editor);Object.assign(previous.fields,{cardMode:'full-page',embeddedWidth:'200',embeddedHeight:'290'});
  const restored=editorFromPrivateRecord(await a.open(id,1),previous);
  assert.equal(restored.editor.fields.cardMode,'embedded');assert.equal(restored.editor.fields.embeddedWidth,String(width));assert.equal(restored.editor.fields.embeddedHeight,String(height));
  assert.deepEqual(restored.manifest,m.manifest);assert.deepEqual(restored.plan.blocks,m.plan.blocks);assert.equal(restored.plan.scoreDecimals,1);
  const printed=(await a.request('GET','/assessments/'+id+'/revisions/1/print')).data;
  assert(printed.svg.includes(`width="${width}mm" height="${height}mm"`));assert.equal(printed.manifestHash,m.manifest.contentHash);
  assert.doesNotMatch(JSON.stringify(printed),/"answers"|"correct"|encrypted_json/);
  assert.match(buildPrintDocument(m.template,{manifest:m.manifest}),/@page[^}]*A4/);
  const original=structuredClone(saved.record.definition);
  const copy=await a.duplicateAndVerify(a.prepareDuplicate(id,1));assert.notEqual(copy.record.id,id);assert.equal(copy.record.revision,1);assert.equal(copy.record.status,'draft');assert.deepEqual(copy.record.definition,original);
  const selected=await a.selectAndVerify(a.prepareSelection(id,1));assert.equal(selected.selection.manifestHash,m.manifest.contentHash);
  const next=structuredClone(m.plan);next.blocks[0].questions[0].correct=type==='C-E'?'E':'B';
  const edited=await a.saveAndVerify(a.prepareSave({plan:next,manifest:m.manifest,editorSnapshot:m.editorSnapshot,scope,assessmentId:id,expectedRevision:1,status:'issued'}));assert.equal(edited.record.revision,2);
  assert.deepEqual((await a.open(id,1)).definition,original);assert.equal(edited.record.manifestHash,m.manifest.contentHash);
  const pinned=await a.resumeSelection(selected.selection.selectionId);assert.equal(pinned.revision,1);
  const observations=m.template.questions.map(q=>({questionId:q.questionId,number:q.number,state:'read',answer:q.choices[0],reviewed:true}));
  const result=scoreIntegratedPlan(pinned.plan,observations,{manifest:pinned.manifest,template:pinned.template,identityMode,identityState:'read'});assert.equal(result.total,'10,0');assert.equal(result.correct,3);
  assert.equal(JSON.stringify(m.manifest),snapshot);assert.deepEqual((await a.open(copy.record.id,1)).definition,original);
 }finally{h.close()}
});

test('embedded persistence: lost receipt, denial, expiration, wrong scope and revision conflicts remain safe',async()=>{
 const h=await harness();try{
  const m=model(),base=client(h),op=base.prepareSave({...m,scope,status:'issued'});let lose=true;
  const a=client(h,async(url,init)=>{const u=new URL(url),r=await h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:init.method, ...(init.body?{data:JSON.parse(init.body)}:{})});if(init.method==='PUT'&&lose){lose=false;throw Error('synthetic loss after commit')}return r});
  await assert.rejects(a.saveAndVerify(op),e=>e.code==='network');assert.deepEqual(counts(h),{roots:1,revisions:1,receipts:1});
  const saved=await a.saveAndVerify(op);assert.equal(saved.receipt.replayed,true);
  const race=await Promise.allSettled([0,1].map(()=>base.saveAndVerify(base.prepareSave({...m,scope,assessmentId:saved.record.id,expectedRevision:1,status:'issued'}))));
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
  const before=counts(h);
  const request={...packet(0,{definition:definitionFromLocalPlan(m.plan,m.manifest)})};
  assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:request,actor:null})).status,401);
  assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:request,actor:'unknown'})).status,403);
  assert.equal((await h.request('/assessments/'+saved.record.id,{actor:'b'})).status,404);
  assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:{...request,classId:'not-granted'}})).status,403);
  h.entries.clear();await assert.rejects(base.open(saved.record.id),e=>e.status===401);assert.deepEqual(counts(h),before);
 }finally{h.close()}
});

test('embedded input still rejects nominal, CDU, V1, invalid geometry and exchanged hash bindings',async()=>{
 const h=await harness();try{
  const m=model(),a=client(h),p=definitionFromLocalPlan(m.plan,m.manifest);
  assert.throws(()=>assertLibraryModel({...m,nominalFields:{name:'synthetic individual'}}),/nominais|Limpe nome/);
  const cdu=model({type:'CDU',width:180,height:240});assert.throws(()=>assertLibraryModel(cdu),/não pode ser salvo/);
  const v1=model({legacy:true});assert.throws(()=>definitionFromLocalPlan(v1.plan,v1.manifest),/não suportado/);
  for(const manifest of [cdu.manifest,v1.manifest]){
   const d={...p,manifest};assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:packet(0,{definition:d})})).status,400);
  }
  const broken=structuredClone(p);broken.manifest.technicalRegions.fiducials[0].x=999;
  assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:packet(0,{definition:broken})})).status,400);
  assert.deepEqual(counts(h),{roots:0,revisions:0,receipts:0});
  const r=await a.saveAndVerify(a.prepareSave({...m,scope,status:'issued'}));
  assert.throws(()=>planFromPrivateRecord({...r.record,manifestHash:'exchanged-hash'}),/Hash/);
  assert.throws(()=>assertLibraryModel({...m,editor:{...m.editor,fields:{...m.editor.fields,embeddedHeight:'181'}}}),/formato físico/);
 }finally{h.close()}
});

test('historical A4 definitions without scoreDecimals are read and copied without upgrading stored JSON',async()=>{
 const h=await harness();try{
  for(const legacy of [false,true]){
   const original=legacyDefinition({legacy}),id=crypto.randomUUID();assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:packet(0,{definition:original})})).status,201);
   const r=await client(h).open(id,1);assert.deepEqual(r.definition,original);assert.equal(Object.hasOwn(r.definition.display,'scoreDecimals'),false);
   const copy=await client(h).duplicateAndVerify(client(h).prepareDuplicate(id,1));assert.deepEqual(copy.record.definition,original);
  }
 }finally{h.close()}
});

test('archived V2 header-0/header-1 A4 manifests keep exact values, dimensions and geometry through the private service',async()=>{
 const h=await harness();try{
  for(const name of ['v2-header0.manifest.json','v2-header1.manifest.json']){
   const manifest=JSON.parse(readFileSync(new URL('../../corretor/v2/tests/fixtures/'+name,import.meta.url))),d=legacyDefinition();
   const blocks=new Map();for(const q of manifest.questions){if(!blocks.has(q.sectionId))blocks.set(q.sectionId,{blockId:q.sectionId,label:'Bloco histórico',valueUnits:'10000',questionIds:[]});blocks.get(q.sectionId).questionIds.push(q.questionId)}
   Object.assign(d,{manifest,blocks:[...blocks.values()],answers:manifest.questions.map(q=>({questionId:q.questionId,correct:q.choices[0]}))});
   const id=crypto.randomUUID(),before=JSON.stringify(manifest);assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:packet(0,{definition:d})})).status,201);
   const opened=await client(h).open(id,1);assert.deepEqual(opened.definition.manifest,manifest);assert.equal(opened.manifestHash,manifest.contentHash);
   const printed=(await client(h).request('GET','/assessments/'+id+'/revisions/1/print')).data;assert(printed.svg.includes('width="210mm" height="297mm"'));assert.equal(printed.manifestHash,manifest.contentHash);
  }
 }finally{h.close()}
});

class Node{
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.attrs={};this.dataset={};this.style={}}
 append(...x){this.children.push(...x)}replaceChildren(...x){this.children=[...x];this.value=''}setAttribute(k,v){this.attrs[k]=v}addEventListener(k,h){this.handlers[k]=h}get options(){return this.children.filter(x=>x.tag==='option')}
}
const settle=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}assert(fn(),'UI did not settle')};
for(const capability of [false,'unknown',true])test(`native library capability ${capability}: no unsupported PUT; supported editor/save/open/selection keeps exact frame`,async()=>{
 const h=await harness({lifecycle:true});try{
  let m=model(),editor=m.editor,selected=null;const host=new Node('section'),panel=new Node('section');let puts=0;
  const doc={getElementById:id=>({savedAssessments:host,criar:panel}[id]||null),createElement:t=>new Node(t)};
  const fetchFn=async(url,init={})=>{const u=new URL(url);if(init.method==='PUT')puts++;const r=await h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:init.method||'GET',...(init.body?{data:JSON.parse(init.body)}:{})});if(capability!==true&&u.pathname.endsWith('/session')){const d=await r.json();if(capability==='unknown')d.embeddedLibraryVersion='salta-embedded-library-v9';else delete d.embeddedLibraryVersion;return Response.json(d)}return r};
  const ui=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,getSections:()=>m.sections,getMetadata:()=>m.plan.metadata,getModel:()=>m.manifest,prepareModel:()=>true,snapshotEditor:()=>editor,restoreEditor:e=>{editor=e},applyExactModel:()=>{},nominalFields:()=>({}),newEditor:()=>{},activateSelection:s=>{selected=s},clearSelection:()=>{selected=null}});
  await settle(()=>ui.controller.view().scope);const actions=host.children[0].children[2],button=icon=>actions.children.find(x=>x.attrs['data-action-icon']===icon);
  if(capability!==true){assert.equal(button('save').disabled,true);assert.throws(()=>ui.getDraft(),/Não é possível salvar/);assert.equal(puts,0);return}
  const scoring=host.children[1];scoring.children[2].children[0].value='1 A\n2 A\n3 A';await scoring.children[3].handlers.click();
  await button('save').handlers.click();const record=ui.controller.view().record;assert.ok(record?.id);assert.equal(puts,1);assert.equal(selected?.assessmentId,record.id);assert.equal(selected.manifestHash,m.manifest.contentHash);
  editor={...editor,fields:{...editor.fields,cardMode:'full-page',embeddedWidth:'200',embeddedHeight:'290'}};
  await button('open').handlers.click();
  assert.equal(editor.fields.cardMode,'embedded');assert.equal(editor.fields.embeddedWidth,'120');assert.equal(editor.fields.embeddedHeight,'180');
  assert.deepEqual(ui.getDraft().manifest,m.manifest);
  await button('duplicate').handlers.click();const copy=ui.controller.view().record;assert.notEqual(copy.id,record.id);assert.equal(copy.status,'draft');assert.equal(copy.manifestHash,m.manifest.contentHash);
  assert.equal(selected,null,'draft copy must not retain prior correction');
  const catalog=host.children[0].children[1].children[1].children[0];catalog.value=record.id;await catalog.onchange();
  assert.equal(button('correct'),undefined);assert.equal(selected?.assessmentId,record.id);assert.equal(selected.manifest.mode,'embedded');assert.equal(selected.manifestHash,m.manifest.contentHash);
 }finally{h.close()}
});
