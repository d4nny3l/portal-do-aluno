// #81 exact candidate scope: preserve all OMR, camera, PDF, Auth, Stats and crypto.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {ROOT,verifyDependencies,matrix,sha256} from './build.mjs';
const BASE='719c9f286e269f2b21b4c63f5b395fbc7b88542c';
// The #81 provenance stays pinned. PR #136 has its own immutable incremental
// baseline, which already contains the approved lifecycle and unrelated OMR lab.
export const SCOPE_BASE='0fa1b402cad9d4d84a5376ce1bd132da7df20b7c';
const allowed=new Set([
 'assessments-service/worker.mjs',
 'assessments-service/dependencies.json',
 'assessments-service/integrity.mjs',
 'assessments-service/tests/build.test.mjs',
 'assessments-service/tests/lifecycle-d1.integration.mjs'
]);
export function assertScope(paths){const denied=paths.filter(p=>!allowed.has(p));if(denied.length)throw Error('Forbidden #136 delta: '+denied.join(', '))}
export function assertMatrixUpdate(before,after){
 // Only the approved worker's candidate hashes and the bundle hash may change.
 // All historical identities, origins, graph membership and other digests are fixed.
 if(!/^[a-f0-9]{64}$/.test(after.expectedBundleSha256)||after.expectedBundleSha256===before.expectedBundleSha256)throw Error('Invalid updated bundle hash');
 const a=structuredClone(after),b=structuredClone(before);
 const old=b.inputs.find(row=>row.path==='assessments-service/worker.mjs');
 const next=a.inputs.find(row=>row.path==='assessments-service/worker.mjs');
 if(!old||!next||next.comparison!=='modified'||!(/^[a-f0-9]{40}$/.test(next.candidateBlob)&&/^[a-f0-9]{64}$/.test(next.sha256))||next.candidateBlob===old.candidateBlob||next.sha256===old.sha256)throw Error('Invalid updated worker hashes');
 a.expectedBundleSha256=b.expectedBundleSha256;next.candidateBlob=old.candidateBlob;next.sha256=old.sha256;
 if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Unauthorized dependency matrix change');
 return true;
}
export function verifyScope(){
 const git=(...a)=>execFileSync('git',a,{cwd:ROOT,stdio:['ignore','pipe','pipe']}).toString().trim();
 if(matrix.main!==BASE||matrix.backendSource!==BASE)throw Error('Reference provenance changed');
 git('merge-base','--is-ancestor',BASE,SCOPE_BASE);
 git('merge-base','--is-ancestor',SCOPE_BASE,'HEAD');
 // Check committed and working-tree deltas separately: a local edit cannot hide
 // an unauthorized committed path. The historical reference is not a broad allowlist.
 assertScope(git('diff','--name-only','-z',SCOPE_BASE,'HEAD','--').split('\0').filter(Boolean));
 assertScope([...git('diff','--name-only','-z','HEAD','--').split('\0'),...git('ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean));
 const baselineMatrix=JSON.parse(git('show',SCOPE_BASE+':assessments-service/dependencies.json'));
 assertMatrixUpdate(baselineMatrix,matrix);
 for(const row of baselineMatrix.inputs){
  if(git('rev-parse',SCOPE_BASE+':'+row.path)!==row.candidateBlob)throw Error('Integrated dependency provenance mismatch: '+row.path);
 }
 // Existing historical frontend, gateway, crypto, schema and runtime checks below
 // remain in force as well as this stricter incremental scope.
 for(const row of matrix.inputs){
  if(row.comparison==='identical'&&git('rev-parse',BASE+':'+row.path)!==row.candidateBlob)throw Error('Published dependency changed: '+row.path);
  if(row.comparison==='modified'&&row.path!=='assessments-service/worker.mjs')throw Error('Unauthorized runtime input change');
 }
 for(const p of ['assessments-service/crypto.mjs','assessments-service/migrations/0001_private_library.sql'])if(git('hash-object',p)!==git('rev-parse',BASE+':'+p))throw Error('Historical crypto/schema changed');
 if(sha256(readFileSync(ROOT+'/assessments-service/migrations/0002_assessment_lifecycle.sql'))!=='2b85a9899b44bf498773941663039a677c4b87c7493d06038160fda990ea2766')throw Error('Audited migration 0002 changed');
 const before=execFileSync('git',['show',BASE+':plataforma/corretor-v2.html'],{cwd:ROOT}).toString();
 let current=readFileSync(ROOT+'/plataforma/corretor-v2.html','utf8');
 const stylesheet='<link rel="stylesheet" href="avaliacao-excluir-dialog.css">\n';
 if(current.split(stylesheet).length!==2)throw Error('Ambiguous dialog stylesheet');
 current=current.replace(stylesheet,'');
 // Only authenticated private grade presentation/teardown changes; every scanner,
 // camera, optical, print, import, editor and unrelated markup byte stays exact.
 for(const [start,end] of [['calculateScore=function(){','function renderHistory(){'],['function activatePrivateCorrection(selection){','function assessmentEditorState(){']]){
  const a=current.indexOf(start),b=current.indexOf(end,a+start.length),c=before.indexOf(start),d=before.indexOf(end,c+start.length);
  if(Math.min(a,b,c,d)<0||current.indexOf(start,a+1)!==-1)throw Error('Ambiguous private integration slot');
  current=current.slice(0,a)+before.slice(c,d)+current.slice(b);
 }
 if(current!==before)throw Error('Unauthorized page change outside exact private lifecycle slots');
 const oldGateway=execFileSync('git',['show','7080d2de0b5a01bbe417b71732221a869e7a4d42:private-pilot/gateway.mjs'],{cwd:ROOT}).toString();
 const newGateway=readFileSync(ROOT+'/assessments-service/gateway-lifecycle.mjs','utf8')
  .replace("import {ASSESSMENT_LIFECYCLE_VERSION,LIFECYCLE_HEADER} from '../corretor/v2/assessments/lifecycle.mjs';\n",'')
  .replace('(archive|duplicate|delete)$','(archive|duplicate)$')
  .replace(" [new RegExp('^/assessments/'+UUID+'/status$'),['GET']],\n",'')
  .replace(" if(env.PRIVATE_LIFECYCLE_ENABLED==='true')h.set(LIFECYCLE_HEADER,ASSESSMENT_LIFECYCLE_VERSION);\n",'');
 if(newGateway!==oldGateway)throw Error('Gateway changed outside lifecycle namespace delta');
 verifyDependencies();return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){verifyScope();console.log('#136 incremental scope + historical #81 checks, 20 pinned runtime inputs, unchanged optics/camera/PDF/Auth/Stats/crypto: PASS')}
