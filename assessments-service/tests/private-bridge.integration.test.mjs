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
test('real Auth + local D1: create draft, verify receipt+GET, issue, pin selection, preserve historical score',async t=>{
 const h=await harness();t.after(h.close);const evidence=[],client=bridge(h,{records:evidence}),data=editor();
 let current=data,selected=null;
 const controller=createPrivateLibraryController({client,getDraft:()=>current,confirmBatch:()=>true,onSelection:s=>{selected=s}});
 assert.equal(await controller.initialize(),true);controller.useScope(scope);
 assert.deepEqual(await controller.list(),[]);
 const created=await controller.save('draft');
 assert.equal(created.record.status,'draft');assert.equal(created.record.revision,1);
 assert.equal(controller.view().phase,'saved');
 assert.match(controller.view().message,/Salvo · revisão 1 confirmada/);
 assert.equal((await controller.history()).length,1);
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
 assert.strictEqual(controller.view().selection,selected,'new revision cannot rewrite pinned selection');
 assert.equal(selected.plan.blocks[0].questions[0].correct,data.plan.blocks[0].questions[0].correct);
 assert.equal((await client.resumeSelection(selected.selectionId)).revision,2);
 assert.equal((await controller.history()).length,3);
 const restored=await client.open(created.record.id,2);
 assert.equal(restored.revision,2);assert.equal(planFromPrivateRecord(restored).plan.revision,2);
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
