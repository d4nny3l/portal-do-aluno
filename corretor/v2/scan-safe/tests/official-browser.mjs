// Hermetic real UI, native MediaStream and module Worker. Synthetic pixels only.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CASES,modelFor,svgFor} from '../validation/optical-corpus.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const out=process.env.SALTA_SCAN_EVIDENCE||path.join(root,'tmp/scan-safe-browser');await mkdir(out,{recursive:true});
const {chromium,webkit}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.gz':'application/gzip'};
const reference='195585572bdcefee809981aada4ee7614b7e023f';
const baseline=execFileSync('git',['show',reference+':plataforma/corretor-v2.html'],{cwd:root,encoding:'utf8'}).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const server=createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+name);
 if(name==='/plataforma/__scan_visual_baseline'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(baseline);return;}
 if(!file.startsWith(root))throw Error('path');const body=await readFile(file);
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,url=origin+'/plataforma/corretor-v2.html';
const model=modelFor(CASES.find(c=>c.id==='moderate-A'));
const inputs=['plataforma/corretor-v2.html','plataforma/corretor-v2.css','corretor/v2/assessments/block-scoring.mjs',
 'corretor/v2/scan-safe/camera.mjs','corretor/v2/scan-safe/processor.mjs','corretor/v2/scan-safe/worker.mjs','corretor/v2/scan-safe/worker-client.mjs','corretor/v2/scan-safe/session.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(inputs.map(async file=>[file,createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')])));
