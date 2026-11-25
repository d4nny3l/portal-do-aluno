// PR #138 candidate only. Does not authorize or perform any deployment.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='195585572bdcefee809981aada4ee7614b7e023f',initial='7309f448a48d5e522232080b613b157d3caa1503';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const read=p=>readFileSync(new URL(p,new URL('../',import.meta.url)),'utf8');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export function verifyScanIntegrationScope(){
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const e=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(e.pull_request?.number===138&&e.pull_request.head.ref==='draft/scan-safe-v2-integration'&&
   e.pull_request.base.ref==='main'&&e.pull_request.base.sha===base&&e.repository.full_name==='d4nny3l/portal-do-aluno','Unauthorized Scan PR/base');
 }
 git('merge-base','--is-ancestor',initial,'HEAD');
 const exact=new Set([
  '.gitignore',
  'docs/SALTA_SCAN_SAFE_V2_DOSSIE_INTEGRACAO_20261125.md',
  'laboratorio/salta-omr-scan-safe-02/integration/single-optical.mjs','laboratorio/salta-omr-scan-safe-02/integration/single-optical.test.mjs',
  'corretor/v2/assessments/block-scoring.mjs','corretor/v2/tests/worker.test.mjs','corretor/v2/tests/embed-align-01.test.mjs',
  'plataforma/corretor-v2.html','plataforma/corretor-v2.css',
  'plataforma/tests/piloto-avaliacoes-isolado.test.mjs','plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs',
  'plataforma/tests/corretor-stale-grade-audit-p1.test.mjs','plataforma/tests/corretor-camera-torch-ui.test.mjs',
  'plataforma/tests/corretor-camera-progress-p1.test.mjs','plataforma/tests/corretor-omr-camera-cross-integration.test.mjs',
  'plataforma/tests/int-scan-01-frame-choice.test.mjs','plataforma/tests/corretor-interface.test.mjs',
  'plataforma/tests/corretor-visual-flow.test.mjs','plataforma/tests/corretor-ux-ready-01.test.mjs',
  'scripts/verify-scan-integration-scope.mjs','assessments-service/tests/embedded-browser.mjs','assessments-lab/tests/editor-contract.test.mjs','assessments-lab/tests/pr38-revisions.test.mjs',
  'plataforma/tests/corretor-review-suggestions.test.mjs',
  '.github/workflows/test-corretor-integrated.yml','.github/workflows/test-assessments-embedded.yml',
  '.github/workflows/test-avaliacoes-biblioteca.yml','.github/workflows/test-direct-pdf.yml',
 ]);
 const changed=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 assert(changed.length>3&&changed.every(p=>exact.has(p)||p.startsWith('corretor/v2/scan-safe/')),'Forbidden Scan delta: '+changed.join(', '));
 assert(!git('diff','--name-only','HEAD','--')&&!git('ls-files','--others','--exclude-standard'),'Uncommitted candidate changes');
 const protectedPaths=['assessments-service','stats-worker','auth-worker','private-pilot','corretor/v2/omr',
  'plataforma/avaliacoes-biblioteca.mjs','plataforma/avaliacoes-biblioteca.css','.github/workflows/deploy-salta-auth.yml','.github/workflows/deploy-salta-stats.yml'];
 assert(!git('diff','--name-only',base,'HEAD','--',...protectedPaths,':(exclude)assessments-service/tests/embedded-browser.mjs'),'Production/optical/library runtime changed');
 for(const p of exact)if(p.startsWith('laboratorio/')||p.startsWith('docs/'))assert(git('rev-parse','HEAD:'+p)===git('rev-parse',initial+':'+p),'Frozen initial dossier/adapter changed');
 const frozen=git('ls-tree','-r','--name-only',base,'--','laboratorio/salta-omr-scan-safe-02').split('\n');
 for(const p of frozen)assert(git('rev-parse','HEAD:'+p)===git('rev-parse',base+':'+p),'Frozen lab changed: '+p);
 const html=read('plataforma/corretor-v2.html'),auth=s=>s.slice(s.indexOf('<script>'),s.indexOf('<script type="module">'));
 assert(auth(html)===auth(execFileSync('git',['show',base+':plataforma/corretor-v2.html'],{cwd:root,encoding:'utf8'})),'Official authentication block changed');
 assert(!/readRaster\(|reconcile\(|new CameraSession|setInterval\(/.test(html),'Old/dual main-thread camera path restored');
 assert(html.includes('createSafeCamera(')&&html.includes('scanWorker.process(')&&html.includes('scanContext.accepts(result.token)'),'Capture binding missing');
 console.log('SCAN #138 scope PASS: frozen lab/optics/backend/Auth/Diário/library preserved; candidate only, G3 optical safety blocked.');
 return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{verifyScanIntegrationScope();}catch(e){console.error('Not Scan integration scope:',e.message);process.exitCode=1;}}
