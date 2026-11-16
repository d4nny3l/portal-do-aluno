import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './support/d04-fixture.mjs';
const route='/frequencia/ocorrencias';
test('D04 open/cancel/abandon are read-only; unconfirmed old POST/PUT fail without any write',async()=>{
 const f=fixture();try{
  assert.equal((await f.call('/frequencia/contrato?class_id=1')).body.enabled,true);
  for(let n=0;n<3;n++){const d=await f.draft();assert.equal(d.status,200);assert.equal(d.body.session_id,null);assert.ok(d.body.registros.every(r=>r.present===null));}
  for(const path of [route,'/frequencia'])for(const method of ['POST','PUT'])assert.equal((await f.call(path,{method,body:f.context})).status,428);
  assert.deepEqual(f.counts(),{sessions:0,records:0,receipts:0});assert.equal(f.db.trace.filter(s=>/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)/i.test(s)).length,0);
 }finally{f.db.sqlite.close()}
});
test('D04 one confirmation atomically writes exactly 27 presences/3 absences and a durable receipt',async()=>{
 const f=fixture();try{
  const d=await f.draft(),p=f.payload(d.body),r=await f.call(route,{method:'POST',body:p});assert.equal(r.status,201);assert.equal(r.body.ok,true);assert.equal(r.body.presentes,27);assert.equal(r.body.faltas,3);assert.equal(r.body.version,1);
  assert.deepEqual(f.counts(),{sessions:1,records:30,receipts:1});assert.deepEqual(f.db.sqlite.prepare('SELECT student_id FROM salta_diario_lesson_records WHERE present=0 ORDER BY student_id').all().map(x=>x.student_id),[4,12,27]);
 }finally{f.db.sqlite.close()}
});
test('D04 lost response/replay is durable even after later edits; same request with another payload conflicts',async()=>{
 const f=fixture();try{
  const p=f.payload((await f.draft()).body),first=await f.call(route,{method:'POST',body:p});
  const updated=f.payload((await f.draft()).body);updated.registros[0].present=false;assert.equal((await f.call(route,{method:'PUT',body:updated})).status,200);
  const replay=await f.call(route,{method:'POST',body:p});assert.deepEqual(replay.body,first.body);assert.deepEqual(f.counts(),{sessions:1,records:30,receipts:2});
  const conflicting=structuredClone(p);conflicting.registros[0].present=false;assert.equal((await f.call(route,{method:'POST',body:conflicting})).status,409);
  assert.equal(f.db.sqlite.prepare('SELECT present FROM salta_diario_lesson_records WHERE student_id=1').get().present,0);
 }finally{f.db.sqlite.close()}
});
test('D04 concurrent identical confirmation creates one resource and receipt; competing choices cannot overwrite',async()=>{
 for(const sameId of [true,false]){const f=fixture();try{
  const p=f.payload((await f.draft()).body),q=structuredClone(p);if(!sameId){q.request_id=crypto.randomUUID();q.registros[0].present=false}
  const results=await Promise.all([f.call(route,{method:'POST',body:p}),f.call(route,{method:'POST',body:q})]);
  assert.equal(results.filter(r=>r.status<300).length,sameId?2:1);if(!sameId)assert.equal(results.filter(r=>r.status===409).length,1);assert.deepEqual(f.counts(),{sessions:1,records:30,receipts:1});
 }finally{f.db.sqlite.close()}}
});
test('D04 failure between session/records rolls back everything; same confirmation can safely retry',async()=>{
 const f=fixture(),original=console.error;console.error=()=>{};try{
  const p=f.payload((await f.draft()).body);f.db.failSqlMatch='INSERT INTO salta_diario_lesson_records';assert.equal((await f.call(route,{method:'POST',body:p})).status,503);assert.deepEqual(f.counts(),{sessions:0,records:0,receipts:0});
  assert.equal((await f.call(route,{method:'POST',body:p})).status,201);assert.deepEqual(f.counts(),{sessions:1,records:30,receipts:1});
 }finally{console.error=original;f.db.sqlite.close()}
});
test('D04 existing history is not reinitialized, incomplete history stays unset, inactive records survive explicit edit',async()=>{
 const f=fixture();try{
  f.db.sqlite.exec("INSERT INTO salta_diario_lesson_sessions(id,shift_id,weekday,lesson_number,class_id,period,attendance_date,start_time,end_time) VALUES(50,1,1,1,1,4,'2026-11-09','08:00','08:50');INSERT INTO salta_diario_lesson_records(session_id,student_id,present) VALUES(50,1,0),(50,4,0);UPDATE salta_diario_students SET active=0 WHERE id=4;");
  const before=f.db.sqlite.prepare('SELECT * FROM salta_diario_lesson_records ORDER BY student_id').all();const d=(await f.draft()).body;
  assert.equal(d.version,0);assert.equal(d.registros.find(r=>r.student_id===1).present,false);assert.equal(d.registros.find(r=>r.student_id===2).present,null);assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM salta_diario_lesson_records ORDER BY student_id').all(),before);
  const p=f.payload(d);assert.equal(p.registros.find(r=>r.student_id===4).present,false);assert.equal((await f.call(route,{method:'PUT',body:p})).status,200);assert.equal(f.db.sqlite.prepare('SELECT present FROM salta_diario_lesson_records WHERE student_id=4').get().present,0);assert.equal(f.counts().sessions,1);
 }finally{f.db.sqlite.close()}
});
test('D04 stale editor and a changed roster/timetable during confirmation fail without overwriting',async()=>{
 const f=fixture();try{
  const initial=f.payload((await f.draft()).body);await f.call(route,{method:'POST',body:initial});const d=(await f.draft()).body,p=f.payload(d),stale=structuredClone(p);stale.request_id=crypto.randomUUID();stale.registros[1].present=false;p.registros[0].present=false;
  assert.equal((await f.call(route,{method:'PUT',body:p})).status,200);assert.equal((await f.call(route,{method:'PUT',body:stale})).status,409);
  const pending=f.payload((await f.draft()).body);f.db.beforeBatch=()=>f.db.sqlite.exec("UPDATE salta_diario_students SET active=0 WHERE id=30");assert.equal((await f.call(route,{method:'PUT',body:pending})).status,409);assert.equal(f.counts().receipts,2);
 }finally{f.db.sqlite.close()}
 const g=fixture();try{const pending=g.payload((await g.draft()).body);g.db.beforeBatch=()=>g.db.sqlite.exec('UPDATE salta_diario_teacher_schedule_slots SET class_id=3 WHERE shift_id=1 AND lesson_number=1');assert.equal((await g.call(route,{method:'POST',body:pending})).status,409);assert.deepEqual(g.counts(),{sessions:0,records:0,receipts:0})}finally{g.db.sqlite.close()}
});
test('D04 isolates institution/class/lesson/period and rejects foreign students, duplicates and coercion',async()=>{
 const f=fixture();try{
  const original=f.payload((await f.draft()).body);
  for(const mutate of [p=>p.institution_id='synthetic-b',p=>p.class_id=2,p=>p.period=3,p=>p.lesson_number=2,p=>p.registros[0].student_id=31,p=>p.registros[0].student_id=2,p=>p.registros[0].present='true',p=>p.registros.pop()]){const p=structuredClone(original);mutate(p);assert.ok((await f.call(route,{method:'POST',body:p})).status>=400)}
  assert.deepEqual(f.counts(),{sessions:0,records:0,receipts:0});
  assert.equal((await f.call(route,{method:'POST',body:original,authenticated:false})).status,401);
  delete f.env.DIARIO_ATTENDANCE_INSTITUTIONS;assert.equal((await f.call('/frequencia/contrato?class_id=1')).body.enabled,false);assert.equal((await f.call(route,{method:'POST',body:original})).status,503);
 }finally{f.db.sqlite.close()}
});
test('D04 legacy daily attendance requires the same complete explicit confirmation',async()=>{
 const f=fixture();try{
  const d=await f.draft(f.context,true),p=f.payload(d.body);delete p.shift_id;delete p.weekday;delete p.lesson_number;
  const first=await f.call('/frequencia',{method:'POST',body:p});assert.equal(first.status,201);assert.equal(first.body.faltas,3);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM salta_diario_attendance_records').get().n,30);assert.deepEqual((await f.call('/frequencia',{method:'POST',body:p})).body,first.body);
 }finally{f.db.sqlite.close()}
});

