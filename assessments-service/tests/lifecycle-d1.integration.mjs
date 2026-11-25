import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {migration,seed,secret,packet,portal} from './helpers.mjs';
import {ASSESSMENT_LIFECYCLE_VERSION as version} from '../../corretor/v2/assessments/lifecycle.mjs';
const require=createRequire(new URL('../../assessments-lab/package.json',import.meta.url));const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
test('real workerd D1 migration + atomic replacement/delete, concurrent saves, replay, revocation and restart',async()=>{
 const script=(await build({entryPoints:[fileURLToPath(new URL('../worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
 const custody=(await build({entryPoints:[fileURLToPath(new URL('../custody/worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']})).outputFiles[0].text;
 const state=await mkdtemp(path.join(tmpdir(),'salta-lifecycle-d1-'));
 const options=convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[{name:'library',script,modules:true,compatibilityDate:'2026-10-01',bindings:{ENABLE_ASSESSMENTS:'true',ENABLE_ASSESSMENT_LIFECYCLE:'true',ASSESSMENT_RETENTION_POLICY:version,PORTAL_ORIGIN:portal,ASSESSMENT_KEYRING:JSON.stringify({1:secret()}),ASSESSMENT_ACTIVE_KEY_VERSION:'1'},d1Databases:{ASSESSMENTS_DB:'synthetic-lifecycle-only'},serviceBindings:{AUTH:'auth',ASSESSMENT_CUSTODY:{name:'custody',entrypoint:'CustodyWriter'}}},{name:'custody',script:custody,modules:true,compatibilityDate:'2026-10-01',bindings:{CUSTODY_DATABASE_ID:'synthetic-lifecycle-only',CUSTODY_CUSTODIAN:'synthetic-owner'},d1Databases:{PRIMARY_ASSESSMENTS_DB:'synthetic-lifecycle-only'},durableObjects:{JOURNAL:{className:'CustodyLedger',useSQLite:true}}},{name:'operator',script:`export default {fetch:(r,e)=>e.OPERATOR.fetch(r)}`,modules:true,compatibilityDate:'2026-10-01',serviceBindings:{OPERATOR:{name:'custody',entrypoint:'CustodyOperator'}}},{name:'auth',script:readFileSync(new URL('../../auth-worker/worker.js',import.meta.url),'utf8'),modules:true,compatibilityDate:'2026-09-29',durableObjects:{SESSIONS:{className:'SessionStore',useSQLite:true}}}]});
 options.isolatedResourcePersistencePath=state;options.resourcePersistencePath=state;let mf=new Miniflare(options);
 try{
  const db=await mf.getD1Database('ASSESSMENTS_DB','library');
  for(const source of [migration,readFileSync(new URL('../migrations/0002_assessment_lifecycle.sql',import.meta.url),'utf8')]){
   const statements=source.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|DROP|ALTER|INSERT|PRAGMA|$)/).map(s=>s.trim()).filter(Boolean);
   for(const statement of statements)await db.exec(statement.replace(/\s+/g,' ')+';');
  }
  await seed(db);
  const operator=async(action)=>{const service=await mf.getWorker('operator'),r=await service.fetch('https://operator/',{method:'POST',body:JSON.stringify({action})}),b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b};
  const journal=await mf.getWorker('custody');assert.equal((await journal.fetch('https://no-public/')).status,503);
  const {ASSESSMENT_CUSTODY:writer}=await mf.getBindings('library');
  assert.equal((await writer.fetch('https://writer/',{method:'POST',body:JSON.stringify({action:'initialize'})})).status,400);
  await operator('initialize');await operator('open');
  for(const action of ['status','checkpoint','events','close','open','DELETE'])assert.equal((await writer.fetch('https://writer/',{method:'POST',body:JSON.stringify({action})})).status,400);
  assert.equal((await writer.fetch('https://writer/',{method:'GET'})).status,405);
  const ns=await mf.getDurableObjectNamespace('SESSIONS','auth'),sessions=ns.get(ns.idFromName('salta-professor-sessions')),token=secret();
  await sessions.fetch('https://sessions/create',{method:'POST',body:JSON.stringify({id:token,user:'synthetic-login-a',expiresAt:Math.floor(Date.now()/1000)+3600})});
  const req=(p,method='GET',data)=>mf.dispatchFetch('http://localhost/assessments/v1'+p,{method,headers:{Origin:portal,Cookie:'__Host-salta_session='+token,'X-Salta-Assessment-Lifecycle':version,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const id=crypto.randomUUID(),route='/assessments/'+id,p={...packet(),lifecycleVersion:version};assert.equal((await req(route,'PUT',p)).status,201);
  const race=await Promise.all([1,2].map(()=>req(route,'PUT',{...packet(1),lifecycleVersion:version})));assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  assert.equal(await db.prepare('SELECT count(*) n FROM av_revisions').first('n'),1);assert.equal((await req(route+'/revisions/1')).status,410);
  const before=(await (await req(route)).json()).record;
  await db.exec("CREATE TRIGGER synthetic_fail_receipt BEFORE INSERT ON av_requests BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  assert.equal((await req(route,'PUT',{...packet(2),lifecycleVersion:version})).status,503);assert.deepEqual((await (await req(route)).json()).record,before);
  const d={requestId:crypto.randomUUID(),expectedRevision:2,lifecycleVersion:version};assert.equal((await req(route+'/delete','POST',d)).status,503);assert.equal((await req(route)).status,200);
  await db.exec('DROP TRIGGER synthetic_fail_receipt;');
  const deletionRace=await Promise.all([req(route+'/delete','POST',d),req(route+'/delete','POST',d)]);assert.deepEqual(deletionRace.map(r=>r.status).sort(),[200,201]);assert.equal((await req(route+'/delete','POST',d)).status,200);
  assert.equal(await db.prepare('SELECT count(*) n FROM av_revisions').first('n'),0);assert.equal(await db.prepare('SELECT count(*) n FROM av_assessments').first('n'),0);assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  await mf.dispose();mf=new Miniflare(options);assert.equal((await req(route)).status,404);assert.equal((await (await req(route+'/status')).json()).deleted,true);assert.equal((await req(route,'PUT',{...packet(),lifecycleVersion:version})).status,409);
  await operator('close');const cut=(await operator('checkpoint')).checkpoint;assert.equal(cut.fenceCount,1);assert.equal(cut.pending,0);await operator('open');
  const restarted=await mf.getD1Database('ASSESSMENTS_DB','library');await restarted.prepare("UPDATE av_grants SET enabled=0 WHERE principal_id='synthetic-teacher-a'").run();assert.equal((await req(route+'/delete','POST',d)).status,403);
 }finally{await mf.dispose();await rm(state,{recursive:true,force:true})}
});
