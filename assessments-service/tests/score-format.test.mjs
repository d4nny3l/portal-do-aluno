import test from 'node:test';
import assert from 'node:assert/strict';
import {definition,harness,packet,scope} from './helpers.mjs';
import {validateDefinition,printArtifact} from '../definition.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord,pinnedSelection} from '../../corretor/v2/assessments/private-contract-adapter.mjs';
import {scoreIntegratedPlan,scoreInputUnits,draftSummary,POINT_SCALE,createIntegratedPlan} from '../../corretor/v2/assessments/block-scoring.mjs';
import {formatScore,scoreDecimals,validateScoreDisplay} from '../../corretor/v2/assessments/score-format.mjs';
const record=(d=definition())=>({id:crypto.randomUUID(),revision:1,status:'issued',manifestHash:d.manifest.contentHash,definition:d,totalUnits:d.blocks.reduce((n,b)=>n+BigInt(b.valueUnits),0n).toString(),scoreScale:10000,...scope});
const observations=plan=>plan.blocks.flatMap((b,bi)=>b.questions.map((q,i)=>({questionId:q.questionId,number:q.number,state:'read',answer:bi===0&&i===0?q.correct:'E',reviewed:true})));

test('score display v1: only numeric 0/1/2; absence defaults to two without mutating old definitions',()=>{
 const old=definition(),bytes=JSON.stringify(old);
 assert.equal(scoreDecimals(),2);assert.equal(validateScoreDisplay(old.display),2);
 assert.deepEqual(validateDefinition(old).definition,old);assert.equal(JSON.stringify(old),bytes);
 for(const bad of [-1,3,1.5,'1',null,true,NaN,{},[]]){
  assert.throws(()=>scoreDecimals(bad));
  assert.throws(()=>validateDefinition({...old,display:{score:'both',scoreDecimals:bad}}));
 }
 for(const display of [{},{score:'both',scoreDecimals:undefined},{score:'both',decimals:2},{score:'all'},{score:'both',scoreDecimals:1,extra:true}])assert.throws(()=>validateScoreDisplay(display));
 for(const mode of ['final','blocks','both'])for(const places of [0,1,2])assert.equal(validateScoreDisplay({score:mode,scoreDecimals:places}),places);
});
test('exact presentation: half up, zeros, sums and one third never round stored units or mutate a pinned plan',()=>{
 assert.equal(POINT_SCALE,10000n);
 for(const [places,ten,third,half]of [[0,'10','3','1'],[1,'10,0','3,3','0,5'],[2,'10,00','3,33','0,50']]){
  assert.equal(formatScore(10n,1n,places),ten);assert.equal(formatScore(10n,3n,places),third);assert.equal(formatScore(1n,2n,places),half);
  assert.equal(formatScore(0n,1n,places),['0','0,0','0,00'][places]);
  const d=definition();d.display.scoreDecimals=places;d.blocks[0].valueUnits='100000';d.blocks[1].valueUnits='1';
  const r=record(d),built=planFromPrivateRecord(r),before=JSON.stringify(built.plan);
  const score=scoreIntegratedPlan(built.plan,observations(built.plan),{...built,identityMode:'none'});
  assert.equal(score.complete,true);assert.equal(score.total,third);assert.equal(score.blocks[0].earned,third);assert.equal(score.maximum,ten);
  assert.equal(JSON.stringify(built.plan),before);assert.equal(built.plan.totalUnits,'100001');
  assert.deepEqual(definitionFromLocalPlan(built.plan,built.manifest),d);
 }
 assert.equal(formatScore(1005n,1000n,2),'1,01');assert.equal(formatScore(9995n,1000n,2),'10,00');
 assert.equal(formatScore(1n,200n,2),'0,01');assert.equal(formatScore(9007199254740993n,1n,0),'9007199254740993');
 const d=definition(),built=planFromPrivateRecord(record(d));assert.equal(Object.hasOwn(built.plan,'scoreDecimals'),false);
 assert.deepEqual(definitionFromLocalPlan(built.plan,built.manifest),d,'Legacy serialization must not inject fallback into receipts or old data');
});
test('new editor inputs refuse incompatible amounts; retained exact historical values are never truncated',()=>{
 for(const [places,good,bad,expected]of [[0,'10,0000','10,1','100000'],[1,'1,2000','1,21','12000'],[2,'1,2300','1,234','12300']]){
  assert.equal(scoreInputUnits(good,places),expected);assert.throws(()=>scoreInputUnits(bad,places),/incompatível/);
 }
 assert.throws(()=>scoreInputUnits('1,00001',2));assert.throws(()=>scoreInputUnits('0',2));
 const sections=[{sectionId:'s',label:'Bloco',items:[{questionId:'q',number:1,type:'A-E'}]}];
 for(const places of [0,1,2]){
  const sum=draftSummary({sections,values:{s:'1.2345'},answers:{q:'A'},scoreDecimals:places});
  assert.equal(sum.total,['1','1,2','1,23'][places]);assert.equal(sum.blocks[0].amount,sum.total);
  const plan=createIntegratedPlan({metadata:{title:'Sintética',subject:'Teste',kind:'Prova'},sections,values:{s:'1.2345'},answers:{q:'A'},model:{templateId:'test',revision:1,contentHash:'test'},scoreDecimals:places});
  assert.equal(plan.totalUnits,'12345','Presentation preference must not restrict the existing exact domain');
 }
});
test('format preference stays private and cannot alter public print, manifest, answer key or geometry',()=>{
 const d=definition(),r=record(d),manifest=JSON.stringify(d.manifest),answers=JSON.stringify(d.answers),baseline=printArtifact(r);
 for(const places of [0,1,2]){
  const next=structuredClone(d);next.display.scoreDecimals=places;
  const checked=validateDefinition(next).definition;
  assert.equal(JSON.stringify(checked.manifest),manifest);assert.equal(JSON.stringify(checked.answers),answers);
  assert.deepEqual(printArtifact({...r,definition:checked}),baseline);
  assert.doesNotMatch(JSON.stringify(printArtifact({...r,definition:checked})),/scoreDecimals|correct|answers/);
 }
});
for(const places of [0,1,2])test(`private API format ${places}: persisted roundtrip, replay, duplicate, immutable history, selection and access controls`,async()=>{
 const h=await harness();try{
  assert.equal((await(await h.request('/session')).json()).scoreFormatVersion,'salta-score-format-v1');
  const id=crypto.randomUUID(),d=definition();d.display.scoreDecimals=places;
  const p=packet(0,{definition:d}),route='/assessments/'+id;
  assert.equal((await h.request(route,{method:'PUT',data:p,actor:null})).status,401);
  assert.equal((await h.request(route,{method:'PUT',data:p,actor:'unknown'})).status,403);
  const created=await h.request(route,{method:'PUT',data:p});assert.equal(created.status,201,await created.clone().text());
  assert.equal((await h.request(route,{method:'PUT',data:p})).status,200);
  const changed=structuredClone(p);changed.definition.display.scoreDecimals=(places+1)%3;
  assert.equal((await h.request(route,{method:'PUT',data:changed})).status,409,'Request MAC binds preference as well as exact values');
  const opened=(await(await h.request(route)).json()).record;assert.deepEqual(opened.definition,d);
  const built=planFromPrivateRecord(JSON.parse(JSON.stringify(opened)));assert.equal(built.plan.scoreDecimals,places);
  assert.deepEqual(definitionFromLocalPlan(built.plan,built.manifest),d);
  const wrongScope=packet(0,{definition:d,classId:'denied-class'});
  assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:wrongScope})).status,403);
  assert.equal((await h.request(route,{actor:'b'})).status,404);
  const dup={requestId:crypto.randomUUID(),newId:crypto.randomUUID(),sourceRevision:1};
  assert.equal((await h.request(route+'/duplicate',{method:'POST',data:dup})).status,201);
  const copy=(await(await h.request('/assessments/'+dup.newId)).json()).record;assert.equal(copy.definition.display.scoreDecimals,places);
  const editedCopy=structuredClone(copy.definition);editedCopy.display.scoreDecimals=(places+2)%3;
  assert.equal((await h.request('/assessments/'+dup.newId,{method:'PUT',data:packet(1,{definition:editedCopy,status:'draft'})})).status,201);
  assert.equal((await(await h.request('/assessments/'+dup.newId)).json()).record.definition.display.scoreDecimals,(places+2)%3);
  assert.equal((await(await h.request(route)).json()).record.definition.display.scoreDecimals,places,'Editing duplicate cannot change source format');
  assert.equal((await(await h.request('/assessments/'+dup.newId+'/revisions/1')).json()).record.definition.display.scoreDecimals,places);
  const selection={requestId:crypto.randomUUID(),selectionId:crypto.randomUUID(),assessmentId:id,revision:1};
  assert.equal((await h.request('/selections',{method:'POST',data:selection})).status,201);
  const downgrade=packet(1,{definition:definition()});assert.equal((await h.request(route,{method:'PUT',data:downgrade})).status,409,'Old client cannot erase preference');
  const race=await Promise.all([0,1].map(i=>{const next=structuredClone(d);next.display.scoreDecimals=(places+i+1)%3;return h.request(route,{method:'PUT',data:packet(1,{definition:next})})}));
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  assert.deepEqual((await(await h.request(route+'/revisions/1')).json()).record.definition,d);
  const pinned=pinnedSelection(await(await h.request('/selections/'+selection.selectionId)).json());assert.equal(pinned.plan.scoreDecimals,places);
  assert.equal((await(await h.request(route+'/revisions')).json()).revisions.length,2);
  const stored=h.db.sqlite.prepare('SELECT encrypted_json FROM av_revisions WHERE assessment_id=?').all(id);
  assert.ok(stored.every(row=>!row.encrypted_json.includes('scoreDecimals')),'Preference remains in authenticated ciphertext');
  const invalid=packet(0,{definition:{...d,display:{score:'both',scoreDecimals:3}}});assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:invalid})).status,400);
 }finally{h.close()}
});
test('legacy client replays remain valid after a newer revision chooses a format; legacy duplicates remain byte compatible',async()=>{
 const h=await harness();try{
  const id=crypto.randomUUID(),p=packet(),route='/assessments/'+id;
  assert.equal((await h.request(route,{method:'PUT',data:p})).status,201);
  const d=definition();d.display.scoreDecimals=0;assert.equal((await h.request(route,{method:'PUT',data:packet(1,{definition:d})})).status,201);
  assert.equal((await h.request(route,{method:'PUT',data:p})).status,200,'Original receipt remains replayable');
  const duplicate={requestId:crypto.randomUUID(),newId:crypto.randomUUID(),sourceRevision:1};assert.equal((await h.request(route+'/duplicate',{method:'POST',data:duplicate})).status,201);
  const old=(await(await h.request('/assessments/'+duplicate.newId)).json()).record;assert.deepEqual(old.definition,p.definition);assert.equal(scoreDecimals(planFromPrivateRecord(old).plan.scoreDecimals),2);
 }finally{h.close()}
});
