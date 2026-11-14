import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTemplate, layoutTemplate } from '../omr/template.mjs';
import { createCardManifest, renderTemplateSvg, DEFAULT_CARD_HEADER } from '../omr/render.mjs';
import { validateLayoutManifest } from '../omr/layout.mjs';
import { importCardManifest } from '../omr/manifest.mjs';
import { readRaster } from '../omr/reader.mjs';
import { buildPrintDocument } from '../omr/export.mjs';
const template = () => createTemplate([{type:'A-E',count:20,label:'Matemática'}]);
const header = {...DEFAULT_CARD_HEADER,teacher:'Docente Fictício',className:'2ª A',date:'2026-12-01',grade:'2ª série',schoolYear:'2026',customFields:[{label:'Sala',value:'201'},{label:'Turno',value:'Manhã'}],visible:{...DEFAULT_CARD_HEADER.visible,grade:true,schoolYear:true}};

test('header: all seven administrative fields share one band with allocated widths', () => {
 const m=createCardManifest(template(),header),band=m.panels.header.adminBand;
 assert.equal(band.cells.length,7);assert.equal(new Set(band.cells.map(c=>c.y)).size,1);
 assert.ok(Math.abs(band.cells.reduce((n,c)=>n+c.width,0)-182)<1e-6);
 for(const c of band.cells){const texts=m.panels.header.texts.filter(t=>t.id===c.id);assert.ok(texts.length<=2);assert.ok(texts.every(t=>t.box.y===band.y+2&&t.size===2.6));}
 assert.equal(validateLayoutManifest(m).valid,true);assert.match(renderTemplateSvg(template(),{manifest:m}),/01\/12\/2026/);
 assert.ok(m.panels.name.y>=band.y+band.height+3);
});

test('header: visibility is authoritative and fewer fields can reduce height', () => {
 const visible=Object.fromEntries(Object.keys(DEFAULT_CARD_HEADER.visible).map(k=>[k,false]));
 const dense=createCardManifest(template(),header);
 const one=createCardManifest(template(),{...header,customFields:[],visible:{...visible,className:true}});
 assert.equal(one.panels.header.adminBand.cells.length,1);assert.equal(one.panels.header.adminBand.cells[0].width,182);
 assert.ok(one.panels.header.frame.height<dense.panels.header.frame.height);
 const none=createCardManifest(template(),{...header,customFields:[],visible});
 assert.equal(none.panels.header.adminBand,null);assert.ok(none.panels.header.frame.height<one.panels.header.frame.height);
 assert.ok(!renderTemplateSvg(template(),{manifest:none}).includes('Docente Fictício'));
 const model=createTemplate([{type:'A-E',count:20}],{metadata:{teacher:'oculto',visibleFields:{teacher:false}}});
 assert.ok(!createCardManifest(model).panels.header.texts.some(t=>t.id==='PROFESSOR'));
});

test('header: excess content fails explicitly without smaller text or another band', () => {
 assert.throws(()=>createCardManifest(template(),{...header,teacher:'W'.repeat(180)}),/campos administrativos não cabem em uma faixa legível/);
 const hidden=createCardManifest(template(),{...header,date:'data inválida',visible:{...header.visible,date:false}});
 assert.ok(!hidden.panels.header.texts.some(t=>t.id==='DATA'));
});

test('header: duplicate semantic fields are not printed twice; conflicting values fail', () => {
 const m=createCardManifest(template(),{...header,customFields:[{label:'Professor',value:header.teacher},{label:'Sala',value:'201'},{label:'Sala',value:'201'},{label:'Escondido',value:'x',visible:false}]});
 assert.equal(m.panels.header.adminBand.cells.length,6);
 assert.throws(()=>createCardManifest(template(),{...header,customFields:[{label:'Professor',value:'Outro docente'}]}),/valores diferentes/);
});

test('header: freezing the manifest does not freeze the editor custom fields', () => {
 const customFields=[{label:'Sala',value:'201',visible:true}],input={...header,customFields};
 const first=createCardManifest(template(),input);
 customFields[0].value='202';customFields.push({label:'Turno',value:'Manhã'});
 const second=createCardManifest(template(),input);
 assert.equal(first.header.customFields[0].value,'201');assert.equal(second.header.customFields[0].value,'202');
 assert.equal(second.panels.header.adminBand.cells.length,7);
 assert.ok(Object.isFrozen(first.header.customFields));
});

test('header: nominal print batches keep two-line class capacity without reflow', () => {
 const result=buildPrintDocument(template(),{students:[{name:'Pessoa Fictícia',className:'TURMA FICTÍCIA COM NOME EXTENSO PARA CONFERENCIA'}]});
 assert.match(result,/CONFERENCIA/);assert.equal((result.match(/TURMA:/g)||[]).length,1);
});

test('logos: square, vertical and horizontal bounds, centering and continuous grayscale', () => {
 const logo='data:image/png;base64,iVBORw0KGgo=';
 for(const aspect of [1,.25,4]){
  const m=createCardManifest(template(),{...header,institution:'ESCOLA FICTÍCIA',logo,logoAspect:aspect,secondaryLogo:logo,secondaryLogoAspect:1/aspect});
  for(const l of m.panels.header.logos){assert.ok(l.width<=26&&l.height<=22);assert.ok(Math.abs(l.width/l.height-(l.side?1/aspect:aspect))<1e-9);}
  assert.ok(m.panels.header.texts.filter(t=>t.id==='institution').every(t=>t.x===105));
  assert.equal(validateLayoutManifest(m).valid,true);
  const svg=renderTemplateSvg(template(),{manifest:m});assert.match(svg,/color-interpolation-filters="sRGB"/);assert.doesNotMatch(svg,/feComponentTransfer|type="discrete"/);assert.equal((svg.match(/preserveAspectRatio="xMidYMid meet"/g)||[]).length,2);
 }
});

test('compatibility: the published V2 manifest retains exact old coordinates and is readable', () => {
 const original=JSON.parse(readFileSync(new URL('./fixtures/v2-header0.manifest.json',import.meta.url),'utf8'));
 const imported=importCardManifest(original);assert.deepEqual(imported.manifest,original);
 const w=840,h=1188,layout=layoutTemplate(imported.template,{width:w,height:h,manifest:imported.manifest});
 const pixels=new Uint8Array(w*h).fill(255),b=layout.cells[0].bubbles[2],r=Math.round(layout.cells[0].bubbleRadius*.65);
 for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)pixels[(Math.round(b.y)+y)*w+Math.round(b.x)+x]=0;
 assert.equal(readRaster(imported.template,pixels,w,h,{manifest:imported.manifest}).observations[0].answer,'C');
 assert.match(renderTemplateSvg(imported.template,{manifest:imported.manifest}),new RegExp(original.contentHash));
});
