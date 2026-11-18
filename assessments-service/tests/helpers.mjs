// Synthetic tests only. No login route, user provisioning endpoint or test bypass
// exists in the service. Exercise the real Auth session reader with local storage.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import auth,{SessionStore} from '../../auth-worker/worker.js';
import worker from '../worker.mjs';
import {createTemplate,createLegacyTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
export const migration=readFileSync(new URL('../migrations/0001_private_library.sql',import.meta.url),'utf8');
export const portal='https://d4nny3l.github.io';
export const scope={institutionId:'synthetic-institution',classId:'synthetic-class',periodId:'synthetic-period'};
export const secret=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
export const seed = async db => {
 for (const [id,user] of [['synthetic-teacher-a','synthetic-login-a'],['synthetic-teacher-b','synthetic-login-b']]) {
  await db.prepare("INSERT INTO av_principals VALUES(?,'salta-auth',?,'teacher',1,1,?)").bind(id,user,Date.now()+3600_000).run();
  await db.prepare('INSERT INTO av_grants VALUES(?,?,?,?,1,1,?)').bind(id,scope.institutionId,scope.classId,scope.periodId,Date.now()+3600_000).run();
 }
};
export class D1 {
 constructor() { this.sqlite=new DatabaseSync(':memory:'); this.sqlite.exec(migration); }
 prepare(sql) { const d=this; return {args:[],bind(...args){return {...this,args};},async first(){return d.sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:d.sqlite.prepare(sql).all(...this.args)};},async run(){if(d.failSql?.(sql))throw Error('synthetic transaction failure');return {meta:{changes:Number(d.sqlite.prepare(sql).run(...this.args).changes)}};}}; }
 async batch(statements) { this.beforeBatch?.(); this.sqlite.exec('BEGIN');try {const result=[];for(const s of statements)result.push(await s.run());this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;} }
}
export async function harness() {
 const db=new D1(); await seed(db);
 const entries=new Map(), storage={get:async key=>entries.get(key),put:async(key,value)=>entries.set(key,value),delete:async key=>entries.delete(key),getAlarm:async()=>null,setAlarm:async()=>{},list:async()=>entries};
 const store=new SessionStore({storage});
 const authEnv={SESSIONS:{idFromName:()=>'',get:()=>({fetch:(input,init)=>store.fetch(new Request(input,init))})}};
 const tokens={};
 for(const [name,user]of [['a','synthetic-login-a'],['b','synthetic-login-b'],['unknown','synthetic-unprovisioned']]){
  const token=secret();tokens[name]='__Host-salta_session='+token;
  await store.fetch(new Request('https://sessions/create',{method:'POST',body:JSON.stringify({id:token,user,expiresAt:Math.floor(Date.now()/1000)+3600})}));
 }
 const env={ENABLE_ASSESSMENTS:'true',PORTAL_ORIGIN:portal,ASSESSMENTS_DB:db,AUTH:{fetch:request=>auth.fetch(request,authEnv)},ASSESSMENT_KEYRING:JSON.stringify({1:secret()}),ASSESSMENT_ACTIVE_KEY_VERSION:'1'};
 const request=(path,{method='GET',actor='a',data,headers={}}={})=>worker.fetch(new Request('https://private-service/assessments/v1'+path,{method,headers:{Origin:portal,...(actor?{Cookie:tokens[actor]||actor}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})}),env);
 return {db,env,request,tokens,entries,close:()=>db.sqlite.close()};
}
export function definition({legacy=false}={}) {
 const template=(legacy?createLegacyTemplate:createTemplate)([{type:'A-E',count:3,label:'Bloco visual A'},{type:'C-E',count:2,label:'Bloco visual B'}]);
 const manifest=JSON.parse(JSON.stringify(createCardManifest(template)));
 return {schemaVersion:'salta-assessment-definition-v2',title:'Avaliação sintética privada',subject:'Matemática',kind:'Prova',date:'2026-11-18',manifest,
  blocks:[{blockId:'block-a',label:'Bloco A',valueUnits:6000,questionIds:template.questions.slice(0,3).map(q=>q.questionId)},{blockId:'block-b',label:'Bloco B',valueUnits:4000,questionIds:template.questions.slice(3).map(q=>q.questionId)}],
  answers:template.questions.map(q=>({questionId:q.questionId,correct:q.choices[0]})),display:{score:'both'}};
}
export const packet=(expectedRevision=0,overrides={})=>({requestId:crypto.randomUUID(),expectedRevision,...scope,status:'issued',definition:definition(),...overrides});
