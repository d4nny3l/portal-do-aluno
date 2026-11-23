import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createTemplate,layoutTemplate,createLegacyTemplate} from '../omr/template.mjs';
import {createCardManifest,renderTemplateSvg} from '../omr/render.mjs';
import {validateLayoutManifest} from '../omr/layout.mjs';
import {importCardManifest} from '../omr/manifest.mjs';
import {detectFiducials,normalizeCard,warpFromFiducials} from '../omr/normalize.mjs';
import {readRaster} from '../omr/reader.mjs';
import {captureQuality} from '../omr/camera.mjs';

const near=(a,b,epsilon=.01)=>Math.abs(a-b)<=epsilon;
const make=(sections,{mode='embedded',w=140,h=200,cols=null,identity='none'}={})=>
 createTemplate(sections,{mode,embeddedSize:mode==='embedded'?{widthMm:w,heightMm:h}:null,
  identityMode:identity,showName:identity!=='none',columnCount:cols});
function raster(template,manifest,{scale=4.9,skew=0,shade=0,external=true,marks=[],code=null}={}){
 const width=1200,height=1500,gray=new Uint8Array(width*height);
 for(let y=0;y<height;y++)gray.fill(245-Math.round(shade*y/height),y*width,(y+1)*width);
 const project=(x,y)=>({x:230+scale*x+skew*y,y:145+scale*y+skew*.5*x});
 const dot=(x,y,r,ink=0)=>{
  const p=project(x,y),radius=Math.round(r*scale);
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   if(dx*dx+dy*dy>radius*radius)continue;
   const a=Math.round(p.x)+dx,b=Math.round(p.y)+dy;
   if(a>=0&&b>=0&&a<width&&b<height)gray[b*width+a]=ink;
  }
 };
 const square=(x,y)=>{
  const p=project(x,y),rad=Math.round(5.5*scale/2);
  for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){
   const a=Math.round(p.x)+dx,b=Math.round(p.y)+dy;
   if(a>=0&&b>=0&&a<width&&b<height)gray[b*width+a]=0;
  }
 };
 for(const f of manifest.technicalRegions.fiducials)square(f.x,f.y);
 if(external)for(let y=20;y<height-20;y+=65)for(let x=18;x<130;x++)gray[y*width+x]=0;
 for(const {number,choices,ink=0,r=1.8} of marks){
  const q=manifest.questions.find(q=>q.number===number);
  assert.ok(q,'question '+number);
  for(const choice of choices){const b=q.bubbles.find(b=>b.choice===choice);assert.ok(b,choice);dot(b.x,b.y,r,ink);}
 }
 if(code)for(let i=0;i<7;i++){
  const b=manifest.identityBubbles.find(b=>b.column===i+1&&b.digit===Number(code[i]));
  assert.ok(b);dot(b.x,b.y,1.9,0);
 }
 return{gray,width,height,points:manifest.technicalRegions.fiducials.map(f=>project(f.x,f.y))};
}

test('EMBED-ALIGN-01: embedded 4 markers locate the selected inner frame despite external exam text and shading',()=>{
 const t=make([{type:'A-E',count:8,label:'Matemática'}]),m=createCardManifest(t);
 const imported=importCardManifest({manifest:m});
 assert.equal(validateLayoutManifest(imported.manifest).valid,true);
 for(const cfg of [{scale:4.5,shade:0},{scale:5.1,skew:.14,shade:35}]){
  const img=raster(t,m,{...cfg,marks:[{number:1,choices:['C']},{number:2,choices:['A','E']} ]});
  const result=detectFiducials(img.gray,img.width,img.height,{manifest:m});
  assert.equal(result.found,true,'embedded fiducials found');
  for(let i=0;i<4;i++)assert.ok(Math.hypot(result.corners[i].x-img.points[i].x,result.corners[i].y-img.points[i].y)<4,'marker '+i);
  const normalized=normalizeCard(img.gray,img.width,img.height,{manifest:m,outputWidth:840,minConfidence:.7});
  assert.equal(normalized.width,840);
  assert.equal(normalized.height,1200);
  assert.equal(normalized.pixels.length,840*1200);
  const answer=readRaster(imported.template,normalized.pixels,normalized.width,normalized.height,{manifest:imported.manifest});
  assert.equal(answer.observations[0].answer,'C');
  assert.equal(answer.observations[1].answer,null,'two marks are not a definitive answer');
  assert.equal(answer.observations[2].state,'blank');
 }
});

