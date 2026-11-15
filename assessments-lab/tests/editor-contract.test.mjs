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
});
test('assessment switch clears the prior photo, grade, capture history and camera before applying another model',()=>{
 const source=html.match(/function clearAssessmentReview\(\)[^\n]+/)[0];let stopped=0,rendered=0;
 const fields={answers:{replaceChildren(){}},scanScore:{hidden:false},status:{textContent:'Old result'},file:{value:'old-photo.png'},canvas:{hidden:false}};
 const actual=new Function('$','cameraStream','stopCamera','activeObservations','activeHistoryEntry','scanHistory','replaceLastCapture','renderHistory','normalizedRaster','rawRaster',`${source};clearAssessmentReview();return {activeObservations,activeHistoryEntry,scanHistory,replaceLastCapture,normalizedRaster,rawRaster}`)(id=>fields[id],{},()=>stopped++,[{answer:'C'}],{},[{}],true,()=>rendered++,{},{});
 assert.equal(stopped,1);assert.equal(rendered,1);assert.equal(actual.activeObservations.length,0);assert.equal(actual.scanHistory.length,0);assert.equal(actual.normalizedRaster,null);assert.equal(actual.rawRaster,null);assert.equal(actual.replaceLastCapture,false);
 assert.equal(fields.scanScore.hidden,true);assert.equal(fields.file.value,'');assert.equal(fields.status.textContent,'');assert.equal(fields.canvas.hidden,true);
});
