import test from 'node:test';
import assert from 'node:assert/strict';
import {validationMode,baselineDifferences,historicalReplay,enforceHistoricalReplay} from '../validation/g3-replay-policy.mjs';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const labels=['moderate-A','moderate-AB','shadow-AB-130','other'].map(id=>({id,raster:{rgbaSha256:a,svgSha256:c}}));
const rows=labels.map((l,i)=>({id:l.id,originalHash:a,svgHash:c,hash:i===3?b:a,exact:i!==3,source:i===3?'regenerated-svg':'stored-rgba'}));
test('strict default, explicit functional mode, unknown mode fails closed',()=>{
 assert.equal(validationMode([]),'strict');assert.equal(validationMode(['--strict']),'strict');
 assert.equal(validationMode(['--functional']),'functional');assert.throws(()=>validationMode(['--typo']));assert.throws(()=>validationMode(['--strict','--functional']));
});
test('historical mismatch is explicitly pending, strict verifier rejects it; exact identity alone passes',()=>{
 const replay=historicalReplay(rows,labels);assert.equal(replay.status,'PENDING_PIXEL_IDENTITY');assert.equal(replay.exact,3);assert.equal(replay.nonMatching,1);
 assert.throws(()=>enforceHistoricalReplay(replay),/Original pixel hash mismatches/);
 const exact=historicalReplay(rows.map(x=>({...x,hash:a,exact:true})),labels);assert.equal(exact.status,'PASS');assert.doesNotThrow(()=>enforceHistoricalReplay(exact));
});
test('stored fixture corruption, SVG corruption, false identity, missing case and false provenance cannot pass either mode',()=>{
 for(const altered of [
  rows.map((x,i)=>i===0?{...x,hash:b,exact:false}:x),
  rows.map((x,i)=>i===3?{...x,svgHash:b}:x),
  rows.map((x,i)=>i===3?{...x,exact:true}:x),
  rows.slice(0,3),
  rows.map((x,i)=>i===3?{...x,source:'stored-rgba'}:x),
  rows.map((x,i)=>i===3?{...x,originalHash:b}:x)
 ])assert.throws(()=>historicalReplay(altered,labels));
});
test('baseline must match each decision, recognition, identity and metric, not merely aggregate totals',()=>{
 const observation={questionId:'q1',number:1,state:'read',answer:'A',marks:['A'],recognition:'strong'};
 const identity={state:'read',code:'0001123'};
 const historical={outputs:{single:{ok:true,identity,observations:[observation]}},metrics:{read:1,correctDefinitiveAnswers:1}};
 const result={reading:{identity,observations:[{...observation,page:1,confidence:.9}]}};
 assert.deepEqual(baselineDifferences(result,historical.metrics,historical),[]);
 assert.ok(baselineDifferences({reading:{identity,observations:[{...observation,answer:'B',marks:['B']}]}},historical.metrics,historical).some(x=>x.field==='observation'));
 assert.ok(baselineDifferences({reading:{...result.reading,identity:{state:'review',code:null}}},historical.metrics,historical).some(x=>x.field==='identity'));
 assert.ok(baselineDifferences(result,{...historical.metrics,read:0},historical).some(x=>x.field==='read'));
});
