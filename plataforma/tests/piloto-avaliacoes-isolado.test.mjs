import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createPilotModel,preparePilotDraft,syntheticSections,verifyPortalSession,AUTH_SESSION_URL,PRIVATE_GATEWAY_URL} from '../piloto-avaliacoes.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord} from '../../corretor/v2/assessments/private-contract-adapter.mjs';
import {scoreIntegratedPlan} from '../../corretor/v2/assessments/block-scoring.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {installPrivateAssessmentUI} from '../../corretor/v2/assessments/private-ui.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {renderTemplateSvg} from '../../corretor/v2/omr/render.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const text=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const gitBlob=rel=>{const body=fs.readFileSync(path.join(root,rel));return createHash('sha1').update('blob '+body.length+'\0').update(body).digest('hex')};
const original={
 'corretor/v2/assessments/block-scoring.mjs':'6abefc55e210b065d8b2080587a9038fd5f5856b',
 'corretor/v2/assessments/private-contract-adapter.mjs':'a938f541db6019b56c6429b3ca14853005974bcd',
 'corretor/v2/assessments/private-client.mjs':'d909b412f95747c4f3b1830fdcb0fd385633694b',
 'corretor/v2/assessments/private-library.mjs':'8eb63a54c83a121d58108af7066be381c7290bd2',
 'corretor/v2/assessments/private-ui.mjs':'f22f6a04ef2248bf28216d1e7764fb89741b0494',
 'corretor/v2/omr/template.mjs':'d0c0e0a5a061b778a4b92973f0fd3009a1683f30',
 'corretor/v2/omr/render.mjs':'90667f4dc78ee1f6d071325f4bb3077f431f3bb5',
 'corretor/v2/omr/manifest.mjs':'0a83331c35f467fe3e123daf1775010e5f3e9e0b'
};
const fakeKey=letter=>Array(60).fill(letter).join(' ');

