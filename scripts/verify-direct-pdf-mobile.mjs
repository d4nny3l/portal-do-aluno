// #125 mobile-engine smoke test; emulation is NOT a physical iPhone/Android homologation.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium,webkit,devices}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=path.join(root,'tmp/direct-pdf-mobile');
mkdirSync(out,{recursive:true});
const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev';
const report={mode:'mobile emulation, no physical device',results:[]};
for(const profile of [
 {name:'iphone-webkit',engine:webkit,device:devices['iPhone 13']},
 {name:'android-chromium',engine:chromium,device:devices['Pixel 7']}
]){
 const browser=await profile.engine.launch({headless:true});
 const context=await browser.newContext({...profile.device,acceptDownloads:true,locale:'pt-BR',serviceWorkers:'block'});
 const errors=[],calls=[],popup=[];
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());calls.push(req.method()+' '+url.pathname);
  try{
   if(url.origin===api){
    const responses={'/auth/session':{authenticated:true},
     '/assessments/v1/session':{authenticated:true,principalId:'pdf-mobile-fixture',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'},
     '/assessments/v1/grants':{grants:[]}};
    if(!(url.pathname in responses)||req.method()!=='GET')throw Error('Unexpected backend request '+url.pathname);
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(responses[url.pathname])});
   }
   if(url.origin===origin&&url.pathname.startsWith('/portal-do-aluno/')){
    const local=path.resolve(root,decodeURIComponent(url.pathname.slice('/portal-do-aluno/'.length)));
    if(!local.startsWith(root+path.sep)||!existsSync(local))return route.fulfill({status:404,body:'Missing local asset'});
    const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
    return route.fulfill({status:200,contentType:mime[path.extname(local)]||'application/octet-stream',body:readFileSync(local)});
   }
   throw Error('External request denied '+req.url());
  }catch(e){errors.push(e.message);return route.abort();}
 });
 await context.addInitScript(()=>{
  const native=window.fetch.bind(window);
  window.fetch=(resource,opts)=>{
   const u=String(typeof resource==='string'?resource:resource?.url||resource);
   const response=body=>Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}}));
   if(u.endsWith('/auth/session'))return response({authenticated:true});
   if(u.endsWith('/assessments/v1/session'))return response({authenticated:true,principalId:'pdf-mobile-fixture',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'});
   if(u.endsWith('/assessments/v1/grants'))return response({grants:[]});
   return native(resource,opts);
  };
  window.__printInvocations=0;window.print=()=>{window.__printInvocations++};
 });
 let page;
 try{
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('popup',()=>popup.push(1));page.on('dialog',d=>{errors.push('Unexpected dialog '+d.type());d.dismiss()});
  await page.goto(origin+'/portal-do-aluno/plataforma/corretor-v2.html');
  await page.waitForFunction(()=>document.body.classList.contains('salta-auth-ready'));
  await page.locator('#assessmentTitle').fill('TESTE MÓVEL');
  await page.locator('#assessmentSubject').fill('Matemática');
  await page.locator('#assessmentClass').fill('Turma sintética');
  await page.locator('#assessmentDate').fill('2026-11-24');
  await page.locator('#identitySettings summary').click();
  await page.locator('#identityMode').selectOption('none');
  await page.locator('#cardMode').selectOption('embedded');
  await page.locator('#embeddedWidth').fill('100');
  await page.locator('#embeddedHeight').fill('160');
  await page.locator('#identitySettings summary').click();
  await page.locator('#type').selectOption('A-D');
  await page.locator('#count').fill('3');
  await page.locator('#add').click();
  await page.locator('nav.module-nav [data-view="cartoes"]').click();
  await page.locator('details.export-options').first().locator('summary').click();
  await page.locator('#economyCopies').selectOption('2');
  const event=page.waitForEvent('download',{timeout:120000});
  await page.locator('#printCard').click();
  const download=await event;
  assert.equal(download.suggestedFilename(),'cartao-respostas-2-por-a4.pdf');
  const bytes=readFileSync(await download.path());
  assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
  assert(bytes.length>1200);
  assert.equal(await page.evaluate(()=>window.__printInvocations),0);
  assert.equal(popup.length,0);
  assert(!calls.some(req=>req.startsWith('PUT ')));
  assert.equal(errors.length,0,errors.join('; '));
  writeFileSync(path.join(out,profile.name+'-2-por-a4.pdf'),bytes);
  await page.screenshot({path:path.join(out,profile.name+'-ui.png')});
  report.results.push({profile:profile.name,engine:profile.engine.name(),device:profile.device.userAgent,pdfBytes:bytes.length,popups:0,putRequests:0,result:'PASS'});
  console.log('DIRECT-PDF-MOBILE '+profile.name+' downloaded real PDF PASS');
 }catch(error){
  report.results.push({profile:profile.name,result:'FAIL',error:error.stack||String(error),network:calls.slice(-15),errors});
  if(page){try{await page.screenshot({path:path.join(out,profile.name+'-error.png'),fullPage:true});}catch{}}
  process.exitCode=1;console.error(profile.name+' '+error.stack);
 }finally{
  await context.close();
  await browser.close();
 }
}
writeFileSync(path.join(out,'mobile-report.json'),JSON.stringify(report,null,2)+'\n');
