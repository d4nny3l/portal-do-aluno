import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_FILES,assertIntegrationPaths,assertApprovedCatalog,verifyIntegration} from '../integrity.mjs';
import {ASSESSMENTS_REF,INTEGRATION_BASE,GATEWAY_REF,STATS_REF,git} from '../baseline.mjs';
test('integration accepts declared #85 delta over #72 and preserves original commits',()=>{
 assert.equal(ASSESSMENTS_REF,'466a6780b29fe462cbf645ca6262b265a4c0c135');
 assert.equal(STATS_REF,'f4dce82716faa06720068f3228a6f890fd0f928f');
 for(const ref of [INTEGRATION_BASE,ASSESSMENTS_REF,GATEWAY_REF])git('merge-base','--is-ancestor',ref,'HEAD');
 assertIntegrationPaths([...CATALOG_FILES,'private-pilot/integrity.mjs','.github/workflows/test-private-pilot.yml']);
 assertApprovedCatalog();verifyIntegration();
});
test('integrity rejects any unaudited catalog byte or protected source/workflow change',()=>{
 for(const p of ['stats-worker/worker.js','stats-worker/wrangler.toml','auth-worker/worker.js','corretor/v2/omr/render.mjs','plataforma/diario.js','assessments-service/migrations/0002.sql','.github/workflows/deploy-salta-stats.yml'])
  assert.throws(()=>assertIntegrationPaths([p]),/Forbidden/);
 assert.throws(()=>assertApprovedCatalog(p=>p==='assessments-service/worker.mjs'?Buffer.from('unaudited'):git('show',ASSESSMENTS_REF+':'+p)),/differs from audited PR #72/);
 assert.throws(()=>assertApprovedCatalog(p=>git('show',ASSESSMENTS_REF+':'+p)),/declared test-only fix/,'Only the declared deterministic test amendment is accepted');
});
