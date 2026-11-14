import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import { createTemplate } from '../omr/template.mjs';
import { createCardManifest, renderTemplateSvg, DEFAULT_CARD_HEADER } from '../omr/render.mjs';
import { headerArtwork, sectionFrames, brazilianDate, ARTWORK_VERSION } from '../omr/artwork.mjs';
import { buildPrintDocument, buildManifestJson } from '../omr/export.mjs';
const card=(type='A-E',count=20,options={})=>createTemplate([{type,count,label:'Matemática'}],options);
const header={...DEFAULT_CARD_HEADER,institution:'Escola Sintética',teacher:'Docente fictício',subject:'Matemática',className:'1º SEMESTRE EJA — TURMA FICTÍCIA',date:'2026-12-01',visible:{...DEFAULT_CARD_HEADER.visible,teacher:true,subject:true,className:true,date:true}};
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

test('CV-01: no visible technical footer in SVG or batch; JSON retains version and hash',()=>{
 const template=card();const manifest=createCardManifest(template,header);
 const svg=renderTemplateSvg(template,{header,manifest});
 assert.doesNotMatch(svg,/>[^<]*(?:MODELO|REV \d|[a-f0-9]{16})[^<]*<\/text>/);
 assert.doesNotMatch(buildPrintDocument(template,{header}),/>MODELO[^<]*<\/text>/);
 assert.equal(JSON.parse(buildManifestJson(template,{header})).manifest.artworkVersion,ARTWORK_VERSION);
 assert.match(manifest.contentHash,/^[a-f0-9]{16}$/);
});

test('CV-02/08: title remains geometrically centered with zero, one or two configured logos',()=>{
 for(const logos of [{},{logo:'data:image/png;base64,AA=='},{logo:'data:image/png;base64,AA==',secondaryLogo:'data:image/png;base64,AA=='}]) {
  const h={...header,...logos};const manifest=createCardManifest(card(),h);const artwork=headerArtwork(manifest,h);
  for(const text of artwork.texts.filter(t=>['título','instituição'].includes(t.id)))assert.equal(text.textX,105);
  assert.equal(artwork.logos.length,Object.keys(logos).length);
  for(const logo of artwork.logos)for(const text of artwork.texts)assert.ok(!overlaps(logo,text));
 }
});

test('CV-03: all metadata and nominal text are bounded away from code and fiducials',()=>{
 const template=card('A-E',20,{student:{name:'Estudante Sintético de Nome Extenso para Teste',className:'TURMA SINTÉTICA COM IDENTIFICAÇÃO LONGA',code:'0000001'}});
 const manifest=createCardManifest(template,header);const artwork=headerArtwork(manifest,header);
 for(const text of artwork.texts){
  assert.ok(!overlaps(text,manifest.technicalRegions.identityGrid),text.id);
  for(const f of manifest.technicalRegions.fiducials)assert.ok(!overlaps(text,{x:f.x-f.sizeMm/2,y:f.y-f.sizeMm/2,width:f.sizeMm,height:f.sizeMm}),text.id);
 }
 assert.throws(()=>renderTemplateSvg(template,{header:{...header,title:'W'.repeat(90)}}),/longo demais|não cabe/);
 assert.throws(()=>renderTemplateSvg(template,{header:{...header,customFields:Array.from({length:4},()=>({label:'Campo',value:'excessivamente '.repeat(20)}))}}),/não cabe|longo demais/);
});

test('CV-04: every objective question belongs to exactly one closed section frame, including continuations',()=>{
 for(const count of [10,20,50,100,150])for(const type of ['A-D','A-E','C-E']){
  const template=card(type,count),manifest=createCardManifest(template,header),frames=sectionFrames(manifest);
  assert.equal(new Set(frames.flatMap(f=>f.questions)).size,count);
  assert.equal(frames.flatMap(f=>f.questions).length,count);
  for(const frame of frames) {
   const qs=manifest.questions.filter(q=>frame.questions.includes(q.questionId));
   for(const q of qs)for(const b of q.bubbles){assert.ok(b.x-b.radiusMm>frame.x);assert.ok(b.x+b.radiusMm<frame.x+frame.width);assert.ok(b.y-b.radiusMm>frame.y+3.2);assert.ok(b.y+b.radiusMm<frame.y+frame.height);}
   const svg=renderTemplateSvg(template,{header});assert.equal((svg.match(/class="omr-section-frame"/g)||[]).length,frames.length);
   assert.equal((svg.match(/rx="1" ry="1"/g)||[]).length,frames.length);
  }
 }
});

test('CDU frames enclose all rows without a title cutting across the preceding row',()=>{
 const manifest=createCardManifest(card('CDU',10),header);const frames=sectionFrames(manifest);
 assert.equal(frames.length,1);assert.equal(frames[0].questions.length,10);
 for(const q of manifest.questions)for(const b of q.bubbles)assert.ok(b.y+b.radiusMm<frames[0].y+frames[0].height);
});

test('CV-07: real dates use Brazilian display and invalid dates cannot leak to print',()=>{
 assert.equal(brazilianDate('2026-12-01'),'01/12/2026');assert.equal(brazilianDate('2024-02-29'),'29/02/2024');assert.equal(brazilianDate(''),'');
 for(const value of ['2026-02-29','2026-02-30','2026-13-01','01/12/2026'])assert.throws(()=>brazilianDate(value));
 const template=card();const manifest=createCardManifest(template,header);assert.equal(manifest.header.date,'2026-12-01');assert.match(renderTemplateSvg(template,{header}),/01\/12\/2026/);
});

test('presentation preserves 15 archived optical digests and hashes from PR31 e376c82',async()=>{
 const golden=JSON.parse(await readFile(new URL('./fixtures/artwork-v0-optical.json',import.meta.url),'utf8'));
 for(const row of golden){
  const m=createCardManifest(card(row.type,row.count));
  const optical={questions:m.questions,identityBubbles:m.identityBubbles,technicalRegions:m.technicalRegions,geometry:m.geometry};
  assert.equal(createHash('sha256').update(JSON.stringify(optical)).digest('hex'),row.opticalSha256);
  assert.equal(m.contentHash,row.contentHash);
 }
});

test('embedded manual and nominal batch preserve dimensions; excessive text fails explicitly',()=>{
 const template=card('A-D',10,{mode:'embedded',embeddedSize:{widthMm:100,heightMm:180},identityMode:'manual'});
 const svg=renderTemplateSvg(template);assert.match(svg,/width="100mm" height="180mm"/);assert.match(svg,/class="omr-section-frame"/);
 const batch=buildPrintDocument(card(),{header,students:[{name:'Pessoa Fictícia Um',className:'Turma Fictícia',code:'0000001'},{name:'Pessoa Fictícia Dois',className:'Turma Fictícia',code:'0000002'}]});
 assert.equal((batch.match(/class="print-page"/g)||[]).length,2);assert.match(batch,/\.print-page:last-of-type\{page-break-after:auto;break-after:auto\}/);assert.match(batch,/Pessoa Fictícia Dois/);
 assert.throws(()=>renderTemplateSvg(createTemplate([{type:'A-E',count:150,label:'Título de seção deliberadamente extenso demais para cinco colunas'}])),/não cabe na coluna/);
});
