// OPTICAL-GUARD-01 replay: original labelled raster hashes, no network,
// no writes to historic evidence. CI artifact is the new evidence.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {CASES,modelFor,svgFor,applyEffect,truthFor} from './optical-corpus.mjs';
import {metrics,frozenWorker,frozenCandidateRead,compareOptical,referenceHashes} from './offline-optical.mjs';
import {processCapture,processManual} from '../processor.mjs';
import {detectFiducials} from '../../omr/normalize.mjs';
import {readRaster} from '../../omr/reader.mjs';
import assert from 'node:assert/strict';
import {STORED_RASTER_IDS,validationMode,baselineDifferences,historicalReplay,enforceHistoricalReplay} from './g3-replay-policy.mjs';
const mode=validationMode(process.argv.slice(2));
const sharpPath=process.env.SALTA_SHARP_MODULE||'sharp';
const sharp=(await import(sharpPath.startsWith('/')?pathToFileURL(sharpPath).href:sharpPath)).default;
sharp.cache(false);sharp.concurrency(1);
const labelBytes=await readFile(new URL('./corpus-labels.json',import.meta.url));
const historyBytes=await readFile(new URL('./optical-evidence.json',import.meta.url));
const labels=JSON.parse(labelBytes),history=JSON.parse(historyBytes);
const sha=x=>createHash('sha256').update(x).digest('hex');
const worker=await frozenWorker(),frozen=await frozenCandidateRead();
const out=process.env.SALTA_G3_EVIDENCE||'tmp/scan-g3-evidence';
await mkdir(out,{recursive:true});
const report={mode,synthetic:true,physical:false,referenceHashes:await referenceHashes(),labelsSha256:sha(labelBytes),historicalEvidenceSha256:sha(historyBytes),sharp:sharp.versions,rows:[],geometry:[],benchmark:[],errors:[],baselineDivergences:[]};
let replay=null;
const assertRecord=(ok,message)=>{if(!ok)report.errors.push(message);};
async function raster(spec,model,svg=svgFor(spec,model)){
 const {data,info}=await sharp(Buffer.from(svg),{density:150}).resize({width:900}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 return {data:new Uint8ClampedArray(applyEffect(data,info.width,info.height,spec,model.manifest)),w:info.width,h:info.height};
}
let id=0;
function payload(input,model){
 const {w,h}=input;
 return {...input,...model,corners:[[0,0],[w,0],[w,h],[0,h]],page:1,showCode:true,token:{captureId:++id,sessionId:1,
  templateId:model.template.templateId,templateRevision:model.template.revision,contentHash:model.manifest.contentHash,page:1}};
}
const oldDeps={detect:(p,w,h,{manifest})=>detectFiducials(p,w,h,{manifest}),
 verifyGeometry:()=>true,read:(t,p,w,h,{reviewEvidence,...opts})=>readRaster(t,p,w,h,opts)};
const fields=['questions','truthSingle','truthBlank','truthMultiple','read','blank','double','review','unavailable','truePositiveMarks','falsePositiveMarks','falseNegativeMarks','correctDefinitiveAnswers','incorrectDefinitiveAnswers','incorrectDefinitiveBlanks','correctClassifications'];
const total=()=>Object.fromEntries(fields.map(k=>[k,0]));
report.summary={base:total(),candidate:total(),consensus:total(),newWrongVsConsensus:0,lostCorrectSingles:0};
const bench=[];
const savedExact=new Set(STORED_RASTER_IDS);
report.rasterReplay={exact:0,regenerated:0,mismatches:[]};
try{
 assert.equal(CASES.length,46,'Required corpus size');
 assert.deepEqual(labels.labels.map(x=>x.id),CASES.map(x=>x.id));
 assert.deepEqual(history.cases.map(x=>x.id),CASES.map(x=>x.id));
 assert.deepEqual(labels.parameters,CASES);
 assert.deepEqual(report.referenceHashes,history.referenceHashes);
 for(const spec of CASES){
  const model=modelFor(spec),truth=truthFor(spec,model),label=labels.labels.find(x=>x.id===spec.id),historical=history.cases.find(x=>x.id===spec.id);
  assert.deepEqual(label.raster,historical.raster,'Historical raster labels differ '+spec.id);
  assert.deepEqual(label.truth,truth,'Truth labels differ '+spec.id);
  assert.deepEqual(historical.truth,truth,'Historical truth differs '+spec.id);
  assert.deepEqual(label.model,historical.model,'Historical model differs '+spec.id);
  assert.equal(model.manifest.contentHash,label.model.contentHash,'Model hash differs '+spec.id);
  const svgHash=sha(svgFor(spec,model));
  assert.equal(svgHash,label.raster.svgSha256,'Original SVG differs '+spec.id);
  const input=savedExact.has(spec.id)?{data:new Uint8ClampedArray(gunzipSync(await readFile(new URL('./'+spec.id+'.rgba.gz',import.meta.url)))),w:label.raster.width,h:label.raster.height}:await raster(spec,model);
  assert.deepEqual([input.w,input.h,input.data.length],[label.raster.width,label.raster.height,label.raster.width*label.raster.height*4],'Raster dimensions differ '+spec.id);
  const actualHash=sha(input.data),exact=actualHash===label.raster.rgbaSha256;
  if(exact)report.rasterReplay.exact++;
  else {
   report.rasterReplay.regenerated++;
   report.rasterReplay.mismatches.push({id:spec.id,expected:label.raster.rgbaSha256,actual:actualHash});
   assertRecord(!savedExact.has(spec.id),'Stored original fixture hash mismatch '+spec.id);
  }
  const p=payload(input,model),before=processCapture(p,oldDeps),after=processCapture(p),reference=compareOptical(worker({data:input.data,w:input.w,h:input.h,corners:p.corners}),model,frozen);
  const row={id:spec.id,source:savedExact.has(spec.id)?'stored-rgba':'regenerated-svg',svgHash,hash:actualHash,originalHash:label.raster.rgbaSha256,exact,first:after.reading?.observations[0]||null,readCalls:after.metrics.readCalls,error:after.error||null,
   base:metrics(truth,before),candidate:metrics(truth,after),consensus:metrics(truth,reference.consensus)};
  const differences=baselineDifferences(before,row.base,historical);
  row.baselineMatchesHistorical=differences.length===0;
  if(differences.length){report.baselineDivergences.push({id:spec.id,differences});console.error('BASELINE_DIVERGENCE '+JSON.stringify({id:spec.id,differences}));}
  assertRecord(row.baselineMatchesHistorical,'Historical baseline differs '+spec.id);
  for(const k of ['base','candidate','consensus'])for(const field of fields)report.summary[k][field]+=row[k][field];
  for(const q of truth){
   const a=after.reading?.observations.find(v=>v.questionId===q.questionId),b=before.reading?.observations.find(v=>v.questionId===q.questionId),c=reference.consensus.reading?.observations.find(v=>v.questionId===q.questionId);
   if(a?.state==='read'&&(q.state!=='read'||q.answer!==a.answer)&&(c?.state!=='read'||c.answer!==a.answer))report.summary.newWrongVsConsensus++;
   if(b?.state==='read'&&q.state==='read'&&b.answer===q.answer&&(a?.state!=='read'||a.answer!==q.answer))report.summary.lostCorrectSingles++;
   if(a&&b)assertRecord(a.state===b.state||a.state==='review','Non-veto change '+spec.id+'/'+q.number);
  }
  assertRecord(after.metrics.readCalls===1&&!after.error,'Valid corpus geometry rejected '+spec.id);
  if(spec.id.startsWith('shadow-AB-'))assertRecord(row.first?.state==='review'&&row.first.answer===null&&['A','B'].every(k=>row.first.marks.includes(k)),'Shadow double not vetoed '+spec.id);
  report.rows.push(row);
  if(['moderate-A','moderate-AB','shadow-AB-130'].includes(spec.id))bench.push({input,model});
  console.log(JSON.stringify({id:spec.id,exact,source:row.source,baselineMatchesHistorical:row.baselineMatchesHistorical,state:row.first?.state,marks:row.first?.marks,error:row.error,wrong:row.candidate.incorrectDefinitiveAnswers,blank:row.candidate.incorrectDefinitiveBlanks,review:row.candidate.review}));
 }
 replay=historicalReplay(report.rows,labels.labels);
 assertRecord(report.rows.length===46&&report.summary.candidate.questions===750,'Incomplete functional corpus');
 assertRecord(report.summary.candidate.incorrectDefinitiveAnswers===0&&report.summary.candidate.incorrectDefinitiveBlanks===0,'Definitive classification regression');
 assertRecord(report.summary.candidate.falsePositiveMarks===0&&report.summary.candidate.falseNegativeMarks===0,'Mark evidence regression');
 assertRecord(report.summary.newWrongVsConsensus===0,'New definitive wrong answers versus frozen consensus: '+report.summary.newWrongVsConsensus);
 assertRecord(report.summary.lostCorrectSingles===0,'Lost legitimate definitive singles: '+report.summary.lostCorrectSingles);
 for(const spec of [CASES.find(x=>x.id==='moderate-A'),CASES.find(x=>x.id==='V1-A'),CASES.find(x=>x.id==='embedded-A')]){
  const model=modelFor(spec),svg=svgFor(spec,model);
  const good=await raster(spec,model,svg),p=payload(good,model),base=processCapture(p);
  assertRecord(base.metrics.readCalls===1&&!base.error,'Valid geometry '+spec.id);
  const physical=detectFiducials(base.sourceOptical.gray,base.sourceOptical.width,base.sourceOptical.height,{manifest:model.manifest,strictPhysical:true});
  assertRecord(physical.found,'Physical fiducials '+spec.id);
  if(physical.found){
   const manual=processManual({...p,sourceOptical:base.sourceOptical,manualFiducials:physical.corners});
   assertRecord(manual.metrics.readCalls===1&&!manual.error,'Valid manual '+spec.id);
   for(let i=0;i<4;i++){
    const marker=model.manifest.technicalRegions.fiducials[i];
    const tag=new RegExp('<rect class="omr-fiducial" data-marker="'+marker.markerId+'"[^>]*\\/>');
    assert.ok(tag.test(svg));
    for(const mode of ['missing','small','displaced']){
     let replacement='';
     if(mode!=='missing'){const size=mode==='small'?2.8:5.5,shift=mode==='displaced'?6:2;
      const x=marker.x+(i===0||i===3?shift:-shift)-size/2,y=marker.y+(i<2?shift:-shift)-size/2;
      replacement='<rect x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" fill="#000"/>';
     }
     const bad=await raster(spec,model,svg.replace(tag,replacement)),badPayload=payload(bad,model);
     const automatic=processCapture(badPayload),explicit=processManual({...badPayload,sourceOptical:automatic.sourceOptical,manualFiducials:physical.corners});
     report.geometry.push({id:spec.id,marker:marker.markerId,mode,auto:automatic.metrics.readCalls,manual:explicit.metrics.readCalls,autoError:automatic.error||null,manualError:explicit.error||null});
     assertRecord(automatic.metrics.readCalls===0&&automatic.reading===null,'Invalid automatic '+spec.id+'/'+marker.markerId+'/'+mode);
     assertRecord(explicit.metrics.readCalls===0&&explicit.reading===null,'Invalid manual '+spec.id+'/'+marker.markerId+'/'+mode);
    }
   }
  }
 }
 assertRecord(report.geometry.length===36,'Incomplete geometry controls');
 const memory=()=>{const {rss,heapUsed,external,arrayBuffers}=process.memoryUsage();return {rss,heapUsed,external,arrayBuffers};};
 report.memoryStart=memory();
 for(let i=0;i<100;i++){
  const b=bench[i%bench.length],p=payload(b.input,b.model);
  const measure=deps=>{const t=performance.now(),v=processCapture(p,deps);return {ms:performance.now()-t,reads:v.metrics.readCalls};};
  let a,c;if(i%2){c=measure();a=measure(oldDeps);}else{a=measure(oldDeps);c=measure();}
  report.benchmark.push({index:i+1,baseMs:a.ms,candidateMs:c.ms,reads:c.reads,memory:memory()});
  assertRecord(c.reads===1,'Benchmark read count '+i);
 }
 const pct=(k,p)=>report.benchmark.map(x=>x[k]).sort((a,b)=>a-b)[Math.ceil(report.benchmark.length*p)-1];
 report.times={baseMedian:pct('baseMs',.5),baseP95:pct('baseMs',.95),candidateMedian:pct('candidateMs',.5),candidateP95:pct('candidateMs',.95)};
 for(const name of ['base','candidate','consensus']){
  const s=report.summary[name];s.answerCoverage=s.correctDefinitiveAnswers/s.truthSingle;s.definitiveAnswerPrecision=s.read?s.correctDefinitiveAnswers/s.read:null;
 }
 report.historySummary=history.summary;
 assertRecord(report.benchmark.length===100,'Incomplete benchmark');
} catch(e){report.errors.push(e.stack||String(e));}
finally{
 report.gate={exactReplayComplete:replay?.exactReplayComplete===true,syntheticRegressionsPassed:report.errors.length===0,
  baselineMatchesHistorical:report.rows.length===46&&report.baselineDivergences.length===0&&report.rows.every(row=>row.baselineMatchesHistorical),physicalHomologation:false};
 const historical={mode,status:replay?.status??'INCOMPLETE',exactReplayComplete:replay?.exactReplayComplete===true,
  labelsSha256:report.labelsSha256,historicalEvidenceSha256:report.historicalEvidenceSha256,referenceHashes:report.referenceHashes,replay};
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 await writeFile(out+'/historical-replay.json',JSON.stringify(historical,null,2)+'\n');
 console.log(JSON.stringify({mode,rasterReplay:{exact:report.rasterReplay.exact,regenerated:report.rasterReplay.regenerated},summary:report.summary,times:report.times,gate:report.gate,errors:report.errors,historicalStatus:historical.status},null,2));
}
assert.deepEqual(report.errors,[],'G3 corpus/geometry gate failed; inspect report artifact');
if(mode==='strict')enforceHistoricalReplay(replay);
else if(!replay.exactReplayComplete)console.warn('G3 historical replay pending: '+replay.nonMatching+' original pixel hashes differ; see historical-replay.json. Functional approval is not historical equivalence.');
