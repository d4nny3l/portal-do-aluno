import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import {harness,ALICE,CLASS_A} from './helpers.mjs';
import {createRecoveryVault,recoverVault} from '../crypto/recovery-vault.mjs';
import {encryptJson} from '../crypto/encryption.js';
import {decryptJson} from '../crypto/decryption.js';
import {cryptoContext,makeBundle} from '../../corretor/v2/assessments/domain.mjs';
import {AssessmentRepository} from '../../corretor/v2/assessments/repository.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
import {SignJWT,generateKeyPair,exportJWK,createLocalJWKSet} from 'jose';
import {verifiedIdentity} from '../protected-auth.mjs';
const origin='https://salta-assessments-homologacao.dannyel-moises.workers.dev';
const password='SOMENTE TESTE SINTETICO de recuperacao 2026';
const ctx={access:{aud:'synthetic-audience',getIdentity:async()=>({email:'synthetic@example.invalid'})}};
test('Access JWT requires trusted RSA signature, exact issuer/audience, required claims and expiry; identity headers alone are rejected',async()=>{
 const issuer='https://synthetic.cloudflareaccess.com',env={ACCESS_ISSUER:issuer,ACCESS_AUD:'synthetic-audience'};
 const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey),keys=createLocalJWKSet({keys:[{...jwk,kid:'synthetic'}]});
 const token=async({iss=issuer,aud=env.ACCESS_AUD,expiry='20m',key=privateKey}={})=>new SignJWT({email:'synthetic@example.invalid'}).setProtectedHeader({alg:'RS256',kid:'synthetic'}).setSubject('synthetic-identity').setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(expiry).sign(key);
 const request=value=>new Request('https://example.invalid',{headers:{'Cf-Access-Jwt-Assertion':value,'Cf-Access-Authenticated-User-Email':'ignored@example.invalid'}});
 assert.equal((await verifiedIdentity(request(await token()),env,{},keys)).email,'synthetic@example.invalid');
 for(const options of [{iss:'https://other.cloudflareaccess.com'},{aud:'another-app'},{expiry:'-1h'},{key:(await generateKeyPair('RS256')).privateKey}])await assert.rejects(verifiedIdentity(request(await token(options)),env,{},keys));
 await assert.rejects(verifiedIdentity(request('forged'),env,{},keys));
 await assert.rejects(verifiedIdentity(new Request('https://example.invalid',{headers:{'Cf-Access-Authenticated-User-Email':'synthetic@example.invalid'}}),env,{},keys));
});
async function setup(t){
 const h=harness();t.after(()=>h.db.close());
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('synthetic@example.invalid'))),b=>b.toString(16).padStart(2,'0')).join('');
 h.db.db.prepare('UPDATE assessment_principals SET auth_subject=? WHERE id=?').run('access:'+digest,ALICE);
 h.db.db.prepare('INSERT INTO assessment_access_control VALUES(?,1,1,?)').run(ALICE,Date.now()+3600000);
 const env={...h.env,SALTA_ASSESSMENTS_MODE:'protected-synthetic',ACCESS_AUD:ctx.access.aud,PUBLIC_ORIGIN:origin};
 const request=(route,{method='GET',data,context=ctx,headers={}}={})=>worker.fetch(new Request(origin+route,{method,headers:{Origin:origin,...headers,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}),env,context);
 return {...h,env,request};
}
test('remote protected identity is runtime-verified, audience-bound, granted, expiring and revocable; headers and fixture route confer no access',async t=>{
 const h=await setup(t);
 assert.equal((await h.request('/api/session',{context:{},headers:{'Cf-Access-Authenticated-User-Email':'synthetic@example.invalid','Cf-Access-Jwt-Assertion':'forged'}})).status,403);
 assert.equal((await h.request('/api/session',{context:{access:{...ctx.access,aud:'wrong'}}})).status,403);
 assert.equal((await h.request('/api/session',{context:{access:{...ctx.access,getIdentity:async()=>({email:'other@example.invalid'})}}})).status,403);
 assert.equal((await h.request('/api/session')).status,200);
 assert.equal((await h.request('/__lab/login',{method:'POST',data:{fixture:'teacher-one'}})).status,404);
 const classes=await (await h.request('/api/classes')).json();assert.equal(classes.classes.length,1);
 h.db.db.prepare('UPDATE assessment_access_control SET expires_at=0').run();assert.equal((await h.request('/api/session')).status,403);
 h.db.db.prepare('UPDATE assessment_access_control SET expires_at=?').run(Date.now()+3600000);
 assert.equal((await h.request('/api/access/revoke',{method:'POST'})).status,200);
 assert.equal((await h.request('/api/session')).status,403);
 assert.equal((await h.request('/api/key-vault')).status,403);
});
test('encrypted recovery vault survives a fresh device, rejects wrong phrase/owner/tampering and cannot overwrite old keys or revisions',async t=>{
 const h=await setup(t),created=await createRecoveryVault(password,ALICE);
 assert.equal((await h.request('/api/key-vault',{method:'PUT',data:created.vault})).status,201);
 assert.equal((await h.request('/api/key-vault',{method:'PUT',data:created.vault})).status,409);
 const {vault}=await (await h.request('/api/key-vault')).json();
 const recovered=await recoverVault(password,ALICE,vault);assert.equal(recovered.extractable,false);
 await assert.rejects(recoverVault(password+'wrong',ALICE,vault));
 await assert.rejects(recoverVault(password,'another-principal',vault));
 await assert.rejects(recoverVault(password,ALICE,{...vault,nonce:'A'.repeat(16)}));
 const manifest=createCardManifest(createTemplate([{type:'A-E',count:20}]));
 const bundle=makeBundle({id:crypto.randomUUID(),revision:1,ownerId:ALICE,classId:CLASS_A,periodId:'p2026-4',title:'Matemática sintética protegida',subject:'Matemática',kind:'Prova',maxScore:10,state:'draft',manifest,editor:{},keyText:Array.from({length:20},(_,i)=>`${i+1} C`).join('\n')});
 const encrypted=await encryptJson(created.key,cryptoContext(bundle),bundle);
 const payload={expectedRevision:0,requestId:crypto.randomUUID(),classId:CLASS_A,periodId:'p2026-4',state:'draft',manifestHash:manifest.contentHash,encrypted};
 assert.equal((await h.request('/api/assessments/'+bundle.id,{method:'PUT',data:payload})).status,201);
 const {record}=await (await h.request('/api/assessments/'+bundle.id)).json();
 assert.equal((await decryptJson(recovered,cryptoContext(record),record.encrypted)).answerKey.questions[19].correct,'C');
 assert.ok(!h.db.db.prepare('SELECT encrypted_json FROM assessment_key_vaults').get().encrypted_json.includes(password));
 await h.request('/api/access/revoke',{method:'POST'});
 assert.equal((await h.request('/api/assessments/'+bundle.id)).status,403);
 assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_revisions').get().n,1);
});
test('revocation during remote write rolls back atomically; unlocked client expires and drops key references',async t=>{
 const h=await setup(t),{key,vault}=await createRecoveryVault(password,ALICE),manifest=createCardManifest(createTemplate([{type:'A-E',count:1}]));
 const b=makeBundle({id:crypto.randomUUID(),revision:1,ownerId:ALICE,classId:CLASS_A,periodId:'p2026-4',title:'Sintética',subject:'Matemática',kind:'Prova',maxScore:10,state:'draft',manifest,editor:{},keyText:'1 C'});
 const data={expectedRevision:0,requestId:crypto.randomUUID(),classId:CLASS_A,periodId:'p2026-4',state:'draft',manifestHash:manifest.contentHash,encrypted:await encryptJson(key,cryptoContext(b),b)};
 assert.equal((await h.request('/api/key-vault',{method:'PUT',data:vault})).status,201);
 let rechecked=false;h.db.beforeBatch=()=>{rechecked=true;h.db.db.prepare('UPDATE assessment_access_control SET enabled=0,epoch=epoch+1').run()};
 assert.equal((await h.request('/api/assessments/'+b.id,{method:'PUT',data})).status,409);
 assert.equal(rechecked,true);assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_roots').get().n,0);
 const repo=new AssessmentRepository({fetchApi:()=>{throw Error('Must not send on expiry')},keyStore:{}});
 repo.session={mode:'protected-synthetic',principalId:ALICE,epoch:1};repo.key=key;repo.unlockedUntil=0;
 await assert.rejects(repo.guard(),/expirou/);assert.equal(repo.key,null);
});
test('vault enrollment rechecks revocation atomically and distinguishes database failure from duplicate enrollment',async t=>{
 const h=await setup(t),{vault}=await createRecoveryVault(password,ALICE),prepare=h.db.prepare.bind(h.db);
 h.db.prepare=sql=>{
  const statement=prepare(sql);if(!sql.startsWith('INSERT INTO assessment_key_vaults'))return statement;
  return {...statement,async run(){h.db.db.prepare('UPDATE assessment_access_control SET enabled=0').run();return statement.run.call(this)}};
 };
 assert.equal((await h.request('/api/key-vault',{method:'PUT',data:vault})).status,403);
 assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_key_vaults').get().n,0);
 h.db.db.prepare('UPDATE assessment_access_control SET enabled=1').run();
 h.db.prepare=sql=>{if(sql.startsWith('INSERT INTO assessment_key_vaults'))throw Error('Storage offline');return prepare(sql)};
 const result=await h.request('/api/key-vault',{method:'PUT',data:vault});assert.equal(result.status,503);assert.equal((await result.json()).ok,undefined);
});
test('catalog retry keeps only an unexpired key for the same verified principal/epoch; an Access redirect locks it',async()=>{
 let principal=ALICE,epoch=1,unlocks=0,offline=true,redirect=false;
 const {key}=await createRecoveryVault(password,ALICE);
 const repo=new AssessmentRepository({keyStore:{},unlock:async r=>{unlocks++;r.key=key;r.unlockedUntil=Date.now()+60000},fetchApi:async path=>{
  if(redirect)return {type:'opaqueredirect'};
  if(path==='/api/session')return Response.json({mode:'protected-synthetic',principalId:principal,epoch});
  if(path==='/api/classes')return Response.json({classes:[]});
  if(offline)throw Error('Temporary outage');return Response.json({assessments:[]});
 }});
 await repo.initialize();await assert.rejects(repo.list(),/rede/);assert.equal(unlocks,1);
 offline=false;await repo.initialize();assert.deepEqual(await repo.list(),[]);assert.equal(unlocks,1);
 epoch=2;await repo.initialize();assert.equal(unlocks,2);
 redirect=true;await assert.rejects(repo.request('/api/session'),/expirou/);assert.equal(repo.key,null);
});
