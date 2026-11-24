// Real browser UI + local synthetic MediaStream. Native optical hardware is NOT tested.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium,webkit,devices}=await import(process.env.SALTA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const fixture=path.join(root,'tmp/camera-focus-evidence');
const out=path.join(fixture,'browser');mkdirSync(out,{recursive:true});
const origin='https://d4nny3l.github.io',api='https://salta-stats.dannyel-moises.workers.dev';
const img=name=>'data:image/png;base64,'+readFileSync(path.join(fixture,name+'.png')).toString('base64');
const report={synthetic:true,physicalDevices:false,results:[]};
for(const profile of [
 {name:'desktop-chromium',engine:chromium,device:{viewport:{width:1280,height:900}},focus:true},
 {name:'android-chromium',engine:chromium,device:devices['Pixel 7'],focus:true},
 {name:'iphone-webkit',engine:webkit,device:devices['iPhone 13'],focus:false}
]){
 const browser=await profile.engine.launch({headless:true});
 const context=await browser.newContext({...profile.device,locale:'pt-BR',serviceWorkers:'block'});
 const errors=[],calls=[];
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());calls.push(req.method()+' '+url.pathname);
  try{
   if(url.origin===api){
    const responses={'/auth/session':{authenticated:true},'/assessments/v1/session':{authenticated:true,principalId:'cam-focus-fixture',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'},'/assessments/v1/grants':{grants:[]}};
    if(req.method()!=='GET'||!(url.pathname in responses))throw Error('Unexpected backend '+req.method()+' '+url.pathname);
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(responses[url.pathname])});
   }
   if(url.origin===origin&&url.pathname.startsWith('/portal-do-aluno/')){
    const local=path.resolve(root,decodeURIComponent(url.pathname.slice('/portal-do-aluno/'.length)));
    if(!local.startsWith(root+path.sep)||!existsSync(local))return route.fulfill({status:404,body:'Asset missing'});
    const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
    return route.fulfill({status:200,contentType:mime[path.extname(local)]||'application/octet-stream',body:readFileSync(local)});
   }
   throw Error('External request denied '+url.pathname);
  }catch(e){errors.push(e.message);return route.abort()}
 });
 await context.addInitScript(({focus})=>{
  const native=window.fetch.bind(window);
  window.fetch=(resource,opts)=>{
   const u=String(typeof resource==='string'?resource:resource?.url||resource);
   const response=body=>Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}}));
   if(u.endsWith('/auth/session'))return response({authenticated:true});
   if(u.endsWith('/assessments/v1/session'))return response({authenticated:true,principalId:'cam-focus-fixture',epoch:1,editorSnapshotVersion:'salta-editor-snapshot-v1'});
   if(u.endsWith('/assessments/v1/grants'))return response({grants:[]});
   return native(resource,opts);
  };
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;
  const ctx=canvas.getContext('2d');
  let image=null,stream=null,track=null,timer=null;
  const fixture={focusRequests:0,async setFrame(src){
   if(!src){image=null;return}
   const next=new Image();next.src=src;await next.decode();image=next;
  }};
  const draw=()=>{
   ctx.fillStyle='#c8c8c8';ctx.fillRect(0,0,canvas.width,canvas.height);
   if(image)ctx.drawImage(image,0,0,canvas.width,canvas.height);
   track?.requestFrame?.();
  };
  const media={
   async getUserMedia(options){
    if(options.audio||options.video?.facingMode?.exact!=='environment')throw Error('Expected rear-only constraint');
    if(typeof canvas.captureStream!=='function')throw Error('Synthetic MediaStream not supported in this browser');
    draw();stream=canvas.captureStream(10);track=stream.getVideoTracks()[0];
    const originalStop=track.stop.bind(track);
    Object.defineProperties(track,{
     getCapabilities:{value:()=>focus?{focusMode:['continuous']}:{}},
     getSettings:{value:()=>({width:1200,height:1800,deviceId:'synthetic-camera',facingMode:'environment',...(focus?{focusMode:'continuous'}:{})})},
     getConstraints:{value:()=>({})},
     applyConstraints:{value:async c=>{if(c.advanced?.[0]?.focusMode==='continuous')fixture.focusRequests++;}},
     stop:{value:()=>{clearInterval(timer);originalStop()}}
    });
    clearInterval(timer);timer=setInterval(draw,100);return stream;
   },
   async enumerateDevices(){return [{kind:'videoinput',deviceId:'synthetic-camera',label:'Back Camera (synthetic)'}]}
  };
  Object.defineProperty(navigator,'mediaDevices',{value:media,configurable:true});
  window.__camFocusFixture=fixture;
 },{focus:profile.focus});
 let page;
 try{
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/portal-do-aluno/plataforma/corretor-v2.html');
  await page.waitForFunction(()=>document.body.classList.contains('salta-auth-ready'));
  await page.locator('nav.module-nav [data-view="corrigir"]').click();
  await page.locator('#loadManifest').setInputFiles(path.join(fixture,'a4-v2-manifest.json'));
  await page.waitForFunction(()=>document.querySelector('#scanModelStatus').textContent.includes('Modelo importado'));
  const show=src=>page.evaluate(src=>window.__camFocusFixture.setFrame(src),src);
  const count=()=>page.locator('#captureHistory li').filter({hasText:/Cartão \d+/}).count();
  const waitCount=n=>page.waitForFunction(n=>[...document.querySelectorAll('#captureHistory li')].filter(el=>/Cartão \d+/.test(el.textContent)).length===n,n,{timeout:30000});
  await show(img('near-blurred'));await page.locator('#camera').click();
  await page.waitForFunction(()=>document.querySelector('#video').readyState>=2,undefined,{timeout:15000});
  assert.equal(await page.locator('#cameraFocus').isVisible(),profile.focus,'native capability gate');
  if(profile.focus){await page.locator('#cameraFocus').click();await page.waitForFunction(()=>window.__camFocusFixture.focusRequests>=2);}
  await page.waitForFunction(()=>/foco|desfocada|iluminação|marcadores/.test(document.querySelector('#cameraGuideStatus').textContent));
  await page.waitForTimeout(2500);
  assert.equal(await count(),0,'blurred frame must not reach reading');
  await page.screenshot({path:path.join(out,profile.name+'-blurred.png')});
  await show(img('a4-v2-capture'));await waitCount(1);
  await page.screenshot({path:path.join(out,profile.name+'-distant.png')});
  await page.waitForTimeout(2500);assert.equal(await count(),1,'no duplicate while same sheet remains');
  await show(null);await page.waitForFunction(()=>/Folha retirada/.test(document.querySelector('#cameraGuideStatus').textContent));
  await show(img('ideal'));await waitCount(2);
  await page.screenshot({path:path.join(out,profile.name+'-next-sheet.png')});
  await page.locator('#camera').click();
  assert.equal(await page.locator('#cameraStage').isVisible(),false);
  assert.equal(await page.locator('#cameraFocus').isVisible(),false);
  assert(!calls.some(c=>c.startsWith('PUT ')),'capture must not write an assessment');
  assert.equal(errors.length,0,errors.join('; '));
  report.results.push({profile:profile.name,focusCapabilityMocked:profile.focus,captures:2,duplicate:0,blurRejected:true,result:'PASS'});
  console.log('CAM-FOCUS-BROWSER PASS '+profile.name+' synthetic video, not physical');
 }catch(e){
  report.results.push({profile:profile.name,result:'FAIL',error:e.stack||String(e),errors});
  if(page){try{await page.screenshot({path:path.join(out,profile.name+'-error.png'),fullPage:true})}catch{}}
  console.error(profile.name+' '+e.stack);process.exitCode=1;
 }finally{await context.close();await browser.close();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}
