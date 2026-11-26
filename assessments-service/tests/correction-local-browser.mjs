// Real Chromium DOM + real local Worker/D1 emulator. No optical rerun.
// Only the served test response receives a bridge at reading-completion;
// the production HTML and scripts on disk are unmodified.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {harness,packet,definition} from './helpers.mjs';
const {chromium}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(root,'assessments-service/dist/correction-local');mkdirSync(out,{recursive:true});
const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev',pagePath='/portal-do-aluno/plataforma/corretor-v2.html';
const h=await harness({lifecycle:true}),trace=[],errors=[],report={syntheticOnly:true,productionRequests:0,cards:[],phases:[]};
let queries=0;const prepare=h.db.prepare.bind(h.db);h.db.prepare=sql=>{queries++;return prepare(sql)};
const browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-sync','--host-resolver-rules=MAP * 0.0.0.0','--no-proxy-server']});
let mode='ok',held=null,release=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await sleep(20)}throw Error('Timed out waiting for background check')};
try{
 const def=definition(),id=crypto.randomUUID();def.title='CORRECTION LOCAL 400';
 assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:packet(0,{definition:def,lifecycleVersion:'salta-assessment-lifecycle-v1'})})).status,201);
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',serviceWorkers:'block'});
 await context.routeWebSocket('**/*',ws=>ws.close());
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  try{
   if(u.origin===api){
    const event={method:req.method(),path:u.pathname,mode};trace.push(event);
    if(mode==='503'||mode==='429'||mode==='401'||mode==='403'){
     event.status=Number(mode);return route.fulfill({status:event.status,contentType:'application/json',body:JSON.stringify({code:'synthetic'}),headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}});
    }
    if(mode==='slow'&&u.pathname.endsWith('/session')&&u.pathname.includes('/assessments/v1/')){
     held=event;await new Promise(resolve=>{release=resolve});event.status=429;
     return route.fulfill({status:429,contentType:'application/json',body:'{"code":"synthetic"}',headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}});
    }
    let res;if(u.pathname==='/auth/session')res=await h.env.AUTH.fetch(new Request('https://auth/session',{headers:{Origin:origin,Cookie:h.tokens.a}}));
    else if(u.pathname.startsWith('/assessments/v1/'))res=await h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:req.method(),...(req.postData()?{data:JSON.parse(req.postData())}:{})});
    else throw Error('Unexpected API path');
    event.status=res.status;return route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:await res.text()});
   }
   if(u.origin===origin&&u.pathname.startsWith('/portal-do-aluno/')){
    const file=path.resolve(root,decodeURIComponent(u.pathname.slice('/portal-do-aluno/'.length)));
    if(!file.startsWith(root)||!existsSync(file))return route.fulfill({status:404,body:'missing asset'});
    let body=readFileSync(file);
    if(u.pathname===pagePath){
     const html=body.toString('utf8'),anchor='</script></body></html>';assert.equal(html.split(anchor).length,2);
     body=html.replace(anchor,`
       // Test transport only, not present in production files.
       window.__correctionLocalTest={
        run(answers){const token=beginPhoto();rawRaster={source:'camera'};
         const result={templateId:token.templateId,templateRevision:token.templateRevision,contentHash:token.contentHash,page:token.page,pageCount:template.pageCount,identity:{state:'read',code:'0001123'},needsReview:false,
          observations:template.questions.map((q,i)=>({questionId:q.questionId,number:q.number,page:token.page,state:'read',answer:answers[i],marks:[answers[i]],recognition:'strong'}))};
         const start=performance.now();try{
          const accepted=readNormalized(result,{token});if(accepted!==result)throw Error('fixture was not accepted');
          const grade=document.getElementById('cameraGradeValue').textContent,elapsed=performance.now()-start;
          const entry=scanHistory.at(-1);calculateScore();
          return {id:token.captureId,grade,elapsed,binding:entry.binding,historyGrade:entry.grade};
         }finally{captureBusy=false;}
        },selected:()=>Boolean(privateSelection)
       };
     `+anchor);
    }
    return route.fulfill({contentType:({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body});
   }
   return route.abort();
  }catch(e){errors.push(e.message);return route.abort();}
 });
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+pagePath);
 const catalog=p.locator('#savedAssessments select[aria-label="Minhas avaliações"]');await catalog.waitFor();
 await p.waitForFunction(id=>Array.from(document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]').options).some(o=>o.value===id),id);
 await catalog.selectOption(id);await p.waitForFunction(()=>window.__correctionLocalTest?.selected()&&document.getElementById('answerKey').readOnly);
 await p.locator('[data-view="corrigir"]').click();await sleep(100);
 const initialRequests=trace.length,initialQueries=queries;
 const patterns=[['A','A','A','C','C'],['A','A','A','E','E'],['B','B','B','C','C'],['B','B','B','E','E']],expected=['10,00','6,00','4,00','0,00'];
 async function batch(label){
  const before={requests:trace.length,queries};
  const rows=await p.evaluate(({patterns})=>Array.from({length:100},(_,i)=>window.__correctionLocalTest.run(patterns[i%4])),{patterns});
  rows.forEach((row,i)=>{assert.equal(row.grade,expected[i%4]);assert.equal(row.historyGrade,row.grade);assert.equal(row.binding.assessmentId,id);assert.equal(row.binding.revision,1)});
  assert.equal(trace.length,before.requests,'No remote request per correction: '+label);assert.equal(queries,before.queries,'No D1 prepare per correction: '+label);
  report.phases.push({label,count:rows.length,requests:0,queries:0});report.cards.push(...rows);
 }
 await context.setOffline(true);await batch('offline');
 mode='503';await context.setOffline(false);await p.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(()=>trace.some(x=>x.mode==='503'&&x.status===503));await sleep(100);await batch('temporary-503');
 mode='slow';await p.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(()=>held&&release);const count=trace.length;
 await p.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
 await sleep(30);assert.equal(trace.length,count,'background checks deduplicated');await batch('in-flight-network');
 release();release=null;await sleep(150);mode='ok';await p.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(()=>trace.slice(initialRequests).some(x=>x.mode==='ok'&&x.path.includes('/assessments/v1/assessments/')&&x.status===200));await sleep(100);
 await batch('reconnected');
 assert.equal(report.cards.length,400);assert.equal(new Set(report.cards.map(c=>c.id)).size,400);
 assert.equal(trace.filter(x=>x.method==='GET'&&x.path.includes('/selections/')).length,1,'one selection payload load');
 const times=report.cards.map(c=>c.elapsed).sort((a,b)=>a-b);
 Object.assign(report,{initialRequests,initialQueries,background:trace.slice(initialRequests),requestCountPerCard:0,queryCountPerCard:0,medianMs:times[199],p95Ms:times[379]});
 mode='403';await p.evaluate(()=>window.dispatchEvent(new Event('online')));await p.waitForFunction(()=>!window.__correctionLocalTest.selected()&&!document.getElementById('answerKey').value);assert.equal(await p.locator('#cameraGradeValue').textContent(),'');
 assert.deepEqual(errors,[]);report.result='PASS';console.log('CORRECTION_LOCAL_BROWSER '+JSON.stringify({cards:400,initialRequests,initialQueries,background:report.background,requestCountPerCard:0,queryCountPerCard:0,medianMs:report.medianMs,p95Ms:report.p95Ms}));
 await context.close();
}catch(e){report.result='FAIL';report.error=e.stack;console.error(e.stack);process.exitCode=1}
finally{release?.();report.errors=errors;report.trace=trace;writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();h.close()}
