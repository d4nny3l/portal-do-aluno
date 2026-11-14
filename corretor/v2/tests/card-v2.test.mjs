import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplate,createLegacyTemplate,layoutTemplate}from'../omr/template.mjs';
import{createCardManifest,renderTemplateSvg,DEFAULT_CARD_HEADER}from'../omr/render.mjs';
import{validateLayoutManifest}from'../omr/layout.mjs';
import{readRaster}from'../omr/reader.mjs';
import{importCardManifest}from'../omr/manifest.mjs';
import{buildManifestJson,buildPrintDocument}from'../omr/export.mjs';
const create=(n=20,type='A-E',opts={})=>createTemplate([{type,count:n,label:'Matemática'}],opts);
const overlap=(a,b)=>a.x<b.x+b.width-1e-6&&a.x+a.width>b.x+1e-6&&a.y<b.y+b.height-1e-6&&a.y+a.height>b.y+1e-6;

test('V2: 15 standard A4 compositions, fixed bubbles and natural frame heights',()=>{
 for(const n of[10,20,50,100,150])for(const type of['A-D','A-E','C-E']){
  const t=create(n,type),m=createCardManifest(t);assert.equal(m.schemaVersion,'salta-layout-manifest-v2');assert.equal(validateLayoutManifest(m).valid,true);assert.equal(m.questions.length,n);assert.equal(m.geometry.bubbleDiameterMm,4.5);assert.ok(m.geometry.objectiveRowPitchMm>=4.85);
  assert.equal(new Set(m.columns.map(c=>c.width)).size,1);
  for(const q of m.questions){const f=m.sections.find(f=>f.columnIndex===q.columnIndex&&q.y>=f.y&&q.y<f.y+f.height);assert.ok(f);for(const b of q.bubbles){assert.ok(b.y-b.radiusMm>f.y+3);assert.ok(b.x-b.radiusMm>f.x);assert.ok(b.x+b.radiusMm<f.x+f.width);}}
 }
});

test('V2: institution preserves each explicit newline; no empty institutional strip',()=>{
 const t=create();const empty=createCardManifest(t),h={...DEFAULT_CARD_HEADER,institution:'SECRETARIA SINTÉTICA\nESCOLA FICTÍCIA SALTA'};const full=createCardManifest(t,h);
 assert.deepEqual(full.panels.header.texts.filter(t=>t.id==='institution').map(t=>t.text),['SECRETARIA SINTÉTICA','ESCOLA FICTÍCIA SALTA']);
 assert.ok(full.panels.header.frame.height>empty.panels.header.frame.height);
 assert.ok(full.panels.header.texts.filter(t=>['institution','title','subtitle'].includes(t.id)).every(t=>t.x===105&&t.anchor==='middle'));
 const long=createCardManifest(t,{...h,teacher:'Docente Sintético com Nome Extenso para Ensaio',className:'TURMA FICTÍCIA COM NOME EXTENSO',date:'2026-12-01'});
 const administrative=long.panels.header.texts.filter(t=>['PROFESSOR','TURMA','DATA'].includes(t.id));assert.equal(new Set(administrative.map(t=>t.box.y)).size,1);assert.ok(renderTemplateSvg(t,{manifest:long}).includes('01/12/2026'));
 assert.throws(()=>createCardManifest(t,{...h,institution:'W'.repeat(300)}),/longo demais|não cab/);
 const teacher='Docente fictício '.repeat(9).trim();const longTemplate=create(20,'A-E',{metadata:{teacher}});assert.equal(longTemplate.metadata.teacher,teacher);assert.throws(()=>create(20,'A-E',{metadata:{teacher:'X'.repeat(257)}}),/nada foi cortado/);
});

test('V2: independent identity modes remove code and absent-name reservations',()=>{
 const coded=createCardManifest(create()),manual=createCardManifest(create(20,'A-E',{identityMode:'manual'})),none=createCardManifest(create(20,'A-E',{identityMode:'none'}));
 assert.equal(coded.identityBubbles.length,70);assert.ok(coded.panels.code.y>coded.panels.header.end);assert.ok(!overlap(coded.panels.code,coded.panels.header.frame));
 assert.equal(manual.panels.code,null);assert.equal(manual.identityBubbles.length,0);assert.equal(none.panels.name,null);assert.equal(none.panels.code,null);
 assert.ok(none.contentBoundsMm.y<manual.contentBoundsMm.y);assert.doesNotMatch(renderTemplateSvg(create(20,'A-E',{identityMode:'none'})),/omr-name-frame|omr-code-frame|IDENTIFICAÇÃO DO ESTUDANTE/);
});

