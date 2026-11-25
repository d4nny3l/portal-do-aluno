import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {CASES,modelFor,truthFor,CORPUS_VERSION} from '../validation/optical-corpus.mjs';
import {frozenWorker,frozenCandidateRead,compareOptical,metrics,referenceHashes} from '../validation/offline-optical.mjs';
import {processCapture} from '../processor.mjs';

const evidence=JSON.parse(await readFile(new URL('../validation/optical-evidence.json',import.meta.url),'utf8'));

test('offline evidence is synthetic, labelled and retains denominator and 100 consecutive measurements',()=>{
 assert.equal(evidence.corpusVersion,CORPUS_VERSION);
 assert.deepEqual(evidence.cases.map(c=>c.id),CASES.map(c=>c.id),'regenerate evidence after corpus edits');
 assert.equal(evidence.privacy.syntheticOnly,true);
 assert.equal(evidence.privacy.remoteCalls,false);
 assert.equal(evidence.benchmark.count,100);
 assert.equal(evidence.benchmark.samples.length,100);
 assert.deepEqual(evidence.benchmark.samples.map(s=>s.index),Array.from({length:100},(_,i)=>i+1));
 for(const sample of evidence.benchmark.samples){assert.ok(sample.singleMs>0);assert.ok(sample.dualMs>0);assert.ok(sample.memory.rss>0);}
 const tags=new Set(evidence.cases.flatMap(c=>c.tags));
 for(const required of ['A moderado','A+B','fraca','dupla','branca','rasura','sombra','reflexo','azul','preto','lápis','C-E','V1','V2','embedded'])assert.ok(tags.has(required),required);
 for(const path of ['source','single','consensus']){
  const m=evidence.summary[path];
  assert.equal(m.questions,m.read+m.blank+m.double+m.review+m.unavailable);
  assert.equal(m.truthSingle+m.truthBlank+m.truthMultiple,m.questions);
  assert.equal(m.correctDefinitiveAnswers+m.incorrectDefinitiveAnswers,m.read);
 }
 assert.equal(evidence.gate.opticalSafetyEquivalentDemonstrated,false);
 assert.equal(evidence.gate.physicalHomologation,false);
});

test('frozen reference files retain the hashes used by the offline comparison',async()=>{
 assert.deepEqual(await referenceHashes(),evidence.referenceHashes);
});

test('metrics count double-to-single as wrong definitive answer and separate abstention/omission',()=>{
 const expected=[{questionId:'1',state:'double',answer:null,marks:['A','B']},{questionId:'2',state:'read',answer:'C',marks:['C']},
  {questionId:'3',state:'read',answer:'D',marks:['D']},{questionId:'4',state:'blank',answer:null,marks:[]}];
 const result={reading:{observations:[{questionId:'1',state:'read',answer:'A',marks:['A']},{questionId:'2',state:'blank',answer:null,marks:[]},
  {questionId:'3',state:'review',answer:null,marks:['D']},{questionId:'4',state:'read',answer:'B',marks:['B']}]}};
 const m=metrics(expected,result);
 assert.equal(m.incorrectDefinitiveAnswers,2);assert.equal(m.incorrectDefinitiveBlanks,1);
 assert.equal(m.falsePositiveMarks,1);assert.equal(m.falseNegativeMarks,2);
 assert.equal(m.review,1);assert.equal(m.answerCoverage,0);assert.equal(m.definitiveAnswerPrecision,0);
 const unavailable=metrics(expected,{ok:false});assert.equal(unavailable.unavailable,4);assert.equal(unavailable.falseNegativeMarks,4);
});

