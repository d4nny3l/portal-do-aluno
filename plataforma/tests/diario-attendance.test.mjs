import test from 'node:test';import assert from 'node:assert/strict';
import {AttendanceDraftController} from '../diario-attendance.mjs';
import {fixture} from '../../stats-worker/tests/support/d04-fixture.mjs';
const item={class_id:1,date:'2026-11-09',shift_id:1,weekday:1,lesson_number:1};
function controller(f,options={}){const calls=[];const api=async(path,opts={})=>{calls.push({path,...structuredClone(opts)});const r=await f.call(path,opts);if(r.status>=400)throw Error(r.body.error);return r.body};const store=new AttendanceDraftController({api,...options});store.setContext({class_id:1,period:4});return {store,calls,api}}
test('D04 draft open suggests 30 present locally; first three clicks mark absences; cancel/abandon make zero mutations',async()=>{
 const f=fixture();try{const {store,calls}=controller(f);let d=await store.open(item);assert.equal(d.choices.size,30);assert.ok([...d.choices.values()].every(v=>v===true));for(const id of [4,12,27])store.toggle(d.key,id);assert.equal([...d.choices.values()].filter(v=>v===false).length,3);store.cancel(d.key);d=await store.open(item);store.setContext(null);assert.deepEqual(f.counts(),{sessions:0,records:0,receipts:0});assert.ok(calls.every(c=>!c.method));}finally{f.db.sqlite.close()}
});
test('D04 only Confirmar sends complete frozen choices, validates receipt and preserves subsequent existing absences',async()=>{
 const f=fixture();try{const {store,calls}=controller(f),d=await store.open(item);for(const id of [4,12,27])store.toggle(d.key,id);const r=await store.confirm(d.key);assert.equal(r.faltas,3);assert.equal(calls.filter(c=>c.method==='POST').length,1);const reopened=await store.open(item);assert.equal(reopened.choices.get(4),false);assert.equal(reopened.choices.get(12),false);assert.equal(reopened.choices.get(27),false);store.cancel(reopened.key);assert.equal(f.counts().receipts,1);}finally{f.db.sqlite.close()}
});
test('D04 ambiguous network failure retries exactly the same request id/payload, without duplicate mutation',async()=>{
 const f=fixture();try{const c=controller(f),original=c.store.api;let lost=true;c.store.api=async(path,opts)=>{const r=await original(path,opts);if(opts?.method&&lost){lost=false;throw Error('resposta perdida')}return r};const d=await c.store.open(item);for(const id of [4,12,27])c.store.toggle(d.key,id);await assert.rejects(c.store.confirm(d.key),/perdida/);assert.equal(c.store.toggle(d.key,1),false);const r=await c.store.confirm(d.key);assert.equal(r.version,1);const writes=c.calls.filter(c=>c.method);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(f.counts(),{sessions:1,records:30,receipts:1});}finally{f.db.sqlite.close()}
});
test('D04 class/period changes discard old successful reads and errors; old completion cannot replace another context',async()=>{
 for(const failure of [false,true]){let release;const waiting=new Promise((resolve,reject)=>release=failure?()=>reject(Error('old failure')):()=>resolve({contract:'d04-v1',institution_id:'synthetic-a',session_id:null,version:0,snapshot:'a'.repeat(64),registros:[{student_id:1,present:null}]}));const store=new AttendanceDraftController({api:async path=>path.includes('contrato')?{version:'d04-v1',enabled:true,institution_id:'synthetic-a'}:waiting});store.setContext({class_id:1,period:4});const pending=store.open(item);await Promise.resolve();await Promise.resolve();store.setContext({class_id:2,period:3});release();assert.equal(await pending,null);assert.equal(store.drafts.size,0);assert.equal(store.context.class_id,2);assert.equal(store.context.period,3);}
});
test('D04 switch away during an explicit confirmation preserves the captured target and ignores its late receipt',async()=>{
 const f=fixture();try{const c=controller(f),d=await c.store.open(item),original=c.store.api;let release,started;const startedPromise=new Promise(r=>started=r);c.store.api=async(path,opts)=>{if(opts?.method){started();await new Promise(r=>release=r)}return original(path,opts)};const pending=c.store.confirm(d.key);await startedPromise;c.store.setContext({class_id:2,period:3});release();assert.equal(await pending,null);assert.equal(c.store.context.class_id,2);assert.equal(c.store.drafts.size,0);assert.equal(f.db.sqlite.prepare('SELECT class_id FROM salta_diario_lesson_sessions').get().class_id,1);}finally{f.db.sqlite.close()}
});
test('D04 double click cannot send two requests while saving, and legacy/unavailable contracts never fall back to old writes',async()=>{
 const f=fixture();try{const c=controller(f),d=await c.store.open(item),pending=c.store.confirm(d.key);assert.equal(await c.store.confirm(d.key),null);assert.equal(c.store.cancel(d.key),false);await pending;assert.equal(c.calls.filter(c=>c.method).length,1);}finally{f.db.sqlite.close()}
 for(const contract of [{version:'legacy',enabled:true},{version:'d04-v1',enabled:false}]){let writes=0;const store=new AttendanceDraftController({api:async(path,opts)=>{writes+=Boolean(opts?.method);return contract}});store.setContext({class_id:1,period:4});await assert.rejects(store.open(item));assert.equal(writes,0);}
});
test('D04 missing historical marks remain unset and cannot be implicitly confirmed',async()=>{
 const store=new AttendanceDraftController({api:async path=>path.includes('contrato')?{version:'d04-v1',enabled:true,institution_id:'a'}:{contract:'d04-v1',institution_id:'a',session_id:8,version:0,snapshot:'a'.repeat(64),registros:[{student_id:1,present:false},{student_id:2,present:null}]}});store.setContext({class_id:1,period:4});const d=await store.open(item);assert.equal(d.choices.get(1),false);assert.equal(d.choices.get(2),null);await assert.rejects(store.confirm(d.key),/sem registro/);
});
test('D04 switching lessons during a delayed confirmation cannot overwrite the second lesson draft',async()=>{
 const f=fixture();try{
  const c=controller(f),first=await c.store.open(item),secondItem={...item,lesson_number:2};
  c.store.toggle(first.key,4);
  const original=c.store.api;let release,started;const begun=new Promise(r=>started=r);
  c.store.api=async(path,opts)=>{if(opts?.method){started();await new Promise(r=>release=r)}return original(path,opts)};
  const pending=c.store.confirm(first.key);await begun;
  const second=await c.store.open(secondItem);c.store.toggle(second.key,12);release();
  const receipt=await pending;assert.equal(receipt.faltas,1);
  assert.equal(c.store.get(second.key),second);assert.equal(second.choices.get(12),false);
  assert.equal(f.counts().sessions,1);assert.equal(f.counts().receipts,1);
  assert.equal(f.db.sqlite.prepare('SELECT lesson_number FROM salta_diario_lesson_sessions').get().lesson_number,1);
 }finally{f.db.sqlite.close()}
});
