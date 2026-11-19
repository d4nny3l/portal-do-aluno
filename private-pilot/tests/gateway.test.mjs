import test from 'node:test';
import assert from 'node:assert/strict';
import {createStatsGateway,PORTAL_ORIGIN,LIMITERS} from '../gateway.mjs';
import {productionSource,STATS_SHA256,sha256} from '../baseline.mjs';
const id='a1111111-1111-4111-8111-111111111111';
function harness(){
 const calls={legacy:[],auth:[],backend:[],limits:[]};
 const legacyResponse=Response.json({legacy:true},{headers:{'X-Legacy':'unchanged'}});
 const legacy={fetch:async(...args)=>{calls.legacy.push(args);return legacyResponse}};
 const env={PRIVATE_GATEWAY_ENABLED:'true',AUTH:{fetch:async request=>{calls.auth.push(request);return Response.json({ok:true,authenticated:true,user:'synthetic-teacher'})}},PRIVATE_ASSESSMENTS:{fetch:async request=>{calls.backend.push(request);return Response.json({ok:true})}}};
 for(const name of LIMITERS)env[name]={limit:async input=>{calls.limits.push({name,...input});return {success:true}}};
 const worker=createStatsGateway(legacy);
 const request=(path='/session',{method='GET',body,headers={},scheme='https:'}={})=>new Request(scheme+'//stats.example'+('/assessments/v1'+path),{method,headers:{Origin:PORTAL_ORIGIN,Cookie:'__Host-salta_session=synthetic-session','CF-Connecting-IP':'192.0.2.1',...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body})});
 return {calls,env,worker,legacyResponse,request};
}
test('all requests outside exact namespace keep Request/env/context/Response identity, including OPTIONS',async()=>{
 const h=harness(),ctx={waitUntil(){}};
 for(const path of ['/auth/session','/diario/frequencia','/festival/meta','/comms/teacher/announcements','/public/student-lookup','/other','/assessments/v10/session','/assessments/v1x/session','/ASSESSMENTS/v1/session'])for(const method of ['GET','OPTIONS','POST']){
  const r=new Request('https://stats.example'+path,{method,...(method==='POST'?{body:'unaltered body'}:{})});
  assert.equal(await h.worker.fetch(r,h.env,ctx),h.legacyResponse);
  const args=h.calls.legacy.at(-1);assert.equal(args[0],r);assert.equal(args[1],h.env);assert.equal(args[2],ctx);
  if(method==='POST')assert.equal(await r.text(),'unaltered body');
 }
 assert.equal(h.calls.auth.length,0);assert.equal(h.calls.backend.length,0);assert.equal(h.calls.limits.length,0);
});
test('disabled or missing infrastructure never falls through to Stats or a public fallback',async()=>{
 for(const missing of ['flag','AUTH','PRIVATE_ASSESSMENTS',...LIMITERS]){
  const h=harness();if(missing==='flag')delete h.env.PRIVATE_GATEWAY_ENABLED;else delete h.env[missing];
  assert.equal((await h.worker.fetch(h.request(),h.env)).status,503);assert.equal(h.calls.legacy.length,0);assert.equal(h.calls.backend.length,0);
 }
 const h=harness();for(const Origin of ['https://evil.example','null',''])assert.equal((await h.worker.fetch(h.request('/session',{headers:{Origin}}),h.env)).status,403);
 assert.equal((await h.worker.fetch(h.request('/session',{scheme:'http:'}),h.env)).status,403);
 assert.equal(h.calls.auth.length,0);
});
test('route/method/query allowlist and preflight precede the global legacy OPTIONS handler',async()=>{
 const h=harness();
 const preflight=h.request('/assessments/'+id,{method:'OPTIONS',headers:{'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'Content-Type, Accept',Cookie:''}});
 const r=await h.worker.fetch(preflight,h.env);assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),PORTAL_ORIGIN);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),'true');assert.match(r.headers.get('Vary'),/Access-Control-Request-Method/);
 assert.equal(h.calls.auth.length,0);assert.equal(h.calls.backend.length,0);assert.equal(h.calls.legacy.length,0);
 assert.equal((await h.worker.fetch(h.request('/session',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'PUT'}}),h.env)).status,403);
 assert.equal((await h.worker.fetch(h.request('/session',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'}}),h.env)).status,403);
 for(const path of ['/wrong','/Session','/assessments/not-a-uuid','/assessments/'+id+'/archive/1','/%2fsecret'])assert.equal((await h.worker.fetch(h.request(path),h.env)).status,404);
 for(const method of ['DELETE','PATCH','HEAD'])assert.equal((await h.worker.fetch(h.request('/session',{method}),h.env)).status,405);
 assert.equal((await h.worker.fetch(h.request('/session?after='+id),h.env)).status,400);
 assert.equal((await h.worker.fetch(h.request('/assessments?after='+id+'&after='+id),h.env)).status,400);
 assert.equal((await h.worker.fetch(h.request('/assessments?after='+id),h.env)).status,200);
});
test('only real verified session cookies and fixed internal target cross the service boundary',async()=>{
 const h=harness();
 h.env.PRIVATE_ASSESSMENTS.fetch=async request=>{h.calls.backend.push(request);return Response.json({private:true},{headers:{'Set-Cookie':'attacker=1','Access-Control-Allow-Origin':'*','Cache-Control':'public,max-age=3600'}})};
 const req=h.request('/assessments/'+id,{method:'PUT',body:'{"requestId":"synthetic"}',headers:{Cookie:'tracking=do-not-forward; __Host-salta_session=synthetic-session; salta_session=legacy-session',Authorization:'Bearer forged','X-Teacher-Id':'other-teacher'}});
 const r=await h.worker.fetch(req,h.env);assert.equal(r.status,200);
 const upstream=h.calls.backend[0];assert.equal(upstream.url,'https://private-assessments/assessments/v1/assessments/'+id);assert.equal(await upstream.text(),'{"requestId":"synthetic"}');
 assert.equal(upstream.headers.get('Cookie'),'__Host-salta_session=synthetic-session; salta_session=legacy-session');assert.equal(upstream.headers.get('Authorization'),null);assert.equal(upstream.headers.get('X-Teacher-Id'),null);
 assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Access-Control-Allow-Origin'),PORTAL_ORIGIN);
 assert.ok(h.calls.limits.some(c=>c.name==='PRIVATE_WRITE_LIMITER'));
});
test('audited catalog scope and cursor cross the gateway intact; partial, duplicate and arbitrary filters fail closed',async()=>{
 const h=harness(),scope='institutionId=synthetic-school&classId=synthetic-class&periodId=2026';
 for(const query of [scope,'after='+id+'&'+scope,scope+'&after='+id]){
  const r=await h.worker.fetch(h.request('/assessments?'+query),h.env);
  assert.equal(r.status,200);
  assert.equal(new URL(h.calls.backend.at(-1).url).search,'?'+query);
 }
 const forwarded=h.calls.backend.length;
 for(const query of ['institutionId=school','classId=class&periodId=2026',scope+'&classId=duplicate',scope+'&after='+id+'&after='+id,scope+'&after=',scope+'&limit=100','institutionId=school&classId=%2Fother&periodId=2026','institutionId=school&classId=class&periodId=',scope+'&ownerId=another-teacher'])
  assert.equal((await h.worker.fetch(h.request('/assessments?'+query),h.env)).status,400,query);
 assert.equal((await h.worker.fetch(h.request('/session?'+scope),h.env)).status,400);
 assert.equal(h.calls.backend.length,forwarded,'Rejected queries never reach the private backend');
});
test('session expiry, forged identity, Auth outage and limiter failure are explicit and closed',async()=>{
 const h=harness();
 assert.equal((await h.worker.fetch(h.request('/session',{headers:{Cookie:'',Authorization:'Bearer forged'}}),h.env)).status,401);
 assert.equal((await h.worker.fetch(h.request('/session',{headers:{Cookie:'__Host-salta_session=a; __Host-salta_session=b'}}),h.env)).status,400);
 h.env.AUTH.fetch=async()=>Response.json({authenticated:false},{status:401});assert.equal((await h.worker.fetch(h.request(),h.env)).status,401);
 h.env.AUTH.fetch=async()=>{throw Error('do not expose')};assert.equal((await h.worker.fetch(h.request(),h.env)).status,503);
 h.env.AUTH.fetch=async()=>Response.json({ok:true,authenticated:true,user:'synthetic-teacher'});
 h.env.PRIVATE_ACCOUNT_LIMITER.limit=async()=>({success:false});const limited=await h.worker.fetch(h.request(),h.env);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
 h.env.PRIVATE_ACCOUNT_LIMITER.limit=async()=>{throw Error('internal')};assert.equal((await h.worker.fetch(h.request(),h.env)).status,503);assert.equal(h.calls.backend.length,0);
});
test('JSON and streaming byte limit reject oversized bodies before private persistence',async()=>{
 const h=harness();const route='/assessments/'+id;
 assert.equal((await h.worker.fetch(h.request(route,{method:'PUT',body:'x',headers:{'Content-Type':'text/plain'}}),h.env)).status,415);
 assert.equal((await h.worker.fetch(h.request(route,{method:'PUT',body:'x',headers:{'Content-Length':'1000001'}}),h.env)).status,413);
 assert.equal((await h.worker.fetch(h.request(route,{method:'PUT',body:new Uint8Array(1_000_001)}),h.env)).status,413);
 assert.equal((await h.worker.fetch(h.request(route,{method:'PUT'}),h.env)).status,415);
 assert.equal(h.calls.backend.length,0);
});
test('upstream redirect/HTML/transport failure cannot escape fixed binding or cache policy',async()=>{
 const h=harness();
 for(const response of [new Response(null,{status:302,headers:{Location:'https://evil.example'}}),new Response('<html>not JSON</html>',{headers:{'Content-Type':'text/html'}})]){
  h.env.PRIVATE_ASSESSMENTS.fetch=async()=>response;const r=await h.worker.fetch(h.request(),h.env);assert.equal(r.status,503);assert.equal(r.headers.get('Location'),null);assert.equal(r.headers.get('Cache-Control'),'no-store');
 }
 h.env.PRIVATE_ASSESSMENTS.fetch=async()=>{throw Error('raw database failure')};const r=await h.worker.fetch(h.request(),h.env);assert.equal(r.status,503);assert.ok(!(await r.text()).includes('database failure'));
});
test('real pinned Stats preserves representative auth/public/diary responses, without DB access',async()=>{
 const source=productionSource();assert.equal(sha256(source),STATS_SHA256);
 const legacy=(await import('data:text/javascript;base64,'+source.toString('base64'))).default;
 const wrapped=createStatsGateway(legacy);
 const env={PRIVATE_GATEWAY_ENABLED:'true',AUTH:{fetch:async()=>Response.json({authenticated:false},{status:401})}};
 for(const [path,method,body]of [['/diario/frequencia','GET'],['/diario/frequencia','OPTIONS'],['/auth/session','GET'],['/auth/login','POST','{}'],['/public/student-lookup','POST','{}'],['/unknown','GET']]){
  const init={method,headers:{Origin:PORTAL_ORIGIN},...(body?{body}:{})};
  const a=await legacy.fetch(new Request('https://stats.example'+path,init),env),b=await wrapped.fetch(new Request('https://stats.example'+path,init),env);
  assert.equal(b.status,a.status,path);assert.deepEqual([...b.headers],[...a.headers],path);assert.equal(await b.text(),await a.text(),path);
 }
});
