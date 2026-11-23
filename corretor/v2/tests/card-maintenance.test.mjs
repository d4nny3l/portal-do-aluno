import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTemplate,createLegacyTemplate,layoutTemplate} from '../omr/template.mjs';
import {createCardManifest,renderTemplateSvg} from '../omr/render.mjs';
import {importCardManifest} from '../omr/manifest.mjs';
import {readRaster} from '../omr/reader.mjs';
import {validateLayoutManifest} from '../omr/layout.mjs';
import {buildPrintDocument,buildManifestJson} from '../omr/export.mjs';
import {textWidth} from '../omr/artwork.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const card=opts=>createTemplate([{type:'A-E',count:20,label:'Questões'}],opts);

test('maintenance: historical hashes remain references; new V2 geometry is explicitly versioned',()=>{
 for(const old of fixture('maintenance-16113b6-golden.json').records){
  const t=createTemplate([{type:old.type,count:old.count,label:'Questões'}]),m=createCardManifest(t),svg=renderTemplateSvg(t,{manifest:m});
  assert.equal(m.titleAlignmentRevision,'top-columns-centred-1');
  assert.notEqual(sha(JSON.stringify(m)),old.manifestSha256,`${old.type}/${old.count}: old manifest hash must not be reused`);
  assert.equal(validateLayoutManifest(m).valid,true);
  assert.ok(m.sections.every(f=>Number.isFinite(f.titleBandMm)));
  assert.doesNotMatch(svg,/\(cont\.\)/i);
  assert.equal(m.identityCode.columns.length,7);
  assert.equal(m.identityBubbles.length,70);
  assert.match(svg,/>CÓDIGO DO ALUNO<\/text>/);
 }
});

test('maintenance: code title keeps font size and center and fits its unchanged frame',()=>{
 const t=card(),m=createCardManifest(t),svg=renderTemplateSvg(t,{manifest:m}),f=m.panels.code;
 const tag=svg.match(/<text[^>]+>CÓDIGO DO ALUNO<\/text>/)?.[0];assert.ok(tag);
 assert.ok(tag.includes(`x="${f.x+f.width/2}"`));assert.match(tag,/font-size="2.2"/);assert.match(tag,/text-anchor="middle"/);
 assert.ok(textWidth('CÓDIGO DO ALUNO',2.2)<f.width-6);assert.doesNotMatch(tag,/textLength|lengthAdjust/);
});

test('maintenance: manual, absent and explicitly disabled code reserve no code region or title',()=>{
 for(const identityMode of ['manual','none']){
  const t=card({identityMode}),m=createCardManifest(t),svg=renderTemplateSvg(t,{manifest:m});
  assert.equal(m.panels.code,null);assert.equal(m.identityBubbles.length,0);assert.doesNotMatch(svg,/omr-code-frame|CÓDIGO DO ALUNO|CÓDIGO SALTA/);
 }
 const t=card();assert.doesNotMatch(renderTemplateSvg(t,{header:{showStudentCode:false}}),/omr-code-frame|CÓDIGO DO ALUNO/);
});

test('maintenance: V1 and both previous V2 manifest revisions import and read without reflow',()=>{
 const legacy=createLegacyTemplate([{type:'A-E',count:20,label:'Questões'}]);
 const models=[createCardManifest(legacy),fixture('v2-header0.manifest.json'),fixture('v2-header1.manifest.json')];
 for(const original of models){
  const snapshot=JSON.stringify(original),loaded=importCardManifest(original);assert.equal(JSON.stringify(loaded.manifest),snapshot);
  const w=840,h=1188,l=layoutTemplate(loaded.template,{width:w,height:h,manifest:loaded.manifest}),pixels=new Uint8Array(w*h).fill(255),b=l.cells[0].bubbles[2],r=Math.round(l.cells[0].bubbleRadius*.65);
  for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)pixels[(Math.round(b.y)+y)*w+Math.round(b.x)+x]=0;
  assert.equal(readRaster(loaded.template,pixels,w,h,{manifest:loaded.manifest}).observations[0].answer,'C');
  assert.equal(JSON.stringify(original),snapshot);
 }
});

test('maintenance: A4 export and nominal batches use the new title with reusable geometry',()=>{
 const t=card(),m=createCardManifest(t),svg=renderTemplateSvg(t,{manifest:m});
 assert.match(svg,/width="210mm" height="297mm" viewBox="0 0 210 297"/);
 const print=buildPrintDocument(t,{manifest:m,students:[{name:'Pessoa Fictícia Um',code:'0000001'},{name:'Pessoa Fictícia Dois',code:'0000002'}]});
 assert.equal((print.match(/class="print-page"/g)||[]).length,2);assert.equal((print.match(/>CÓDIGO DO ALUNO</g)||[]).length,2);assert.doesNotMatch(print,/CÓDIGO SALTA/);assert.match(print,/@page\{size:A4 portrait;margin:0\}/);
 const json=buildManifestJson(t,{manifest:m});assert.doesNotMatch(json,/Pessoa Fictícia/);const exported=JSON.parse(json).manifest;assert.equal(exported.identityCode.student,null);assert.ok(exported.identityCode.columns.every(c=>c.printedDigit===''));assert.ok(exported.identityBubbles.every(b=>b.filled===false));assert.equal(importCardManifest(json).manifest.contentHash,m.contentHash);
});
