// Backend HTTP integration only; no browser automation, real account or remote D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
import {makeBundle,cryptoContext} from '../../corretor/v2/assessments/domain.mjs';
import {createScopeKeyMaterial} from '../crypto/key-generation.js';
import {encryptJson} from '../crypto/encryption.js';
import {decryptJson} from '../crypto/decryption.js';
const lab=fileURLToPath(new URL('..',import.meta.url)),config=path.join(lab,'wrangler.toml');
const cli=process.env.SALTA_WRANGLER_PATH||path.join(lab,'node_modules/wrangler/bin/wrangler.js');
const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'};
test('real workerd/D1 HTTP: authenticated encrypted revisions, isolation, retry, conflict and schema rollback/reapply',async()=>{
 const state=await mkdtemp(path.join(tmpdir(),'salta-assessment-http-'));
 const run=args=>execFileSync(process.execPath,[cli,...args,'--config',config,'--persist-to',state],{cwd:lab,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const available=createServer();await new Promise(resolve=>available.listen(0,'127.0.0.1',resolve));const port=available.address().port;await new Promise(resolve=>available.close(resolve));
 let server,logs='';
 const stop=async()=>{if(!server)return;try{process.kill(-server.pid,'SIGTERM')}catch{}await sleep(600);server=null};
 try{
  run(['d1','migrations','apply','ASSESSMENTS_DB','--local']);run(['d1','execute','ASSESSMENTS_DB','--local','--file',path.join(lab,'fixtures/seed.sql')]);
  server=spawn(process.execPath,[cli,'dev','--local','--ip','127.0.0.1','--port',String(port),'--config',config,'--persist-to',state],{cwd:lab,env,detached:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>logs=(logs+chunk).slice(-65536));
  const origin=`http://127.0.0.1:${port}`;
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/session')).status===401){ready=true;break}}catch{}await sleep(200)}
  assert.ok(ready,'Local Worker did not become ready: '+logs);
  const request=(route,{method='GET',cookie='',data,extra={}}={})=>fetch(origin+route,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});
  const login=async fixture=>{const r=await request('/__lab/login',{method:'POST',data:{fixture}});assert.equal(r.status,200);return r.headers.get('Set-Cookie').split(';')[0]};
  const alice=await login('teacher-one'),bob=await login('teacher-two');
  assert.equal((await request('/api/classes',{extra:{'X-SALTA-Lab-Principal':'a1111111-1111-4111-8111-111111111111'}})).status,401);
  const {classes}=await (await request('/api/classes',{cookie:alice})).json(),scope=classes[0],session=await (await request('/api/session',{cookie:alice})).json();
  const {key}=await createScopeKeyMaterial(),assessmentId=crypto.randomUUID(),manifest=createCardManifest(createTemplate([{type:'A-E',count:20}]));
  const bundle=revision=>makeBundle({id:assessmentId,revision,ownerId:session.principalId,classId:scope.classId,periodId:scope.periodId,title:'Avaliação sintética HTTP',subject:'Matemática',kind:'Prova',maxScore:10,state:'draft',manifest,editor:{},keyText:Array.from({length:20},(_,i)=>`${i+1} C`).join('\n')});
  const packet=async revision=>({expectedRevision:revision-1,requestId:crypto.randomUUID(),classId:scope.classId,periodId:scope.periodId,state:'draft',manifestHash:manifest.contentHash,encrypted:await encryptJson(key,cryptoContext(bundle(revision)),bundle(revision))});
  const route='/api/assessments/'+assessmentId,p=await packet(1);
  assert.equal((await request(route,{method:'PUT',cookie:alice,data:p})).status,201);
  assert.equal((await request(route,{method:'PUT',cookie:alice,data:p})).status,200);
  assert.equal((await request(route,{cookie:bob})).status,404);
  const records=await Promise.all([packet(2),packet(2)]),replies=await Promise.all(records.map(data=>request(route,{method:'PUT',cookie:alice,data})));
  assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);
  const {record}=await (await request(route+'/revisions/1',{cookie:alice})).json();
  const opened=await decryptJson(key,cryptoContext(record),record.encrypted);assert.equal(opened.answerKey.questions.length,20);assert.equal(record.revision,1);
  assert.equal((await request(route,{method:'PUT',cookie:alice,data:p,extra:{Origin:'https://evil.invalid'}})).status,403);
  await stop();
  run(['d1','execute','ASSESSMENTS_DB','--local','--file',path.join(lab,'migrations/down/0001_assessments.sql')]);
  run(['d1','migrations','apply','ASSESSMENTS_DB','--local']);
  const result=run(['d1','execute','ASSESSMENTS_DB','--local','--command','SELECT COUNT(*) AS roots FROM assessment_roots','--json']);
  assert.equal(JSON.parse(result)[0].results[0].roots,0);
 }finally{await stop();await rm(state,{recursive:true,force:true})}
});
