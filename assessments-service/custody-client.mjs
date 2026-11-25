import {operationMac} from './crypto.mjs';
export const CUSTODY_PROTOCOL='salta-assessment-custody-v1';
const error=(code,status=503)=>Object.assign(new Error('Confirmação de custódia indisponível. Reenvie a mesma operação.'),{custodyCode:code,custodyStatus:status});
export async function custodyCall(ring,payload){
 if(!ring.custody?.fetch)throw error('custody_binding_required');
 let r;try{r=await ring.custody.fetch(new Request('https://custody/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(3500)}))}catch{throw error('custody_unavailable')}
 const body=await r.json().catch(()=>null);if(!r.ok||body?.ok!==true)throw error(body?.code||'custody_unavailable',r.status===409?409:503);return body;
}
export async function witnessId(ownerId,requestId){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({ownerId,requestId})));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
// MUST use the same canonical request identity as the controller. Keys are sorted.
export async function prepareCustody(ring,actor,p,operation,id,revision,scope){
 if(!ring.lifecycle)return null;
 const mac=await operationMac(ring,ring.active,operation);
 const intent={requestId:p.requestId,ownerId:actor.id,assessmentId:id,institutionId:scope.institutionId,classId:scope.classId,periodId:scope.periodId,expectedRevision:p.expectedRevision,revision,deleted:Number(operation.kind==='delete'),kind:operation.kind,bodyMac:mac,keyVersion:ring.active};
 const begun=await custodyCall(ring,{action:'begin',intent});
 if(!Number.isSafeInteger(begun.deadline)||typeof begun.id!=='string'||typeof begun.token!=='string')throw error('custody_contract');
 ring.witness={...begun,mac};ring.deadline=begun.deadline;
 return begun;
}
export async function confirmCustody(ring,actor,previous,operation){
 if(!ring.lifecycle||!['save','delete','duplicate'].includes(operation.kind))return;
 const mac=await operationMac(ring,previous.key_version,operation);
 const id=await witnessId(actor.id,operation.p.requestId);
 const proof=await custodyCall(ring,{action:'confirm',id,bodyMac:mac});
 if(proof.protocol!==CUSTODY_PROTOCOL)throw error('custody_contract');
}
export async function finishCustody(ring,operation){
 if(!ring.lifecycle||!['save','delete','duplicate'].includes(operation.kind))return;
 const w=ring.witness;if(!w)throw error('custody_intent_missing');
 await custodyCall(ring,{action:'confirm',id:w.id,bodyMac:w.mac});
}
export async function certifyRollback(ring,failure){
 // Only an explicit SQLite constraint response certifies transaction rollback.
 // Timeouts/transport failures remain PENDING; receipt absence is not proof.
 if(!ring.lifecycle||!ring.witness)return;
 if(!/SQLITE_CONSTRAINT|unique constraint failed|not null constraint failed|selection must be current|replacement contract required|deleted assessment/i.test(String(failure?.message)))return;
 await custodyCall(ring,{action:'rolled-back',id:ring.witness.id,bodyMac:ring.witness.mac,token:ring.witness.token,proof:'SQLITE_CONSTRAINT'});
}
