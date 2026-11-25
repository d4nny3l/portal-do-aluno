import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {harness} from './helpers.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {buildPrintDocument} from '../../corretor/v2/omr/export.mjs';
import {renderTemplateSvg} from '../../corretor/v2/omr/render.mjs';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),out=process.argv[2]||root+'/assessments-service/dist/browser-evidence';mkdirSync(out,{recursive:true});
const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev';
const h=await harness({lifecycle:true}),trace=[],report={task:'issue-118-candidate',base:'81dfa2a6c404213403cdc7d98a0873b58e789f4c',syntheticOnly:true,sourceServedFromCandidate:true,productionNetworkRequests:0,cases:[],pageErrors:[],blocked:[]};
const browser=await chromium.launch({headless:true,...(process.env.SALTA_CHROME?{executablePath:process.env.SALTA_CHROME}:{}),args:['--disable-background-networking','--disable-sync','--no-first-run','--host-resolver-rules=MAP * 0.0.0.0','--no-proxy-server']});
async function context(){
 const c=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',serviceWorkers:'block'});
 await c.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  try{
   if(u.origin===api){
    let r;
    if(u.pathname==='/auth/session')r=await h.env.AUTH.fetch(new Request('https://auth/session',{headers:{Origin:origin,Cookie:h.tokens.a}}));
    else if(u.pathname.startsWith('/assessments/v1/'))r=await h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:req.method(),...(req.postData()?{data:JSON.parse(req.postData())}:{})});
    else {report.blocked.push(u.pathname);return route.abort();}
    const text=await r.text();trace.push({method:req.method(),path:u.pathname,status:r.status});
    return route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:text});
   }
   if(u.origin===origin&&u.pathname.startsWith('/portal-do-aluno/')){
    const file=path.resolve(root,decodeURIComponent(u.pathname.slice('/portal-do-aluno/'.length)));
    if(!file.startsWith(root+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing local asset'});
    const types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
    return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:readFileSync(file)});
   }
   report.blocked.push(req.url());return route.abort();
  }catch(e){console.error('Local route failed',e.message);return route.abort();}
 });
 await c.routeWebSocket('**/*',ws=>ws.close());return c;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(const [places,width,height] of [[0,100,160],[1,120,180],[2,180,240]]){
  const c=await context(),p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(origin+'/portal-do-aluno/plataforma/corretor-v2.html');
  await p.locator('#scoreFormatSelect:not([disabled])').waitFor();
  const before=await p.locator('#savedAssessments select[aria-label="Minhas avaliações"]').inputValue();assert.equal(before,'');
  const labelsBefore=await p.locator('#savedAssessments select[aria-label="Minhas avaliações"] option').allTextContents();
  if(places>0)assert(labelsBefore.some(x=>x===`Sintética ${places-1} - Matemática - Turma S`));
  await p.locator('#assessmentTitle').fill('Sintética '+places);await p.locator('#assessmentSubject').fill('Matemática');await p.locator('#assessmentClass').fill('Turma S');await p.locator('#assessmentDate').fill('2026-11-24');
  await p.locator('#identitySettings summary').click();await p.locator('#identityMode').selectOption('none');await p.locator('#cardMode').selectOption('embedded');await p.locator('#embeddedWidth').fill(String(width));await p.locator('#embeddedHeight').fill(String(height));await p.locator('#identitySettings summary').click();
  await p.locator('#type').selectOption('A-E');await p.locator('#count').fill('3');await p.locator('#add').click();
  await p.locator('#scoreFormatSelect').selectOption(String(places));await p.locator('#savedAssessments details.library-answers summary').click();
  const amount=p.locator('#savedAssessments .library-scoring input').first();assert.equal(await amount.inputValue(),['10','10,0','10,00'][places]);
  await p.locator('#savedAssessments textarea').fill('1 A\n2 B\n3 C');await p.locator('#savedAssessments button').filter({hasText:'Aplicar gabarito'}).click();
  await p.locator('#savedAssessments button[data-action-icon="save"]').click();
  let record;
  for(let i=0;i<100;i++){
   const list=await(await h.request('/assessments?institutionId=synthetic-institution&classId=synthetic-class&periodId=synthetic-period')).json();
   const row=list.assessments?.find(r=>r.title==='Sintética '+places);
   if(row){record=(await(await h.request('/assessments/'+row.id)).json()).record;break;}
   await sleep(50);
  }
  if(!record)throw Error('Save not found: '+await p.locator('#savedAssessments').innerText());
  assert.equal(record.definition.manifest.mode,'embedded');assert.equal(record.definition.manifest.paper.widthMm,width);assert.equal(record.definition.manifest.paper.heightMm,height);assert.equal(record.definition.display.scoreDecimals,places);assert.equal(record.totalUnits,'100000');
  await p.waitForFunction(t=>document.getElementById('scanModelStatus').textContent===t&&!document.querySelector('#savedAssessments button[data-action-icon="new"]').disabled,'Sintética '+places);
  assert.equal(await p.locator('#criar').evaluate(e=>e.classList.contains('active')),true,'save must not navigate');
  await p.locator('#savedAssessments button[data-action-icon="new"]').click();
  await p.locator('#savedAssessments select[aria-label="Minhas avaliações"]').selectOption(record.id);
  await p.waitForFunction(t=>document.getElementById('assessmentTitle').value===t,'Sintética '+places);
  assert.equal(await p.locator('#cardMode').inputValue(),'embedded');assert.equal(await p.locator('#embeddedWidth').inputValue(),String(width));assert.equal(await p.locator('#embeddedHeight').inputValue(),String(height));assert.equal(await p.locator('#scoreFormatSelect').inputValue(),String(places));assert.equal(await amount.inputValue(),['10','10,0','10,00'][places]);
  const icons=await p.evaluate(()=>({save:getComputedStyle(document.querySelector('[data-action-icon="save"]'),'::before').maskImage,camera:getComputedStyle(document.getElementById('camera'),'::before').maskImage}));
  assert.notEqual(icons.save,'none');assert.notEqual(icons.camera,'none');
  await p.screenshot({path:out+'/format-'+places+'-reopened.png',fullPage:true});
  await p.waitForFunction(t=>document.getElementById('scanModelStatus').textContent===t&&document.getElementById('answerKey').readOnly,'Sintética '+places);
  assert.equal(await p.locator('#savedAssessments button[data-action-icon="correct"]').count(),0);
  assert.equal(await p.locator('#criar').evaluate(e=>e.classList.contains('active')),true,'selection must not navigate');
  assert.notEqual(await p.locator('#savedAssessments button[data-action-icon="delete"]').evaluate(e=>getComputedStyle(e,'::before').maskImage),'none');
  await p.locator('nav.module-nav [data-view="corrigir"]').click();
  const {template,manifest}=importCardManifest(record.definition.manifest);
  const printed=await c.newPage();await printed.setContent(buildPrintDocument(template,{manifest}));const pdf=await printed.pdf({path:out+'/embedded-'+width+'x'+height+'.pdf',format:'A4',preferCSSPageSize:true});assert(pdf.length>5000);await printed.close();
  let svg=renderTemplateSvg(template,{manifest});
  const marks=manifest.questions.map((q,i)=>{const b=q.bubbles.find(b=>b.choice===['A','B','A'][i]);return `<circle cx="${b.x}" cy="${b.y}" r="${b.radiusMm*.9}" fill="black"/>`;}).join('');
  svg=svg.replace('</svg>',marks+'</svg>');
  const png=await p.evaluate(async ({svg,width,height})=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await image.decode();const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=Math.round(1400*height/width);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png').split(',')[1]},{svg,width,height});
  await p.locator('#file').setInputFiles({name:'synthetic-card.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await p.waitForFunction(()=>!document.getElementById('captureComparison').hidden);
  await p.locator('#read').evaluate(e=>e.click());
  await p.locator('#photoGrade:not([hidden])').waitFor();assert.equal(await p.locator('#photoGrade').innerText(),'Nota '+['7','6,7','6,67'][places]);
  const score=await p.locator('#scanScore').textContent();assert(score.includes('Nota final '+['7 / 10','6,7 / 10,0','6,67 / 10,00'][places]),score);
  const history=await p.locator('#captureHistory').innerText();assert(history.includes(['nota final 7','nota final 6,7','nota final 6,67'][places]));
  await p.screenshot({path:out+'/format-'+places+'-correction.png',fullPage:true});
  report.cases.push({places,width,height,mode:'embedded',labelsBefore,selectedBefore:before,persisted:true,totalUnits:record.totalUnits,reopened:await amount.inputValue(),score,history,iconsVisible:true});
  await p.locator('nav.module-nav [data-view="criar"]').click();
  if(places===2){
   await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/embedded-mobile-390.png',fullPage:true});
  }
  await c.close();console.log('Embedded browser '+width+'x'+height+': PASS');
 }
 assert.equal(report.pageErrors.length,0);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;console.error(e.stack);for(const c of browser.contexts())for(const p of c.pages()){console.error((await p.locator('body').innerText()).slice(0,5000));await p.screenshot({path:out+'/browser-failure.png',fullPage:true})}process.exitCode=1}
finally{report.requests=trace;report.browser=browser.version();writeFileSync(out+'/browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();h.close()}
