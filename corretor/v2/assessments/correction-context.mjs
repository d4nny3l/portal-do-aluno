// CORRECTION-LOCAL-01: authorized immutable selection in RAM only.
// No network call is reachable from binding(); remote checks have independent
// focus/visibility/online/timer triggers. Server authorization is not extended.
const scopeKeys=['institutionId','classId','periodId'];
const sameScope=(a,b)=>Boolean(a&&b&&scopeKeys.every(k=>a[k]===b[k]));
const temporary=e=>e?.status===429||e?.status>=500&&e?.status<=599||
 (e?.status===0&&['network','aborted','invalid_response'].includes(e?.code));
const frozen=value=>Object.freeze(value);
export function createCorrectionContext({client,view,revoke,invalidate,report=()=>{},online=()=>true,now=()=>Date.now(),interval=30000,timeout=10000}){
 let selected=null,metadata=null,checkedAt=-Infinity,flight=null;
 const clear=()=>{selected=null;metadata=null;checkedAt=-Infinity;flight?.abort.abort();flight=null;};
 const context=()=>{const s=view();return {generation:s.generation,principalId:s.session?.principalId,epoch:s.session?.epoch,scope:s.scope,record:s.record,selection:s.selection}};
 const same=(a,b)=>a.generation===b.generation&&a.principalId===b.principalId&&a.epoch===b.epoch&&sameScope(a.scope,b.scope)&&a.record===b.record&&a.selection===b.selection;
 function bind(selection){
  clear();const s=context();
  if(!s.principalId||s.selection!==selection||!s.record||s.record.status!=='issued'||s.record.archived||
   s.record.id!==selection.assessmentId||s.record.revision!==selection.revision||s.record.manifestHash!==selection.manifestHash||
   !sameScope(s.scope,selection.scope))throw Error('Seleção privada sem vínculo autorizado.');
  // pinnedSelection already deeply freezes manifest, plan, template and scope.
  selected=selection;
  metadata=frozen({generation:s.generation,principalId:s.principalId,epoch:s.epoch,
   scope:frozen({...s.scope}),assessmentId:selection.assessmentId,revision:selection.revision,
   manifestHash:selection.manifestHash,selectionId:selection.selectionId});
  checkedAt=now();
  return metadata;
 }
 function binding(selection){
  const s=context();
  if(!metadata||selected!==selection||s.selection!==selection||s.generation!==metadata.generation||
   s.principalId!==metadata.principalId||s.epoch!==metadata.epoch||!sameScope(s.scope,metadata.scope)||
   s.record?.id!==metadata.assessmentId||s.record?.revision!==metadata.revision||s.record?.manifestHash!==metadata.manifestHash||
   s.record?.status!=='issued'||s.record?.archived)return null;
  return metadata;
 }
 // The published API has no expiration timestamp/lease and no metadata-only
 // endpoint covering archived/hash/selection validity. A context check uses
 // the existing authorized GET, discards its payload and never installs a key.
 // Temporary unavailability is not a confirmed revocation and does not permit
 // any new selection, export or write. Confirmed auth loss clears all state.
 async function verify({force=false,remoteOperation=false}={}){
  const start=context();
  if(!start.record||!start.principalId||!start.scope)return false;
  if(!online())return false;
  if(flight&&same(flight.start,start))return flight.promise;
  if(!force&&now()-checkedAt<interval)return false;
  if(flight)flight.abort.abort();
  const abort=new AbortController(),pending={start,abort,promise:null};flight=pending;checkedAt=now();
  const timer=setTimeout(()=>abort.abort(),timeout);
  const current=()=>same(start,context())&&flight===pending;
  pending.promise=(async()=>{
   try{
    const {data:session}=await client.request('GET','/session',undefined,{signal:abort.signal});
    if(!current())return false;
    if(session?.authenticated!==true||session.principalId!==start.principalId||session.epoch!==start.epoch){
     revoke();return false;
    }
    const {data}=await client.request('GET','/assessments/'+start.record.id,undefined,{signal:abort.signal});
    if(!current())return false;
    const latest=data?.record;
    if(!latest||latest.id!==start.record.id||latest.revision!==start.record.revision||
     latest.manifestHash!==start.record.manifestHash||latest.status!==start.record.status||
     Boolean(latest.archived)!==Boolean(start.record.archived)||!sameScope(latest,start.scope)){
     invalidate();report(Error('A avaliação foi substituída, excluída ou arquivada. Reabra a avaliação.'));return false;
    }
    // Exact same immutable record, not a replacement key. Check entire
    // definition as a defense against a same-revision incompatible response.
    if(JSON.stringify(latest.definition)!==JSON.stringify(start.record.definition)){
     invalidate();report(Error('A definição da avaliação mudou. Reabra a avaliação.'));return false;
    }
    return true;
   }catch(error){
    if(!current())return false;
    if(error?.status===401||error?.status===403){revoke();report(error);return false;}
    if(temporary(error)){if(remoteOperation)report(error);return false;}
    // 404/409/410, malformed or other non-transient contract failures.
    invalidate();report(error);return false;
   }finally{clearTimeout(timer);if(flight===pending)flight=null;}
  })();
  return pending.promise;
 }
 return frozen({bind,clear,binding,verify});
}
