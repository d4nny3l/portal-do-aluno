// Automatic correction UX: strict incremental scope, no changes to backend or optical sources.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export const base='2e52ba8aea82adaf84e17a7dd9d1188eda44a35e';
const branch='feat/ux-auto-correction-20261125';
const allowed=new Set([
 'plataforma/avaliacoes-biblioteca.mjs','plataforma/avaliacoes-biblioteca.css',
 'plataforma/corretor-v2.html','corretor/v2/assessments/private-library.mjs',
 'plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs','plataforma/tests/corretor-ux-ready-01.test.mjs','plataforma/tests/piloto-avaliacoes-isolado.test.mjs',
 'assessments-service/tests/embedded-browser.mjs','assessments-service/tests/editor-frontend-browser.mjs',
 'assessments-service/test-composition.mjs','scripts/verify-auto-correction-scope.mjs',
 '.github/workflows/test-assessments-embedded.yml','.github/workflows/test-avaliacoes-biblioteca.yml','.github/workflows/test-direct-pdf.yml'
]);
const raw=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'});
const git=(...a)=>raw(...a).trim();
const assert=(x,m)=>{if(!x)throw Error(m)};
const read=p=>readFileSync(path.join(root,p),'utf8');
const historical=p=>raw('show',base+':'+p);
const once=(s,a,b)=>{assert(s.split(a).length===2,'Ambiguous scope anchor '+a.slice(0,100));return s.replace(a,()=>b)};
export function verifyAutoCorrectionScope(){
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const e=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(e.pull_request?.number===137&&e.pull_request?.head?.ref===branch&&e.pull_request?.base?.ref==='main'&&e.pull_request?.base?.sha===base&&e.repository?.full_name==='d4nny3l/portal-do-aluno','Automatic correction scope not authorized for this PR/base');
 }
 git('merge-base','--is-ancestor',base,'HEAD');
 const diff=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 assert(diff.length>0&&diff.every(p=>allowed.has(p))&&diff.includes('plataforma/avaliacoes-biblioteca.mjs')&&diff.includes('plataforma/corretor-v2.html'),'Forbidden incremental delta: '+diff.join(', '));
 assert(!git('diff','--name-only','HEAD','--')&&!git('ls-files','--others','--exclude-standard'),'Unexpected uncommitted files');
 const p='plataforma/corretor-v2.html';
 let html=historical(p);
 html=once(html,'./avaliacoes-biblioteca.mjs?v=20261121ux79c-84-87','./avaliacoes-biblioteca.mjs?v=20261125auto');
 html=once(html,'avaliacoes-biblioteca.css?v=20261121ux79c1','avaliacoes-biblioteca.css?v=20261125auto');
 html=once(html,"$('scanModelStatus').textContent=selection.plan.metadata.title+' · avaliação confirmada para correção. Confira se os cartões pertencem a esta avaliação.';","$('scanModelStatus').textContent=selection.plan.metadata.title;");
 html=once(html,"$('scanModelStatus').textContent='Escolha uma avaliação na aba Criar avaliação para vincular o gabarito.';","$('scanModelStatus').textContent='';");
 html=once(html,"$('scanModelStatus').textContent='Avaliação '+bundle.title+' · Confira se os cartões pertencem a esta avaliação.';","$('scanModelStatus').textContent=privateAssessment?'':bundle.title;");
 html=once(html," applyAssessmentModel({manifest:selection.manifest,title:selection.plan.metadata.title,revision:selection.revision},{privateAssessment:true});",` // The opened/saved immutable model is already installed by the library.
 // Do not rebuild the editor preview or change its export eligibility on binding.
 if(!privateModelLoaded||activeManifest?.contentHash!==selection.manifestHash)
  applyAssessmentModel({manifest:selection.manifest,title:selection.plan.metadata.title,revision:selection.revision},{privateAssessment:true});`);
 assert(html===read(p),'HTML changed outside private title/binding/cache slots');
 const ctl='corretor/v2/assessments/private-library.mjs';
 let controller=historical(ctl);
 controller=once(controller,' let selectionVerification=null;',' // Invalidate a correction key without discarding the opened editor or pending CAS.\n function discardSelection(){s.selection=null;onSelection(null)}\n let selectionVerification=null;');
 controller=once(controller,'  selectIssued,resumeSelection,','  selectIssued,resumeSelection,discardSelection,');
 assert(controller===read(ctl),'Controller changed outside local selection invalidation');
 const css=read('plataforma/avaliacoes-biblioteca.css');
 const originalCss=historical('plataforma/avaliacoes-biblioteca.css');
 const trash=css.match(/^#savedAssessments button\[data-action-icon="delete"\]::before\{[^\n]+\}$/m)?.[0];
 assert(trash?.includes('data:image/svg+xml,')&&trash.includes('mask:url(')&&!trash.includes('content:"×"'),'Missing SVG trash icon');
 assert(once(once(originalCss,'#savedAssessments button[data-action-icon="correct"]::before{content:"✓"}\n',''),'#savedAssessments button[data-action-icon="delete"]::before{content:"×"}',trash)===css,'CSS changed beyond correction/delete icons');
 const ui=read('plataforma/avaliacoes-biblioteca.mjs');
 assert(!/Usar na correção|selectForCorrection/.test(ui)&&ui.includes('confirmAssessmentDeletion({document,title:record.definition.title,opener:deletion})')&&ui.includes('Há alterações não salvas. Deseja descartá-las')&&ui.includes('controller.selectIssued()')&&ui.includes('sameEdit(selectionAttempt)')&&ui.includes('controller.verifySelection()'),'Mandatory selection, confirmation or validation contract missing');
 console.log('Automatic correction incremental scope PASS; optics/camera/PDF/backend/auth/Diário/D1/custody unchanged.');
 return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{verifyAutoCorrectionScope()}catch(e){console.error('Not automatic correction UX:',e.message);process.exitCode=1}}
