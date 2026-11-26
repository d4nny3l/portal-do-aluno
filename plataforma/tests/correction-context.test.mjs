import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorrectionContext} from '../../corretor/v2/assessments/correction-context.mjs';
const scope={institutionId:'school-A',classId:'class-A',periodId:'period-A'};
function setup(){
 const record={id:'id-A',revision:1,manifestHash:'hash-A',status:'issued',archived:false,...scope,definition:{answers:['A']}};
 const selection={assessmentId:record.id,revision:1,manifestHash:record.manifestHash,selectionId:'s-A',scope:{...scope},plan:{blocks:[{key:['A']}]},manifest:{questions:[{bubbles:[]}]},template:{questions:[]}};
 let state={generation:1,session:{principalId:'teacher-A',epoch:1},scope:{...scope},record,selection},mode='ok',online=true,calls=[],revokes=0,invalidates=0,clock=0;
 const monitor=createCorrectionContext({view:()=>state,online:()=>online,now:()=>clock,
  client:{async request(method,path,body,{signal}){
   calls.push(path);
   if(typeof mode==='function')return mode(path,signal);
   if(typeof mode==='number')throw Object.assign(Error('remote status'),{status:mode});
   if(mode==='network')throw Object.assign(Error('offline'),{status:0,code:'network'});
   if(path==='/session')return {data:{authenticated:true,principalId:mode==='teacher'?'teacher-B':'teacher-A',epoch:mode==='epoch'?2:1}};
   return {data:{record:{...record,...(mode==='revision'?{revision:2}:mode==='archive'?{archived:true}:mode==='definition'?{definition:{answers:['B']}}:{})}}};
  }},revoke(){revokes++;monitor.clear();state={generation:state.generation+1,session:null,scope:null,record:null,selection:null}},
  invalidate(){invalidates++;monitor.clear();state={...state,generation:state.generation+1,record:null,selection:null}}});
 const metadata=monitor.bind(selection);
 return {monitor,selection,metadata,calls,setMode:v=>mode=v,setOnline:v=>online=v,advance:v=>clock+=v,
  switchScope:()=>{state={...state,generation:2,scope:{...scope,classId:'class-B'}}},
  counts:()=>({revokes,invalidates})};
}
test('RAM snapshot pins all nested content and local lookups issue no requests',()=>{
 const f=setup();assert.ok(Object.isFrozen(f.selection.manifest.questions[0].bubbles));assert.ok(Object.isFrozen(f.selection.plan.blocks[0].key));
 assert.throws(()=>f.selection.plan.blocks[0].key.push('B'));for(let i=0;i<400;i++)assert.equal(f.monitor.binding(f.selection),f.metadata);
 assert.equal(f.calls.length,0);f.switchScope();assert.equal(f.monitor.binding(f.selection),null);
});
test('network, 429 and all 5xx preserve selected RAM; remote export still denied',async()=>{
 const f=setup();for(const mode of ['network',429,500,502,503,504]){
  f.setMode(mode);assert.equal(await f.monitor.verify({force:true}),false);assert.equal(f.monitor.binding(f.selection),f.metadata);
  assert.equal(await f.monitor.verify({force:true,remoteOperation:true}),false);
 }
 f.setOnline(false);const count=f.calls.length;assert.equal(await f.monitor.verify({force:true}),false);assert.equal(f.calls.length,count);
 f.setOnline(true);f.setMode('ok');assert.equal(await f.monitor.verify({force:true}),true);assert.equal(f.monitor.binding(f.selection),f.metadata);
});
test('confirmed auth, grant, principal and epoch changes revoke session; missing, replaced, archived, divergent definition invalidate record',async()=>{
 for(const mode of [401,403,'teacher','epoch',404,409,410,'revision','archive','definition']){
  const f=setup();f.setMode(mode);assert.equal(await f.monitor.verify({force:true}),false);assert.equal(f.monitor.binding(f.selection),null);
  assert.deepEqual(f.counts(),[401,403,'teacher','epoch'].includes(mode)?{revokes:1,invalidates:0}:{revokes:0,invalidates:1});
 }
});
test('in-flight background checks deduplicate, do not block local notes, stale response cannot invalidate next context',async()=>{
 const f=setup();let release;f.setMode(()=>new Promise(resolve=>{release=resolve}));
 const a=f.monitor.verify({force:true}),b=f.monitor.verify({force:true});
 assert.equal(f.calls.length,1);assert.equal(f.monitor.binding(f.selection),f.metadata);
 f.switchScope();release({data:{authenticated:false}});
 assert.equal(await a,false);assert.equal(await b,false);assert.deepEqual(f.counts(),{revokes:0,invalidates:0});
});
test('periodic checks have a throttle; a fresh export check is never authorized by a previous successful result',async()=>{
 const f=setup();assert.equal(await f.monitor.verify(),false);f.advance(30000);assert.equal(await f.monitor.verify(),true);
 assert.equal(f.calls.length,2);assert.equal(await f.monitor.verify(),false);f.setMode(403);
 assert.equal(await f.monitor.verify({force:true,remoteOperation:true}),false);assert.equal(f.calls.length,3);assert.equal(f.monitor.binding(f.selection),null);
});