test('P0-08B-03: V2/OMR and private contracts stay pinned; approved frontend reauth controller stays protected',()=>{
 for(const [file,expected]of Object.entries(original))assert.equal(gitBlob(file),expected,file);
 const controller=text('corretor/v2/assessments/private-library.mjs');
 assert.match(controller,/resetContext\(\);\s*s\.session=null;s\.grants=\[\];s\.scope=null;s\.pending=null;/,
  'reinitialization must invalidate previous professor, grant and request before I/O');
});
test('synthetic A/B uses original generator, 60 A-E, 30+30, 6+4 and native 210x297 A4 V2',()=>{
 const {sections,template,manifest}=createPilotModel();
 assert.equal(syntheticSections().length,2);
 assert.deepEqual(sections.map(s=>s.items.length),[30,30]);
 assert.equal(manifest.contentHash.length,16);
 assert.equal(manifest.contentHash,'a139057ba70b83fd','must match the validated A/B reference ZIP exactly');
 assert.equal(manifest.questionCount,60);
 const reconstructed=importCardManifest(manifest);
 assert.equal(reconstructed.manifest.contentHash,manifest.contentHash);
 assert.equal(template.layoutVersion,'v2');
 assert.deepEqual([manifest.paper.widthMm,manifest.paper.heightMm],[210,297]);
 const a=preparePilotDraft({title:'Sintética A',rawKey:fakeKey('A'),date:'2026-11-20'});
 const b=preparePilotDraft({title:'Sintética B',rawKey:fakeKey('B'),date:'2026-11-20'});
 assert.equal(a.manifest.contentHash,b.manifest.contentHash);
 assert.deepEqual(a.plan.blocks.map(x=>x.valueUnits),['60000','40000']);
 assert.deepEqual(a.plan.blocks.map(x=>x.questions.length),[30,30]);
 assert.equal(a.plan.totalUnits,'100000');
 assert.equal(b.plan.totalUnits,'100000');
 const dA=definitionFromLocalPlan(a.plan,a.manifest);
 const dB=definitionFromLocalPlan(b.plan,b.manifest);
 assert.equal(dA.answers.length,60);
 assert.equal(dB.answers.length,60);
 assert.ok(dA.answers.every(x=>x.correct==='A'));
 assert.ok(dB.answers.every(x=>x.correct==='B'));
 assert.notDeepEqual(dA.answers,dB.answers);
 assert.equal(dA.manifest.contentHash,dB.manifest.contentHash);
 for(const d of [dA,dB]){
  const recovered=planFromPrivateRecord({revision:1,definition:d,manifestHash:manifest.contentHash,
   totalUnits:'100000',scoreScale:10000});
  assert.equal(recovered.plan.blocks.length,2);
  assert.equal(recovered.plan.totalUnits,'100000');
 }
 const svg=renderTemplateSvg(template,{manifest});
 assert.match(svg,/width="210mm"/);assert.match(svg,/height="297mm"/);
 assert.match(svg,new RegExp('data-layout-hash="'+manifest.contentHash+'"'));
 assert.doesNotMatch(svg,/"correct"|correctAnswer|__Host-salta_session/);
 console.info('PILOT_PAGES_MANIFEST',JSON.stringify({hash:manifest.contentHash,layoutVersion:template.layoutVersion,
  pages:manifest.pageCount,questionCount:manifest.questionCount,scoreUnits:a.plan.totalUnits,blocks:[60000,40000]}));
});
test('same sheet different selected answer key yields different deterministic scores',()=>{
 const {template,manifest}=createPilotModel();
 const a=preparePilotDraft({title:'A',rawKey:fakeKey('A')});
 const b=preparePilotDraft({title:'B',rawKey:fakeKey('B')});
 const marks=template.questions.map(q=>({questionId:q.questionId,number:q.number,state:'read',answer:'A'}));
 const opts={manifest,template,identityState:'read',identityMode:'seven-digit-code'};
 assert.equal(scoreIntegratedPlan(a.plan,marks,opts).total,'10,00');
 assert.equal(scoreIntegratedPlan(b.plan,marks,opts).total,'0,00');
 const marksC=template.questions.map(q=>({questionId:q.questionId,number:q.number,state:'read',answer:'C'}));
 assert.equal(scoreIntegratedPlan(a.plan,marksC,opts).total,'0,00');
 for(const letter of ['C','D','E']){
  const p=preparePilotDraft({title:'Sintética '+letter,rawKey:fakeKey(letter)});
  assert.equal(p.plan.blocks.reduce((n,b)=>n+b.questions.length,0),60);
 }
 const uncertain=marks.map(x=>({...x}));
 uncertain[10]={...uncertain[10],state:'blank',answer:null};
 uncertain[14]={...uncertain[14],state:'double',answer:null};
 const scored=scoreIntegratedPlan(a.plan,uncertain,opts);
 assert.equal(scored.blank,1);assert.equal(scored.double,1);
 assert.throws(()=>preparePilotDraft({title:'A',rawKey:'A B C'}));
 assert.throws(()=>preparePilotDraft({title:'A',rawKey:'A '.repeat(59)+'F'}));
});
test('auth gate requires exact validated session and sends no tokens or body',async()=>{
 let invoked=0;
 const fetchFn=async(url,init)=>{
  invoked++;
  assert.equal(url,AUTH_SESSION_URL);
  assert.equal(init.method,'GET');assert.equal(init.credentials,'include');assert.equal(init.cache,'no-store');
  assert.equal(init.body,undefined);assert.equal(init.headers.Authorization,undefined);
  return Response.json({ok:true,authenticated:true,user:'synthetic-login-only'});
 };
 assert.equal(await verifyPortalSession(fetchFn),true);
 assert.equal(invoked,1);
 for(const [status,payload]of [
  [401,{ok:false,authenticated:false}],
  [200,{ok:true,authenticated:false,user:'synthetic'}],
  [200,{ok:false,authenticated:true,user:'synthetic'}],
  [200,{ok:true,authenticated:true}],
  [200,{ok:true,authenticated:true,user:''}]
 ])assert.equal(await verifyPortalSession(async()=>Response.json(payload,{status})),false);
 assert.equal(await verifyPortalSession(async()=>{throw Error('network')}),false);
 assert.equal(PRIVATE_GATEWAY_URL,AUTH_SESSION_URL.replace('/auth/session','/assessments/v1'));
});
test('private client sends only scoped gateway requests with credentialed no-store, without bearer',async()=>{
 const req=[];
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:PRIVATE_GATEWAY_URL,fetchFn:async(url,opts)=>{
  req.push({url,opts});return Response.json({authenticated:true,principalId:'teacher-synthetic',epoch:1});
 }});
 assert.equal((await client.session()).principalId,'teacher-synthetic');
 assert.equal(req.length,1);
 assert.equal(req[0].url,PRIVATE_GATEWAY_URL+'/session');
 assert.equal(req[0].opts.credentials,'include');assert.equal(req[0].opts.cache,'no-store');
 assert.equal(req[0].opts.headers.Authorization,undefined);
 assert.equal(req[0].opts.body,undefined);
});
test('dedicated HTML has no inline keys, persistent credentials, additional endpoint or public Corretor mutation',()=>{
 const page=text('plataforma/piloto-avaliacoes.html'),script=text('plataforma/piloto-avaliacoes.mjs');
 assert.match(page,/id="privateAssessmentsHost"/);
 assert.match(page,/Content-Security-Policy/);
 assert.match(page,/connect-src https:\/\/salta-stats\.dannyel-moises\.workers\.dev/);
 assert.match(page,/noindex,nofollow,noarchive/);
 assert.match(page,/src="\.\/piloto-avaliacoes\.mjs"/);
 assert.doesNotMatch(page,/<script(?![^>]*src=)[^>]*>/i);
 assert.doesNotMatch(page,/\b(password|secret|token|Bearer)\s*[:=]/i);
 assert.doesNotMatch(script,/\b(localStorage|sessionStorage|indexedDB|document\.cookie|Authorization\s*:)/);
 assert.doesNotMatch(script,/fetch\s*\([^)]*\/assessments/i);
 assert.match(script,/installPrivateAssessmentUI\(/);
 assert.match(script,/verifyPortalSession\(/);
 assert.match(script,/renderTemplateSvg\(selection\.template/);
 const imports=[...script.matchAll(/^import .*from '([^']+)'/gm)].map(x=>x[1]);
 assert.equal(imports.length,6);
 for(const local of imports)assert.ok(fs.existsSync(path.resolve(root,'plataforma',local)),local);
 const publicCorretor=text('plataforma/corretor-v2.html');
 assert.doesNotMatch(publicCorretor,/piloto-avaliacoes\.(mjs|html)/);
});
class Node{
 constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.value='';this.hidden=false;this.disabled=false;this.dataset={};this.textContent='';this.onload=null;this.onerror=null;}
 setAttribute(k,v){this.attrs[k]=v}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes;this.value=''}
 get options(){return this.children.filter(x=>x.tag==='option')}
}
test('original private UI can initialize and enumerate synthetic scope without writing',async()=>{
 const scope={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
 const called=[];
 const fetchFn=async(url,init)=>{
  called.push({url,method:init.method});
  const pathname=new URL(url).pathname;
  if(pathname.endsWith('/session'))return Response.json({authenticated:true,principalId:'synthetic-teacher',epoch:1});
  if(pathname.endsWith('/grants'))return Response.json({grants:[scope]});
  if(pathname.endsWith('/assessments'))return Response.json({assessments:[],nextCursor:null});
  throw Error('Unexpected route');
 };
 const host=new Node('section');
 const doc={getElementById:id=>id==='privateAssessmentsHost'?host:null,createElement:tag=>new Node(tag)};
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:PRIVATE_GATEWAY_URL,fetchFn});
 const ui=installPrivateAssessmentUI({document:doc,client,getDraft:()=>preparePilotDraft({title:'A',rawKey:fakeKey('A')})});
 assert.equal(ui.enabled,true);
 await ui.controls.connect.onclick();
 ui.controls.scope.value='0';
 await ui.controls.chooseScope.onclick();
 assert.equal(ui.controller.view().scope.classId,'turma-sintetica-ab');
 assert.deepEqual(ui.controller.view().rows,[]);
 assert.equal(ui.controls.more.disabled,true);
 assert.ok(called.every(x=>x.method==='GET'&&x.url.startsWith(PRIVATE_GATEWAY_URL+'/')));
});

