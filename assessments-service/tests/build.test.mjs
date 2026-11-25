import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildBackend,verifyDependencies,matrix,sha256,ROOT} from '../build.mjs';
import {assertScope,assertMatrixUpdate,verifyScope,SCOPE_BASE} from '../integrity.mjs';
test('#81 runtime graph pins all 20 inputs, 17 unchanged main dependencies and the candidate bundle',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'salta-minimal-build-'));try{
  verifyScope();assert.equal(verifyDependencies().inputs.length,20);assert.equal(matrix.inputs.filter(x=>x.comparison==='identical').length,17);
  assert.equal(matrix.inputs.filter(x=>x.path.startsWith('assessments-service/')).length,4);
  const b=await buildBackend(dir);assert.equal(sha256(b.code),matrix.expectedBundleSha256);
  const repeated=await buildBackend(path.join(dir,'repeat'));assert.equal(repeated.code,b.code);assert.equal(repeated.manifest.artifactSha256,b.manifest.artifactSha256);
  assert.equal(b.manifest.deploymentPerformed,false);assert.equal(b.manifest.secretsIncluded,false);
  assert.ok(b.manifest.status.startsWith('candidate'));assert.ok(!b.manifest.inputs.some(x=>/tests|fixtures|stats-worker|auth-worker/.test(x.path)));
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('source/dependency and scope mutations fail closed without weakening existing frontend guard',()=>{
 for(const p of ['stats-worker/worker.js','auth-worker/worker.js','corretor/v2/omr/render.mjs','plataforma/corretor-v2.css','plataforma/professor-theme.css','assessments-lab/crypto/encryption.js','assessments-service/migrations/0002.sql','assessments-service/wrangler.toml','assessments-service/deploy.mjs'])assert.throws(()=>assertScope([p]),/Forbidden/);
 assert.throws(()=>verifyDependencies(p=>p==='assessments-service/worker.mjs'?Buffer.from('unapproved'):readFileSync(path.join(ROOT,p))),/Unapproved/);
 assert.throws(()=>verifyDependencies(p=>p==='assessments-lab/crypto/encryption.js'?Buffer.from('unapproved'):readFileSync(path.join(ROOT,p))),/Unapproved/);
});
test('#136 incremental scope and historical matrix fail closed on unrelated changes',()=>{
 const before=JSON.parse(execFileSync('git',['show',SCOPE_BASE+':assessments-service/dependencies.json'],{cwd:ROOT,encoding:'utf8'}));
 assert.equal(assertMatrixUpdate(before,matrix),true);
 assert.doesNotThrow(()=>assertScope(['assessments-service/worker.mjs','assessments-service/dependencies.json','assessments-service/tests/lifecycle-d1.integration.mjs']));
 for(const p of ['plataforma/corretor-v2.html','laboratorio/salta-omr-capture-lab/js/app.js','assessments-service/gateway-lifecycle.mjs','assessments-service/custody/worker.mjs','assessments-service/migrations/0002_assessment_lifecycle.sql','assessments-service/build.mjs','.github/workflows/test-assessments-embedded.yml'])assert.throws(()=>assertScope([p]),/Forbidden/);
 for(const mutate of [
  m=>m.main=SCOPE_BASE,
  m=>m.backendSource=SCOPE_BASE,
  m=>m.inputs.find(x=>x.path==='assessments-service/custody-client.mjs').candidateBlob='0'.repeat(40),
  m=>m.inputs.find(x=>x.path==='assessments-service/worker.mjs').mainBlob='0'.repeat(40),
  m=>m.inputs.pop(),
 ]){const altered=structuredClone(matrix);mutate(altered);assert.throws(()=>assertMatrixUpdate(before,altered),/Unauthorized/)}
});
test('independent custody artifact and private/operator configurations are pinned and disjoint',async()=>{
 const {buildCustody}=await import('../custody/build.mjs'),{custodyConfig,operatorConfig,DATABASE_ID}=await import('../custody/config.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'salta-custody-build-'));try{
  const b=await buildCustody(dir);assert.equal(sha256(b.code),b.manifest.artifactSha256);assert.equal(b.manifest.inputs.length,2);
  const c=custodyConfig(path.join(dir,'custody.mjs')),o=operatorConfig();
  assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);assert.deepEqual(c.routes,[]);assert.equal(c.d1_databases[0].database_id,DATABASE_ID);assert.deepEqual(c.migrations[0].new_sqlite_classes,['CustodyLedger']);
  assert.equal(c.vars.CUSTODY_CUSTODIAN,'SALTA-owner');assert.equal(o.services[0].entrypoint,'CustodyOperator');assert.equal(o.services[0].remote,true);assert.equal(o.workers_dev,false);assert.deepEqual(o.routes,[]);assert(!o.durable_objects);
 }finally{await rm(dir,{recursive:true,force:true})}
});
