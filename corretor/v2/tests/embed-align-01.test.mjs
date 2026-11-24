import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTemplate,layoutTemplate,createLegacyTemplate} from '../omr/template.mjs';
import {createCardManifest,renderTemplateSvg} from '../omr/render.mjs';
import {normalizeCard,warpFromFiducials,detectFiducials} from '../omr/normalize.mjs';
import {readRaster} from '../omr/reader.mjs';
import {validateLayoutManifest} from '../omr/layout.mjs';

function embedded(label='MATEMÁTICA',widthMm=100,heightMm=180,code=false){
 const template=createTemplate([{label,type:'A-E',count:10}],{
  mode:'embedded',embeddedSize:{widthMm,heightMm},identityMode:code?'seven-digit-code':'none',
  showName:false,columnCount:2});
 return {template,manifest:createCardManifest(template)};
}
function fillRect(pixels,w,h,x,y,spanW,spanH,value){
 for(let py=Math.max(0,Math.floor(y));py<Math.min(h,Math.ceil(y+spanH));py++)
  for(let px=Math.max(0,Math.floor(x));px<Math.min(w,Math.ceil(x+spanW));px++)pixels[py*w+px]=value;
}
function scene(manifest,{left=140,top=100,scale=5,shade=255,skew=0}={}){
 const width=1100,height=1250,pixels=new Uint8Array(width*height).fill(shade);
 // A simulated examination text block outside the four embedded fiducials.
 for(let y=18;y<70;y+=14)fillRect(pixels,width,height,40,y,460,2,60);
 for(let y=100;y<700;y+=23)fillRect(pixels,width,height,830,y,170,2,70);
 const spot=({x,y})=>({x:left+x*scale+skew*y,y:top+y*scale+skew*x*.25});
 for(const f of manifest.technicalRegions.fiducials){
  const point=spot(f),size=f.sizeMm*scale;
  fillRect(pixels,width,height,point.x-size/2,point.y-size/2,size,size,10);
 }
 const point=manifest.technicalRegions.fiducials.map(spot);
 return {pixels,width,height,point};
}

test('EMBED-ALIGN: physically selected embedded fiducials normalize to manifesto aspect, text outside ignored',()=>{
 const {template,manifest}=embedded();
 assert.equal(manifest.mode,'embedded');
 assert.equal(validateLayoutManifest(manifest).valid,true);
 const raster=scene(manifest);
 const detected=detectFiducials(raster.pixels,raster.width,raster.height);
 assert.equal(detected.found,true,'find four embedded markers without selecting external exam text');
 for(let i=0;i<4;i++)assert.ok(Math.hypot(detected.corners[i].x-raster.point[i].x,detected.corners[i].y-raster.point[i].y)<14,'physical fiducial order');
 const actual=warpFromFiducials(raster.pixels,raster.width,raster.height,raster.point,{outputWidth:700,manifest});
 assert.equal(actual.height,1260);
 const result=readRaster(template,actual.pixels,actual.width,actual.height,{manifest,showCode:false});
 assert.equal(result.observations.length,10);
 assert.equal(result.layoutVersion,'v2');
 assert.ok(result.observations.every(q=>q.state!=='read'),'external exam text must not become an answer');
 const svg=renderTemplateSvg(template,{manifest});
 assert.equal((svg.match(/class="omr-fiducial"/g)||[]).length,4);
 for(const f of manifest.technicalRegions.fiducials)
  assert.ok(svg.includes('data-marker="'+f.markerId+'"'));
});

test('EMBED-ALIGN: embedded manifest mismatch and malformed fiducial positions fail closed',()=>{
 const {template,manifest}=embedded();
 const raster=scene(manifest),full=warpFromFiducials(raster.pixels,raster.width,raster.height,raster.point,{outputWidth:600,manifest});
 const different={...manifest,mode:'full-page'};
 assert.throws(()=>readRaster(template,full.pixels,full.width,full.height,{manifest:different}),/manifesto|formato físico|modelo|inválido/i);
 assert.throws(()=>readRaster(template,full.pixels,full.width,full.height,{manifest:null}),/manifesto/i);
 const corrupt={...manifest,technicalRegions:{...manifest.technicalRegions,fiducials:manifest.technicalRegions.fiducials.slice(0,3)}};
 assert.throws(()=>warpFromFiducials(raster.pixels,raster.width,raster.height,raster.point,{outputWidth:600,manifest:corrupt}),/Geometria/);
 const a4=createLegacyTemplate([{type:'A-D',count:10,label:'Legado'}]);
 assert.ok(layoutTemplate(a4,{width:420,height:594}));
});

