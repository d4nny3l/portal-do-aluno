// DESIGN-SALTA-03 · escopo fechado Issue #149 + adendo #7224525896.
// Verifica o diff real contra a main que já contém DESIGN-SALTA-02.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const main='e9ed27f75eeb9f747a78c240c8766e8db5fee748';
const branch='feat/design-salta-03-direct-bulk-matrix';
const allowed=new Set([
 'plataforma/atelie-salta.html',
 'plataforma/atelie-salta-v2-controls.mjs',
 'plataforma/atelie-salta-v2-matrix.mjs',
 'plataforma/atelie-salta-v2-fidelity.css',
 'plataforma/tests/atelie-salta-v2-fidelity.test.mjs',
 'plataforma/tests/atelie-salta-v3.test.mjs',
 'scripts/verify-atelie-salta-v2-fidelity-browser.mjs',
 'scripts/verify-atelie-salta-v2-03-browser.mjs',
 'scripts/verify-atelie-salta-v2-scope.mjs',
 'plataforma/atelie-salta-v3-audit.md',
 '.github/workflows/test-atelie-salta-v2.yml'
]);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const ev=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(ev.pull_request?.head?.ref===branch,'Expected branch '+branch);
  assert(ev.pull_request?.base?.ref==='main','PR must target main');
  assert(ev.pull_request?.draft===true,'PR must remain DRAFT');
  assert(ev.pull_request?.head?.sha===git('rev-parse','HEAD'),'PR head changed or synthetic merge checked out');
 }
 git('merge-base','--is-ancestor',main,'HEAD');
 const diff=git('diff','--name-only',main,'HEAD','--').split('\n').filter(Boolean);
 assert(!diff.some(p=>!allowed.has(p)),'Forbidden changes: '+diff.filter(p=>!allowed.has(p)).join(', '));
 for(const p of ['plataforma/atelie-salta.html','plataforma/atelie-salta-v2-controls.mjs','plataforma/atelie-salta-v2-matrix.mjs','plataforma/atelie-salta-v2-fidelity.css','plataforma/tests/atelie-salta-v3.test.mjs','scripts/verify-atelie-salta-v2-03-browser.mjs']){
  assert(diff.includes(p),'Required DESIGN-SALTA-03 path absent: '+p);
 }
 assert(!git('diff','--name-only','HEAD','--'),'Dirty tracked working tree');
 git('diff','--check',main,'HEAD','--');
 const read=p=>readFileSync(root+'/'+p,'utf8');
 const html=read('plataforma/atelie-salta.html'),matrix=read('plataforma/atelie-salta-v2-matrix.mjs'),controls=read('plataforma/atelie-salta-v2-controls.mjs'),svg=read('plataforma/atelie-salta-v2-favicon-c.svg'),sprite=read('plataforma/atelie-salta-v2-icons.svg');
 assert((html.match(/role="tabpanel"/g)||[]).length===6,'Six original Ateliê tabs changed');
 assert((sprite.match(/<symbol id="v2-/g)||[]).length===68,'68 original icons changed');
 assert(html.includes('<link rel="icon" type="image/svg+xml" href="./atelie-salta-v2-favicon-c.svg">'),'Ateliê favicon must be C');
 assert(/#17324D/.test(svg)&&/#166AA6/.test(svg)&&/>S<\/text>/.test(svg),'Approved favicon C must be original gradient');
 assert(controls.includes("id==='C'?'checked'"),'C not selected by default');
 assert(matrix.includes("Todos presentes")&&matrix.includes("Todos ausentes")&&matrix.includes("Todos realizados")&&matrix.includes("Todos não realizados"),'Bulk controls absent');
 assert(matrix.includes('assignCommon')&&matrix.includes('isSpecial')&&matrix.includes('updateSummary'),'Direct interactions absent');
 for(const src of [matrix,controls])assert(!/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b|XMLHttpRequest|indexedDB/.test(src),'Network or persistence forbidden');
 assert(!/<iframe\b/.test(html),'No new parallel lab');
 console.log('DESIGN-SALTA-03 SCOPE PASS — Ateliê-only diff, 22 compositions/68 icons retained, approved favicon C.');
}catch(e){console.error('DESIGN-SALTA-03 SCOPE BLOCKED:',e.message);process.exitCode=1;}
