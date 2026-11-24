// #125 strict frontend-only classification, preserving #120 and #122 historical guards.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='14fa328e178bfa359de7177dce51d06283b4fc0c';
const allowed=new Set([
 '.gitattributes',
 'plataforma/tests/corretor-visual-flow.test.mjs',
 '.github/workflows/test-avaliacoes-biblioteca.yml',
 '.github/workflows/test-assessments-embedded.yml',
 '.github/workflows/test-economy-print.yml',
 '.github/workflows/test-direct-pdf.yml',
 'corretor/v2/omr/export.mjs',
 'corretor/v2/omr/print-economy.mjs',
 'corretor/v2/omr/pdf-download.mjs',
 'corretor/v2/tests/card-layout.test.mjs',
 'corretor/v2/tests/economy-print.test.mjs',
 'corretor/v2/tests/pdf-download.test.mjs',
 'plataforma/corretor-v2.html',
 'plataforma/vendor/pdf/jspdf.umd.min.js',
 'plataforma/vendor/pdf/svg2pdf.umd.min.js',
 'plataforma/vendor/pdf/LICENSE.jspdf',
 'plataforma/vendor/pdf/LICENSE.svg2pdf',
 'scripts/verify-economy-browser.mjs',
 'scripts/verify-direct-pdf-browser.mjs',
 'scripts/verify-direct-pdf-scope.mjs',
 'docs/avaliacoes/PDF_DIRETO_125.md'
]);
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  if(event.pull_request?.number!==126)throw Error('Somente PR #126 pode usar classificação PDF #125.');
 }
 const diff=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 if(!diff.length||diff.some(p=>!allowed.has(p))||
  !['plataforma/corretor-v2.html','corretor/v2/omr/pdf-download.mjs','plataforma/vendor/pdf/jspdf.umd.min.js','plataforma/vendor/pdf/svg2pdf.umd.min.js'].every(p=>diff.includes(p)))
   throw Error('Delta fora da allowlist PDF #125: '+diff.join(', '));
 const old=git('show',base+':plataforma/corretor-v2.html'),now=readFileSync(path.join(root,'plataforma/corretor-v2.html'),'utf8').trim();
 const correction=html=>{
  const a=html.indexOf('<section class="corretor-card module-view" id="corrigir">'),b=html.indexOf('</section></div></main>',a);
  if(a<0||b<0)throw Error('Seção de correção não localizada.');
  return html.slice(a,b);
 };
 if(correction(old)!==correction(now))throw Error('Correção/OMR alterados no PR de PDF.');
 if(!now.includes('id="printCard" type="button" class="button-primary">Baixar PDF</button>')||
  now.includes('window.open(')||now.includes('window.print(')||now.includes('openPrintDocument('))
  throw Error('O botão PDF não substituiu completamente o fluxo de janela/impressão.');
 console.log('SALTA #125 PDF frontend scope verified. Historical backend/optical guards unchanged.');
}catch(error){console.error('Bloqueado pelo escopo #125:',error.message);process.exitCode=1;}
