// DESIGN-SALTA-01: Browser QA, localhost only. No production requests.
(async function verify(){
 const assert=(await import('node:assert/strict')).default;
 const {createServer}=await import('node:http');
 const {readFileSync,mkdirSync,writeFileSync}=await import('node:fs');
 const {fileURLToPath,pathToFileURL}=await import('node:url');
 const path=(await import('node:path')).default;
 const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'tmp','atelie-v2-evidence');
 mkdirSync(output,{recursive:true});
 const allowed=new Set(['plataforma/atelie-salta.html','plataforma/atelie-salta-v2.css','plataforma/atelie-salta-v2.mjs','plataforma/atelie-salta-v2-icons.svg','plataforma/atelie-salta-v2-InterVariable.woff2','favicon.svg']);
 const types={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
 const requests=[];
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),rel=decodeURIComponent(url.pathname).replace(/^\/+/,'');
  requests.push(rel);
  if(!allowed.has(rel)){res.writeHead(404);res.end('Ateliê-only: asset forbidden');return;}
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  try{res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(readFileSync(file));}
  catch{res.writeHead(404);res.end('Missing asset');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,mod=process.env.SALTA_PLAYWRIGHT_MODULE;
 if(!mod)throw Error('SALTA_PLAYWRIGHT_MODULE required');
 const {chromium,webkit}=await import(pathToFileURL(mod).href);
 const cases=[['chromium-320',chromium,320,700],['chromium-390',chromium,390,844],['chromium-768',chromium,768,1024],['chromium-1440',chromium,1440,900],['chromium-1920',chromium,1920,1080],['webkit-390',webkit,390,844]];
 const report={baseMain:'b8968b70b7eebbe4d34b29acdb0336ba5e568f20',scenarios:[],physicalDeviceTested:false,noProductionAccess:true,requests:[],failures:[]};
 try{
  for(const [name,engine,width,height] of cases){
   let browser;
   try{
    browser=await engine.launch({headless:true});
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',isMobile:width<=390,deviceScaleFactor:1});
    const page=await context.newPage(),errors=[],external=[],bad=[];
    page.on('pageerror',e=>errors.push(e.stack||e.message));
    page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
    page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()});});
    await page.goto(base+'/plataforma/atelie-salta.html',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.body.classList.contains('v2-ready')&&document.getElementById('v2-screen-choice'));
    assert.equal(await page.locator('[role=tab]').count(),6);
    assert.equal(await page.locator('#v2-screen-choice option').count(),22);
    await page.screenshot({path:path.join(output,name+'-cores.png'),fullPage:true});
    await page.locator('#tab-simbolos').click();
    assert.equal(await page.locator('.v2-icon-item[data-v2-icon]').count(),68);
    await page.screenshot({path:path.join(output,name+'-simbolos.png'),fullPage:true});
    await page.locator('#v2-icon-search').fill('calendar');
    assert.ok(await page.locator('.v2-icon-item[data-v2-icon]').count()>=1,'icon search');
    await page.locator('#v2-icon-search').fill('');
    await page.locator('#v2-icon-size').selectOption('32');
    const iconItem=page.locator('.v2-icon-item[data-v2-icon]').first();await iconItem.click();
    assert.match(await page.locator('#v2-icon-selected').innerText(),/Aprovado/);
    assert.equal(await iconItem.locator('.v2-glyph').evaluate(el=>Math.round(el.getBoundingClientRect().width)),32);
    await page.locator('#tab-componentes').click();
    await page.locator('#v2-state-choice').selectOption('conflict');
    assert.match(await page.locator('#v2-state-render').innerText(),/Conflito/);
    await page.locator('[data-v2-action="confirm"]').click();
    assert.equal(await page.locator('#v2-modal-overlay').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#v2-modal-overlay').isVisible(),false);
    await page.locator('#v2-switch').check();
    assert.match(await page.locator('#v2-switch-label').innerText(),/Ligado/);
    await page.screenshot({path:path.join(output,name+'-componentes.png'),fullPage:true});
    await page.locator('#tab-telas').click();
    for(let i=1;i<=22;i++){
     const key='15.'+i;
     await page.locator('#v2-screen-choice').selectOption(key);
     assert.ok((await page.locator('#v2-screen-title').innerText()).startsWith(key+' ·'),name+' '+key);
     assert.ok(await page.locator('#v2-screen-render .v2-shell').count());
     assert.match(await page.locator('#v2-screen-render').innerText(),/DEMONSTRAÇÃO FICTÍCIA/);
     if((width===390||width===1440)&&name.startsWith('chromium'))await page.screenshot({path:path.join(output,name+'-preview-'+key.replace('.','-')+'.png'),fullPage:true});
     const over=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,viewport:window.innerWidth}));
     assert.ok(over.actual<=over.viewport+2,name+' '+key+' body overflow '+JSON.stringify(over));
    }
    await page.locator('#tab-movimentos').click();
    await page.screenshot({path:path.join(output,name+'-movimentos.png'),fullPage:true});
    const loaded=await page.evaluate(async()=>{const f=await document.fonts.load('600 16px Inter');return f.length>0&&f.some(x=>x.family.includes('Inter'));});
    assert.equal(loaded,true,'local Inter');
    assert.deepEqual(external,[]);
    assert.deepEqual(errors,[]);
    assert.deepEqual(bad,[]);
    report.scenarios.push({name,width,height,compositions:22,symbols:68,localFont:true,errors:0,externalRequests:0});
    await context.close();
    console.log('ATELIE V2 PASS',name,'22 compositions, 68 icons, responsive');
   }catch(e){report.failures.push({name,error:e.stack||String(e)});console.error('ATELIE V2 FAIL',name,e.stack||e.message);}
   finally{await browser?.close();}
  }
  report.requests=[...new Set(requests)];
  if(report.requests.some(r=>!allowed.has(r)))throw Error('Forbidden HTTP resource requested');
  if(report.failures.length)throw Error(JSON.stringify(report.failures));
  console.log('ATELIE V2 BROWSER PASS ALL',cases.length);
 }catch(e){report.error=e.stack||String(e);process.exitCode=1;}
 finally{writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await new Promise(resolve=>server.close(resolve));}
})();
