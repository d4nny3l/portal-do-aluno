import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createLibraryPlan,editorFromPrivateRecord,assertLibraryModel,mountAssessmentLibrary,LIBRARY_GATEWAY} from '../avaliacoes-biblioteca.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest,DEFAULT_CARD_HEADER} from '../../corretor/v2/omr/render.mjs';
import {createIntegratedPlan,scoreIntegratedPlan,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord} from '../../corretor/v2/assessments/private-contract-adapter.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {createPrivateLibraryController} from '../../corretor/v2/assessments/private-library.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const gitSha=rel=>{const b=fs.readFileSync(path.join(root,rel));return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};
const fnv=str=>{let h=0xcbf29ce484222325n;for(const c of str)h=BigInt.asUintN(64,(h^BigInt(c.charCodeAt(0)))*0x100000001b3n);return h.toString(16).padStart(16,'0')};
const header=()=>({...DEFAULT_CARD_HEADER,title:'Avaliação de Matemática',institution:'Escola sintética',
 subject:'Matemática',className:'Turma sintética 7A',teacher:'Docente sintético',
 grade:'7º ano',date:'2026-11-20',schoolYear:'2026',
 visible:{...DEFAULT_CARD_HEADER.visible,className:true,teacher:true,date:true},
 customFields:[{label:'PROJETO',value:'SINTÉTICO',visible:true}],logoWidthMm:22,secondaryLogoWidthMm:22,logoAspect:1,secondaryLogoAspect:1});
const make=({counts=[10,20],types=['A-D','A-E'],mode='full-page',identityMode='seven-digit-code',h=header()}={})=>{
 let num=0;
 const sections=counts.map((count,i)=>({sectionId:'block-'+(i+1),label:'Bloco '+(i+1),type:types[i%types.length],
  items:Array.from({length:count},()=>({questionId:'question-'+(++num),number:num,type:types[i%types.length]}))}));
 const template=createTemplate(sections,{layoutVersion:'v2',revision:8,title:h.title,
   schoolName:h.institution,identityMode,mode,embeddedSize:mode==='embedded'?{widthMm:120,heightMm:180}:null,metadata:{...h,className:h.className,subject:h.subject,
    date:h.date,teacher:h.teacher,visibleFields:h.visible}});
 const manifest=createCardManifest(template,h,{sectionFrameStyle:'content'});
 const answers=Object.fromEntries(template.questions.map(q=>[q.questionId,q.choices[0]]));
 const values=Object.fromEntries(sections.map((s,i)=>[s.sectionId,String(i===0?6:4)]));
 const editor={version:1,sections,header:h,layoutRevision:8,nextQuestionNumber:num+1,nextSectionOrder:sections.length,
  fields:{assessmentTitle:h.title,assessmentKind:'Prova objetiva',assessmentSubject:h.subject,
   assessmentClass:h.className,assessmentDate:h.date,identityMode,columnCount:'auto',cardMode:mode,
   embeddedWidth:'100',embeddedHeight:'180',type:types[0],count:String(counts[0])},showInstructions:false};
 return {sections,template,manifest,answers,values,editor};
};
const planArgs=m=>({metadata:{title:m.editor.fields.assessmentTitle,subject:m.editor.fields.assessmentSubject,
 kind:m.editor.fields.assessmentKind,className:m.editor.fields.assessmentClass,date:m.editor.fields.assessmentDate},
 sections:m.sections,values:m.values,answers:m.answers,manifest:m.manifest,editor:m.editor});

