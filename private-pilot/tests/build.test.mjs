import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildPilot} from '../build.mjs';
import {preparePilot,validateMetadata} from '../prepare.mjs';
import {STATS_REF,STATS_SHA256,ASSESSMENTS_REF,git,sha256} from '../baseline.mjs';
export const metadata=()=>({workerName:'salta-assessments-private-synthetic',databaseName:'salta-assessments-private-synthetic',databaseId:crypto.randomUUID(),activeKeyVersion:1,limiterNamespaces:{ip:'999901',account:'999902',write:'999903',print:'999904'}});
test('artifact freezes production Stats source and exact audited backend, excluding unapproved attendance contract',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'salta-pilot-build-'));try{
  const b=await buildPilot(dir);assert.equal(b.manifest.stats.ref,STATS_REF);assert.equal(b.manifest.stats.sourceSha256,STATS_SHA256);assert.equal(b.manifest.assessments.ref,ASSESSMENTS_REF);
  assert.equal(sha256(await readFile(path.join(dir,'stats-gateway.mjs'))),b.manifest.stats.artifactSha256);
  assert.ok(!b.gatewayCode.includes('d04-v1'));assert.ok(!b.gatewayCode.includes('salta_diario_attendance_commits'));
  assert.ok(b.gatewayCode.includes('INSERT INTO salta_diario_lesson_records (session_id,student_id,present) VALUES (?,?,1)'),'The old production contract is preserved, not silently corrected');
  for(const input of b.manifest.assessments.inputs)assert.equal(sha256(git('show',ASSESSMENTS_REF+':'+input.path)),input.sha256);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('preparation only writes closed local configs; preserves legacy bindings and rejects academic D1/credentials',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'salta-pilot-config-'));try{
  const m=metadata();await preparePilot(m,dir);
  const gateway=await readFile(path.join(dir,'gateway.wrangler.toml'),'utf8'),backend=await readFile(path.join(dir,'backend.wrangler.toml'),'utf8');
  const original=git('show',STATS_REF+':stats-worker/wrangler.toml').toString().replace('main = "worker.js"','main = "stats-gateway.mjs"');
  assert.ok(gateway.startsWith(original));assert.ok(gateway.includes('PRIVATE_GATEWAY_ENABLED = "false"'));
  assert.ok(backend.includes('workers_dev = false'));assert.ok(backend.includes('preview_urls = false'));assert.ok(backend.includes('ENABLE_ASSESSMENTS = "false"'));assert.ok(!backend.includes('ASSESSMENT_KEYRING'));
  assert.ok(!backend.includes('binding = "DB"'));assert.ok(!backend.includes('binding = "DIARIO_DB"'));
  for(const databaseId of ['e7538b0a-891e-408f-a668-75d60ca907e3','44259972-59ed-4ef7-8db8-4fc442e1b90c','fb74f058-06f8-40a5-8327-445bded453e3'])assert.throws(()=>validateMetadata({...m,databaseId}),/reuse/);
  assert.throws(()=>validateMetadata({...m,token:'forbidden'}),/credentials/);assert.throws(()=>validateMetadata({...m,workerName:'salta-auth'}));
  assert.throws(()=>validateMetadata({...m,limiterNamespaces:{...m.limiterNamespaces,account:m.limiterNamespaces.ip}}));
 }finally{await rm(dir,{recursive:true,force:true})}
});
