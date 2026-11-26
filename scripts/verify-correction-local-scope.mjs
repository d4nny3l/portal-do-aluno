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
export function verifyCorrectionLocalScope(){
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const e=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(e.repository?.full_name==='d4nny3l/portal-do-aluno'&&e.pull_request?.number===142&&e.pull_request?.head?.ref===branch&&e.pull_request?.base?.ref==='main'&&e.pull_request?.base?.sha===base,'Unauthorized #141 context');
 }
 git('merge-base','--is-ancestor',base,'HEAD');
 const changed=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 assert(changed.length>0&&changed.every(p=>allowed.has(p)),'Unexpected #141 delta: '+changed.filter(p=>!allowed.has(p)).join(','));
 // Protect all runtime components outside the two integration slots and controller.
 assert(!git('diff','--name-only',base,'HEAD','--','corretor/v2/omr','corretor/v2/scan-safe',':(exclude)corretor/v2/scan-safe/tests/protected-sources.test.mjs','laboratorio','auth-worker','stats-worker','assessments-service',':(exclude)assessments-service/tests/correction-local-browser.mjs'),'Protected optical/camera/backend sources changed');
 const p='plataforma/corretor-v2.html',before=execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8'});
 let expected=before.replace('./avaliacoes-biblioteca.mjs?v=20261125auto','./avaliacoes-biblioteca.mjs?v=20261126local01');
 expected=expected.replace(" if(!privateSelection)return scoreWithoutPrivateSelection();"," if(!privateSelection){if(privateModelLoaded){showCameraGrade(null);$('scanScore').hidden=true;return;}return scoreWithoutPrivateSelection();}");
 expected=expected.replace(" const box=$('scanScore'),selectedBound=privateSelection,token=scanContext.current,generation=++scoreGeneration;"," const box=$('scanScore'),selectedBound=privateSelection,token=scanContext.current,generation=++scoreGeneration;\n const binding=privateLibrary?.localCorrectionBinding(selectedBound);\n if(!binding){clearPrivateCorrection();return;}");
 expected=expected.replace('  activeHistoryEntry.count=result.count;renderHistory();','  activeHistoryEntry.count=result.count;activeHistoryEntry.binding=binding;renderHistory();');
 expected=expected.replace(" if(privateLibrary?.requiresSelectionValidation()){\n  const selected=privateSelection,observed=JSON.stringify(activeObservations);\n  blocked('Conferindo avaliação','Validando a seleção no servidor.');\n  return privateLibrary.verifySelection().then(ok=>{\n   if(ok&&privateSelection===selected&&JSON.stringify(activeObservations)===observed)present();\n  }).catch(()=>{if(privateSelection===selected&&scanContext.accepts(token)&&generation===scoreGeneration)clearPrivateCorrection();});\n }else present();"," present(); // Local snapshot only; authorization checks never run from scoring.");
 expected=expected.replace("  const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>2000000)","  const file=event.target.files[0];event.target.value='';if(!file)return;\n  if(privateSelection||privateModelLoaded)throw Error('Descarte a avaliação privada antes de importar outro modelo.');\n  if(file.size>2000000)");
 assert(read(p)===expected,'Official HTML changed outside approved correction binding slots');
 assert(!git('diff','--name-only','HEAD','--')&&!git('ls-files','--others','--exclude-standard'),'Uncommitted candidate');
 console.log('CORRECTION-LOCAL-01 scope PASS — optical, camera, grade presentation and formulas byte-exact');
 return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{verifyCorrectionLocalScope()}catch(e){console.error('Not correction-local scope:',e.message);process.exitCode=1}}
