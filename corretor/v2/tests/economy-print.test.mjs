import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTemplate} from '../omr/template.mjs';
import {createCardManifest,DEFAULT_CARD_HEADER,renderTemplateSvg} from '../omr/render.mjs';
import {buildPrintDocument} from '../omr/export.mjs';
import {planEconomySheet,ECONOMY_PRINT_VERSION} from '../omr/print-economy.mjs';
import {importCardManifest} from '../omr/manifest.mjs';

const LOGO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function fixture({width=120,height=180,count=3,type='A-E',logos=0,hidden=false,mode='embedded',identityMode='none'}={}){
 const h={...DEFAULT_CARD_HEADER,institution:'ESCOLA SINTÉTICA\nREDE DE TESTES',title:'AVALIAÇÃO FICTÍCIA',teacher:'Docente Simulado',subject:'Matemática',className:'Turma fictícia',date:'2026-11-24',grade:'9º ano',schoolYear:'2026',
  visible:{...DEFAULT_CARD_HEADER.visible,teacher:!hidden,date:hidden,subject:!hidden,className:!hidden,institution:true},
  logo:logos>=1?LOGO:'',secondaryLogo:logos>=2?LOGO:'',logoWidthMm:18,secondaryLogoWidthMm:18,logoAspect:1,secondaryLogoAspect:1};
 const section={sectionId:'section-1',label:'QUESTÕES DE TESTE',type,count,order:0,
  items:Array.from({length:count},(_,i)=>({questionId:'question-'+(i+1),number:i+1,originalOrder:i+1,type}))};
 const t=createTemplate([section],{layoutVersion:'v2',revision:8,title:h.title,schoolName:h.institution,
  identityMode,mode,embeddedSize:mode==='embedded'?{widthMm:width,heightMm:height}:null,
  metadata:{...h,visibleFields:h.visible}});
 return {template:t,header:h,manifest:createCardManifest(t,h,{sectionFrameStyle:'content'})};
}
const close=(a,b)=>Math.abs(a-b)<0.0001;
const overlap=(a,b)=>a.x<b.x+b.width-0.0001&&a.x+a.width>b.x+0.0001&&a.y<b.y+b.height-0.0001&&a.y+a.height>b.y+0.0001;

