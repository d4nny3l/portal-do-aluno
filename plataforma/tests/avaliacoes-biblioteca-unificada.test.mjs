import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createLibraryPlan,editorFromPrivateRecord,assertLibraryModel,mountAssessmentLibrary,LIBRARY_GATEWAY,assessmentLabel,validScorePrecision} from '../avaliacoes-biblioteca.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest,DEFAULT_CARD_HEADER} from '../../corretor/v2/omr/render.mjs';
import {createIntegratedPlan,scoreIntegratedPlan,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord} from '../../corretor/v2/assessments/private-contract-adapter.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {createPrivateLibraryController} from '../../corretor/v2/assessments/private-library.mjs';
import {enrichCatalogRows} from '../catalogo-avaliacoes.mjs';

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

const catalogRecord=(row,m)=>{
 const {plan,definition}=createLibraryPlan(planArgs(m));
 return {id:row.id,revision:row.revision??1,definition:{...definition,title:row.title},
  manifestHash:definition.manifest.contentHash,scoreScale:10000,totalUnits:plan.totalUnits,
  status:'issued',archived:false,institutionId:row.institutionId,classId:row.classId,periodId:row.periodId};
};

test('new library is inside Criar avaliação; DOM de Corrigir cartões preservado e CSS no snapshot candidato aprovado',()=>{
 const html=read('plataforma/corretor-v2.html'),start=html.indexOf('<section class="corretor-card module-view active" id="criar">'),
  correct=html.indexOf('<section class="corretor-card module-view" id="corrigir">'),
  end=html.indexOf('</section></div></main>',correct);
 assert.ok(start>=0&&correct>start&&end>correct);
 assert.ok(html.slice(start,correct).includes('id="savedAssessments"'));
 assert.ok(!html.slice(correct,end).includes('savedAssessments'));
 assert.equal(fnv(html.slice(correct+'<section class="corretor-card module-view" id="corrigir">'.length,end)),'23293fec36e8ed66');
 assert.equal(gitSha('plataforma/corretor-v2.css'),'176dbecdf3abaf4680b7dfef2e97cca92acf738d');
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
async function mountedRaceFixture({onPut=async()=>{},onSelection=async()=>{},onOpen=async()=>{},counts=[2],restoreOutOfOrder=false,windowOverrides={},scoreFormatVersion=null}={}){
 const m=make({counts,types:counts.map(()=> 'A-E')});
 m.sections.forEach((section,i)=>{section.order=restoreOutOfOrder?counts.length-i-1:i});
 const grants={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
 const records=new Map(),selections=new Map(),requestById=new Map(),writeCalls=[];let currentEditor=m.editor,selected=null,nominalCleared=0,appliedExact=null,modelBuilds=0,snapshotOverride=null;
 const fetchFn=async(url,init)=>{
  const route=new URL(url).pathname.slice('/assessments/v1'.length),q=new URL(url).searchParams;
  if(route==='/session'&&init.method==='GET')return Response.json({authenticated:true,principalId:'teacher-a',epoch:1,...(scoreFormatVersion?{scoreFormatVersion}:{})});
  if(route==='/grants'&&init.method==='GET')return Response.json({grants:[grants]});
  if(route==='/assessments'&&init.method==='GET'){
   assert.equal(q.get('classId'),grants.classId);
   const assessments=[...records.values()].map(r=>({id:r.id,title:r.definition.title,revision:r.revision,state:r.status,...grants}));
   return Response.json({assessments,nextCursor:null});
  }
  if(route.startsWith('/assessments/')&&init.method==='PUT'){
   const body=JSON.parse(init.body),id=route.split('/')[2],entry=records.get(id),revision=(entry?.revision||0)+1;
   writeCalls.push(structuredClone(body));
   if(requestById.has(body.requestId)){const prior=requestById.get(body.requestId);await onPut({body,record:prior,replay:true});return Response.json({ok:true,id:prior.id,revision:prior.revision,manifestHash:prior.manifestHash});}
   assert.equal(body.expectedRevision,revision-1);
   const record={id,revision,definition:body.definition,manifestHash:body.definition.manifest.contentHash,
    scoreScale:10000,totalUnits:body.definition.blocks.reduce((n,b)=>n+BigInt(b.valueUnits),0n).toString(),status:body.status,archived:false,...grants};
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
 const host=new SurfaceNode('section'),createPanel=new SurfaceNode('section');
 const formatField=new SurfaceNode('label'),formatSelect=new SurfaceNode('select');
 const doc={getElementById:id=>id==='savedAssessments'?host:id==='criar'?createPanel:
  id==='scoreFormatField'?formatField:id==='scoreFormatSelect'?formatSelect:null,
  createElement:tag=>new SurfaceNode(tag)};
 const mounted=mountAssessmentLibrary({document:doc,window:{confirm:()=>true,...windowOverrides},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>({title:m.editor.fields.assessmentTitle,subject:m.editor.fields.assessmentSubject,
   kind:m.editor.fields.assessmentKind,date:m.editor.fields.assessmentDate,className:m.editor.fields.assessmentClass}),
  getModel:()=>m.manifest,prepareModel:()=>{modelBuilds++;return true},snapshotEditor:()=>snapshotOverride??currentEditor,
  restoreEditor:e=>{currentEditor=e},applyExactModel:bundle=>{appliedExact=bundle.manifest.contentHash},
  nominalFields:()=>({}),newEditor:()=>{nominalCleared++},
  activateSelection:s=>{selected=s},clearSelection:()=>{selected=null}
 });

 await tick();
 const top=host.children[0],scoring=host.children[1],actions=top.children[2];
 const button=label=>[...actions.children,...top.children[3].children].find(item=>item.textContent===label);
 const fill=async()=>{
  const area=scoring.children[2].children[0];
  area.value=m.sections.flatMap(s=>s.items).map(q=>q.number+' '+(q.number===2?'B':'A')).join('\n');
  await scoring.children[3].handlers.click();
  if(counts.length>1){
   for(let i=0;i<counts.length;i++){
    const input=scoring.children[1].children[i].children[0];
    input.value=String(i===0?6:4);input.oninput();
   }
  }
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
 // Simulate native structural buttons: a capturing click, synchronous onclick
 // mutation, and no input/change notification from the original editor.
 const silentClick=async(kind)=>{
  assert.ok(createPanel.handlers.click,'Create panel must observe native button clicks');
  createPanel.handlers.click({target:{closest:()=>null}});
  if(kind==='Adicionar bloco'){
   const number=1+Math.max(...m.sections.flatMap(s=>s.items.map(q=>q.number)));
   m.sections.push({sectionId:'block-added',label:'Bloco adicional',order:m.sections.length,
    type:'A-E',items:[{questionId:'question-'+number,number,type:'A-E'}]});
  }else if(kind==='Remover')m.sections.pop();
  else if(kind==='Mover seção')m.sections.reverse();
  else if(kind==='Restaurar ordem')m.sections.sort((a,b)=>a.order-b.order);
  else throw Error('Unknown native button '+kind);
  await tick();
 };
 return {mounted,m,host,top,scoring,records,selections,writeCalls,button,fill,editTitle,silentClick,formatField,formatSelect,
  freezeSnapshot:()=>{snapshotOverride=structuredClone(currentEditor)},
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
 assert.match(f.top.children[4].textContent,/avaliação enviada foi salva.*alterações posteriores/i);
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


const structuralButtons=['Adicionar bloco','Remover','Mover seção','Restaurar ordem'];
test('P0 structural buttons: delayed SELECT never reactivates an old key without input/change',async t=>{
 for(const kind of structuralButtons)await t.test(kind,async()=>{
  const entered=deferred(),hold=deferred();
  const f=await mountedRaceFixture({
   counts:[2,1],restoreOutOfOrder:kind==='Restaurar ordem',
   onSelection:async()=>{entered.resolve();await hold.promise}
  });
  await f.fill();await f.button('Salvar avaliação').handlers.click();
  const id=f.mounted.controller.view().record.id;
  f.freezeSnapshot(); // Only getSections() can reveal the silent structural change.
  const selecting=f.button('Usar na correção').handlers.click();
  await entered.promise;
  await f.silentClick(kind);
  assert.equal(f.getSelected(),null);
  hold.resolve();await selecting;
  assert.equal(f.getSelected(),null,'old key cannot return after '+kind);
  assert.equal(f.mounted.controller.view().record.id,id,'keep writable revision for B');
  assert.match(f.top.children[4].textContent,/não foram salvas|confirme novamente/i);
  assert.equal(f.button('Usar na correção').disabled,true);
 });
});

test('P0 structural buttons: an already active selection is cleared without an input/change event',async t=>{
 for(const kind of structuralButtons)await t.test(kind,async()=>{
  const f=await mountedRaceFixture({counts:[2,1],restoreOutOfOrder:kind==='Restaurar ordem'});
  await f.fill();await f.button('Salvar avaliação').handlers.click();
  await f.button('Usar na correção').handlers.click();
  assert.ok(f.getSelected(),'issued selection must be active before mutation');
  await f.silentClick(kind);
  assert.equal(f.getSelected(),null,'already selected key must be cleared after '+kind);
  assert.equal(f.button('Usar na correção').disabled,true);
  assert.match(f.top.children[4].textContent,/alterações ainda não salvas/i);
 });
});

test('P0 structural buttons: delayed PUT preserves A receipt but never declares B saved',async t=>{
 for(const kind of structuralButtons)await t.test(kind,async()=>{
  const entered=deferred(),hold=deferred();
  const f=await mountedRaceFixture({
   counts:[2,1],restoreOutOfOrder:kind==='Restaurar ordem',
   onPut:async()=>{entered.resolve();await hold.promise}
  });
  await f.fill();
  const writing=f.button('Salvar avaliação').handlers.click();
  await entered.promise;
  const original=f.getPending()?.requestId;assert.ok(original);
  const before=JSON.stringify(f.m.sections);
  await f.silentClick(kind);
  assert.notEqual(JSON.stringify(f.m.sections),before);
  assert.equal(f.getPending()?.requestId,original);
  hold.resolve();await writing;
  const saved=f.mounted.controller.view().record;
  assert.equal(saved.revision,1);
  assert.equal(f.getPending(),null);
  assert.equal(f.writeCalls[0].requestId,original);
  assert.equal(f.writeCalls[0].expectedRevision,0);
  assert.match(f.top.children[4].textContent,/avaliação enviada foi salva.*alterações posteriores/i);
  assert.equal(f.button('Usar na correção').disabled,true);
 });
});

test('P0 structural OPEN: a delayed GET cannot overwrite a silent change in getSections()',async()=>{
 const entered=deferred(),hold=deferred();
 const f=await mountedRaceFixture({counts:[2,1],onOpen:async()=>{entered.resolve();await hold.promise}});
 await f.fill();await f.button('Salvar avaliação').handlers.click();
 const saved=f.mounted.controller.view().record;
 const opening=f.button('Abrir avaliação').handlers.click();
 await entered.promise;
 f.freezeSnapshot();
 await f.silentClick('Remover');
 hold.resolve();await opening;
 assert.equal(f.m.sections.length,1);
 assert.equal(f.mounted.controller.view().record,null,'stale GET cannot replace local structure');
 assert.match(f.top.children[4].textContent,/editada durante a abertura/i);
 assert.equal(f.records.get(saved.id).revision,1);
});

test('P0 structural retry: requestId, body and CAS are unchanged after silent section edits',async()=>{
 const entered=deferred(),hold=deferred();let calls=0;
 const f=await mountedRaceFixture({counts:[2,1],onPut:async()=>{if(++calls===1){entered.resolve();await hold.promise}}});
 await f.fill();
 const writing=f.button('Salvar avaliação').handlers.click();
 await entered.promise;
 const requestId=f.getPending().requestId;
 await f.silentClick('Mover seção');
 hold.reject(new Error('synthetic acknowledgement lost'));await writing;
 assert.equal(f.getPending()?.requestId,requestId);
 await f.button('Conferir salvamento').handlers.click();
 assert.equal(f.writeCalls.length,2);
 assert.deepEqual(f.writeCalls[0],f.writeCalls[1],'frozen HTTP payload and CAS must replay byte-for-byte');
 assert.equal(f.mounted.controller.view().record.revision,1);
 assert.match(f.top.children[4].textContent,/alterações posteriores/i);
});


test('UX-79B catalog labels omit missing fields and technical active states',()=>{
 assert.equal(assessmentLabel({title:'Prova',subject:'Matemática',className:'7º A'}),'Prova - Matemática - 7º A');
 assert.equal(assessmentLabel({title:'Prova',subject:'',className:''}),'Prova');
 assert.equal(assessmentLabel({title:'Prova',state:'active'}),'Prova');
 assert.equal(assessmentLabel({title:'Prova',definition:{subject:'Ciências',manifest:{header:{className:'6º B'}}}}),'Prova - Ciências - 6º B');
});

test('UX-79B score precision is strict and never silently rounds',async()=>{
 assert.ok(!read('plataforma/avaliacoes-biblioteca.mjs').includes('· até 2 decimais'))
 for(const value of ['10','10,1','0.05','0,00','25.99'])assert.equal(validScorePrecision(value),true,value);
 for(const value of ['1.234','2,999','3,','1.','-2.50','abc',''])assert.equal(validScorePrecision(value),false,value);
 const f=await mountedRaceFixture();
 await f.fill();
 const amount=f.scoring.children[1].children[0].children[0];
 amount.value='3,125';amount.oninput();
 assert.equal(amount.value,'10','three decimals are rejected without changing the previous value');
 amount.value='3,12';amount.oninput();
 assert.equal(amount.value,'3,12','two decimals are accepted');
});

test('UX-79B automatic current-revision opening, accessible actions and hidden legacy controls',async()=>{
 const f=await mountedRaceFixture();
 await f.fill();
 await f.button('Salvar avaliação').handlers.click();
 const first=f.mounted.controller.view().record;
 await f.button('Duplicar avaliação').handlers.click();
 const copy=f.mounted.controller.view().record;
 assert.notEqual(copy.id,first.id);
 const selectors=f.top.children[1],catalog=selectors.children[1].children[0];
 assert.equal(selectors.children[2].hidden,true,'public revision selector hidden; history remains internal');
 const option=catalog.options.find(x=>x.value===first.id);
 assert.equal(option?.textContent,'Avaliação de Matemática - Matemática - Turma sintética 7A');
 assert.equal(catalog.options.some(x=>x.textContent.includes('active')),false);
 for(const name of ['Abrir avaliação','Atualizar','Anterior','Próxima','Conferir salvamento'])
  assert.equal(f.button(name).hidden,true,name+' is not visible');
 const deletion=f.button('Excluir avaliação');
 assert.equal(deletion.hidden,true,'deletion must not be offered without real backend');
 assert.equal(deletion.disabled,true,'no simulated delete action');
 for(const button of f.top.children[2].children){
  assert.ok(button.textContent,'icon buttons must retain accessible names');
  assert.ok(button.attrs['data-action-icon'],'icon token required');
 }
 catalog.value=first.id;
 await catalog.onchange();
 assert.equal(f.mounted.controller.view().record.id,first.id,'selection opens latest revision automatically');
 assert.equal(f.mounted.controller.view().record.revision,1);
 assert.equal(f.mounted.controller.view().editorMode,'opened');
});

test('UX-79B manual key editor is placed in Criar, private JSON importer is hidden only while selected',()=>{
 const html=read('plataforma/corretor-v2.html');
 assert.match(html,/manualKeyPanel\.append\(manualKeyHeading,\$\('answerKey'\)\.closest\('label'\)\)/);
 assert.match(html,/\$\('criar'\)\.append\(manualKeyPanel\)/);
 assert.match(html,/manualJson\.hidden=privateMode/);
 assert.match(html,/setPrivateCorrectionUi\(true\)/);
 assert.match(html,/setPrivateCorrectionUi\(false\)/);
 const css=read('plataforma/avaliacoes-biblioteca.css');
 assert.match(css,/\[data-action-icon="save"\]::before/);
 assert.match(css,/\[data-action-icon="correct"\]::before/);
});


test('UX-79C enriches all 13 authenticated labels with bounded GETs and a session-only cache',async()=>{
 const grant={institutionId:'school',classId:'class-1',periodId:'2026'};
 const rows=Array.from({length:13},(_,i)=>({id:'id-'+i,revision:1,title:'Prova '+i,state:'active',...grant}));
 const cache=new Map();let inFlight=0,peak=0,calls=0,selected=false;
 const fetchRecord=async id=>{
  selected=false;calls++;inFlight++;peak=Math.max(peak,inFlight);
  await tick();inFlight--;
  const i=Number(id.slice(3));
  return {id,revision:1,definition:{title:'Prova '+i,subject:i===3?'':'Matemática',
   manifest:{header:{className:i===3?'':'7º A'}}},...grant};
 };
 const first=await enrichCatalogRows(rows,{open:fetchRecord,isCurrent:()=>true,cache});
 assert.equal(calls,13,'metadata fetched before a single selection or opening');
 assert.ok(peak<=2,'authenticated reads limited to two concurrent requests');
 assert.equal(selected,false);
 assert.equal(first.length,13);
 assert.equal(assessmentLabel(first[0]),'Prova 0 - Matemática - 7º A');
 assert.equal(assessmentLabel(first[3]),'Prova 3','only actually absent fields omitted');
 assert.ok(first.every(x=>!assessmentLabel(x).includes(x.classId)),'opaque scope ID never becomes readable class');
 assert.equal(cache.size,13);
 await enrichCatalogRows(rows,{open:fetchRecord,isCurrent:()=>true,cache});
 assert.equal(calls,13,'same session and revision uses in-memory metadata');
 rows[0].revision=2;
 await enrichCatalogRows(rows,{open:async id=>({id,revision:2,definition:{title:'Prova atualizada',subject:'Ciências',
  manifest:{header:{className:'8º B'}}},...grant}),isCurrent:()=>true,cache});
 assert.equal(cache.size,14,'new revision is not satisfied by stale metadata');
});

test('UX-79C 401/403 metadata errors clear context; stale response cannot publish options',async t=>{
 const grant={institutionId:'school',classId:'class-1',periodId:'2026'};
 const rows=[{id:'id-one',revision:1,title:'Privada',...grant}];
 for(const status of [401,403])await t.test(String(status),async()=>{
  let active=true,denied=0;const cache=new Map();
  await assert.rejects(()=>enrichCatalogRows(rows,{
   open:async()=>{const e=Error('forbidden');e.status=status;throw e;},
   isCurrent:()=>active,cache,
   onDenied:()=>{active=false;denied++;cache.clear();}
  }),e=>e.status===status);
  assert.equal(denied,1);
  assert.equal(cache.size,0);
 });
 const pending=deferred();let started=false,active=true;const cache=new Map();
 const loading=enrichCatalogRows(rows,{open:async()=>{started=true;return pending.promise;},
  isCurrent:()=>active,cache,concurrency:1});
 for(let n=0;n<10&&!started;n++)await tick();
 assert.equal(started,true);
 active=false;pending.resolve({id:'id-one',revision:1,definition:{title:'NÃO EXIBIR'},...grant});
 assert.equal(await loading,null,'old response discarded after context revocation');
 assert.equal(cache.size,0);
});

test('UX-79C actual library never publishes private metadata when detail GET returns 401/403',async t=>{
 for(const status of [401,403])await t.test('HTTP '+status,async()=>{
  const m=make({counts:[2],types:['A-E']});
  const grant={institutionId:'school',classId:'class-one',periodId:'2026'};
  const id=crypto.randomUUID();let sessionRequests=0;
  const fetchFn=async(url)=>{
   const route=new URL(url).pathname.slice('/assessments/v1'.length);
   if(route==='/session'){sessionRequests++;return Response.json({authenticated:true,principalId:'teacher-a',epoch:1});}
   if(route==='/grants')return Response.json({grants:[grant]});
   if(route==='/assessments')return Response.json({assessments:[{id,revision:1,title:'Avaliação sigilosa',...grant}],nextCursor:null});
   if(route==='/assessments/'+id+'/revisions/1')return Response.json({code:'denied'},{status});
   throw Error('Unexpected '+route);
  };
  const host=new SurfaceNode('section'),doc={getElementById:key=>key==='savedAssessments'?host:null,
   createElement:tag=>new SurfaceNode(tag)};
  const library=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
   getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
   getModel:()=>m.manifest,prepareModel:()=>true,snapshotEditor:()=>m.editor,
   restoreEditor:()=>{},nominalFields:()=>({}),newEditor:()=>{},
   activateSelection:()=>{},clearSelection:()=>{}});
  const catalog=host.children[0].children[1].children[1].children[0];
  for(let n=0;n<35&&sessionRequests<2;n++)await tick();
  assert.ok(sessionRequests>=2,'denied metadata invalidates the session before reconnect attempt');
  assert.equal(library.controller.view().scope,null,'no authorized scope remains after denial');
  assert.equal(catalog.options.length,1,'private title is never published');
  assert.ok(!catalog.options.some(o=>o.textContent.includes('sigilosa')));
  assert.equal(catalog.disabled,true);
 });
});


test('UX-79C consolidated: 13 paginated options remain locked until all private metadata is fetched',async()=>{
 const m=make({counts:[2],types:['A-E']});
 const grant={institutionId:'school',classId:'class-a',periodId:'2026'};
 const rows=Array.from({length:13},(_,i)=>({id:crypto.randomUUID(),title:'Prova '+(i+1),revision:1,state:'active',...grant}));
 const gate=deferred(),entered=deferred();let reads=0,inflight=0,peak=0,pages=0,editRestores=0;
 const fetchFn=async(url,req)=>{
  const u=new URL(url),route=u.pathname.slice('/assessments/v1'.length);
  if(route==='/session')return Response.json({authenticated:true,principalId:'teacher-A',epoch:1});
  if(route==='/grants')return Response.json({grants:[grant]});
  if(route==='/assessments'){
   pages++;const pos=u.searchParams.get('after')?rows.findIndex(x=>x.id===u.searchParams.get('after'))+1:0;
   const part=rows.slice(pos,pos+10);
   return Response.json({assessments:part,nextCursor:pos+part.length<rows.length?part.at(-1).id:null});
  }
  const id=route.match(/^\/assessments\/([0-9a-f-]{36})\/revisions\/1$/)?.[1];
  if(id){
   reads++;inflight++;peak=Math.max(peak,inflight);entered.resolve();await gate.promise;inflight--;
   const row=rows.find(x=>x.id===id),base=catalogRecord(row,m);
   return Response.json({record:{...base,definition:{...base.definition,subject:'História'}}});
  }
  throw Error('Unexpected '+req.method+' '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 const mounted=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,getModel:()=>m.manifest,
  prepareModel:()=>true,snapshotEditor:()=>m.editor,restoreEditor:()=>{editRestores++},
  newEditor:()=>{},nominalFields:()=>({}),activateSelection:()=>{},clearSelection:()=>{}});
 const catalog=host.children[0].children[1].children[1].children[0];
 await entered.promise;
 assert.equal(catalog.disabled,true,'no selection until all 13 metadata responses are validated');
 assert.equal(catalog.options.length,1,'no partial catalog exposed');
 assert.equal(editRestores,0,'detail enrichment never opens an editor');
 gate.resolve();
 for(let n=0;n<80&&catalog.options.length!==14;n++)await tick();
 assert.equal(pages,2);assert.equal(reads,13);assert.ok(peak<=2);
 assert.equal(catalog.disabled,false);
 assert.equal(catalog.options.length,14);
 for(const row of rows)assert.equal(catalog.options.find(x=>x.value===row.id)?.textContent,
  row.title+' - História - Turma sintética 7A');
 assert.equal(mounted.controller.view().record,null);
});

test('UX-79C consolidated: 201-item catalog is not partially published and does no detail GET',async()=>{
 const m=make({counts:[2],types:['A-E']});
 const grant={institutionId:'school',classId:'class-a',periodId:'2026'};
 const rows=Array.from({length:201},(_,i)=>({id:crypto.randomUUID(),revision:1,title:'Exame '+i,...grant}));
 let pages=0,details=0;
 const fetchFn=async(url,req)=>{
  const u=new URL(url),route=u.pathname.slice('/assessments/v1'.length);
  if(route==='/session')return Response.json({authenticated:true,principalId:'teacher-A',epoch:1});
  if(route==='/grants')return Response.json({grants:[grant]});
  if(route==='/assessments'){
   pages++;const after=u.searchParams.get('after'),pos=after?rows.findIndex(x=>x.id===after)+1:0;
   const part=rows.slice(pos,pos+10);
   return Response.json({assessments:part,nextCursor:pos+part.length<rows.length?part.at(-1).id:null});
  }
  if(route.startsWith('/assessments/')){details++;throw Error('No detail request allowed beyond cap');}
  throw Error('Unexpected '+req.method+' '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,getModel:()=>m.manifest,
  prepareModel:()=>true,snapshotEditor:()=>m.editor,restoreEditor:()=>{},
  newEditor:()=>{},nominalFields:()=>({}),activateSelection:()=>{},clearSelection:()=>{}});
 const top=host.children[0],catalog=top.children[1].children[1].children[0],
  refresh=top.children[3].children.find(x=>x.textContent==='Atualizar');
 for(let n=0;n<100&&pages<21;n++)await tick();
 assert.equal(pages,21);assert.equal(details,0);
 assert.equal(catalog.options.length,1,'no partial/incomplete 200-item catalog');
 assert.equal(catalog.disabled,true);
 assert.equal(refresh.hidden,true,'201-item hard cap is not a transient/HTTP recoverable failure');
 assert.match(top.children[4].textContent,/200 avaliações/);
});

test('UX-79C consolidated: 429 metadata failure permits retry without releasing partial labels',async()=>{
 const m=make({counts:[2],types:['A-E']});
 const grant={institutionId:'school',classId:'class-a',periodId:'2026'};
 const row={id:crypto.randomUUID(),title:'Confidencial',revision:1,...grant};
 let fail=true,reads=0;
 const fetchFn=async(url,req)=>{
  const route=new URL(url).pathname.slice('/assessments/v1'.length);
  if(route==='/session')return Response.json({authenticated:true,principalId:'teacher-A',epoch:1});
  if(route==='/grants')return Response.json({grants:[grant]});
  if(route==='/assessments')return Response.json({assessments:[row],nextCursor:null});
  if(route==='/assessments/'+row.id+'/revisions/1'){
   reads++;return fail?Response.json({code:'rate_limited'},{status:429}):
    Response.json({record:catalogRecord(row,m)});
  }
  throw Error('Unexpected '+req.method+' '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 const library=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,getModel:()=>m.manifest,
  prepareModel:()=>true,snapshotEditor:()=>m.editor,restoreEditor:()=>{},
  newEditor:()=>{},nominalFields:()=>({}),activateSelection:()=>{},clearSelection:()=>{}});
 const top=host.children[0],catalog=top.children[1].children[1].children[0],
  refresh=top.children[3].children.find(x=>x.textContent==='Atualizar');
 for(let n=0;n<40&&refresh.hidden;n++)await tick();
 assert.equal(reads,1);assert.equal(catalog.options.length,1);assert.equal(catalog.disabled,true);
 assert.equal(refresh.hidden,false);
 assert.ok(library.controller.view().session,'rate limit does not revoke valid teacher');
 fail=false;await refresh.handlers.click();
 assert.equal(reads,2);assert.equal(catalog.options.length,2);
 assert.equal(catalog.options[1].textContent,'Confidencial - Matemática - Turma sintética 7A');
 assert.equal(catalog.disabled,false);
});

test('UX-79C uses official Lucide save and camera paths without replacing button names',()=>{
 const library=read('plataforma/avaliacoes-biblioteca.css');
 const camera=read('plataforma/corretor-v2.css');
 const html=read('plataforma/corretor-v2.html');
 const extract=(css,selector)=>{
  const line=css.split('\n').find(x=>x.includes(selector)&&x.includes('mask:'));
  assert.ok(line,selector+' SVG mask CSS exists');
  const match=line.match(/url\("data:image\/svg\+xml,([^"]+)"\)/);
  assert.ok(match);
  return decodeURIComponent(match[1]);
 };
 const saveSvg=extract(library,'button[data-action-icon="save"]::before');
 const cameraSvg=extract(camera,'#camera::before');
 assert.match(saveSvg,/M15\.2 3a2 2 0 0 1 1\.4\.6/);
 assert.match(saveSvg,/M17 21v-7/);
 assert.match(cameraSvg,/M13\.997 4a2 2 0 0 1 1\.76/);
 assert.match(cameraSvg,/<circle cx="12" cy="13" r="3"/);
 assert.doesNotMatch(library,/content:"▣"/);
 assert.match(html,/<button id="camera" type="button">Abrir câmera<\/button>/);
 for(const message of ["'Abrir câmera'","'Fechar câmera'","'Cancelar abertura'"])
  assert.ok(html.includes("$('camera').textContent="+message),'text remains visible for '+message);
 assert.match(library,/background:currentColor/);
 assert.match(camera,/background:currentColor/);
});

test('UX-79B fetches all internal catalog pages without exposing pagination controls',async()=>{
 const m=make({counts:[2],types:['A-E']});
 const grant={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
 const ids=Array.from({length:11},()=>crypto.randomUUID());
 const rows=ids.map((id,i)=>({id,title:'Avaliação '+(i+1),revision:1,state:'active',...grant}));
 let requests=0;
 const fetchFn=async(url,init)=>{
  const target=new URL(url),route=target.pathname.slice('/assessments/v1'.length);
  if(route==='/session')return Response.json({authenticated:true,principalId:'teacher-a',epoch:1});
  if(route==='/grants')return Response.json({grants:[grant]});
  if(route==='/assessments'&&init.method==='GET'){
   requests++;
   const after=target.searchParams.get('after');
   const offset=after?ids.indexOf(after)+1:0;
   const items=rows.slice(offset,offset+10);
   const nextCursor=offset+items.length<rows.length?items.at(-1).id:null;
   return Response.json({assessments:items,nextCursor});
  }
  if(/^\/assessments\/[^/]+\/revisions\/1$/.test(route)&&init.method==='GET')
   return Response.json({record:catalogRecord(rows.find(x=>route==='/assessments/'+x.id+'/revisions/1'),m)});
  throw Error('Unexpected '+init.method+' '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
  getModel:()=>m.manifest,prepareModel:()=>true,snapshotEditor:()=>m.editor,
  restoreEditor:()=>{},nominalFields:()=>({}),newEditor:()=>{},
  activateSelection:()=>{},clearSelection:()=>{}});
 const catalog=host.children[0].children[1].children[1].children[0];
 for(let step=0;step<16&&catalog.options.length!==12;step++)await tick();
 assert.equal(requests,2,'11 rows should be loaded via two pages');
 assert.equal(catalog.options.length,12,'placeholder plus all eleven evaluation options');
 assert.ok(catalog.options.slice(1).every(x=>/^Avaliação \d+ - Matemática - Turma sintética 7A$/.test(x.textContent)),
  'each of 11 labels is complete before first opening');
 assert.equal(catalog.options.some(x=>x.textContent.includes('active')),false);
 for(const button of host.children[0].children[3].children.slice(1))
  assert.equal(button.hidden,true,'internal navigation and retry are not public');
});


test('UX-79B P0 privacy: 401/403 purge 13 cached assessments, metadata and editable key',async t=>{
 for(const [code,trigger] of [[401,'open'],[403,'list']])await t.test(code+' '+trigger,async()=>{
  const m=make({counts:[2],types:['A-E']});
  const grant={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
  const ids=Array.from({length:13},()=>crypto.randomUUID());
  const rows=ids.map((id,i)=>({id,title:'Privada '+(i+1),revision:1,state:'active',...grant}));
  const {definition}=createLibraryPlan(planArgs(m));
  const record={id:ids[0],revision:1,definition,manifestHash:definition.manifest.contentHash,
   scoreScale:10000,totalUnits:'60000',status:'issued',archived:false,...grant};
  let deny=false,cleared=0;
  const fetchFn=async(url,req)=>{
   const u=new URL(url),route=u.pathname.slice('/assessments/v1'.length);
   if(route==='/session')return Response.json({authenticated:true,principalId:'teacher-a',epoch:1});
   if(route==='/grants')return Response.json({grants:[grant]});
   if(route==='/assessments'){
    if(deny&&trigger==='list')return Response.json({code:'denied'},{status:code});
    const after=u.searchParams.get('after'),pos=after?ids.indexOf(after)+1:0;
    const items=rows.slice(pos,pos+10);
    return Response.json({assessments:items,nextCursor:pos+items.length<rows.length?items.at(-1).id:null});
   }
   if(route.startsWith('/assessments/')&&req.method==='GET'){
    if(deny&&trigger==='open')return Response.json({code:'denied'},{status:code});
    if(route==='/assessments/'+ids[0])return Response.json({record});
    if(/^\/assessments\/[^/]+\/revisions\/1$/.test(route))return Response.json({record:catalogRecord(rows.find(x=>route==='/assessments/'+x.id+'/revisions/1'),m)});
    if(route==='/assessments/'+ids[0]+'/revisions')return Response.json({revisions:[{revision:1,status:'issued'}]});
   }
   throw Error('Unexpected '+route);
  };
  const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
   createElement:tag=>new SurfaceNode(tag)};
  const mounted=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
   getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
   getModel:()=>m.manifest,prepareModel:()=>true,snapshotEditor:()=>m.editor,
   restoreEditor:()=>{},nominalFields:()=>({}),newEditor:()=>{
    cleared++;for(const key of ['assessmentTitle','assessmentSubject','assessmentClass'])m.editor.fields[key]='';
    m.editor.header.title='';
   },activateSelection:()=>{},clearSelection:()=>{}});
  const top=host.children[0],catalog=top.children[1].children[1].children[0];
  for(let step=0;step<16&&catalog.options.length!==14;step++)await tick();
  assert.equal(catalog.options.length,14,'two pages of private titles are visible before revocation');
  catalog.value=ids[0];await catalog.onchange();
  assert.ok(catalog.options.some(x=>x.textContent.includes('Matemática')),`loaded private metadata cached: ${JSON.stringify({record:mounted.controller.view().record?.id,phase:mounted.controller.view().phase,labels:catalog.options.map(x=>x.textContent),status:top.children[4].textContent})}`);
  deny=true;
  if(trigger==='open'){catalog.value=ids[1];await catalog.onchange();}
  else await assert.rejects(()=>mounted.controller.list(),e=>e.status===code);
  assert.equal(mounted.controller.view().session,null);
  assert.equal(mounted.controller.view().scope,null);
  assert.equal(catalog.options.length,1,'all cached private titles were purged');
  assert.ok(!catalog.options.some(x=>x.textContent.includes('Privada')||x.textContent.includes('Matemática')));
  assert.equal(catalog.value,'','no previous assessment may be selected');
  assert.equal(m.editor.fields.assessmentTitle,'','editor title cleared');
  assert.ok(cleared>=1,'private editor reset after lost authorization');
  mounted.render();
  assert.equal(catalog.options.length,1,'later renders must never expose old cache');
 });
});

test('UX-79C P0 privacy: scope switch discards hydrated catalog and late detail replies',async()=>{
 const m=make({counts:[2],types:['A-E']});
 const grantA={institutionId:'salta-hml-20261119',classId:'class-a',periodId:'2026-11-piloto'};
 const grantB={...grantA,classId:'class-b'};
 const ids=Array.from({length:13},()=>crypto.randomUUID());
 const rowsA=ids.map((id,i)=>({id,title:'A privada '+(i+1),revision:1,state:'active',...grantA}));
 const onlyB={id:crypto.randomUUID(),title:'B exclusiva',revision:1,state:'active',...grantB};
 const entered=deferred(),release=deferred();let opensOfA=0;
 const fetchFn=async(url,request)=>{
  const u=new URL(url),route=u.pathname.slice('/assessments/v1'.length);
  if(route==='/session')return Response.json({authenticated:true,principalId:'teacher-a',epoch:1});
  if(route==='/grants')return Response.json({grants:[grantA,grantB]});
  if(route==='/assessments'){
   const src=u.searchParams.get('classId')==='class-a'?rowsA:[onlyB];
   const after=u.searchParams.get('after'),pos=after?src.findIndex(x=>x.id===after)+1:0;
   const part=src.slice(pos,pos+10);
   return Response.json({assessments:part,nextCursor:pos+part.length<src.length?part.at(-1).id:null});
  }
  if(/^\/assessments\/[^/]+(?:\/revisions\/1)?$/.test(route)){
   const row=[...rowsA,onlyB].find(x=>route==='/assessments/'+x.id||route==='/assessments/'+x.id+'/revisions/1');
   if(!row)throw Error('Unknown detail '+route);
   if(row.id===ids[0]&&++opensOfA===2){entered.resolve();await release.promise;}
   return Response.json({record:catalogRecord(row,m)});
  }
  throw Error('Unexpected '+request.method+' '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 const mounted=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
  getModel:()=>m.manifest,prepareModel:()=>true,snapshotEditor:()=>m.editor,
  restoreEditor:()=>{},nominalFields:()=>({}),newEditor:()=>{},activateSelection:()=>{},clearSelection:()=>{}});
 for(let n=0;n<12&&mounted.controller.view().grants.length!==2;n++)await tick();
 mounted.controller.useScope(grantA);
 await mounted.loadCatalog();
 const catalog=host.children[0].children[1].children[1].children[0];
 assert.equal(catalog.options.length,14);
 assert.ok(catalog.options.some(x=>x.textContent==='A privada 1 - Matemática - Turma sintética 7A'));
 catalog.value=ids[0];const opening=catalog.onchange();await entered.promise;
 mounted.controller.useScope(grantB);mounted.render();
 assert.equal(catalog.options.length,1,'old private catalog purged before new GET');
 await mounted.loadCatalog();
 assert.ok(catalog.options.some(x=>x.textContent.startsWith('B exclusiva - ')));
 assert.equal(catalog.options.some(x=>x.textContent.includes('A privada')),false);
 release.resolve();await opening;mounted.render();
 assert.equal(catalog.options.some(x=>x.textContent.includes('A privada')),false,'late GET cannot repopulate old scope');
 assert.equal(mounted.controller.view().record,null);
});

test('UX-79B P0 recovery: two failures then contextual manual retry replays identical PUT',async()=>{
 let tries=0;const timers=[],events={};
 const fakeWindow={setTimeout:fn=>{timers.push(fn);return timers.length;},addEventListener:(event,fn)=>{events[event]=fn;},
  navigator:{onLine:true}};
 const f=await mountedRaceFixture({windowOverrides:fakeWindow,onPut:async()=>{
  if(++tries<=2)throw Error('synthetic network unavailable');
 }});
 await f.fill();
 assert.equal(f.button('Tentar novamente').hidden,true);
 await f.button('Salvar avaliação').handlers.click();
 const original=f.getPending()?.requestId;assert.ok(original);
 assert.equal(timers.length,1,'only one automatic retry scheduled');
 assert.equal(f.button('Tentar novamente').hidden,true,'manual control waits for failed automatic retry');
 timers.shift()();await tick();await tick();
 assert.equal(tries,2);
 assert.equal(f.getPending()?.requestId,original);
 assert.equal(timers.length,0,'no uncontrolled auto retry loop');
 assert.equal(f.button('Tentar novamente').hidden,false,'retry shown only after repeated failures');
 assert.equal(f.button('Tentar novamente').disabled,false);
 await f.button('Tentar novamente').handlers.click();
 assert.equal(tries,3);
 assert.equal(f.getPending(),null);
 assert.equal(f.button('Tentar novamente').hidden,true,'button disappears after confirmation');
 assert.equal(f.mounted.controller.view().record.revision,1);
 assert.equal(f.writeCalls.length,3);
 assert.deepEqual(f.writeCalls[0],f.writeCalls[1]);
 assert.deepEqual(f.writeCalls[1],f.writeCalls[2],'requestId, payload, scope and CAS all frozen');
 assert.equal(f.records.size,1,'confirmed replay must not create a second assessment');
});

test('UX-79B P0 recovery: offline timer, one online attempt and eventual manual recovery',async()=>{
 let tries=0;const timers=[],events={};
 const navigator={onLine:false};
 const f=await mountedRaceFixture({windowOverrides:{
  navigator,setTimeout:fn=>{timers.push(fn);return timers.length;},
  addEventListener:(name,fn)=>{events[name]=fn}
 },onPut:async()=>{if(++tries<=2)throw Error('synthetic connection lost')}});
 await f.fill();await f.button('Salvar avaliação').handlers.click();
 const requestId=f.getPending().requestId;
 assert.equal(timers.length,1);
 timers.shift()();await tick();
 assert.equal(tries,1,'no request during offline state');
 assert.equal(f.button('Tentar novamente').hidden,false);
 navigator.onLine=true;events.online();await tick();await tick();
 assert.equal(tries,2);
 events.online();await tick();
 assert.equal(tries,2,'repeated online events do not create retry loops');
 assert.equal(f.getPending()?.requestId,requestId);
 await f.button('Tentar novamente').handlers.click();
 assert.equal(tries,3);
 assert.equal(f.getPending(),null);
 assert.equal(f.button('Tentar novamente').hidden,true);
 assert.deepEqual(f.writeCalls[0],f.writeCalls[2]);
});

test('UX-79B P0 messaging: physical batch confirmation and reader status reveal no hashes or revision numbers',async()=>{
 const messages=[];
 const f=await mountedRaceFixture({windowOverrides:{confirm:message=>{messages.push(message);return true}}});
 await f.fill();await f.button('Salvar avaliação').handlers.click();
 await f.button('Usar na correção').handlers.click();
 assert.equal(messages.length,1);
 assert.match(messages[0],/Avaliação de Matemática/);
 assert.match(messages[0],/cartão físico|lote/i);
 assert.match(messages[0],/gabaritos diferentes/i);
 assert.doesNotMatch(messages[0],/versão\s+\d+|revisão\s+\d+|[a-f0-9]{32,}/i);
 const ui=read('plataforma/avaliacoes-biblioteca.mjs');
 const html=read('plataforma/corretor-v2.html');
 assert.doesNotMatch(ui,/Avaliação aberta · versão/);
 assert.doesNotMatch(ui,/versão '\+details\.revision/);
 assert.doesNotMatch(html,/scanModelStatus'\)\.textContent=[^\n]*(?:\.version|contentHash|\.revision)/);
 assert.doesNotMatch(html,/confirmada para correção\. Confira o lote físico\.';.*selection\.revision/);
 assert.match(html,/activeManifest\.contentHash!==privateSelection\.manifestHash/,'cryptographic binding retained internally');
});


test('P0-80-RF-02 reinitialize fails closed before I/O; A session, epoch and grants never remain in B',async()=>{
 const grantA={institutionId:'school',classId:'class-A',periodId:'2026'};
 const grantB={...grantA,classId:'class-B'};
 let active={principalId:'teacher-A',epoch:1,grants:[grantA]},heldSession=null;
 let revocations=0;
 const client={
  enabled:true,
  session:async()=>{
   if(heldSession){const hold=heldSession;heldSession=null;return hold.promise;}
   return {principalId:active.principalId,epoch:active.epoch};
  },
  grants:async()=>active.grants,
  list:async()=>({assessments:[{id:'private-A',title:'Secret A',...grantA}],nextCursor:null}),
  open:async()=>({id:'private-A',revision:1,manifestHash:'hash-A',...grantA}),
  resumeSelection:async()=>({selectionId:'selection-A',assessmentId:'private-A',revision:1,manifestHash:'hash-A',scope:grantA}),
  classifyError:e=>e.status===401?'session':e.status===403?'forbidden':'unavailable'
 };
 const ctl=createPrivateLibraryController({client,getDraft:()=>({}),onSelection:sel=>{if(!sel)revocations++}});
 await ctl.initialize();ctl.useScope(grantA);
 await ctl.list();await ctl.open('private-A');await ctl.resumeSelection('selection-A');
 assert.equal(ctl.view().record.id,'private-A');
 assert.equal(ctl.view().selection.assessmentId,'private-A');
 const entered=deferred();heldSession=entered;active={principalId:'teacher-B',epoch:2,grants:[grantB]};
 const reauth=ctl.initialize();
 assert.equal(ctl.view().session,null,'old principal invalidated before remote /session response');
 assert.deepEqual(ctl.view().grants,[],'old grants not retained during loading');
 assert.equal(ctl.view().scope,null);
 assert.deepEqual(ctl.view().rows,[]);
 assert.equal(ctl.view().record,null);
 assert.equal(ctl.view().selection,null);
 assert.equal(ctl.view().editorMode,'blocked');
 assert.ok(revocations>=1,'old private correction selection invalidated');
 await assert.rejects(()=>ctl.list(),/escopo|indisponível/i);
 entered.resolve({principalId:'teacher-B',epoch:2});await reauth;
 assert.equal(ctl.view().session.principalId,'teacher-B');
 assert.deepEqual(ctl.view().grants,[grantB]);
 assert.equal(ctl.view().scope,null,'a grant requires explicit new scope choice');
 assert.equal(ctl.view().pending,null);
 assert.deepEqual(ctl.view().rows,[]);
 assert.throws(()=>ctl.useScope(grantA),/não concedido/i);
 ctl.useScope(grantB);
 assert.equal(ctl.view().scope.classId,'class-B');
 active={principalId:'teacher-B',epoch:3,grants:[grantB]};
 await ctl.initialize();
 assert.equal(ctl.view().session.epoch,3);
 assert.equal(ctl.view().scope,null,'epoch change invalidates even otherwise identical grant');
 active={principalId:'teacher-B',epoch:3,grants:[]};
 await ctl.initialize();
 assert.deepEqual(ctl.view().grants,[]);
 assert.equal(ctl.view().scope,null,'revoked grants never keep the prior scope');
});

test('P0-80-RF-02 old async GET and failed 401/403 initialization cannot revive any prior record',async t=>{
 for(const code of [401,403])await t.test('reauth '+code,async()=>{
  const grant={institutionId:'school',classId:'class-A',periodId:'2026'};
  const late=deferred(),enter=deferred();let holdOpen=false,failed=false,applied=0;
  const client={
   enabled:true,session:async()=>{if(failed)throw Object.assign(Error('revoked'),{status:code});return {principalId:'A',epoch:1}},
   grants:async()=>[grant],
   open:async()=>{
    if(holdOpen){enter.resolve();return late.promise;}
    return {id:'private-A',revision:1,...grant};
   },
   classifyError:e=>e.status===401?'session':e.status===403?'forbidden':'network'
  };
  const ctl=createPrivateLibraryController({client,getDraft:()=>({}),
   applyRecord:()=>{applied++}});
  await ctl.initialize();ctl.useScope(grant);
  holdOpen=true;
  const pendingOpen=ctl.open('private-A');await enter.promise;
  failed=true;
  await assert.rejects(()=>ctl.initialize(),e=>e.status===code);
  assert.equal(ctl.view().session,null);
  assert.equal(ctl.view().scope,null);
  assert.equal(ctl.view().record,null);
  assert.deepEqual(ctl.view().rows,[]);
  late.resolve({id:'private-A',revision:1,...grant});
  assert.equal(await pendingOpen,null,'stale GET discarded by generation');
  assert.equal(applied,0,'no old record applied after invalid session');
  assert.equal(ctl.view().record,null);
 });
});

test('P0-80-RF-02 old pending PUT remains unretryable after teacher reinitialize',async()=>{
 const grant={institutionId:'school',classId:'class-A',periodId:'2026'};
 let active='A',calls=0;
 const client={
  enabled:true,
  session:async()=>({principalId:active,epoch:active==='A'?1:2}),
  grants:async()=>active==='A'?[grant]:[{...grant,classId:'class-B'}],
  prepareSave:()=>({method:'PUT',path:'/assessments/private-A',payload:{requestId:'frozen-A',expectedRevision:0,...grant}}),
  saveAndVerify:async()=>{calls++;throw Error('network lost receipt')},
  classifyError:()=> 'network'
 };
 const ctl=createPrivateLibraryController({client,getDraft:()=>({plan:{},manifest:{}})});
 await ctl.initialize();ctl.useScope(grant);
 await assert.rejects(()=>ctl.save('issued'),/network lost receipt/);
 assert.equal(ctl.view().pending.requestId,'frozen-A');
 active='B';await ctl.initialize();
 assert.equal(ctl.view().pending,null,'old request never follows new principal');
 assert.equal(ctl.view().scope,null);
 await assert.rejects(()=>ctl.retry(),/Não há operação pendente/);
 assert.equal(calls,1,'no old PUT retry against teacher B');
});


// Extract actual callbacks from the inline Corretor script instead of copying
// their logic. The harness stubs rendering, not the private-data teardown.
function realReaderCallbacks(){
 const html=read('plataforma/corretor-v2.html');
 const startActivate=html.indexOf('function activatePrivateCorrection(selection){');
 const startClear=html.indexOf('function clearPrivateCorrection(){');
 const endClear=html.indexOf('\nfunction assessmentEditorState()',startClear);
 const startApply=html.indexOf('function applyAssessmentModel(');
 const endApply=html.indexOf('\nassessmentBank=await',startApply);
 assert.ok(startActivate>0&&startClear>startActivate&&endClear>startClear&&startApply>endClear&&endApply>startApply);
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',readOnly:false,textContent:'',innerHTML:'',
   replaceChildren(){this.innerHTML='';this.children=[]}});
  return nodes.get(id);
 };
 let privateMode=false;
 const code=[
  "let privateSelection=null,privateModelLoaded=false,template=null,activeManifest=null,activeSvg='',exactScanModel=false;",
  html.slice(startActivate,endClear),html.slice(startApply,endApply),
  "({activatePrivateCorrection,applyAssessmentModel,clearPrivateCorrection,setSelection:x=>{privateSelection=x;},",
  "state:()=>({privateSelection,privateModelLoaded,template,activeManifest,activeSvg,exactScanModel})})"
 ].join('\n');
 const reader=runInNewContext(code,{
  importCardManifest,renderTemplateSvg:()=>'<svg id="private-model"></svg>',
  $:node,clearAssessmentReview:()=>{},
  setPrivateCorrectionUi:mode=>{privateMode=mode;},setExportAvailability:()=>{},syncScanInputs:()=>{},
  keyTextForPlan:()=> '1 A\n2 B',formatScore:()=> '10,00',POINT_SCALE
 });
 return {reader,node,privateMode:()=>privateMode};
}

test('P0-80-RF-01 inline Corretor scrubs private model without selection but retains manual import',()=>{
 const m=make({counts:[2],types:['A-E']});
 const {reader,node}=realReaderCallbacks();
 reader.applyAssessmentModel({title:'Private title before selection',revision:1,manifest:m.manifest},{privateAssessment:true});
 assert.equal(reader.state().privateSelection,null);
 assert.equal(reader.state().privateModelLoaded,true);
 assert.match(node('scanModelStatus').textContent,/Private title before selection/);
 assert.ok(reader.state().activeManifest);
 reader.clearPrivateCorrection();
 assert.equal(reader.state().activeManifest,null);
 assert.equal(reader.state().template,null);
 assert.equal(reader.state().activeSvg,'');
 assert.equal(node('preview').innerHTML,'');
 assert.doesNotMatch(node('scanModelStatus').textContent,/Private title before selection/);
 assert.equal(node('answerKey').value,'');
 assert.equal(node('answerKey').readOnly,false);
 reader.applyAssessmentModel({title:'Manual model',manifest:m.manifest},{privateAssessment:false});
 const manual=reader.state().activeManifest;
 reader.clearPrivateCorrection();
 assert.equal(reader.state().activeManifest,manual,'manual model preserved');
 assert.match(node('scanModelStatus').textContent,/Manual model/);
 reader.applyAssessmentModel({title:'Other private',revision:2,manifest:m.manifest},{privateAssessment:true});
 reader.setSelection({selectionId:'selection-test'});
 node('answerKey').value='1 A';node('answerKey').readOnly=true;
 reader.clearPrivateCorrection();
 assert.equal(reader.state().privateSelection,null);
 assert.equal(reader.state().activeManifest,null);
 assert.equal(node('answerKey').value,'');
});


test('P1-80-FINAL actual activation marks selection private, teardown scrubs all private reader state',()=>{
 const m=make({counts:[2],types:['A-E']});
 const {reader,node,privateMode}=realReaderCallbacks();
 const selected={
  manifest:m.manifest,manifestHash:m.manifest.contentHash,revision:2,
  plan:{metadata:{title:'Avaliação particular da professora A'},totalUnits:'100000'}
 };
 reader.activatePrivateCorrection(selected);
 assert.equal(reader.state().privateSelection,selected,'actual correction callback retains verified selection');
 assert.equal(reader.state().privateModelLoaded,true,'selection is explicitly private');
 assert.equal(reader.state().activeManifest.contentHash,m.manifest.contentHash);
 assert.ok(reader.state().template,'immutable private template installed');
 assert.match(node('scanModelStatus').textContent,/Avaliação particular da professora A/);
 assert.match(node('preview').innerHTML,/private-model/);
 assert.equal(node('answerKey').readOnly,true);
 assert.match(node('answerKey').value,/1 A/);
 assert.equal(node('scanMaxScore').readOnly,true);
 assert.equal(node('scanMaxScore').value,'10,00');
 assert.equal(node('scanMaxScore').type,'text');
 assert.equal(privateMode(),true);
 node('scanScore').innerHTML='<strong>Nota privada: 9,25</strong>';
 node('scanScore').hidden=false;
 reader.clearPrivateCorrection();
 assert.equal(reader.state().privateSelection,null);
 assert.equal(reader.state().privateModelLoaded,false);
 assert.equal(reader.state().activeManifest,null);
 assert.equal(reader.state().template,null);
 assert.equal(reader.state().activeSvg,'');
 assert.equal(reader.state().exactScanModel,false);
 assert.equal(node('preview').innerHTML,'');
 assert.equal(node('scanScore').innerHTML,'','hidden private score must be removed from DOM');
 assert.equal(node('answerKey').value,'');
 assert.equal(node('answerKey').readOnly,false);
 assert.equal(node('scanMaxScore').value,'10.00');
 assert.equal(node('scanMaxScore').readOnly,false);
 assert.equal(node('scanMaxScore').type,'number');
 assert.equal(privateMode(),false,'manual controls restored');
 assert.doesNotMatch(node('scanModelStatus').textContent,/Avaliação particular da professora A/);
 reader.clearPrivateCorrection(); // invalidation is idempotent
 assert.equal(reader.state().activeManifest,null);
 reader.applyAssessmentModel({title:'Modelo manual independente',manifest:m.manifest});
 const manual=reader.state().activeManifest;
 reader.clearPrivateCorrection();
 assert.equal(reader.state().activeManifest,manual,'traditional manual reader remains intact');
 assert.match(node('scanModelStatus').textContent,/Modelo manual independente/);
});

test('P0-80-RF-01 actual adapter + Corretor callback clears private reader on 401 and 403',async t=>{
 for(const code of [401,403])await t.test('HTTP '+code,async()=>{
  const m=make({counts:[2],types:['A-E']});
  const {reader,node}=realReaderCallbacks();
  const grant={institutionId:'school',classId:'class-1',periodId:'2026'},id=crypto.randomUUID();
  const {definition}=createLibraryPlan(planArgs(m));
  const record={id,revision:1,definition,manifestHash:definition.manifest.contentHash,
   scoreScale:10000,totalUnits:'60000',status:'issued',archived:false,...grant};
  const rows=Array.from({length:13},(_,i)=>({id:i?crypto.randomUUID():id,
   title:'Confidential '+(i+1),revision:1,state:'active',...grant}));
  let revoked=false;
  const fetchFn=async(url,req)=>{
   const u=new URL(url),route=u.pathname.slice('/assessments/v1'.length);
   if(route==='/session')return Response.json({authenticated:true,principalId:'A',epoch:1});
   if(route==='/grants')return Response.json({grants:[grant]});
   if(route==='/assessments'){
    if(revoked)return Response.json({code:'unauthorized'},{status:code});
    const after=u.searchParams.get('after'),pos=after?rows.findIndex(x=>x.id===after)+1:0;
    const part=rows.slice(pos,pos+10);
    return Response.json({assessments:part,nextCursor:pos+part.length<rows.length?part.at(-1).id:null});
   }
   if(route==='/assessments/'+id)return Response.json({record});
   if(/^\/assessments\/[^/]+\/revisions\/1$/.test(route))return Response.json({record:catalogRecord(rows.find(x=>route==='/assessments/'+x.id+'/revisions/1'),m)});
   if(route==='/assessments/'+id+'/revisions')return Response.json({revisions:[{revision:1,status:'issued'}]});
   throw Error('Unexpected '+req.method+' '+route);
  };
  const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
   createElement:tag=>new SurfaceNode(tag)};
  let restored=m.editor;
  const library=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
   getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
   getModel:()=>m.manifest,prepareModel:()=>true,
   snapshotEditor:()=>restored,restoreEditor:e=>{restored=e},nominalFields:()=>({}),
   newEditor:()=>{restored={...m.editor,fields:{...m.editor.fields,assessmentTitle:''}};},
   applyExactModel:bundle=>reader.applyAssessmentModel(bundle,{privateAssessment:true}),
   activateSelection:s=>reader.setSelection(s),clearSelection:()=>reader.clearPrivateCorrection()});
  const catalog=host.children[0].children[1].children[1].children[0];
  for(let i=0;i<16&&catalog.options.length<14;i++)await tick();
  assert.equal(catalog.options.length,14);
  catalog.value=id;await catalog.onchange();
  assert.equal(reader.state().privateSelection,null);
  assert.match(node('scanModelStatus').textContent,/Avaliação de Matemática/);
  assert.ok(reader.state().activeManifest);
  revoked=true;
  await assert.rejects(()=>library.controller.list(),e=>e.status===code);
  assert.equal(library.controller.view().session,null);
  assert.equal(catalog.options.length,1);
  assert.equal(reader.state().activeManifest,null);
  assert.equal(reader.state().template,null);
  assert.doesNotMatch(node('scanModelStatus').textContent,/Avaliação de Matemática|Confidential/);
  library.render();
  assert.equal(reader.state().activeManifest,null);
 });
});

test('P0-80-RF-02 normal navigation does not reinitialize a ready controller',async()=>{
 const m=make({counts:[2],types:['A-E']});
 const grant={institutionId:'school',classId:'class-A',periodId:'2026'};
 let sessions=0;
 const fetchFn=async(url)=>{
  const route=new URL(url).pathname.slice('/assessments/v1'.length);
  if(route==='/session'){sessions++;return Response.json({authenticated:true,principalId:'teacher-A',epoch:1});}
  if(route==='/grants')return Response.json({grants:[grant]});
  if(route==='/assessments')return Response.json({assessments:[],nextCursor:null});
  throw Error('Unexpected '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 const library=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
  getModel:()=>m.manifest,prepareModel:()=>true,snapshotEditor:()=>m.editor,
  restoreEditor:()=>{},nominalFields:()=>({}),newEditor:()=>{},activateSelection:()=>{},clearSelection:()=>{}});
 const connect=host.children[0].children[3].children.find(x=>x.textContent==='Conectar');
 for(let i=0;i<20&&!connect.hidden;i++)await tick();
 assert.equal(sessions,1);
 assert.ok(library.controller.view().scope,'scope loaded before checking UI');
 assert.equal(connect.hidden,true,'session switch is not a normal navigation action while authenticated');
 const html=read('plataforma/corretor-v2.html');
 assert.match(html,/function showView\(id\)/);
 assert.doesNotMatch(html,/function showView\(id\)[^\n]*initialize\(/);
});


test('P0-80-RF-01 revoking a library session does not discard a manually imported reader model',async()=>{
 const m=make({counts:[2],types:['A-E']});
 const {reader,node}=realReaderCallbacks();
 reader.applyAssessmentModel({title:'Cartão manual independente',manifest:m.manifest});
 const manual=reader.state().activeManifest;
 const scope={institutionId:'school',classId:'class-A',periodId:'2026'};
 let revoked=false,editorResets=0;
 const fetchFn=async(url)=>{
  const route=new URL(url).pathname.slice('/assessments/v1'.length);
  if(route==='/session')return Response.json({authenticated:true,principalId:'teacher-A',epoch:1});
  if(route==='/grants')return Response.json({grants:[scope]});
  if(route==='/assessments')return revoked?Response.json({code:'expired'},{status:401}):
   Response.json({assessments:[],nextCursor:null});
  throw Error('Unexpected '+route);
 };
 const host=new SurfaceNode('section'),doc={getElementById:id=>id==='savedAssessments'?host:null,
  createElement:tag=>new SurfaceNode(tag)};
 const library=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
  getModel:()=>m.manifest,prepareModel:()=>true,
  snapshotEditor:()=>m.editor,restoreEditor:()=>{},nominalFields:()=>{},
  newEditor:()=>{editorResets++;},
  applyExactModel:bundle=>reader.applyAssessmentModel(bundle,{privateAssessment:true}),
  activateSelection:s=>reader.setSelection(s),clearSelection:()=>reader.clearPrivateCorrection()});
 for(let n=0;n<20&&!library.controller.view().scope;n++)await tick();
 assert.ok(library.controller.view().scope,'authorized scope ready');
 revoked=true;await assert.rejects(()=>library.controller.list(),e=>e.status===401);
 assert.equal(library.controller.view().session,null);
 assert.equal(editorResets,0,'private authentication loss must not overwrite an independent manual editor');
 assert.equal(reader.state().activeManifest,manual,'unrelated manual reader model remains available');
 assert.match(node('scanModelStatus').textContent,/Cartão manual independente/);
});


// UX-79C integration retains PR84 canonical enrichment tests above and PR87 academic/privacy recovery suites below.
test('P1-85-F capability: selector is inert without authenticated score format v1',async()=>{
 const f=await mountedRaceFixture();
 assert.equal(f.formatField.hidden,true);
 assert.equal(f.formatSelect.disabled,true);
 f.formatSelect.value='0';f.formatSelect.onchange();
 assert.equal(f.formatSelect.value,'2');
 await f.fill();
 await f.button('Salvar avaliação').handlers.click();
 assert.equal(Object.hasOwn(f.mounted.controller.view().record.definition.display,'scoreDecimals'),false);
});
test('P1-85-F UI: 0/1/2, save, reopen and duplicate retain independent selection',async()=>{
 const f=await mountedRaceFixture({scoreFormatVersion:'salta-score-format-v1'});
 assert.equal(f.formatField.hidden,false);
 assert.equal(f.formatSelect.disabled,false);
 assert.equal(f.formatSelect.value,'2');
 await f.fill();
 for(const [precision,shown] of [['0','10'],['1','10,0'],['2','10,00']]){
  f.formatSelect.value=precision;f.formatSelect.onchange();
  assert.equal(f.scoring.children[1].children[0].children[0].value,shown);
  assert.match(f.top.children[5].textContent,new RegExp(shown.replace(',','\\,')));
 }
 f.formatSelect.value='0';f.formatSelect.onchange();
 await f.button('Salvar avaliação').handlers.click();
 const original=f.mounted.controller.view().record;
 assert.equal(original.definition.display.scoreDecimals,0);
 await f.button('Abrir avaliação').handlers.click();
 assert.equal(f.formatSelect.value,'0');
 await f.button('Duplicar avaliação').handlers.click();
 const duplicate=f.mounted.controller.view().record;
 assert.notEqual(duplicate.id,original.id);
 assert.equal(duplicate.definition.display.scoreDecimals,0);
 f.formatSelect.value='1';f.formatSelect.onchange();
 await f.button('Salvar avaliação').handlers.click();
 assert.equal(f.mounted.controller.view().record.definition.display.scoreDecimals,1);
 assert.equal(f.records.get(original.id).definition.display.scoreDecimals,0);
});
test('P1-85-F legacy 4 decimals stay exact on format-only changes; edited values are rejected',async()=>{
 const f=await mountedRaceFixture({scoreFormatVersion:'salta-score-format-v1'});
 await f.fill();await f.button('Salvar avaliação').handlers.click();
 const legacy=f.records.get(f.mounted.controller.view().record.id);
 legacy.definition.blocks[0].valueUnits='12345';
 legacy.totalUnits='12345';
 delete legacy.definition.display.scoreDecimals;
 await f.button('Abrir avaliação').handlers.click();
 assert.equal(f.formatSelect.value,'2');
 assert.equal(f.scoring.children[1].children[0].children[0].value,'1,23');
 assert.equal(f.mounted.getDraft().plan.blocks[0].valueUnits,'12345');
 f.formatSelect.value='0';f.formatSelect.onchange();
 assert.equal(f.scoring.children[1].children[0].children[0].value,'1');
 assert.equal(f.mounted.getDraft().plan.blocks[0].valueUnits,'12345');
 const amount=f.scoring.children[1].children[0].children[0];
 amount.value='1,5';amount.oninput();
 assert.equal(amount.value,'1','incompatible precision must not overwrite original');
 assert.equal(f.mounted.getDraft().plan.blocks[0].valueUnits,'12345');
 await f.button('Salvar avaliação').handlers.click();
 assert.equal(f.mounted.controller.view().record.definition.blocks[0].valueUnits,'12345');
 assert.equal(f.mounted.controller.view().record.definition.display.scoreDecimals,0);
});


// P0-87-F-01: real mounted UI + real client/controller + synthetic authenticated
// pages. The second page is held while the principal/epoch/scope changes.
function crossTeacherCatalogFixture({aCount=11,bCount=23,holdRetry=false}={}){
 const m=make({counts:[2],types:['A-E']});
 const scopeA={institutionId:'school-A',classId:'class-A',periodId:'2026-A'};
 const scopeB={institutionId:'school-B',classId:'class-B',periodId:'2026-B'};
 let actor='teacher-a',epoch=1,holdASecond=true,retrySecondHeld=false;
 const arrived=deferred(),release=deferred(),retryEntered=deferred(),retryRelease=deferred(),queries=[];
 const uuid=n=>n.toString(16).padStart(8,'0')+'-1234-4123-8123-000000000001';
 const rowsFor=(teacher,version)=>Array.from({length:teacher==='teacher-a'?aCount:bCount},(_,i)=>({
  id:uuid((teacher==='teacher-a'?100:1000)+i),
  title:(teacher==='teacher-a'?'A-'+version+'-PRIVADA-':'B-'+version+'-EXCLUSIVA-')+String(i+1).padStart(2,'0'),
  subject:'Matemática',className:'Turma sintética 7A',
  revision:1,state:'issued',...(teacher==='teacher-a'?scopeA:scopeB)
 }));
 const fetchFn=async(url,request)=>{
  const u=new URL(url),route=u.pathname.slice('/assessments/v1'.length);
  const teacher=actor,version=epoch; // Response belongs to the initiating session.
  if(route==='/session')return Response.json({authenticated:true,principalId:teacher,epoch:version,
   scoreFormatVersion:'salta-score-format-v1'});
  if(route==='/grants')return Response.json({grants:[teacher==='teacher-a'?scopeA:scopeB]});
  if(route==='/assessments'){
   const scope=teacher==='teacher-a'?scopeA:scopeB;
   if(['institutionId','classId','periodId'].some(k=>u.searchParams.get(k)!==scope[k]))
    return Response.json({error:'scope_denied'},{status:403});
   const src=rowsFor(teacher,version),after=u.searchParams.get('after');
   const offset=after?src.findIndex(r=>r.id===after)+1:0;
   if(after&&offset===0)return Response.json({error:'invalid_cursor'},{status:400});
   const part=src.slice(offset,offset+10);
   const page={assessments:part,nextCursor:offset+part.length<src.length?part.at(-1).id:null};
   queries.push({teacher,version,after,returned:part.length});
   if(teacher==='teacher-a'&&after&&holdASecond){
    holdASecond=false;
    arrived.resolve();
    const outcome=await release.promise;
    if(outcome===401||outcome===403)return Response.json({error:'session_denied'},{status:outcome});
    if(outcome===503)return Response.json({error:'temporary_unavailable'},{status:503});
    if(outcome===400)return Response.json({error:'bad_request'},{status:400});
    if(outcome==='network')throw Error('offline synthetic GET');
    if(outcome==='timeout')throw Object.assign(Error('synthetic request aborted'),{name:'AbortError'});
   }else if(teacher==='teacher-a'&&after&&holdRetry&&!retrySecondHeld){
    retrySecondHeld=true;retryEntered.resolve();
    const outcome=await retryRelease.promise;
    if(outcome===401||outcome===403)return Response.json({error:'session_denied'},{status:outcome});
    if(outcome===503)return Response.json({error:'temporary_unavailable'},{status:503});
   }
   return Response.json(page);
  }
  throw Error('Rota inesperada no teste de catálogo: '+route);
 };
 const host=new SurfaceNode('section'),createPanel=new SurfaceNode('section');
 const formatField=new SurfaceNode('label'),formatSelect=new SurfaceNode('select');
 const doc={getElementById:id=>id==='savedAssessments'?host:id==='criar'?createPanel:
   id==='scoreFormatField'?formatField:id==='scoreFormatSelect'?formatSelect:null,
  createElement:tag=>new SurfaceNode(tag)};
 const mounted=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,
  getSections:()=>m.sections,getMetadata:()=>planArgs(m).metadata,
  getModel:()=>m.manifest,prepareModel:()=>true,snapshotEditor:()=>m.editor,
  restoreEditor:()=>{},nominalFields:()=>({}),newEditor:()=>{},
  activateSelection:()=>{},clearSelection:()=>{}});
 const catalog=host.children[0].children[1].children[1].children[0];
 const refresh=host.children[0].children[3].children.find(x=>x.attrs['data-action-icon']==='refresh');
 const scopeControl=host.children[0].children[1].children[0].children[0];
 const titles=()=>catalog.options.map(x=>x.textContent);
 const assertOnly=(prefix,count)=>{
  mounted.render(); // catches stale allRows, metadataById and controller.rows fallback
  const visible=titles();
  assert.equal(visible.length,count+1,'catalog must publish all pages, never a partial or merged cache');
  assert.ok(visible.slice(1).every(x=>x.includes(prefix)),visible.join(' | '));
  assert.equal(new Set(visible).size,visible.length,'no duplicate options from page overlap');
  assert.ok(mounted.controller.view().rows.every(x=>x.title.includes(prefix)),
   'controller page must belong to the same authenticated principal');
 };
 async function reauthenticate(nextActor,nextEpoch){
  actor=nextActor;epoch=nextEpoch;
  assert.equal(await mounted.controller.initialize(),true);
  const grants=mounted.controller.view().grants;
  assert.equal(grants.length,1);
  mounted.controller.useScope(grants[0]);
  mounted.render();
  assert.equal(titles().length,1,'no previous titles in intermediate authorization state');
  await scopeControl.onchange();
  mounted.render();
 }
 return {mounted,host,catalog,refresh,scopeControl,arrived,release,retryEntered,retryRelease,queries,titles,assertOnly,reauthenticate,
  getSession:()=>mounted.controller.view().session,
  switchIdentity:(nextActor,nextEpoch)=>{actor=nextActor;epoch=nextEpoch}};
}

