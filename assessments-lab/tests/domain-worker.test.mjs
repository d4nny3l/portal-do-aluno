import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,ALICE,CLASS_A,CLASS_B} from './helpers.mjs';
import {createScopeKeyMaterial} from '../crypto/key-generation.js';
import {encryptJson} from '../crypto/encryption.js';
import {decryptJson} from '../crypto/decryption.js';
import {makeBundle,validateBundle,cryptoContext} from '../../corretor/v2/assessments/domain.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
const make=({id=crypto.randomUUID(),revision=1,correct='C',state='draft',numbers=Array.from({length:20},(_,i)=>i+1)}={})=>{
 const t=createTemplate([{type:'A-E',items:numbers.map(number=>({questionId:'stable-'+number,number,type:'A-E'}))}]);
 return makeBundle({id,revision,ownerId:ALICE,classId:CLASS_A,periodId:'p2026-4',title:'Matemática sintética',subject:'Matemática',kind:'Prova objetiva',date:'2026-11-15',maxScore:10,state,manifest:createCardManifest(t),editor:{sections:[]},keyText:numbers.map(n=>`${n} ${correct}`).join('\n')});
};
const packet=async(bundle,key)=>({expectedRevision:bundle.revision-1,requestId:crypto.randomUUID(),classId:bundle.classId,periodId:bundle.periodId,state:bundle.state,manifestHash:bundle.manifest.contentHash,encrypted:await encryptJson(key,cryptoContext(bundle),bundle)});

test('encrypted assessment/key/manifest binding survives reopen and rejects another assessment, key or revision',async()=>{
 const {key}=await createScopeKeyMaterial(),one=make(),two=make({correct:'D'}),p=await packet(one,key);
 const record={...one,manifestHash:one.manifest.contentHash};
 const opened=await decryptJson(key,cryptoContext(record),p.encrypted);assert.equal(validateBundle(opened,record).answerKey.questions[0].correct,'C');
 assert.ok(!JSON.stringify(p).includes('Matemática sintética'));assert.ok(!JSON.stringify(p).includes('"correct"'));
 await assert.rejects(decryptJson(key,cryptoContext(two),p.encrypted));
 await assert.rejects(decryptJson(key,cryptoContext({...one,revision:2}),p.encrypted));
 const tampered={...p.encrypted,ciphertext:(p.encrypted.ciphertext[0]==='A'?'B':'A')+p.encrypted.ciphertext.slice(1)};
 await assert.rejects(decryptJson(key,cryptoContext(one),tampered));
 await assert.rejects(decryptJson((await createScopeKeyMaterial()).key,cryptoContext(one),p.encrypted));
 assert.throws(()=>validateBundle({...one,answerKey:two.answerKey},record),/gabarito/);
 assert.throws(()=>validateBundle({...one,optical:{...one.optical,assessmentRevision:9}},record),/modelo óptico/);
 const sparse=make({numbers:[2,7,11,20]});assert.deepEqual(sparse.answerKey.questions.map(q=>q.number),[2,7,11,20]);
});

