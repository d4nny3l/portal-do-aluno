import test from 'node:test';import assert from 'node:assert/strict';
import {harness,packet} from './helpers.mjs';
import {collectCustodyExport,verifyCustodyExport} from '../custody/export.mjs';
import {custodyFixture,journalStorage} from './custody-fixture.mjs';
import {restoreFromCustody} from '../restore-fences.mjs';
const version='salta-assessment-lifecycle-v1',pkt=(n=0)=>packet(n,{lifecycleVersion:version}),route=id=>'/assessments/'+id;
const put=(h,id,p)=>h.request(route(id),{method:'PUT',data:p});
const remove=(h,id,n)=>h.request(route(id)+'/delete',{method:'POST',data:{requestId:crypto.randomUUID(),expectedRevision:n,lifecycleVersion:version}});
test('independent intent failure means zero D1 mutation; missing binding fails closed',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const p=pkt(),id=crypto.randomUUID();h.custody.state.failBefore='begin';assert.equal((await put(h,id,p)).status,503);assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_requests').get().n,0);
 delete h.env.ASSESSMENT_CUSTODY;assert.equal((await put(h,id,p)).status,503);assert.equal((await h.request('/session')).status,503);
});
test('post-D1 witness failure never releases 201; retry finalizes exact receipt without new purge',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID(),p=pkt();h.custody.state.failBefore='confirm';assert.equal((await put(h,id,p)).status,503);
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions').get().n,1);assert.equal((await h.request('/session')).status,503);
 assert.equal((await put(h,crypto.randomUUID(),pkt())).status,409);
 h.custody.state.failBefore=null;const retry=await put(h,id,p);assert.equal(retry.status,200);assert.equal((await retry.json()).replayed,true);
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions').get().n,1);assert.equal((await h.request('/session')).status,200);
});
test('external ACK loss, concurrent duplicate replay and restart preserve append-only events',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID(),p=pkt();h.custody.state.loseAfter='confirm';assert.equal((await put(h,id,p)).status,503);
 assert.equal((await put(h,id,p)).status,200);const next=pkt(1),race=await Promise.all([put(h,id,next),put(h,id,next)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,201]);
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions').get().n,1);
 const recreated=await custodyFixture(h.db,{storage:h.custody.storage,initialize:false});h.env.ASSESSMENT_CUSTODY=recreated.writer;assert.equal((await put(h,id,next)).status,200);
 assert.throws(()=>h.custody.storage.sqlite.exec('DELETE FROM cj_events'),/immutable/);
 assert.throws(()=>h.custody.storage.sqlite.exec("UPDATE cj_events SET hash='bad'"),/immutable/);
});
test('ambiguous batch without receipt remains PENDING, even after lease expiry or old snapshot restoration',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID(),p=pkt(),batch=h.db.batch;h.db.batch=async()=>{throw Error('transport timeout; outcome unknown')};
 assert.equal((await put(h,id,p)).status,503);h.db.batch=batch;assert.equal((await put(h,id,p)).status,503);assert.equal((await h.request('/session')).status,503);
 await h.custody.operator({action:'close'});await assert.rejects(h.custody.operator({action:'reconcile'}),/custody_pending/);await assert.rejects(h.custody.operator({action:'checkpoint'}),/custody_pending/);
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions').get().n,0);
});
test('batch committed but response lost reconciles; metadata-only journal has no answer key or definition',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID(),p=pkt(),batch=h.db.batch.bind(h.db);h.db.batch=async s=>{h.db.batch=batch;await batch(s);throw Error('response transport lost after commit')};
 assert.equal((await put(h,id,p)).status,200);assert.equal((await h.request('/session')).status,200);
 const events=h.custody.storage.sqlite.prepare('SELECT json FROM cj_events').all().map(x=>JSON.parse(x.json));assert(!JSON.stringify(events).includes(p.definition.title));assert(!JSON.stringify(events).includes('encrypted_json'));assert(!JSON.stringify(events).includes('correct'));assert(!JSON.stringify(events).includes('schemaVersion'));
});
test('complete paginated closed cut, old D1 restore, missing/tampered/stale witness and absent latest content',async t=>{
 const live=await harness({lifecycle:true}),restored=await harness({lifecycle:true});t.after(live.close);t.after(restored.close);const id=crypto.randomUUID(),p=pkt();await put(live,id,p);await put(restored,id,p);
 await live.custody.operator({action:'close'});const old=await collectCustodyExport(live.custody.operator);await live.custody.operator({action:'open'});
 for(let rev=1;rev<=3;rev++)assert.equal((await put(live,id,pkt(rev))).status,201);assert.equal((await remove(live,id,4)).status,201);
 await live.custody.operator({action:'close'});const bundle=await collectCustodyExport(live.custody.operator),options={databaseId:bundle.checkpoint.databaseId,onlineAnchor:bundle.checkpoint};
 const first=await live.custody.operator({action:'events',after:0,limit:2});assert.equal(first.events.length,2);assert.equal(first.next,2);
 const manifest=await verifyCustodyExport(bundle,options);assert.equal(manifest.fences[0].deleted,1);
 await assert.rejects(verifyCustodyExport(old,options),/stale/);await assert.rejects(verifyCustodyExport(bundle,{databaseId:options.databaseId}),/stale/);
 const missing=structuredClone(bundle);missing.events.splice(2,1);await assert.rejects(verifyCustodyExport(missing,options),/stale/);
 const tamper=structuredClone(bundle);tamper.events[0].event.databaseId='different';await assert.rejects(verifyCustodyExport(tamper,options),/stale/);
 await restoreFromCustody(restored.db.sqlite,bundle,options);assert.equal(restored.db.sqlite.prepare('SELECT count(*) n FROM av_assessments').get().n,0);
 assert.throws(()=>restored.db.sqlite.prepare('INSERT INTO av_assessments VALUES(?,?,?,?,?,?,?,?)').run(id,'synthetic-teacher-a','synthetic-institution','synthetic-class','synthetic-period',0,'active',new Date().toISOString()),/deleted/);
 // The independent source stays untouched by a primary database restoration.
 const controller=await custodyFixture(restored.db,{storage:live.custody.storage,initialize:false});await controller.operator({action:'open'});restored.env.ASSESSMENT_CUSTODY=controller.writer;assert.equal((await restored.request(route(id))).status,404);
});
test('holds and revoked grants cannot create a custody intent; elapsed lease cannot mutate D1',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);const id=crypto.randomUUID();assert.equal((await put(h,id,pkt())).status,201);
 const seq=()=>h.custody.storage.sqlite.prepare('SELECT count(*) n FROM cj_events').get().n;
 const before=seq();h.db.sqlite.prepare('INSERT INTO av_retention_holds(assessment_id,reason_code) VALUES(?,?)').run(id,'academic');
 assert.equal((await put(h,id,pkt(1))).status,409);assert.equal((await remove(h,id,1)).status,409);assert.equal(seq(),before);
 await h.custody.operator({action:'close'});const bundle=await collectCustodyExport(h.custody.operator);
 assert.equal((await restoreFromCustody(h.db.sqlite,bundle,{databaseId:bundle.checkpoint.databaseId,onlineAnchor:bundle.checkpoint})).checked,1);
 h.db.sqlite.prepare("UPDATE av_grants SET enabled=0 WHERE principal_id='synthetic-teacher-a'").run();assert.equal((await put(h,crypto.randomUUID(),pkt())).status,403);
 const fresh=await harness({lifecycle:true});t.after(fresh.close);const expired=await custodyFixture(fresh.db,{now:()=>Date.now()-20000});t.after(expired.close);fresh.env.ASSESSMENT_CUSTODY=expired.writer;
 assert.equal((await put(fresh,crypto.randomUUID(),pkt())).status,409);assert.equal(fresh.db.sqlite.prepare('SELECT count(*) n FROM av_assessments').get().n,0);assert.equal((await expired.operator({action:'status'})).pending,null);
});
test('an old primary cannot revive replaced content or complete receipt-only replay',async t=>{
 const h=await harness({lifecycle:true}),old=await harness({lifecycle:true});t.after(h.close);t.after(old.close);const id=crypto.randomUUID(),p=pkt();await put(h,id,p);await put(old,id,p);await put(h,id,pkt(1));
 const independent=await custodyFixture(old.db,{storage:h.custody.storage,initialize:false});old.env.ASSESSMENT_CUSTODY=independent.writer;
 assert.equal((await old.request(route(id))).status,503);assert.equal((await put(old,id,p)).status,503);
 await independent.operator({action:'close'});await assert.rejects(independent.operator({action:'open'}),/regressed/);
 // A valid current cut cannot manufacture the latest ciphertext absent in an old backup.
 await h.custody.operator({action:'close'});const bundle=await collectCustodyExport(h.custody.operator);
 await assert.rejects(restoreFromCustody(old.db.sqlite,bundle,{databaseId:bundle.checkpoint.databaseId,onlineAnchor:bundle.checkpoint}),/Newest definition absent/);
});
test('disabling the lifecycle flag after 0002 cannot bypass custody or reopen legacy mutation paths',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);h.env.ENABLE_ASSESSMENT_LIFECYCLE='false';
 assert.equal((await h.request('/session')).status,503);assert.equal((await put(h,crypto.randomUUID(),packet())).status,503);assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_assessments').get().n,0);
});