test('P0-87-F-01: late A page 2 after principal B loaded must never publish A titles',async()=>{
 const f=crossTeacherCatalogFixture({aCount:11,bCount:23});
 await f.arrived.promise;
 assert.equal(f.mounted.controller.view().rows.length,10,'A first page reached the controller');
 assert.equal(f.titles().length,1,'first page not published until complete');
 await f.reauthenticate('teacher-b',2);
 f.assertOnly('B-2-EXCLUSIVA-',23);
 const before=f.titles().join('||');
 assert.deepEqual(f.queries.filter(q=>q.teacher==='teacher-b').map(q=>q.returned),[10,10,3]);
 f.release.resolve();
 await tick();await tick();
 assert.equal(f.titles().join('||'),before,'late A must not overwrite already rendered B');
 f.assertOnly('B-2-EXCLUSIVA-',23);
 assert.equal(f.getSession().principalId,'teacher-b');
 assert.equal(f.getSession().epoch,2);
 assert.equal(f.titles().some(t=>t.includes('A-1-PRIVADA-')),false);
});
for(const httpStatus of [401,403]){
 test('P0-87-F-01: page 2 '+httpStatus+' clears private UI; B can reconnect',async()=>{
  const f=crossTeacherCatalogFixture();
  await f.arrived.promise;
  f.release.resolve(httpStatus);
  for(let i=0;i<8&&f.getSession();i++)await tick();
  assert.equal(f.getSession(),null,'revoked or forbidden session loses identity');
  assert.equal(f.mounted.controller.view().scope,null);
  assert.deepEqual(f.mounted.controller.view().rows,[]);
  f.mounted.render();
  assert.equal(f.titles().length,1,'cache from the first page must not survive '+httpStatus);
  await f.reauthenticate('teacher-b',2);
  f.assertOnly('B-2-EXCLUSIVA-',23);
 });
}
test('P0-87-F-01: same principal new epoch revokes A1 and publishes only A2',async()=>{
 const f=crossTeacherCatalogFixture({aCount:12});
 await f.arrived.promise;
 await f.reauthenticate('teacher-a',2);
 f.assertOnly('A-2-PRIVADA-',12);
 const after=f.titles().join('||');
 f.release.resolve();
 await tick();await tick();
 assert.equal(f.titles().join('||'),after);
 assert.equal(f.titles().some(x=>x.includes('A-1-PRIVADA-')),false);
 f.assertOnly('A-2-PRIVADA-',12);
});


