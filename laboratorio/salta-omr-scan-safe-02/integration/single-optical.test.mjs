import test from 'node:test';
import assert from 'node:assert/strict';
import {readSingleOptical} from './single-optical.mjs';
function testContract({readSingleOptical,assert}){
 const template={templateId:"t",revision:2,pageCount:2},manifest={templateId:"t",revision:2,contentHash:"hash",mode:"full"};
 const optical={rectified:{gray:new Uint8Array([220,0,130,240]),width:2,height:2},source:{gray:new Uint8Array([1,2,3,4]),width:2,height:2}};
 let calls={detect:0,warp:0,read:0};
 const result={templateId:"t",templateRevision:2,contentHash:"hash",page:2,pageCount:2,identity:{state:"review",code:null},observations:[{state:"read",answer:"A"},{state:"double",answer:null}]};
 const deps={detect:(g)=>{calls.detect++;assert(g===optical.rectified.gray,"rectified only");return {found:true,confidence:.9,corners:[{}, {}, {}, {}]}},warp:(g)=>{calls.warp++;return {pixels:g,width:2,height:2}},read:()=>{calls.read++;return result}};
 const args={optical,template,manifest,page:2};
 const out=readSingleOptical(args,deps);
 assert(calls.detect===1&&calls.warp===1&&calls.read===1,"one read only");
 assert(out.reading===result&&out.identityPending&&!out.requiresOpticalReview,"identity pending distinct from optical state");
 assert(out.reading.observations[1].state==="double"&&out.reading.observations[1].answer===null,"double not promoted");
 let n=0;for(const bad of [{...args,page:3},{...args,manifest:{...manifest,revision:1}},{...args,optical:{rectified:null}}]){
  try{readSingleOptical(bad,deps)}catch{n++}
 }
 assert(n===3&&calls.read===1,"invalid input rejected before reading");
 let failed=false;try{readSingleOptical(args,{...deps,detect:()=>({found:false})})}catch{failed=true}
 assert(failed&&calls.read===1,"failed detection no fallback");
 failed=false;try{readSingleOptical(args,{...deps,read:()=>({...result,page:1})})}catch{failed=true}
 assert(failed,"reject mismatched result");
 return 6;
}
test('integration adapter: one optical path and fail closed',()=>{assert.equal(testContract({readSingleOptical,assert:(v,msg)=>assert.ok(v,msg)}),6);});
