import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,definition as fixtureDefinition,scope} from './helpers.mjs';
import {validateDefinition} from '../definition.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {createIntegratedPlan,formatExact,POINT_SCALE,scoreIntegratedPlan} from '../../corretor/v2/assessments/block-scoring.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord,pinnedSelection} from '../../corretor/v2/assessments/private-contract-adapter.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {createPrivateLibraryController} from '../../corretor/v2/assessments/private-library.mjs';

function editor(initial=fixtureDefinition()){
 const def=structuredClone(initial),{template}=importCardManifest(def.manifest);
 const sections=def.blocks.map(b=>({sectionId:b.blockId,label:b.label,items:b.questionIds.map(id=>{
  const q=template.questions.find(q=>q.questionId===id);return {questionId:q.questionId,number:q.number,type:q.type};
 })}));
 const values=Object.fromEntries(def.blocks.map(b=>[b.blockId,formatExact(BigInt(b.valueUnits),POINT_SCALE,4).replace(',','.')]));
 const answers=Object.fromEntries(def.answers.map(q=>[q.questionId,q.correct]));
 const plan=createIntegratedPlan({metadata:{title:def.title,subject:def.subject,kind:def.kind,date:def.date},
  sections,values,answers,display:def.display.score,model:def.manifest});
 return {plan,manifest:def.manifest};
}
function bridge(h,{actor='a',lostReceipt=false,records=[]}={}){
 let lost=lostReceipt;
 const fetchFn=async (url,init)=>{
  records.push({method:init.method,url,credentials:init.credentials,cache:init.cache,redirect:init.redirect,body:init.body});
  const u=new URL(url),suffix=u.pathname.replace(/^\/assessments\/v1/,'')+u.search;
  const response=await h.request(suffix,{actor,method:init.method,data:init.body?JSON.parse(init.body):undefined});
  if(lost&&init.method==='PUT'&&response.ok){lost=false;throw Error('network disconnected after server commit')}
  return response;
 };
 return createPrivateAssessmentClient({enabled:true,baseUrl:'https://private-service/assessments/v1',fetchFn});
}
const observations=plan=>plan.blocks.flatMap(b=>b.questions.map(q=>({questionId:q.questionId,number:q.number,state:'read',answer:q.correct})));
const context=sel=>({manifest:sel.manifest,template:sel.template,identityState:'read',identityMode:'seven-digit-code'});
test('integration disabled by default: no URL is invented and zero fetch occurs',async()=>{
 let calls=0;
 const client=createPrivateAssessmentClient({fetchFn:async()=>{calls++}});
 await assert.rejects(client.session(),error=>error.status===503&&error.code==='disabled');
 assert.equal(calls,0);
 assert.throws(()=>createPrivateAssessmentClient({enabled:true}),/sem rota autorizada/);
 assert.throws(()=>createPrivateAssessmentClient({enabled:true,baseUrl:'http://evil.invalid/assessments/v1'}));
});
test('exact adapter: v1 local plan to v2 private definition, IDs, rational weights and full validation',()=>{
 const {plan,manifest}=editor(),def=definitionFromLocalPlan(plan,manifest);
 const checked=validateDefinition(def);
 assert.equal(def.schemaVersion,'salta-assessment-definition-v2');
 assert.equal(checked.totalUnits,plan.totalUnits);
 assert.equal(def.blocks[0].blockId,plan.blocks[0].sectionId);
 assert.equal(def.blocks[0].valueUnits,'60000');
 assert.equal(def.display.score,plan.display);
 assert.equal(def.answers.length,manifest.questionCount);
 assert.deepEqual(def.manifest,manifest);
 assert.notEqual(def.blocks[0].blockId,plan.model.revision);
 const changed=structuredClone(plan);changed.blocks[0].questions[0].questionId='not-from-model';
 assert.throws(()=>definitionFromLocalPlan(changed,manifest),/manifesto exato/);
 const duplicate=structuredClone(plan);duplicate.blocks[1].questions[0].questionId=duplicate.blocks[0].questions[0].questionId;
 assert.throws(()=>definitionFromLocalPlan(duplicate,manifest));
 const tampered=structuredClone(plan);tampered.totalUnits='100001';
 assert.throws(()=>definitionFromLocalPlan(tampered,manifest),/valor total/);
 const wrong=structuredClone(plan);wrong.blocks[0].valueUnits='6.0';
 assert.throws(()=>definitionFromLocalPlan(wrong,manifest),/escala/);
});
test('receipt and recovered revision attest each contract field before displaying saved',async t=>{
 const h=await harness();t.after(h.close);const c=bridge(h),source=editor();
 const op=c.prepareSave({...source,scope,status:'draft'});
 const reply=await c.request(op.method,op.path,op.payload);
 assert.equal(reply.httpStatus,201);
 assert.equal(reply.data.ok,true);
 const retrieved=await c.request('GET','/assessments/'+reply.data.id+'/revisions/'+reply.data.revision);
 assert.equal(retrieved.httpStatus,200);
 const record=retrieved.data.record;
 assert.equal(record.id,reply.data.id);
 assert.equal(record.revision,reply.data.revision);
 assert.equal(record.manifestHash,reply.data.manifestHash);
 assert.equal(record.status,op.payload.status);
 for(const field of ['institutionId','classId','periodId'])assert.equal(record[field],op.payload[field],field+' scope mismatch');
 assert.deepEqual(record.definition,op.payload.definition,'exact definition mismatch (not logged)');
 assert.equal(record.totalUnits,source.plan.totalUnits);
 assert.equal(record.scoreScale,10000);
});

