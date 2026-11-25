// Offline verification of a complete journal cut, bound to a separately fetched
// authenticated live Operator checkpoint. An old export/hash alone is insufficient.
import {CUSTODY_PROTOCOL,digest,checkedFence,exact} from './ledger.mjs';
const fail=()=>{throw Error('Custody witness incomplete, stale or ambiguous; keep library closed')};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function verifyCustodyExport(bundle,{databaseId,onlineAnchor}={}){
 try{
  exact(bundle,['checkpoint','events']);const c=bundle.checkpoint;
  exact(c,['protocol','databaseId','controller','custodian','sequence','headHash','cutAt','fenceCount','pending']);
  if(!onlineAnchor||c.protocol!==CUSTODY_PROTOCOL||c.databaseId!==databaseId||c.pending!==0||!Number.isSafeInteger(c.sequence)||c.sequence<1||!Number.isFinite(Date.parse(c.cutAt))||!Array.isArray(bundle.events)||bundle.events.length!==c.sequence||!eq(c,onlineAnchor))fail();
  let previous='0'.repeat(64),mode='closed',pending=null;const ops=new Map(),fences=new Map();
  for(let index=0;index<bundle.events.length;index++){
   const {event:e,hash}=bundle.events[index];exact(bundle.events[index],['event','hash']);exact(e,['protocol','controller','databaseId','seq','previous','type','at','data']);
   if(e.protocol!==CUSTODY_PROTOCOL||e.controller!==c.controller||e.databaseId!==databaseId||e.seq!==index+1||e.previous!==previous||await digest(e)!==hash||!Number.isFinite(Date.parse(e.at))||Date.parse(e.at)>Date.parse(c.cutAt))fail();
   previous=hash;
   if(index===0){if(e.type!=='baseline')fail();exact(e.data,['fences','custodian']);if(e.data.custodian!==c.custodian||!Array.isArray(e.data.fences))fail();for(const x of e.data.fences){const f=checkedFence(x);if(fences.has(f.assessment_id))fail();fences.set(f.assessment_id,f)}continue;}
   if(e.type==='open'||e.type==='close'){exact(e.data,[]);if(e.type==='open'&&pending)fail();mode=e.type;continue;}
   if(e.type==='intent'){
    const op=e.data;exact(op,['id','intent','state','attempt','token','deadline']);const i=op.intent;exact(i,['requestId','ownerId','assessmentId','institutionId','classId','periodId','expectedRevision','revision','deleted','kind','bodyMac','keyVersion']);
    if(mode!=='open'||pending||op.state!=='pending'||op.id!==await digest({ownerId:i.ownerId,requestId:i.requestId})||!Number.isSafeInteger(op.deadline)||!Number.isInteger(op.attempt)||op.attempt<1||!['save','duplicate','delete'].includes(i.kind)||!/^[a-f0-9]{64}$/.test(i.bodyMac)||i.revision!==(i.kind==='delete'?i.expectedRevision:i.expectedRevision+1)||i.deleted!==Number(i.kind==='delete'))fail();
    const old=ops.get(op.id);if(old&&(old.state!=='aborted'||old.attempt+1!==op.attempt||!eq(old.intent,i)))fail();ops.set(op.id,structuredClone(op));pending=op.id;continue;
   }
   if(e.type==='abort'){
    exact(e.data,['id','token','proof']);const op=ops.get(e.data.id);if(pending!==op?.id||e.data.token!==op.token||e.data.proof!=='SQLITE_CONSTRAINT')fail();op.state='aborted';pending=null;continue;
   }
   if(e.type==='commit'){
    exact(e.data,['id','token','fence','receipt']);const op=ops.get(e.data.id);if(pending!==op?.id||e.data.token!==op.token)fail();const i=op.intent,f=checkedFence(e.data.fence),r=e.data.receipt;
    exact(r,['id','revision','deleted']);if(f.assessment_id!==i.assessmentId||f.owner_id!==i.ownerId||f.institution_id!==i.institutionId||f.class_id!==i.classId||f.period_id!==i.periodId||f.revision_floor!==i.revision||f.deleted!==i.deleted||r.id!==i.assessmentId||r.revision!==i.revision||r.deleted!==Boolean(i.deleted))fail();
    const prior=fences.get(f.assessment_id);if(prior?(prior.deleted||prior.revision_floor!==i.expectedRevision||['owner_id','institution_id','class_id','period_id'].some(k=>prior[k]!==f[k])):i.expectedRevision!==0)fail();
    fences.set(f.assessment_id,f);op.state='committed';pending=null;continue;
   }
   fail();
  }
  if(mode!=='close'&&mode!=='closed'||pending||previous!==c.headHash||fences.size!==c.fenceCount)fail();
  return {schemaVersion:'salta-lifecycle-fences-v1',capturedAt:c.cutAt,fences:[...fences.values()].sort((a,b)=>a.assessment_id.localeCompare(b.assessment_id))};
 }catch{fail()}
}
export async function collectCustodyExport(operator){
 const first=(await operator({action:'checkpoint'})).checkpoint,events=[];let after=0;
 for(let page=0;page<2000;page++){
  const result=await operator({action:'events',after,limit:100});if(!eq(result.checkpoint,first))fail();events.push(...result.events);
  if(result.next===null)break;if(result.next<=after||page===1999)fail();after=result.next;
 }
 const last=(await operator({action:'checkpoint'})).checkpoint;if(!eq(first,last))fail();
 const bundle={checkpoint:first,events};await verifyCustodyExport(bundle,{databaseId:first.databaseId,onlineAnchor:last});return bundle;
}