test('EMBED-ALIGN-01: numeric seven-digit code, objective types and unsupported/invalid manifests',()=>{
 for(const type of ['A-D','A-E','C-E']){
  const t=make([{type,count:12,label:'Avaliação'}],{w:160,h:240,identity:'seven-digit-code'});
  const m=createCardManifest(t),l=layoutTemplate(t,{width:800,height:1200,manifest:m});
  assert.equal(m.identityBubbles.length,70);
  assert.equal(l.cells.length,12);
  assert.equal(m.mode,'embedded');
  assert.equal(validateLayoutManifest(m).valid,true);
  const rasterData=new Uint8Array(800*1200).fill(255);
  const mark=(b,r=6)=>{for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r){
   const xx=Math.round(b.x)+x,yy=Math.round(b.y)+y;
   if(xx>=0&&yy>=0&&xx<800&&yy<1200)rasterData[yy*800+xx]=0;
  }};
  const code='0001123';
  for(let n=0;n<7;n++)mark(l.codeGrid.find(b=>b.column===n+1&&b.digit===Number(code[n])),9);
  mark(l.cells[0].bubbles[0],9);
  const result=readRaster(t,rasterData,800,1200,{manifest:m});
  assert.equal(result.observations[0].state,'read');
  assert.equal(result.observations[1].state,'blank');
  assert.equal(result.identity.code,code);
  assert.throws(()=>readRaster(t,rasterData,800,1200,{manifest:{...m,revision:m.revision+1}}),/manifesto exato/);
  assert.throws(()=>readRaster({...t,mode:'full-page'},rasterData,800,1200,{manifest:m}),/formato físico/);
  assert.throws(()=>readRaster(t,rasterData,800,1000,{manifest:m}),/Raster inválido|proporção/);
 }
});

test('EMBED-ALIGN-01: reject unreadable small captures and wrong geometry without assigning answers',()=>{
 const t=make([{type:'A-D',count:5,label:'Geometria'}]),m=createCardManifest(t);
 const lowArea=[{x:100,y:90},{x:170,y:90},{x:170,y:190},{x:100,y:190}];
 const frame={gray:new Uint8Array(900*1000).fill(245),width:900,height:1000};
 const result=captureQuality(frame,{found:true,confidence:.96,corners:lowArea},null,{minArea:.025});
 assert.equal(result.ok,false);
 assert.match(result.message,/Aproxime/);
 const malformed={...m,technicalRegions:{...m.technicalRegions,fiducials:[]}};
 assert.throws(()=>warpFromFiducials(frame.gray,900,1000,lowArea,{manifest:malformed}),/Manifesto|marcadores/);
 assert.equal(detectFiducials(frame.gray,900,1000,{manifest:m}).found,false);
});

