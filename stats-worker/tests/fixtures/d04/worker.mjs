// Never deploy. Fixture authentication exists ONLY in this loopback test wrapper.
import officialWorker from '../../../worker.js';
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/auth/session')return Response.json({authenticated:true,user:'synthetic-teacher'},{headers:{'Set-Cookie':'d04_synthetic=valid; HttpOnly; SameSite=Strict; Path=/','Access-Control-Allow-Origin':'http://127.0.0.1:5500','Access-Control-Allow-Credentials':'true'}});
 if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.startsWith('/diario/'))return new Response('Local synthetic test only',{status:403});
 // UI-only calendar DTO fixture: D-01 is deliberately not fixed by D-04.
 // Only read-listing is substituted; every snapshot and confirmation uses the official Worker.
 if(request.method==='GET'&&url.pathname==='/diario/frequencia/ocorrencias'&&request.headers.get('Origin')==='http://127.0.0.1:5500'){
  const classId=Number(url.searchParams.get('turma')),period=Number(url.searchParams.get('bimestre'));
  const cls=await env.DIARIO_DB.prepare('SELECT id,name FROM salta_diario_classes WHERE id=?').bind(classId).first();
  const ocorrencias=[];
  if(period===4&&cls)for(const date of ['2026-11-09','2026-11-16'])for(const lesson of classId===1?[1,2]:[1]){
   const shift=classId===1?1:2,s=await env.DIARIO_DB.prepare('SELECT id FROM salta_diario_lesson_sessions WHERE class_id=? AND period=? AND attendance_date=? AND shift_id=? AND weekday=1 AND lesson_number=?').bind(classId,period,date,shift,lesson).first();
   const registros=s?((await env.DIARIO_DB.prepare('SELECT student_id,present FROM salta_diario_lesson_records WHERE session_id=? ORDER BY student_id').bind(s.id).all()).results||[]).map(r=>({...r,present:Boolean(r.present)})):[];
   ocorrencias.push({class_id:classId,class_name:cls.name,date,shift_id:shift,weekday:1,lesson_number:lesson,start_time:lesson===1?'08:00':'08:50',end_time:lesson===1?'08:50':'09:40',session_id:s?.id||null,registros,total:registros.length,presentes:registros.filter(r=>r.present).length,future:false});
  }
  return Response.json({configurado:period===4,periodo:period===4?{inicio:'2026-10-01',fim:'2026-12-31',rede:'df'}:null,turma:cls,ocorrencias},{headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5500','Access-Control-Allow-Credentials':'true','Cache-Control':'no-store'}});
 }
 return officialWorker.fetch(request,{DIARIO_DB:env.DIARIO_DB,DIARIO_ATTENDANCE_ENABLED:env.DIARIO_ATTENDANCE_ENABLED,DIARIO_ATTENDANCE_INSTITUTIONS:env.DIARIO_ATTENDANCE_INSTITUTIONS,AUTH:{fetch:async auth=>{
  const ok=auth.headers.get('Cookie')==='d04_synthetic=valid';
  return Response.json({authenticated:ok,user:ok?'synthetic-teacher':undefined},{status:ok?200:401});
 }}});
}};
