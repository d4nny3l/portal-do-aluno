import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,packet,definition,secret,scope} from './helpers.mjs';
import {validateDefinition} from '../definition.mjs';
import {keyring,open} from '../crypto.mjs';
const count=(h,table)=>h.db.sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
const saved=async(h,id,p)=>{const r=await h.request('/assessments/'+id,{method:'PUT',data:p});assert.equal(r.status,201,await r.clone().text());return r.json();};

test('existing Auth session reader, fail closed, forged identities, unprovisioned and expiry',async t=>{
 const h=await harness();t.after(h.close);
 assert.equal((await h.request('/session',{actor:''})).status,401);
 assert.equal((await h.request('/session',{actor:'unknown'})).status,403);
 assert.equal((await h.request('/session',{actor:'invalid',headers:{'X-Teacher-Id':'synthetic-teacher-a',Authorization:'Bearer synthetic-teacher-a'}})).status,401);
 assert.equal((await h.request('/session')).status,200);
 const token=h.tokens.a.split('=')[1];h.entries.get('session:'+token).expiresAt=0;
 assert.equal((await h.request('/session')).status,401);
 h.env.ENABLE_ASSESSMENTS='false';assert.equal((await h.request('/session')).status,503);
 h.env.ENABLE_ASSESSMENTS='true';h.env.AUTH={fetch:async()=>{throw Error('offline');}};assert.equal((await h.request('/session',{actor:'b'})).status,503);
 assert.equal(count(h,'av_assessments'),0);
});
test('blocks, exact keys, no omissions, weights or ambiguous score units accepted',()=>{
 const d=definition(),checked=validateDefinition(d);assert.equal(checked.totalUnits,10000);assert.equal(checked.scoreScale,1000);
 assert.deepEqual(checked.definition,d);
 for(const mutate of [d=>d.blocks[0].valueUnits=-1,d=>d.blocks[0].valueUnits=0.1,d=>d.blocks[0].questionIds.pop(),d=>d.blocks[1].questionIds.push(d.blocks[0].questionIds[0]),d=>d.answers[0].correct='Z',d=>d.answers.pop(),d=>d.blocks[0].weight=2,d=>d.display.score='automatic',d=>d.date='2026-02-30']){
  const copy=structuredClone(d);mutate(copy);assert.throws(()=>validateDefinition(copy));
 }
});
test('persist, recover in a new authenticated request, isolation and historical revisions V1/V2',async t=>{
 const h=await harness();t.after(h.close);
 for(const legacy of [false,true]){
  const id=crypto.randomUUID(),p=packet(0,{definition:definition({legacy})});await saved(h,id,p);
  assert.equal((await h.request('/assessments/'+id,{actor:'b'})).status,404);
  const first=(await(await h.request('/assessments/'+id+'/revisions/1')).json()).record;
  assert.deepEqual(first.definition,p.definition);assert.equal(first.totalUnits,10000);
  const p2=packet(1,{definition:structuredClone(p.definition)});p2.definition.answers[0].correct='E';await saved(h,id,p2);
  assert.deepEqual((await(await h.request('/assessments/'+id+'/revisions/1')).json()).record,first);
  assert.equal((await(await h.request('/assessments/'+id)).json()).record.definition.answers[0].correct,'E');
  const rows=await(await h.request('/assessments/'+id+'/revisions')).json();assert.equal(rows.revisions.length,2);
 }
 const listing=await(await h.request('/assessments')).json();assert.equal(listing.assessments.length,2);assert.ok(!JSON.stringify(listing).includes('correct'));
 const raw=h.db.sqlite.prepare('SELECT encrypted_json FROM av_revisions LIMIT 1').get().encrypted_json;
 assert.ok(!raw.includes('Avaliação sintética'));assert.ok(!raw.includes('correct'));
 assert.throws(()=>h.db.sqlite.exec('UPDATE av_revisions SET revision=5'),/immutable/);
 assert.throws(()=>h.db.sqlite.exec('DELETE FROM av_revisions'),/immutable/);
});
test('retry, lost receipt, duplicate confirmation concurrency, stale CAS and rollback',async t=>{
 const h=await harness();t.after(h.close);const id=crypto.randomUUID(),p=packet();
 const replies=await Promise.all([h.request('/assessments/'+id,{method:'PUT',data:p}),h.request('/assessments/'+id,{method:'PUT',data:p})]);
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,201]);assert.equal(count(h,'av_revisions'),1);
 const retry=await h.request('/assessments/'+id,{method:'PUT',data:p});assert.equal((await retry.json()).replayed,true);
 const altered=structuredClone(p);altered.definition.title='Outro conteúdo';assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:altered})).status,409);
 const two=await Promise.all([packet(1),packet(1)].map(data=>h.request('/assessments/'+id,{method:'PUT',data})));assert.deepEqual(two.map(r=>r.status).sort(),[201,409]);
 assert.equal(count(h,'av_revisions'),2);
 const brokenId=crypto.randomUUID(),broken=packet();h.db.failSql=sql=>sql.startsWith('INSERT INTO av_requests');
 assert.equal((await h.request('/assessments/'+brokenId,{method:'PUT',data:broken})).status,503);
 assert.equal(count(h,'av_assessments'),1);assert.equal(count(h,'av_revisions'),2);
 h.db.failSql=null;await saved(h,brokenId,broken);
});
test('grant and principal revocation/expiry inside the transaction, isolation of all scopes, CSRF',async t=>{
 for(const sql of ["UPDATE av_grants SET enabled=0","UPDATE av_grants SET epoch=epoch+1","UPDATE av_grants SET expires_at=0","UPDATE av_principals SET enabled=0","UPDATE av_principals SET epoch=epoch+1","UPDATE av_principals SET expires_at=0"]){
  const h=await harness();try{const p=packet(),id=crypto.randomUUID();h.db.beforeBatch=()=>h.db.sqlite.exec(sql);assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:p})).status,409);assert.equal(count(h,'av_assessments'),0);assert.equal(count(h,'av_revisions'),0);}finally{h.close();}
 }
 const h=await harness();t.after(h.close);
 for(const field of ['institutionId','classId','periodId'])assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:packet(0,{[field]:'unauthorized'})})).status,403);
 assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:packet(),headers:{Origin:'https://evil.invalid'}})).status,403);
 const id=crypto.randomUUID();await saved(h,id,packet());
 h.db.sqlite.exec('UPDATE av_grants SET enabled=0');assert.equal((await h.request('/assessments/'+id)).status,403);assert.equal((await(await h.request('/assessments')).json()).assessments.length,0);
});
test('selection pins an issued revision, public print excludes secrets, duplicate and archive preserve history',async t=>{
 const h=await harness();t.after(h.close);const id=crypto.randomUUID(),p=packet();await saved(h,id,p);
 const selection={requestId:crypto.randomUUID(),selectionId:crypto.randomUUID(),assessmentId:id,revision:1};
 assert.equal((await h.request('/selections',{method:'POST',data:selection})).status,201);
 const print=await(await h.request('/assessments/'+id+'/revisions/1/print')).json();
 assert.deepEqual(Object.keys(print).sort(),['assessmentId','manifestHash','revision','schemaVersion','svg']);
 assert.ok(print.svg.includes('width="210mm" height="297mm"'));assert.ok(!JSON.stringify(print).includes('"correct"'));assert.ok(!JSON.stringify(print).includes('valueUnits'));
 const p2=packet(1);p2.definition.answers[0].correct='E';await saved(h,id,p2);
 const session=(await(await h.request('/selections/'+selection.selectionId)).json()).record;assert.equal(session.revision,1);assert.deepEqual(session.definition.answers,p.definition.answers);
 const newId=crypto.randomUUID(),duplicate={requestId:crypto.randomUUID(),newId,sourceRevision:1};
 assert.equal((await h.request('/assessments/'+id+'/duplicate',{method:'POST',data:duplicate})).status,201);
 assert.equal((await h.request('/assessments/'+id+'/duplicate',{method:'POST',data:duplicate})).status,200);
 const copy=(await(await h.request('/assessments/'+newId)).json()).record;assert.equal(copy.status,'draft');assert.deepEqual(copy.definition,p.definition);
 assert.equal((await h.request('/selections',{method:'POST',data:{...selection,requestId:crypto.randomUUID(),selectionId:crypto.randomUUID(),assessmentId:newId}})).status,409);
 const arch={requestId:crypto.randomUUID(),expectedRevision:2};assert.equal((await h.request('/assessments/'+id+'/archive',{method:'POST',data:arch})).status,200);
 assert.equal((await h.request('/assessments/'+id+'/archive',{method:'POST',data:arch})).status,200);
 assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:packet(2)})).status,409);
 assert.equal((await h.request('/selections/'+selection.selectionId)).status,200);
 assert.equal((await h.request('/selections/'+selection.selectionId,{actor:'b'})).status,404);
 assert.equal((await h.request('/selections',{method:'POST',data:{...selection,requestId:crypto.randomUUID(),selectionId:crypto.randomUUID()}})).status,409);
 assert.throws(()=>h.db.sqlite.exec('UPDATE av_selections SET revision=2'),/immutable/);
});
test('server key rotation preserves old revisions and retries; missing keys cannot replace historical ciphertext',async t=>{
 const h=await harness();t.after(h.close);const id=crypto.randomUUID(),p=packet();await saved(h,id,p);
 const keys=JSON.parse(h.env.ASSESSMENT_KEYRING);keys[2]=secret();h.env.ASSESSMENT_KEYRING=JSON.stringify(keys);h.env.ASSESSMENT_ACTIVE_KEY_VERSION='2';
 assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:p})).status,200);
 await saved(h,id,packet(1));assert.equal((await h.request('/assessments/'+id+'/revisions/1')).status,200);
 assert.deepEqual(h.db.sqlite.prepare('SELECT key_version FROM av_revisions ORDER BY revision').all().map(r=>r.key_version),[1,2]);
 const original=h.db.sqlite.prepare('SELECT encrypted_json FROM av_revisions WHERE revision=1').get().encrypted_json;
 delete keys[1];h.env.ASSESSMENT_KEYRING=JSON.stringify(keys);assert.equal((await h.request('/assessments/'+id+'/revisions/1')).status,503);
 assert.equal(h.db.sqlite.prepare('SELECT encrypted_json FROM av_revisions WHERE revision=1').get().encrypted_json,original);
});
test('ciphertext authenticates owner, institution, revision and scope; storage is not E2EE',async t=>{
 const h=await harness();t.after(h.close);const id=crypto.randomUUID();await saved(h,id,packet());
 const stored=h.db.sqlite.prepare('SELECT * FROM av_revisions').get(),encrypted=JSON.parse(stored.encrypted_json),ring=keyring(h.env);
 const record={id,ownerId:'synthetic-teacher-a',...scope,revision:1,status:'issued',manifestHash:stored.manifest_hash,keyVersion:1};
 assert.equal((await open(ring,record,encrypted)).title,'Avaliação sintética privada');
 for(const changes of [{ownerId:'synthetic-teacher-b'},{institutionId:'another-institution'},{revision:2},{classId:'another-class'},{periodId:'another-period'},{status:'draft'},{manifestHash:'0'.repeat(16)}])await assert.rejects(open(ring,{...record,...changes},encrypted));
 const corrupt={...encrypted,ciphertext:(encrypted.ciphertext[0]==='A'?'B':'A')+encrypted.ciphertext.slice(1)};await assert.rejects(open(ring,record,corrupt));
});
test('archive versus update concurrency and revocation during selection do not overwrite confirmed history',async t=>{
 const h=await harness();t.after(h.close);const id=crypto.randomUUID();await saved(h,id,packet());
 const race=await Promise.all([h.request('/assessments/'+id,{method:'PUT',data:packet(1)}),h.request('/assessments/'+id+'/archive',{method:'POST',data:{requestId:crypto.randomUUID(),expectedRevision:1}})]);
 assert.equal(race.filter(r=>r.status===409).length,1);assert.equal(race.filter(r=>r.status===200||r.status===201).length,1);
 const freshId=crypto.randomUUID();await saved(h,freshId,packet());
 h.db.beforeBatch=()=>h.db.sqlite.exec('UPDATE av_grants SET epoch=epoch+1');
 assert.equal((await h.request('/selections',{method:'POST',data:{requestId:crypto.randomUUID(),selectionId:crypto.randomUUID(),assessmentId:freshId,revision:1}})).status,409);
 assert.equal(count(h,'av_selections'),0);
 assert.equal((await h.request('/assessments/'+freshId+'/revisions/1')).status,200);
});
