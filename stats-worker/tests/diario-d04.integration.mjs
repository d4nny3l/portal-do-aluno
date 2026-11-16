// D-04 regression in actual local workerd/D1. No remote or academic database.
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
const config=fileURLToPath(new URL('./fixtures/d04/wrangler.toml',import.meta.url));
const cli=process.env.SALTA_WRANGLER_PATH;if(!cli)throw Error('Set SALTA_WRANGLER_PATH to the installed Wrangler CLI');
const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'};
test('D04 real local D1: explicit atomic confirmation, replay, races, rollback, historical edit and context isolation',async()=>{
 const state=await mkdtemp(path.join(tmpdir(),'salta-d04-regression-'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 let server,logs='';
 const command=args=>execFileSync(process.execPath,[cli,...args,'--config',config,'--persist-to',state],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try{
  server=spawn(process.execPath,[cli,'dev','--local','--ip','127.0.0.1','--port',String(port),'--config',config,'--persist-to',state],{env,detached:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>logs=(logs+chunk).slice(-16000));
  const origin=`http://127.0.0.1:${port}`;let ready=false;
  for(let n=0;n<100;n++){try{if((await fetch(origin+'/diario/bimestres?modelo=df&segmento=regular')).status===401){ready=true;break}}catch{}await sleep(200)}
  assert.ok(ready,'Local-only Worker did not start: '+logs);
  const headers={Cookie:'d04_synthetic=valid',Origin:'https://d4nny3l.github.io','Content-Type':'application/json'};
  assert.equal((await fetch(origin+'/diario/bimestres?modelo=df&segmento=regular',{headers})).status,200);
  const sql=`INSERT INTO salta_diario_classes(id,name,segment,period_count,evaluation_system) VALUES(1,'Turma sintética D04','regular',4,'df');
INSERT INTO salta_diario_periods(evaluation_system,segment,period,start_date,end_date) VALUES('df','regular',4,'2026-10-01','2026-12-31');
INSERT INTO salta_diario_teacher_shifts(id,name,start_time,lesson_minutes,lesson_count) VALUES(1,'Turno sintético','08:00',50,2);
INSERT INTO salta_diario_teacher_schedule_slots(shift_id,weekday,lesson_number,class_id) VALUES(1,1,1,1),(1,1,2,1);
${Array.from({length:30},(_,i)=>`INSERT INTO salta_diario_students(id,class_id,name,sort_order) VALUES(${i+1},1,'Pessoa Sintética ${i+1}',${i+1});`).join('\n')}`;
  const fixture=path.join(state,'synthetic.sql');await writeFile(fixture,sql);
  command(['d1','execute','DIARIO_DB','--local','--file',fixture]);
  const migration=fileURLToPath(new URL('../migrations/0001_d04_receipts.sql',import.meta.url));command(['d1','execute','DIARIO_DB','--local','--file',migration]);
  const sqlRead=query=>JSON.parse(command(['d1','execute','DIARIO_DB','--local','--json','--command',query]))[0].results;
  const api=async(route,method='GET',body)=>{const r=await fetch(origin+'/diario'+route,{method,headers,...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const context={shift_id:1,weekday:1,lesson_number:1,class_id:1,period:4,attendance_date:'2026-11-09'};
  const draft=async c=>{const r=await api('/frequencia/ocorrencias/rascunho?'+new URLSearchParams(c));assert.equal(r.status,200,JSON.stringify(r.body));return r.body};
  const payload=(d,c)=>({...c,institution_id:d.institution_id,confirm:true,request_id:crypto.randomUUID(),expected_version:d.version,expected_snapshot:d.snapshot,...(d.session_id?{session_id:d.session_id}:{}),registros:d.registros.map(r=>({student_id:r.student_id,present:r.present??![4,12,27].includes(r.student_id)}))});
  const counts=()=>sqlRead('SELECT (SELECT COUNT(*) FROM salta_diario_lesson_sessions) sessions,(SELECT COUNT(*) FROM salta_diario_lesson_records) records,(SELECT COUNT(*) FROM salta_diario_attendance_commits) receipts')[0];
  const old=await api('/frequencia/ocorrencias','POST',context);assert.equal(old.status,428);
  const d=await draft(context);assert.equal(d.session_id,null);assert.ok(d.registros.every(r=>r.present===null));await draft(context);assert.deepEqual(counts(),{sessions:0,records:0,receipts:0});
  const p=payload(d,context),first=await api('/frequencia/ocorrencias','POST',p);assert.equal(first.status,201);assert.equal(first.body.presentes,27);assert.equal(first.body.faltas,3);
  assert.deepEqual(sqlRead('SELECT student_id FROM salta_diario_lesson_records WHERE present=0 ORDER BY student_id').map(r=>r.student_id),[4,12,27]);assert.deepEqual((await api('/frequencia/ocorrencias','POST',p)).body,first.body);
  const edit=payload(await draft(context),context),stale=structuredClone(edit);edit.registros[0].present=false;stale.registros[1].present=false;stale.request_id=crypto.randomUUID();assert.equal((await api('/frequencia/ocorrencias','PUT',edit)).status,200);assert.equal((await api('/frequencia/ocorrencias','PUT',stale)).status,409);
  assert.deepEqual((await api('/frequencia/ocorrencias','POST',p)).body,first.body);assert.deepEqual(counts(),{sessions:1,records:30,receipts:2});
  const second={...context,lesson_number:2},q=payload(await draft(second),second),different=structuredClone(q);different.request_id=crypto.randomUUID();different.registros[0].present=false;
  const race=await Promise.all([api('/frequencia/ocorrencias','POST',q),api('/frequencia/ocorrencias','POST',different)]);assert.equal(race.filter(r=>r.status<300).length,1);assert.equal(race.filter(r=>r.status===409).length,1);assert.deepEqual(counts(),{sessions:2,records:60,receipts:3});
  const third={...context,attendance_date:'2026-11-16'},r=payload(await draft(third),third);
  command(['d1','execute','DIARIO_DB','--local','--command',"CREATE TRIGGER synthetic_d04_failure BEFORE INSERT ON salta_diario_lesson_records WHEN NEW.student_id=12 BEGIN SELECT RAISE(ABORT,'synthetic D04 failure'); END;"]);
  assert.equal((await api('/frequencia/ocorrencias','POST',r)).status,503);assert.deepEqual(counts(),{sessions:2,records:60,receipts:3});
  command(['d1','execute','DIARIO_DB','--local','--command','DROP TRIGGER synthetic_d04_failure']);
  const identical=await Promise.all([api('/frequencia/ocorrencias','POST',r),api('/frequencia/ocorrencias','POST',r)]);assert.ok(identical.every(result=>result.status<300));assert.deepEqual(identical[0].body,identical[1].body);assert.deepEqual(counts(),{sessions:3,records:90,receipts:4});
  const foreign={...payload(await draft(third),third),institution_id:'synthetic-b'};assert.equal((await api('/frequencia/ocorrencias','PUT',foreign)).status,403);
  const proof={synthetic:true,engine:'workerd/D1 --local',remote:false,students:30,firstConfirmation:{presentes:27,faltas:3},oldPostStatus:old.status,readOnlyDraft:true,durableReplayAfterEdit:true,competingConfirmationStatuses:race.map(r=>r.status),transactionRollback:true,concurrentSameRequest:true,foreignInstitutionStatus:403,final:counts()};
  if(process.env.SALTA_D04_EVIDENCE)await writeFile(process.env.SALTA_D04_EVIDENCE,JSON.stringify(proof,null,2));

 }finally{
  if(server){try{process.kill(-server.pid,'SIGTERM')}catch{}await sleep(400)}
  await rm(state,{recursive:true,force:true});
 }
});