test('EMBED-ALIGN: manifest selection, frame choice and Safari recovery wiring remain present',()=>{
 const html=readFileSync(new URL('../../../plataforma/corretor-v2.html',import.meta.url),'utf8');
 assert.match(html,/validateLayoutManifest\(manifest\)\.valid/);
 assert.match(html,/scanBestFrame/);
 assert.match(html,/function recoverSafariVideo\(\)/);
});

for(const mode of ['full-page','embedded']){
 for(const cols of [2,3]){
  test('EMBED-ALIGN: first rows vertically equal in '+mode+', '+cols+' columns and SVG titles fit',()=>{
   const names=['CURTA','TÍTULO MAIS LONGO QUE OCUPA DUAS LINHAS','TÍTULO DE GEOMETRIA MATEMÁTICA E ESTATÍSTICA COM MUITAS PALAVRAS'];
   const groups=names.map((label,i)=>({label:typeAdjust(label),type:'A-D',count:cols===3&&mode==='full-page'?35:12}));
   function typeAdjust(label){return cols===3&&mode==='full-page'?label.slice(0,37):label}
   const options={mode,columnCount:cols,identityMode:'none',showName:false,
    ...(mode==='embedded'?{embeddedSize:{widthMm:180,heightMm:240}}:{})};
   const template=createTemplate(groups,options),manifest=createCardManifest(template);
   assert.equal(validateLayoutManifest(manifest).valid,true);
   const columns=[...new Set(manifest.questions.map(q=>q.columnIndex))];
   assert.equal(columns.length,cols);
   const starts=columns.map(col=>Math.min(...manifest.questions.filter(q=>q.columnIndex===col).map(q=>q.y)));
   assert.ok(Math.max(...starts)-Math.min(...starts)<1e-6,'first bubble rows align globally '+JSON.stringify(starts));
   const top=manifest.sections.filter(f=>f.y===Math.min(...manifest.sections.map(g=>g.y)));
   assert.equal(new Set(top.map(x=>x.heading)).size,1);
   assert.ok(top.every(f=>!f.titleLines.join(' ').includes('(cont.)')));
   const svg=renderTemplateSvg(template,{manifest});
   for(const q of manifest.questions.slice(0,5)){
    assert.match(svg,new RegExp('data-question="'+q.number+'"'));
   }
   assert.equal((svg.match(/class="omr-question"/g)||[]).length,manifest.questionCount);
   assert.ok(!svg.includes('(cont.)</text>'));
  });
 }
}

