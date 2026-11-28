import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,statSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='design-salta-06-evidence';mkdirSync(out,{recursive:true});
const roots={before:resolve(process.env.SALTA_BASE_DIR),after:process.cwd()};
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer((req,res)=>{try{const [,variant,...parts]=decodeURIComponent(new URL(req.url,'http://localhost').pathname).split('/');const root=roots[variant];if(!root)throw Error('variant');let p=resolve(root,parts.join('/'));if(p!==root&&!p.startsWith(root+'/'))throw Error('path');if(statSync(p).isDirectory())p=resolve(p,'index.html');res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.statusCode=404;res.end('not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const report={protected:[],zoom:[],textResize:[],limitations:['Synthetic session only; no physical camera or live login','Print media screenshot, not physical print or optical PDF export','Native zoom via Chromium extension only; WebKit/Safari native zoom requires physical test','Text resizing via injected test CSS is not native browser preference']};
const iso=async ctx=>{await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();if(u.origin==='https://salta-stats.dannyel-moises.workers.dev'&&req.method()==='GET'){const json=u.pathname==='/auth/session'?{ok:true,authenticated:true,user:'synthetic-visual-only'}:u.pathname==='/assessments/v1/session'?{authenticated:true,principalId:'synthetic-visual-only',epoch:1,scoreFormatVersion:'salta-score-format-v1',embeddedLibraryVersion:'salta-embedded-library-v1',editorSnapshotVersion:'salta-editor-snapshot-v1',assessmentLifecycleVersion:'salta-assessment-lifecycle-v1'}:{grants:[]};return route.fulfill({json,headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'}})}return route.abort()})};
const hash=b=>createHash('sha256').update(b).digest('hex');
const measure=async(p,sel)=>p.locator(sel).evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {width:r.width,height:r.height,x:r.x,y:r.y,background:s.backgroundColor,color:s.color,font:s.fontFamily,fontSize:s.fontSize}});
const snap=async(p,name,sel)=>{await p.evaluate(()=>document.fonts.ready);const loc=p.locator(sel);await loc.waitFor({state:'visible'});const geom=await measure(p,sel);const png=await loc.screenshot({path:out+'/'+name+'.png',animations:'disabled'});return {geom,sha256:hash(png)}};
const protectedCases=[['student','index.html','body'],['legacy-print','corretor/folha-resposta.html','.page'],['optical','plataforma/corretor-v2.html','#corretorMain']];
try{
for(const [engine,width] of [[chromium,390],[chromium,1440],[webkit,390]]){
 const b=await engine.launch();try{for(const [id,path,selector] of protectedCases){
 const pair={engine:engine.name(),width,id,states:{}};try{
 for(const variant of ['before','after']){const ctx=await b.newContext({viewport:{width,height:1000},locale:'pt-BR',reducedMotion:'reduce',serviceWorkers:'block'});try{await iso(ctx);const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/'+variant+'/'+path);assert.equal(await p.locator('body.salta6').count(),0);assert.equal(await p.locator('link[href*="salta-visual/foundation.css"]').count(),0);
 const name=engine.name()+'-'+width+'-'+variant+'-'+id;const states={};
 if(id==='legacy-print'){await p.emulateMedia({media:'print'});states.print=await snap(p,name+'-print',selector);states.bubbles=await p.locator('.bubble').count();}
 else if(id==='optical'){await p.waitForFunction(()=>document.body.classList.contains('salta-auth-ready'));await p.locator('.teacher-shell-topbar').waitFor({state:'visible'});states.chrome=await snap(p,name+'-chrome','.teacher-shell-topbar');await p.locator('#preview svg').first().waitFor({state:'attached',timeout:10000});await p.locator('[data-view="cartoes"]').click();states.card=await snap(p,name+'-card','#preview');states.svgHash=hash(await p.locator('#preview svg').first().evaluate(e=>e.outerHTML));await p.locator('[data-view="corrigir"]').click();states.correction=await snap(p,name+'-correction','#corrigir');}
 else {states.page=await snap(p,name,selector);}
 pair.states[variant]={states,errors};
 }finally{await ctx.close()}}
 const a=pair.states.before.states,z=pair.states.after.states;pair.comparison=Object.fromEntries(Object.keys(a).map(k=>[k,{identical:JSON.stringify(a[k])===JSON.stringify(z[k])}]));pair.completed=true;
 }catch(e){pair.completed=false;pair.error=String(e)}report.protected.push(pair);
 }}finally{await b.close()}
}
const temp=mkdtempSync(join(tmpdir(),'salta6-zoom-'));const extension=join(temp,'extension');mkdirSync(extension);
writeFileSync(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'SALTA test browser zoom',version:'1.0',permissions:['tabs'],host_permissions:['http://127.0.0.1/*'],background:{service_worker:'worker.js'}}));writeFileSync(join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
let ctx;
try{ctx=await chromium.launchPersistentContext(join(temp,'profile'),{channel:'chromium',headless:true,viewport:null,args:['--window-size=1440,1000','--disable-extensions-except='+extension,'--load-extension='+extension],serviceWorkers:'allow',reducedMotion:'reduce'});await iso(ctx);const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:15000});const p=await ctx.newPage();
const metrics=()=>p.evaluate(()=>({innerWidth,outerWidth,devicePixelRatio,visualScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth}));
const zoom=async factor=>sw.evaluate(async({url,factor})=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);if(!tab)throw Error('tab missing');await chrome.tabs.setZoom(tab.id,factor);return chrome.tabs.getZoom(tab.id)},{url:p.url(),factor});
for(const [id,path] of [['entry','plataforma/'],['dashboard','plataforma/professor.html']]){await p.goto(origin+'/after/'+path);if(id==='dashboard')await p.locator('#inicio').waitFor({state:'visible'});await zoom(1);await p.waitForTimeout(150);const normal=await metrics();const factor=await zoom(2);await p.waitForTimeout(200);const enlarged=await metrics();assert.equal(factor,2);assert.ok(enlarged.innerWidth<normal.innerWidth*.7&&enlarged.devicePixelRatio>normal.devicePixelRatio*1.8,'native zoom not observed');await p.screenshot({path:out+'/native-zoom-200-'+id+'.png',fullPage:true});report.zoom.push({id,factor,normal,enlarged,overflow:enlarged.scrollWidth>enlarged.innerWidth+1,completed:true});await zoom(1);
const text=await p.evaluate(()=>{const nodes=[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&e instanceof HTMLElement);const sizes=nodes.map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,n] of sizes)e.style.setProperty('font-size',n*2+'px','important');return {elements:sizes.length}});await p.screenshot({path:out+'/text-resize-200-'+id+'.png',fullPage:true});const resized=await metrics();report.textResize.push({id,...text,metrics:resized,overflow:resized.scrollWidth>resized.innerWidth+1,method:'injected CSS 2x, not native preference'});}
}catch(e){report.zoom.push({completed:false,error:String(e)})}finally{await ctx?.close();rmSync(temp,{recursive:true,force:true})}
}finally{server.close();writeFileSync(out+'/acceptance-av06.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify(report,null,2));