test('full frozen pipeline reproduces moderate A/A+B and the known shadow safety blocker',async()=>{
 const worker=await frozenWorker(),candidate=await frozenCandidateRead();
 for(const id of ['moderate-A','moderate-AB','shadow-AB-130']){
  const spec=CASES.find(c=>c.id===id),model=modelFor(spec),saved=evidence.cases.find(c=>c.id===id);
  const rgba=gunzipSync(await readFile(new URL(`../validation/${id}.rgba.gz`,import.meta.url)));
  assert.equal(createHash('sha256').update(rgba).digest('hex'),saved.raster.rgbaSha256);
  const {width:w,height:h}=saved.raster;
  const input=worker({data:rgba,w,h,corners:[[0,0],[w,0],[w,h],[0,h]]});
  const result=compareOptical(input,model,candidate),first=name=>result[name].reading.observations[0];
  assert.equal(result.source.ok,true);assert.equal(result.single.ok,true);
  assert.equal(result.single.reading.identity.code,'0001123');
  if(id==='moderate-A'){assert.equal(first('single').answer,'A');assert.equal(result.consensus.complete,true);}
  if(id==='moderate-AB'){assert.equal(first('single').state,'double');assert.deepEqual([...first('single').marks].sort(),['A','B']);}
  if(id==='shadow-AB-130'){
   assert.equal(first('source').state,'double');assert.equal(first('single').state,'read');assert.equal(first('single').answer,'A');
   assert.equal(first('consensus').state,'review');assert.equal(first('consensus').answer,null);assert.equal(result.consensus.complete,false);
   assert.equal(metrics(truthFor(spec,model),result.single).incorrectDefinitiveAnswers,1);
   assert.equal(saved.newIncorrectDefinitiveAnswersVersusConsensus.length,1);
   assert.equal(evidence.gate.zeroNewIncorrectDefinitiveAnswers,false,'green regression test documents a blocked release gate, not optical approval');
  }
 }
});

test('candidate production processor matches frozen rectified reading once, including the release blocker',async()=>{
 const worker=await frozenWorker(),candidate=await frozenCandidateRead();
 for(const [index,id] of ['moderate-A','moderate-AB','shadow-AB-130'].entries()){
  const spec=CASES.find(c=>c.id===id),model=modelFor(spec),saved=evidence.cases.find(c=>c.id===id);
  const data=new Uint8ClampedArray(gunzipSync(await readFile(new URL(`../validation/${id}.rgba.gz`,import.meta.url))));
  const {width:w,height:h}=saved.raster,corners=[[0,0],[w,0],[w,h],[0,h]];
  const frozen=compareOptical(worker({data,w,h,corners}),model,candidate);
  const token={captureId:index+1,sessionId:0,templateId:model.template.templateId,templateRevision:model.template.revision,contentHash:model.manifest.contentHash,page:1};
  const result=processCapture({data,w,h,corners,...model,page:1,showCode:true,token});
  assert.equal(result.error,undefined,id);assert.equal(result.metrics.readCalls,1,id);
  assert.deepEqual(result.reading,frozen.single.reading,`${id}: exact frozen Scanner gray output`);
  assert.deepEqual(result.token,token);assert.ok(result.optical.pixels instanceof Uint8Array);
 }
});

test('candidate benchmark records 100 paired actual API captures with the safety gate blocked',async()=>{
 const report=JSON.parse(await readFile(new URL('../validation/candidate-evidence.json',import.meta.url),'utf8'));
 assert.equal(report.samples.length,100);
 assert.deepEqual(report.samples.map(s=>s.index),Array.from({length:100},(_,i)=>i+1));
 assert.ok(report.samples.every(s=>s.readCalls===1&&s.productionMs>0&&s.frozenDualMs>0));
 assert.ok(report.cases.every(c=>c.exactReadingParity));
 assert.equal(report.gate.singleReadPerCapture,true);
 assert.equal(report.gate.zeroNewIncorrectDefinitiveAnswers,false);
 assert.equal(report.gate.newIncorrectDefinitiveAnswersVersusConsensus,1);
 assert.equal(report.labelledEvidenceSha256,createHash('sha256').update(await readFile(new URL('../validation/optical-evidence.json',import.meta.url))).digest('hex'));
});
