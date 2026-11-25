// Run: node --expose-gc corretor/v2/scan-safe/validation/run-optical-validation.mjs
import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {CASES,CORPUS_VERSION,SYNTHETIC_CODE,modelFor,svgFor,truthFor,applyEffect} from './optical-corpus.mjs';
import {frozenWorker,frozenCandidateRead,compareOptical,metrics,referenceHashes} from './offline-optical.mjs';

async function loadSharp(){
 const candidates=[process.env.SALTA_SHARP_MODULE,'sharp',`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs`].filter(Boolean);
 for(const target of candidates){try{return (await import(target.startsWith('/')?pathToFileURL(target).href:target)).default;}catch{}}
 throw new Error('Local Sharp rasterizer required. Set SALTA_SHARP_MODULE to its installed module path. No network download is performed.');
}
const sharp=await loadSharp();sharp.cache(false);sharp.concurrency(1);
const worker=await frozenWorker(),candidate=await frozenCandidateRead();
const width=900;
const sha=data=>createHash('sha256').update(data).digest('hex');
const simplify=result=>({ok:result.ok??Boolean(result.reading),complete:result.complete??null,error:result.error||null,
 detectionConfidence:result.detectionConfidence??null,identity:result.reading?.identity||null,
 observations:result.reading?.observations.map(({questionId,number,state,answer,marks,recognition})=>({questionId,number,state,answer,marks,recognition}))||[]});
const report={schemaVersion:'salta-offline-optical-validation-v1',generatedAt:new Date().toISOString(),corpusVersion:CORPUS_VERSION,
 privacy:{syntheticOnly:true,studentData:false,remoteCalls:false,syntheticCode:SYNTHETIC_CODE},referenceHashes:await referenceHashes(),
 environment:{node:process.version,platform:process.platform,arch:process.arch,sharp:sharp.versions,width,exposeGc:typeof globalThis.gc==='function'},
 limitations:['Synthetic SVG rasterization and procedural lighting are not physical photographs.','No iPhone, temperature, camera acquisition, UI, browser freeze, sensor noise or physical ink performance was measured.','Benchmark is processing until optical reading, not capture to displayed grade.','No labelled physical corpus was found among versioned repository fixtures; existing UI screenshots were not opened or reused.','Current official generator has one page; this harness does not claim multipage optical coverage.'],cases:[]};