test('P1-87-F-02: one grant, 11 records, page 2 HTTP 503 then visible retry loads complete catalog',async()=>{
 const f=crossTeacherCatalogFixture({aCount:11});
 await f.arrived.promise;
 assert.equal(f.host.children[0].children[1].children[0].hidden,true,'single granted class hides scope selector');
 assert.equal(f.titles().length,1,'partial page must not be visible');
 f.release.resolve(503);
 for(let i=0;i<20&&f.refresh.hidden;i++)await tick();
 assert.equal(f.getSession()?.principalId,'teacher-a','503 does not revoke the authorized session');
 assert.equal(f.mounted.controller.view().rows.length,10,'controller may retain its last private page');
 assert.deepEqual(f.titles().length,1,'partial titles cannot leak to the select');
 assert.equal(f.refresh.hidden,false,'catalog retry must be visible after recoverable failure');
 assert.equal(f.refresh.disabled,false);
 assert.equal(f.refresh.textContent,'Tentar novamente');
 assert.equal(f.refresh.attrs['data-action-icon'],'refresh','accessible icon remains on real control');
 assert.match(f.host.children[0].children[4].textContent,/Não foi possível carregar suas avaliações\. Tente novamente\./);
 const pendingRecovery=f.host.children[0].children[3].children.find(x=>x.attrs['data-action-icon']==='recover'&&x.textContent==='Tentar novamente');
 assert.equal(pendingRecovery.hidden,true,'PUT recovery must remain independent');
 await f.refresh.handlers.click();
 f.assertOnly('A-1-PRIVADA-',11);
 assert.equal(f.refresh.hidden,true,'retry is exceptional, never a routine refresh button');
 assert.equal(f.refresh.disabled,true);
 assert.equal(f.refresh.textContent,'Atualizar');
 assert.deepEqual(f.queries.map(q=>q.returned),[10,1,10,1],'retry reloads from page one');
});
test('P1-87-F-02: no duplicate retry while a recovered page 2 is pending',async()=>{
 const f=crossTeacherCatalogFixture({aCount:12,holdRetry:true});
 await f.arrived.promise;f.release.resolve(503);
 for(let i=0;i<20&&f.refresh.hidden;i++)await tick();
 assert.equal(f.refresh.hidden,false);
 const first=f.refresh.handlers.click();
 await f.retryEntered.promise;
 const count=f.queries.length;
 assert.equal(f.refresh.hidden,true,'retry disappears while the catalog is loading');
 assert.equal(f.refresh.disabled,true);
 await f.refresh.handlers.click();
 assert.equal(f.queries.length,count,'concurrent click cannot initiate a duplicate request');
 f.retryRelease.resolve();
 await first;
 f.assertOnly('A-1-PRIVADA-',12);
 assert.equal(f.refresh.hidden,true);
});
for(const httpStatus of [401,403]){
 test('P1-87-F-02: retry after 503, then '+httpStatus+' revocation never leaves retry or A labels',async()=>{
  const f=crossTeacherCatalogFixture({aCount:11,holdRetry:true});
  await f.arrived.promise;f.release.resolve(503);
  for(let i=0;i<20&&f.refresh.hidden;i++)await tick();
  assert.equal(f.refresh.hidden,false);
  const click=f.refresh.handlers.click();await f.retryEntered.promise;
  f.retryRelease.resolve(httpStatus);await click;
  assert.equal(f.getSession(),null);
  assert.equal(f.mounted.controller.view().scope,null);
  assert.equal(f.titles().length,1);
  assert.equal(f.refresh.hidden,true);
  assert.equal(f.refresh.disabled,true);
  await f.reauthenticate('teacher-b',2);
  f.assertOnly('B-2-EXCLUSIVA-',23);
  assert.equal(f.refresh.hidden,true);
 });
}
test('P1-87-F-02: stale retry response after teacher/epoch/scope changes cannot revive A error, titles or action',async()=>{
 const f=crossTeacherCatalogFixture({aCount:11,holdRetry:true});
 await f.arrived.promise;f.release.resolve(503);
 for(let i=0;i<20&&f.refresh.hidden;i++)await tick();
 const pending=f.refresh.handlers.click();
 await f.retryEntered.promise;
 // Re-authentication is external to the in-flight button; it invalidates the
 // controller and the UI context while the old HTTP response is still held.
 const controller=f.mounted.controller;
 const stateBefore=controller.view().generation;
 f.switchIdentity('teacher-b',2);
 assert.equal(await controller.initialize(),true);
 controller.useScope(controller.view().grants[0]);
 f.mounted.render();
 assert.equal(f.getSession().principalId,'teacher-b');
 assert.equal(f.getSession().epoch,2);
 assert.ok(controller.view().generation>stateBefore);
 assert.equal(f.titles().length,1,'no A titles during B reauthentication');
 assert.equal(f.refresh.hidden,true,'A retry must be cleared on new B context');
 f.retryRelease.resolve(503);
 await pending;
 assert.equal(f.refresh.hidden,true,'late A 503 cannot show retry in B');
 assert.equal(f.titles().length,1);
 await f.scopeControl.onchange();
 f.assertOnly('B-2-EXCLUSIVA-',23);
 assert.equal(f.refresh.hidden,true);
});
test('P1-87-F-02: PUT retry is separate and cannot unlock catalog refresh',async()=>{
 let failed=false;
 const f=await mountedRaceFixture({onPut:async()=>{if(!failed){failed=true;throw Error('synthetic lost PUT response')}}});
 await f.fill();
 await f.button('Salvar avaliação').handlers.click();
 const pending=f.mounted.controller.view().pending;
 assert.ok(pending,'lost PUT response retains original requestId and pending operation');
 const aux=f.top.children[3];
 const catalogRetry=aux.children.find(x=>x.attrs['data-action-icon']==='refresh');
 const putRetry=aux.children.find(x=>x.textContent==='Tentar novamente'&&x.attrs['data-action-icon']==='recover');
 assert.equal(catalogRetry.hidden,true);
 assert.equal(catalogRetry.disabled,true);
 assert.equal(putRetry.hidden,false,'recovery of original PUT is still visible');
 assert.notEqual(catalogRetry,putRetry,'catalog and PUT retry cannot share the control');
 assert.equal(f.writeCalls.length,1);
 await putRetry.handlers.click();
 assert.equal(f.mounted.controller.view().pending,null);
 assert.equal(f.writeCalls.length,2);
 assert.equal(f.writeCalls[0].requestId,f.writeCalls[1].requestId,'idempotent PUT replays original requestId');
 assert.equal(catalogRetry.hidden,true,'save recovery must not expose catalog refresh');
});

