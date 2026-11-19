// Real private worker + synthetic Auth + in-memory D1; never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {harness,packet,scope} from './helpers.mjs';

const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const read=async(response)=>{assert.equal(response.status,200);return response.json()};
const sizes=[0,1,10,11,20,23];

test('catalog pages 0/1/10/11/20/23: bounded SQL, opaque cursors, private owner, encrypted keys, historical revisions',async t=>{
 const h=await harness();t.after(h.close);
 const prepare=h.db.prepare.bind(h.db);
 let sqlStatements=[];
 h.db.prepare=sql=>{sqlStatements.push(sql);return prepare(sql)};
 const benchmark=[];
 let inserted=0,firstId=null;
 for(const size of sizes){
  while(inserted<size){
   const id=uuid(++inserted);
   const response=await h.request('/assessments/'+id,{method:'PUT',data:packet()});
   assert.equal(response.status,201,'seed '+inserted);
   if(firstId===null)firstId=id;
  }
  let after=null,all=[],pages=[],round=0;
  do{
   const begin=performance.now(),cpuBefore=process.cpuUsage(),before=sqlStatements.length;
   const query='/assessments'+(after?'?after='+encodeURIComponent(after):'');
   const response=await h.request(query);
   const data=await read(response);
   const cpu=process.cpuUsage(cpuBefore),elapsed=performance.now()-begin,sql=sqlStatements.slice(before);
   assert.ok(data.assessments.length<=10,'never more than ten records per page');
   assert.ok(sql.some(line=>/LIMIT 11/.test(line)),'11th row used only as cursor sentinel');
   assert.ok(sql.length<=32,'bounded queries: 2 auth/list + at most 3 per decrypted record');
   assert.equal(data.assessments.some(row=>row.ownerId||row.answers||row.definition),false);
   assert.equal(JSON.stringify(data).includes('"correct"'),false);
   if(data.nextCursor)assert.equal(data.nextCursor,data.assessments.at(-1).id);
   pages.push({page:++round,rows:data.assessments.length,queries:sql.length,
    cpuMs:+((cpu.user+cpu.system)/1000).toFixed(3),latencyMs:+elapsed.toFixed(3)});
   all.push(...data.assessments.map(row=>row.id));
   after=data.nextCursor;
   assert.ok(round<=Math.ceil(size/10)+1,'cursor must terminate');
  }while(after);
  const expected=Array.from({length:size},(_,i)=>uuid(i+1));
  assert.deepEqual(all,expected,'pages must not skip or duplicate IDs');
  assert.deepEqual(pages.map(p=>p.rows),size===0?[0]:
   Array.from({length:Math.ceil(size/10)},(_,i)=>Math.min(10,size-i*10)));
  benchmark.push({catalogSize:size,pages,queryTotal:pages.reduce((sum,p)=>sum+p.queries,0),
   cpuMs:+pages.reduce((sum,p)=>sum+p.cpuMs,0).toFixed(3),
   latencyMs:+pages.reduce((sum,p)=>sum+p.latencyMs,0).toFixed(3)});
  const someoneElse=await read(await h.request('/assessments',{actor:'b'}));
  assert.deepEqual(someoneElse.assessments,[],'different teacher must not see private catalog');
 }
 // Current revision list is metadata only; opening exact historic revision requires grant.
 const historical=await h.request('/assessments/'+firstId+'/revisions/1');
 assert.equal(historical.status,200);
 const original=await historical.json();
 assert.equal(original.record.revision,1);
 assert.equal(original.record.definition.answers.length,5,'answer key only in authorized private revision GET');
 const row=h.db.sqlite.prepare('SELECT encrypted_json FROM av_revisions WHERE assessment_id=? AND revision=1').get(firstId);
 assert.ok(!row.encrypted_json.includes('"correct"'),'database holds an encrypted envelope');
 h.db.sqlite.exec("UPDATE av_grants SET enabled=0 WHERE principal_id='synthetic-teacher-a'");
 const revoked=await read(await h.request('/assessments'));
 assert.equal(revoked.assessments.length,0,'revoked grants remove all rows');
 assert.equal((await h.request('/assessments/'+firstId)).status,403,'revoked teacher cannot open history');
 console.log('SALTA_CATALOG_LOCAL_BENCHMARK '+JSON.stringify({environment:'Node 24 + SQLite in-memory; synthetic Auth, not Cloudflare Workers Free',results:benchmark}));
});
test('catalog cursor rejects malformed IDs and does not allow cross-owner cursor leakage',async t=>{
 const h=await harness();t.after(h.close);
 const r=await h.request('/assessments?after=invalid-cursor');
 assert.equal(r.status,400);
 // A valid UUID belonging to another teacher is only a sort boundary, not a privilege.
 const after=uuid(3),listing=await read(await h.request('/assessments?after='+after));
 assert.deepEqual(listing.assessments,[]);
});
