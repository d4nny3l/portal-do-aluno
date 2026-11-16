import {readFile} from 'node:fs/promises';
import {MemoryD1} from './local-d1.mjs';
const source=await readFile(new URL('../../worker.js',import.meta.url),'utf8');
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const schema=new Function('return '+source.match(/const DIARIO_SCHEMA = (\[[\s\S]*?\n\]);/)[1])();
const migration=await readFile(new URL('../../migrations/0001_d04_receipts.sql',import.meta.url),'utf8');
export function fixture(){
 const db=new MemoryD1();db.sqlite.exec(schema.join(';')+';'+migration);
 db.sqlite.exec(`INSERT INTO salta_diario_classes(id,name,segment,period_count,evaluation_system) VALUES(1,'Sintética A','regular',4,'df'),(2,'Sintética B','regular',4,'df'),(3,'Sintética C','regular',4,'df');
 INSERT INTO salta_diario_periods(evaluation_system,segment,period,start_date,end_date) VALUES('df','regular',4,'2026-10-01','2026-12-31'),('df','regular',3,'2026-08-01','2026-09-30');
 INSERT INTO salta_diario_teacher_shifts(id,name,start_time,lesson_minutes,lesson_count) VALUES(1,'Turno sintético A','08:00',50,2),(2,'Turno sintético B','08:00',50,2);
 INSERT INTO salta_diario_teacher_schedule_slots(shift_id,weekday,lesson_number,class_id) VALUES(1,1,1,1),(1,1,2,1),(2,1,1,2);`);
 for(let i=1;i<=60;i++)db.sqlite.prepare('INSERT INTO salta_diario_students(id,class_id,name,sort_order) VALUES(?,?,?,?)').run(i,i<=30?1:2,'Pessoa Sintética '+i,i);
 const env={DIARIO_DB:db,DIARIO_ATTENDANCE_ENABLED:'true',DIARIO_ATTENDANCE_INSTITUTIONS:'{"1":"synthetic-a","2":"synthetic-b","3":"synthetic-a"}',AUTH:{fetch:async request=>{const ok=request.headers.get('Cookie')==='synthetic=valid';return Response.json({authenticated:ok,user:ok?'synthetic-teacher':undefined},{status:ok?200:401})}}};
 const context={class_id:1,period:4,attendance_date:'2026-11-09',shift_id:1,weekday:1,lesson_number:1};
 const call=async(path,{method='GET',body,authenticated=true}={})=>{const response=await worker.fetch(new Request('https://synthetic-d04.test/diario'+path,{method,headers:{Origin:'https://d4nny3l.github.io','Content-Type':'application/json',...(authenticated?{Cookie:'synthetic=valid'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:response.status,body:await response.json()}};
 const draft=async(ctx=context,daily=false)=>call('/frequencia'+(daily?'':'/ocorrencias')+'/rascunho?'+new URLSearchParams(ctx));
 const payload=(state,ctx=context)=>({...ctx,confirm:true,request_id:crypto.randomUUID(),institution_id:state.institution_id,expected_version:state.version,expected_snapshot:state.snapshot,...(state.session_id?{session_id:state.session_id}:{}),registros:state.registros.map(r=>({student_id:r.student_id,present:r.present??![4,12,27].includes(r.student_id)}))});
 const counts=()=>({sessions:db.sqlite.prepare('SELECT COUNT(*) n FROM salta_diario_lesson_sessions').get().n,records:db.sqlite.prepare('SELECT COUNT(*) n FROM salta_diario_lesson_records').get().n,receipts:db.sqlite.prepare('SELECT COUNT(*) n FROM salta_diario_attendance_commits').get().n});
 return {db,env,context,call,draft,payload,counts};
}