for(const outcome of ['network','timeout']){
 test('P1-87-F-02: '+outcome+' during catalog page 2 shows recoverable retry only in authorized context',async()=>{
  const f=crossTeacherCatalogFixture();
  await f.arrived.promise;f.release.resolve(outcome);
  for(let i=0;i<20&&f.refresh.hidden;i++)await tick();
  assert.equal(f.getSession().principalId,'teacher-a');
  assert.equal(f.refresh.hidden,false);
  assert.equal(f.refresh.textContent,'Tentar novamente');
  assert.equal(f.titles().length,1);
  await f.refresh.handlers.click();
  f.assertOnly('A-1-PRIVADA-',11);
  assert.equal(f.refresh.hidden,true);
 });
}
test('P1-87-F-02: unrecoverable catalog 400 never exposes retry or partial titles',async()=>{
 const f=crossTeacherCatalogFixture();
 await f.arrived.promise;f.release.resolve(400);
 for(let i=0;i<20;i++)await tick();
 assert.equal(f.getSession().principalId,'teacher-a');
 assert.equal(f.refresh.hidden,true);
 assert.equal(f.refresh.disabled,true);
 assert.equal(f.titles().length,1);
});
test('P1-87-F-02: controller generation reset clears an old 503 retry',async()=>{
 const f=crossTeacherCatalogFixture();
 await f.arrived.promise;f.release.resolve(503);
 for(let i=0;i<20&&f.refresh.hidden;i++)await tick();
 assert.equal(f.refresh.hidden,false);
 f.mounted.controller.newDraft();
 f.mounted.render();
 assert.equal(f.refresh.hidden,true,'retry is invalidated with controller generation');
 assert.equal(f.refresh.disabled,true);
 assert.equal(f.titles().length,1);
});


