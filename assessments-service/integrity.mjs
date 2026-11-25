// #81 exact candidate scope: preserve all OMR, camera, PDF, Auth, Stats and crypto.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {ROOT,verifyDependencies,matrix} from './build.mjs';
const BASE='719c9f286e269f2b21b4c63f5b395fbc7b88542c';
const allowed=new Set([
 'corretor/v2/assessments/private-ui.mjs','corretor/v2/assessments/lifecycle.mjs','corretor/v2/assessments/private-client.mjs','corretor/v2/assessments/private-library.mjs',
 'plataforma/avaliacoes-biblioteca.mjs','plataforma/avaliacao-excluir-dialog.mjs','plataforma/avaliacao-excluir-dialog.css','plataforma/corretor-v2.html',
 'plataforma/tests/piloto-avaliacoes-isolado.test.mjs','plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs',
 '.github/workflows/test-direct-pdf.yml','.github/workflows/test-assessments-embedded.yml','docs/avaliacoes/EXCLUSAO_SUBSTITUICAO_81.md',
 ...['test-composition.mjs','worker.mjs','gateway-lifecycle.mjs','restore-fences.mjs','build.mjs','build-gateway.mjs','dependencies.json','integrity.mjs','migrations/0002_assessment_lifecycle.sql'].map(p=>'assessments-service/'+p),
 ...['lifecycle-d1.integration.mjs','embedded-library.integration.mjs','private-bridge.integration.test.mjs','helpers.mjs','build.test.mjs','lifecycle.test.mjs','lifecycle-gateway.test.mjs','lifecycle-browser.mjs','editor-frontend-browser.mjs','embedded-browser.mjs'].map(n=>'assessments-service/tests/'+n)
]);
export function assertScope(paths){const denied=paths.filter(p=>!allowed.has(p));if(denied.length)throw Error('Forbidden #81 delta: '+denied.join(', '))}
export function verifyScope(){
 const git=(...a)=>execFileSync('git',a,{cwd:ROOT,stdio:['ignore','pipe','pipe']}).toString().trim();
 if(matrix.main!==BASE||matrix.backendSource!==BASE)throw Error('Reference provenance changed');
 assertScope([...git('diff','--name-only','-z',BASE,'--').split('\0'),...git('ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean));
 for(const row of matrix.inputs){
  if(row.comparison==='identical'&&git('rev-parse',BASE+':'+row.path)!==row.candidateBlob)throw Error('Published dependency changed: '+row.path);
  if(row.comparison==='modified'&&row.path!=='assessments-service/worker.mjs')throw Error('Unauthorized runtime input change');
 }
 for(const p of ['assessments-service/crypto.mjs','assessments-service/migrations/0001_private_library.sql'])if(git('hash-object',p)!==git('rev-parse',BASE+':'+p))throw Error('Historical crypto/schema changed');
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
if(process.argv[1]===fileURLToPath(import.meta.url)){verifyScope();console.log('#81 scope, 19 runtime inputs, unchanged optics/camera/PDF/Auth/Stats/crypto: PASS')}
