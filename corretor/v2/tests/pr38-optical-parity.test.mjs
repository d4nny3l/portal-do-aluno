import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplate, createLegacyTemplate} from '../omr/template.mjs';
import {createCardManifest, renderTemplateSvg} from '../omr/render.mjs';
import {importCardManifest} from '../omr/manifest.mjs';
import {validateLayoutManifest} from '../omr/layout.mjs';

// Only the visible section outline may vary. The optical manifest (including
// the old section bounds used by the reader) must remain byte-equivalent.
const opticalWithoutArtwork = manifest => {
 const copy=structuredClone(manifest);
 delete copy.contentHash;
 delete copy.sectionFrameStyle;
 return copy;
};
const withoutVisualFrame = svg => svg
 .replace(/data-layout-hash="[0-9a-f]+"/, 'data-layout-hash="HASH"')
 .replace(/<rect class="omr-section-border"[^>]*\/>/g, '<rect class="omr-section-border"/>');

test('PR38: A/B preserves optical geometry and explicit presentation hashes',()=>{
 const cases=[
  {name:'1-column',sections:[{type:'A-E',count:20,label:'Objetivas'}],columnCount:1},
  {name:'2-column',sections:[{type:'A-D',count:20,label:'Objetivas'}],columnCount:2},
  {name:'3-column',sections:[{type:'C-E',count:20,label:'Certo ou errado'}],columnCount:3},
  {name:'4-column',sections:[{type:'A-E',count:20,label:'Objetivas'}],columnCount:4},
  {name:'5-column',sections:[{type:'A-E',count:20,label:'Objetivas'}],columnCount:5},
  {name:'50',sections:[{type:'A-E',count:50,label:'Geometria'}]},
  {name:'100',sections:[{type:'A-D',count:100,label:'Álgebra'}]},
  {name:'150',sections:[{type:'C-E',count:150,label:'Lógica'}]},
  {name:'mixed',sections:[{type:'A-D',count:7,label:'Álgebra'},{type:'C-E',count:3,label:'Lógica'},{type:'A-E',count:19,label:'Geometria'}]}
 ];
 for(const entry of cases){
  const template=createTemplate(entry.sections,{identityMode:'none',columnCount:entry.columnCount});
  const before=createCardManifest(template);
  const after=createCardManifest(template,null,{sectionFrameStyle:'content'});
  assert.equal(validateLayoutManifest(before).valid,true,entry.name+' old valid');
  assert.equal(validateLayoutManifest(after).valid,true,entry.name+' new valid');
  assert.equal(before.sectionFrameStyle,undefined);
  assert.equal(after.sectionFrameStyle,'content');
  assert.notEqual(after.contentHash,before.contentHash,entry.name+' presentation hash changes by contract');
  assert.deepEqual(opticalWithoutArtwork(after),opticalWithoutArtwork(before),entry.name+' same coordinates, IDs, sizes, fiducials and metadata');
  const oldSvg=renderTemplateSvg(template,{manifest:before});
  const newSvg=renderTemplateSvg(template,{manifest:after});
  assert.equal(withoutVisualFrame(newSvg),withoutVisualFrame(oldSvg),entry.name+' no drawing changes outside section borders');
  // Importing an old card or the new card must honor its exact saved manifest.
  for(const current of [before,after]){
   const loaded=importCardManifest({manifest:current});
   assert.deepEqual(loaded.manifest,JSON.parse(JSON.stringify(current)),entry.name+' imported JSON');
   assert.deepEqual(loaded.template.questions.map(q=>[q.questionId,q.number,q.type]),template.questions.map(q=>[q.questionId,q.number,q.type]));
   assert.equal(validateLayoutManifest(loaded.manifest).valid,true);
   assert.equal(renderTemplateSvg(loaded.template,{manifest:loaded.manifest}).includes('data-layout-hash="'+current.contentHash+'"'),true);
  }
 }
});

test('PR38: V1 history stays readable with its exact legacy optical contract',()=>{
 const template=createLegacyTemplate([{type:'A-E',count:10,label:'Histórico V1'}]);
 const manifest=createCardManifest(template);
 const copy=structuredClone(manifest);
 const restored=importCardManifest({manifest});
 assert.deepEqual(restored.manifest,JSON.parse(JSON.stringify(copy)));
 assert.equal(restored.manifest.schemaVersion,'salta-layout-manifest-v1');
 assert.equal(validateLayoutManifest(restored.manifest).valid,true);
 assert.equal(restored.manifest.sectionFrameStyle,undefined);
});
