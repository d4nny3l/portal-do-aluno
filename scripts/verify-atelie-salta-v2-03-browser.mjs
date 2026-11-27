// DESIGN-SALTA-03 · ações reais na prévia sintética, localhost, sem rede externa.
(async function runDirectBulk03(){
 const assert=(await import('node:assert/strict')).default;
 const {readFileSync,mkdirSync,writeFileSync}=await import('node:fs');
 const {createServer}=await import('node:http');
 const {fileURLToPath,pathToFileURL}=await import('node:url');
 const path=(await import('node:path')).default;
 const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
 const dir=path.join(root,'tmp','atelie-v3-interaction-evidence');mkdirSync(dir,{recursive:true});
 const allowed=new Set(['plataforma/atelie-salta.html','plataforma/atelie-salta-v2.css','plataforma/atelie-salta-v2-fidelity.css','plataforma/atelie-salta-v2.mjs','plataforma/atelie-salta-v2-icons.svg','plataforma/atelie-salta-v2-InterVariable.woff2','favicon.svg',...['fixtures.mjs','calendar.mjs','matrix.mjs','controls.mjs','compositions.mjs','favicon-a.svg','favicon-b.svg','favicon-c.svg','favicon-d.svg'].map(s=>'plataforma/atelie-salta-v2-'+s)]);
 const types={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
 const server=createServer((req,res)=>{
  const file=new URL(req.url,'http://127.0.0.1').pathname.replace(/^\/+/,'');
  if(!allowed.has(file)){res.writeHead(404);res.end('Resource outside Ateliê');return;}
  const full=path.resolve(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(full));}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const host='http://127.0.0.1:'+server.address().port;
 const module=process.env.SALTA_PLAYWRIGHT_MODULE;if(!module)throw Error('SALTA_PLAYWRIGHT_MODULE required');
 const {chromium,webkit}=await import(pathToFileURL(module).href);
 const runs=[['chromium-390',chromium,390,844,true],['chromium-1440',chromium,1440,900,false],['webkit-390',webkit,390,844,true]];
 const report={task:'DESIGN-SALTA-03',baseMain:'e9ed27f75eeb9f747a78c240c8766e8db5fee748',cases:[],failures:[],physicalSafari:false,realData:false,network:false,merge:false};
 const capture=(page,name)=>page.screenshot({path:path.join(dir,name+'.png'),fullPage:false});
 const cell=(page,i,j)=>page.locator('#f2-matrix-slot [data-f2-cell="'+i+':'+j+'"]');
 let failed=false;
 try{
 for(const [name,engine,width,height,touch] of runs){
  let browser;
  try{
   browser=await engine.launch({headless:true});
   const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,deviceScaleFactor:1,reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[],external=[],bad=[];
   page.setDefaultTimeout(7000);
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('request',r=>{if(!r.url().startsWith(host))external.push(r.url());});
   page.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url());});
   await page.goto(host+'/plataforma/atelie-salta.html',{waitUntil:'networkidle'});
   const favicon=page.locator('head link[rel=icon]');assert.equal(await favicon.getAttribute('href'),'./atelie-salta-v2-favicon-c.svg');
   await page.locator('#tab-cores').click();
   assert.equal(await page.locator('input[name=f2-favicon]:checked').inputValue(),'C');
   await page.locator('input[name=f2-favicon][value=A]').check();
   assert.match(await page.locator('#f2-favicon-choice').innerText(),/continua C/);
   await page.locator('input[name=f2-favicon][value=C]').check();
   await page.locator('#tab-telas').click();
   await page.locator('#v2-screen-choice').selectOption('15.8');
   assert.equal(await page.locator('.f2-sheet tbody tr').count(),30);
   assert.equal(await page.locator('.f2-sheet thead tr').count(),2);
   const sticky=await page.locator('.f2-student-header').evaluate(e=>getComputedStyle(e).position);
   assert.equal(sticky,'sticky');
   const scroll=page.locator('#f2-matrix-slot [data-f2-scroll]');
   await capture(page,name+'-attendance-before');
   // Direct click, no re-render of the scroller, no popup, visible cross-highlight.
   await scroll.evaluate(e=>e.scrollTop=300);
   const scrollerRef=await page.locator('#f2-matrix-slot [data-f2-scroll]').evaluate(el=>{el.dataset.identity='kept';return el.scrollTop});
   const clickCell=cell(page,24,0);await clickCell.click();
   assert.equal(await clickCell.locator('.f2-code').innerText(),'F');
   assert.equal(await page.locator('[data-f2-scroll]').getAttribute('data-identity'),'kept');
   assert.equal(await page.locator('.f2-sheet tr.f2-active-row').count(),1);
   assert.equal(await page.locator('.f2-sheet td.f2-active-cell').count(),1);
   assert.equal(await page.locator('#f2-matrix-slot [role=dialog]').count(),0);
   assert.ok((await scroll.evaluate(e=>e.scrollTop))>=scrollerRef);
   await clickCell.focus();await page.keyboard.press('Enter');
   assert.equal(await clickCell.locator('.f2-code').innerText(),'P');
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-att-all-f]').click();
   assert.match(await page.locator('[data-f2-counts]').innerText(),/F 30/);
   assert.equal(await page.locator('[data-f2-scroll]').getAttribute('data-identity'),'kept');
   if(touch){await cell(page,24,0).tap();}else await cell(page,24,0).click();
   assert.equal(await cell(page,24,0).locator('.f2-code').innerText(),'P');
   await cell(page,0,0).click();
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-special]').click();
   assert.equal(await page.locator('#f2-matrix-slot [role=dialog]').count(),1);
   await page.locator('#f2-matrix-slot input[name=f2-att-state][value=FJ]').check();
   await page.locator('#f2-matrix-slot input[name=f2-reason]').fill('Consulta fictícia');
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-apply]').click();
   assert.equal(await cell(page,0,0).locator('.f2-code').innerText(),'FJ');
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-att-all-p]').click();
   assert.equal(await cell(page,0,0).locator('.f2-code').innerText(),'FJ');
   assert.match(await page.locator('[data-f2-matrix-feedback]').innerText(),/exceções preservadas/);
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-confirm]').click();
   assert.match(await page.locator('[data-f2-confirmed]').innerText(),/Confirmação local simulada/);
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-lesson-1]').click();
   assert.equal(await cell(page,0,1).locator('.f2-code').innerText(),'P');
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-att-all-f]').click();
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-confirm]').click();
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-lesson-0]').click();
   assert.equal(await cell(page,0,0).locator('.f2-code').innerText(),'FJ');
   await cell(page,3,0).click();
   assert.match(await page.locator('[data-f2-confirmed]').innerText(),/Rascunho/);
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-lesson-1]').click();
   assert.match(await page.locator('[data-f2-confirmed]').innerText(),/Confirmação local simulada/);
   await capture(page,name+'-attendance-after');
   await page.locator('#v2-screen-choice').selectOption('15.10');
   await capture(page,name+'-checks-before');
   assert.equal(await page.locator('[data-f2-action=matrix-check-all-done]').isDisabled(),true);
   assert.equal(await cell(page,0,3).locator('.f2-code').innerText(),'—');
   for(const expected of ['✓','×','✓']){
    if(touch)await cell(page,0,3).tap();else await cell(page,0,3).click();
    assert.equal(await cell(page,0,3).locator('.f2-code').innerText(),expected);
    assert.equal(await page.locator('#f2-matrix-slot [role=dialog]').count(),0);
   }
   const other=await cell(page,0,4).locator('.f2-code').innerText();
   await page.locator('[data-f2-activity-select]').selectOption('3');
   const selected=page.locator('[data-f2-activity="3"]');assert.equal(await selected.getAttribute('aria-pressed'),'true');
   const beforeAll=await page.locator('[data-f2-check-counts]').innerText();
   assert.match(beforeAll,/total 30/);
   await page.locator('[data-f2-search]').fill('Estudante 07');
   assert.equal(await page.locator('.f2-sheet tbody tr').count(),1);
   await page.locator('[data-f2-action=matrix-check-all-not]').click();
   assert.match(await page.locator('[data-f2-matrix-feedback]').innerText(),/Turma inteira: 30 estudantes, mesmo com pesquisa/);
   assert.equal(await page.locator('[data-f2-scroll]').count(),1);
   await page.locator('[data-f2-search]').fill('');
   assert.equal(await page.locator('.f2-sheet tbody tr').count(),30);
   assert.equal(await cell(page,0,4).locator('.f2-code').innerText(),other);
   await cell(page,0,3).click();assert.equal(await cell(page,0,3).locator('.f2-code').innerText(),'✓');
   await page.locator('[data-f2-activity-select]').selectOption('4');
   await page.locator('[data-f2-action=matrix-check-all-done]').click();
   assert.equal(await cell(page,0,3).locator('.f2-code').innerText(),'✓');
   await cell(page,0,0).click();assert.equal(await cell(page,0,0).locator('.f2-code').innerText(),'◷');
   await page.locator('[data-f2-action=matrix-special]').click();
   await page.locator('input[name=f2-check-state][value="—"]').check();
   await page.locator('[data-f2-action=matrix-apply]').click();
   await cell(page,0,0).click();assert.equal(await cell(page,0,0).locator('.f2-code').innerText(),'✓');
   await page.locator('[data-f2-activity-select]').selectOption('7');
   await scroll.evaluate(e=>{e.scrollLeft=420;e.scrollTop=380;e.dataset.identity='kept-checks';});
   const far=cell(page,25,7);
   await far.click();
   assert.equal(await page.locator('[data-f2-scroll]').getAttribute('data-identity'),'kept-checks');
   assert.ok(await scroll.evaluate(e=>e.scrollLeft)>0);
   assert.equal(await page.locator('.f2-sheet td.f2-active-cell').count(),1);
   await far.focus();await page.keyboard.press(' ');
   assert.equal(await page.locator('#f2-matrix-slot [role=dialog]').count(),0);
   await capture(page,name+'-checks-after');
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-tab-single]').click();
   await page.locator('#f2-matrix-slot [data-f2-action=matrix-single-edit]').click();
   assert.equal(await page.locator('#f2-matrix-slot [role=dialog]').count(),0);
   await page.locator('#v2-screen-choice').selectOption('15.9');
   await cell(page,0,0).click();
   assert.equal(await page.locator('#f2-matrix-slot [role=dialog]').count(),1,'Grades unchanged: deliberate editor');
   await page.locator('[data-f2-action=matrix-cancel]').click();
   assert.deepEqual(errors,[]);
   assert.deepEqual(external,[]);
   assert.deepEqual(bad,[]);
   report.cases.push({name,width,height,touch,assertions:'direct, keyboard, touch, batch, filters, exceptions, confirmation, scroll, sticky, favicon, notes',success:true});
   console.log('DESIGN-SALTA-03 INTERACTION PASS '+name+' direct/bulk and state fidelity');
   await context.close();
  }catch(error){
   failed=true;
   report.failures.push({name,error:error.stack||String(error)});
   console.error('DESIGN-SALTA-03 INTERACTION FAIL '+name+' '+(error.stack||String(error)));
   try{const pg=browser?.contexts()?.flatMap(c=>c.pages())?.[0];if(pg)await capture(pg,name+'-FAIL');}catch{}
  }finally{await browser?.close();}
 }
 }finally{
  report.status=failed?'FAIL':'PASS';
  writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
  await new Promise(resolve=>server.close(resolve));
 }
 if(failed)process.exitCode=1;else console.log('DESIGN-SALTA-03 INTERACTION PASS ALL '+report.cases.length);
})();
