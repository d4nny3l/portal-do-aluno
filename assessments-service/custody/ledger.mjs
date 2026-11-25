// Private independent journal. No definitions, answers, student data or keys.
// One controller serializes fence mutations; immutable events + mutable indexes.
export const CUSTODY_PROTOCOL='salta-assessment-custody-v1';
export const LEASE_MS=8000;
const identityKeys=['owner_id','institution_id','class_id','period_id'];
const canonical=x=>JSON.stringify(Array.isArray(x)?x.map(x=>JSON.parse(canonical(x))):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
export async function digest(x){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(x)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export class CustodyFailure extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status}}
const fail=(code,status)=>{throw new CustodyFailure(code,status)};
export const exact=(p,keys)=>{if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join()!==[...keys].sort().join())fail('custody_contract',400)};
const opaque=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{1,100}$/.test(s);
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const fenceKeys=['assessment_id',...identityKeys,'revision_floor','deleted','updated_at'];
export function checkedFence(f){exact(f,fenceKeys);if(!uuid(f.assessment_id)||identityKeys.some(k=>!opaque(f[k]))||!integer(f.revision_floor)||f.revision_floor<1||![0,1].includes(f.deleted)||!Number.isFinite(Date.parse(f.updated_at)))fail('custody_fence_invalid');return Object.fromEntries(fenceKeys.map(k=>[k,f[k]]))}
export class Ledger{
 constructor(storage,db,{databaseId,custodian,now=()=>Date.now()}={}){
  this.storage=storage;this.db=db;this.databaseId=databaseId;this.custodian=custodian;this.now=now;
  for(const sql of [
   'CREATE TABLE IF NOT EXISTS cj_meta (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL)',
   'CREATE TABLE IF NOT EXISTS cj_events (seq INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, json TEXT NOT NULL)',
   "CREATE TRIGGER IF NOT EXISTS cj_immutable_update BEFORE UPDATE ON cj_events BEGIN SELECT RAISE(ABORT,'immutable custody event'); END",
   "CREATE TRIGGER IF NOT EXISTS cj_immutable_delete BEFORE DELETE ON cj_events BEGIN SELECT RAISE(ABORT,'immutable custody event'); END",
   'CREATE TABLE IF NOT EXISTS cj_ops (id TEXT PRIMARY KEY, json TEXT NOT NULL)',
   'CREATE TABLE IF NOT EXISTS cj_fences (id TEXT PRIMARY KEY, json TEXT NOT NULL)'
  ])this.rows(sql);
 }
 rows(sql,...args){return this.storage.sql.exec(sql,...args).toArray()}
 meta(){const r=this.rows('SELECT json FROM cj_meta WHERE id=1')[0];return r?JSON.parse(r.json):null}
 putMeta(m){this.rows('INSERT INTO cj_meta VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',JSON.stringify(m))}
 op(id){const r=this.rows('SELECT json FROM cj_ops WHERE id=?',id)[0];return r?JSON.parse(r.json):null}
 putOp(op){this.rows('INSERT INTO cj_ops VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',op.id,JSON.stringify(op))}
 fences(){return this.rows('SELECT json FROM cj_fences ORDER BY id').map(r=>JSON.parse(r.json))}
 async append(type,data,mutate=()=>{}){
  const m=this.meta();if(!m)fail('custody_uninitialized');if(m.seq>=100000)fail('custody_capacity');
  const event={protocol:CUSTODY_PROTOCOL,controller:m.controller,databaseId:this.databaseId,seq:m.seq+1,previous:m.head,type,at:new Date(this.now()).toISOString(),data};
  const hash=await digest(event);
  this.storage.transactionSync(()=>{const latest=this.meta();if(latest.seq!==m.seq||latest.head!==m.head)fail('custody_concurrent');this.rows('INSERT INTO cj_events VALUES(?,?,?)',event.seq,hash,JSON.stringify(event));mutate(latest);latest.seq=event.seq;latest.head=hash;latest.checkpoint=null;this.putMeta(latest)});
  return {event,hash};
 }
 async primary(){
  const schema=await this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='av_lifecycle_schema'").first();if(!schema)fail('custody_primary_schema');
  const version=await this.db.prepare("SELECT version FROM av_lifecycle_schema WHERE version='salta-assessment-lifecycle-v1'").first();if(!version)fail('custody_primary_schema');
  const all=[];let after='';
  for(let page=0;page<100;page++){
   const rows=(await this.db.prepare('SELECT assessment_id,owner_id,institution_id,class_id,period_id,revision_floor,deleted,updated_at FROM av_lifecycle_fences WHERE assessment_id>? ORDER BY assessment_id LIMIT 100').bind(after).all()).results;
   all.push(...rows.map(checkedFence));if(rows.length<100)break;after=rows.at(-1).assessment_id;if(page===99)fail('custody_pagination_limit');
  }
  const invalid=await this.db.prepare('SELECT COUNT(*) AS n FROM av_assessments a LEFT JOIN av_lifecycle_fences f ON f.assessment_id=a.id WHERE f.assessment_id IS NULL OR f.deleted=1 OR f.owner_id!=a.owner_id OR f.institution_id!=a.institution_id OR f.class_id!=a.class_id OR f.period_id!=a.period_id OR f.revision_floor!=a.current_revision OR NOT EXISTS(SELECT 1 FROM av_revisions r WHERE r.assessment_id=a.id AND r.revision=a.current_revision)').first();
  const missing=await this.db.prepare('SELECT COUNT(*) AS n FROM av_lifecycle_fences f LEFT JOIN av_assessments a ON a.id=f.assessment_id WHERE (f.deleted=0 AND a.id IS NULL) OR (f.deleted=1 AND a.id IS NOT NULL)').first();
  if(invalid.n||missing.n)fail('custody_primary_inconsistent');return all;
 }
 sameFences(a,b){return canonical(a)===canonical(b)}
 async verifyPrimary(){const rows=await this.primary();if(!this.sameFences(rows,this.fences()))fail('custody_primary_regressed');return rows}
 async handle(lane,p){
  if(!['writer','operator'].includes(lane))fail('custody_lane',403);
  if(lane==='operator')return this.operator(p);
  if(p?.action==='guard'){exact(p,['action']);const m=this.meta();if(!m||m.mode!=='open')fail('custody_closed');if(m.pending)fail('custody_pending');await this.verifyPrimary();return {ok:true,protocol:CUSTODY_PROTOCOL,sequence:m.seq}}
  if(p?.action==='begin')return this.begin(p.intent);
  if(p?.action==='confirm')return this.confirm(p.id,p.bodyMac);
  if(p?.action==='rolled-back')return this.rolledBack(p);
  fail('custody_action',400);
 }
 async begin(intent){
  const fields=['requestId','ownerId','assessmentId','institutionId','classId','periodId','expectedRevision','revision','deleted','kind','bodyMac','keyVersion'];exact(intent,fields);
  if(!uuid(intent.requestId)||!uuid(intent.assessmentId)||!opaque(intent.ownerId)||['institutionId','classId','periodId'].some(k=>!opaque(intent[k]))||!integer(intent.expectedRevision)||!integer(intent.revision)||intent.revision<1||![0,1].includes(intent.deleted)||!['save','duplicate','delete'].includes(intent.kind)||!/^[a-f0-9]{64}$/.test(intent.bodyMac)||!integer(intent.keyVersion)||intent.keyVersion<1||intent.revision!==(intent.kind==='delete'?intent.expectedRevision:intent.expectedRevision+1)||intent.deleted!==Number(intent.kind==='delete'))fail('custody_intent_invalid',400);
  const id=await digest({ownerId:intent.ownerId,requestId:intent.requestId}),m=this.meta();if(!m||m.mode!=='open')fail('custody_closed');
  if(m.seq>=99990)fail('custody_capacity');
  const old=this.op(id);if(old&&canonical(old.intent)!==canonical(intent))fail('custody_idempotency_conflict',409);
  if(old?.state==='committed')return {ok:true,id,newAttempt:false,token:old.token,deadline:old.deadline};
  if(m.pending){if(m.pending!==id)fail('custody_concurrent',409);return {ok:true,id,newAttempt:false,token:old.token,deadline:old.deadline}}
  await this.verifyPrimary();
  const op={id,intent,state:'pending',attempt:(old?.attempt||0)+1,token:crypto.randomUUID(),deadline:this.now()+LEASE_MS};
  await this.append('intent',op,meta=>{this.putOp(op);meta.pending=id});
  return {ok:true,id,newAttempt:true,token:op.token,deadline:op.deadline};
 }
 async receipt(op){
  const i=op.intent,r=await this.db.prepare('SELECT body_mac,key_version,assessment_id,revision,receipt_json FROM av_requests WHERE owner_id=? AND request_id=?').bind(i.ownerId,i.requestId).first();
  if(!r)return null;if(r.body_mac!==i.bodyMac||r.key_version!==i.keyVersion||r.assessment_id!==i.assessmentId||r.revision!==i.revision)fail('custody_receipt_conflict');
  const receipt=JSON.parse(r.receipt_json);if(receipt.ok!==true||receipt.id!==i.assessmentId||receipt.revision!==i.revision||Boolean(receipt.deleted)!==Boolean(i.deleted))fail('custody_receipt_conflict');return receipt;
 }
 async confirm(id,bodyMac){
  const op=this.op(id),m=this.meta();if(!op||op.intent.bodyMac!==bodyMac)fail('custody_intent_missing');
  if(op.state==='aborted')fail('custody_aborted',409);
  const receipt=await this.receipt(op);if(!receipt)fail('custody_pending');
  if(op.state==='committed'){if(m.pending)fail('custody_pending');await this.verifyPrimary();return {ok:true,protocol:CUSTODY_PROTOCOL,id,sequence:op.sequence};}
  if(m.pending!==id)fail('custody_pending_mismatch');
  const i=op.intent,rows=await this.primary(),f=rows.find(f=>f.assessment_id===i.assessmentId);
  if(!f||f.owner_id!==i.ownerId||f.institution_id!==i.institutionId||f.class_id!==i.classId||f.period_id!==i.periodId||f.revision_floor!==i.revision||f.deleted!==i.deleted)fail('custody_fence_conflict');
  const wanted=this.fences().filter(x=>x.assessment_id!==i.assessmentId).concat([f]).sort((a,b)=>a.assessment_id.localeCompare(b.assessment_id));
  if(!this.sameFences(wanted,rows))fail('custody_unwitnessed_change');
  const next={...op,state:'committed',sequence:m.seq+1};
  await this.append('commit',{id,token:op.token,fence:f,receipt:{id:receipt.id,revision:receipt.revision,deleted:Boolean(receipt.deleted)}},meta=>{this.rows('INSERT INTO cj_fences VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',f.assessment_id,JSON.stringify(f));this.putOp(next);meta.pending=null});
  return {ok:true,protocol:CUSTODY_PROTOCOL,id,sequence:next.sequence};
 }
 async rolledBack(p){
  exact(p,['action','id','bodyMac','token','proof']);if(p.proof!=='SQLITE_CONSTRAINT')fail('custody_abort_proof');
  const op=this.op(p.id),m=this.meta();if(!op||op.intent.bodyMac!==p.bodyMac||op.token!==p.token||op.state!=='pending'||m.pending!==p.id)fail('custody_abort_conflict');
  if(await this.receipt(op))fail('custody_commit_exists');await this.verifyPrimary();
  await this.append('abort',{id:p.id,token:p.token,proof:p.proof},meta=>{this.putOp({...op,state:'aborted'});meta.pending=null});return {ok:true};
 }
 async operator(p){
  const m=this.meta();
  if(p?.action==='initialize'){
   exact(p,['action']);if(m)fail('custody_already_initialized',409);if(!opaque(this.databaseId)||typeof this.custodian!=='string'||!this.custodian)fail('custody_configuration');
   const rows=await this.primary(),state={protocol:CUSTODY_PROTOCOL,databaseId:this.databaseId,custodian:this.custodian,controller:crypto.randomUUID(),mode:'closed',seq:0,head:'0'.repeat(64),pending:null,checkpoint:null};
   const event={protocol:CUSTODY_PROTOCOL,controller:state.controller,databaseId:this.databaseId,seq:1,previous:state.head,type:'baseline',at:new Date(this.now()).toISOString(),data:{fences:rows,custodian:this.custodian}};
   const hash=await digest(event);
   this.storage.transactionSync(()=>{if(this.meta())fail('custody_already_initialized',409);this.rows('INSERT INTO cj_events VALUES(?,?,?)',1,hash,JSON.stringify(event));for(const f of rows)this.rows('INSERT INTO cj_fences VALUES(?,?)',f.assessment_id,JSON.stringify(f));this.putMeta({...state,seq:1,head:hash})});
   return {ok:true,controller:state.controller,fenceCount:rows.length};
  }
  if(!m)fail('custody_uninitialized');
  if(p?.action==='status'){exact(p,['action']);return {ok:true,...m,pendingOperation:m.pending?this.op(m.pending):null,fenceCount:this.fences().length}}
  if(p?.action==='close'){exact(p,['action']);if(m.mode!=='closed')await this.append('close',{},meta=>{meta.mode='closed'});return {ok:true,mode:'closed',pending:m.pending}}
  if(p?.action==='reconcile'){
   exact(p,['action']);if(m.mode!=='closed')fail('custody_close_required');if(!m.pending)return {ok:true,pending:0};const op=this.op(m.pending);
   // Receipt absence in an old/restored primary is NEVER an abort certificate.
   return this.confirm(op.id,op.intent.bodyMac);
  }
  if(p?.action==='open'){exact(p,['action']);if(m.seq>=99996)fail('custody_capacity');if(m.pending)fail('custody_pending');await this.verifyPrimary();if(m.mode!=='open')await this.append('open',{},meta=>{meta.mode='open'});return {ok:true,mode:'open'}}
  if(p?.action==='checkpoint'){
   exact(p,['action']);if(m.mode!=='closed')fail('custody_close_required');if(m.pending)fail('custody_pending');const fences=await this.verifyPrimary();
   if(!m.checkpoint){m.checkpoint={protocol:CUSTODY_PROTOCOL,databaseId:this.databaseId,controller:m.controller,custodian:m.custodian,sequence:m.seq,headHash:m.head,cutAt:new Date(this.now()).toISOString(),fenceCount:fences.length,pending:0};this.storage.transactionSync(()=>this.putMeta(m))}
   return {ok:true,checkpoint:m.checkpoint};
  }
  if(p?.action==='events'){
   exact(p,['action','after','limit']);if(m.mode!=='closed'||m.pending||!m.checkpoint)fail('custody_checkpoint_required');if(!integer(p.after)||!Number.isInteger(p.limit)||p.limit<1||p.limit>100)fail('custody_page_invalid',400);
   const rows=this.rows('SELECT seq,hash,json FROM cj_events WHERE seq>? AND seq<=? ORDER BY seq LIMIT ?',p.after,m.checkpoint.sequence,p.limit+1),page=rows.slice(0,p.limit);
   return {ok:true,checkpoint:m.checkpoint,events:page.map(r=>({hash:r.hash,event:JSON.parse(r.json)})),next:rows.length>p.limit?page.at(-1).seq:null};
  }
  fail('custody_operator_action',400);
 }
}