test('real Auth + local D1: create draft, verify receipt+GET, issue, pin selection, invalidate replaced selection',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const evidence=[],client=bridge(h,{records:evidence}),data=editor();
 let current=data,selected=null;
 const controller=createPrivateLibraryController({client,getDraft:()=>current,confirmBatch:()=>true,onSelection:s=>{selected=s}});
 assert.equal(await controller.initialize(),true);controller.useScope(scope);
 assert.deepEqual(await controller.list(),[]);
 const created=await controller.save('draft');
 assert.equal(created.record.status,'draft');assert.equal(created.record.revision,1);
 assert.equal(controller.view().phase,'saved');
 assert.match(controller.view().message,/Salvo · revisão 1 confirmada/);
 await assert.rejects(controller.history(),e=>e.status===410);
 await assert.rejects(controller.selectIssued(),/emitida/);
 const issued=await controller.save('issued');
 assert.equal(issued.record.status,'issued');assert.equal(issued.record.revision,2);
 const frozen=await controller.selectIssued();
 assert.equal(frozen.selection.revision,2);
 assert.equal(selected.selectionId,frozen.selection.selectionId);
 assert.equal(selected.assessmentId,created.record.id);
 assert.equal(selected.manifestHash,data.manifest.contentHash);
 assert.equal(scoreIntegratedPlan(selected.plan,observations(selected.plan),context(selected)).total,'10,00');
 const changed=fixtureDefinition();changed.answers[0].correct='E';current=editor(changed);
 await controller.save('issued');
 assert.equal(controller.view().record.revision,3);
 assert.equal(controller.view().selection,null);
 assert.equal(selected,null);
 await assert.rejects(client.resumeSelection(frozen.selection.selectionId),e=>e.status===404);
 await assert.rejects(controller.history(),e=>e.status===410);
 await assert.rejects(client.open(created.record.id,2),e=>e.status===410);
 assert.equal((await client.open(created.record.id)).revision,3);
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions').get().n,1);
 assert.equal(evidence.every(x=>x.credentials==='include'&&x.cache==='no-store'&&x.redirect==='error'),true);
 assert.ok(!JSON.stringify(evidence.filter(x=>x.method==='GET')).includes('correct'));
});
test('two synthetic authorized actors are isolated and revocation denies resuming a pinned selection',async t=>{
 const h=await harness();t.after(h.close);
 const a=bridge(h,{actor:'a'}),b=bridge(h,{actor:'b'}),data=editor();
 const created=await a.saveAndVerify(a.prepareSave({...data,scope,status:'issued'}));
 await assert.rejects(b.open(created.record.id),error=>error.status===404);
 assert.equal((await b.list()).assessments.length,0);
 const own=await b.saveAndVerify(b.prepareSave({...data,scope,status:'issued'}));
 assert.notEqual(own.record.id,created.record.id);
 const selected=await a.selectAndVerify(a.prepareSelection(created.record.id,1));
 await assert.rejects(b.resumeSelection(selected.selection.selectionId),error=>error.status===404);
 h.db.sqlite.exec("UPDATE av_grants SET enabled=0 WHERE principal_id='synthetic-teacher-a'");
 await assert.rejects(a.resumeSelection(selected.selection.selectionId),error=>error.status===403);
 assert.equal((await b.open(own.record.id)).revision,1);
});
test('lost response retries exactly the same requestId and payload, without duplicate revision',async t=>{
 const h=await harness();t.after(h.close);const events=[],client=bridge(h,{lostReceipt:true,records:events});
 const draft=editor(),ctl=createPrivateLibraryController({client,getDraft:()=>draft,confirmBatch:()=>true});
 await ctl.initialize();ctl.useScope(scope);
 await assert.rejects(ctl.save('draft'),error=>error.code==='network');
 assert.equal(ctl.view().phase,'failed');assert.equal(ctl.view().pending?.requestId.length,36);
 const first=events.find(x=>x.method==='PUT').body;
 const recovered=await ctl.retry();
 assert.equal(recovered.record.revision,1);assert.equal(ctl.view().phase,'saved');
 const puts=events.filter(x=>x.method==='PUT');
 assert.equal(puts.length,2);assert.equal(puts[0].body,puts[1].body);
 assert.equal(JSON.parse(first).requestId,JSON.parse(puts[1].body).requestId);
 assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) AS n FROM av_revisions').get().n,1);
});
test('409 stale CAS is not overwritten; 401/403/503 are explicit; network cannot announce saved',async t=>{
 const h=await harness();t.after(h.close);const client=bridge(h),draft=editor();
 const confirmed=await client.saveAndVerify(client.prepareSave({...draft,scope,status:'draft'}));
 await assert.rejects(client.saveAndVerify(client.prepareSave({...draft,scope,
  assessmentId:confirmed.record.id,expectedRevision:0,status:'draft'})),e=>e.status===409);
 const missing=crypto.randomUUID();
 await assert.rejects(client.open(missing),e=>e.status===404);
 const authless=bridge(h,{actor:''});
 await assert.rejects(authless.session(),e=>e.status===401);
 const denied=bridge(h,{actor:'unknown'});
 await assert.rejects(denied.session(),e=>e.status===403);
 h.env.ENABLE_ASSESSMENTS='false';
 await assert.rejects(client.session(),e=>e.status===503);
 h.env.ENABLE_ASSESSMENTS='true';
 const ctl=createPrivateLibraryController({client,getDraft:()=>draft});
 await ctl.initialize();ctl.useScope(scope);
 h.db.failSql=sql=>sql.startsWith('INSERT INTO av_requests');
 await assert.rejects(ctl.save('draft'),e=>e.status===503);
 assert.equal(ctl.view().phase,'unavailable');assert.doesNotMatch(ctl.view().message,/Salvo ·/);
 h.db.failSql=null;
 const recovered=await ctl.retry();
 assert.equal(recovered.record.revision,1);
});
test('duplication/archiving and print preserve exact historical manifest without any answers',async t=>{
 const h=await harness();t.after(h.close);const client=bridge(h),draft=editor();
 const a=await client.saveAndVerify(client.prepareSave({...draft,scope,status:'issued'}));
 const original=await client.open(a.record.id,1);
 const copy=await client.duplicateAndVerify(client.prepareDuplicate(a.record.id,1));
 assert.notEqual(copy.record.id,a.record.id);assert.equal(copy.record.revision,1);
 assert.equal(copy.record.status,'draft');
 await assert.rejects(client.selectAndVerify(client.prepareSelection(copy.record.id,1)),e=>e.status===409);
 const archived=await client.archiveAndVerify(client.prepareArchive(a.record.id,1));
 assert.equal(archived.record.archived,true);
 const after=await client.open(a.record.id,1);
 assert.deepEqual(after.definition,original.definition);
 const remotePrint=await h.request('/assessments/'+a.record.id+'/revisions/1/print');
 const printable=await remotePrint.json();
 assert.equal(remotePrint.status,200);
 assert.equal(printable.manifestHash,original.manifestHash);
 assert.equal(JSON.stringify(printable).includes('"correct"'),false);
 assert.equal(JSON.stringify(printable).includes('valueUnits'),false);
 assert.equal(printable.svg.includes('data-assessment-id="'+a.record.id+'"'),true);
});
test('identical optical hash but different assessment IDs never authorize automatic answer-key selection',async t=>{
 const h=await harness();t.after(h.close);const client=bridge(h);
 const a=editor(),changed=fixtureDefinition();changed.answers[0].correct='E';
 const b=editor(changed);
 const aSaved=await client.saveAndVerify(client.prepareSave({...a,scope,status:'issued'}));
 const bSaved=await client.saveAndVerify(client.prepareSave({...b,scope,status:'issued'}));
 assert.equal(aSaved.record.manifestHash,bSaved.record.manifestHash);
 assert.notEqual(aSaved.record.id,bSaved.record.id);
 const first=await client.selectAndVerify(client.prepareSelection(aSaved.record.id,1));
 const second=await client.selectAndVerify(client.prepareSelection(bSaved.record.id,1));
 assert.notEqual(first.selection.assessmentId,second.selection.assessmentId);
 assert.notEqual(first.selection.plan.blocks[0].questions[0].correct,second.selection.plan.blocks[0].questions[0].correct);
 assert.throws(()=>pinnedSelection({selectionId:first.selection.selectionId,record:bSaved.record},
   {assessmentId:first.selection.assessmentId,revision:1}),/divergente/);
});

