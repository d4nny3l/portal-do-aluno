// DESIGN-SALTA-04 · ações reais na prévia sintética, localhost, sem rede externa.
(async function runInlineGrades04(){
 const assert=(await import('node:assert/strict')).default;
 const {readFileSync,mkdirSync,writeFileSync}=await import('node:fs');
 const {createServer}=await import('node:http');
 const {fileURLToPath,pathToFileURL}=await import('node:url');
 const path=(await import('node:path')).default;
 const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
 const dir=path.join(root,'tmp','atelie-v4-grade-evidence');mkdirSync(dir,{recursive:true});
 const allowed=new Set(['plataforma/atelie-salta.html','plataforma/atelie-salta-v2.css','plataforma/atelie-salta-v2-fidelity.css','plataforma/atelie-salta-v2.mjs','plataforma/atelie-salta-v2-icons.svg','plataforma/atelie-salta-v2-InterVariable.woff2','favicon.svg',...['fixtures.mjs','calendar.mjs','matrix.mjs','grade-mask.mjs','controls.mjs','compositions.mjs','favicon-a.svg','favicon-b.svg','favicon-c.svg','favicon-d.svg'].map(s=>'plataforma/atelie-salta-v2-'+s)]);
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
 const report={task:'DESIGN-SALTA-04',baseMain:'d58b3091860bc6f88feb4f8bfcececc6a816f384',cases:[],failures:[],physicalSafari:false,realData:false,network:false,merge:false};
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
   const favicon=page.locator('head link[rel=icon]');
   assert.equal(await favicon.getAttribute('href'),'./atelie-salta-v2-favicon-c.svg');
   await page.locator('#tab-telas').click();
   await page.locator('#v2-screen-choice').selectOption('15.9');
   const rootCell=(i,j)=>page.locator('#f2-matrix-slot [data-f2-cell="'+i+':'+j+'"]');
   const editor=(i,j)=>page.locator('#f2-matrix-slot [data-f2-grade-input="'+i+':'+j+'"]');
   const precision=page.locator('#f2-matrix-slot [data-f2-grade-precision]');
   const feedback=page.locator('#f2-matrix-slot [data-f2-matrix-feedback]');
   const paste=async(input,value)=>{
    await input.evaluate((el,text)=>{
     const event=new Event('paste',{bubbles:true,cancelable:true});
     Object.defineProperty(event,'clipboardData',{value:{getData:()=>text}});
     el.dispatchEvent(event);
    },value);
   };
   assert.equal(await precision.inputValue(),'1');
   assert.equal(await page.locator('#f2-matrix-slot .f2-sheet thead tr').count(),2);
   assert.equal(await page.locator('#f2-matrix-slot .f2-sheet tbody tr').count(),30);
   assert.equal(await page.locator('#f2-matrix-slot .f2-student-header').evaluate(el=>getComputedStyle(el).position),'sticky');
   await capture(page,name+'-grades-before');
   // Zero e não lançado vêm de fixtures distintos, nenhum dado preexistente é reinterpretado.
   assert.equal(await rootCell(0,0).innerText(),'0*');
   assert.equal(await rootCell(1,1).innerText(),'—');
   await rootCell(0,0).click();
   assert.equal(await page.locator('#f2-matrix-slot [role=dialog]').count(),0);
   assert.equal(await editor(0,0).inputValue(),'0');
   await editor(0,0).pressSequentially('100');
   assert.equal(await editor(0,0).inputValue(),'10,0');
   const beforeSilence=await feedback.innerText();
   const selection=await editor(0,0).evaluate(el=>[el.selectionStart,el.selectionEnd]);
   await editor(0,0).press('1');
   assert.equal(await editor(0,0).inputValue(),'10,0');
   assert.deepEqual(await editor(0,0).evaluate(el=>[el.selectionStart,el.selectionEnd]),selection);
   assert.equal(await feedback.innerText(),beforeSilence);
   assert.equal(await page.locator('#f2-matrix-slot [role=alert]').count(),0);
   await editor(0,0).press('Escape');
   assert.equal(await rootCell(0,0).innerText(),'0*');
   if(touch)await rootCell(2,0).tap();else await rootCell(2,0).click();
   await editor(2,0).pressSequentially('10');
   assert.equal(await editor(2,0).inputValue(),'1,0');
   await editor(2,0).press('Enter');
   assert.equal(await rootCell(2,0).innerText(),'1,0');
   assert.equal(await editor(3,0).count(),1,'Enter avança na mesma avaliação');
   await editor(3,0).pressSequentially('25');
   assert.equal(await editor(3,0).inputValue(),'2,5');
   await editor(3,0).press('Tab');
   assert.equal(await rootCell(3,0).innerText(),'2,5');
   assert.equal(await editor(3,1).count(),1,'Tab avança para a avaliação seguinte');
   await editor(3,1).press('Escape');
   await rootCell(4,0).click();
   await editor(4,0).pressSequentially('100');
   assert.equal(await editor(4,0).inputValue(),'10,0');
   await editor(4,0).press('1');
   assert.equal(await editor(4,0).inputValue(),'10,0');
   await editor(4,0).press('Enter');
   await editor(5,0).press('Escape');
   // Máximo B = 8 (não apenas teto geral 10).
   await rootCell(5,1).click();
   await editor(5,1).pressSequentially('80');
   assert.equal(await editor(5,1).inputValue(),'8,0');
   await editor(5,1).press('1');
   assert.equal(await editor(5,1).inputValue(),'8,0');
   await editor(5,1).press('Escape');
   // Zero lançado e campo vazio são estados distintos.
   await rootCell(1,1).click();
   await editor(1,1).press('0');
   assert.equal(await editor(1,1).inputValue(),'0,0');
   await editor(1,1).press('Enter');
   assert.equal(await rootCell(1,1).innerText(),'0,0');
   await editor(2,1).press('Escape');
   await rootCell(1,1).click();
   await editor(1,1).press('Backspace');
   assert.equal(await editor(1,1).inputValue(),'');
   await editor(1,1).press('Enter');
   assert.equal(await rootCell(1,1).innerText(),'—');
   await editor(2,1).press('Escape');
   // Sem máscara retroativa: o novo parâmetro não reescreve notas antigas.
   const original=await rootCell(2,0).innerText();
   await precision.selectOption('0');
   assert.equal(await rootCell(2,0).innerText(),original);
   await rootCell(6,0).click();
   await editor(6,0).pressSequentially('10');
   assert.equal(await editor(6,0).inputValue(),'10');
   await editor(6,0).press('1');assert.equal(await editor(6,0).inputValue(),'10');
   await editor(6,0).press('Escape');
   await precision.selectOption('2');
   assert.equal(await rootCell(2,0).innerText(),original);
   await rootCell(7,0).click();
   await editor(7,0).pressSequentially('10');
   assert.equal(await editor(7,0).inputValue(),'0,10');
   await editor(7,0).press('Escape');
   await rootCell(8,0).click();
   await editor(8,0).pressSequentially('245');
   assert.equal(await editor(8,0).inputValue(),'2,45');
   await editor(8,0).press('Enter');
   assert.equal(await rootCell(8,0).innerText(),'2,45');
   await editor(9,0).press('Escape');
   await rootCell(9,0).click();
   await editor(9,0).pressSequentially('1000');
   assert.equal(await editor(9,0).inputValue(),'10,00');
   const silent=await feedback.innerText();
   await editor(9,0).press('1');
   assert.equal(await editor(9,0).inputValue(),'10,00');
   assert.equal(await feedback.innerText(),silent);
   // Colagem decimal explícita conserva valor; inteiro colado NÃO vira centésimos.
   await editor(9,0).press('ControlOrMeta+A');
   await paste(editor(9,0),'2,45');
   assert.equal(await editor(9,0).inputValue(),'2,45');
   for(const badValue of ['2,345','12,2222','10,01','12','1e2','-1','2,4,5']){
    const snap=await editor(9,0).inputValue(),fback=await feedback.innerText();
    await paste(editor(9,0),badValue);
    assert.equal(await editor(9,0).inputValue(),snap,badValue);
    assert.equal(await feedback.innerText(),fback);
   }
   await paste(editor(9,0),'10');
   assert.equal(await editor(9,0).inputValue(),'10,00','Inteiro colado significa dez, não 0,10');
   await editor(9,0).press('Escape');
   if(name==='chromium-390'||name==='chromium-1440'||name==='webkit-390')await capture(page,name+'-grades-inline');
   // Mantém o mesmo scroller quando uma célula distante é editada.
   const sheet=page.locator('#f2-matrix-slot [data-f2-scroll]');
   await sheet.evaluate(el=>{el.scrollTop=370;el.scrollLeft=170;el.dataset.identity='kept-grade';});
   await rootCell(25,2).click();
   assert.equal(await sheet.getAttribute('data-identity'),'kept-grade');
   assert.equal(await editor(25,2).count(),1);
   assert.equal(await page.locator('#f2-matrix-slot .f2-sheet td.f2-active-cell').count(),1);
   await editor(25,2).pressSequentially('25');
   assert.equal(await editor(25,2).inputValue(),'0,25');
   await editor(25,2).press('Escape');
   assert.equal(await sheet.getAttribute('data-identity'),'kept-grade');
   // Coluna Resultado jamais editável; Chamada e Vistos seguem intactos.
   assert.equal(await rootCell(25,3).isDisabled(),true);
   await page.locator('#v2-screen-choice').selectOption('15.8');
   await rootCell(0,0).click();
   assert.equal(await rootCell(0,0).locator('.f2-code').innerText(),'F');
   await page.locator('[data-f2-action=matrix-att-all-p]').click();
   assert.match(await page.locator('[data-f2-counts]').innerText(),/P 30/);
   await page.locator('#v2-screen-choice').selectOption('15.10');
   assert.equal(await rootCell(0,3).locator('.f2-code').innerText(),'—');
   await rootCell(0,3).click();
   assert.equal(await rootCell(0,3).locator('.f2-code').innerText(),'✓');
   await page.locator('[data-f2-activity-select]').selectOption('3');
   await page.locator('[data-f2-action=matrix-check-all-not]').click();
   assert.match(await page.locator('[data-f2-matrix-feedback]').innerText(),/30 estudantes/);
   assert.deepEqual(errors,[]);
   assert.deepEqual(external,[]);
   assert.deepEqual(bad,[]);
   report.cases.push({name,width,height,touch,assertions:'0/1/2 precision, exact maximum, paste semantics, silent guard, focus, scroll, Enter/Tab/Escape, regressions 03',success:true});
   console.log('DESIGN-SALTA-04 GRADE PASS '+name+' inline/exact/silent/paste/navigation');
   await context.close();
  }catch(error){
   failed=true;
   report.failures.push({name,error:error.stack||String(error)});
   console.error('DESIGN-SALTA-04 GRADE FAIL '+name+' '+(error.stack||String(error)));
   try{const pg=browser?.contexts()?.flatMap(c=>c.pages())?.[0];if(pg)await capture(pg,name+'-FAIL');}catch{}
  }finally{await browser?.close();}
 }
 }finally{
  report.status=failed?'FAIL':'PASS';
  writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
  await new Promise(resolve=>server.close(resolve));
 }
 if(failed)process.exitCode=1;else console.log('DESIGN-SALTA-04 GRADE PASS ALL '+report.cases.length);
})();