test('server session, ownership, class and period grants are mandatory; deployed host and client principal headers fail closed',async t=>{
 const h=harness();t.after(()=>h.db.close());const a=await h.login('teacher-one'),b=await h.login('teacher-two');
 assert.equal((await h.request('/api/session',{headers:{'X-SALTA-Lab-Principal':ALICE,Authorization:'Bearer forged'}})).status,401);
 assert.equal((await h.request('/api/session',{cookie:a,host:'https://example.workers.dev'})).status,403);
 const {key}=await createScopeKeyMaterial(),bundle=make(),p=await packet(bundle,key);
 assert.equal((await h.request('/api/assessments/'+bundle.id,{method:'PUT',cookie:a,data:p})).status,201);
 assert.equal((await h.request('/api/assessments/'+bundle.id,{cookie:b})).status,404);
 assert.equal((await h.request('/api/assessments/'+crypto.randomUUID(),{method:'PUT',cookie:b,data:p})).status,403);
 assert.equal((await h.request('/api/assessments/'+crypto.randomUUID(),{method:'PUT',cookie:a,data:{...p,classId:CLASS_B}})).status,403);
 assert.equal((await h.request('/api/assessments/'+crypto.randomUUID(),{method:'PUT',cookie:a,data:{...p,periodId:'p2026-1'}})).status,403);
 assert.equal((await h.request('/api/assessments/'+bundle.id,{method:'PUT',cookie:a,data:{...p,ownerId:ALICE}})).status,400);
 assert.equal((await h.request('/api/assessments/'+bundle.id,{method:'PUT',cookie:a,data:{...p,answerKey:'plaintext prohibited'}})).status,400);
 assert.equal((await h.request('/api/assessments/'+bundle.id,{method:'PUT',cookie:a,data:p,headers:{Origin:'https://evil.invalid'}})).status,403);
 h.db.db.prepare('UPDATE assessment_lab_sessions SET expires_at=0').run();
 assert.equal((await h.request('/api/session',{cookie:a})).status,401);
});

test('D1 immutable revisions, idempotent replay, concurrency and archive cannot silently overwrite an issued key',async t=>{
 const h=harness();t.after(()=>h.db.close());const cookie=await h.login('teacher-one'),{key}=await createScopeKeyMaterial(),b=make({state:'issued'}),p=await packet(b,key),path='/api/assessments/'+b.id;
 assert.equal((await h.request(path,{method:'PUT',cookie,data:p})).status,201);
 assert.equal((await h.request(path,{method:'PUT',cookie,data:p})).status,200);
 assert.equal((await h.request(path,{method:'PUT',cookie,data:{...p,manifestHash:'f'.repeat(16)}})).status,409);
 const p2=await packet(make({id:b.id,revision:2,correct:'D'}),key),p3=await packet(make({id:b.id,revision:2,correct:'E'}),key);
 const replies=await Promise.all([h.request(path,{method:'PUT',cookie,data:p2}),h.request(path,{method:'PUT',cookie,data:p3})]);
 assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);
 const historical=(await (await h.request(path+'/revisions/1',{cookie})).json()).record;
 assert.equal((await decryptJson(key,cryptoContext(historical),historical.encrypted)).answerKey.questions[0].correct,'C');
 assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_revisions').get().n,2);
 const archived=await packet(make({id:b.id,revision:3,state:'archived'}),key);assert.equal((await h.request(path,{method:'PUT',cookie,data:archived})).status,201);
 assert.equal((await h.request(path,{method:'PUT',cookie,data:await packet(make({id:b.id,revision:4}),key)})).status,409);
 assert.ok(!JSON.stringify(h.db.db.prepare('SELECT * FROM assessment_revisions').all()).includes('"correct"'));
});

test('revocation during a transaction rolls back; infrastructure failure never acknowledges a save; migration rollback works',async t=>{
 const h=harness();t.after(()=>h.db.close());const cookie=await h.login('teacher-one'),{key}=await createScopeKeyMaterial(),b=make(),p=await packet(b,key);
 h.db.beforeBatch=()=>h.db.db.prepare('UPDATE assessment_grants SET active=0 WHERE principal_id=?').run(ALICE);
 assert.equal((await h.request('/api/assessments/'+b.id,{method:'PUT',cookie,data:p})).status,409);
 assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_roots').get().n,0);
 h.db.beforeBatch=null;h.db.db.prepare('UPDATE assessment_grants SET active=1').run();
 h.db.batch=async()=>{throw Error('database unavailable')};
 const failed=await h.request('/api/assessments/'+b.id,{method:'PUT',cookie,data:p});assert.equal(failed.status,503);assert.ok(!(await failed.json()).ok);
 h.db.db.exec(readFileSync(new URL('../migrations/down/0002_protected_access.sql',import.meta.url),'utf8'));
 h.db.db.exec(readFileSync(new URL('../migrations/down/0001_assessments.sql',import.meta.url),'utf8'));
 assert.equal(h.db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'assessment_%'").get().n,0);
});
