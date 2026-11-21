// Exact source/diff guard. No change to the existing frontend or deploy guards.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT,verifyDependencies,matrix} from './build.mjs';
const allowed=new Set([
 'assessments-service/.gitignore','assessments-service/worker.mjs','assessments-service/definition.mjs','assessments-service/crypto.mjs',
 'assessments-service/build.mjs','assessments-service/dependencies.json','assessments-service/integrity.mjs','assessments-service/test-composition.mjs','assessments-service/README.md',
 'assessments-service/migrations/0001_private_library.sql',
 ...['helpers.mjs','service.test.mjs','catalog-pages.test.mjs','private-bridge.integration.test.mjs','score-format.test.mjs','d1-auth.integration.mjs','build.test.mjs','sealed-gateway.mjs','gateway.integration.mjs','frontend88.integration.mjs'].map(n=>'assessments-service/tests/'+n),
 '.github/workflows/test-assessments-backend-minimal.yml','docs/avaliacoes/P1_85_B_BACKEND.md'
]);
export function assertScope(paths){const denied=paths.filter(p=>!allowed.has(p));if(denied.length)throw Error('Forbidden backend delta: '+denied.join(', '))}
export function verifyScope(base=process.env.P1_85_DIFF_BASE||'codex/p1-85-b-score-helper-20261121'){
 const git=(...a)=>execFileSync('git',a,{cwd:ROOT,stdio:['ignore','pipe','pipe']}).toString().trim();
 assertScope([...git('diff','--name-only','-z',base,'--').split('\0'),...git('ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean));
 if(matrix.main!=='5865dfc43efeada4effa2c8a96a3543794a6ff7f'||matrix.contract!=='5798112330260138ea4124cb9ea6d7f202248ddc'||matrix.frontend88!=='8141984e03cf43632b3313ddcb6159f0ab5a9ac2')throw Error('Reference provenance changed');
 for(const row of matrix.inputs){let mainBlob=null;try{mainBlob=git('rev-parse','--verify',matrix.main+':'+row.path)}catch{}
  if(mainBlob!==row.mainBlob||git('rev-parse','--verify',matrix.contract+':'+row.path)!==row.candidateBlob)throw Error('Git matrix mismatch: '+row.path);
  if(row.path==='corretor/v2/assessments/score-format.mjs'&&git('rev-parse',matrix.frontend88+':'+row.path)!==row.candidateBlob)throw Error('Shared helper mismatch');
 }
 if(git('hash-object','assessments-service/migrations/0001_private_library.sql')!==git('rev-parse',matrix.contract+':assessments-service/migrations/0001_private_library.sql'))throw Error('Historical schema changed');
 verifyDependencies();return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){verifyScope();console.log('Exact minimal backend diff; 17 Git-proven inputs; protected sources unchanged; no publication')}
