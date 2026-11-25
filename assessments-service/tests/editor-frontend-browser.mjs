// #120 full editor in a real isolated Chromium browser with synthetic Auth + temporary D1.
// No live network, real student information, deployment or private browser storage.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {harness,packet,definition as historicalDefinition} from './helpers.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {renderTemplateSvg} from '../../corretor/v2/omr/render.mjs';
import {buildPrintDocument} from '../../corretor/v2/omr/export.mjs';
const {chromium}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=path.join(root,'assessments-service/dist/editor-snapshot-browser');
mkdirSync(out,{recursive:true});
const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev';
const h=await harness({lifecycle:true}),requests=[],errors=[],blocked=[];
const launch=()=>chromium.launch({headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run','--host-resolver-rules=MAP * 0.0.0.0','--no-proxy-server']});
let browser=await launch();
const base=origin+'/portal-do-aluno/plataforma/corretor-v2.html';
const grant='?institutionId=synthetic-institution&classId=synthetic-class&periodId=synthetic-period';
async function context(capability=true){
 const c=await browser.newContext({viewport:{width:1360,height:980},locale:'pt-BR',serviceWorkers:'block'});
 await c.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  try{
   if(u.origin===api){
    let response;
    if(u.pathname==='/auth/session')response=await h.env.AUTH.fetch(new Request('https://auth/session',{headers:{Origin:origin,Cookie:h.tokens.a}}));
    else if(u.pathname.startsWith('/assessments/v1/')){
     response=await h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:req.method(),...(req.postData()?{data:JSON.parse(req.postData())}:{})});
    }else{blocked.push(u.pathname);return route.abort();}
    let body=await response.text();
    if(!capability&&u.pathname==='/assessments/v1/session'&&response.status===200){
     const session=JSON.parse(body);delete session.editorSnapshotVersion;body=JSON.stringify(session);
    }
    requests.push({method:req.method(),path:u.pathname,status:response.status,capability});
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
   }
   if(u.origin===origin&&u.pathname.startsWith('/portal-do-aluno/')){
    const f=path.resolve(root,decodeURIComponent(u.pathname.slice('/portal-do-aluno/'.length)));
    if(!f.startsWith(root+'/')||!existsSync(f))return route.fulfill({status:404,body:'Missing candidate asset'});
    const types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
    return route.fulfill({status:200,contentType:types[path.extname(f)]||'application/octet-stream',body:readFileSync(f)});
   }
   blocked.push(req.url());return route.abort();
  }catch(e){errors.push(e.message);return route.abort();}
 });
 await c.routeWebSocket('**/*',ws=>ws.close());
 return c;
}
async function page(c){
 const p=await c.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 p.on('dialog',d=>d.accept());
 await p.goto(base);
 await p.locator('#savedAssessments select[aria-label="Minhas avaliações"]:not([disabled])').waitFor();
 return p;
}
// Distinct, valid PNG pixels/aspects detect swapped or stale logo references.
function syntheticPng(w,h,color){
 const crc=b=>{let c=0xffffffff;for(const byte of b){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(name,bytes)=>{const n=Buffer.from(name),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(bytes.length);tail.writeUInt32BE(crc(Buffer.concat([n,bytes])));return Buffer.concat([head,n,bytes,tail]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 const rows=Buffer.concat(Array.from({length:h},()=>Buffer.from([0,...Array.from({length:w},()=>color).flat()])));
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const image=syntheticPng(4,2,[0,0,0,255]),image2=syntheticPng(2,4,[100,100,100,180]);
const visibility=['studentName','institution','teacher','subject','className','grade','date','schoolYear'];
const visibleA={studentName:false,institution:false,teacher:true,subject:false,className:true,grade:false,date:true,schoolYear:false};
const visibleB=Object.fromEntries(visibility.map(k=>[k,!visibleA[k]]));
async function fill(p,{title,mode,visible,logos,score,columns,teacher,school}){
 await p.locator('#assessmentTitle').fill(title);
 await p.locator('#assessmentSubject').fill('Matemática sintética');
 await p.locator('#assessmentClass').fill('Turma sintética');
 await p.locator('#assessmentDate').fill('2026-11-24');
 await p.locator('#identitySettings summary').click();
 await p.locator('#identityMode').selectOption('none');
 await p.locator('#cardMode').selectOption(mode);
 if(mode==='embedded'){
  await p.locator('#embeddedWidth').fill('120');
  await p.locator('#embeddedHeight').fill('180');
 }
 await p.locator('#columnCount').selectOption(columns);
 await p.locator('#identitySettings summary').click();
 await p.locator('#type').selectOption('A-E');
 await p.locator('#count').fill('3');
 await p.locator('#sectionLabel').fill('Questões '+title);
 await p.locator('#add').click();
 await p.locator('#headerSettings summary').click();
 await p.locator('[data-header="institution"]').fill(school);
 await p.locator('[data-header="teacher"]').fill(teacher);
 await p.locator('[data-header="grade"]').fill('9º ano');
 await p.locator('[data-header="schoolYear"]').fill('2026');
 for(const k of visibility)await p.locator('[data-visible="'+k+'"]').setChecked(visible[k]);
 if(logos){
  await p.locator('#headerLogo').setInputFiles({name:'sintetico-1.png',mimeType:'image/png',buffer:image});
  await p.locator('#headerLogo2').setInputFiles({name:'sintetico-2.png',mimeType:'image/png',buffer:image2});
  await p.waitForFunction(()=>document.querySelectorAll('#headerPreview image').length===2);
  await p.locator('#logoWidth').evaluate(e=>{e.value='26';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await p.locator('#logoWidth2').evaluate(e=>{e.value='18';e.dispatchEvent(new Event('input',{bubbles:true}))});
 }
 await p.locator('#headerSettings summary').click();
 await p.locator('#identitySettings summary').click();
 await p.locator('#showInstructions').setChecked(logos);
 await p.locator('#identitySettings summary').click();
 // These next-block controls are independent of the printed questions.
 await p.locator('#type').selectOption(logos?'CDU':'A-D');
 await p.locator('#count').fill(logos?'':'7');
 await p.locator('#sectionLabel').fill('Próximo '+title);
 await p.locator('#scoreFormatSelect').selectOption(String(score));
 if(await p.locator('#savedAssessments details.library-answers').getAttribute('open')===null)
  await p.locator('#savedAssessments details.library-answers summary').click();
 await p.locator('#savedAssessments textarea').fill('1 A\n2 B\n3 C');
 await p.locator('#savedAssessments button').filter({hasText:'Aplicar gabarito'}).click();
}
async function stored(title){
 for(let i=0;i<100;i++){
  const list=await(await h.request('/assessments'+grant)).json();
  const row=list.assessments?.find(r=>r.title===title);
  if(row){const response=await h.request('/assessments/'+row.id),record=(await response.json()).record;if(response.status===200&&record)return record;}
  await new Promise(r=>setTimeout(r,40));
 }
 throw Error('Missing verified save '+title);
}
async function save(p,title){
 const b=p.locator('#savedAssessments button[data-action-icon="save"]');
 assert.equal(await b.isDisabled(),false,'save must be enabled with v3 capability');
 await b.click();
 const record=await stored(title);
 // Refreshing history can legitimately leave phase "opened" after the verified
 // receipt/GET. Await the selected record and enabled correction, not a transient toast.
 await p.waitForFunction(id=>{
  const host=document.getElementById('savedAssessments');
  return host.querySelector('select[aria-label="Minhas avaliações"]').value===id&&
   !host.querySelector('button[data-action-icon="correct"]').disabled&&
   !host.innerText.includes('não foram salvas');
 },record.id);
 return record;
}
async function inspect(p,expected){
 await p.waitForFunction(t=>document.getElementById('assessmentTitle').value===t,expected.definition.title);
 const values=await p.evaluate(keys=>({
  fields:Object.fromEntries(['assessmentTitle','assessmentSubject','assessmentClass','assessmentDate','assessmentKind','identityMode','columnCount','cardMode','embeddedWidth','embeddedHeight','type','count','sectionLabel'].map(k=>[k,document.getElementById(k).value])),
  visible:Object.fromEntries(keys.map(k=>[k,document.querySelector('[data-visible="'+k+'"]').checked])),
  teacher:document.querySelector('[data-header="teacher"]').value,
  institution:document.querySelector('[data-header="institution"]').value,
  grade:document.querySelector('[data-header="grade"]').value,
  schoolYear:document.querySelector('[data-header="schoolYear"]').value,
  logos:Array.from(document.querySelectorAll('#headerPreview image')).map(e=>e.getAttribute('href')),
  logoWidths:[document.getElementById('logoWidth').value,document.getElementById('logoWidth2').value],
  scoreDecimals:document.getElementById('scoreFormatSelect').value,
  instructions:document.getElementById('showInstructions').checked,
  hash:document.querySelector('#preview svg')?.getAttribute('data-layout-hash')
 }),visibility);
 for(const [k,v]of Object.entries(expected.definition.editorSnapshot.fields))assert.equal(values.fields[k],v,k);
 for(const k of visibility)assert.equal(values.visible[k],expected.definition.editorSnapshot.header.visible[k],'visible.'+k);
 assert.equal(values.teacher,expected.definition.editorSnapshot.header.teacher);
 assert.equal(values.institution,expected.definition.editorSnapshot.header.institution);
 assert.equal(values.grade,expected.definition.editorSnapshot.header.grade);
 assert.equal(values.schoolYear,expected.definition.editorSnapshot.header.schoolYear);
 assert.equal(values.instructions,expected.definition.editorSnapshot.showInstructions);
 assert.deepEqual(values.logos,[expected.definition.manifest.header.logo,expected.definition.manifest.header.secondaryLogo].filter(Boolean));
 assert.deepEqual(values.logoWidths,[expected.definition.editorSnapshot.header.logoWidthMm,expected.definition.editorSnapshot.header.secondaryLogoWidthMm].map(String));
 assert.equal(values.scoreDecimals,String(expected.definition.display.scoreDecimals??2));
 assert.equal(values.hash,expected.manifestHash);
 assert.equal(await p.locator('#studentName').inputValue(),'');
 assert.equal(await p.locator('#studentCode').inputValue(),'');
 return values;
}
const report={task:'#120 editor complete real browser',candidateOnly:true,productionRequests:0,cases:[],errors:[]};
try{
 const c=await context(),p=await page(c);
 await fill(p,{title:'Sintética A',mode:'embedded',visible:visibleA,logos:true,score:0,columns:'auto',teacher:'Docente A',school:'ESCOLA A\nINSTITUIÇÃO A'});
 const a=await save(p,'Sintética A');
 assert.equal(a.definition.schemaVersion,'salta-assessment-definition-v3');
 assert.equal(a.definition.editorSnapshot.schemaVersion,'salta-editor-snapshot-v1');
 assert.equal(a.definition.editorSnapshot.fields.count,'');
 assert.equal(a.definition.editorSnapshot.fields.type,'CDU');
 assert.equal(a.definition.editorSnapshot.header.logo,'manifest.header.logo');
 assert.equal(a.definition.editorSnapshot.header.secondaryLogo,'manifest.header.secondaryLogo');
 assert(!JSON.stringify(a.definition.editorSnapshot).includes('data:image'));
 assert.equal(a.definition.display.scoreDecimals,0);
 await inspect(p,a);
 report.cases.push('A saved with contradictory visibility, two logos, auto columns, empty count, CDU next-block control and zero decimals');
 await p.locator('#savedAssessments button[data-action-icon="new"]').click();
 await fill(p,{title:'Sintética B',mode:'full-page',visible:visibleB,logos:false,score:2,columns:'1',teacher:'Docente B',school:'ESCOLA B\nINSTITUIÇÃO B'});
 const b=await save(p,'Sintética B');
 assert.equal(b.definition.display.scoreDecimals,2);
 assert.equal(b.definition.editorSnapshot.fields.columnCount,'1');
 await inspect(p,b);
 report.cases.push('B saved with opposite visibilities, absent logos, explicit one column and two decimals');
 const catalog=p.locator('#savedAssessments select[aria-label="Minhas avaliações"]');
 await catalog.selectOption(a.id);await inspect(p,a);
 await catalog.selectOption(b.id);await inspect(p,b);
 await catalog.selectOption(a.id);await inspect(p,a);
 report.cases.push('A to B to A restored all 13 fields and all visibility controls without previousEditor leakage');
 const {template,manifest}=importCardManifest(a.definition.manifest);
 const expectedSvg=renderTemplateSvg(template,{manifest});
 assert(expectedSvg.includes('data-layout-hash="'+a.manifestHash+'"'));
 const exactDrawing=await p.locator('#preview svg').evaluate((svg,source)=>{
  const tree=n=>n.nodeType===3?n.nodeValue:{tag:n.localName,
   attributes:Object.fromEntries(Array.from(n.attributes).map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b))),
   children:Array.from(n.childNodes).filter(c=>c.nodeType===1||c.nodeType===3&&c.nodeValue.trim()).map(tree)};
  return JSON.stringify(tree(svg))===JSON.stringify(tree(new DOMParser().parseFromString(source,'image/svg+xml').documentElement));
 },expectedSvg);
 assert.equal(exactDrawing,true,'Every visible SVG node, image, text and optical coordinate matches the saved manifest');
 const preview=await p.locator('#preview svg').getAttribute('data-layout-hash');
 assert.equal(preview,a.manifestHash);
 const print=await c.newPage();
 await print.setContent(buildPrintDocument(template,{manifest}));
 const pdf=await print.pdf({path:out+'/immutable-A.pdf',format:'A4',preferCSSPageSize:true});
 assert(pdf.length>5000);await print.close();
 report.cases.push('Unmodified revision SVG and PDF preserved the exact manifest hash');
 await c.close();
 // Close the entire browser process; only the synthetic server/D1 survives.
 await browser.close();browser=await launch();
 // A fresh authorized browser must restore A without any previous editor state.
 const c2=await context(),p2=await page(c2);
 await p2.locator('#savedAssessments select[aria-label="Minhas avaliações"]').selectOption(a.id);
 await inspect(p2,a);
 report.cases.push('A restored in a fresh browser context with the same authorized account');
 await p2.locator('#savedAssessments button[data-action-icon="duplicate"]').click();
 await p2.waitForFunction(id=>{const value=document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]').value;return value&&value!==id},a.id);
 const dup=await stored('Sintética A');
 // The catalog may still show the original title for the copy; inspect controller-owned selection.
 const rows=(await(await h.request('/assessments'+grant)).json()).assessments;
 const copy=rows.find(r=>r.id!==a.id&&r.id!==b.id&&r.title==='Sintética A');
 assert(copy?.id,'duplicate must be a distinct private assessment');
 const duplicated=(await(await h.request('/assessments/'+copy.id)).json()).record;
 assert.equal(duplicated.revision,1);assert.equal(duplicated.status,'draft');
 assert.deepEqual(duplicated.definition.editorSnapshot,a.definition.editorSnapshot);
 assert.equal(duplicated.manifestHash,a.manifestHash);
 await p2.waitForFunction(id=>document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]').value===id,copy.id);
 await p2.locator('#sectionLabel').fill('APÓS DUPLICAÇÃO');
 await p2.waitForFunction(()=>{
  const host=document.getElementById('savedAssessments');
  return host.querySelector('[role="status"]').dataset.state==='draft'&&/não (?:foram )?salvas/.test(host.innerText);
 });
 assert.equal(await p2.locator('#savedAssessments button[data-action-icon="correct"]').isDisabled(),true);
 await p2.locator('#savedAssessments button[data-action-icon="save"]').click();
 let newer;
 for(let i=0;i<100;i++){
  newer=(await(await h.request('/assessments/'+copy.id)).json()).record;
  if(newer?.revision===2)break;
  await new Promise(r=>setTimeout(r,40));
 }
 assert.equal(newer.revision,2);assert.equal(newer.definition.editorSnapshot.fields.sectionLabel,'APÓS DUPLICAÇÃO');
 assert.equal((await h.request('/assessments/'+copy.id+'/revisions/1')).status,410);
 assert.equal(newer.manifestHash,a.manifestHash);
 report.cases.push('Duplication kept immutable revision 1; changing only next-block name flagged unsaved and generated revision 2');
 // Historical V1 and V2 are readable, without pretending lost preferences survived.
 for(const legacy of [false,true]){
  const id=crypto.randomUUID();
  const r=await h.request('/assessments/'+id,{method:'PUT',data:packet(0,{definition:historicalDefinition({legacy}),lifecycleVersion:'salta-assessment-lifecycle-v1'})});
  assert.equal(r.status,201,'historic v2 transport');
  const cLegacy=await context(),pLegacy=await page(cLegacy);
  await pLegacy.locator('#savedAssessments select[aria-label="Minhas avaliações"]').selectOption(id);
  await pLegacy.waitForFunction(()=>document.querySelector('#savedAssessments').innerText.includes('Alguns campos não foram recuperados'));
  assert.equal(await pLegacy.locator('#columnCount').inputValue(),'auto');
  assert.equal(await pLegacy.locator('#studentName').inputValue(),'');
  await cLegacy.close();
 }
 report.cases.push('Historical A4 V1 and V2 reopened with deterministic warning and no inherited student data');
 const c3=await context(false),p3=await page(c3);
 assert.equal(await p3.locator('#savedAssessments button[data-action-icon="save"]').isDisabled(),true);
 assert((await p3.locator('#savedAssessments').innerText()).includes('Não foi possível salvar todas as configurações'));
 assert(!requests.some(r=>r.capability===false&&r.method==='PUT'));
 await c3.close();
 report.cases.push('No capability: new saves blocked; no PUT and no silent downgrade to v2');
 assert.equal(errors.length,0);assert.equal(blocked.length,0);
 report.result='PASS';
 console.log('EDITOR-SNAPSHOT-REAL-BROWSER: PASS '+report.cases.length+' scenarios');
}catch(e){
 report.result='FAIL';report.failure=e.stack||String(e);
 console.error(report.failure);
 for(const c of browser.contexts())for(const p of c.pages()){
  try{console.error((await p.locator('body').innerText()).slice(0,3000));await p.screenshot({path:out+'/failure.png',fullPage:true})}catch{}
 }
 process.exitCode=1;
}finally{
 report.errors=errors;report.blocked=blocked;report.requests=requests;
 writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();h.close();
}