function paintDisc(pixels,w,h,cx,cy,r,shade=0){
 for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
  for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++)
   if((x-cx)**2+(y-cy)**2<=r*r)pixels[y*w+x]=shade;
}
test('EMBED-ALIGN: A-E strong, double, blank, and ambiguous marks from one embedded photo keep decisions safe',()=>{
 const {template,manifest}=embedded();
 const image=scene(manifest,{shade:236,scale:5});
 const marks=[{question:1,choices:['B']},{question:2,choices:['A','C']},{question:4,choices:['E'],shade:120}];
 for(const mark of marks){
  const question=manifest.questions.find(q=>q.number===mark.question);
  for(const choice of mark.choices){
   const b=question.bubbles.find(b=>b.choice===choice);
   paintDisc(image.pixels,image.width,image.height,140+b.x*5,100+b.y*5,b.radiusMm*5*.96,mark.shade??0);
  }
 }
 const normalized=warpFromFiducials(image.pixels,image.width,image.height,image.point,{outputWidth:700,manifest});
 const read=readRaster(template,normalized.pixels,normalized.width,normalized.height,{manifest,showCode:false});
 const byNumber=n=>read.observations.find(q=>q.number===n);
 assert.equal(byNumber(1).state,'read');assert.equal(byNumber(1).answer,'B');
 assert.notEqual(byNumber(2).state,'read','double cannot become definite answer');
 assert.equal(byNumber(2).answer,null);
 assert.equal(byNumber(3).state,'blank');
 assert.ok(['read','review','blank'].includes(byNumber(4).state));
 assert.equal(byNumber(2).marks.length,2);
});
test('EMBED-ALIGN: physical seven-digit ID in wide embedded frame remains readable',()=>{
 const {template,manifest}=embedded('IDENTIFICAÇÃO',180,240,true);
 const image=scene(manifest,{left:130,top:80,scale:3.5});
 const code='0123456';
 for(const bubble of manifest.identityBubbles){
  if(code[ bubble.column-1 ]!==String(bubble.digit))continue;
  paintDisc(image.pixels,image.width,image.height,130+bubble.x*3.5,80+bubble.y*3.5,bubble.radiusMm*3.5*.96);
 }
 const n=warpFromFiducials(image.pixels,image.width,image.height,image.point,{outputWidth:900,manifest});
 const read=readRaster(template,n.pixels,n.width,n.height,{manifest,showCode:true});
 assert.equal(read.identity.state,'read');
 assert.equal(read.identity.code,code);
 assert.ok(read.observations.every(x=>x.state==='blank'));
});
test('EMBED-ALIGN: short/near physical frame, tilted source and less illumination preserve manifest ratio',()=>{
 const {manifest}=embedded('CIÊNCIAS',100,180);
 const compact=scene(manifest,{left:300,top:190,scale:2,shade:210});
 const near=scene(manifest,{left:140,top:100,scale:5,shade:225,skew:.12});
 assert.throws(()=>warpFromFiducials(compact.pixels,compact.width,compact.height,compact.point,{outputWidth:600,manifest}),/Aproxime a câmera do quadro/);
 for(const photo of [near]){
  const warped=warpFromFiducials(photo.pixels,photo.width,photo.height,photo.point,{outputWidth:600,manifest});
  assert.equal(warped.height,1080);
  assert.equal(warped.pixels.length,600*1080);
 }
 assert.ok(Math.min(...compact.point.map((p,i)=>Math.hypot(p.x-compact.point[(i+1)%4].x,p.y-compact.point[(i+1)%4].y)))<220);
});


