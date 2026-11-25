import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import {Ledger,CustodyFailure} from './ledger.mjs';
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export class CustodyLedger extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ledger=new Ledger(ctx.storage,env.PRIMARY_ASSESSMENTS_DB,{databaseId:env.CUSTODY_DATABASE_ID,custodian:env.CUSTODY_CUSTODIAN});}
 async fetch(request){return this.ctx.blockConcurrencyWhile(async()=>{try{const p=await request.json();if(!p||!['writer','operator'].includes(p.lane))return response({code:'forbidden'},403);return response(await this.ledger.handle(p.lane,p.payload));}catch(e){return response({ok:false,code:e instanceof CustodyFailure?e.code:'custody_unavailable'},e instanceof CustodyFailure?e.status:503)}})}
}
async function forward(env,lane,request){try{if(request.method!=='POST'||Number(request.headers.get('Content-Length')||0)>16384)return response({code:'custody_method'},405);const text=await request.text();if(text.length>16384)return response({code:'custody_size'},413);const payload=JSON.parse(text);return env.JOURNAL.get(env.JOURNAL.idFromName('salta-assessment-custody-v1')).fetch(new Request('https://journal/',{method:'POST',body:JSON.stringify({lane,payload})}));}catch{return response({code:'custody_unavailable'},503)}}
export class CustodyWriter extends WorkerEntrypoint{fetch(request){return forward(this.env,'writer',request)}}
export class CustodyOperator extends WorkerEntrypoint{fetch(request){return forward(this.env,'operator',request)}}
// No public or default service API. Only explicitly bound named capabilities.
export default {fetch:()=>response({code:'private_service'},503)};
