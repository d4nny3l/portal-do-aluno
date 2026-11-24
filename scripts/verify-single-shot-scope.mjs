// #128: precisely scoped rollback of INT-SCAN-01 only.
// Existing backend/optical/printing guards stay unmodified.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='60c2f2fde75165ecc31afc463cb8c7de084645b1';
const allowed=new Set([
 'plataforma/corretor-v2.html',
 'plataforma/tests/int-scan-01-frame-choice.test.mjs',
 'plataforma/tests/corretor-camera-progress-p1.test.mjs',
 'plataforma/tests/corretor-camera-torch-ui.test.mjs',
 'plataforma/tests/corretor-omr-camera-cross-integration.test.mjs',
 'corretor/v2/tests/embed-align-01.test.mjs',
 '.github/workflows/test-direct-pdf.yml',
 '.github/workflows/test-avaliacoes-biblioteca.yml',
 '.github/workflows/test-assessments-embedded.yml',
 'scripts/verify-single-shot-scope.mjs'
]);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const clean=s=>s.replaceAll("typeof clearScanFrameChoice==='function'&&clearScanFrameChoice();",'')
 .replaceAll("if(typeof clearScanFrameChoice==='function')clearScanFrameChoice()", '')
 .replaceAll("clearScanFrameChoice();",'')
 .replaceAll("clearScanFrameChoice()", '')
 .replaceAll("if(typeof scanSelectionEnabled!=='undefined')scanSelectionEnabled=true;",'')
 .replace(/^[ \t]+$/gm,'').trim();
const assert=(condition,msg)=>{if(!condition)throw Error(msg)};
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const ev=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(ev.pull_request?.number===128&&ev.pull_request?.head?.ref==='fix/rollback-multiframe-52-20261124','Only PR #128 may use this rollback classification.');
 }
 git('merge-base','--is-ancestor',base,'HEAD');
 const diff=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 assert(diff.length>0&&diff.every(p=>allowed.has(p))&&diff.includes('plataforma/corretor-v2.html')&&diff.includes('plataforma/tests/int-scan-01-frame-choice.test.mjs'),'Forbidden rollback delta: '+diff.join(', '));
 assert(!git('diff','--name-only','HEAD','--'),'Uncommitted tracked changes');
 const previous=git('show',base+':plataforma/corretor-v2.html');
 const current=readFileSync(path.join(root,'plataforma/corretor-v2.html'),'utf8');
 const before='function samePosition(',after='function updateCameraInfo(){';
 for(const anchor of [before,after]){
  assert(previous.split(anchor).length===2&&current.split(anchor).length===2,'Ambiguous anchor: '+anchor);
 }
 const previousPrefix=previous.slice(0,previous.indexOf(before));
 const currentPrefix=current.slice(0,current.indexOf(before));
 const previousSuffix=previous.slice(previous.indexOf(after));
 const currentSuffix=current.slice(current.indexOf(after));
 assert(clean(previousPrefix)===clean(currentPrefix),'Unexpected edit outside camera (prefix)');
 assert(clean(previousSuffix)===clean(currentSuffix),'Unexpected edit outside camera (suffix)');
 const oldBeginning=previous.slice(previous.indexOf(before),previous.indexOf('// INT-SCAN-01:'));
 const newBeginning=current.slice(current.indexOf(before),current.indexOf('// Single-shot camera path:'));
 assert(oldBeginning===newBeginning,'Safe camera mapping and final capture helper changed');
 const scanner=current.slice(current.indexOf('function scanCameraFrame(){'),current.indexOf(after));
 const mandatory=['stableFrames>=2','captureQuality(capture,actual,capture)','manualCorners:actual.corners',
  'mapFramePoints(detection.corners,frame,capture)','waitingForRemoval','absentFrames>=3',
  "detectFiducials(capture.gray,capture.width,capture.height,{manifest:"];
 assert(mandatory.every(v=>scanner.includes(v)),'Missing required final optical verification or removal protection');
 assert(!/scanBestFrame|sampleScanFrame|scanOpticalRank|scanValidFrame|scanSelectionEnabled|stableFrames>=3/.test(current),
  'Old multiframe selector or three-confirmation wait remains');
 assert(/stableFrames\+'\/2\)/.test(current),'Two-confirmation guidance missing');
 console.log('SALTA #128 rollback single-shot scope verified; backend, reader, geometry, manifest, PDF and library unchanged.');
}catch(error){console.error('Not single-shot rollback #128:',error.message);process.exitCode=1;}