const tooSmall='Aproxime a câmera do quadro para ler as marcações com segurança.';
function resolutionScene(side){
 const width=600,height=600,pixels=new Uint8Array(width*height).fill(255);
 const point=[{x:100,y:80},{x:100+side,y:80},{x:100+side,y:480},{x:100,y:480}];
 for(const {x,y} of point)fillRect(pixels,width,height,x-4,y-4,9,9,0);
 return {pixels,width,height,point};
}
test('CAM-EMBED-01: detected source edges 219/220 px gate imported photographs and explicit corners identically',()=>{
 const {template,manifest}=embedded();
 for(const side of [219,220,260]){
  const p=resolutionScene(side),d=detectFiducials(p.pixels,p.width,p.height);
  assert.equal(d.found,true);
  assert.deepEqual(d.corners,p.point,'exact source-pixel boundary, not normalized output');
  const options={manifest,outputWidth:600,minConfidence:.7};
  for(const normalize of [
   ()=>normalizeCard(p.pixels,p.width,p.height,options),
   ()=>warpFromFiducials(p.pixels,p.width,p.height,p.point,options)
  ]){
   if(side<220)assert.throws(normalize,e=>e.message===tooSmall);
   else{
    const n=normalize();
    assert.equal(n.width,600);
    const result=readRaster(template,n.pixels,n.width,n.height,{manifest,showCode:false});
    assert.equal(result.observations.length,10);
    assert.ok(result.observations.every(q=>q.state==='blank'));
   }
  }
 }
});
test('CAM-EMBED-01: small A4 source continues through V1 and V2 readers',()=>{
 const p=resolutionScene(219);
 for(const template of [
  createLegacyTemplate([{type:'A-D',count:10,label:'Legado'}]),
  createTemplate([{type:'A-D',count:10,label:'Atual'}],{layoutVersion:'v2'})
 ]){
  const manifest=createCardManifest(template);
  for(const n of [
   normalizeCard(p.pixels,p.width,p.height,{outputWidth:600,manifest,minConfidence:.7}),
   warpFromFiducials(p.pixels,p.width,p.height,p.point,{outputWidth:600,manifest})
  ]){
   const result=readRaster(template,n.pixels,n.width,n.height,{manifest,showCode:false});
   assert.equal(result.observations.length,10);
  }
 }
});
test('CAM-EMBED-01: real frontend capture and import flow rejects, never reads or scores rejected frame, and retries same selected model',async()=>{
 const {template,manifest}=embedded();
 const html=readFileSync(new URL('../../../plataforma/corretor-v2.html',import.meta.url),'utf8');
 // Execute production functions; browser decoding/drawing and UI sinks are synthetic.
 const from=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return html.slice(a,b)};
 const source=[
  from('function markLastReadingPending()','function toPageRaster('),
  from('function toPageRaster(','async function loadPhoto('),
  from('async function loadPhoto(',"$('file').onchange="),
  from('function readNormalized(',"$('manualAlign').onclick=")
 ].join('\n');
 const prelude=[
 "let rawRaster=null,normalizedRaster=null,manualMode=false,manualPoints=[],currentPage=1,assessmentBank=null,headerState={showStudentCode:false},replaceLastCapture=false,activeHistoryEntry=null,scanHistory=[],reads=0,scores=0,message='';",
 "const elements=new Map();",
 "const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,textContent:'',innerHTML:'',dataset:{review:'false'},value:'1',classList:{remove(){}}});return elements.get(id)};",
 "const setScanMessage=m=>{message=m};",
 "const updateCaptureComparison=()=>{},paintGray=()=>{},showCameraGrade=()=>{},ensureScanTemplate=()=>{},renderHistory=()=>{};",
 "const renderAnswers=result=>{reads++;$('scanScore').hidden=false;$('scanScore').dataset.stale='false';$('scanScore').dataset.review=String(result.needsReview)};",
 "const calculateScore=()=>{scores++};",
 "const createImageBitmap=async file=>({width:file.scene.width,height:file.scene.height,scene:file.scene,close(){}});",
 "const document={createElement(){const canvas={width:0,height:0};canvas.getContext=()=>({canvas,drawImage(bitmap){canvas.scene=bitmap.scene},getImageData(){return {data:canvas.scene.pixels}}});return canvas}};",
 "const grayFromRgba=data=>data;"
 ].join('\n');
 const make=new Function('template','activeManifest','detectFiducials','normalizeCard','warpFromFiducials','readRaster','validateLayoutManifest',prelude+'\n'+source+
  '\nreturn {prepareImage,loadPhoto,readNormalized,snapshot:()=>({template,activeManifest,normalizedRaster,scanHistory:[...scanHistory],reads,scores,status:$("status").textContent,message,stale:$("scanScore").dataset.stale})};');
 const ui=make(template,manifest,detectFiducials,normalizeCard,warpFromFiducials,readRaster,validateLayoutManifest);
 const small=resolutionScene(219),valid=resolutionScene(220);
 const file=scene=>({type:'image/png',size:scene.pixels.length,scene});
 await ui.loadPhoto(file(small));
 let state=ui.snapshot();
 assert.equal(state.status,tooSmall);assert.equal(state.message,tooSmall);
 assert.equal(state.normalizedRaster,null);assert.equal(state.reads,0);assert.equal(state.scores,0);assert.equal(state.scanHistory.length,0);
 assert.equal(ui.readNormalized(),null,'read button cannot bypass rejection');
 assert.equal(ui.snapshot().reads,0);assert.equal(ui.snapshot().scores,0);
 await ui.loadPhoto(file(valid));
 state=ui.snapshot();
 assert.ok(state.normalizedRaster);assert.equal(state.reads,1);assert.equal(state.scores,1);assert.equal(state.scanHistory.length,1);
 assert.equal(state.template,template);assert.equal(state.activeManifest,manifest);
 for(const automatic of [true,false]){
  const prior=ui.snapshot();
  assert.equal(ui.prepareImage(small.pixels,small.width,small.height,{automatic,manualCorners:small.point}),null);
  state=ui.snapshot();
  assert.equal(state.status,tooSmall);assert.equal(state.normalizedRaster,null);assert.equal(state.stale,'true');
  assert.equal(state.reads,prior.reads);assert.equal(state.scores,prior.scores);assert.equal(state.scanHistory.length,prior.scanHistory.length);
  assert.equal(ui.readNormalized(),null);
  assert.ok(ui.prepareImage(valid.pixels,valid.width,valid.height,{automatic,manualCorners:valid.point}));
  if(!automatic)assert.ok(ui.readNormalized());
  state=ui.snapshot();assert.equal(state.reads,prior.reads+1);assert.equal(state.scores,prior.scores+1);
  assert.equal(state.template,template);assert.equal(state.activeManifest,manifest);
 }
});
