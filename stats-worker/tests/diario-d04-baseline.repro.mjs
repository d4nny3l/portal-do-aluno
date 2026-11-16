// Read-only production inspection; this executable reproduction uses only local synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {MemoryD1} from './support/local-d1.mjs';
const source=execFileSync('git',['show','3c9a8286150d5430a7447bdfa25a874edf7fcaf2:stats-worker/worker.js'],{encoding:'utf8'});
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('D-04 baseline: creation currently persists 30 presences before the intended three absences',async()=>{
 const db=new MemoryD1(),env={DIARIO_DB:db,AUTH:{fetch:async()=>Response.json({authenticated:true,user:'synthetic-teacher'})}};
 const request=(path,method='GET',body)=>new Request('https://local-d04.test/diario'+path,{method,headers:{Cookie:'synthetic-session',Origin:'https://d4nny3l.github.io','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 await worker.fetch(request('/bimestres?modelo=df&segmento=regular'),env);
 db.sqlite.exec(`INSERT INTO salta_diario_classes(id,name,segment,period_count,evaluation_system) VALUES(1,'Turma sintética D04','regular',4,'df');
 INSERT INTO salta_diario_periods(evaluation_system,segment,period,start_date,end_date) VALUES('df','regular',4,'2026-10-01','2026-12-31');
 INSERT INTO salta_diario_teacher_shifts(id,name,start_time,lesson_minutes,lesson_count) VALUES(1,'Turno sintético','08:00',50,2);
 INSERT INTO salta_diario_teacher_schedule_slots(shift_id,weekday,lesson_number,class_id) VALUES(1,1,1,1);`);
 for(let i=1;i<=30;i++)db.sqlite.prepare('INSERT INTO salta_diario_students(id,class_id,name,sort_order) VALUES(?,1,?,?)').run(i,'Pessoa Sintética '+i,i);
 const before=db.sqlite.prepare('SELECT COUNT(*) n FROM salta_diario_lesson_sessions').get().n;
 const response=await worker.fetch(request('/frequencia/ocorrencias','POST',{shift_id:1,weekday:1,lesson_number:1,class_id:1,period:4,attendance_date:'2026-11-09'}),env);
 const counts=db.sqlite.prepare('SELECT COUNT(*) total,SUM(present) presentes,SUM(1-present) faltas FROM salta_diario_lesson_records').get();
 assert.equal(response.status,201);assert.equal(before,0);assert.equal(counts.total,30);assert.equal(counts.presentes,30);assert.equal(counts.faltas,0);
 const evidence={base:'3c9a8286150d5430a7447bdfa25a874edf7fcaf2',synthetic:true,students:30,intendedAbsences:[4,12,27],requestHadConfirmedRoster:false,responseStatus:response.status,actual:counts,rootCause:'POST creates a session, then seeds all active students as present; the first frontend toggle returns before applying its requested absence.'};
 if(process.env.SALTA_D04_EVIDENCE)await writeFile(process.env.SALTA_D04_EVIDENCE,JSON.stringify(evidence,null,2));
 db.sqlite.close();
});
