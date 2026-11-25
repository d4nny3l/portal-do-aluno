// This module is a test instrument. It must never be imported by production UI.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {detectFiducials,warpFromFiducials} from '../../omr/normalize.mjs';
import {readRaster} from '../../omr/reader.mjs';
import {reconcile} from '../../../../laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs';
const root=new URL('../../../../',import.meta.url);
export const REFERENCE_FILES=[
 'laboratorio/salta-omr-scan-safe-02/omr-lab.mjs',
 'laboratorio/salta-omr-scan-safe-02/js/worker.js',
 'laboratorio/salta-omr-scan-safe-02/js/vision.js',
 'laboratorio/salta-omr-scan-safe-02/js/document-enhance.mjs',
 'laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs',
 'corretor/v2/omr/normalize.mjs','corretor/v2/omr/reader.mjs',
];
export async function referenceHashes(){
 return Object.fromEntries(await Promise.all(REFERENCE_FILES.map(async file=>[file,createHash('sha256').update(await readFile(new URL(file,root))).digest('hex')])));
}
export async function frozenCandidateRead(){
 const src=await readFile(new URL(REFERENCE_FILES[0],root),'utf8');
 const start=src.indexOf('function candidateRead('),end=src.indexOf('\nfunction failed(',start);
 if(start<0||end<=start)throw new Error('Frozen candidateRead boundary changed; review harness before use.');
 // Exact function body from the frozen laboratory, with its original imports.
 return new Function('detectFiducials','warpFromFiducials','readRaster',src.slice(start,end)+'\nreturn candidateRead;')(detectFiducials,warpFromFiducials,readRaster);
}
let workerHandler;
export async function frozenWorker(){
 const previous=globalThis.self;
 let result;
 globalThis.self={postMessage:message=>{result=message;}};
 try{
  if(!workerHandler){await import('../../../../laboratorio/salta-omr-scan-safe-02/js/worker.js');workerHandler=globalThis.self.onmessage;}
  const handler=workerHandler;
  if(typeof handler!=='function')throw new Error('Frozen Worker not initialized.');
  return input=>{
   result=null;
   const old=globalThis.self;
   globalThis.self={postMessage:message=>{result=message;}};
   try{handler({data:{id:1,op:'process',mode:'gray',rot:0,maxSide:2600,optical:true,...input}});}
   finally{if(old===undefined)delete globalThis.self;else globalThis.self=old;}
   if(!result||result.error)throw new Error(result?.error||'Frozen Worker returned no result.');
   return result;
  };
 }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
}
export function readSafely(candidate,raster,model){
 try{return candidate(raster,model,1);}catch(error){return {ok:false,error:error.message};}
}
export function compareOptical(workerResult,model,candidate){
 const source=readSafely(candidate,workerResult.optical.source,model);
 const single=readSafely(candidate,workerResult.optical.rectified,model);
 return {source,single,consensus:reconcile(source,single)};
}

export function metrics(truth,result){
 const rows=result?.reading?.observations||[],byId=new Map(rows.map(row=>[row.questionId,row]));
 const out={questions:truth.length,truthSingle:0,truthBlank:0,truthMultiple:0,read:0,blank:0,double:0,review:0,unavailable:0,
  truePositiveMarks:0,falsePositiveMarks:0,falseNegativeMarks:0,correctDefinitiveAnswers:0,incorrectDefinitiveAnswers:0,
  incorrectDefinitiveBlanks:0,correctClassifications:0,incorrectClassifications:0,requiresReviewNotReviewed:0};
 const mismatches=[];
 for(const expected of truth){
  out[expected.marks.length===0?'truthBlank':expected.marks.length===1?'truthSingle':'truthMultiple']++;
  const actual=byId.get(expected.questionId);
  if(!actual){out.unavailable++;out.falseNegativeMarks+=expected.marks.length;mismatches.push({expected,actual:null});continue;}
  if(actual.state in out)out[actual.state]++;
  const predicted=new Set(actual.marks||[]),wanted=new Set(expected.marks);
  for(const mark of predicted)out[wanted.has(mark)?'truePositiveMarks':'falsePositiveMarks']++;
  for(const mark of wanted)if(!predicted.has(mark))out.falseNegativeMarks++;
  const same=actual.state===expected.state&&actual.answer===expected.answer&&JSON.stringify([...predicted].sort())===JSON.stringify(expected.marks);
  out[same?'correctClassifications':'incorrectClassifications']++;
  if(actual.state==='read')out[expected.state==='read'&&actual.answer===expected.answer?'correctDefinitiveAnswers':'incorrectDefinitiveAnswers']++;
  if(actual.state==='blank'&&expected.marks.length)out.incorrectDefinitiveBlanks++;
  if(expected.requiresReview&&actual.state!=='review'&&actual.state!=='double')out.requiresReviewNotReviewed++;
  if(!same||expected.requiresReview&&actual.state!=='review'&&actual.state!=='double')mismatches.push({expected,actual});
 }
 return {...out,answerCoverage:out.truthSingle?out.correctDefinitiveAnswers/out.truthSingle:null,
  definitiveAnswerPrecision:out.read?out.correctDefinitiveAnswers/out.read:null,
  reviewRate:out.review/out.questions,mismatches};
}