test('slow catalog response from previous school context never replaces a newer authorized context',async()=>{
 const a={institutionId:'school-a',classId:'class-a',periodId:'2026'};
 const b={institutionId:'school-b',classId:'class-b',periodId:'2026'};
 let release;
 const waiting=new Promise(resolve=>{release=resolve});
 const client={
  enabled:true,classifyError:()=> 'failed',
  session:async()=>({authenticated:true,principalId:'teacher-a',epoch:1}),
  grants:async()=>[a,b],list:()=>waiting
 };
 const ctl=createPrivateLibraryController({client,getDraft:()=>editor()});
 await ctl.initialize();ctl.useScope(a);
 const obsolete=ctl.list();
 ctl.useScope(b);
 release({assessments:[{id:'old-a',...a,title:'Not from current context'}],nextCursor:null});
 assert.equal(await obsolete,null);
 assert.deepEqual(ctl.view().rows,[]);
 assert.deepEqual(ctl.view().scope,b);
});


const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const scopeA={institutionId:'school-a',classId:'class-a',periodId:'2026'};
const scopeB={institutionId:'school-b',classId:'class-b',periodId:'2026'};
const fakeRecord=(id,scope,status='issued')=>({id,revision:4,status,archived:false,manifestHash:'geom-hash-'+id,
 definition:{title:'Prova '+id},...scope});
