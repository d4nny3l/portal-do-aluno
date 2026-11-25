// Only the new namespace is intercepted. No shared legacy handler is changed.
import {ASSESSMENT_LIFECYCLE_VERSION,LIFECYCLE_HEADER} from '../corretor/v2/assessments/lifecycle.mjs';
const PREFIX='/assessments/v1';
export const PORTAL_ORIGIN='https://d4nny3l.github.io';
export const LIMITERS=['PRIVATE_IP_LIMITER','PRIVATE_ACCOUNT_LIMITER','PRIVATE_WRITE_LIMITER','PRIVATE_PRINT_LIMITER'];
const UUID='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const revision='[1-9][0-9]{0,14}';
const routes=[
 [/^\/(session|grants|assessments)$/,['GET']],
 [new RegExp('^/assessments/'+UUID+'$'),['GET','PUT']],
 [new RegExp('^/assessments/'+UUID+'/(archive|duplicate|delete)$'),['POST']],
 [new RegExp('^/assessments/'+UUID+'/status$'),['GET']],
 [new RegExp('^/assessments/'+UUID+'/revisions(?:/'+revision+'(?:/print)?)?$'),['GET']],
 [/^\/selections$/,['POST']],
 [new RegExp('^/selections/'+UUID+'$'),['GET']]
];
class GatewayError extends Error {constructor(status,code){super(code);this.status=status;this.code=code}}
const fail=(status,code)=>{throw new GatewayError(status,code)};
function headers(request){
 const h=new Headers({'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 if(request.headers.get('Origin')===PORTAL_ORIGIN){h.set('Access-Control-Allow-Origin',PORTAL_ORIGIN);h.set('Access-Control-Allow-Credentials','true');h.set('Access-Control-Expose-Headers','Retry-After');}
 return h;
}
function errorResponse(request,error){
 const status=error instanceof GatewayError?error.status:503, h=headers(request);
 h.set('Content-Type','application/json; charset=utf-8');
 if(status===429)h.set('Retry-After','60');
 return new Response(JSON.stringify({error:status===401?'Entre novamente pela SALTA.':status===429?'Aguarde um minuto antes de tentar novamente.':'Biblioteca privada indisponível para esta operação.',code:error instanceof GatewayError?error.code:'gateway_unavailable'}),{status,headers:h});
}
function allowed(url){
 const path=url.pathname.slice(PREFIX.length), match=routes.find(([re])=>re.test(path));
 if(!match)fail(404,'private_route_not_found');
 if(url.search){
  const entries=[...url.searchParams];
  const scope=['institutionId','classId','periodId'], names=['after',...scope];
  if(path!=='/assessments'||entries.some(([key])=>!names.includes(key))||names.some(key=>url.searchParams.getAll(key).length>1))fail(400,'invalid_query');
  if(url.searchParams.has('after')&&!new RegExp('^'+UUID+'$','i').test(url.searchParams.get('after')))fail(400,'invalid_query');
  const scoped=scope.filter(key=>url.searchParams.has(key));
  if(scoped.length&&scoped.length!==scope.length||scoped.some(key=>!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(url.searchParams.get(key))))fail(400,'invalid_query');
 }
 return match[1];
}
function cookies(request){
 const raw=request.headers.get('Cookie')||'';
 if(raw.length>8192||/[\u0000-\u001f\u007f]/.test(raw))fail(400,'invalid_cookie');
 const chosen=new Map();
 for(const item of raw.split(';')){
  const pair=item.trim(), i=pair.indexOf('=');if(i<0)continue;
  const name=pair.slice(0,i);
  if(!['__Host-salta_session','salta_session'].includes(name))continue;
  if(chosen.has(name)||!pair.slice(i+1))fail(400,'ambiguous_cookie');
  chosen.set(name,pair);
 }
 if(!chosen.size)fail(401,'session_required');
 return [...chosen.values()].join('; ');
}
async function limit(binding,key){
 let result;try{result=await binding.limit({key})}catch{fail(503,'limiter_unavailable')}
 if(result?.success===false)fail(429,'rate_limited');
 if(result?.success!==true)fail(503,'limiter_unavailable');
}
async function account(env,cookie){
 let response;try{response=await env.AUTH.fetch(new Request('https://salta-auth/session',{headers:{Cookie:cookie},redirect:'manual',signal:AbortSignal.timeout(4000)}))}catch{fail(503,'auth_unavailable')}
 if(response.status===401)fail(401,'session_expired');
 if(!response.ok)fail(503,'auth_unavailable');
 const identity=await response.json().catch(()=>null);
 if(identity?.ok!==true||identity.authenticated!==true||typeof identity.user!=='string'||!identity.user||identity.user.length>120)fail(401,'invalid_session');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity.user));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
async function boundedBody(request){
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'json_required');
 const declared=request.headers.get('Content-Length');
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>1_000_000))fail(413,'body_too_large');
 const reader=request.body?.getReader();if(!reader)fail(400,'body_required');
 const chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1_000_000){await reader.cancel();fail(413,'body_too_large')}chunks.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.byteLength}
 return bytes;
}
async function privateRequest(request,env,url){
 if(env.PRIVATE_GATEWAY_ENABLED!=='true')fail(503,'private_gateway_disabled');
 if(url.protocol!=='https:'||request.headers.get('Origin')!==PORTAL_ORIGIN)fail(403,'origin_denied');
 const methods=allowed(url);
 if(!env.PRIVATE_ASSESSMENTS?.fetch||!env.AUTH?.fetch||LIMITERS.some(name=>typeof env[name]?.limit!=='function'))fail(503,'private_binding_missing');
 if(request.method==='OPTIONS'){
  const method=request.headers.get('Access-Control-Request-Method');
  const names=(request.headers.get('Access-Control-Request-Headers')||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(!methods.includes(method)||names.some(v=>!['accept','content-type'].includes(v)))fail(403,'preflight_denied');
  const h=headers(request);h.set('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');h.set('Access-Control-Allow-Methods',methods.join(', '));h.set('Access-Control-Allow-Headers','Accept, Content-Type');h.set('Access-Control-Max-Age','300');
  return new Response(null,{status:204,headers:h});
 }
 if(!methods.includes(request.method))fail(405,'method_denied');
 const ip=request.headers.get('CF-Connecting-IP');if(!ip||ip.length>64)fail(503,'trusted_ip_unavailable');
 await limit(env.PRIVATE_IP_LIMITER,'private:ip:'+ip);
 const cookie=cookies(request), subject=await account(env,cookie);
 await limit(env.PRIVATE_ACCOUNT_LIMITER,'private:account:'+subject);
 const mutation=['POST','PUT'].includes(request.method);
 if(mutation)await limit(env.PRIVATE_WRITE_LIMITER,'private:write:'+subject);
 if(url.pathname.endsWith('/print'))await limit(env.PRIVATE_PRINT_LIMITER,'private:print:'+subject);
 const h=new Headers({Origin:PORTAL_ORIGIN,Cookie:cookie,Accept:'application/json'});
 if(env.PRIVATE_LIFECYCLE_ENABLED==='true')h.set(LIFECYCLE_HEADER,ASSESSMENT_LIFECYCLE_VERSION);
 let body;if(mutation){body=await boundedBody(request);h.set('Content-Type','application/json')}
 const upstream=new Request('https://private-assessments'+url.pathname+url.search,{method:request.method,headers:h,...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(10000)});
 let response;try{response=await env.PRIVATE_ASSESSMENTS.fetch(upstream)}catch{fail(503,'private_backend_unavailable')}
 if(response.status>=300&&response.status<400||response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail(503,'invalid_backend_response');
 // Allowlist response headers: private API can neither issue cookies nor relax CORS.
 const safe=headers(request);safe.set('Content-Type','application/json; charset=utf-8');
 if(response.status===429)safe.set('Retry-After','60');
 return new Response(response.body,{status:response.status,headers:safe});
}
export function createStatsGateway(legacy){
 if(typeof legacy?.fetch!=='function')throw new TypeError('Pinned Stats fetch is required');
 return {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname!==PREFIX&&!url.pathname.startsWith(PREFIX+'/'))return legacy.fetch(request,env,ctx);
  try{return await privateRequest(request,env,url)}catch(error){return errorResponse(request,error)}
 }};
}
