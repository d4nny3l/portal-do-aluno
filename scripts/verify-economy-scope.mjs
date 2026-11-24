// #122-only orchestration gate. Does not relax the #120 backend integrity guard.
// The old #120 guard is still mandatory for every PR other than the explicitly
// authorized, print-only #124. Reject any backend, reader, scanner or auth edit.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='ce74c520a464a17ed7fda2991df92f984a04d8e7';
const allowed=new Set([
 '.github/workflows/test-avaliacoes-biblioteca.yml',
 '.github/workflows/test-assessments-embedded.yml',
 '.github/workflows/test-economy-print.yml',
 'corretor/v2/omr/export.mjs',
 'corretor/v2/omr/print-economy.mjs',
 'corretor/v2/tests/card-layout.test.mjs',
 'corretor/v2/tests/economy-print.test.mjs',
 'plataforma/corretor-v2.html',
 'scripts/verify-economy-browser.mjs',
 'scripts/verify-economy-scope.mjs',
 'docs/avaliacoes/IMPRESSAO_ECONOMICA_122.md'
]);
const run=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  if(event.pull_request?.number!==124)throw Error('Only PR #124 may use print-only classification');
 }
 const diff=run('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 if(!diff.length||diff.some(p=>!allowed.has(p))||
    !['plataforma/corretor-v2.html','corretor/v2/omr/export.mjs','corretor/v2/omr/print-economy.mjs'].every(p=>diff.includes(p)))
   throw Error('Not the exact approved #122 print-only delta: '+diff.join(', '));
 // The complete Corrigir cartões markup must match the integrated #121 baseline.
 const former=run('show',base+':plataforma/corretor-v2.html'),now=readFileSync(path.join(root,'plataforma/corretor-v2.html'),'utf8').trim();
 const section=html=>{
  const start=html.indexOf('<section class="corretor-card module-view" id="corrigir">');
  const end=html.indexOf('</section></div></main>',start);
  if(start<0||end<0)throw Error('Corrigir cartões section missing');
  return html.slice(start,end);
 };
 if(section(former)!==section(now))throw Error('Scanner and correction markup changed');
 // Scoring, hash, reader, crypto, Auth, Stats and backend files are forbidden
 // by the exact changed-file allowlist, including workflow and migration code.
 console.log('SALTA #122 print-only scope verified. #120 backend guard remains unchanged and applies to all other PRs.');
}catch(error){console.error('Not print-only #122:',error.message);process.exitCode=1}
