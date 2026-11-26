// Offline validation only. Never imported by the Corretor.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

export const STORED_RASTER_IDS=Object.freeze(['moderate-A','moderate-AB','shadow-AB-130']);
export function validationMode(args){
 if(args.length===0||args.length===1&&args[0]==='--strict')return 'strict';
 if(args.length===1&&args[0]==='--functional')return 'functional';
 throw Error('Use --functional or --strict (default).');
}
const observation=({questionId,number,state,answer,marks,recognition})=>({questionId,number,state,answer,marks,recognition});
export function baselineDifferences(result,actualMetrics,historical){
 const differences=[];
 const expected=historical.outputs.single;
 const actual=result.reading;
 if(Boolean(actual)!==expected.ok)differences.push({field:'available',expected:expected.ok,actual:Boolean(actual)});
 if(!isDeepStrictEqual(actual?.identity??null,expected.identity))differences.push({field:'identity',expected:expected.identity,actual:actual?.identity??null});
 const rows=actual?.observations.map(observation)||[];
 const ids=new Set([...rows,...expected.observations].map(o=>o.questionId));
 for(const id of ids){
  const a=rows.find(o=>o.questionId===id),e=expected.observations.find(o=>o.questionId===id);
  if(!isDeepStrictEqual(a,e))differences.push({field:'observation',questionId:id,expected:e??null,actual:a??null});
 }
 // Numerical metrics including review/omission/coverage. The old mismatch
 // objects contain implementation metadata; compare their decisions above.
 for(const [key,value] of Object.entries(historical.metrics.single)){
  if(key!=='mismatches'&&!isDeepStrictEqual(actualMetrics[key],value))
   differences.push({field:key,expected:value,actual:actualMetrics[key]??null});
 }
 return differences;
}
export function historicalReplay(rows,labels){
 const ids=labels.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length,'Duplicate historical labels');
 assert.equal(rows.length,ids.length,'Incomplete historical case inventory');
 assert.deepEqual(rows.map(x=>x.id),ids,'Historical case order/inventory differs');
 const cases=rows.map((row,i)=>{
  const label=labels[i];
  assert.equal(row.originalHash,label.raster.rgbaSha256,'Historical RGBA hash altered: '+row.id);
  assert.equal(row.svgHash,label.raster.svgSha256,'Historical SVG hash altered: '+row.id);
  assert.match(row.hash,/^[a-f0-9]{64}$/,'Invalid actual hash '+row.id);
  assert.equal(row.exact,row.hash===label.raster.rgbaSha256,'False pixel identity '+row.id);
  assert.equal(row.source,STORED_RASTER_IDS.includes(row.id)?'stored-rgba':'regenerated-svg','Incorrect provenance '+row.id);
  if(STORED_RASTER_IDS.includes(row.id))assert.ok(row.exact,'Stored original fixture hash mismatch '+row.id);
  return {id:row.id,source:row.source,svgSha256:row.svgHash,expectedRgbaSha256:row.originalHash,actualRgbaSha256:row.hash,exact:row.exact};
 });
 const exact=cases.filter(c=>c.exact).length;
 return {exactReplayComplete:exact===ids.length,status:exact===ids.length?'PASS':'PENDING_PIXEL_IDENTITY',exact,
  nonMatching:ids.length-exact,stored:cases.filter(c=>c.source==='stored-rgba').length,regenerated:cases.filter(c=>c.source==='regenerated-svg').length,cases};
}
export function enforceHistoricalReplay(replay){
 assert.ok(replay.exactReplayComplete,'Original pixel hash mismatches: '+replay.nonMatching+' cases; regenerated SVG tests are not an exact replay');
}