test('D04 two institutional contexts keep separate sessions, students and receipt versions',async()=>{
 const f=fixture();try{
  const a=f.payload((await f.draft()).body),contextB={...f.context,class_id:2,shift_id:2},b=f.payload((await f.draft(contextB)).body,contextB);
  const [ra,rb]=await Promise.all([f.call(route,{method:'POST',body:a}),f.call(route,{method:'POST',body:b})]);assert.equal(ra.status,201);assert.equal(rb.status,201);assert.equal(ra.body.institution_id,'synthetic-a');assert.equal(rb.body.institution_id,'synthetic-b');assert.equal(ra.body.version,1);assert.equal(rb.body.version,1);assert.notEqual(ra.body.id,rb.body.id);
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM salta_diario_lesson_records WHERE session_id=? AND student_id<=30').get(rb.body.id).n,0);
 }finally{f.db.sqlite.close()}
});
test('D04 missing migration disables confirmation and never initializes schema on draft requests',async()=>{
 const f=fixture(),original=console.error;console.error=()=>{};try{
  const p=f.payload((await f.draft()).body);f.db.sqlite.exec('DROP TABLE salta_diario_attendance_commits');f.db.trace=[];
  assert.equal((await f.call('/frequencia/contrato?class_id=1')).body.enabled,false);assert.equal((await f.call(route,{method:'POST',body:p})).status,503);
  assert.equal(f.db.trace.filter(s=>/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)/i.test(s)).length,0);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM salta_diario_lesson_sessions').get().n,0);
 }finally{console.error=original;f.db.sqlite.close()}
});
test('D04 silent receipt-finalization failure aborts and rolls back all academic writes',async()=>{
 const f=fixture(),original=console.error;console.error=()=>{};try{
  f.db.sqlite.exec("CREATE TRIGGER synthetic_ignore_finalize BEFORE UPDATE ON salta_diario_attendance_commits WHEN NEW.receipt IS NOT NULL BEGIN SELECT RAISE(IGNORE); END;");
  const p=f.payload((await f.draft()).body);assert.equal((await f.call(route,{method:'POST',body:p})).status,503);assert.deepEqual(f.counts(),{sessions:0,records:0,receipts:0});
 }finally{console.error=original;f.db.sqlite.close()}
});
