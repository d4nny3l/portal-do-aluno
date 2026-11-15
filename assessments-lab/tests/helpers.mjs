import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker.mjs';
export const ALICE='a1111111-1111-4111-8111-111111111111',BOB='b2222222-2222-4222-8222-222222222222';
export const CLASS_A='c1111111-1111-4111-8111-111111111111',CLASS_B='c2222222-2222-4222-8222-222222222222';
export class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE d1_migrations(name TEXT UNIQUE)');this.db.exec(readFileSync(new URL('../migrations/0001_assessments.sql',import.meta.url),'utf8'));this.db.exec(readFileSync(new URL('../migrations/0002_protected_access.sql',import.meta.url),'utf8'));this.db.exec(readFileSync(new URL('../fixtures/seed.sql',import.meta.url),'utf8'))}
 prepare(sql){const d=this;return {args:[],bind(...args){return {...this,args}},async first(){return d.db.prepare(sql).get(...this.args)||null},async all(){return {results:d.db.prepare(sql).all(...this.args)}},async run(){return {meta:{changes:Number(d.db.prepare(sql).run(...this.args).changes)}}}}}
 async batch(statements){this.beforeBatch?.();this.db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());this.db.exec('COMMIT');return results}catch(error){this.db.exec('ROLLBACK');throw error}}
 close(){this.db.close()}
}
export function harness(){
 const db=new D1(),env={ASSESSMENTS_DB:db,SALTA_ASSESSMENTS_MODE:'local-only'};
 const request=(path,{method='GET',cookie='',data,headers={},host='http://127.0.0.1:8791'}={})=>worker.fetch(new Request(host+path,{method,headers:{Origin:host,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})}),env);
 const login=async fixture=>{const r=await request('/__lab/login',{method:'POST',data:{fixture}});if(r.status!==200)throw Error(await r.text());return r.headers.get('Set-Cookie').split(';')[0]};
 return {db,env,request,login};
}
