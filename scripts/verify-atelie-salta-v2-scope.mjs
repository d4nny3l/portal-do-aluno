// DESIGN-SALTA-02: escopo fixado na Issue #147 e ata #143, retificação #7206977286.
// Não altera código: prova que toda a delta está restrita ao Ateliê V2.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const main='f8319e05506861b15589e22aa2a4436df336581a';
const branch='feat/design-salta-02-atelie-fidelidade';
const allowed=new Set([
 'plataforma/atelie-salta.html',
 'plataforma/atelie-salta-v2-fidelity.css',
 'plataforma/atelie-salta-v2-fixtures.mjs',
 'plataforma/atelie-salta-v2-calendar.mjs',
 'plataforma/atelie-salta-v2-matrix.mjs',
 'plataforma/atelie-salta-v2-controls.mjs',
 'plataforma/atelie-salta-v2-compositions.mjs',
 'plataforma/atelie-salta-v2-favicon-a.svg',
 'plataforma/atelie-salta-v2-favicon-b.svg',
 'plataforma/atelie-salta-v2-favicon-c.svg',
 'plataforma/atelie-salta-v2-favicon-d.svg',
 'plataforma/atelie-salta-v2-fidelity-matrix.md',
 'plataforma/tests/atelie-salta-v2-fidelity.test.mjs',
 'scripts/verify-atelie-salta-v2-fidelity-browser.mjs',

 'plataforma/atelie-salta-v2.css',
 'plataforma/atelie-salta-v2.mjs',
 'plataforma/atelie-salta-v2-icons.svg',
 'plataforma/atelie-salta-v2-ICONS-LICENSE.txt',
 'plataforma/atelie-salta-v2-InterVariable.woff2',
 'plataforma/atelie-salta-v2-font-OFL.txt',
 'plataforma/atelie-salta-v2-inventario.md',
 'plataforma/tests/atelie-salta.test.mjs',
 'plataforma/tests/atelie-salta-v2.test.mjs',
 'scripts/verify-atelie-salta-v2-browser.mjs',
 'scripts/verify-atelie-salta-v2-scope.mjs',
 '.github/workflows/test-atelie-salta-v2.yml'
]);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const assert=(condition,message)=>{if(!condition)throw Error(message)};
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const ev=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(ev.pull_request?.head?.ref===branch,'Expected only branch '+branch);
  assert(ev.pull_request?.base?.ref==='main','PR must target main');
  assert(ev.pull_request?.draft===true,'Design PR must remain DRAFT');
  assert(ev.pull_request?.head?.sha===git('rev-parse','HEAD'),'Must inspect actual PR HEAD, not synthetic merge');
 }
 git('merge-base','--is-ancestor',main,'HEAD');
 const diff=git('diff','--name-only',main,'HEAD','--').split('\n').filter(Boolean);
 const forbidden=diff.filter(p=>!allowed.has(p));
 assert(diff.length>=12,'Ateliê DESIGN-SALTA-02 delivery is incomplete');
 assert(!forbidden.length,'Forbidden scope outside Ateliê: '+forbidden.join(', '));
 for(const s of ['plataforma/atelie-salta.html','plataforma/atelie-salta-v2-fixtures.mjs','plataforma/atelie-salta-v2-calendar.mjs','plataforma/atelie-salta-v2-matrix.mjs','plataforma/atelie-salta-v2-controls.mjs','plataforma/atelie-salta-v2-compositions.mjs','plataforma/atelie-salta-v2-fidelity.css'])assert(diff.includes(s),'Required missing artifact '+s);
 assert(!git('diff','--name-only','HEAD','--'),'Tracked worktree modified');
 git('diff','--check',main,'HEAD','--');
 const html=readFileSync(root+'/plataforma/atelie-salta.html','utf8');
 const src=readFileSync(root+'/plataforma/atelie-salta-v2.mjs','utf8');
 const sprite=readFileSync(root+'/plataforma/atelie-salta-v2-icons.svg','utf8');
 assert((html.match(/role="tabpanel"/g)||[]).length===6,'Six Ateliê panels must remain intact');
 assert((sprite.match(/<symbol id="v2-/g)||[]).length===68,'Exactly 68 icon symbols required');
 assert(src.includes('15.22')&&src.includes('15.1'),'Existing 22 decision metadata required');
const added=readFileSync(root+'/plataforma/atelie-salta-v2-fixtures.mjs','utf8');
assert(added.includes('15.22')&&added.includes('15.1'),'22 fidelity decisions required');
const ui=readFileSync(root+'/plataforma/atelie-salta-v2-compositions.mjs','utf8');
assert(!/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b/.test(ui),'No network or storage in demos');
 assert(!/<iframe\b/i.test(html),'No parallel apps or iframes');
 assert(!/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b/.test(src),'No network or stored data');
 console.log('DESIGN-SALTA-02 SCOPE PASS: only Ateliê 02 test/assets, no product/OMR/Auth/Workers/D1.');
}catch(error){console.error('DESIGN-SALTA-02 SCOPE BLOCKED:',error.message);process.exitCode=1;}
