import test from 'node:test';import assert from 'node:assert/strict';
import {createStatsGateway,LIMITERS,PORTAL_ORIGIN} from '../gateway-lifecycle.mjs';
import {harness,packet} from './helpers.mjs';
import {ASSESSMENT_LIFECYCLE_VERSION as version} from '../../corretor/v2/assessments/lifecycle.mjs';
test('gateway preserves legacy routes; stamps only server-controlled capability; CORS, Auth, rate limits and errors stay closed',async t=>{
 const h=await harness({lifecycle:true});t.after(h.close);let calls=0,legacy=0;const headers=[];
 const gateway=createStatsGateway({fetch:()=>{legacy++;return new Response('legacy preserved')}});
 const env={PRIVATE_GATEWAY_ENABLED:'true',PRIVATE_LIFECYCLE_ENABLED:'true',AUTH:h.env.AUTH,
 PRIVATE_ASSESSMENTS:{fetch:request=>{calls++;headers.push(request.headers.get('X-Salta-Assessment-Lifecycle'));return import('../worker.mjs').then(m=>m.default.fetch(request,h.env))}},
 ...Object.fromEntries(LIMITERS.map(k=>[k,{limit:async()=>({success:true})}]))};
 const call=(path,method='GET',data,overrides={})=>gateway.fetch(new Request('https://stats'+path,{method,headers:{Origin:PORTAL_ORIGIN,Cookie:h.tokens.a,'CF-Connecting-IP':'192.0.2.1',...(data?{'Content-Type':'application/json'}:{}),...overrides},...(data?{body:JSON.stringify(data)}:{})}),env);
 assert.equal(await (await call('/existing-stats')).text(),'legacy preserved');assert.equal(legacy,1);
 let res=await call('/assessments/v1/session','GET',undefined,{'X-Salta-Assessment-Lifecycle':'client-forgery'});
 assert.equal(res.status,200);assert.equal((await res.json()).assessmentLifecycleVersion,version);assert.equal(headers.at(-1),version);
 const id=crypto.randomUUID(),p={...packet(),lifecycleVersion:version};assert.equal((await call('/assessments/v1/assessments/'+id,'PUT',p)).status,201);
 assert.equal((await call('/assessments/v1/assessments/'+id+'/delete','POST',{requestId:crypto.randomUUID(),expectedRevision:1,lifecycleVersion:version})).status,201);
 assert.equal((await call('/assessments/v1/assessments/'+id+'/status')).status,200);
 const prior=calls;
 assert.equal((await call('/assessments/v1/session','GET',undefined,{Origin:'https://evil.example'})).status,403);
 assert.equal((await call('/assessments/v1/session','GET',undefined,{Cookie:''})).status,401);
 assert.equal((await call('/assessments/v1/session','OPTIONS',undefined,{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'X-Salta-Assessment-Lifecycle'})).status,403);
 env.PRIVATE_WRITE_LIMITER={limit:async()=>({success:false})};assert.equal((await call('/assessments/v1/assessments/'+id+'/delete','POST',{})).status,429);assert.equal(calls,prior);
 env.PRIVATE_LIFECYCLE_ENABLED='false';assert.equal((await call('/assessments/v1/session')).status,503);assert.equal(headers.at(-1),null);
});
