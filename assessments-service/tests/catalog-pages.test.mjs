import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {harness,packet,definition,scope} from './helpers.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {createPrivateLibraryController} from '../../corretor/v2/assessments/private-library.mjs';
const query=scope=>new URLSearchParams(scope).toString();
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function save(h,id,revision=0,changedTitle=null){
 const p=packet(revision);
 if(changedTitle)p.definition.title=changedTitle;
 const r=await h.request('/assessments/'+id,{method:'PUT',data:p});
 assert.equal(r.status,201,await r.clone().text());
}
async function measuredRequest(h,path){
 const statements=[];
 const prepare=h.db.prepare.bind(h.db);
 h.db.prepare=sql=>{statements.push(sql);return prepare(sql)};
 const t0=performance.now(),cpu0=process.cpuUsage();
 try{
  const reply=await h.request(path);
  const response=await reply.json();
  const elapsed=performance.now()-t0,cpu=process.cpuUsage(cpu0);
  return {status:reply.status,response,elapsedMs:Number(elapsed.toFixed(3)),
   nodeCpuMs:Number(((cpu.user+cpu.system)/1000).toFixed(3)),statements:statements.length,sql:statements};
 }finally{h.db.prepare=prepare}
}
test('catalog 0/1/10/11/20/31: exact scoped ten/page, stable cursors, owner isolation and measured D1 work',async t=>{
 const h=await harness();t.after(h.close);
 const ids=[],results=[];
 for(const size of [0,1,10,11,20,31]){
  while(ids.length<size){const id=crypto.randomUUID();await save(h,id);ids.push(id)}
  const seen=new Set();let after=null,pages=0;
  do{
   const url='/assessments?'+query(scope)+(after?'&after='+encodeURIComponent(after):'');
   const m=await measuredRequest(h,url);
   assert.equal(m.status,200,'catalog request '+size);
   const {assessments,nextCursor}=m.response;
   assert.ok(assessments.length<=10,'no page exceeds ten');
   assert.ok(assessments.every(x=>Object.keys(scope).every(k=>x[k]===scope[k])));
   assert.ok(assessments.every(x=>!('definition' in x)&&!('answers' in x)&&!('encrypted_json' in x)));
   assert.ok(!JSON.stringify(m.response).includes('"correct"'),'no correct answers in catalog');
   for(const row of assessments){assert.ok(!seen.has(row.id));seen.add(row.id)}
   assert.ok(m.statements<=3,'expected <=3 local D1 prepare calls, got '+m.statements);
   assert.ok(m.sql.some(sql=>/LIMIT 11/.test(sql)&&/JOIN av_revisions/.test(sql)),'one scoped revision query with lookahead');
   if(nextCursor!==null){assert.equal(assessments.length,10);assert.equal(nextCursor,assessments[9].id)}
   results.push({totalSyntheticRecords:size,page:++pages,returned:assessments.length,hasNext:nextCursor!==null,
    d1PrepareCalls:m.statements,nodeCpuMs:m.nodeCpuMs,wallMs:m.elapsedMs});
   after=nextCursor;
   assert.ok(pages<=5,'cursor must always terminate');
  }while(after);
  assert.equal(seen.size,size,'all records traversed');
  assert.equal(pages,Math.max(1,Math.ceil(size/10)));
 }
 console.info('SALTA_CATALOG_PERF_NODE_LOCAL '+JSON.stringify(results));
 const ownerB=await h.request('/assessments?'+query(scope),{actor:'b'});
 assert.equal(ownerB.status,200);
 assert.deepEqual((await ownerB.json()).assessments,[],'another authorized teacher cannot enumerate owner A');
 const unauthorized={...scope,classId:'not-authorized'};
 assert.equal((await h.request('/assessments?'+query(unauthorized))).status,403);
 assert.equal((await h.request('/assessments?institutionId='+scope.institutionId)).status,400);
 assert.equal((await h.request('/assessments?'+query(scope)+'&after=bad')).status,400);
 assert.equal((await h.request('/assessments?'+query(scope)+'&classId=duplicate')).status,400);
 assert.equal((await h.request('/assessments?untrusted=1')).status,400);
 const latest=[...ids].sort()[0];
 await save(h,latest,1,'Avaliação sintética versão 2');
 const revision1=(await(await h.request('/assessments/'+latest+'/revisions/1')).json()).record;
 const revision2=(await(await h.request('/assessments/'+latest+'/revisions/2')).json()).record;
 assert.equal(revision1.revision,1);assert.equal(revision2.revision,2);
 assert.equal(revision1.definition.title,definition().title);
 assert.equal(revision2.definition.title,'Avaliação sintética versão 2');
 assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) AS n FROM av_revisions WHERE assessment_id=?').get(latest).n,2);
 assert.equal(h.db.sqlite.prepare('SELECT encrypted_json FROM av_revisions WHERE assessment_id=? AND revision=2').get(latest).encrypted_json.includes('Avaliação sintética versão 2'),false);
 const catalog=(await(await h.request('/assessments?'+query(scope))).json()).assessments;
 assert.equal(catalog.find(r=>r.id===latest)?.revision,2);
});
test('catalog isolates two grants for one teacher before pagination and denies revoked scopes',async t=>{
 const h=await harness();t.after(h.close);
 const second={institutionId:scope.institutionId,classId:'synthetic-class-b',periodId:scope.periodId};
 h.db.sqlite.prepare('INSERT INTO av_grants VALUES(?,?,?,?,1,1,?)')
  .run('synthetic-teacher-a',second.institutionId,second.classId,second.periodId,Date.now()+3600_000);
 await save(h,crypto.randomUUID());await save(h,crypto.randomUUID());
 const p=packet(0,{...second});const result=await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:p});
 assert.equal(result.status,201);
 assert.equal((await(await h.request('/assessments?'+query(second))).json()).assessments.length,1);
 assert.equal((await(await h.request('/assessments?'+query(scope))).json()).assessments.length,2);
 h.db.sqlite.prepare('UPDATE av_grants SET enabled=0 WHERE principal_id=? AND class_id=?')
  .run('synthetic-teacher-a',second.classId);
 assert.equal((await h.request('/assessments?'+query(second))).status,403);
 assert.equal((await(await h.request('/assessments?'+query(scope))).json()).assessments.length,2);
});
test('client/controller manually recovers from 429, network and expired 401 without skipping cursor',async()=>{
 const sc={institutionId:'school',classId:'class',periodId:'period'};
 let failCode=0,offline=false,connections=0;const urls=[];
 const fetchFn=async (url,opts)=>{
  urls.push({url,credentials:opts.credentials,cache:opts.cache});
  const path=new URL(url).pathname;
  if(path.endsWith('/session')){connections++;return Response.json({authenticated:true,principalId:'teacher',epoch:1})}
  if(path.endsWith('/grants'))return Response.json({grants:[sc]});
  if(offline){offline=false;throw Error('simulated disconnect')}
  if(failCode){const status=failCode;failCode=0;return Response.json({code:'synthetic'}, {status})}
  if(path.endsWith('/assessments')){
   const after=new URL(url).searchParams.get('after');
   if(!after)return Response.json({assessments:Array.from({length:10},(_,i)=>({
    id:uid(i+1),title:'Prova '+i,revision:1,state:'active',...sc})),nextCursor:uid(10)});
   assert.equal(after,uid(10),'a failed request must retry original cursor');
   return Response.json({assessments:[{id:uid(11),title:'Prova 11',revision:1,state:'active',...sc}],nextCursor:null});
  }
  throw Error('Unexpected path '+path);
 };
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:'https://synthetic.invalid/assessments/v1',fetchFn});
 const ctl=createPrivateLibraryController({client,getDraft:()=>({})});
 await ctl.initialize();ctl.useScope(sc);await ctl.list();
 assert.equal(ctl.view().pageIndex,0);assert.equal(ctl.view().nextCursor,uid(10));
 failCode=429;
 await assert.rejects(ctl.nextPage(),e=>e.status===429&&e.retryable);
 assert.equal(ctl.view().phase,'rate-limited');assert.equal(ctl.view().pageIndex,0);
 assert.equal((await ctl.nextPage()).length,1);assert.equal(ctl.view().pageIndex,1);
 offline=true;
 await assert.rejects(ctl.previousPage(),e=>e.code==='network'&&e.retryable);
 assert.equal(ctl.view().pageIndex,1);assert.equal(ctl.view().rows[0].id,uid(11));
 await ctl.previousPage();assert.equal(ctl.view().pageIndex,0);
 failCode=401;await assert.rejects(ctl.list(),e=>e.status===401);
 assert.equal(ctl.view().phase,'session');assert.equal(ctl.view().scope,null);
 assert.equal(ctl.view().session,null);assert.deepEqual(ctl.view().rows,[]);
 await ctl.initialize();ctl.useScope(sc);await ctl.list();
 assert.ok(connections>=2);
 assert.ok(urls.every(x=>x.credentials==='include'&&x.cache==='no-store'));
 assert.equal(ctl.view().rows.length,10);
});