test('private UI/controller/client: synthetic draft save, issued revision, history, pinned selection, duplicate (mock only)',async()=>{
 const scope={institutionId:'salta-hml-20261119',classId:'turma-sintetica-ab',periodId:'2026-11-piloto'};
 const store=new Map(),selectedById=new Map(),operations=[];let lastSelection=null,openCopy=null;
 const latest=id=>store.get(id)?.at(-1);
 const fetchFn=async(url,opts)=>{
  const route=new URL(url).pathname.slice('/assessments/v1'.length);
  operations.push({method:opts.method,route,credentials:opts.credentials,cache:opts.cache});
  if(opts.method==='GET'&&route==='/session')return Response.json({authenticated:true,principalId:'teacher-synthetic',epoch:1});
  if(opts.method==='GET'&&route==='/grants')return Response.json({grants:[scope]});
  if(opts.method==='GET'&&route.startsWith('/assessments?'))return Response.json({assessments:[],nextCursor:null});
  if(opts.method==='PUT'&&/^\/assessments\/[\w-]+$/.test(route)){
   const id=route.split('/')[2],payload=JSON.parse(opts.body),list=store.get(id)||[];
   assert.equal(payload.expectedRevision,list.length);
   assert.equal(payload.institutionId,scope.institutionId);
   assert.equal(payload.classId,scope.classId);
   assert.equal(payload.periodId,scope.periodId);
   const record={id,revision:list.length+1,definition:payload.definition,
    manifestHash:payload.definition.manifest.contentHash,totalUnits:'100000',scoreScale:10000,
    status:payload.status,archived:false,...scope};
   store.set(id,[...list,record]);
   return Response.json({ok:true,id,revision:record.revision,manifestHash:record.manifestHash},{status:201});
  }
  const getRevision=route.match(/^\/assessments\/([\w-]+)\/revisions\/(\d+)$/);
  if(opts.method==='GET'&&getRevision){
   const record=store.get(getRevision[1])?.find(x=>x.revision===Number(getRevision[2]));
   return Response.json({record},{status:record?200:404});
  }
  const history=route.match(/^\/assessments\/([\w-]+)\/revisions$/);
  if(opts.method==='GET'&&history)return Response.json({revisions:(store.get(history[1])||[]).map(x=>({revision:x.revision,status:x.status}))});
  const dupe=route.match(/^\/assessments\/([\w-]+)\/duplicate$/);
  if(opts.method==='POST'&&dupe){
   const p=JSON.parse(opts.body),original=store.get(dupe[1])?.find(x=>x.revision===p.sourceRevision);
   assert.ok(original);const copy={...original,id:p.newId,revision:1,status:'draft'};
   store.set(p.newId,[copy]);
   return Response.json({ok:true,id:p.newId,revision:1,manifestHash:copy.manifestHash});
  }
  if(opts.method==='POST'&&route==='/selections'){
   const p=JSON.parse(opts.body),record=store.get(p.assessmentId)?.find(x=>x.revision===p.revision);
   assert.equal(record.status,'issued');selectedById.set(p.selectionId,record);
   return Response.json({ok:true,id:record.id,revision:record.revision,
    selectionId:p.selectionId,manifestHash:record.manifestHash});
  }
  const selected=route.match(/^\/selections\/([\w-]+)$/);
  if(opts.method==='GET'&&selected)return Response.json({selectionId:selected[1],record:selectedById.get(selected[1])});
  throw Error('unexpected mock request '+opts.method+' '+route);
 };
 const host=new Node('section');
 const doc={getElementById:id=>id==='privateAssessmentsHost'?host:null,createElement:tag=>new Node(tag)};
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:PRIVATE_GATEWAY_URL,fetchFn});
 const ui=installPrivateAssessmentUI({document:doc,client,
  getDraft:()=>preparePilotDraft({title:'Prova A sintética',date:'2026-11-20',rawKey:fakeKey('A')}),
  applyRecord:record=>{openCopy=record;},
  onSelection:s=>{lastSelection=s;},
  confirmBatch:()=>true
 });
 await ui.controls.connect.onclick();ui.controls.scope.value='0';
 await ui.controls.chooseScope.onclick();
 await ui.controls.saveDraft.onclick();
 const initial=ui.controller.view().record;
 assert.ok(initial&&initial.revision===1&&initial.status==='draft');
 assert.equal(store.get(initial.id).length,1);
 await ui.controls.issue.onclick();
 const issued=ui.controller.view().record;
 assert.equal(issued.id,initial.id);assert.equal(issued.revision,2);
 assert.equal(issued.status,'issued');
 assert.equal(store.get(initial.id)[0].status,'draft','history cannot be overwritten');
 await ui.controller.history(issued.id);
 assert.deepEqual(ui.controller.view().revisions.map(r=>r.revision),[1,2]);
 await ui.controls.select.onclick();
 assert.equal(lastSelection.assessmentId,initial.id);
 assert.equal(lastSelection.revision,2);
 assert.equal(lastSelection.manifestHash,issued.manifestHash);
 assert.equal(lastSelection.plan.totalUnits,'100000');
 await ui.controls.duplicate.onclick();
 const copy=ui.controller.view().record;
 assert.notEqual(copy.id,initial.id);assert.equal(copy.revision,1);
 assert.equal(copy.status,'draft');assert.equal(openCopy.id,copy.id);
 assert.equal(store.get(initial.id).length,2);
 assert.equal(store.get(copy.id).length,1);
 assert.ok(operations.some(o=>o.method==='PUT'));
 assert.ok(operations.some(o=>o.method==='POST'&&o.route==='/selections'));
 assert.ok(operations.every(o=>o.credentials==='include'&&o.cache==='no-store'));
});
