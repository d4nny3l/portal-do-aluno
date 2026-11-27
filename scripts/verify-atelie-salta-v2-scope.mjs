// DESIGN-SALTA-05 · Issue #153, base autorizada e guard cumulativo 02/03/04.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const main='3f844540296e69074af0746d755526d2d9418bf4';
const branch='feat/design-salta-05-header-bulk-picker';
const allowed=new Set([
 '.github/workflows/test-atelie-salta-v2.yml',
 'plataforma/atelie-salta-v2-matrix.mjs',
 'plataforma/atelie-salta-v2-calendar.mjs',
 'plataforma/atelie-salta-v2-controls.mjs',
 'plataforma/atelie-salta-v2-compositions.mjs',
 'plataforma/atelie-salta-v2-fidelity.css',
 'plataforma/tests/atelie-salta-v2-fidelity.test.mjs',
 'plataforma/tests/atelie-salta-v3.test.mjs',
 'plataforma/tests/atelie-salta-v5.test.mjs',
 'scripts/verify-atelie-salta-v2-03-browser.mjs',
 'scripts/verify-atelie-salta-v2-04-browser.mjs',
 'scripts/verify-atelie-salta-v2-fidelity-browser.mjs',
 'scripts/verify-atelie-salta-v2-05-browser.mjs',
 'scripts/verify-atelie-salta-v2-scope.mjs',
 'plataforma/atelie-salta-v5-audit.md'
]);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const assert=(condition,message)=>{if(!condition)throw Error(message)};
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const ev=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(ev.pull_request?.head?.ref===branch,'Wrong branch');
  assert(ev.pull_request?.base?.ref==='main','PR must target main');
  assert(ev.pull_request?.draft===true,'PR must remain DRAFT');
  assert(ev.pull_request?.head?.sha===git('rev-parse','HEAD'),'Must inspect actual pull request HEAD, not synthetic merge');
 }
 git('merge-base','--is-ancestor',main,'HEAD');
 const diff=git('diff','--name-only',main,'HEAD','--').split('\n').filter(Boolean);
 assert(!diff.some(p=>!allowed.has(p)),'Changes outside Ateliê: '+diff.filter(p=>!allowed.has(p)).join(', '));
 for(const required of [
  'plataforma/atelie-salta-v2-matrix.mjs','plataforma/atelie-salta-v2-calendar.mjs',
  'plataforma/atelie-salta-v2-controls.mjs','plataforma/atelie-salta-v2-compositions.mjs',
  'plataforma/atelie-salta-v2-fidelity.css','plataforma/tests/atelie-salta-v5.test.mjs',
  'scripts/verify-atelie-salta-v2-05-browser.mjs','scripts/verify-atelie-salta-v2-03-browser.mjs',
  '.github/workflows/test-atelie-salta-v2.yml','scripts/verify-atelie-salta-v2-scope.mjs'
 ])assert(diff.includes(required),'Required file missing: '+required);
 assert(!git('diff','--name-only','HEAD','--'),'Dirty working tree');
 git('diff','--check',main,'HEAD','--');
 const read=p=>readFileSync(root+'/'+p,'utf8');
 const html=read('plataforma/atelie-salta.html');
 const fixture=read('plataforma/atelie-salta-v2-fixtures.mjs');
 const controls=read('plataforma/atelie-salta-v2-controls.mjs');
 const composition=read('plataforma/atelie-salta-v2-compositions.mjs');
 const matrix=read('plataforma/atelie-salta-v2-matrix.mjs');
 const calendar=read('plataforma/atelie-salta-v2-calendar.mjs');
 const src=read('plataforma/atelie-salta-v2.mjs');
 const css=read('plataforma/atelie-salta-v2-fidelity.css');
 const mask=read('plataforma/atelie-salta-v2-grade-mask.mjs');
 const sprite=read('plataforma/atelie-salta-v2-icons.svg');
 const favicon=read('plataforma/atelie-salta-v2-favicon-c.svg');
 assert((html.match(/role="tabpanel"/g)||[]).length===6,'Six Ateliê tabs must be retained');
 assert((sprite.match(/<symbol id="v2-/g)||[]).length===68,'68 original symbols must be retained');
 assert(fixture.includes('15.22')&&fixture.includes('15.1')&&src.includes('15.22'),'22 original concepts must remain');
 assert(html.includes('<link rel="icon" type="image/svg+xml" href="./atelie-salta-v2-favicon-c.svg">'),'Favicon C unchanged');
 assert(/#17324D/.test(favicon)&&/#166AA6/.test(favicon)&&/>S<\/text>/.test(favicon),'Favicon C graphic unchanged');
 assert(controls.includes("id==='C'?'checked'"),'Favicon C selection unchanged');
 assert(matrix.includes("Todos presentes")&&matrix.includes("Todos ausentes")&&matrix.includes("Todos fizeram")&&matrix.includes("Todos não fizeram"),'All direct bulk actions required');
 assert(matrix.includes("data-f2-col-target")&&matrix.includes("f2-head-bulk")&&matrix.includes("icon(a.symbol)"),'Per-column icon actions missing');
 assert(matrix.includes("bulk('attendance',col,")&&matrix.includes("bulk('checks',col,"),'No intermediate selector permitted');
 assert(!matrix.includes('data-f2-activity-select'),'Remove redundant activity selector');
 assert(matrix.includes('assignCommon')&&matrix.includes('isSpecial')&&matrix.includes('updateSummary')&&matrix.includes('attendance.confirmed[j]=false'),'Previous bulk, exception and confirmation rules retained');
 assert(matrix.includes('data-f2-grade-precision')&&matrix.includes('data-f2-grade-input')&&matrix.includes('gradeMask.external')&&matrix.includes('editGradeDigits'),'DESIGN-04 manual grade editing retained');
 assert(!matrix.includes('f2-grade-value')&&!matrix.includes('f2-grade-max'),'No legacy grade popup');
 assert(mask.includes('BigInt')&&mask.includes('formatScaled')&&mask.includes('manual')&&mask.includes('external'),'Exact grade validation retained');
 assert(css.includes('f2-grade-edit')&&css.includes('height:27px')&&css.includes('height:44px')&&css.includes('f2-picker-overlay'),'Original density + modal CSS');
 assert(controls.includes('F.openPickerModal(root')&&composition.includes('F.openPickerModal('),'Every demonstrated date picker must share a modal');
 assert(calendar.includes('aria-modal="true"')&&calendar.includes('role="dialog"')&&calendar.includes("document.addEventListener('focusin',focusin,true)"),'Modal aria semantics and focus trap required');
 assert(calendar.includes("portal.className='f2-app f2-picker-portal'")&&calendar.includes('body.appendChild(portal)')&&calendar.includes('portal.remove()'),'Modal must use ephemeral root portal outside transformed tab panels');
 assert(calendar.includes("overlay.addEventListener('keydown',keydown)")&&calendar.includes("e.key==='Escape'")&&calendar.includes('triggerEl.focus'),'Escape and focus restoration required');
 assert(calendar.includes("onClear:()=>{}")&&calendar.includes('onConfirm:next=>dismiss(true,next)'),'Draft clear / explicit confirm required');
 const baseCalendar=git('show',main+':plataforma/atelie-salta-v2-calendar.mjs');
 const agendaCode=s=>s.slice(s.indexOf(' function mountCalendar('),s.indexOf(' function mountPicker('));
 assert(agendaCode(calendar)===agendaCode(baseCalendar),'Monthly/weekly/daily agenda must be byte-identical to authorized main');
 for(const data of [src,fixture,matrix,mask,controls,composition,calendar]){
  assert(!/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b|XMLHttpRequest|indexedDB|getUserMedia|navigator\.serviceWorker/.test(data),'Forbidden storage, camera or network');
 }
 assert(!/<iframe\b/i.test(html),'No parallel Ateliê');
 console.log('DESIGN-SALTA-05 SCOPE PASS — column-scoped actions, reusable modal, agenda byte-identical, grade masks and 22/68/C preserved');
}catch(error){console.error('DESIGN-SALTA-05 SCOPE BLOCKED:',error.message);process.exitCode=1;}
