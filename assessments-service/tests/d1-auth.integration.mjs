// Real workerd + D1 + unmodified Auth Worker, loopback only. Synthetic session
// setup uses the local Durable Object binding, never a public login/test bypass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {migration,seed,secret,packet,portal} from './helpers.mjs';
const require=createRequire(new URL('../../assessments-lab/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {build}=require('esbuild');

test('workerd/D1 and real Auth session contract: recovery, CAS, rollback, immutable binding and logout',async()=>{
 const bundled=await build({entryPoints:[fileURLToPath(new URL('../worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const state=await mkdtemp(path.join(tmpdir(),'salta-private-assessments-'));
 const options=convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[
  {name:'assessments-service',script:bundled.outputFiles[0].text,modules:true,compatibilityDate:'2026-10-01',
   bindings:{ENABLE_ASSESSMENTS:'true',PORTAL_ORIGIN:portal,ASSESSMENT_KEYRING:JSON.stringify({1:secret()}),ASSESSMENT_ACTIVE_KEY_VERSION:'1'},d1Databases:{ASSESSMENTS_DB:'synthetic-assessments-only'},serviceBindings:{AUTH:'auth'}},
  {name:'auth',script:readFileSync(new URL('../../auth-worker/worker.js',import.meta.url),'utf8'),modules:true,compatibilityDate:'2026-09-29',durableObjects:{SESSIONS:{className:'SessionStore',useSQLite:true}}}
 ]});
 // Miniflare 5 uses a shared persistence root; its V4 adapter does not carry
 // d1Persist/durableObjectsPersist across. Explicitly retain only this temp root.
 options.isolatedResourcePersistencePath=state;
 options.resourcePersistencePath=state;
 let mf=new Miniflare(options);
 try {
  const db=await mf.getD1Database('ASSESSMENTS_DB','assessments-service');
  // D1 exec expects one complete statement per line, including each trigger.
  const statements=migration.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|PRAGMA|$)/).map(s=>s.trim()).filter(Boolean);
  for(const statement of statements) await db.exec(statement.replace(/\s+/g,' ')+';');
  await seed(db);
  const ns=await mf.getDurableObjectNamespace('SESSIONS','auth'), sessions=ns.get(ns.idFromName('salta-professor-sessions'));
  const token=secret();
  await sessions.fetch('https://sessions/create',{method:'POST',body:JSON.stringify({id:token,user:'synthetic-login-a',expiresAt:Math.floor(Date.now()/1000)+3600})});
  const request=(path,{method='GET',data,cookie='__Host-salta_session='+token}={})=>mf.dispatchFetch('http://localhost/assessments/v1'+path,{method,headers:{Origin:portal,Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  assert.equal((await request('/session',{cookie:''})).status,401);
  assert.equal((await request('/session')).status,200);
  const id=crypto.randomUUID(),p=packet(),route='/assessments/'+id;
  let r=await request(route,{method:'PUT',data:p});assert.equal(r.status,201,await r.clone().text());
  assert.equal((await request(route,{method:'PUT',data:p})).status,200);
  const race=await Promise.all([packet(1),packet(1)].map(data=>request(route,{method:'PUT',data})));
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  const recovered=(await(await request(route+'/revisions/1')).json()).record;
  assert.deepEqual(recovered.definition,p.definition);
  const secondDeviceToken=secret();
  await sessions.fetch('https://sessions/create',{method:'POST',body:JSON.stringify({id:secondDeviceToken,user:'synthetic-login-a',expiresAt:Math.floor(Date.now()/1000)+3600})});
  const secondDevice=(await(await request(route+'/revisions/1',{cookie:'__Host-salta_session='+secondDeviceToken})).json()).record;
  assert.deepEqual(secondDevice,recovered,'Independent authenticated session needs no device key or recovery phrase');
  // Fail the final receipt statement to demonstrate full D1 rollback, then retry.
  await db.exec("CREATE TRIGGER synthetic_fail_receipt BEFORE INSERT ON av_requests BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  const failedId=crypto.randomUUID(),failed=packet();assert.equal((await request('/assessments/'+failedId,{method:'PUT',data:failed})).status,503);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM av_assessments WHERE id=?').bind(failedId).first('n'),0);
  await db.exec('DROP TRIGGER synthetic_fail_receipt;');
  assert.equal((await request('/assessments/'+failedId,{method:'PUT',data:failed})).status,201);
  const selection={requestId:crypto.randomUUID(),selectionId:crypto.randomUUID(),assessmentId:id,revision:1};
  assert.equal((await request('/selections',{method:'POST',data:selection})).status,201);
  const print=await(await request(route+'/revisions/1/print')).json();assert.equal(print.assessmentId,id);assert.ok(!JSON.stringify(print).includes('"correct"'));
  await assert.rejects(db.prepare('DELETE FROM av_revisions WHERE assessment_id=?').bind(id).run(),/immutable/);
  // Logout revokes the exact same session in the existing Auth Durable Object.
  const auth=await mf.getBindings('assessments-service');
  assert.equal((await auth.AUTH.fetch(new Request('https://salta-auth/logout',{method:'POST',headers:{Cookie:'__Host-salta_session='+token}}))).status,200);
  assert.equal((await request(route)).status,401);
  assert.equal((await request(route,{cookie:'__Host-salta_session='+secondDeviceToken})).status,200,'Logout revokes its own session, not another device');
  await mf.dispose();mf=new Miniflare(options);
  const restartReply=await request(route+'/revisions/1',{cookie:'__Host-salta_session='+secondDeviceToken});
  assert.equal(restartReply.status,200,await restartReply.clone().text());
  const restarted=(await restartReply.json()).record;
  assert.deepEqual(restarted,recovered,'Persisted D1, server keys and Auth session survive runtime restart');
  assert.equal((await request(route)).status,401,'Logged-out session stays revoked after restart');
 } finally { await mf.dispose();await rm(state,{recursive:true,force:true}); }
});
