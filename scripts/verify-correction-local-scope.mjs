// Issue #141, post-squash baseline. No production deployment.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='d5eac2f4d6c0389058ba5061bf2851ec5680f55c';
const branch='feat/correction-local-01';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const allowed=new Set(["corretor/v2/assessments/correction-context.mjs","corretor/v2/assessments/private-library.mjs","corretor/v2/scan-safe/tests/protected-sources.test.mjs","plataforma/avaliacoes-biblioteca.mjs","plataforma/corretor-v2.html","plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs","plataforma/tests/corretor-omr-camera-cross-integration.test.mjs","plataforma/tests/corretor-stale-grade-audit-p1.test.mjs","plataforma/tests/piloto-avaliacoes-isolado.test.mjs","plataforma/tests/int-scan-01-frame-choice.test.mjs","plataforma/tests/correction-context.test.mjs","scripts/verify-correction-local-scope.mjs",".github/workflows/test-assessments-embedded.yml",".github/workflows/test-avaliacoes-biblioteca.yml",".github/workflows/test-direct-pdf.yml",".github/workflows/test-corretor-integrated.yml","docs/avaliacoes/CORRECTION_LOCAL_01.md","assessments-service/tests/correction-local-browser.mjs"]);
// Shared exact historical transformation. Do not replace with a permissive pattern.
export function expectedCorrectionLocalHtml(before){
 let expected=before.replace('./avaliacoes-biblioteca.mjs?v=20261125auto','./avaliacoes-biblioteca.mjs?v=20261126local01');
 expected=expected.replace(" if(!privateSelection)return scoreWithoutPrivateSelection();"," if(!privateSelection){if(privateModelLoaded){showCameraGrade(null);$('scanScore').hidden=true;return;}return scoreWithoutPrivateSelection();}");
 expected=expected.replace(" const box=$('scanScore'),selectedBound=privateSelection,token=scanContext.current,generation=++scoreGeneration;"," const box=$('scanScore'),selectedBound=privateSelection,token=scanContext.current,generation=++scoreGeneration;\n const binding=privateLibrary?.localCorrectionBinding(selectedBound);\n if(!binding){clearPrivateCorrection();return;}");
 expected=expected.replace('  activeHistoryEntry.count=result.count;renderHistory();','  activeHistoryEntry.count=result.count;activeHistoryEntry.binding=binding;renderHistory();');
 expected=expected.replace(" if(privateLibrary?.requiresSelectionValidation()){\n  const selected=privateSelection,observed=JSON.stringify(activeObservations);\n  blocked('Conferindo avaliação','Validando a seleção no servidor.');\n  return privateLibrary.verifySelection().then(ok=>{\n   if(ok&&privateSelection===selected&&JSON.stringify(activeObservations)===observed)present();\n  }).catch(()=>{if(privateSelection===selected&&scanContext.accepts(token)&&generation===scoreGeneration)clearPrivateCorrection();});\n }else present();"," present(); // Local snapshot only; authorization checks never run from scoring.");
 expected=expected.replace("  const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>2000000)","  const file=event.target.files[0];event.target.value='';if(!file)return;\n  if(privateSelection||privateModelLoaded)throw Error('Descarte a avaliação privada antes de importar outro modelo.');\n  if(file.size>2000000)");
 return expected;
}
export function assertHistoricalCorrectionContext(e){
 assert(e.repository?.full_name==='d4nny3l/portal-do-aluno'&&e.pull_request?.number===142&&e.pull_request?.head?.ref===branch&&e.pull_request?.base?.ref==='main'&&e.pull_request?.base?.sha===base,'Unauthorized #141 context');
}
export function verifyCorrectionLocalScope(){
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const e=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assertHistoricalCorrectionContext(e);
 }
 git('merge-base','--is-ancestor',base,'HEAD');
 const changed=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 assert(changed.length>0&&changed.every(p=>allowed.has(p)),'Unexpected #141 delta: '+changed.filter(p=>!allowed.has(p)).join(','));
 // Protect all runtime components outside the two integration slots and controller.
 assert(!git('diff','--name-only',base,'HEAD','--','corretor/v2/omr','corretor/v2/scan-safe',':(exclude)corretor/v2/scan-safe/tests/protected-sources.test.mjs','laboratorio','auth-worker','stats-worker','assessments-service',':(exclude)assessments-service/tests/correction-local-browser.mjs'),'Protected optical/camera/backend sources changed');
 const p='plataforma/corretor-v2.html',before=execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8'});
 const expected=expectedCorrectionLocalHtml(before);
 assert(read(p)===expected,'Official HTML changed outside approved correction binding slots');
 assert(!git('diff','--name-only','HEAD','--')&&!git('ls-files','--others','--exclude-standard'),'Uncommitted candidate');
 console.log('CORRECTION-LOCAL-01 scope PASS — optical, camera, grade presentation and formulas byte-exact');
 return true;
}

