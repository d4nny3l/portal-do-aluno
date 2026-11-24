// CAM-FOCUS-01 only. Historical #120/#122/#125 guards remain byte-identical.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='65ca8f4286b6fbbe663e9451ed5978eea4ccb50b';
const allowed=new Set([
 'corretor/v2/omr/camera.mjs',
 'corretor/v2/tests/cam-focus-01.test.mjs',
 'plataforma/corretor-v2.html',
 'plataforma/tests/corretor-camera-progress-p1.test.mjs',
 'plataforma/tests/corretor-camera-torch-ui.test.mjs',
 'plataforma/tests/corretor-omr-camera-cross-integration.test.mjs',
 'plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs',
 '.github/workflows/test-avaliacoes-biblioteca.yml',
 '.github/workflows/test-assessments-embedded.yml',
 '.github/workflows/test-direct-pdf.yml',
 '.github/workflows/test-corretor-integrated.yml',
 'scripts/verify-camera-focus-scope.mjs',
 'scripts/verify-camera-focus-raster.mjs',
 'scripts/verify-camera-focus-browser.mjs',
 'docs/avaliacoes/CAM_FOCUS_01.md'
]);
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const once=(s,a,b)=>{
 if(s.split(a).length!==2)throw Error('Missing or repeated camera-only substitution: '+a.slice(0,80));
 return s.replace(a,()=>b);
};
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const ev=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  if(ev.pull_request?.number!==127||ev.pull_request?.head?.ref!=='fix/cam-focus-01-52')throw Error('PR #127 only');
 }
 git('merge-base','--is-ancestor',base,'HEAD');
 const diff=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 if(diff.some(p=>!allowed.has(p))||!['plataforma/corretor-v2.html','corretor/v2/omr/camera.mjs','corretor/v2/tests/cam-focus-01.test.mjs'].every(p=>diff.includes(p)))throw Error('Forbidden camera delta: '+diff.join(', '));
 // No unrelated working tree edits can escape the committed allowlist.
 const dirty=git('diff','--name-only','HEAD','--');
 if(dirty)throw Error('Unexpected tracked worktree edits: '+dirty);
 const old=git('show',base+':plataforma/corretor-v2.html');
 let now=readFileSync(path.join(root,'plataforma/corretor-v2.html'),'utf8').trim();
 now=once(now,'camera.mjs?v=20261124focus52','camera.mjs?v=20261118wide1');
 now=once(now,'<span id="cameraFocusLabel" hidden><button id="cameraFocus" type="button">Solicitar foco</button></span>','');
 now=once(now,'<label class="camera-check" id="cameraTorchLabel"','<span id="cameraFocusLabel" hidden><button id="cameraFocus" type="button">Focar automaticamente</button></span><label class="camera-check" id="cameraTorchLabel"');
 // Reconstruct only camera implementation slots; all scoring, import,
 // PDF/export, editor, bank, routes and remaining markup must be identical.
 for(const [start,end] of [
  ['function samePosition(','function captureFrameGray()'],
  ['function scanOpticalRank(','function updateCameraInfo()'],
  ['async function startCamera(',"$('cameraTorchButton').onclick="],
  ["$('cameraFocus').onclick=","$('video').addEventListener('resize'"]
 ]){
  const a=now.indexOf(start),z=now.indexOf(end,a+start.length);
  const c=old.indexOf(start),d=old.indexOf(end,c+start.length);
  if(Math.min(a,z,c,d)<0||now.indexOf(start,a+1)!==-1||old.indexOf(start,c+1)!==-1)throw Error('Ambiguous camera slot: '+start);
  now=now.slice(0,a)+old.slice(c,d)+now.slice(z);
 }
 if(now!==old)throw Error('HTML changed outside camera-only slots');
 console.log('CAM-FOCUS-01 exact camera-only scope PASS; all unrelated sources and HTML unchanged vs '+base);
}catch(e){console.error('Not CAM-FOCUS-01:',e.message);process.exitCode=1}
