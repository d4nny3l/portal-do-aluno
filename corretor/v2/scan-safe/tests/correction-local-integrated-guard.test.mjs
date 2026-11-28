// #141 post-squash governance: pure isolated mutations of real Git evidence.
// No event/environment rewrite, no worktree mutation and no fake passing CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertHistoricalCorrectionContext,assertCorrectionLocalIntegratedEvidence,collectCorrectionLocalIntegratedEvidence,verifyCorrectionLocalIntegrated} from '../../../../scripts/verify-correction-local-scope.mjs';
const baseline=collectCorrectionLocalIntegratedEvidence();
const validContext={repository:{full_name:'d4nny3l/portal-do-aluno'},pull_request:{number:142,head:{ref:'feat/correction-local-01'},base:{ref:'main',sha:'d5eac2f4d6c0389058ba5061bf2851ec5680f55c'}}};
function rejects(change,pattern){const e=structuredClone(baseline);change(e);assert.throws(()=>assertCorrectionLocalIntegratedEvidence(e),pattern);}
test('historical #142 authorization stays exact; unrelated PR context rejected',()=>{
 assert.doesNotThrow(()=>assertHistoricalCorrectionContext(validContext));
 for(const mutate of [
  e=>e.repository.full_name='other/repo',e=>e.pull_request.number=156,
  e=>e.pull_request.head.ref='feat/design-salta-06-official-foundation',
  e=>e.pull_request.base.ref='other',e=>e.pull_request.base.sha='0'.repeat(40)
 ]){const e=structuredClone(validContext);mutate(e);assert.throws(()=>assertHistoricalCorrectionContext(e),/Unauthorized #141 context/);}
});
test('legitimate post-squash non-OMR checkout passes permanent integrity, not historical authorization',()=>{
 assert.equal(verifyCorrectionLocalIntegrated(),true);
 assert.equal(baseline.historicalDelta.length,18);
 const e=structuredClone(validContext);e.pull_request.number=156;assert.throws(()=>assertHistoricalCorrectionContext(e),/Unauthorized #141 context/);
});
test('invalid squash parent or ancestry is rejected',()=>{
 rejects(e=>e.squashParents='invalid',/ancestry/);
 rejects(e=>e.baseAncestor=false,/ancestry/);
 rejects(e=>e.squashAncestor=false,/ancestry/);
});
test('historical delta must be exactly the 18 authorized files and no optical change',()=>{
 rejects(e=>e.historicalDelta.pop(),/historical delta/);
 rejects(e=>e.historicalDelta[0]='corretor/v2/omr/reader.mjs',/historical delta/);
 rejects(e=>e.historicalProtectedDelta.push('corretor/v2/omr/reader.mjs'),/Protected optical/);
});
test('adulterated historical snapshot or current approved HTML slot fails closed',()=>{
 rejects(e=>e.squashHtml+='<!-- tampered -->',/squash HTML/);
 rejects(e=>e.headHtml+='<!-- tampered -->',/HTML rollback/);
 rejects(e=>e.worktreeHtml+='<!-- tampered -->',/HTML rollback/);
});
test('rollback to original pre-#141 HTML is rejected',()=>rejects(e=>{e.headHtml=e.baseHtml;e.worktreeHtml=e.baseHtml;},/HTML rollback/));
test('rollback or unauthorized changes of integrated private correction modules rejected',()=>{
 for(const p of Object.keys(baseline.headBlobs)){
  rejects(e=>e.headBlobs[p]='0'.repeat(40),/module changed or rolled back/);
  rejects(e=>e.worktreeBlobs[p]='0'.repeat(40),/module changed or rolled back/);
  rejects(e=>e.squashBlobs[p]='0'.repeat(40),/squash pin/);
 }
});
test('committed optical, camera, assessment and backend changes rejected',()=>{
 for(const p of ['corretor/v2/omr/reader.mjs','corretor/v2/scan-safe/camera.mjs','corretor/v2/assessments/block-scoring.mjs','auth-worker/src/index.js','plataforma/corretor-v2.css'])rejects(e=>e.protectedDelta.push(p),/Integrated protected sources changed/);
});
test('uncommitted, staged and untracked optical alterations rejected',()=>{
 for(const key of ['protectedWorktreeDelta','protectedIndexDelta','protectedUntracked'])rejects(e=>e[key].push('corretor/v2/omr/reader.mjs'),/Uncommitted protected sources changed/);
});
