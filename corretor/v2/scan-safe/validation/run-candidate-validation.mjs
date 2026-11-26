// Offline bridge to the coordinated production API. No browser, camera or network.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {processCapture} from '../processor.mjs';
import {CASES,modelFor,truthFor} from './optical-corpus.mjs';
import {frozenWorker,frozenCandidateRead,compareOptical,metrics,referenceHashes} from './offline-optical.mjs';
const saved=JSON.parse(await readFile(new URL('./optical-evidence.json',import.meta.url),'utf8'));
const worker=await frozenWorker(),candidate=await frozenCandidateRead();
const hash=data=>createHash('sha256').update(data).digest('hex');
const memory=()=>{const {rss,heapUsed,external,arrayBuffers}=process.memoryUsage();return {rss,heapUsed,external,arrayBuffers};};
const inputs=[];
for(const id of ['moderate-A','moderate-AB','shadow-AB-130']){
 const spec=CASES.find(c=>c.id===id),model=modelFor(spec),evidence=saved.cases.find(c=>c.id===id),{width:w,height:h}=evidence.raster;
 const data=new Uint8ClampedArray(gunzipSync(await readFile(new URL(`./${id}.rgba.gz`,import.meta.url))));
 if(hash(data)!==evidence.raster.rgbaSha256)throw new Error(`Labelled raster hash mismatch ${id}`);
 inputs.push({id,spec,model,data,w,h,corners:[[0,0],[w,0],[w,h],[0,h]]});
}
const report={schemaVersion:'salta-candidate-optical-validation-v1',generatedAt:new Date().toISOString(),
 scope:'100 consecutive synthetic cards through actual processCapture versus 100 paired frozen dual reads; three pre-generated synthetic inputs repeated. Processing to optical result only.',
 limitations:saved.limitations,referenceHashes:await referenceHashes(),processorSha256:hash(await readFile(new URL('../processor.mjs',import.meta.url))),
 labelledEvidenceSha256:hash(await readFile(new URL('./optical-evidence.json',import.meta.url))),node:process.version,baselineMemory:memory(),peakMemory:memory(),samples:[],cases:[]};
function capture(input,id){
 const {data,w,h,corners,model}=input;
 const token={captureId:id,sessionId:0,templateId:model.template.templateId,templateRevision:model.template.revision,contentHash:model.manifest.contentHash,page:1};
 return processCapture({data,w,h,corners,...model,page:1,showCode:true,token});
}
for(const [i,input] of inputs.entries()){
 const production=capture(input,i+1),frozen=compareOptical(worker(input),input.model,candidate);
 const exactReadingParity=JSON.stringify(production.reading)===JSON.stringify(frozen.single.reading);
 if(!exactReadingParity||production.metrics.readCalls!==1)throw new Error(`Production API parity/read count failed: ${input.id}`);
 report.cases.push({id:input.id,exactReadingParity,readCalls:production.metrics.readCalls,metrics:metrics(truthFor(input.spec,input.model),production),first:production.reading.observations[0],consensusFirst:frozen.consensus.reading.observations[0]});
}
for(let index=1;index<=100;index++){
 const input=inputs[(index-1)%inputs.length];
 const runProduction=()=>{const t=performance.now(),result=capture(input,index);return {ms:performance.now()-t,readCalls:result.metrics.readCalls};};
 const runReference=()=>{const t=performance.now(),result=compareOptical(worker(input),input.model,candidate);return {ms:performance.now()-t,complete:result.consensus.complete};};
 let production,reference;
 if(index%2){production=runProduction();reference=runReference();}else{reference=runReference();production=runProduction();}
 const m=memory();for(const k in m)report.peakMemory[k]=Math.max(report.peakMemory[k],m[k]);
 report.samples.push({index,id:input.id,productionMs:production.ms,frozenDualMs:reference.ms,readCalls:production.readCalls,memory:m});
 if(index%20===0)console.log(`candidate benchmark ${index}/100`);
}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
report.times=Object.fromEntries(['production','frozenDual'].map(name=>[name,{medianMs:percentile(report.samples.map(s=>s[`${name}Ms`]),.5),p95Ms:percentile(report.samples.map(s=>s[`${name}Ms`]),.95)}]));
report.endMemory=memory();globalThis.gc?.();report.afterOptionalGc=memory();
const newWrongAnswers=report.cases.filter(c=>c.first.state==='read'&&c.metrics.incorrectDefinitiveAnswers>0&&
 (c.consensusFirst.state!=='read'||c.consensusFirst.answer!==c.first.answer)).length;
report.gate={singleReadPerCapture:report.samples.every(s=>s.readCalls===1),exactFrozenRectifiedParity:report.cases.every(c=>c.exactReadingParity),
 newIncorrectDefinitiveAnswersVersusConsensus:newWrongAnswers,zeroNewIncorrectDefinitiveAnswers:newWrongAnswers===0,
 reason:newWrongAnswers?'Production parity preserves known shadow A+B -> A blocker; no optical safety approval.':'No new wrong answer in this limited parity subset; full corpus and physical gates still required.'};
await writeFile(new URL('./candidate-evidence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({times:report.times,peakMemory:report.peakMemory,gate:report.gate},null,2));
