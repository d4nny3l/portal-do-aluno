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
function fillRect(pixels,w,h,x,y,size,value){
 for(let py=Math.max(0,Math.floor(y));py<Math.min(h,Math.ceil(y+size));py++)
  for(let px=Math.max(0,Math.floor(x));px<Math.min(w,Math.ceil(x+size));px++)pixels[py*w+px]=value;
}
function scene(manifest,{left=140,top=100,scale=5,shade=255}={}){
 const width=1100,height=1250,pixels=new Uint8Array(width*height).fill(shade);
 // A simulated examination text block outside the four embedded fiducials.
 for(let y=18;y<70;y+=14)fillRect(pixels,width,height,40,y,460,2,60);
 for(let y=100;y<700;y+=23)fillRect(pixels,width,height,830,y,170,2,70);
 const spot=({x,y})=>({x:left+x*scale,y:top+y*scale});
 for(const f of manifest.technicalRegions.fiducials){
  const x=left+(f.x-f.sizeMm/2)*scale,y=top+(f.y-f.sizeMm/2)*scale;
  fillRect(pixels,width,height,x,y,f.sizeMm*scale,10);
 }
 const point=manifest.technicalRegions.fiducials.map(spot);
 return {pixels,width,height,point};
}

test('EMBED-ALIGN: physically selected embedded fiducials normalize to manifesto aspect, text outside ignored',()=>{
 const {template,manifest}=embedded();
 assert.equal(manifest.mode,'embedded');
 assert.equal(validateLayoutManifest(manifest).valid,true);
 const raster=scene(manifest);
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

test('EMBED-ALIGN: distant capture must be rejected by physical pixel-size gate in camera flow',()=>{
 const html=readFileSync(new URL('../../../plataforma/corretor-v2.html',import.meta.url),'utf8');
 assert.match(html,/side<220/);
 assert.match(html,/Aproxime a câmera do quadro/);
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
