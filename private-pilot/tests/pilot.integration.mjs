// Three real workerd workers, native limiters, original Auth/SessionStore and D1.
// Loopback only, synthetic DO sessions and data; no published fixtures or remote API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildPilot} from '../build.mjs';
import {LIMITERS,PORTAL_ORIGIN} from '../gateway.mjs';
import {migration,seed,secret,scope} from '../../assessments-service/tests/helpers.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
import {createIntegratedPlan} from '../../corretor/v2/assessments/block-scoring.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {createPrivateLibraryController} from '../../corretor/v2/assessments/private-library.mjs';
const require=createRequire(new URL('../../assessments-lab/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
function assessment({title='Piloto sintético de 60 questões A',answer='A',scoreDecimals}={}){
 const sections=['a','b'].map((name,s)=>({sectionId:'synthetic-'+name,label:'Bloco '+name,type:'A-E',items:Array.from({length:30},(_,i)=>({questionId:name+'-q'+(i+1),number:s*30+i+1,type:'A-E'}))}));
 const template=createTemplate(sections),manifest=createCardManifest(template);
 const answers=Object.fromEntries(template.questions.map(q=>[q.questionId,answer]));
 const plan=createIntegratedPlan({metadata:{title,subject:'Matemática',kind:'Prova',date:'2026-11-18'},sections,values:{'synthetic-a':'6','synthetic-b':'4'},answers,display:'both',model:manifest,scoreDecimals});
 return {plan,manifest};
}
test('real local consolidated pilot: two 60-question assessments → scoped catalog/gateway/Auth/D1, recovery and isolation',async()=>{
 const state=await mkdtemp(path.join(tmpdir(),'salta-gateway-pilot-'));
 const built=await buildPilot(path.join(state,'build'));
 const ratelimits=Object.fromEntries(LIMITERS.map((name,i)=>[name,{namespace_id:String(991001+i),simple:{limit:[300,120,20,15][i],period:60}}]));
 const options=convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[
  {name:'stats-gateway',modules:true,script:built.gatewayCode,compatibilityDate:'2026-09-30',bindings:{PRIVATE_GATEWAY_ENABLED:'true'},serviceBindings:{AUTH:'auth',PRIVATE_ASSESSMENTS:'private-backend'},ratelimits},
  {name:'private-backend',modules:true,script:built.backendCode,compatibilityDate:'2026-10-01',bindings:{ENABLE_ASSESSMENTS:'true',PORTAL_ORIGIN,ASSESSMENT_KEYRING:JSON.stringify({1:secret()}),ASSESSMENT_ACTIVE_KEY_VERSION:'1'},serviceBindings:{AUTH:'auth'},d1Databases:{ASSESSMENTS_DB:'private-pilot-synthetic'}},
  {name:'auth',modules:true,script:readFileSync(new URL('../../auth-worker/worker.js',import.meta.url),'utf8'),compatibilityDate:'2026-09-29',durableObjects:{SESSIONS:{className:'SessionStore',useSQLite:true}}}
 ]});
 options.isolatedResourcePersistencePath=state;options.resourcePersistencePath=state;options.logRequests=false;
 let mf=new Miniflare(options);
 try{
  const db=await mf.getD1Database('ASSESSMENTS_DB','private-backend');
  for(const statement of migration.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|PRAGMA|$)/).map(s=>s.trim()).filter(Boolean))await db.exec(statement.replace(/\s+/g,' ')+';');
  await seed(db);
  const ns=await mf.getDurableObjectNamespace('SESSIONS','auth'),sessions=ns.get(ns.idFromName('salta-professor-sessions'));
  const tokens={a:secret(),b:secret(),second:secret()};
  for(const [name,token]of Object.entries(tokens))assert.equal((await sessions.fetch('https://sessions/create',{method:'POST',body:JSON.stringify({id:token,user:name==='b'?'synthetic-login-b':'synthetic-login-a',expiresAt:Math.floor(Date.now()/1000)+3600})})).status,204);
  const browser=(actor='a')=>(url,init={})=>mf.dispatchFetch(url,{...init,headers:{...init.headers,Origin:PORTAL_ORIGIN,Cookie:'__Host-salta_session='+tokens[actor],'CF-Connecting-IP':'192.0.2.44'}});
  const client=actor=>createPrivateAssessmentClient({enabled:true,baseUrl:'https://stats.example/assessments/v1',fetchFn:browser(actor)});
  const http=(path,actor='a',init={})=>browser(actor)('https://stats.example'+path,init);
  const counts=()=>db.prepare('SELECT (SELECT COUNT(*) FROM av_assessments) AS roots,(SELECT COUNT(*) FROM av_revisions) AS revisions,(SELECT COUNT(*) FROM av_requests) AS receipts').first();
  // Existing Stats /auth/session continues using the unchanged production proxy.
  assert.equal((await http('/auth/session')).status,200);
  const a=client('a'),b=client('b');assert.equal((await a.session()).principalId,'synthetic-teacher-a');
  assert.equal((await a.session()).scoreFormatVersion,'salta-score-format-v1');
  await a.list();await a.grants();assert.deepEqual(await counts(),{roots:0,revisions:0,receipts:0});
  const {plan,manifest}=assessment({scoreDecimals:0}),op=a.prepareSave({plan,manifest,scope,status:'issued'});
  let loseReceipt=true;
  const flaky=createPrivateAssessmentClient({enabled:true,baseUrl:'https://stats.example/assessments/v1',fetchFn:async(url,init)=>{
   const response=await browser('a')(url,init);
   if(init.method==='PUT'&&loseReceipt){loseReceipt=false;throw Error('synthetic connection lost after commit')}
   return response;
  }});
  await assert.rejects(flaky.saveAndVerify(op),e=>e.code==='network');
  assert.deepEqual(await counts(),{roots:1,revisions:1,receipts:1},'Lost response does not undo the committed operation');
  const confirmed=await a.saveAndVerify(op);assert.equal(confirmed.receipt.replayed,true);assert.equal(confirmed.record.definition.answers.length,60);assert.equal(confirmed.record.totalUnits,'100000');
  const replay=await a.saveAndVerify(op);assert.equal(replay.receipt.replayed,true);assert.deepEqual(await counts(),{roots:1,revisions:1,receipts:1});
  const secondAssessment=assessment({title:'Piloto sintético de 60 questões B',answer:'B',scoreDecimals:1});
  const secondRecord=(await a.saveAndVerify(a.prepareSave({...secondAssessment,scope,status:'issued'}))).record;
  assert.notEqual(secondRecord.id,confirmed.record.id);assert.equal(secondRecord.definition.answers.length,60);
  assert.ok(secondRecord.definition.answers.every(row=>row.correct==='B'));
  assert.ok(confirmed.record.definition.answers.every(row=>row.correct==='A'));
  assert.deepEqual(await counts(),{roots:2,revisions:2,receipts:2});
  const controller=createPrivateLibraryController({client:a,getDraft:()=>({plan,manifest})});
  await controller.initialize();controller.useScope(scope);
  const catalog=await controller.list();
  assert.deepEqual(new Set(catalog.map(row=>row.id)),new Set([confirmed.record.id,secondRecord.id]));
  assert.equal(controller.view().nextCursor,null);
  assert.ok(catalog.every(row=>!('definition' in row)&&!('answers' in row)&&!('encrypted_json' in row)));
  await controller.open(secondRecord.id,1);assert.equal(controller.view().record.definition.title,secondRecord.definition.title);
  assert.deepEqual((await b.list(null,scope)).assessments,[],'Catalog uses the verified owner, not query identity');
  const emptyScope={...scope,classId:'synthetic-empty-class'};
  await db.prepare('INSERT INTO av_grants VALUES(?,?,?,?,1,1,?)').bind('synthetic-teacher-a',emptyScope.institutionId,emptyScope.classId,emptyScope.periodId,Date.now()+3600_000).run();
  assert.deepEqual((await a.list(null,emptyScope)).assessments,[],'Complete class scope filters before pagination');
  await assert.rejects(a.list(null,{...scope,periodId:'not-granted'}),e=>e.status===403);
  assert.deepEqual((await client('second').open(confirmed.record.id,1)).definition,confirmed.record.definition,'Another real Auth session recovers the same definition without a phrase');
  await assert.rejects(b.open(confirmed.record.id),e=>e.status===404);
  const denied=a.prepareSave({plan,manifest,scope:{...scope,classId:'not-granted'},status:'issued'});await assert.rejects(a.saveAndVerify(denied),e=>e.status===403);
  const selected=await a.selectAndVerify(a.prepareSelection(confirmed.record.id,1));
  assert.equal(selected.selection.revision,1);assert.equal(selected.selection.plan.scoreDecimals,0);
  const updates=[1,2].map(()=>a.prepareSave({plan:{...plan,scoreDecimals:2},manifest,scope,assessmentId:confirmed.record.id,expectedRevision:1,status:'issued'}));
  const race=await Promise.allSettled(updates.map(p=>a.saveAndVerify(p)));
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
  assert.equal((await a.resumeSelection(selected.selection.selectionId)).revision,1,'New revision cannot change the selected key');
  assert.equal((await controller.history(confirmed.record.id)).length,2);
  const catalogAfterRevision=await a.list(null,scope);
  assert.equal(catalogAfterRevision.assessments.find(row=>row.id===confirmed.record.id).revision,2);
  assert.equal((await a.open(secondRecord.id,1)).definition.title,secondRecord.definition.title,'Editing A never changes B');
  const printed=await a.request('GET','/assessments/'+confirmed.record.id+'/revisions/1/print');
  assert.ok(printed.data.svg.includes('width="210mm" height="297mm"'));assert.ok(printed.data.svg.includes('data-assessment-revision="1"'));assert.ok(!JSON.stringify(printed.data).includes('"correct"'));
  assert.equal((await a.open(confirmed.record.id,2)).definition.display.scoreDecimals,2);
  assert.equal((await a.resumeSelection(selected.selection.selectionId)).plan.scoreDecimals,0);
  const beforeRevocation=await counts();
  await db.prepare("UPDATE av_grants SET enabled=0,epoch=epoch+1 WHERE principal_id='synthetic-teacher-a'").run();
  await assert.rejects(a.open(confirmed.record.id,1),e=>e.status===403);assert.deepEqual(await counts(),beforeRevocation);
  await assert.rejects(a.list(null,scope),e=>e.status===403);
  await db.prepare("UPDATE av_grants SET enabled=1,epoch=epoch+1 WHERE principal_id='synthetic-teacher-a'").run();
  assert.equal((await http('/auth/logout','a',{method:'POST'})).status,200);
  await assert.rejects(a.session(),e=>e.status===401);
  assert.equal((await client('second').open(confirmed.record.id,1)).revision,1);
  await mf.dispose();mf=new Miniflare(options);
  assert.equal((await client('second').open(confirmed.record.id,1)).definition.answers.length,60,'Persisted D1/Auth state survives local restart');
  assert.equal((await client('second').open(secondRecord.id,1)).definition.answers.length,60);
  assert.equal((await client('second').list(null,scope)).assessments.length,2);
  assert.equal((await client('second').open(confirmed.record.id,1)).definition.display.scoreDecimals,0);
  assert.equal((await client('second').open(confirmed.record.id,2)).definition.display.scoreDecimals,2);
  assert.equal((await client('second').open(secondRecord.id,1)).definition.display.scoreDecimals,1);
  assert.equal((await client('second').resumeSelection(selected.selection.selectionId)).plan.scoreDecimals,0);
  assert.equal((await http('/diario/frequencia','a')).status,401,'Revoked cookie is still rejected on unchanged legacy diary route');
 }finally{await mf.dispose();await rm(state,{recursive:true,force:true})}
});