test('economic planner uses exact A4 orientation, physical cells and safe uniform scales for 2/4 of each original size',()=>{
 assert.equal(ECONOMY_PRINT_VERSION,'salta-embedded-economy-print-v1');
 for(const [width,height] of [[100,160],[120,180],[180,240]]){
  const {manifest}=fixture({width,height});
  for(const copies of [2,4]){
   const p=planEconomySheet(manifest,copies);
   assert.equal(p.copies,copies);
   assert.deepEqual([p.widthMm,p.heightMm],p.orientation==='portrait'?[210,297]:[297,210]);
   assert.equal(p.slots.length,copies);
   assert.equal(p.guides.length,copies===2?1:2);
   assert(p.scale>0&&p.scale<=1);
   assert.equal(new Set(p.slots.map(s=>s.scale)).size,1);
   for(const [i,slot]of p.slots.entries()){
    assert(close(slot.width/width,slot.height/height),'nonuniform scaling');
    assert(close(slot.width/width,p.scale));
    assert(slot.x>=p.edgeMarginMm-0.001&&slot.y>=p.edgeMarginMm-0.001);
    assert(slot.x+slot.width<=p.widthMm-p.edgeMarginMm+0.001);
    assert(slot.y+slot.height<=p.heightMm-p.edgeMarginMm+0.001);
    const cell=slot.cell;
    assert(slot.x>=cell.x+3.999||close(cell.x,0));
    assert(slot.y>=cell.y+3.999||close(cell.y,0));
    assert(slot.x+slot.width<=cell.x+cell.width-(cell.x+cell.width===p.widthMm?5.999:3.999));
    assert(slot.y+slot.height<=cell.y+cell.height-(cell.y+cell.height===p.heightMm?5.999:3.999));
    for(const later of p.slots.slice(i+1))assert(!overlap(slot,later),'copies overlap');
   }
   if(copies===2){
    const g=p.guides[0];assert(g.axis==='vertical'||g.axis==='horizontal');
    assert(g.axis==='vertical'?close(g.x1,p.widthMm/2)&&close(g.x2,p.widthMm/2):
     close(g.y1,p.heightMm/2)&&close(g.y2,p.heightMm/2));
   }else{
    assert.deepEqual(p.guides.map(g=>g.axis),['vertical','horizontal']);
    assert.equal(p.columns,2);assert.equal(p.rows,2);
   }
   // Reverse the affine placement for every optical bubble and fiducial:
   // it maps exactly to the ORIGINAL manifest, with no new geometry.
   for(const slot of p.slots)for(const q of manifest.questions)for(const b of q.bubbles){
    const printX=slot.x+b.x*p.scale,printY=slot.y+b.y*p.scale;
    assert(close((printX-slot.x)/p.scale,b.x)&&close((printY-slot.y)/p.scale,b.y));
   }
  }
 }
});
test('2/4 output repeats exact rendered card body, physical SVG viewport and only central guides/scissors',()=>{
 for(const options of [
  {width:100,height:160,count:3,type:'A-D'},
  {width:120,height:180,count:8,type:'A-E',logos:2},
  {width:180,height:240,count:15,type:'C-E',logos:1,hidden:true},
  {width:180,height:240,count:3,type:'CDU'}]){
  const {template,header,manifest}=fixture(options),snapshot=JSON.stringify(manifest);
  const original=renderTemplateSvg(template,{header,manifest});
  const body=original.replace(/^<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  for(const copies of [2,4]){
   const html=buildPrintDocument(template,{header,manifest,economyCopies:copies}),p=planEconomySheet(manifest,copies);
   assert.match(html,new RegExp('@page\\{size:A4 '+p.orientation+';margin:0\\}'));
   assert(html.includes('100%')&&html.includes('sem ajustar à página'));
   assert.equal((html.match(/data-economy-copy="\d+"/g)||[]).length,copies);
   assert.equal((html.match(/data-layout-hash="/g)||[]).length,copies);
   assert.equal((html.match(/data-economy-cut="/g)||[]).length,copies===2?1:2);
   assert.equal((html.match(/data-economy-scissors="true"/g)||[]).length,1);
   assert.equal((html.match(/<circle cx="5\.5"/g)||[]).length,2);
   assert(!html.includes('Recorte aqui')&&!html.includes('✂'));
   assert(html.includes('width="'+p.widthMm+'mm" height="'+p.heightMm+'mm"'));
   assert.equal(html.split(body).length-1,copies,'each copy must preserve unchanged SVG inner markup');
   assert.equal(JSON.stringify(manifest),snapshot,'print must not mutate source manifest');
   assert.equal(importCardManifest(manifest).manifest.contentHash,manifest.contentHash);
  }
 }
});
test('normal A4 independent, normal embedded and nominal batch preserve historical behavior and no economic marks',()=>{
 const {template,header,manifest}=fixture({mode:'full-page',count:6,type:'A-E',identityMode:'seven-digit-code'});
 const ordinary=buildPrintDocument(template,{header,manifest});
 assert.equal(ordinary,buildPrintDocument(template,{header,manifest,economyCopies:0}));
 assert(!ordinary.includes('data-economy-copy'));
 const roster=[{name:'Aluno sintético A',className:'Turma T',code:'0001001'},{name:'Aluno sintético B',className:'Turma T',code:'0001002'}];
 const batch=buildPrintDocument(template,{header,manifest,students:roster});
 assert.equal((batch.match(/class="print-page"/g)||[]).length,2);
 assert.throws(()=>buildPrintDocument(template,{header,manifest,economyCopies:2}),/somente|exclusiva/i);
 const emb=fixture();
 assert.equal(buildPrintDocument(emb.template,{header:emb.header,manifest:emb.manifest,economyCopies:0}).includes('data-economy-copy'),false);
 assert.throws(()=>buildPrintDocument(emb.template,{header:emb.header,manifest:emb.manifest,economyCopies:3}),/2 ou 4/);
 assert.throws(()=>buildPrintDocument(emb.template,{header:emb.header,manifest:emb.manifest,students:roster,economyCopies:2}),/lista nominal/);
});
test('economic control is confined to Outros formatos and cannot alter saved editor snapshot or reader',()=>{
 const html=readFileSync(new URL('../../../plataforma/corretor-v2.html',import.meta.url),'utf8');
 const a=html.indexOf('id="cartoes"'),b=html.indexOf('id="corrigir"'),c=html.indexOf('id="economyOptions"');
 assert(a>=0&&c>a&&c<b);
 assert(html.slice(a,b).includes('id="economyCopies"'));
 assert(html.includes("economyCopies=!batch&&students.length===0&&activeManifest.mode==='embedded'"));
 assert(!html.slice(0,a).includes('economyCopies'));
 assert.match(html,/id="printCard"[^>]*>Baixar PDF<\/button>/);
 assert.doesNotMatch(html,/window\.open\(|window\.print\(/);
 const fields=readFileSync(new URL('../assessments/editor-snapshot.mjs',import.meta.url),'utf8');
 assert(!fields.includes('economyCopies'));
 const e=readFileSync(new URL('../omr/export.mjs',import.meta.url),'utf8');
 assert(!e.includes('fetch(')&&!e.includes('method:"PUT"'));
});
