import test from 'node:test';
import assert from 'node:assert/strict';
import {installPrivateAssessmentUI} from '../../corretor/v2/assessments/private-ui.mjs';
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';

class Element{
 constructor(tag='div'){this.tag=tag;this.attrs={};this.children=[];this.value='';this.textContent='';this.dataset={};this.disabled=false;this.hidden=false}
 setAttribute(k,v){this.attrs[k]=v}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=items;this.value=''}
 get options(){return this.children.filter(item=>item.tag==='option')}
}
const doc=()=>{const host=new Element('section');return {host,document:{
 getElementById:id=>{assert.equal(id,'privateAssessmentsHost');return host},
 createElement:tag=>new Element(tag)
}}};
const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const scope={institutionId:'school-a',classId:'class-a',periodId:'2026'};
const records=n=>Array.from({length:n},(_,i)=>({id:uuid(i+1),revision:1,title:'Avaliação '+(i+1),state:'active',...scope}));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function mockClient(items,{errorAt=null}={}){
 const calls=[];
 let failing=errorAt,sessionCalls=0;
 const client={enabled:true,classifyError:e=>e.status===401?'session':e.status===403?'forbidden':e.status===429?'rate_limited':
  e.status===503?'unavailable':e.status===404?'missing':'failed',
 session:async()=>{sessionCalls++;return {authenticated:true,principalId:'synthetic-teacher',epoch:1}},
 grants:async()=>[scope],
 list:async(after=null)=>{
  calls.push(after);
  if(failing!==null){const status=failing;failing=null;throw Object.assign(new Error('Catálogo indisponível '+status),{status})}
  const matching=items.filter(x=>!after||x.id>after);
  const page=matching.slice(0,10);
  return {assessments:page,nextCursor:matching.length>10?page.at(-1).id:null}
 },
 open:async id=>({id,revision:1,status:'issued',archived:false,manifestHash:'synthetic-geom',
  definition:{title:items.find(x=>x.id===id)?.title||'Synthetic'},...scope})
 };
 return {client,calls,sessionCalls:()=>sessionCalls,failOnce:status=>{failing=status}};
}
async function setup(count){
 const {document,host}=doc(),mock=mockClient(records(count));
 const ui=installPrivateAssessmentUI({document,client:mock.client,getDraft:()=>({plan:{},manifest:{}}),
  applyRecord:()=>{},onSelection:()=>{}});
 await ui.controls.connect.onclick();ui.controls.scope.value='0';await ui.controls.chooseScope.onclick();
 return {ui,host,...mock};
}
test('catalog UI: empty, 1, 10, 11, 20 and 23 records keep at most ten entries and can go back',async()=>{
 for(const n of [0,1,10,11,20,23]){
  const {ui,calls}=await setup(n),control=ui.controls;
  const expected=Math.max(1,Math.ceil(n/10));
  assert.equal(ui.controller.view().rows.length,Math.min(10,n));
  assert.equal(control.catalog.options.length,Math.min(n,10)+1);
  assert.equal(control.pageIndicator.textContent.includes('Página 1'),true);
  const seen=[];
  for(let p=0;p<expected;p++){
   if(p)await control.more.onclick();
   const state=ui.controller.view();
   assert.equal(state.pageIndex,p);
   assert.ok(state.rows.length<=10,'client must keep one page, not accumulated results');
   assert.ok(control.catalog.options.length<=11,'no more than ten entries plus placeholder');
   assert.equal(control.previous.disabled,p===0);
   assert.equal(control.more.disabled,p===expected-1);
   seen.push(...state.rows.map(x=>x.id));
  }
  assert.deepEqual(seen,records(n).map(x=>x.id),'navigation must not omit or repeat records');
  for(let p=expected-2;p>=0;p--){
   await control.previous.onclick();
   assert.equal(ui.controller.view().pageIndex,p);
   assert.deepEqual(ui.controller.view().rows.map(x=>x.id),
    records(n).slice(p*10,p*10+10).map(x=>x.id));
  }
  assert.equal(calls.length,expected+(expected-1));
  assert.match(control.pageIndicator.textContent,/até 10/);
 }
});
test('catalog UI: changing page invalidates writable open record without touching historical revisions',async()=>{
 const {ui}=await setup(11),c=ui.controls;
 c.catalog.value=uuid(1);c.catalog.onchange();await c.chooseAssessment.onclick();
 assert.equal(ui.controller.view().record.id,uuid(1));
 assert.equal(c.saveDraft.disabled,false);
 await c.more.onclick();
 assert.equal(ui.controller.view().record,null);
 assert.equal(ui.controller.view().pageIndex,1);
 assert.equal(c.saveDraft.disabled,true);
 assert.equal(c.catalog.options.length,2);
 await c.previous.onclick();
 assert.equal(ui.controller.view().pageIndex,0);
 assert.equal(c.saveDraft.disabled,true,'reopening is required even after returning to old page');
});
test('catalog UI: 429 and network/503 fail honestly, and manual next/refresh recovers without duplicates',async()=>{
 const {ui,failOnce}=await setup(11),c=ui.controls;
 for(const status of [429,503,0]){
  failOnce(status);
  await c.more.onclick();
  assert.equal(ui.controller.view().pageIndex,0,'failure must not advance page');
  assert.equal(ui.controller.view().rows.length,10);
  assert.equal(ui.controller.view().phase,status===429?'rate_limited':status===503?'unavailable':'failed');
  assert.doesNotMatch(ui.controller.view().message,/Salvo ·/);
  await c.more.onclick();
  assert.equal(ui.controller.view().pageIndex,1);
  await c.previous.onclick();
 }
 assert.equal(ui.controller.view().rows.length,10);
});
test('catalog UI: 401 clears scope and disables navigation; session reconnect restores access',async()=>{
 const {ui,failOnce,sessionCalls}=await setup(11),c=ui.controls;
 failOnce(401);
 await c.more.onclick();
 assert.equal(ui.controller.view().phase,'session');
 assert.equal(ui.controller.view().scope,null);
 assert.equal(c.more.disabled,true);
 assert.equal(c.fetchLibrary.disabled,true);
 await c.connect.onclick();
 c.scope.value='0';await c.chooseScope.onclick();
 assert.equal(sessionCalls(),2);
 assert.equal(ui.controller.view().rows.length,10);
 assert.equal(c.more.disabled,false);
});
test('catalog client: remote 429 is typed recoverable and never interprets response as saved',async()=>{
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:'https://synthetic-service/assessments/v1',
  fetchFn:async()=>({status:429,ok:false,json:async()=>({code:'rate_limited'})})});
 await assert.rejects(client.list(),error=>error.status===429&&error.retryable===true
  &&client.classifyError(error)==='rate_limited');
});
test('catalog controller: stale failing GET from previous page cannot overwrite latest page',async()=>{
 const {document}=doc(),late=deferred(),data=records(11),base=mockClient(data);
 let firstPage=true;
 base.client.list=async(after=null)=>{
  if(firstPage){firstPage=false;return {assessments:data.slice(0,10),nextCursor:data[9].id}}
  if(!after)return late.promise;
  return {assessments:data.slice(10),nextCursor:null};
 };
 const ui=installPrivateAssessmentUI({document,client:base.client,getDraft:()=>({plan:{},manifest:{}})});
 await ui.controls.connect.onclick();ui.controls.scope.value='0';await ui.controls.chooseScope.onclick();
 const old=ui.controller.list();
 const newer=ui.controller.list({more:true});
 await newer;
 const snapshot=ui.controller.view();
 late.reject(Object.assign(new Error('old catalog 401'),{status:401}));
 assert.equal(await old,null);
 assert.equal(ui.controller.view().phase,snapshot.phase);
 assert.equal(ui.controller.view().scope.classId,snapshot.scope.classId);
 assert.deepEqual(ui.controller.view().rows,snapshot.rows);
});