test('V2: instructions are optional and occupy no area while disabled',()=>{
 const t=create(),off=createCardManifest(t),on=createCardManifest(t,{...DEFAULT_CARD_HEADER,showInstructions:true});
 assert.equal(off.panels.instructions,null);assert.ok(on.panels.instructions);assert.ok(on.contentBoundsMm.y>off.contentBoundsMm.y);assert.match(renderTemplateSvg(t,{manifest:on}),/omr-instructions-frame/);
});

test('V2: unequal sections fill vertical gaps in uniform-width columns without duplicated numbers',()=>{
 const t=createTemplate([{type:'A-D',count:7,label:'Álgebra'},{type:'C-E',count:3,label:'Lógica'},{type:'A-E',count:19,label:'Geometria'}],{identityMode:'none'});const m=createCardManifest(t);
 assert.equal(new Set(m.questions.map(q=>q.number)).size,29);assert.ok(new Set(m.sections.map(f=>f.height)).size>1);
 assert.ok(m.sections.some((f,i)=>m.sections.some((g,j)=>i!==j&&f.columnIndex===g.columnIndex)));
 assert.equal(new Set(m.sections.map(f=>f.width)).size,1);assert.equal(m.sections.filter(f=>f.label.startsWith("Lógica")).length,1);
 for(let i=0;i<m.sections.length;i++)for(let j=i+1;j<m.sections.length;j++)assert.ok(!overlap(m.sections[i],m.sections[j]));
});

test('V2: conventional black letters, rounded inner frames and square outside/fiducials',()=>{
 const svg=renderTemplateSvg(create());assert.doesNotMatch(svg,/>MODELO|paint-order|fill="#fff" stroke="#000" stroke-width="0.16"/);
 assert.match(svg,/omr-header-frame[^>]*rx="1" ry="1"/);assert.match(svg,/omr-name-frame[^>]*rx="1" ry="1"/);assert.match(svg,/omr-code-frame[^>]*rx="1" ry="1"/);assert.match(svg,/omr-section-border[^>]*rx="1" ry="1"/);
 assert.ok((svg.match(/class="omr-fiducial"/g)||[]).length===4);for(const tag of svg.match(/<(?:rect)[^>]*(?:omr-fiducial|omr-card-border)[^>]*>/g))assert.doesNotMatch(tag,/ rx=/);
});

test('V2: explicit old/current models and exact JSON import drive the reader',()=>{
 for(const t of[create(),createLegacyTemplate([{type:'A-E',count:20,label:'Matemática'}])]){
  const m=createCardManifest(t),loaded=importCardManifest(buildManifestJson(t,{manifest:m}));
  assert.equal(loaded.manifest.contentHash,m.contentHash);assert.deepEqual(loaded.manifest.questions,m.questions);
  const w=840,h=1188,l=layoutTemplate(loaded.template,{width:w,height:h,manifest:loaded.manifest});const pixels=new Uint8Array(w*h).fill(255),b=l.cells[0].bubbles[2];const radius=Math.round(l.cells[0].bubbleRadius*.65);
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++)pixels[(Math.round(b.y)+y)*w+Math.round(b.x)+x]=0;
  assert.equal(readRaster(loaded.template,pixels,w,h,{manifest:loaded.manifest}).observations[0].answer,'C');
 }
 assert.throws(()=>importCardManifest('{}'),/inválido/);
});

test('V2: mixed CDU, nominal batches and impossible capacity remain explicit',()=>{
 const t=createTemplate([{type:'A-E',count:20,label:'Objetivas'},{type:'CDU',count:2,label:'Numéricas'}]);const m=createCardManifest(t);assert.equal(m.questions.filter(q=>q.type==='CDU').length,2);assert.ok(renderTemplateSvg(t).includes('data-place="C"'));
 assert.throws(()=>readRaster(t,new Uint8Array(420*594),420,594,{manifest:m}),/C-D-U/);
 assert.throws(()=>createCardManifest(create(150,'CDU')),/não cabem/);
 const print=buildPrintDocument(create(),{students:[{name:'Pessoa Fictícia Um',code:'0000001'},{name:'Pessoa Fictícia Dois',code:'0000002'}]});assert.equal((print.match(/class="print-page"/g)||[]).length,2);assert.match(print,/Pessoa Fictícia Dois/);assert.match(print,/:last-of-type/);
 const json=buildManifestJson(create(20,'A-E',{student:{name:'Pessoa secreta fictícia',code:'1234567'}}));assert.doesNotMatch(json,/Pessoa secreta|1234567/);
});

test('V2: geometry validator rejects moved marks, overlays and altered fiducials',()=>{
 for(const change of [m=>m.questions[0].bubbles[0].x=-1,m=>m.panels.code.y=m.panels.header.frame.y,m=>m.technicalRegions.fiducials[0].sizeMm=4]){
  const m=structuredClone(createCardManifest(create()));change(m);assert.equal(validateLayoutManifest(m).valid,false);
 }
});
