import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {filenameForPdf,PDF_DOWNLOAD_VERSION,getPdfRuntime} from '../omr/pdf-download.mjs';
import {createTemplate} from '../omr/template.mjs';
import {createCardManifest,DEFAULT_CARD_HEADER} from '../omr/render.mjs';
import {planEconomySheet,buildEconomySheetSvg} from '../omr/print-economy.mjs';
import {renderTemplateSvg} from '../omr/render.mjs';

const root=new URL('../../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const blobHash=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');

test('PDF export identifies legitimate MIME filenames and keeps vendors fully offline and pinned',async()=>{
 assert.equal(PDF_DOWNLOAD_VERSION,'salta-vector-pdf-download-v1');
 assert.equal(filenameForPdf(),'cartao-respostas-a4.pdf');
 assert.equal(filenameForPdf({economyCopies:2}),'cartao-respostas-2-por-a4.pdf');
 assert.equal(filenameForPdf({economyCopies:4}),'cartao-respostas-4-por-a4.pdf');
 assert.equal(filenameForPdf({economyCopies:4,batch:true}),'cartoes-resposta-lote.pdf');
 const files=[['plataforma/vendor/pdf/jspdf.umd.min.js','0e600d49d2b2bf81dd97c1509e22d108c2ddd3b4'],
  ['plataforma/vendor/pdf/svg2pdf.umd.min.js','14cc33e1641818d84ebae6202ca4ba48aee68dfc']];
 for(const [path,sha] of files)assert.equal(blobHash(read(path)),sha,'vendor file integrity '+path);
 assert.match(read('plataforma/vendor/pdf/LICENSE.jspdf'),/Permission is hereby granted/);
 assert.match(read('plataforma/vendor/pdf/LICENSE.svg2pdf'),/MIT License/);
 const src=read('corretor/v2/omr/pdf-download.mjs');
 assert.match(src,/new URL\(path,import\.meta\.url\)/);
 assert.match(src,/application\/pdf/);
 assert.doesNotMatch(src,/https?:\/\/|window\.print|window\.open|\bfetch\(/);
 await assert.rejects(()=>getPdfRuntime(),/navegador/);
});
test('PDF buttons never open print windows, preserve synchronous busy lock and existing batch order selection',()=>{
 const page=read('plataforma/corretor-v2.html');
 assert.match(page,/id="printCard"[^>]*>Baixar PDF<\/button>/);
 assert.match(page,/id="printBatch"[^>]*>Baixar PDF do lote<\/button>/);
 assert.match(page,/Gerando PDF…/);
 assert.match(page,/if\(pdfBusy\)return;/);
 assert.match(page,/createDownload\(pdf,filenameForPdf/);
 assert.match(page,/selectStudentPages\(ordered,\$\('batchPages'\)\.value\)/);
 assert.doesNotMatch(page,/window\.open\(|window\.print\(|openPrintDocument\(/);
 const editor=read('corretor/v2/assessments/editor-snapshot.mjs');
 assert.doesNotMatch(editor,/economyCopies|pdfBusy/);
});
test('PDF geometry reuses the exact #124 vector composition without modifying source manifest/hash',()=>{
 const sections=[{sectionId:'section-1',type:'A-D',label:'SINTÉTICO',order:0,count:5,
  items:Array.from({length:5},(_,i)=>({questionId:'question-'+(i+1),type:'A-D',number:i+1,originalOrder:i+1}))}];
 const header={...DEFAULT_CARD_HEADER,institution:'Escola sintética',visible:{...DEFAULT_CARD_HEADER.visible}};
 const template=createTemplate(sections,{layoutVersion:'v2',revision:8,mode:'embedded',identityMode:'none',embeddedSize:{widthMm:120,heightMm:180},metadata:{...header}});
 const manifest=createCardManifest(template,header,{sectionFrameStyle:'content'}),before=JSON.stringify(manifest);
 for(const count of [2,4]){
  const plan=planEconomySheet(manifest,count);
  const sheet=buildEconomySheetSvg({template,manifest,header,copies:count,renderSvg:renderTemplateSvg});
  assert.deepEqual(sheet.plan,plan);
  assert.equal((sheet.svg.match(/data-economy-copy="\d+"/g)||[]).length,count);
  assert.equal((sheet.svg.match(/data-layout-hash="/g)||[]).length,count);
  assert.equal((sheet.svg.match(/data-economy-scissors="true"/g)||[]).length,1);
  assert.equal((sheet.svg.match(/data-economy-cut="/g)||[]).length,count===2?1:2);
 }
 assert.equal(JSON.stringify(manifest),before);
});
