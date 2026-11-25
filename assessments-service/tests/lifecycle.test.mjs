import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,packet,scope,definition} from './helpers.mjs';
import {ASSESSMENT_LIFECYCLE_VERSION as version} from '../../corretor/v2/assessments/lifecycle.mjs';
const pkt=(rev=0)=>({...packet(rev),lifecycleVersion:version});
const deletion=revision=>({requestId:crypto.randomUUID(),expectedRevision:revision,lifecycleVersion:version});
const count=(h,t)=>Number(h.db.sqlite.prepare('SELECT count(*) n FROM '+t).get().n);
async function put(h,id,p,status=201){const res=await h.request('/assessments/'+id,{method:'PUT',data:p});assert.equal(res.status,status,await res.clone().text());return res.json()}
async function erase(h,id,p,status=201){const res=await h.request('/assessments/'+id+'/delete',{method:'POST',data:p});assert.equal(res.status,status,await res.clone().text());return res.json()}
async function selection(h,id,revision,status=201){const selectionId=crypto.randomUUID();const res=await h.request('/selections',{method:'POST',data:{requestId:crypto.randomUUID(),selectionId,assessmentId:id,revision}});assert.equal(res.status,status,await res.clone().text());return selectionId;}
test('capability requires migration, owner policy, trusted gateway; old clients/servers fail closed',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);
 assert.equal((await (await h.request('/session')).json()).assessmentLifecycleVersion,version);
 assert.equal((await h.request('/session',{headers:{'X-Salta-Assessment-Lifecycle':'forged'}})).status,503);
 delete h.env.ASSESSMENT_RETENTION_POLICY;assert.equal((await h.request('/session')).status,503);
 h.env.ASSESSMENT_RETENTION_POLICY=version;
 await put(h,crypto.randomUUID(),packet(),409);
 h.env.ENABLE_ASSESSMENT_LIFECYCLE='false';
 await put(h,crypto.randomUUID(),pkt(),400);
 assert.equal((await (await h.request('/session')).json()).assessmentLifecycleVersion,undefined);
});
test('N saves preserve identity, exact newest definition and hash; purge all history and invalidate selection',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID(),p=pkt();
 await put(h,id,p);const sel=await selection(h,id,1);
 for(let rev=1;rev<5;rev++){const next=pkt(rev);next.definition.title='Synthetic replacement '+rev;await put(h,id,next);
  assert.equal(count(h,'av_revisions'),1);assert.equal(count(h,'av_purge_guards'),0);
  const opened=await (await h.request('/assessments/'+id)).json();assert.deepEqual(opened.record.definition,next.definition);assert.equal(opened.record.revision,rev+1);
 }
 assert.equal((await h.request('/selections/'+sel)).status,404);
 for(const suffix of ['/revisions','/revisions/1','/revisions/1/print'])assert.equal((await h.request('/assessments/'+id+suffix)).status,410);
 await selection(h,id,1,410);
 await put(h,id,p,409); // old receipt is not a claim that the prior definition still exists.
 assert.deepEqual(h.db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('delete purges root, encrypted definitions, selections; receipt survives loss/retry; no resurrection',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID(),other=crypto.randomUUID(),p=pkt();
 await put(h,id,p);await put(h,other,pkt());const sel=await selection(h,id,1),d=deletion(1);
 assert.equal((await erase(h,id,d)).deleted,true);assert.equal((await erase(h,id,d,200)).replayed,true);
 assert.equal((await h.request('/assessments/'+id)).status,404);
 for(const suffix of ['/revisions','/revisions/1','/revisions/1/print'])assert([404,410].includes((await h.request('/assessments/'+id+suffix)).status));
 assert.equal((await h.request('/selections/'+sel)).status,404);
 assert.equal((await h.request('/assessments/'+other)).status,200);
 assert.equal((await (await h.request('/assessments/'+id+'/status')).json()).deleted,true);
 const catalog=await (await h.request('/assessments')).json();assert.deepEqual(catalog.assessments.map(x=>x.id),[other]);
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions WHERE assessment_id=?').get(id).n,0);
 await put(h,id,p,410);await put(h,id,pkt(),409);
 const conflict={...d,expectedRevision:2};await erase(h,id,conflict,409);
 assert.equal(count(h,'av_purge_guards'),0);assert.deepEqual(h.db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.throws(()=>h.db.sqlite.prepare('DELETE FROM av_lifecycle_fences').run(),/immutable/);
});
test('transaction faults preserve exact previous definition and selections; lost receipt can be replayed',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID(),old=pkt();await put(h,id,old);const sel=await selection(h,id,1);
 const next=pkt(1);h.db.failSql=sql=>sql.startsWith('DELETE FROM av_revisions');await put(h,id,next,503);
 let record=(await (await h.request('/assessments/'+id)).json()).record;assert.deepEqual(record.definition,old.definition);assert.equal(record.revision,1);assert.equal((await h.request('/selections/'+sel)).status,200);
 await erase(h,id,deletion(1),503);assert.equal((await h.request('/assessments/'+id)).status,200);assert.equal(count(h,'av_purge_guards'),0);
 h.db.failSql=null;await put(h,id,next);assert.equal((await put(h,id,next,200)).replayed,true);
 assert.equal(count(h,'av_revisions'),1);
});
test('stale CAS, revocation between read/batch, cross-owner and retention holds preserve content',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID();await put(h,id,pkt());
 assert.equal((await h.request('/assessments/'+id+'/delete',{actor:'b',method:'POST',data:deletion(1)})).status,404);
 await erase(h,id,deletion(2),409);
 h.db.sqlite.prepare("INSERT INTO av_retention_holds VALUES(?,'academic')").run(id);await erase(h,id,deletion(1),409);await put(h,id,pkt(1),409);
 h.db.sqlite.prepare('DELETE FROM av_retention_holds WHERE assessment_id=?').run(id);
 h.db.beforeBatch=()=>{h.db.beforeBatch=null;h.db.sqlite.prepare("UPDATE av_grants SET epoch=epoch+1 WHERE principal_id='synthetic-teacher-a'").run();};
 await erase(h,id,deletion(1),409);assert.equal(count(h,'av_assessments'),1);
 assert.equal(count(h,'av_revisions'),1);
});
test('migration preserves old A4 content and receipts until targeted replacement; forbidden raw purge remains guarded',async t=>{
 const h=await harness();t.after(h.close);const id=crypto.randomUUID();for(let i=0;i<3;i++)await put(h,id,packet(i));
 const {readFileSync}=await import('node:fs');h.db.sqlite.exec(readFileSync(new URL('../migrations/0002_assessment_lifecycle.sql',import.meta.url),'utf8'));
 assert.equal(count(h,'av_revisions'),3);assert.equal(count(h,'av_requests'),3);
 assert.throws(()=>h.db.sqlite.prepare('DELETE FROM av_revisions').run(),/unguarded/);
 Object.assign(h.env,{ENABLE_ASSESSMENT_LIFECYCLE:'true',ASSESSMENT_RETENTION_POLICY:version});
 // Existing harness simulates the new trusted service-binding gateway explicitly.
 const p=pkt(3),res=await h.request('/assessments/'+id,{method:'PUT',data:p,headers:{'X-Salta-Assessment-Lifecycle':version}});
 assert.equal(res.status,201,await res.clone().text());assert.equal(count(h,'av_revisions'),1);assert.equal(count(h,'av_requests'),4);
});
test('save/delete/select race at batch boundary never changes a stale definition or resurrects it',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID();await put(h,id,pkt());
 // Two authenticated operations pass their initial reads before either batch.
 const original=h.db.batch.bind(h.db);let waiting=null;
 h.db.batch=async statements=>{if(!waiting)return new Promise((resolve,reject)=>{waiting={statements,resolve,reject}});
  const first=waiting;waiting=null;h.db.batch=original;
  const result=await original(statements);try{first.resolve(await original(first.statements))}catch(e){first.reject(e)}return result;
 };
 const stale=h.request('/assessments/'+id,{method:'PUT',data:pkt(1)});
 while(!waiting)await new Promise(resolve=>setTimeout(resolve,1));
 const removed=await erase(h,id,deletion(1));assert.equal(removed.deleted,true);assert.equal((await stale).status,409);
 assert.equal((await h.request('/assessments/'+id)).status,404);assert.equal(count(h,'av_revisions'),0);
 // Selection that raced a replacement must fail its transactional current check.
 const second=crypto.randomUUID();await put(h,second,pkt());
 h.db.batch=async statements=>{h.db.batch=original;const queued=statements;
  await put(h,second,pkt(1));return original(queued);
 };
 await selection(h,second,1,409);assert.equal(count(h,'av_selections'),0);
});
test('restore of an older synthetic database honors independently held tombstones; missing latest content blocks',async t=>{
 const {reconcileRestoredDatabase,fenceHash}=await import('../restore-fences.mjs');
 const live=await harness({lifecycle:true}),restored=await harness({lifecycle:true});t.after(live.close);t.after(restored.close);
 const deleted=crypto.randomUUID(),changed=crypto.randomUUID();
 for(const id of [deleted,changed]){const p=pkt();await put(live,id,p);await put(restored,id,p)}
 await erase(live,deleted,deletion(1));await put(live,changed,pkt(1));
 const snapshot=fences=>({schemaVersion:'salta-lifecycle-fences-v1',capturedAt:new Date().toISOString(),fences});
 const manifest=snapshot(live.db.sqlite.prepare('SELECT * FROM av_lifecycle_fences ORDER BY assessment_id').all());
 const options={approvedSha256:fenceHash(manifest),minimumCapturedAt:Date.now()-10_000};
 assert.throws(()=>reconcileRestoredDatabase(restored.db.sqlite,manifest,options),/Newest definition/);
 assert.equal(count(restored,'av_assessments'),2); // complete rollback
 const onlyDeleted=snapshot(manifest.fences.filter(f=>f.deleted));
 // A complete witness must include every fence already present in this restored DB.
 onlyDeleted.fences.push(...restored.db.sqlite.prepare('SELECT * FROM av_lifecycle_fences WHERE assessment_id=?').all(changed));
 reconcileRestoredDatabase(restored.db.sqlite,onlyDeleted,{...options,approvedSha256:fenceHash(onlyDeleted)});
 assert.equal((await restored.request('/assessments/'+deleted)).status,404);
 await put(restored,deleted,pkt(),409);
 assert.throws(()=>reconcileRestoredDatabase(restored.db.sqlite,onlyDeleted,{...options,approvedSha256:'0'.repeat(64)}),/evidence/);
});


test('unknown academic CASCADE dependency blocks deletion/replacement without losing independent numerical grades',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID();await put(h,id,pkt());
 h.db.sqlite.exec('CREATE TABLE synthetic_independent_grades (assessment_id TEXT REFERENCES av_assessments(id) ON DELETE CASCADE, grade_units INTEGER NOT NULL)');
 h.db.sqlite.prepare('INSERT INTO synthetic_independent_grades VALUES(?,70000)').run(id);
 await erase(h,id,deletion(1),409);await put(h,id,pkt(1),409);
 assert.equal(h.db.sqlite.prepare('SELECT grade_units FROM synthetic_independent_grades').get().grade_units,70000);
 assert.equal(count(h,'av_assessments'),1);assert.equal(count(h,'av_revisions'),1);
});
