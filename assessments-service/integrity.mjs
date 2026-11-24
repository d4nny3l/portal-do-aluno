// #120 exact scope. No exceptions for Auth, Stats, optics, crypto, CSS or deployment configuration.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {ROOT,verifyDependencies,matrix} from './build.mjs';
const MAIN='e156a8673a10421e8d62728c1b6a4ff7f6c0d1d3',BACKEND='e156a8673a10421e8d62728c1b6a4ff7f6c0d1d3';
const allowed=new Set([
 'corretor/v2/assessments/editor-snapshot.mjs','corretor/v2/assessments/private-client.mjs','corretor/v2/assessments/private-library.mjs','corretor/v2/assessments/private-contract-adapter.mjs','plataforma/avaliacoes-biblioteca.mjs','plataforma/corretor-v2.html','plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs','plataforma/tests/piloto-avaliacoes-isolado.test.mjs',
 '.github/workflows/test-avaliacoes-biblioteca.yml','.github/workflows/test-assessments-embedded.yml','docs/avaliacoes/BIBLIOTECA_QUADROS_118.md','docs/avaliacoes/SALVAMENTO_INTEGRAL_120.md',
 ...['.gitignore','worker.mjs','definition.mjs','crypto.mjs','build.mjs','dependencies.json','integrity.mjs','test-composition.mjs','README.md','migrations/0001_private_library.sql'].map(p=>'assessments-service/'+p),
 ...['helpers.mjs','service.test.mjs','catalog-pages.test.mjs','private-bridge.integration.test.mjs','score-format.test.mjs','d1-auth.integration.mjs','build.test.mjs','sealed-gateway.mjs','gateway.integration.mjs','frontend88.integration.mjs','embedded-library.integration.mjs','embedded-browser.mjs','editor-snapshot.test.mjs','editor-frontend-browser.mjs'].map(n=>'assessments-service/tests/'+n)
]);
export function assertScope(paths){const denied=paths.filter(p=>!allowed.has(p));if(denied.length)throw Error('Forbidden #120 delta: '+denied.join(', '))}
export function verifyScope(){
 const git=(...a)=>execFileSync('git',a,{cwd:ROOT,stdio:['ignore','pipe','pipe']}).toString().trim();
 if(matrix.main!==MAIN||matrix.backendSource!==BACKEND)throw Error('Reference provenance changed');
 assertScope([...git('diff','--name-only','-z',MAIN,'--').split('\0'),...git('ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean));
 for(const row of matrix.inputs){
  if(row.comparison==='identical'){
   if(git('rev-parse',MAIN+':'+row.path)!==row.candidateBlob)throw Error('Published dependency changed: '+row.path);
  }else if(row.comparison!=='new'&&git('rev-parse',BACKEND+':'+row.path)!==row.originBlob)throw Error('Backend provenance changed: '+row.path);
 }
 for(const p of ['assessments-service/crypto.mjs','assessments-service/migrations/0001_private_library.sql'])if(git('hash-object',p)!==git('rev-parse',BACKEND+':'+p))throw Error('Historical crypto/schema changed');
 // Contract-bound editor-only substitutions. Every scanner, reader, correction,
 // import and unrelated markup byte must match the published base exactly.
 const before=execFileSync('git',['show',MAIN+':plataforma/corretor-v2.html'],{cwd:ROOT}).toString();
 let current=readFileSync(ROOT+'/plataforma/corretor-v2.html','utf8');
 const approvedImport="import {EDITOR_FIELD_IDS} from '../corretor/v2/assessments/editor-snapshot.mjs?v=20261124snap120';\n";
 if(current.split(approvedImport).length!==2)throw Error('Missing or repeated approved editor import');
 current=current.replace(approvedImport,'');
 const slots=[
  ['function syncHeaderForm(){','function currentMetadata(){'],
  ['async function loadLogo(file,key){',"$('headerLogo').onchange="],
  ['const bankFieldIds=','function restoreAssessmentEditor('],
  ['function restoreAssessmentEditor(','function resetAssessmentEditor('],
  ['function resetAssessmentEditor(','// Legacy manual correction still reads'],
  ['applyExactModel:bundle=>','activateSelection:activatePrivateCorrection,']
 ];
 for(const [start,end] of slots){
  const a=current.indexOf(start),b=current.indexOf(end,a+start.length);
  const c=before.indexOf(start),d=before.indexOf(end,c+start.length);
  if(Math.min(a,b,c,d)<0||current.indexOf(start,a+1)!==-1||before.indexOf(start,c+1)!==-1)throw Error('Ambiguous editor-only substitution: '+start);
  current=current.slice(0,a)+before.slice(c,d)+current.slice(b);
 }
 if(current!==before)throw Error('Unauthorized page change outside exact editor-only slots');
 verifyDependencies();return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){verifyScope();console.log('#120 scope, 18 runtime inputs, 15 published dependencies, unchanged crypto/schema/optics/Auth/Stats: PASS')}
