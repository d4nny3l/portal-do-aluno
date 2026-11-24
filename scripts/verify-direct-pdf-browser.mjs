// #125: true PDF download, PDF parsing and optical-vector verification in hermetic Chromium.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const pdfLib=await import(process.env.SALTA_PDFLIB_MODULE||'pdf-lib');
const PDFDocument=pdfLib.PDFDocument||pdfLib.default?.PDFDocument;
const {chromium}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const pdfjs=await import(process.env.SALTA_PDFJS_MODULE||'pdfjs-dist/legacy/build/pdf.mjs');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.join(root,'tmp/direct-pdf-evidence');
mkdirSync(output,{recursive:true});
const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev';
const failures=[],network=[],report={issue:125,base:'14fa328e178bfa359de7177dce51d06283b4fc0c',
 synthetic:true,realBackendRequests:0,putRequests:0,popups:0,printCalls:0,cases:[],failures};
const browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run','--host-resolver-rules=MAP * 0.0.0.0','--no-proxy-server']});
function nearly(a,b,tolerance=.06){return Math.abs(a-b)<=tolerance}
function inPt(mm){return mm*72/25.4}
async function auditPdf(bytes,{pages=1,landscape=false,minPaths=10,hasText=null}={}){
 assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
 assert(bytes.length>1200);
 const parsed=await PDFDocument.load(bytes,{updateMetadata:false});
 assert.equal(parsed.getPageCount(),pages,'PDF page count');
 const info=[];
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true});
 const pdf=await task.promise;
 try{
  assert.equal(pdf.numPages,pages,'Independent PDF parser page count');
  for(let n=1;n<=pages;n++){
   const page=await pdf.getPage(n);
   const pageBox=parsed.getPage(n-1).getSize();
   const expected=landscape?[inPt(297),inPt(210)]:[inPt(210),inPt(297)];
   assert(nearly(pageBox.width,expected[0])&&nearly(pageBox.height,expected[1]),
    'A4 physical MediaBox mismatch '+JSON.stringify({pageBox,expected}));
   const ops=await page.getOperatorList();
   const paths=ops.fnArray.filter(op=>op===pdfjs.OPS.constructPath).length;
   const textItems=(await page.getTextContent()).items.map(x=>x.str).join(' ');
   assert(paths>=minPaths,'Insufficient vector paths: '+paths);
   if(hasText)assert(textItems.toUpperCase().includes(hasText.toUpperCase()),
    'Missing PDF text '+hasText+': '+textItems.slice(0,300));
   info.push({page:n,physicalPoints:pageBox,vectorPaths:paths,textSample:textItems.slice(0,120)});
  }
 }finally{await pdf.destroy();}
 return info;
}
async function createContext(){
 const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'pt-BR',acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  network.push(req.method()+' '+url.pathname);
  try{
   if(url.origin===api){
    // Reject any unanticipated production endpoint even though requests never leave this process.
    const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
    const responses={
     '/auth/session':{authenticated:true},
     '/assessments/v1/session':{authenticated:true,principalId:'pdf-local-synthetic',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'},
     '/assessments/v1/grants':{grants:[]}
    };
    if(req.method()!=='GET'||!(url.pathname in responses))throw Error('Unexpected API request '+req.method()+' '+url.pathname);
    return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify(responses[url.pathname])});
   }
   if(url.origin===origin&&url.pathname.startsWith('/portal-do-aluno/')){
    const local=path.resolve(root,decodeURIComponent(url.pathname.slice('/portal-do-aluno/'.length)));
    if(!local.startsWith(root+path.sep)||!existsSync(local))return route.fulfill({status:404,body:'Asset missing in candidate'});
    const types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
    return route.fulfill({status:200,contentType:types[path.extname(local)]||'application/octet-stream',body:readFileSync(local)});
   }
   throw Error('External resource blocked '+req.url());
  }catch(error){failures.push(error.message);return route.abort();}
 });
 await context.addInitScript(()=>{
  const originalFetch=window.fetch.bind(window);
  window.fetch=(resource,options)=>{
   const url=String(typeof resource==='string'?resource:resource?.url||resource);
   const response=body=>Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}}));
   if(url.endsWith('/auth/session'))return response({authenticated:true});
   if(url.endsWith('/assessments/v1/session'))return response({authenticated:true,principalId:'pdf-local-synthetic',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'});
   if(url.endsWith('/assessments/v1/grants'))return response({grants:[]});
   return originalFetch(resource,options);
  };
  window.__pdfPrintCalls=0;
  window.print=()=>{window.__pdfPrintCalls++;};
 });
 return context;
}
async function downloadPdf(p,{button='printCard',filename,outputName,landscape=false,pages=1,minPaths=10,hasText=null}){
 const before=await p.locator('#preview svg').getAttribute('data-layout-hash');
 const event=p.waitForEvent('download',{timeout:120000});
 await p.locator('#'+button).click();
 const download=await event;
 assert.equal(download.suggestedFilename(),filename);
 const bytes=readFileSync(await download.path());
 const infos=await auditPdf(bytes,{pages,landscape,minPaths,hasText});
 const after=await p.locator('#preview svg').getAttribute('data-layout-hash');
 assert.equal(after,before,'PDF download must not recompose the optical manifest');
 writeFileSync(path.join(output,outputName+'.pdf'),bytes);
 const status=(await p.locator('#buildStatus').innerText());
 assert.match(status,/PDF gerado|Download iniciado/);
 assert.equal(await p.locator('#'+button).isDisabled(),false,'Busy state should be restored');
 return {name:outputName,filename,bytes:bytes.length,infos,manifestHash:before};
}
async function navigate(p,id){await p.locator('nav.module-nav [data-view="'+id+'"]').click();}
async function openIdentity(p){if(await p.locator('#identitySettings').getAttribute('open')===null)await p.locator('#identitySettings summary').click();}
async function closeIdentity(p){if(await p.locator('#identitySettings').getAttribute('open')!==null)await p.locator('#identitySettings summary').click();}
const ctx=await createContext();
let p;
try{
 p=await ctx.newPage();
 p.on('pageerror',e=>failures.push('page: '+e.message));
 p.on('popup',()=>{report.popups++});
 p.on('dialog',d=>{report.printCalls++;d.dismiss()});
 await p.goto(origin+'/portal-do-aluno/plataforma/corretor-v2.html');
 await p.waitForFunction(()=>document.body.classList.contains('salta-auth-ready'));
 assert.equal(await p.locator('#printCard').innerText(),'Baixar PDF');
 await p.locator('#assessmentTitle').fill('AVALIAÇÃO SINTÉTICA');
 await p.locator('#assessmentSubject').fill('Matemática');
 await p.locator('#assessmentClass').fill('Turma de teste');
 await p.locator('#assessmentDate').fill('2026-11-24');
 await openIdentity(p);
 await p.locator('#identityMode').selectOption('none');
 await closeIdentity(p);
 await p.locator('#type').selectOption('A-D');
 await p.locator('#count').fill('4');
 await p.locator('#add').click();
 await navigate(p,'cartoes');
 const initial=await downloadPdf(p,{filename:'cartao-respostas-a4.pdf',outputName:'a4-original'});
 report.cases.push({...initial,format:'full-page'});
 await navigate(p,'criar');
 await openIdentity(p);
 await p.locator('#cardMode').selectOption('embedded');
 await p.locator('#embeddedWidth').fill('100');
 await p.locator('#embeddedHeight').fill('160');
 await closeIdentity(p);
 await navigate(p,'cartoes');
 const normal=await downloadPdf(p,{filename:'cartao-respostas-a4.pdf',outputName:'embedded-original'});
 report.cases.push({...normal,format:'embedded'});
 await p.locator('details.export-options').first().locator('summary').click();
 let vectorPaths={};
 for(const [width,height] of [[100,160],[120,180],[180,240]]){
  await navigate(p,'criar');await openIdentity(p);
  await p.locator('#embeddedWidth').fill(String(width));
  await p.locator('#embeddedHeight').fill(String(height));
  await closeIdentity(p);await navigate(p,'cartoes');
  for(const count of [2,4]){
   await p.locator('#economyCopies').selectOption(String(count));
   const status=await p.locator('#economyPrintStatus').innerText();
   assert(status.includes('escala')&&status.includes('100%'));
   await p.screenshot({path:path.join(output,'ui-'+count+'-por-a4-'+width+'x'+height+'.png')});
   const data=await downloadPdf(p,{filename:'cartao-respostas-'+count+'-por-a4.pdf',
    outputName:count+'-por-a4-'+width+'x'+height,
    landscape:count===2,minPaths:count*20});
   assert.equal((await p.locator('#economyCopies').inputValue()),String(count),'PDF action must not reset selection');
   vectorPaths[count]=data.infos[0].vectorPaths;
   report.cases.push({...data,format:'economy',source:[width,height],copies:count});
  }
  assert(vectorPaths[4]>vectorPaths[2]*1.5,'Four vector cards should draw more paths than two');
 }
 await p.locator('#economyCopies').selectOption('');
 const restored=await downloadPdf(p,{filename:'cartao-respostas-a4.pdf',outputName:'embedded-after-economy'});
 report.cases.push({...restored,format:'embedded-after-economy'});
 await navigate(p,'criar');await openIdentity(p);
 await p.locator('#cardMode').selectOption('full-page');
 await p.locator('#identityMode').selectOption('seven-digit-code');
 await closeIdentity(p);
 await navigate(p,'cartoes');
 assert.equal(await p.locator('#economyOptions').isHidden(),true);
 assert.equal(await p.locator('#economyCopies').inputValue(),'');
 const a4=await downloadPdf(p,{filename:'cartao-respostas-a4.pdf',outputName:'a4-after-economy'});
 report.cases.push({...a4,format:'full-page-after-economy'});
 // Synthetic nominal batch: original order, alphabetic order, page filter.
 await p.locator('#batchTools summary').click();
 await p.locator('#studentCodeBatch').fill('Zeta Exemplo; Turma; 0000003\nAlfa Exemplo; Turma; 0000001\nMi Exemplo; Turma; 0000002');
 await p.locator('#batchOrder').selectOption('name-asc');
 await p.locator('#batchPages').fill('2-3');
 const batch=await downloadPdf(p,{button:'printBatch',filename:'cartoes-resposta-lote.pdf',outputName:'lote-ordenado-2-paginas',pages:2});
 report.cases.push({...batch,format:'nominal-batch'});
 await p.locator('#batchOrder').selectOption('input');
 await p.locator('#batchPages').fill('');
 const batchAll=await downloadPdf(p,{button:'printBatch',filename:'cartoes-resposta-lote.pdf',outputName:'lote-entrada-3-paginas',pages:3});
 report.cases.push({...batchAll,format:'nominal-batch-input-order'});
 // Repeated clicks while the PDF renderer is processing are disabled.
 const afterBusy=await p.evaluate(()=>({main:document.getElementById('printCard').textContent,batch:document.getElementById('printBatch').textContent,printCalls:window.__pdfPrintCalls}));
 assert.equal(afterBusy.main,'Baixar PDF');assert.equal(afterBusy.batch,'Baixar PDF do lote');
 report.printCalls+=afterBusy.printCalls;
 report.putRequests=network.filter(x=>x.startsWith('PUT ')).length;
 assert.equal(report.putRequests,0);
 assert.equal(report.popups,0);
 assert.equal(report.printCalls,0);
 assert.equal(failures.length,0,'Hermetic network/page errors: '+failures.join('; '));
 console.log('DIRECT-PDF-BROWSER PASS '+report.cases.length+' downloads, real PDF parsed, no popup/print/PUT');
 report.result='PASS';
}catch(error){
 report.result='FAIL';report.error=error.stack||String(error);
 console.error(report.error);
 if(p){try{writeFileSync(path.join(output,'failure-body.txt'),(await p.locator('body').innerText()).slice(0,10000));await p.screenshot({path:path.join(output,'failure.png'),fullPage:true})}catch{}}
 process.exitCode=1;
}finally{
 report.network=network;
 writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 await ctx.close();
 await browser.close();
}