const report={synthetic:true,productionRequests:0,physicalCamera:false,sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,versions:{},results:[],errors:[]};
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  report.versions[name]=browser.version();
  try{
   const c=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',serviceWorkers:'block'});
   await c.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();
    if(u.origin==='https://salta-stats.dannyel-moises.workers.dev'){
     const body=u.pathname==='/auth/session'?{ok:true,authenticated:true,user:'synthetic-scan-only'}:
      u.pathname==='/assessments/v1/session'?{authenticated:true,principalId:'synthetic-scan-only',epoch:1,
       scoreFormatVersion:'salta-score-format-v1',embeddedLibraryVersion:'salta-embedded-library-v1',editorSnapshotVersion:'salta-editor-snapshot-v1',assessmentLifecycleVersion:'salta-assessment-lifecycle-v1'}:{grants:[]};
     assert.equal(req.method(),'GET','no writes in this browser fixture');
     return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(body)});
    }
    report.errors.push('External request blocked: '+u.origin);return route.abort();
   });
   await c.addInitScript(()=>{
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1500;
    const ctx=canvas.getContext('2d');let image=null,timer=null,stream=null;
    const fixture={requests:[],constraints:[],stopped:0};
    const draw=()=>{ctx.fillStyle='#253343';ctx.fillRect(0,0,1000,1500);if(image)ctx.drawImage(image,80,100,840,1188);stream?.getVideoTracks()[0]?.requestFrame?.();};
    fixture.show=async src=>{if(!src){image=null;draw();return;}const next=new Image();next.src=src;await next.decode();image=next;draw();};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(options){
     fixture.requests.push(options);
     if(!canvas.captureStream)throw Error('Synthetic captureStream unavailable');
     canvas.style.cssText='position:fixed;width:10px;height:15px;left:0;top:0;pointer-events:none';document.body.append(canvas);draw();
     stream=canvas.captureStream(30);const track=stream.getVideoTracks()[0],stop=track.stop.bind(track);
     Object.defineProperties(track,{getCapabilities:{value:()=>({focusMode:['continuous']})},
      applyConstraints:{value:async q=>fixture.constraints.push(q)},stop:{value:()=>{clearInterval(timer);stop();fixture.stopped++;}}});
     timer=setInterval(draw,33);return stream;
    }}});window.__scanFixture=fixture;
   });
   const p=await c.newPage();p.on('pageerror',e=>report.errors.push(name+': '+e.message));
   await p.goto(url);await p.waitForFunction(()=>document.body.classList.contains('salta-auth-ready'));
   await p.locator('#teacherShellToggle').waitFor();
   // Complete the viewport movement before a real pointer click: WebKit's
   // smooth document scrolling can otherwise leave the tab under the fixed bar.
   await p.locator('[data-view="corrigir"]').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await p.locator('[data-view="corrigir"]').click();
   await p.locator('#loadManifest').setInputFiles({name:'modelo-sintetico.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model.manifest))});
   await p.waitForFunction(()=>document.querySelector('#scanModelStatus').textContent.includes('Modelo importado'));
   await p.locator('#file').setInputFiles(path.join(root,'corretor/v2/scan-safe/validation/moderate-A.png'));
   await p.waitForFunction(()=>document.getElementById('status').textContent.includes('Gabarito necessário'));
   assert.equal(await p.locator('#photoGrade').getAttribute('hidden'),'');
   await p.locator('#answerKey').evaluate((e,text)=>{e.value=text;e.dispatchEvent(new Event('input',{bubbles:true}));},model.template.questions.map(q=>q.number+' A').join('\n'));
   await p.waitForFunction(()=>document.querySelector('#captureHistory').textContent.includes('nota final'));
   const photoGrade=await p.locator('#photoGrade').innerText();assert.equal(photoGrade,'Nota 1,00');
   assert.equal(await p.locator('#canvas').getAttribute('hidden'),null);
   assert.equal(await p.locator('#captureComparison').count(),0);
   for(const [ink,provisional] of [[25,true],[130,false]]){
    const spec={...CASES.find(c=>c.id==='identity-pending'),marks:[{choice:'A',ink}]};
    const png=await p.evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await image.decode();const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1273;canvas.getContext('2d').drawImage(image,0,0,900,1273);return canvas.toDataURL('image/png').split(',')[1];},svgFor(spec));
    const old=await p.locator('#captureHistory li').first().textContent();
    await p.locator('#file').setInputFiles({name:'identificacao-pendente.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await p.waitForFunction(text=>document.querySelector('#captureHistory li').textContent!==text,old);
    const state=await p.locator('#scanScore').evaluate(e=>({...e.dataset}));
    assert.equal(state.identity,'review');assert.equal(state.provisional,provisional?'true':'false');
    if(provisional)assert.equal(await p.locator('#photoGrade').innerText(),'Nota provisória 1,00');
    else assert.equal(await p.locator('#photoGrade').getAttribute('hidden'),'','partial marks stay blocked with pending identity');
   }
   const importedCount=await p.locator('#captureHistory li').count();
   await p.locator('#camera').click();
   await p.waitForFunction(()=>document.querySelector('#video').videoWidth>0);
   await p.evaluate(src=>window.__scanFixture.show(src),origin+'/corretor/v2/scan-safe/validation/moderate-A.png');
   await p.waitForFunction(n=>document.querySelectorAll('#captureHistory li').length===n,importedCount+1,{timeout:15000});
   await p.waitForFunction(()=>!document.querySelector('#cameraGrade').hidden);
   assert.equal(await p.locator('#cameraGradeValue').innerText(),'1,00');
   // Original DOM/CSS are used ONLY as a visual baseline, never as an app/test fallback.
   const before=await c.newPage();await before.goto(origin+'/plataforma/__scan_visual_baseline');
   await before.evaluate(async src=>{
    document.getElementById('loading').hidden=true;document.body.classList.add('salta-auth-ready');
    document.querySelectorAll('.module-view').forEach(e=>e.classList.toggle('active',e.id==='corrigir'));
    const v=document.getElementById('video');document.getElementById('cameraStage').hidden=false;
    v.srcObject=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});await v.play();
    await window.__scanFixture.show(src);document.getElementById('cameraGrade').hidden=false;
    document.getElementById('cameraGradeValue').textContent='1,00';
   },origin+'/corretor/v2/scan-safe/validation/moderate-A.png');
   const native=await p.evaluate(()=>({w:document.querySelector('#video').videoWidth,h:document.querySelector('#video').videoHeight,requests:window.__scanFixture.requests,constraints:window.__scanFixture.constraints}));
   assert.equal(native.requests.length,1);assert.equal(native.requests[0].video.facingMode,'environment');
   for(const width of [320,390,768,1440]){
    await p.setViewportSize({width,height:1000});
    const geometry=await p.evaluate(()=>{const stage=document.querySelector('#cameraStage'),video=document.querySelector('#video'),preview=document.querySelector('#cameraPreview'),grade=document.querySelector('#cameraGrade');const rect=(e)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{stage:rect(stage),video:rect(video),preview:rect(preview),grade:rect(grade),font:getComputedStyle(document.querySelector('#cameraGradeValue')).fontSize,presentation:stage.classList.contains('canvas-preview')?'canvas':'video'};});
    assert.ok(Math.abs(geometry.stage.w/geometry.stage.h-native.w/native.h)<.005);assert.equal(geometry.font,'30px');
    await before.setViewportSize({width,height:1000});
    const prior=await before.evaluate(()=>{const s=document.getElementById('cameraStage').getBoundingClientRect(),g=document.getElementById('cameraGrade').getBoundingClientRect(),t=getComputedStyle(document.getElementById('cameraGradeValue'));return{left:g.x-s.x,bottom:s.bottom-g.bottom,w:g.width,h:g.height,font:t.fontSize,weight:t.fontWeight,align:t.textAlign};});
    assert.deepEqual({left:geometry.grade.x-geometry.stage.x,bottom:geometry.stage.y+geometry.stage.h-geometry.grade.y-geometry.grade.h,w:geometry.grade.w,h:geometry.grade.h,font:geometry.font,weight:'800',align:'center'},prior,'grade placement and typography match the frozen official UI');
    await before.locator('#cameraStage').screenshot({path:path.join(out,name+'-'+width+'-before.png')});
    await p.locator('#cameraStage').screenshot({path:path.join(out,name+'-'+width+'.png')});
    report.results.push({name,width,geometry});
   }
   await before.close();
   const count=await p.locator('#captureHistory li').count();
   await p.waitForTimeout(1000);assert.equal(await p.locator('#captureHistory li').count(),count,'same paper cannot duplicate');
   await p.evaluate(()=>window.__scanFixture.show(null));await p.waitForTimeout(900);
   assert.equal(await p.locator('#cameraGradeValue').innerText(),'1,00','grade persists during withdrawal');
   await p.evaluate(src=>window.__scanFixture.show(src),origin+'/corretor/v2/scan-safe/validation/moderate-AB.png');
   await p.waitForFunction(n=>document.querySelectorAll('#captureHistory li').length===n,count+1,{timeout:15000});
   if(name==='chromium'&&Number(process.env.SALTA_SCAN_CYCLES)>=100){
    await p.evaluate(()=>{
     const f=window.__scanFixture;f.performance={latencies:[],frames:0,maxFrameGapMs:0};let last=null,start=null;
     const frame=t=>{if(last!==null)f.performance.maxFrameGapMs=Math.max(f.performance.maxFrameGapMs,t-last);last=t;f.performance.frames++;requestAnimationFrame(frame);};requestAnimationFrame(frame);
     const flash=document.getElementById('scanFlash'),grade=document.getElementById('cameraGrade');
     new MutationObserver(records=>{
      if(records.some(r=>r.target===flash)&&flash.classList.contains('go'))start=performance.now();
      if(start!==null&&!grade.hidden){f.performance.latencies.push(performance.now()-start);start=null;}
     }).observe(document.getElementById('cameraStage'),{attributes:true,subtree:true,attributeFilter:['hidden','class']});
    });
    const cdp=await c.newCDPSession(p),memory=[];
    for(let cycle=1;cycle<=Number(process.env.SALTA_SCAN_CYCLES);cycle++){
     const previous=await p.locator('#captureHistory li').first().textContent();
     await p.evaluate(()=>window.__scanFixture.show(null));
     await p.waitForFunction(()=>document.getElementById('cameraLiveBadge').dataset.phase==='vacant',null,{timeout:10000});
     await p.evaluate(src=>window.__scanFixture.show(src),origin+'/corretor/v2/scan-safe/validation/moderate-A.png');
     await p.waitForFunction(old=>document.querySelector('#captureHistory li').textContent!==old&&!document.getElementById('cameraGrade').hidden,previous,{timeout:15000});
     memory.push({cycle,...await cdp.send('Runtime.getHeapUsage')});
     if(cycle%20===0)console.log('Actual camera → grade cycles '+cycle);
    }
    const performance=await p.evaluate(()=>window.__scanFixture.performance),sorted=[...performance.latencies].sort((a,b)=>a-b);
    assert.equal(sorted.length,Number(process.env.SALTA_SCAN_CYCLES));
    report.performance={scope:'Synthetic native MediaStream, repeated labelled moderate-A sheet with proven removal between every capture. Real Worker and grade DOM. No physical sensor or temperature measurement.',count:sorted.length,medianMs:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],...performance,memory};
    console.log('Camera → grade median/p95',report.performance.medianMs,report.performance.p95Ms);
   }
   await p.locator('#camera').click();assert.equal(await p.locator('#video').evaluate(v=>v.srcObject),null);
   report.results.push({name,photoGrade,native,continuousSamePaperSuppressed:true,automaticWithdrawalRearmed:true});
   await c.close();
  }finally{await browser.close();}
 }
 assert.deepEqual(report.errors,[]);console.log('SCAN SAFE REAL BROWSER PASS');
}catch(error){report.errors.push(error.stack);throw error;}
finally{server.close();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
