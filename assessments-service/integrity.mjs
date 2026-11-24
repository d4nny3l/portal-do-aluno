// #118 exact scope. No exceptions for Auth, Stats, optics, crypto, CSS or deployment configuration.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {ROOT,verifyDependencies,matrix} from './build.mjs';
const MAIN='81dfa2a6c404213403cdc7d98a0873b58e789f4c',BACKEND='72695b469d7e9b3140371a196ce235918b3df307';
const allowed=new Set([
 'corretor/v2/assessments/private-contract-adapter.mjs','plataforma/avaliacoes-biblioteca.mjs','plataforma/corretor-v2.html','plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs','plataforma/tests/piloto-avaliacoes-isolado.test.mjs',
 '.github/workflows/test-avaliacoes-biblioteca.yml','.github/workflows/test-assessments-embedded.yml','docs/avaliacoes/BIBLIOTECA_QUADROS_118.md',
 ...['.gitignore','worker.mjs','definition.mjs','crypto.mjs','build.mjs','dependencies.json','integrity.mjs','test-composition.mjs','README.md','migrations/0001_private_library.sql'].map(p=>'assessments-service/'+p),
 ...['helpers.mjs','service.test.mjs','catalog-pages.test.mjs','private-bridge.integration.test.mjs','score-format.test.mjs','d1-auth.integration.mjs','build.test.mjs','sealed-gateway.mjs','gateway.integration.mjs','frontend88.integration.mjs','embedded-library.integration.mjs','embedded-browser.mjs'].map(n=>'assessments-service/tests/'+n)
]);
export function assertScope(paths){const denied=paths.filter(p=>!allowed.has(p));if(denied.length)throw Error('Forbidden #118 delta: '+denied.join(', '))}
export function verifyScope(){
 const git=(...a)=>execFileSync('git',a,{cwd:ROOT,stdio:['ignore','pipe','pipe']}).toString().trim();
 if(matrix.main!==MAIN||matrix.backendSource!==BACKEND)throw Error('Reference provenance changed');
 assertScope([...git('diff','--name-only','-z',MAIN,'--').split('\0'),...git('ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean));
 for(const row of matrix.inputs){
  if(row.comparison==='identical'){
   if(git('rev-parse',MAIN+':'+row.path)!==row.candidateBlob)throw Error('Published dependency changed: '+row.path);
  }else if(git('rev-parse',BACKEND+':'+row.path)!==row.originBlob)throw Error('Backend provenance changed: '+row.path);
 }
 for(const p of ['assessments-service/crypto.mjs','assessments-service/migrations/0001_private_library.sql'])if(git('hash-object',p)!==git('rev-parse',BACKEND+':'+p))throw Error('Historical crypto/schema changed');
 // The only permitted inline-page change is removal of the false embedded-reading warning.
 const warning="if(mode==='embedded')limitations.push('Quadros incorporados podem ser impressos, mas a leitura automática exige cartão A4 independente.');";
 const before=execFileSync('git',['show',MAIN+':plataforma/corretor-v2.html'],{cwd:ROOT}).toString();
 if(readFileSync(ROOT+'/plataforma/corretor-v2.html','utf8')!==before.replace(warning,''))throw Error('Unexpected scanner/inline page change');
 verifyDependencies();return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){verifyScope();console.log('#118 scope, 17 runtime inputs, 14 published dependencies, unchanged crypto/schema/optics/Auth/Stats: PASS')}