const fakeSelection=(id,scope)=>({selectionId:'selection-'+id,assessmentId:id,revision:4,manifestHash:'geom-hash-'+id,scope,plan:{revision:4}});
const fakeError=status=>Object.assign(new Error('Erro atrasado '+(status||'network')),{status});
const classify=e=>e.status===401?'session':e.status===403?'forbidden':e.status===404?'missing':e.status===503?'unavailable':'failed';

test('P1-01: failed opening of another assessment blocks old-record writes, issue, duplicate, archive and select (404/503/network)',async()=>{
 for(const code of [404,503,0]){
  const calls={prepareSave:0,prepareDuplicate:0,prepareArchive:0,prepareSelection:0};
  const client={enabled:true,classifyError:classify,
   session:async()=>({authenticated:true,principalId:'teacher-a',epoch:1}),grants:async()=>[scopeA],
   open:async id=>id==='assessment-A'?fakeRecord(id,scopeA):Promise.reject(fakeError(code)),
   prepareSave:()=>{calls.prepareSave++;throw Error('must not prepare old A')},
   prepareDuplicate:()=>{calls.prepareDuplicate++;throw Error('must not duplicate old A')},
   prepareArchive:()=>{calls.prepareArchive++;throw Error('must not archive old A')},
   prepareSelection:()=>{calls.prepareSelection++;throw Error('must not select old A')}
  };
  const ctl=createPrivateLibraryController({client,getDraft:()=>editor(),confirmBatch:()=>true});
  await ctl.initialize();ctl.useScope(scopeA);
  await ctl.open('assessment-A');
  assert.equal(ctl.view().record.id,'assessment-A');
  await assert.rejects(ctl.open('assessment-B'),e=>e.status===code);
  assert.equal(ctl.view().record,null,'failed opening must clear previous writable record');
  assert.equal(ctl.view().editorMode,'blocked');
  for(const action of [()=>ctl.save('draft'),()=>ctl.save('issued'),()=>ctl.duplicate(),()=>ctl.archive(),()=>ctl.selectIssued()])
   await assert.rejects(action(),/Abra|Nenhuma avaliação ativa/);
  assert.deepEqual(calls,{prepareSave:0,prepareDuplicate:0,prepareArchive:0,prepareSelection:0});
  ctl.newDraft();assert.equal(ctl.view().editorMode,'new','new evaluation requires explicit action');
 }
});
test('P1-02: late teacher confirmation from class A cannot prepare or select A after switching to B',async()=>{
 const confirm=deferred(),events=[],calls=[];
 const client={enabled:true,classifyError:classify,
  session:async()=>({authenticated:true,principalId:'teacher-a',epoch:1}),grants:async()=>[scopeA,scopeB],
  open:async id=>fakeRecord(id,id==='assessment-A'?scopeA:scopeB),
  prepareSelection:(id,revision)=>{calls.push({id,revision});return {payload:{selectionId:'selection-A'}}},
  selectAndVerify:async()=>{throw Error('No old network call allowed')}
 };
 const ctl=createPrivateLibraryController({client,getDraft:()=>editor(),
  onSelection:value=>events.push(value),confirmBatch:()=>confirm.promise});
 await ctl.initialize();ctl.useScope(scopeA);await ctl.open('assessment-A');
 const pending=ctl.selectIssued();
 ctl.useScope(scopeB);await ctl.open('assessment-B');
 const stateBefore=ctl.view(),eventCount=events.length;
 confirm.resolve(true);
 assert.equal(await pending,null);
 assert.deepEqual(calls,[],'old selection must not even prepare a POST after confirmation');
 assert.equal(ctl.view().scope.classId,scopeB.classId);
 assert.strictEqual(ctl.view().record,stateBefore.record);
 assert.equal(events.length,eventCount,'late confirmation cannot trigger onSelection');
});
test('P1-02: selection server GET after switching to B cannot overwrite B or emit old callback',async()=>{
 const wait=deferred(),calls=[],events=[];
 const client={enabled:true,classifyError:classify,
  session:async()=>({authenticated:true,principalId:'teacher-a',epoch:1}),grants:async()=>[scopeA,scopeB],
  open:async id=>fakeRecord(id,id==='assessment-A'?scopeA:scopeB),
  prepareSelection:(id,revision)=>({payload:{selectionId:'selection-'+id},id,revision}),
  selectAndVerify:op=>{calls.push(op);return wait.promise}
 };
 const ctl=createPrivateLibraryController({client,getDraft:()=>editor(),
  onSelection:value=>events.push(value),confirmBatch:()=>true});
 await ctl.initialize();ctl.useScope(scopeA);await ctl.open('assessment-A');
 const pending=ctl.selectIssued();
 await Promise.resolve();await Promise.resolve();
 assert.equal(calls.length,1);
 ctl.useScope(scopeB);await ctl.open('assessment-B');
 const before=ctl.view(),count=events.length;
 wait.resolve({selection:fakeSelection('assessment-A',scopeA)});
 assert.equal(await pending,null);
 assert.equal(ctl.view().record.id,'assessment-B');
 assert.equal(ctl.view().scope.classId,scopeB.classId);
 assert.equal(ctl.view().phase,before.phase);
 assert.equal(events.length,count);
});
test('P1-02: mismatched server selection scope, revision or manifest is rejected even with unchanged context',async()=>{
 for(const mutate of [
  x=>x.scope=scopeB,
  x=>x.revision=5,
  x=>x.manifestHash='other-hash',
  x=>x.assessmentId='other-evaluation'
 ]){
  let selected=0;
  const client={enabled:true,classifyError:classify,
   session:async()=>({authenticated:true,principalId:'teacher-a',epoch:1}),grants:async()=>[scopeA],
   open:async id=>fakeRecord(id,scopeA),
   prepareSelection:()=>({payload:{selectionId:'selection-assessment-A'}}),
   selectAndVerify:async()=>{const x=fakeSelection('assessment-A',scopeA);mutate(x);return {selection:x}}
  };
  const ctl=createPrivateLibraryController({client,getDraft:()=>editor(),confirmBatch:()=>true,
   onSelection:selection=>{if(selection)selected++}});
  await ctl.initialize();ctl.useScope(scopeA);await ctl.open('assessment-A');
  await assert.rejects(ctl.selectIssued(),/não corresponde/);
  assert.equal(ctl.view().selection,null);assert.equal(selected,0);
 }
});
test('P1-03: 401,403,404,503/network errors from old class cannot corrupt new class (list/open/history/resume)',async()=>{
 for(const operation of ['list','open','history','resumeSelection']){
  for(const code of [401,403,404,503,0]){
   const old=deferred(),notices=[],selections=[];
   const client={
    enabled:true,classifyError:classify,
    session:async()=>({authenticated:true,principalId:'teacher-a',epoch:1}),grants:async()=>[scopeA,scopeB],
    list:async()=>old.promise,
    open:async id=>id==='assessment-A'&&operation==='open'?old.promise:fakeRecord(id,id==='assessment-A'?scopeA:scopeB),
    history:async()=>old.promise,
    resumeSelection:async id=>id==='selection-A'&&operation==='resumeSelection'?old.promise:fakeSelection('assessment-B',scopeB)
   };
   const ctl=createPrivateLibraryController({client,getDraft:()=>editor(),
    onSelection:value=>selections.push(value),onStatus:status=>notices.push(status)});
   await ctl.initialize();ctl.useScope(scopeA);
   if(operation==='history')await ctl.open('assessment-A');
   const pending=operation==='list'?ctl.list():operation==='open'?ctl.open('assessment-A'):
    operation==='history'?ctl.history('assessment-A'):ctl.resumeSelection('selection-A');
   ctl.useScope(scopeB);
   if(operation==='list'){
    // Make the B request independent of the A deferred promise.
    client.list=async()=>({assessments:[{id:'assessment-B',...scopeB,title:'Turma B'}],nextCursor:null});
    await ctl.list();
   }else await ctl.open('assessment-B');
   if(operation!=='list')await ctl.resumeSelection('selection-B');
   const state=ctl.view(),count=selections.length,noticesCount=notices.length;
   old.reject(fakeError(code));
   assert.equal(await pending,null,operation+' '+code+' stale error ignored');
   assert.equal(ctl.view().scope.classId,scopeB.classId);
   assert.deepEqual(ctl.view().rows,state.rows);
   assert.deepEqual(ctl.view().record,state.record);
   assert.deepEqual(ctl.view().selection,state.selection);
   assert.equal(ctl.view().phase,state.phase);
   assert.equal(ctl.view().message,state.message);
   assert.equal(selections.length,count,'old error cannot call onSelection');
   assert.equal(notices.length,noticesCount,'old error cannot emit status');
  }
 }
});