test('UX-79C joint: enriched private label, authenticated format 0/1/2, opened revision and correction binding',async()=>{
 const f=await mountedRaceFixture({scoreFormatVersion:'salta-score-format-v1'});
 const catalog=f.top.children[1].children[1].children[0];
 assert.equal(f.formatField.hidden,false,'authenticated feature gate');
 assert.equal(f.refresh?.hidden,undefined); // only the fixture's existing controls are inspected below
 await f.fill();
 for(const [precision,display] of [['0','10'],['1','10,0'],['2','10,00']]){
  f.formatSelect.value=precision;f.formatSelect.onchange();
  assert.equal(f.scoring.children[1].children[0].children[0].value,display);
 }
 f.formatSelect.value='0';f.formatSelect.onchange();
 await f.button('Salvar avaliação').handlers.click();
 const saved=f.mounted.controller.view().record;
 assert.equal(saved.definition.display.scoreDecimals,0);
 assert.equal(catalog.options.length,2,'one full private item plus placeholder');
 assert.equal(catalog.options[1].textContent,
  'Avaliação de Matemática - Matemática - Turma sintética 7A','canonical PR84 label with PR87 format');
 await f.button('Abrir avaliação').handlers.click();
 assert.equal(f.formatSelect.value,'0','display preference persists per revision');
 await f.button('Usar na correção').handlers.click();
 assert.ok(f.getSelected(),'approved immutable revision remains selectable after label enrichment');
 assert.equal(f.getSelected().plan.scoreDecimals,0);
});
