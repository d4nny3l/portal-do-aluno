// Entire real editor + candidate Worker/real Auth reader/SQLite; no productive traffic.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';import path from 'node:path';
import {harness} from './helpers.mjs';
const {chromium}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(root,'assessments-service/dist/lifecycle-browser');mkdirSync(out,{recursive:true});
const h=await harness({lifecycle:true}),trace=[],errors=[],blocked=[],report={syntheticOnly:true,productionRequests:0,cases:[]};
const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev',base=origin+'/portal-do-aluno/plataforma/corretor-v2.html';
let loseDelete=false,deleteWrites=0,nativeDialogs=0;
const browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-sync','--host-resolver-rules=MAP * 0.0.0.0','--no-proxy-server']});
async function context({mobile=false,capability=true}={}){
 const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},locale:'pt-BR',serviceWorkers:'block'});
 await c.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  try{
   if(u.origin===api){
    let r;if(u.pathname==='/auth/session')r=await h.env.AUTH.fetch(new Request('https://auth/session',{headers:{Cookie:h.tokens.a}}));
    else if(u.pathname.startsWith('/assessments/v1/'))r=await h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:req.method(),...(req.postData()?{data:JSON.parse(req.postData())}:{})});
    else throw Error('Unexpected API path');
    if(req.method()==='POST'&&u.pathname.endsWith('/delete')){deleteWrites++;if(loseDelete){loseDelete=false;trace.push({method:req.method(),path:u.pathname,status:r.status,lost:true});return route.abort();}}
    let body=await r.text();if(!capability&&u.pathname.endsWith('/session')&&r.status===200){const data=JSON.parse(body);delete data.assessmentLifecycleVersion;body=JSON.stringify(data)}
    trace.push({method:req.method(),path:u.pathname,status:r.status});return route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body});
   }
   if(u.origin===origin&&u.pathname.startsWith('/portal-do-aluno/')){
    const f=path.resolve(root,decodeURIComponent(u.pathname.slice('/portal-do-aluno/'.length)));if(!f.startsWith(root)||!existsSync(f))return route.fulfill({status:404,body:'missing local asset'});
    return route.fulfill({contentType:({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream',body:readFileSync(f)});
   }
   blocked.push(u.href);return route.abort();
  }catch(e){errors.push(e.message);return route.abort();}
 });await c.routeWebSocket('**/*',ws=>ws.close());return c;
}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{nativeDialogs++;void d.dismiss()});await p.goto(base);await p.locator('#savedAssessments select[aria-label="Minhas avaliações"]:not([disabled])').waitFor();return p}
const button=(p,icon)=>p.locator('#savedAssessments button[data-action-icon="'+icon+'"]');
const catalog=p=>p.locator('#savedAssessments select[aria-label="Minhas avaliações"]');
async function waitSaved(p,title,revision){await p.waitForFunction(()=>!document.querySelector('#savedAssessments button[data-action-icon="save"]').disabled);let record;
 for(let i=0;i<150;i++){const rows=h.db.sqlite.prepare('SELECT id,current_revision FROM av_assessments WHERE current_revision=?').all(revision);for(const row of rows){const r=await (await h.request('/assessments/'+row.id)).json();if(r.record?.definition.title===title)record=r.record}if(record)break;await new Promise(r=>setTimeout(r,40))}assert(record,'confirmed stored record');
 await p.waitForFunction(id=>document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]').value===id,record.id);return record;}
try{
 const c=await context(),p=await page(c);
 await p.locator('#assessmentTitle').fill('Avaliação sintética exclusão');await p.locator('#assessmentDate').fill('2026-11-24');await p.locator('#assessmentSubject').fill('Ciências sintéticas');await p.locator('#assessmentClass').fill('Turma sintética');
 await p.locator('#count').fill('3');await p.locator('#add').click();
 await p.locator('#savedAssessments .library-answers summary').click();await p.locator('#savedAssessments textarea').fill('1 A\n2 B\n3 C');await p.locator('#savedAssessments button').filter({hasText:'Aplicar gabarito'}).click();
 await button(p,'save').click();const first=await waitSaved(p,'Avaliação sintética exclusão',1);
 await p.locator('#sectionLabel').fill('Configuração nova');await button(p,'save').click();const next=await waitSaved(p,first.definition.title,2);
 assert.equal(next.id,first.id);assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions WHERE assessment_id=?').get(first.id).n,1);assert.equal((await h.request('/assessments/'+first.id+'/revisions/1')).status,410);
 report.cases.push('real editor saves and replaces definition with exactly one revision, no save popup');
 const before=deleteWrites;await button(p,'delete').click();const dialog=p.getByRole('dialog',{name:'Excluir avaliação?'});await dialog.waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Cancelar',exact:true}).evaluate(n=>n===document.activeElement),true);
 await p.screenshot({path:out+'/desktop-dialog.png',fullPage:true});
 await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await p.waitForFunction(()=>document.querySelector('#savedAssessments button[data-action-icon="delete"]')===document.activeElement);assert.equal(deleteWrites,before);
 await button(p,'delete').click();await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(deleteWrites,before);
 report.cases.push('single native accessible dialog; Cancel and Escape issue zero requests and restore focus');
 const second=await page(c);await catalog(second).selectOption(first.id);await second.waitForFunction(t=>document.getElementById('assessmentTitle').value===t,first.definition.title);
 const old=await context({capability:false}),oldPage=await page(old);await catalog(oldPage).selectOption(first.id);await oldPage.waitForFunction(t=>document.getElementById('assessmentTitle').value===t,first.definition.title);
 assert.equal(await button(oldPage,'delete').isDisabled(),true);assert.equal(await button(oldPage,'save').isDisabled(),true);await old.close();report.cases.push('missing authenticated capability blocks deletion and replacement');
 const mobile=await context({mobile:true}),mp=await page(mobile);await catalog(mp).selectOption(first.id);await mp.waitForFunction(()=>!document.querySelector('#savedAssessments button[data-action-icon="delete"]').disabled);
 await button(mp,'delete').click();const md=mp.getByRole('dialog',{name:'Excluir avaliação?'});await md.waitFor();
 assert.equal(await md.evaluate(d=>d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth&&d.scrollWidth<=d.clientWidth),true);
 await mp.screenshot({path:out+'/mobile-dialog.png',fullPage:true});await mp.keyboard.press('Tab');assert.equal(await md.getByRole('button',{name:'Excluir definitivamente'}).evaluate(n=>n===document.activeElement),true);
 await mp.keyboard.press('Tab');assert.equal(await md.getByRole('button',{name:'Cancelar',exact:true}).evaluate(n=>n===document.activeElement),true);
 loseDelete=true;await md.getByRole('button',{name:'Excluir definitivamente'}).click();
 await mp.waitForFunction(()=>document.querySelector('#savedAssessments [role="status"]').textContent==='Avaliação excluída permanentemente.');
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_assessments WHERE id=?').get(first.id).n,0);
 assert.equal(h.db.sqlite.prepare('SELECT count(*) n FROM av_revisions WHERE assessment_id=?').get(first.id).n,0);
 await second.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await second.waitForFunction(()=>document.getElementById('assessmentTitle').value==='');
 assert.equal(await p.locator('dialog').count(),0);assert.equal(await mp.locator('dialog').count(),0);assert.equal(await catalog(mp).inputValue(),'');
 assert.equal(await mp.locator('#assessmentTitle').inputValue(),'');assert.equal(nativeDialogs,0);assert.equal(deleteWrites,2);
 report.cases.push('390px keyboard focus trap, lost receipt replay, verified deletion and other-tab cache/editor invalidation');
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);report.result='PASS';console.log('LIFECYCLE REAL BROWSER: PASS '+report.cases.length+' scenarios');
}catch(e){report.result='FAIL';report.failure=e.stack;console.error(e.stack);for(const c of browser.contexts())for(const p of c.pages()){try{console.error((await p.locator('#savedAssessments').innerText()).slice(0,1000));await p.screenshot({path:out+'/failure.png',fullPage:true})}catch{}}process.exitCode=1}
finally{report.trace=trace;report.errors=errors;report.blocked=blocked;writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();h.close()}
