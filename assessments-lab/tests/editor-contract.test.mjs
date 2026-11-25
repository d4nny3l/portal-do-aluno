import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../plataforma/corretor-v2.html',import.meta.url),'utf8');
test('bank controller references actual labeled controls in the integrated editor',()=>{
 const source=readFileSync(new URL('../../corretor/v2/assessments/editor.mjs',import.meta.url),'utf8');
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const [,id]of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(id),'Missing bank control '+id);
 assert.match(html,/<section id="assessmentBank"[^>]*hidden/);
 assert.match(html,/id="bankStatus"[^>]*role="status"/);
 assert.match(html,/<input id="read" type="hidden" aria-hidden="true">/);
 assert.match(html,/if\(\$\('read'\)\.disabled\)throw (?:new )?Error/);
 assert.doesNotMatch(html,/<button[^>]+id="read"/);
});
test('assessment switch clears the prior photo, grade, capture history and camera before applying another model',()=>{
 const source=html.match(/function clearAssessmentReview\(\)[^\n]+/)[0];let stopped=0,rendered=0,comparisonCleared=0;
 const fields={answers:{replaceChildren(){}},scanScore:{hidden:false},status:{textContent:'Old result'},file:{value:'old-photo.png'},canvas:{hidden:false}};
 let invalidated=0;
 const actual=new Function('$','cameraStream','stopCamera','activeObservations','activeHistoryEntry','scanHistory','replaceLastCapture','renderHistory','normalizedRaster','rawRaster','updateCaptureComparison','invalidateScan',`let currentDocument={},currentReading={};${source};clearAssessmentReview();return {activeObservations,activeHistoryEntry,scanHistory,replaceLastCapture,normalizedRaster,rawRaster,currentDocument,currentReading}`)(id=>fields[id],{},()=>stopped++,[{answer:'C'}],{},[{}],true,()=>rendered++,{},{},()=>comparisonCleared++,()=>invalidated++);
 assert.equal(invalidated,1);assert.equal(actual.currentDocument,null);assert.equal(actual.currentReading,null);
 assert.equal(stopped,1);assert.equal(rendered,1);assert.equal(comparisonCleared,1);assert.equal(actual.activeObservations.length,0);assert.equal(actual.scanHistory.length,0);assert.equal(actual.normalizedRaster,null);assert.equal(actual.rawRaster,null);assert.equal(actual.replaceLastCapture,false);
 assert.equal(fields.scanScore.hidden,true);assert.equal(fields.file.value,'');assert.equal(fields.status.textContent,'');assert.equal(fields.canvas.hidden,true);
});
