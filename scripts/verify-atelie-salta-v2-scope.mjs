// DESIGN-SALTA-04 Issue #151 + adendos #7224865256/#7224898116.
// Guard cumulativo: mantém proibições e invariantes 02/03, diffs estritamente isolados.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const main='d58b3091860bc6f88feb4f8bfcececc6a816f384';
const branch='feat/design-salta-04-inline-grade-mask';
const allowed=new Set([
 'plataforma/atelie-salta.html',
 'plataforma/atelie-salta-v2-grade-mask.mjs',
 'plataforma/atelie-salta-v2-matrix.mjs',
 'plataforma/atelie-salta-v2-fidelity.css',
 'plataforma/tests/atelie-salta.test.mjs',
 'plataforma/tests/atelie-salta-v2-fidelity.test.mjs',
 'plataforma/tests/atelie-salta-v3.test.mjs',
 'plataforma/tests/atelie-salta-v4.test.mjs',
 'scripts/verify-atelie-salta-v2-browser.mjs',
 'scripts/verify-atelie-salta-v2-fidelity-browser.mjs',
 'scripts/verify-atelie-salta-v2-03-browser.mjs',
 'scripts/verify-atelie-salta-v2-04-browser.mjs',
 'scripts/verify-atelie-salta-v2-scope.mjs',
 'plataforma/atelie-salta-v4-audit.md',
 '.github/workflows/test-atelie-salta-v2.yml'
]);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const ev=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(ev.pull_request?.head?.ref===branch,'Expected exactly branch '+branch);
  assert(ev.pull_request?.base?.ref==='main','PR must target main');
  assert(ev.pull_request?.draft===true,'PR must remain DRAFT');
  assert(ev.pull_request?.head?.sha===git('rev-parse','HEAD'),'Guard must inspect actual PR HEAD');
 }
 git('merge-base','--is-ancestor',main,'HEAD');
 const diff=git('diff','--name-only',main,'HEAD','--').split('\n').filter(Boolean);
 assert(diff.length>=10,'Incomplete DESIGN-SALTA-04 isolation/test delivery');
 assert(!diff.some(p=>!allowed.has(p)),'Forbidden files beyond Ateliê: '+diff.filter(p=>!allowed.has(p)).join(', '));
 for(const p of [
  'plataforma/atelie-salta.html','plataforma/atelie-salta-v2-grade-mask.mjs',
  'plataforma/atelie-salta-v2-matrix.mjs','plataforma/atelie-salta-v2-fidelity.css',
  'plataforma/tests/atelie-salta-v4.test.mjs','scripts/verify-atelie-salta-v2-04-browser.mjs',
  'scripts/verify-atelie-salta-v2-03-browser.mjs','.github/workflows/test-atelie-salta-v2.yml'
 ])assert(diff.includes(p),'Required change missing: '+p);
 assert(!git('diff','--name-only','HEAD','--'),'Tracked working tree dirty');
 git('diff','--check',main,'HEAD','--');
 const read=p=>readFileSync(root+'/'+p,'utf8');
 const html=read('plataforma/atelie-salta.html');
 const src=read('plataforma/atelie-salta-v2.mjs');
 const sprite=read('plataforma/atelie-salta-v2-icons.svg');
 const fixture=read('plataforma/atelie-salta-v2-fixtures.mjs');
 const matrix=read('plataforma/atelie-salta-v2-matrix.mjs');
 const mask=read('plataforma/atelie-salta-v2-grade-mask.mjs');
 const controls=read('plataforma/atelie-salta-v2-controls.mjs');
 const ui=read('plataforma/atelie-salta-v2-compositions.mjs');
 const css=read('plataforma/atelie-salta-v2-fidelity.css');
 const favicon=read('plataforma/atelie-salta-v2-favicon-c.svg');
 assert((html.match(/role="tabpanel"/g)||[]).length===6,'Six approved Ateliê panels required');
 assert((sprite.match(/<symbol id="v2-/g)||[]).length===68,'All 68 approved symbols required');
 assert(src.includes('15.22')&&src.includes('15.1')&&fixture.includes('15.22')&&fixture.includes('15.1'),'22 composition contract required');
 assert(html.includes('<link rel="icon" type="image/svg+xml" href="./atelie-salta-v2-favicon-c.svg">'),'Approved favicon C required');
 assert(/#17324D/.test(favicon)&&/#166AA6/.test(favicon)&&/>S<\/text>/.test(favicon),'Preserve approved original favicon C artwork');
 assert(controls.includes("id==='C'?'checked'"),'Favicon C must remain selected');
 assert(matrix.includes('Todos presentes')&&matrix.includes('Todos ausentes')&&matrix.includes('Todos realizados')&&matrix.includes('Todos não realizados'),'Direct/bulk attendance/checks must remain');
 assert(matrix.includes('assignCommon')&&matrix.includes('isSpecial')&&matrix.includes('updateSummary'),'03 editing/protection contracts missing');
 assert(html.indexOf('atelie-salta-v2-grade-mask.mjs')<html.indexOf('atelie-salta-v2-matrix.mjs'),'Grade-mask must load before matrix');
 assert(matrix.includes('data-f2-grade-precision')&&matrix.includes('data-f2-grade-input')&&matrix.includes('gradeMask.external')&&matrix.includes('editGradeDigits'),'Inline grade contracts missing');
 assert(!matrix.includes('f2-grade-value')&&!matrix.includes('f2-grade-max'),'Legacy grade popup/editor must not survive');
 assert(mask.includes('BigInt')&&mask.includes('formatScaled')&&mask.includes('manual')&&mask.includes('external'),'Exact integer validation required');
 assert(css.includes('f2-grade-edit')&&css.includes('height:27px')&&css.includes('height:44px'),'Retain compact grade grid density and mobile tap target');
 for(const data of [src,fixture,matrix,mask,controls,ui]){
  assert(!/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b|XMLHttpRequest|indexedDB|getUserMedia|navigator\.serviceWorker/.test(data),'Network, storage, camera or persistence forbidden');
 }
 assert(!/<iframe\b/i.test(html),'No parallel lab or iframe');
 console.log('DESIGN-SALTA-04 SCOPE PASS — Ateliê only, max/precision/mask, 22 decisions, 68 icons, favicon C, 03 direct/bulk and no production writes.');
}catch(error){console.error('DESIGN-SALTA-04 SCOPE BLOCKED:',error.message);process.exitCode=1;}