// Permanent post-squash integrity is distinct from permission to use the
// historical #142 CI fast path. The CLI below remains historical-only.
const squash='b8968b70b7eebbe4d34b29acdb0336ba5e568f20';
const pins=Object.freeze({
 'corretor/v2/assessments/correction-context.mjs':'b09c5c2642708d2f3e0f5400195743ec3d08cb49',
 'corretor/v2/assessments/private-library.mjs':'0184d9b9dda51e4c8371430d574cabe7a17c3c31',
 'plataforma/avaliacoes-biblioteca.mjs':'7a1316bd37b062dde7a32a2d37cf68fe13cc3da3',
 'plataforma/corretor-v2.html':'cbd32c090562bd59409f97733e75221f725d8ee3'
});
const historicProtected=['corretor/v2/omr','corretor/v2/scan-safe',':(exclude)corretor/v2/scan-safe/tests/protected-sources.test.mjs','laboratorio','auth-worker','stats-worker','assessments-service',':(exclude)assessments-service/tests/correction-local-browser.mjs'];
// Freeze full integrated optical/assessment trees, backend, presentation and
// private-library transport. Only the two explicitly authorized test files
// may evolve in this protected subtree; the guard itself is outside it.
const integratedProtected=['corretor/v2','laboratorio','auth-worker','stats-worker','assessments-service','plataforma/corretor-v2.html','plataforma/corretor-v2.css','plataforma/avaliacoes-biblioteca.mjs','plataforma/avaliacoes-biblioteca.css',':(exclude)corretor/v2/scan-safe/tests/protected-sources.test.mjs',':(exclude)corretor/v2/scan-safe/tests/correction-local-integrated-guard.test.mjs'];
const list=(...args)=>git(...args).split('\0').filter(Boolean);
const diffNames=(a,b,paths=[])=>list('diff','--no-ext-diff','--no-renames','--name-only','-z',a,b,'--',...paths);
const ancestor=(a,b)=>{try{git('merge-base','--is-ancestor',a,b);return true}catch(e){if(e.status===1)return false;throw e}};
const blobAt=(rev,p)=>git('rev-parse',rev+':'+p);
const fileBlob=p=>git('hash-object','--no-filters','--',p);
const show=(rev,p)=>execFileSync('git',['show',rev+':'+p],{cwd:root,encoding:'utf8'});
// Pure evidence validation for isolated counterexamples. The production
// entry point always collects its own evidence from the actual checkout.
export function assertCorrectionLocalIntegratedEvidence(e){
 assert(e.squashParents===squash+' '+base&&e.baseAncestor&&e.squashAncestor,'Invalid #141 integrated ancestry');
 assert(e.historicalDelta.length===allowed.size&&new Set(e.historicalDelta).size===allowed.size&&e.historicalDelta.every(p=>allowed.has(p)),'Invalid #141 historical delta (expected exact 18 paths)');
 assert(e.historicalProtectedDelta.length===0,'Protected optical/camera/backend sources changed in historical #141 delta');
 const expected=expectedCorrectionLocalHtml(e.baseHtml);
 assert(e.squashHtml===expected,'Integrated squash HTML differs from approved correction slots');
 assert(e.headHtml===expected&&e.worktreeHtml===expected,'Integrated correction HTML rollback or unauthorized slot change');
 for(const [p,pin] of Object.entries(pins)){
  assert(e.squashBlobs[p]===pin,'Invalid #141 squash pin: '+p);
  assert(e.headBlobs[p]===pin&&e.worktreeBlobs[p]===pin,'Integrated correction module changed or rolled back: '+p);
 }
 assert(e.protectedDelta.length===0,'Integrated protected sources changed: '+e.protectedDelta.join(','));
 assert(e.protectedWorktreeDelta.length===0&&e.protectedIndexDelta.length===0&&e.protectedUntracked.length===0,'Uncommitted protected sources changed: '+[...e.protectedWorktreeDelta,...e.protectedIndexDelta,...e.protectedUntracked].join(','));
 return true;
}
export function collectCorrectionLocalIntegratedEvidence(){
 const p='plataforma/corretor-v2.html';
 const blobs=fn=>Object.fromEntries(Object.keys(pins).map(p=>[p,fn(p)]));
 return {
  squashParents:git('rev-list','--parents','-n','1',squash),
  baseAncestor:ancestor(base,squash),squashAncestor:ancestor(squash,'HEAD'),
  historicalDelta:diffNames(base,squash),historicalProtectedDelta:diffNames(base,squash,historicProtected),
  baseHtml:show(base,p),squashHtml:show(squash,p),headHtml:show('HEAD',p),worktreeHtml:read(p),
  squashBlobs:blobs(p=>blobAt(squash,p)),headBlobs:blobs(p=>blobAt('HEAD',p)),worktreeBlobs:blobs(fileBlob),
  protectedDelta:diffNames(squash,'HEAD',integratedProtected),
  protectedWorktreeDelta:list('diff','--no-ext-diff','--no-renames','--name-only','-z','HEAD','--',...integratedProtected),
  protectedIndexDelta:list('diff','--cached','--no-ext-diff','--no-renames','--name-only','-z','HEAD','--',...integratedProtected),
  protectedUntracked:list('ls-files','--others','--exclude-standard','-z','--',...integratedProtected)
 };
}
export function verifyCorrectionLocalIntegrated(){
 assertCorrectionLocalIntegratedEvidence(collectCorrectionLocalIntegratedEvidence());
 console.log('CORRECTION-LOCAL-01 integrated PASS — exact squash ancestry, historical 18/18 delta, slots, pins and protected trees');
 return true;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){try{verifyCorrectionLocalScope()}catch(e){console.error('Not correction-local scope:',e.message);process.exitCode=1}}