for(const mode of ['full-page','embedded'])for(const columns of [2,3]){
 test('EMBED-ALIGN-01: top question rows and visible centered headings align in '+columns+' columns / '+mode,()=>{
  const counts=mode==='embedded'&&columns===2?[20,20,20]:[26,28,30];
  const sections=[
   {type:'A-D',count:counts[0],label:'MATEMÁTICA'},
   {type:'A-E',count:counts[1],label:'GEOMETRIA E REPRESENTAÇÕES\nDE FIGURAS PLANAS'},
   {type:'C-E',count:counts[2],label:'ANÁLISE DE PROPOSIÇÕES MATEMÁTICAS\nE RACIOCÍNIO LÓGICO\nAPLICADO'},
  ];
  const t=make(sections,{mode,w:170,h:260,cols:columns});
  const m=createCardManifest(t),svg=renderTemplateSvg(t,{manifest:m});
  assert.equal(validateLayoutManifest(m).valid,true);
  assert.equal(m.columns.length,columns);
  const top=Math.min(...m.sections.map(f=>f.y));
  const frames=m.sections.filter(f=>near(f.y,top,.000001));
  assert.equal(frames.length,columns,'each column has a first heading');
  const firstYs=frames.map(f=>{
   const qs=m.questions.filter(q=>q.columnIndex===f.columnIndex&&q.y>=f.y&&q.y<f.y+f.height);
   assert.ok(qs.length);
   assert.ok(f.titleBandMm>=f.titleLines.length*3.38+3-1e-6);
   const q=qs.sort((a,b)=>a.y-b.y)[0];
   assert.ok(near(q.y,f.y+f.titleBandMm,.000001));
   assert.ok(svg.includes('cx="'+q.bubbles[0].x+'" cy="'+q.bubbles[0].y+'"'));
   return q.y;
  });
  assert.ok(firstYs.every(y=>near(y,firstYs[0],.000001)),'all first lines have EXACT mm Y');
  assert.equal(new Set(frames.map(f=>f.titleBandMm)).size,1,'one globally shared band');
  assert.ok(m.sections.every(f=>f.titleLines.every(line=>!line.includes('(cont.)'))));
  assert.doesNotMatch(svg,/\(cont\.\)/);
  assert.equal((svg.match(/class="omr-question"/g)||[]).length,counts.reduce((a,b)=>a+b,0));
  assert.equal((svg.match(/class="omr-fiducial"/g)||[]).length,4);
  const framesSvg=[...svg.matchAll(/<g class="omr-section-frame" data-section-id="[^"]+">([\s\S]*?)<\/g>/g)];
  assert.equal(framesSvg.length,m.sections.length);
  for(let i=0;i<m.sections.length;i++){
   const f=m.sections[i],g=framesSvg[i][1];
   assert.ok(g.includes('x="'+f.x+'"')||g.includes('class="omr-section-border"'));
   const ys=[...g.matchAll(/<text x="[^"]+" y="([^"]+)"/g)].map(x=>Number(x[1]));
   assert.ok(ys.every(y=>y>f.y&&y<f.y+f.titleBandMm),'heading text remains within its reserved band');
  }
 });
}

test('EMBED-ALIGN-01: continuation suffix does not reserve an invisible line; old imported geometry stays untouched',()=>{
 const t=make([{type:'A-E',count:150,label:'MATEMÁTICA'}],{mode:'full-page',cols:5});
 const m=createCardManifest(t),svg=renderTemplateSvg(t,{manifest:m});
 assert.ok(m.sections.some(f=>f.label.endsWith('(cont.)')));
 for(const f of m.sections){
  assert.equal(f.titleLines.length,1);
  assert.ok(near(f.titleBandMm,1*3.38+3));
 }
 assert.doesNotMatch(svg,/\(cont\.\)/);
 const previous=structuredClone(m);
 for(const f of previous.sections)delete f.titleBandMm;
 delete previous.titleAlignmentRevision;
 assert.deepEqual(previous.sections.map(f=>f.y),m.sections.map(f=>f.y));
 assert.doesNotThrow(()=>renderTemplateSvg(t,{manifest:previous}),'historical manifest display should not be rewritten');
 const v1=createLegacyTemplate([{type:'A-E',count:10,label:'Legado'}]);
 const legacyManifest=createCardManifest(v1);
 assert.equal(legacyManifest.schemaVersion,'salta-layout-manifest-v1');
 assert.equal(validateLayoutManifest(legacyManifest).valid,true);
});

test('EMBED-ALIGN-01: frontend enforces selected geometry, no second camera and no changes to Safari/INT-SCAN',()=>{
 const html=readFileSync(new URL('../../../plataforma/corretor-v2.html',import.meta.url),'utf8');
 assert.match(html,/function selectedEmbeddedManifest\(\)/);
 assert.match(html,/manifest\?Math\.round\(manifest\.paper\.widthMm\*1400\/210\):1400/);
 assert.match(html,/Aproxime a câmera do quadro/);
 assert.match(html,/const chosen=prior&&nowScore!==null/);
 assert.match(html,/function recoverSafariVideo\(\)/);
 assert.doesNotMatch(html,/Quadros incorporados: leitura automática indisponível/);
 assert.match(html,/camera\.mjs\?v=20261123embedalign01/);
});
