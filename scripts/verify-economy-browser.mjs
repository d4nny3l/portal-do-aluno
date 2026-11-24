// #122: real Chromium/PDF evidence for candidate print geometry only.
// All test cards and logos are synthetic; no session, gateway, production API or storage.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTemplate} from '../corretor/v2/omr/template.mjs';
import {createCardManifest,renderTemplateSvg,DEFAULT_CARD_HEADER} from '../corretor/v2/omr/render.mjs';
import {buildPrintDocument} from '../corretor/v2/omr/export.mjs';
import {planEconomySheet} from '../corretor/v2/omr/print-economy.mjs';
const {chromium}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))); // strip trailing separator for safe asset-path containment
const out=process.argv[2]||path.join(root,'tmp/economy-print-evidence');
mkdirSync(out,{recursive:true});
const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const scenarios=[
 {width:100,height:160,type:'A-D',count:3,logos:0},
 {width:120,height:180,type:'A-E',count:9,logos:2},
 {width:180,height:240,type:'C-E',count:18,logos:1}
];
const errors=[],report={issue:122,syntheticOnly:true,productionRequests:0,modelMutations:0,rotationOfCards:0,scenarios:[],errors};
const browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run','--host-resolver-rules=MAP * 0.0.0.0','--no-proxy-server']});
try{
 for(const spec of scenarios){
  const h={...DEFAULT_CARD_HEADER,title:'PROVA SINTÉTICA',institution:'SECRETARIA SINTÉTICA\nESCOLA DE DEMONSTRAÇÃO',subject:'Matemática',className:'Turma fictícia',teacher:'Professor demonstrativo',date:'2026-11-24',grade:'9º ano',schoolYear:'2026',visible:{...DEFAULT_CARD_HEADER.visible,className:true,teacher:false,subject:true,grade:false},logo:spec.logos?logo:'',secondaryLogo:spec.logos===2?logo:'',logoWidthMm:18,secondaryLogoWidthMm:18,logoAspect:1,secondaryLogoAspect:1};
  const s=[{sectionId:'section-1',label:'QUESTÕES DE MATEMÁTICA',type:spec.type,count:spec.count,order:0,items:Array.from({length:spec.count},(_,i)=>({questionId:'question-'+(i+1),originalOrder:i+1,number:i+1,type:spec.type}))}];
  const template=createTemplate(s,{layoutVersion:'v2',revision:8,title:h.title,schoolName:h.institution,mode:'embedded',identityMode:'none',embeddedSize:{widthMm:spec.width,heightMm:spec.height},metadata:{...h,visibleFields:h.visible}});
  const manifest=createCardManifest(template,h,{sectionFrameStyle:'content'});
  const snapshot=JSON.stringify(manifest),original=renderTemplateSvg(template,{header:h,manifest});
  for(const copies of [2,4]){
   const plan=planEconomySheet(manifest,copies);
   const html=buildPrintDocument(template,{header:h,manifest,economyCopies:copies});
   const context=await browser.newContext({viewport:{width:1650,height:1200},deviceScaleFactor:1.5,serviceWorkers:'block'});
   await context.route('**/*',route=>{errors.push('External request blocked: '+route.request().url());return route.abort()});
   const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.setContent(html,{waitUntil:'load'});
   const sheet=p.locator('svg.economy-sheet');
   await sheet.waitFor();
   const measured=await sheet.evaluate(svg=>{
    const card=[...svg.querySelectorAll('svg[data-economy-copy]')].map(el=>{
     const box=el.getBoundingClientRect(),frame=svg.getBoundingClientRect(),s=Number(svg.getAttribute('viewBox').split(' ')[2])/frame.width;
     return {x:(box.x-frame.x)*s,y:(box.y-frame.y)*s,width:box.width*s,height:box.height*s,hash:el.getAttribute('data-layout-hash')};
    });
    const guides=[...svg.querySelectorAll('[data-economy-cut]')].map(el=>({axis:el.getAttribute('data-economy-cut'),x1:+el.getAttribute('x1'),y1:+el.getAttribute('y1'),x2:+el.getAttribute('x2'),y2:+el.getAttribute('y2')}));
    const scissors=svg.querySelector('[data-economy-scissors]');
    return {card,guides,scissorsRings:scissors?.querySelectorAll('circle').length||0,
     pageWidth:svg.getAttribute('width'),pageHeight:svg.getAttribute('height'),
     sourceHash:svg.getAttribute('data-source-hash')};
   });
   assert.equal(measured.card.length,copies);
   assert.equal(measured.guides.length,copies===2?1:2);
   assert.equal(measured.scissorsRings,3);
   assert.equal(measured.sourceHash,manifest.contentHash);
   assert.equal(measured.pageWidth,plan.widthMm+'mm');
   assert.equal(measured.pageHeight,plan.heightMm+'mm');
   measured.card.forEach((card,i)=>{
    const expected=plan.slots[i];
    assert.equal(card.hash,manifest.contentHash);
    for(const key of ['x','y','width','height'])assert(Math.abs(card[key]-expected[key])<.1,key+' physical mismatch '+JSON.stringify({card,expected}));
   });
   for(const g of plan.guides)assert(measured.guides.some(v=>v.axis===g.axis&&v.x1===g.x1&&v.y1===g.y1&&v.x2===g.x2&&v.y2===g.y2));
   const name=copies+'-on-A4-'+spec.width+'x'+spec.height+'-'+spec.type;
   await sheet.screenshot({path:path.join(out,name+'.png')});
   const pdf=await p.pdf({path:path.join(out,name+'.pdf'),printBackground:true,preferCSSPageSize:true});
   assert(pdf.length>3000,'PDF must contain the embedded vector artwork');
   const pageObjects=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
   assert.equal(pageObjects,1,'one physical A4 page expected');
   assert.equal(JSON.stringify(manifest),snapshot);
   assert.equal((html.match(/data-layout-hash="/g)||[]).length,copies);
   assert(original.includes('data-layout-hash="'+manifest.contentHash+'"'));
   report.scenarios.push({...spec,copies,orientation:plan.orientation,paper:[plan.widthMm,plan.heightMm],scale:plan.scale,
    margins:plan.edgeMarginMm,guideClearance:plan.guideClearanceMm,slots:plan.slots,pdfBytes:pdf.length,pdfPages:pageObjects});
   console.log('ECONOMY-BROWSER '+name+' '+plan.orientation+' scale='+plan.scale+' PDF pages=1 PASS');
   await context.close();
  }
 }
 // Full real frontend interaction: 2 -> 4 -> normal, no backend writes.
 {
  const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev';
  const uiContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',serviceWorkers:'block'});
  const methods=[];
  await uiContext.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());methods.push(req.method()+' '+u.pathname);
   try{
    if(u.origin===api){
     const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true'};
     if(u.pathname==='/auth/session')return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({authenticated:true})});
     if(u.pathname==='/assessments/v1/session')return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({authenticated:true,principalId:'print-only-synthetic',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'})});
     if(u.pathname==='/assessments/v1/grants')return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({grants:[]})});
     errors.push('Unexpected private endpoint: '+req.method()+' '+u.pathname);return route.abort();
    }
    if(u.origin===origin&&u.pathname.startsWith('/portal-do-aluno/')){
     const file=path.resolve(root,decodeURIComponent(u.pathname.slice('/portal-do-aluno/'.length)));
     if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:'Missing candidate asset'});
     const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
     return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:readFileSync(file)});
    }
    errors.push('External request: '+req.url());return route.abort();
   }catch(error){errors.push(error.message);return route.abort();}
  });
  // Deterministic in-page Auth/grants for this hermetic UI test. No credential
  // cookies, remote auth, D1 or production backend are invoked.
  await uiContext.addInitScript(()=>{
   const genuine=window.fetch.bind(window);
   window.fetch=(resource,init)=>{
    const url=String(typeof resource==='string'?resource:resource?.url||resource);
    const reply=(body)=>Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}}));
    if(url.endsWith('/auth/session'))return reply({authenticated:true});
    if(url.endsWith('/assessments/v1/session'))return reply({authenticated:true,principalId:'print-only-synthetic',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'});
    if(url.endsWith('/assessments/v1/grants'))return reply({grants:[]});
    return genuine(resource,init);
   };
  });
  const p=await uiContext.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(origin+'/portal-do-aluno/plataforma/corretor-v2.html');
  await p.waitForTimeout(700);
  const authDiag=await p.evaluate(()=>({url:location.href,bodyClass:document.body.className,title:document.title,hasLoading:!!document.getElementById('loading'),loadingHidden:document.getElementById('loading')?.hidden,hasForm:!!document.getElementById('cardMode')}));
  console.log('PRINT-UI-DIAG '+JSON.stringify({authDiag,errors:[...errors],requests:methods.slice(-30)}));
  assert(authDiag.bodyClass.includes('salta-auth-ready'), 'Synthetic auth bootstrap did not reach ready state');
  assert.equal(await p.locator('#economyOptions').isHidden(),true,'A4 must not show economic options');
  await p.locator('#assessmentTitle').fill('TESTE ECONÔMICO');
  await p.locator('#assessmentSubject').fill('Matemática');
  await p.locator('#assessmentClass').fill('Turma fictícia');
  await p.locator('#assessmentDate').fill('2026-11-24');
  await p.locator('#identitySettings summary').click();
  await p.locator('#identityMode').selectOption('none');
  await p.locator('#cardMode').selectOption('embedded');
  await p.locator('#embeddedWidth').fill('100');
  await p.locator('#embeddedHeight').fill('160');
  await p.locator('#identitySettings summary').click();
  await p.locator('#type').selectOption('A-D');
  await p.locator('#count').fill('3');
  await p.locator('#add').click();
  await p.locator('nav.module-nav [data-view="cartoes"]').click();
  assert.equal(await p.locator('#economyOptions').isVisible(),false,'options remain inside closed Others formats');
  await p.locator('details.export-options').first().locator('summary').click();
  assert.equal(await p.locator('#economyOptions').isVisible(),true,'embedded options visible');
  let popups=0,printDialogs=0;
  p.on('popup',()=>popups++);
  p.on('dialog',d=>{printDialogs++;d.dismiss()});
  for(const copies of [2,4]){
   await p.locator('#economyCopies').selectOption(String(copies));
   assert((await p.locator('#economyPrintStatus').innerText()).includes('100%'));
   await p.screenshot({path:path.join(out,'real-ui-select-'+copies+'.png')});
   const event=p.waitForEvent('download',{timeout:120000});
   await p.locator('#printCard').click();
   const download=await event;
   assert.equal(download.suggestedFilename(),'cartao-respostas-'+copies+'-por-a4.pdf');
   const bytes=readFileSync(await download.path());
   assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
   assert(bytes.length>1000);
   writeFileSync(path.join(out,'real-ui-'+copies+'-por-a4.pdf'),bytes);
  }
  await p.locator('#economyCopies').selectOption('');
  const ordinaryEvent=p.waitForEvent('download',{timeout:120000});
  await p.locator('#printCard').click();
  const ordinary=await ordinaryEvent;
  assert.equal(ordinary.suggestedFilename(),'cartao-respostas-a4.pdf');
  assert.equal(readFileSync(await ordinary.path()).subarray(0,5).toString(),'%PDF-');
  assert.equal(popups,0,'PDF must not open tabs');
  assert.equal(printDialogs,0,'PDF must not invoke a print dialog');
  await p.locator('nav.module-nav [data-view="criar"]').click();
  await p.locator('#identitySettings summary').click();
  await p.locator('#cardMode').selectOption('full-page');
  await p.locator('#identitySettings summary').click();
  assert.equal(await p.locator('#economyCopies').inputValue(),'');
  assert.equal(await p.locator('#economyOptions').isHidden(),true);
  assert.equal(methods.filter(m=>m.startsWith('PUT ')).length,0,'print selection must never persist');
  report.scenarios.push({realFrontend:true,sequence:'2 -> 4 -> normal A4',putRequests:0,popups,printDialogs,selectedCopiesResetAfterA4:true});
  console.log('ECONOMY-REAL-UI: real downloaded PDF 2 -> 4 -> normal + no popup/print/PUT PASS');
  await uiContext.close();
 }
 assert.equal(errors.length,0);
 report.result='PASS';
}catch(error){
 report.result='FAIL';report.failure=error.stack||String(error);console.error(report.failure);process.exitCode=1;
}finally{
 writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