test('new library is inside Criar avaliação; Corrigir cartões DOM and stylesheet unchanged',()=>{
 const html=read('plataforma/corretor-v2.html'),start=html.indexOf('<section class="corretor-card module-view active" id="criar">'),
  correct=html.indexOf('<section class="corretor-card module-view" id="corrigir">'),
  end=html.indexOf('</section></div></main>',correct);
 assert.ok(start>=0&&correct>start&&end>correct);
 assert.ok(html.slice(start,correct).includes('id="savedAssessments"'));
 assert.ok(!html.slice(correct,end).includes('savedAssessments'));
 assert.equal(fnv(html.slice(correct+'<section class="corretor-card module-view" id="corrigir">'.length,end)),'741a37932ee15259');
 assert.equal(gitSha('plataforma/corretor-v2.css'),'5a2daf6f482f32884a3451ddc0781ee15db597df');
 assert.match(html,/mountAssessmentLibrary\(/);
 assert.match(html,/privateSelection\.manifestHash/);
 assert.doesNotMatch(html.slice(start,correct),/<section[^>]+id="piloto-avaliacoes"/);
});
test('original private library and client remain imports, no new auth/backend or browser storage',()=>{
 const module=read('plataforma/avaliacoes-biblioteca.mjs');
 assert.match(module,/createPrivateAssessmentClient/);
 assert.match(module,/createPrivateLibraryController/);
 assert.equal(LIBRARY_GATEWAY,'https://salta-stats.dannyel-moises.workers.dev/assessments/v1');
 assert.doesNotMatch(module,/localStorage|sessionStorage|indexedDB|document\.cookie|Authorization\s*:|new Worker\(/);
 assert.doesNotMatch(module,/'\/login'|\/auth\/login|\/api\/assessments/);
 for(const item of ['corretor/v2/assessments/private-client.mjs','corretor/v2/assessments/private-library.mjs',
  'corretor/v2/assessments/private-contract-adapter.mjs','corretor/v2/assessments/block-scoring.mjs'])
  assert.ok(fs.existsSync(path.join(root,item)));
});
test('A–D, A–E and C–E varied 1–150 question manifests roundtrip without artificial 60 limit',()=>{
 for(const [count,type]of [[1,'A-D'],[12,'A-E'],[30,'C-E'],[60,'A-D'],[90,'A-E'],[120,'C-E'],[150,'A-E']]){
  const m=make({counts:[count],types:[type]});m.values={'block-1':'10'};
  const {plan,manifest,definition}=createLibraryPlan(planArgs(m));
  assert.equal(manifest.questionCount,count);
  assert.equal(plan.blocks[0].questions.length,count);
  assert.equal(definition.answers.length,count);
  assert.equal(definition.manifest.contentHash,manifest.contentHash);
  assert.equal(importCardManifest(manifest).manifest.contentHash,manifest.contentHash);
 }
});
test('mixed formats, unequal blocks and exact weighted grading',()=>{
 const m=make({counts:[7,13],types:['A-D','C-E']});
 const {plan,definition}=createLibraryPlan(planArgs(m));
 assert.deepEqual(plan.blocks.map(b=>b.questions.length),[7,13]);
 assert.deepEqual(definition.blocks.map(b=>b.valueUnits),['60000','40000']);
 const mark=m.template.questions.map(q=>({questionId:q.questionId,number:q.number,state:'read',answer:q.choices[0]}));
 const result=scoreIntegratedPlan(plan,mark,{template:m.template,manifest:m.manifest,identityMode:'seven-digit-code',identityState:'read'});
 assert.equal(result.total,'10,00');
 for(let i=7;i<20;i++)mark[i].answer=m.template.questions[i].choices.at(-1);
 const partial=scoreIntegratedPlan(plan,mark,{template:m.template,manifest:m.manifest,identityMode:'seven-digit-code',identityState:'read'});
 assert.equal(partial.total,'6,00');
});
test('immutable private record preserves class, customized header, fields and exact manifest',()=>{
 const m=make(),{plan,definition}=createLibraryPlan(planArgs(m));
 const record={id:'11111111-1111-4111-8111-111111111111',revision:2,definition,
  manifestHash:m.manifest.contentHash,scoreScale:10000,totalUnits:plan.totalUnits,status:'issued'};
 const built=planFromPrivateRecord(record);
 assert.equal(built.manifest.contentHash,m.manifest.contentHash);
 const recovered=editorFromPrivateRecord(record,m.editor);
 assert.equal(recovered.editor.fields.assessmentClass,'Turma sintética 7A');
 assert.equal(recovered.editor.fields.assessmentDate,'2026-11-20');
 assert.equal(recovered.editor.header.institution,'Escola sintética');
 assert.equal(recovered.editor.header.teacher,'Docente sintético');
 assert.equal(recovered.editor.header.grade,'7º ano');
 assert.deepEqual(recovered.editor.header.customFields,[{label:'PROJETO',value:'SINTÉTICO',visible:true}]);
 assert.deepEqual(recovered.editor.sections.map(s=>s.items.length),[10,20]);
 assert.equal(recovered.manifest.contentHash,m.manifest.contentHash);
 assert.deepEqual(recovered.plan.blocks.map(b=>b.valueUnits),['60000','40000']);
});
test('no silent conversion for CDU, embedded cards, nominal students or incompatible alternatives',()=>{
 const m=make();
 assert.throws(()=>assertLibraryModel({manifest:m.manifest,editor:m.editor,nominalFields:{code:'1234567'}}),/Limpe nome/);
 const cdu=make({counts:[3],types:['CDU']});
 assert.throws(()=>createLibraryPlan(planArgs(cdu)),/apenas cartão A4|suportado|compatível/i);
 const embedded=make({counts:[3],types:['A-D'],mode:'embedded'});
 assert.throws(()=>createLibraryPlan(planArgs(embedded)),/apenas cartão A4|suportado|compatível/i);
 const incompatible=make({counts:[4],types:['A-D']});
 incompatible.answers['question-1']='E';
 assert.throws(()=>createLibraryPlan(planArgs(incompatible)),/Gabarito|Alternativa|incompatível/i);
});
test('original v2 client handles separate accounts, scope isolation, save/reopen/revisions and selection',async()=>{
 const scope={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
 const other={...scope,classId:'turma-outro-professor'};
 const data=new Map();let actor='teacher-a';
 const fixedId=()=>crypto.randomUUID();
 const fetchFn=async(url,opts)=>{
  const pathname=new URL(url).pathname.slice('/assessments/v1'.length);
  if(opts.method==='GET'&&pathname==='/session')return Response.json({authenticated:true,principalId:actor,epoch:1});
  if(opts.method==='GET'&&pathname==='/grants')return Response.json({grants:[actor==='teacher-a'?scope:other]});
  if(opts.method==='GET'&&pathname==='/assessments'){
   const q=new URL(url).searchParams,gr=actor==='teacher-a'?scope:other;
   if(q.get('classId')!==gr.classId)return Response.json({error:'scope_denied'},{status:403});
   return Response.json({assessments:[...data.values()].filter(x=>x.classId===gr.classId&&x.owner===actor).map(x=>
    ({id:x.id,title:x.definition.title,revision:x.revision,state:x.status,...scope})),nextCursor:null});
  }
  if(opts.method==='PUT'){
   const id=pathname.split('/')[2],body=JSON.parse(opts.body),history=data.get(id)?.history||[];
   if(body.classId!==(actor==='teacher-a'?scope:other).classId)return Response.json({error:'scope_denied'},{status:403});
   if(body.expectedRevision!==history.length)return Response.json({error:'conflict'},{status:409});
   const record={id,revision:history.length+1,definition:body.definition,manifestHash:body.definition.manifest.contentHash,
    scoreScale:10000,totalUnits:'100000',status:body.status,...scope};
   const entry={...record,owner:actor,history:[...history,record]};
   data.set(id,entry);return Response.json({ok:true,id,revision:record.revision,manifestHash:record.manifestHash});
  }
  const opened=pathname.match(/^\/assessments\/([^/]+)\/revisions\/(\d+)$/);
  if(opts.method==='GET'&&opened){
   const entry=data.get(opened[1]);
   if(entry?.owner!==actor)return Response.json({error:'not_found'},{status:404});
   return Response.json({record:entry.history.find(x=>x.revision===Number(opened[2]))});
  }
  const one=pathname.match(/^\/assessments\/([^/]+)$/);
  if(opts.method==='GET'&&one){
   const entry=data.get(one[1]);if(entry?.owner!==actor)return Response.json({error:'not_found'},{status:404});
   return Response.json({record:entry.history.at(-1)});
  }
  const hist=pathname.match(/^\/assessments\/([^/]+)\/revisions$/);
  if(opts.method==='GET'&&hist){
   const entry=data.get(hist[1]);if(entry?.owner!==actor)return Response.json({error:'not_found'},{status:404});
   return Response.json({revisions:entry.history.map(r=>({revision:r.revision,status:r.status}))});
  }
  throw Error(opts.method+' '+pathname);
 };
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:LIBRARY_GATEWAY,fetchFn,uuidFn:fixedId});
 const m=make();let payload=createLibraryPlan(planArgs(m));
 const revision1Definition=structuredClone(payload.definition);
 const ctl=createPrivateLibraryController({client,getDraft:()=>({plan:payload.plan,manifest:payload.manifest})});
 await ctl.initialize();ctl.useScope(scope);
 const first=await ctl.save('issued');assert.equal(first.record.revision,1);
 const id=first.record.id;
 assert.equal(ctl.view().record.id,id);
 const reopened=await client.open(id,1);assert.deepEqual(reopened.definition,payload.definition);
 m.answers['question-1']='B';
 payload=createLibraryPlan(planArgs(m));
 const second=await ctl.save('issued');assert.equal(second.record.revision,2);
 assert.equal(data.get(id).history[0].revision,1);
 assert.deepEqual(data.get(id).history[0].definition,revision1Definition,'first answer map is immutable');
 assert.notDeepEqual(data.get(id).history[0].definition.answers,data.get(id).history[1].definition.answers,'second revision has modified key');
 await ctl.history(id);assert.deepEqual(ctl.view().revisions.map(r=>r.revision),[1,2]);
 const again=createPrivateAssessmentClient({enabled:true,baseUrl:LIBRARY_GATEWAY,fetchFn,uuidFn:fixedId});
 assert.deepEqual((await again.open(id,1)).definition,revision1Definition,'new browser client recovers original historical answer map');
 assert.deepEqual((await again.open(id,2)).definition,payload.definition,'new browser client recovers updated answer map');
 actor='teacher-b';
 await assert.rejects(()=>again.open(id,1),error=>error.status===404);
 await assert.rejects(()=>again.list(null,scope),error=>error.status===403);
});

class SurfaceNode{
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.hidden=false;this.disabled=false;this.value='';
  this.textContent='';this.attrs={};this.dataset={};this.style={}}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=[...items];this.value=''}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(event,handler){this.handlers[event]=handler}
 get options(){return this.children.filter(x=>x.tag==='option')}
}
test('actual Create-tab UI mounts and saves/opens/selects/duplicates without a second login or visible internal IDs',async()=>{
 const m=make({counts:[2],types:['A-E']});m.values={'block-1':'10'};
 const grants={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
 const records=new Map(),selections=new Map();let currentEditor=m.editor,selected=null,nominalCleared=0,appliedExact=null,modelBuilds=0;
 const fetchFn=async(url,init)=>{
  const route=new URL(url).pathname.slice('/assessments/v1'.length),q=new URL(url).searchParams;
  if(route==='/session'&&init.method==='GET')return Response.json({authenticated:true,principalId:'teacher-a',epoch:1});
  if(route==='/grants'&&init.method==='GET')return Response.json({grants:[grants]});
  if(route==='/assessments'&&init.method==='GET'){
   assert.equal(q.get('classId'),grants.classId);
   const assessments=[...records.values()].map(r=>({id:r.id,title:r.definition.title,revision:r.revision,state:r.status,...grants}));
   return Response.json({assessments,nextCursor:null});
  }
  if(route.startsWith('/assessments/')&&init.method==='PUT'){
   const body=JSON.parse(init.body),id=route.split('/')[2],entry=records.get(id),revision=(entry?.revision||0)+1;
   assert.equal(body.expectedRevision,revision-1);
   const record={id,revision,definition:body.definition,manifestHash:body.definition.manifest.contentHash,
    scoreScale:10000,totalUnits:'100000',status:body.status,archived:false,...grants};
   records.set(id,record);return Response.json({ok:true,id,revision,manifestHash:record.manifestHash});
  }
  const current=route.match(/^\/assessments\/([^/]+)$/);
  if(current&&init.method==='GET')return Response.json({record:records.get(current[1])});
  const open=route.match(/^\/assessments\/([^/]+)\/revisions\/(\d+)$/);
  if(open&&init.method==='GET')return Response.json({record:records.get(open[1])});
  const history=route.match(/^\/assessments\/([^/]+)\/revisions$/);
  if(history&&init.method==='GET')return Response.json({revisions:[{revision:records.get(history[1]).revision,status:records.get(history[1]).status}]});
  const duplicate=route.match(/^\/assessments\/([^/]+)\/duplicate$/);
  if(duplicate&&init.method==='POST'){
   const p=JSON.parse(init.body),source=records.get(duplicate[1]);
   const record={...source,id:p.newId,revision:1,status:'draft'};records.set(p.newId,record);
   return Response.json({ok:true,id:p.newId,revision:1,manifestHash:record.manifestHash});
  }
  if(route==='/selections'&&init.method==='POST'){
   const p=JSON.parse(init.body),record=records.get(p.assessmentId);
   selections.set(p.selectionId,record);
   return Response.json({ok:true,id:record.id,revision:record.revision,selectionId:p.selectionId,manifestHash:record.manifestHash});
  }
  const selection=route.match(/^\/selections\/([^/]+)$/);
  if(selection&&init.method==='GET')return Response.json({selectionId:selection[1],record:selections.get(selection[1])});
  throw Error('Unexpected route '+init.method+' '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 const mounted=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>({title:m.editor.fields.assessmentTitle,subject:m.editor.fields.assessmentSubject,
   kind:m.editor.fields.assessmentKind,date:m.editor.fields.assessmentDate,className:m.editor.fields.assessmentClass}),
  getModel:()=>m.manifest,prepareModel:()=>{modelBuilds++;return true},snapshotEditor:()=>currentEditor,
  restoreEditor:e=>{currentEditor=e},applyExactModel:bundle=>{appliedExact=bundle.manifest.contentHash},
  nominalFields:()=>({}),newEditor:()=>{nominalCleared++},
  activateSelection:s=>{selected=s},clearSelection:()=>{selected=null}
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(mounted.controller.view().scope.classId,grants.classId,'unique grant automatically selected');
 assert.equal(host.hidden,false);
 const top=host.children[0],scoring=host.children[1],actions=top.children[2];
 const find=name=>actions.children.find(b=>b.textContent===name);
 for(const name of ['Nova avaliação','Salvar avaliação','Abrir avaliação','Duplicar avaliação','Usar na correção'])
  assert.ok(find(name));
 const selectors=top.children[1];
 assert.equal(selectors.children[0].hidden,true,'unique scope selector hidden');
 const scoreInputs=scoring.children[1];assert.equal(scoreInputs.children.length,1);
 const paste=scoring.children[2].children[0];paste.value='1 A\n2 B';
 await scoring.children[3].handlers.click();
 await find('Salvar avaliação').handlers.click();
 const saved=mounted.controller.view().record;
 assert.ok(saved?.id&&saved.revision===1&&saved.status==='issued');
 const select=selectors.children[1].children[0];
 assert.equal(select.value,saved.id);
 await find('Abrir avaliação').handlers.click();
 assert.equal(mounted.controller.view().record.id,saved.id);
 assert.equal(appliedExact,saved.manifestHash,'opened record must use the immutable stored geometry');
 const beforeResaveBuilds=modelBuilds;
 assert.equal(mounted.getDraft().manifest.contentHash,saved.manifestHash);
 assert.equal(modelBuilds,beforeResaveBuilds,'unmodified record must not regenerate a different layout');
 assert.equal(currentEditor.header.teacher,m.editor.header.teacher);
 await find('Usar na correção').handlers.click();
 assert.equal(selected.assessmentId,saved.id);
 assert.equal(selected.plan.blocks[0].questions.length,2);
 await find('Salvar avaliação').handlers.click();
 assert.equal(selected,null,'newly issued revision must invalidate previous correction-lot selection');
 await find('Duplicar avaliação').handlers.click();
 const copied=mounted.controller.view().record;
 assert.notEqual(copied.id,saved.id);
 assert.equal(copied.status,'draft');
 assert.equal(copied.revision,1);
 assert.equal(top.children[4].textContent.includes(saved.id),false,'status hides internal identifiers');
 assert.equal(nominalCleared,0);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function mountedRaceFixture({onPut=async()=>{},onSelection=async()=>{},onOpen=async()=>{}}={}){
 const m=make({counts:[2],types:['A-E']});m.values={'block-1':'10'};
 const grants={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
 const records=new Map(),selections=new Map(),requestById=new Map(),writeCalls=[];let currentEditor=m.editor,selected=null,nominalCleared=0,appliedExact=null,modelBuilds=0;
 const fetchFn=async(url,init)=>{
  const route=new URL(url).pathname.slice('/assessments/v1'.length),q=new URL(url).searchParams;
  if(route==='/session'&&init.method==='GET')return Response.json({authenticated:true,principalId:'teacher-a',epoch:1});
  if(route==='/grants'&&init.method==='GET')return Response.json({grants:[grants]});
  if(route==='/assessments'&&init.method==='GET'){
   assert.equal(q.get('classId'),grants.classId);
   const assessments=[...records.values()].map(r=>({id:r.id,title:r.definition.title,revision:r.revision,state:r.status,...grants}));
   return Response.json({assessments,nextCursor:null});
  }
  if(route.startsWith('/assessments/')&&init.method==='PUT'){
   const body=JSON.parse(init.body),id=route.split('/')[2],entry=records.get(id),revision=(entry?.revision||0)+1;
   writeCalls.push(structuredClone(body));
   if(requestById.has(body.requestId)){const prior=requestById.get(body.requestId);return Response.json({ok:true,id:prior.id,revision:prior.revision,manifestHash:prior.manifestHash});}
   assert.equal(body.expectedRevision,revision-1);
   const record={id,revision,definition:body.definition,manifestHash:body.definition.manifest.contentHash,
    scoreScale:10000,totalUnits:'100000',status:body.status,archived:false,...grants};
   records.set(id,record);requestById.set(body.requestId,record);
   await onPut({body,record});return Response.json({ok:true,id,revision,manifestHash:record.manifestHash});
  }
  const current=route.match(/^\/assessments\/([^/]+)$/);
  if(current&&init.method==='GET'){await onOpen();return Response.json({record:records.get(current[1])});}
  const open=route.match(/^\/assessments\/([^/]+)\/revisions\/(\d+)$/);
  if(open&&init.method==='GET')return Response.json({record:records.get(open[1])});
  const history=route.match(/^\/assessments\/([^/]+)\/revisions$/);
  if(history&&init.method==='GET')return Response.json({revisions:[{revision:records.get(history[1]).revision,status:records.get(history[1]).status}]});
  const duplicate=route.match(/^\/assessments\/([^/]+)\/duplicate$/);
  if(duplicate&&init.method==='POST'){
   const p=JSON.parse(init.body),source=records.get(duplicate[1]);
   const record={...source,id:p.newId,revision:1,status:'draft'};records.set(p.newId,record);
   return Response.json({ok:true,id:p.newId,revision:1,manifestHash:record.manifestHash});
  }
  if(route==='/selections'&&init.method==='POST'){
   const p=JSON.parse(init.body),record=records.get(p.assessmentId);
   selections.set(p.selectionId,record);
   await onSelection();return Response.json({ok:true,id:record.id,revision:record.revision,selectionId:p.selectionId,manifestHash:record.manifestHash});
  }
  const selection=route.match(/^\/selections\/([^/]+)$/);
  if(selection&&init.method==='GET')return Response.json({selectionId:selection[1],record:selections.get(selection[1])});
  throw Error('Unexpected route '+init.method+' '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 const mounted=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>({title:m.editor.fields.assessmentTitle,subject:m.editor.fields.assessmentSubject,
   kind:m.editor.fields.assessmentKind,date:m.editor.fields.assessmentDate,className:m.editor.fields.assessmentClass}),
  getModel:()=>m.manifest,prepareModel:()=>{modelBuilds++;return true},snapshotEditor:()=>currentEditor,
  restoreEditor:e=>{currentEditor=e},applyExactModel:bundle=>{appliedExact=bundle.manifest.contentHash},
  nominalFields:()=>({}),newEditor:()=>{nominalCleared++},
  activateSelection:s=>{selected=s},clearSelection:()=>{selected=null}
 });

 await tick();
 const top=host.children[0],scoring=host.children[1],actions=top.children[2];
 const button=label=>[...actions.children,...top.children[3].children].find(item=>item.textContent===label);
 const fill=async()=>{
  const area=scoring.children[2].children[0];area.value='1 A\n2 B';
  await scoring.children[3].handlers.click();
 };
 function editTitle(title){
  m.editor.fields.assessmentTitle=title;
  m.editor.header.title=title;
  // The real editor rebuilds the model on title edits; reproduce that.
  const tm=createTemplate(m.sections,{layoutVersion:'v2',revision:8,title,
   schoolName:m.editor.header.institution,identityMode:'seven-digit-code',
   metadata:{...m.editor.header,title}});
  m.manifest=createCardManifest(tm,m.editor.header,{sectionFrameStyle:'content'});
  mounted.onEditorChanged();
 }
 return {mounted,m,host,top,scoring,records,selections,writeCalls,button,fill,editTitle,
  getSelected:()=>selected,getEditor:()=>currentEditor,getPending:()=>mounted.controller.view().pending};
}

test('P0 race SELECT: delayed issued selection cannot revive old answer key after professor edit',async()=>{
 const hold=deferred(),entered=deferred();
 const f=await mountedRaceFixture({onSelection:async()=>{entered.resolve();await hold.promise}});
 await f.fill();await f.button('Salvar avaliação').handlers.click();
 const initial=f.mounted.controller.view().record;
 assert.equal(initial.revision,1);
 const selecting=f.button('Usar na correção').handlers.click();
 await entered.promise;
 f.editTitle('Versão B — posterior à confirmação');
 assert.equal(f.getSelected(),null);
 hold.resolve();
 await selecting;
 assert.equal(f.getSelected(),null,'stale selection must never activate private key');
 assert.equal(f.mounted.controller.view().record.id,initial.id,'preserve writable record for editing B');
 assert.match(f.top.children[4].textContent,/não foram salvas|confirme novamente/);
 await f.button('Usar na correção').handlers.click();
 assert.equal(f.getSelected(),null,'unsaved B cannot silently select old issued A');
 await f.button('Salvar avaliação').handlers.click();
 assert.equal(f.mounted.controller.view().record.revision,2);
 assert.equal(f.records.get(initial.id).definition.title,'Versão B — posterior à confirmação');
 await f.button('Usar na correção').handlers.click();
 assert.equal(f.getSelected()?.revision,2,'only a fresh teacher confirmation can activate revision 2');
});

test('P0 race SAVE: delayed receipt confirms frozen A while edited B remains unsaved and intact',async()=>{
 const hold=deferred(),entered=deferred();let calls=0;
 const f=await mountedRaceFixture({onPut:async()=>{if(++calls===1){entered.resolve();await hold.promise}}});
 await f.fill();
 const writing=f.button('Salvar avaliação').handlers.click();
 await entered.promise;
 const pending=f.getPending();assert.ok(pending?.requestId);
 assert.equal(f.button('Abrir avaliação').disabled,true,'cannot switch context while original PUT is in flight');
 await f.button('Abrir avaliação').handlers.click();
 assert.equal(f.getPending()?.requestId,pending.requestId,'no new navigation may invalidate the pending requestId');
 f.editTitle('Título posterior B');
 hold.resolve();
 await writing;
 const result=f.mounted.controller.view().record;
 assert.equal(result.revision,1);
 assert.equal(result.definition.title,'Avaliação de Matemática');
 assert.equal(f.m.editor.fields.assessmentTitle,'Título posterior B','local edit B must remain visible');
 assert.match(f.top.children[4].textContent,/versão enviada foi salva.*alterações posteriores/i);
 assert.equal(f.getPending(),null,'receipt and verifying GET settled original request');
 await f.button('Salvar avaliação').handlers.click();
 assert.equal(f.mounted.controller.view().record.revision,2);
 assert.equal(f.mounted.controller.view().record.definition.title,'Título posterior B');
 assert.notEqual(f.writeCalls[0].requestId,f.writeCalls[1].requestId,'new teacher save is a new operation');
});

test('P0 retry: edited B cannot change original requestId/body/CAS while lost A receipt is retried',async()=>{
 const hold=deferred(),entered=deferred();let calls=0;
 const f=await mountedRaceFixture({onPut:async()=>{if(++calls===1){entered.resolve();await hold.promise}}});
 await f.fill();
 const writing=f.button('Salvar avaliação').handlers.click();
 await entered.promise;
 const id=f.getPending()?.requestId;assert.ok(id);
 f.editTitle('Outra edição B');
 hold.reject(new Error('synthetic lost acknowledgement'));
 await writing;
 assert.equal(f.getPending()?.requestId,id,'pending operation retains its original requestId');
 assert.equal(f.mounted.controller.view().record,null,'no false save before GET confirmation');
 await f.button('Conferir salvamento').handlers.click();
 assert.equal(f.getPending(),null);
 assert.equal(f.writeCalls.length,2);
 assert.equal(f.writeCalls[0].requestId,id);
 assert.deepEqual(f.writeCalls[0],f.writeCalls[1],'same requestId, immutable body and CAS on retry');
 const saved=f.mounted.controller.view().record;
 assert.equal(saved.revision,1,'idempotent replay cannot create revision 2');
 assert.equal(saved.definition.title,'Avaliação de Matemática');
 assert.equal(f.m.editor.fields.assessmentTitle,'Outra edição B');
 assert.match(f.top.children[4].textContent,/alterações posteriores/i);
});

test('P0 race OPEN: an old GET cannot overwrite edits made while assessment is loading',async()=>{
 const entered=deferred(),hold=deferred();
 const f=await mountedRaceFixture({onOpen:async()=>{entered.resolve();await hold.promise}});
 await f.fill();await f.button('Salvar avaliação').handlers.click();
 const saved=f.mounted.controller.view().record;
 const opening=f.button('Abrir avaliação').handlers.click();
 await entered.promise;
 f.editTitle('Edição local durante abertura');
 hold.resolve();await opening;
 assert.equal(f.m.editor.fields.assessmentTitle,'Edição local durante abertura');
 assert.equal(f.getEditor().fields.assessmentTitle,'Edição local durante abertura');
 assert.equal(f.mounted.controller.view().record,null,'stale open cannot install an older writable record');
 assert.match(f.top.children[4].textContent,/editada durante a abertura/i);
 assert.equal(f.records.get(saved.id).definition.title,'Avaliação de Matemática');
});