async function rasterize(spec){
 const model=modelFor(spec),svg=svgFor(spec,model);
 const {data,info}=await sharp(Buffer.from(svg),{density:150}).resize({width}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgba=applyEffect(data,info.width,info.height,spec,model.manifest);
 return {model,svg,rgba,w:info.width,h:info.height,truth:truthFor(spec,model)};
}
function runFrozen(raster){
 return worker({data:raster.rgba,w:raster.w,h:raster.h,corners:[[0,0],[raster.w,0],[raster.w,raster.h],[0,raster.h]]});
}
for(const spec of CASES){
 const r=await rasterize(spec),start=performance.now(),processed=runFrozen(r),workerMs=performance.now()-start;
 const t=performance.now(),comparison=compareOptical(processed,r.model,candidate),readBothMs=performance.now()-t;
 const evaluated=Object.fromEntries(Object.entries(comparison).map(([name,result])=>[name,metrics(r.truth,result)]));
 const introduced=comparison.single.ok?evaluated.single.mismatches.filter(({expected,actual})=>{
  if(actual?.state!=='read'||actual.answer===expected.answer&&expected.state==='read')return false;
  const consensus=comparison.consensus.reading?.observations.find(o=>o.questionId===expected.questionId);
  return consensus?.state!=='read'||consensus.answer!==actual.answer;
 }):[];
 if(['moderate-A','moderate-AB','shadow-AB-130'].includes(spec.id)){
  await writeFile(new URL(`./${spec.id}.rgba.gz`,import.meta.url),gzipSync(r.rgba));
  await sharp(Buffer.from(r.rgba),{raw:{width:r.w,height:r.h,channels:4}}).png().toFile(new URL(`./${spec.id}.png`,import.meta.url).pathname);
 }
 report.cases.push({id:spec.id,tags:spec.tags,model:{layoutVersion:r.model.template.layoutVersion,mode:r.model.manifest.mode,count:r.truth.length,
  type:spec.type||'A-E',contentHash:r.model.manifest.contentHash,templateId:r.model.template.templateId},
  raster:{width:r.w,height:r.h,rgbaSha256:sha(r.rgba),svgSha256:sha(r.svg)},truth:r.truth,
  measurements:{workerMs,readBothMs},outputs:Object.fromEntries(Object.entries(comparison).map(([k,v])=>[k,simplify(v)])),metrics:evaluated,
  newIncorrectDefinitiveAnswersVersusConsensus:introduced});
 console.log(JSON.stringify({case:spec.id,single:evaluated.single.incorrectDefinitiveAnswers,blank:evaluated.single.incorrectDefinitiveBlanks,
  review:evaluated.single.review,unavailable:evaluated.single.unavailable,newIncorrect:introduced.length}));
}

// Same machine, same synthetic inputs; no history accumulation or forced GC per card.
// Alternate processing order to reduce drift bias. Each trial discards prior rasters.
const benchInputs=await Promise.all(['moderate-A','moderate-AB','strong-black','blue-offset'].map(id=>rasterize(CASES.find(s=>s.id===id))));
const benchmark={count:100,consecutive:true,width,uniqueInputRasters:benchInputs.length,
 description:'100 sequential synthetic cards, four labelled rasters repeated, alternating single/dual measurement order; no retained image history.',
 samples:[],baselineMemory:processMemory(),peakMemory:processMemory()};
function processMemory(){const {rss,heapUsed,external,arrayBuffers}=globalThis.process.memoryUsage();return {rss,heapUsed,external,arrayBuffers};}
function peakMemory(){const m=processMemory();for(const k in m)benchmark.peakMemory[k]=Math.max(benchmark.peakMemory[k],m[k]);return m;}
function benchSingle(r){const start=performance.now(),p=runFrozen(r),reading=candidate(p.optical.rectified,r.model,1);return {ms:performance.now()-start,read:reading.reading.observations.filter(o=>o.state==='read').length};}
function benchDual(r){const start=performance.now(),p=runFrozen(r),reading=compareOptical(p,r.model,candidate);return {ms:performance.now()-start,complete:reading.consensus.complete};}
for(let i=0;i<benchmark.count;i++){
 const r=benchInputs[i%benchInputs.length];
 let single,dual;
 if(i%2){dual=benchDual(r);peakMemory();single=benchSingle(r);}else{single=benchSingle(r);peakMemory();dual=benchDual(r);}
 benchmark.samples.push({index:i+1,input:CASES.filter(s=>['moderate-A','moderate-AB','strong-black','blue-offset'].includes(s.id))[i%4]?.id,
  singleMs:single.ms,dualMs:dual.ms,memory:peakMemory()});
 if((i+1)%10===0)console.log(`benchmark ${i+1}/100`);
}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
benchmark.times=Object.fromEntries(['single','dual'].map(name=>[name,{medianMs:percentile(benchmark.samples.map(s=>s[`${name}Ms`]),.5),p95Ms:percentile(benchmark.samples.map(s=>s[`${name}Ms`]),.95)}]));
benchmark.endMemory=processMemory();globalThis.gc?.();benchmark.afterOptionalGc=processMemory();
benchmark.scope='Frozen worker computes two optical rasters for both timings; single skips source fiducial normalization/read/reconcile. This is a controlled reader-count comparison, not the production one-buffer Worker benchmark.';
report.benchmark=benchmark;
report.summary={cases:report.cases.length,questions:report.cases.reduce((n,c)=>n+c.truth.length,0),newIncorrectDefinitiveAnswersVersusConsensus:report.cases.reduce((n,c)=>n+c.newIncorrectDefinitiveAnswersVersusConsensus.length,0)};
for(const name of ['source','single','consensus']){
 const sum={};for(const c of report.cases)for(const [k,v] of Object.entries(c.metrics[name]))if(typeof v==='number'&&!['answerCoverage','definitiveAnswerPrecision','reviewRate'].includes(k))sum[k]=(sum[k]||0)+v;
 report.summary[name]={...sum,answerCoverage:sum.correctDefinitiveAnswers/sum.truthSingle,definitiveAnswerPrecision:sum.read?sum.correctDefinitiveAnswers/sum.read:null,reviewRate:sum.review/sum.questions};
}
report.gate={zeroNewIncorrectDefinitiveAnswers:report.summary.newIncorrectDefinitiveAnswersVersusConsensus===0,
 opticalSafetyEquivalentDemonstrated:false,physicalHomologation:false,
 reason:report.summary.newIncorrectDefinitiveAnswersVersusConsensus>0?'BLOCKED: labelled synthetic double marks under local shadow become a wrong definitive single answer; frozen consensus requests review.':'Finite synthetic corpus can expose regressions but cannot demonstrate universal equivalence; inspect wrong answers, omissions and uncovered physical gates.'};
await writeFile(new URL('./optical-evidence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
await writeFile(new URL('./corpus-labels.json',import.meta.url),JSON.stringify({version:CORPUS_VERSION,parameters:CASES,labels:report.cases.map(c=>({id:c.id,model:c.model,raster:c.raster,truth:c.truth}))},null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,benchmark:benchmark.times,gate:report.gate},null,2));
