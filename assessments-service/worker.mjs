import {exact,opaqueId,uuid,validateDefinition,printArtifact} from './definition.mjs';
import {keyring,seal,open,operationMac} from './crypto.mjs';
import {SCORE_FORMAT_VERSION} from '../corretor/v2/assessments/score-format.mjs';
import {EDITOR_SNAPSHOT_CAPABILITY} from '../corretor/v2/assessments/editor-snapshot.mjs';

import {ASSESSMENT_LIFECYCLE_VERSION,LIFECYCLE_HEADER} from '../corretor/v2/assessments/lifecycle.mjs';

class Failure extends Error { constructor(status,code,message) { super(message); this.status=status; this.code=code; } }
const deny = (status,code,message) => { throw new Failure(status,code,message); };
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const rowScope = row => ({institutionId:row.institution_id,classId:row.class_id,periodId:row.period_id});
const checkRevision = n => { if (!Number.isSafeInteger(n) || n<0) throw new TypeError('Revisão inválida.'); };
function checkScope(p) { for (const field of ['institutionId','classId','periodId']) if (!opaqueId(p[field])) throw new TypeError('Escopo inválido.'); }
async function body(request) {
 if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') deny(415,'json_required','Envie JSON.');
 const reader=request.body?.getReader(); if (!reader) throw new TypeError('Corpo ausente.');
 const chunks=[]; let size=0;
 for (;;) { const {done,value}=await reader.read(); if (done) break; size+=value.length; if (size>1_000_000) { await reader.cancel(); deny(413,'too_large','A avaliação excede o limite.'); } chunks.push(value); }
 const bytes=new Uint8Array(size); let offset=0; for (const c of chunks) { bytes.set(c,offset); offset+=c.length; }
 try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw new TypeError('JSON inválido.'); }
}
async function principal(request,env,db) {
 if (!env.AUTH?.fetch) deny(503,'auth_unavailable','A autenticação está indisponível.');
 const cookie=request.headers.get('Cookie');
 if (!cookie || cookie.length>8192) deny(401,'session_required','Entre pela SALTA.');
 let response;
 try { response=await env.AUTH.fetch(new Request('https://salta-auth/session',{headers:{Cookie:cookie},signal:AbortSignal.timeout(4000)})); }
 catch { deny(503,'auth_unavailable','Não foi possível verificar a sessão.'); }
 if (response.status===401) deny(401,'session_expired','A sessão SALTA expirou.');
 if (!response.ok) deny(503,'auth_unavailable','Não foi possível verificar a sessão.');
 const result=await response.json().catch(()=>null);
 if (result?.ok!==true || result.authenticated!==true || typeof result.user!=='string' || !result.user || result.user.length>120) deny(401,'invalid_session','Sessão inválida.');
 const actor=await db.prepare("SELECT id,epoch FROM av_principals WHERE issuer='salta-auth' AND auth_user=? AND role='teacher' AND enabled=1 AND expires_at>?").bind(result.user,Date.now()).first();
 if (!actor) deny(403,'teacher_not_provisioned','Docente sem autorização para o banco.');
 return actor;
}
async function grant(db,actor,scope) {
 const result=await db.prepare('SELECT epoch FROM av_grants WHERE principal_id=? AND institution_id=? AND class_id=? AND period_id=? AND enabled=1 AND expires_at>?').bind(actor.id,scope.institutionId,scope.classId,scope.periodId,Date.now()).first();
 if (!result) deny(403,'scope_denied','Instituição, turma ou período não autorizado.');
 return result;
}
async function root(db,actor,id) {
 const result=await db.prepare('SELECT * FROM av_assessments WHERE id=? AND owner_id=?').bind(id,actor.id).first();
 if (!result) deny(404,'not_found','Avaliação não encontrada.');
 result.grant=await grant(db,actor,rowScope(result)); return result;
}
// Evaluated again INSIDE every mutation batch. Auth sessions remain owned by Auth;
// there is no cross-service distributed transaction with logout (see contract).
function guard(actor,scope,g) {
 return {sql:`EXISTS(SELECT 1 FROM av_principals p JOIN av_grants g ON g.principal_id=p.id WHERE p.id=? AND p.role='teacher' AND p.enabled=1 AND p.epoch=? AND p.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER) AND g.institution_id=? AND g.class_id=? AND g.period_id=? AND g.enabled=1 AND g.epoch=? AND g.expires_at>CAST(unixepoch('subsec')*1000 AS INTEGER))`,
  args:[actor.id,actor.epoch,scope.institutionId,scope.classId,scope.periodId,g.epoch]};
}
async function load(db,actor,ring,id,revision) {
 const a=await root(db,actor,id), n=revision??a.current_revision;
 if(ring.lifecycle&&n!==a.current_revision) deny(410,'revision_replaced','Esta definição foi substituída. Reabra e selecione a avaliação.');
 const r=await db.prepare('SELECT * FROM av_revisions WHERE assessment_id=? AND revision=?').bind(id,n).first();
 if (!r) deny(404,'revision_not_found','Revisão não encontrada.');
 const record={id,ownerId:actor.id,...rowScope(a),revision:r.revision,status:r.status,manifestHash:r.manifest_hash,keyVersion:r.key_version};
 let checked;
 try {
  const definition=await open(ring,record,JSON.parse(r.encrypted_json));
  checked=validateDefinition(definition);
  if (checked.definition.manifest.contentHash!==record.manifestHash) throw Error('Manifest binding mismatch');
 } catch { deny(503,'record_unavailable','Não foi possível autenticar ou recuperar esta revisão.'); }
 return {...record,...checked,archived:a.state==='archived'};
}
async function replay(db,actor,ring,requestId,operation) {
 if (!uuid(requestId)) throw new TypeError('Identificador de operação inválido.');
 const previous=await db.prepare('SELECT * FROM av_requests WHERE owner_id=? AND request_id=?').bind(actor.id,requestId).first();
 if (!previous) return null;
 if (previous.body_mac!==await operationMac(ring,previous.key_version,operation)) deny(409,'idempotency_conflict','Esta operação já foi usada com outro conteúdo.');
 const receipt=JSON.parse(previous.receipt_json);
 if(ring.lifecycle){
  const fence=await db.prepare('SELECT * FROM av_lifecycle_fences WHERE assessment_id=? AND owner_id=?').bind(previous.assessment_id,actor.id).first();
  if(fence){await grant(db,actor,rowScope(fence));
   if(fence.deleted&&!receipt.deleted)deny(410,'assessment_deleted','Esta avaliação foi excluída.');
   if(!receipt.deleted&&previous.revision<fence.revision_floor)deny(409,'operation_superseded','A operação foi substituída. Reabra a avaliação atual.');
  }
  if(!receipt.deleted)await root(db,actor,previous.assessment_id);
 }else await root(db,actor,previous.assessment_id);
 return json({...receipt,replayed:true});
}
async function commit(db,actor,ring,p,operation,statements,receipt) {
 const version=ring.active, mac=await operationMac(ring,version,operation);
 statements.push(db.prepare('INSERT INTO av_requests(owner_id,request_id,body_mac,key_version,assessment_id,revision,receipt_json) VALUES(?,?,?,?,?,?,?)').bind(actor.id,p.requestId,mac,version,receipt.id,receipt.revision,JSON.stringify(receipt)));
 try { await db.batch(statements); }
 catch (error) {
  const repeated=await replay(db,actor,ring,p.requestId,operation); if (repeated) return repeated;
  if (/unique constraint failed|not null constraint failed|selection must be current|replacement contract required|deleted assessment/i.test(String(error?.message))) deny(409,'concurrent_change','A versão ou autorização mudou. Reabra antes de tentar novamente.');
  deny(503,'save_unconfirmed','O salvamento não foi confirmado. Reenvie a mesma operação.');
 }
 return json(receipt,201);
}
async function save(db,actor,ring,id,p,operation={kind:'save',id,p}) {
 if(ring.lifecycle&&p.lifecycleVersion!==ASSESSMENT_LIFECYCLE_VERSION)deny(409,'lifecycle_required','Atualize a biblioteca antes de salvar.');
 exact(p,['requestId','expectedRevision','institutionId','classId','periodId','status','definition',...(ring.lifecycle?['lifecycleVersion']:[])]);
 checkScope(p); checkRevision(p.expectedRevision);
 if (!['draft','issued'].includes(p.status)) throw new TypeError('Estado inválido.');
 const {definition}=validateDefinition(p.definition);
 if (p.status==='issued'&&!definition.date) throw new TypeError('Informe a data antes de emitir.');
 const g=await grant(db,actor,p), repeated=await replay(db,actor,ring,p.requestId,operation); if (repeated) return repeated;
 if(ring.lifecycle){const fence=await db.prepare('SELECT deleted,owner_id FROM av_lifecycle_fences WHERE assessment_id=?').bind(id).first();if(fence?.deleted&&fence.owner_id!==actor.id)deny(404,'not_found','Avaliação não encontrada.');if(fence?.deleted)deny(409,'assessment_deleted','Identificador indisponível. Crie uma nova avaliação.');}
 const a=await db.prepare('SELECT * FROM av_assessments WHERE id=?').bind(id).first();
 if (a&&(a.owner_id!==actor.id || ['institutionId','classId','periodId'].some(k=>rowScope(a)[k]!==p[k]))) deny(404,'not_found','Avaliação não encontrada.');
 if ((a?.current_revision??0)!==p.expectedRevision || a?.state==='archived') deny(409,'revision_conflict','A avaliação mudou ou foi arquivada. Reabra antes de salvar.');
 // An older client must not silently erase saved presentation/editor choices.
 if (a&&(!Object.hasOwn(definition.display,'scoreDecimals')||!Object.hasOwn(definition,'editorSnapshot'))) {
  const previous=await load(db,actor,ring,id,a.current_revision);
  if (!Object.hasOwn(definition,'editorSnapshot')&&Object.hasOwn(previous.definition,'editorSnapshot'))
   deny(409,'editor_snapshot_required','Reabra com um cliente compatível antes de salvar as configurações completas.');
  if (!Object.hasOwn(definition.display,'scoreDecimals')&&Object.hasOwn(previous.definition.display,'scoreDecimals'))
   deny(409,'score_format_required','Reabra com um cliente compatível antes de salvar o formato da nota.');
 }
 const revision=p.expectedRevision+1, now=new Date().toISOString(), record={id,ownerId:actor.id,institutionId:p.institutionId,classId:p.classId,periodId:p.periodId,revision,status:p.status,manifestHash:definition.manifest.contentHash,keyVersion:ring.active};
 const encrypted=await seal(ring,record,definition), statements=[], gate=guard(actor,p,g);
 if (!a) statements.push(db.prepare('INSERT INTO av_assessments(id,owner_id,institution_id,class_id,period_id,updated_at) VALUES(?,?,?,?,?,?)').bind(id,actor.id,p.institutionId,p.classId,p.periodId,now));
 if(ring.lifecycle&&a)await checkPurgeDependencies(db);
 if(ring.lifecycle&&a&&await db.prepare('SELECT 1 FROM av_retention_holds WHERE assessment_id=?').bind(id).first())deny(409,'retention_hold','Substituição bloqueada por vínculo acadêmico ou obrigação de guarda.');
 if(ring.lifecycle&&a)statements.push(purgeGuard(db,actor,p,g,id,p.requestId,'replace'));
 // NULL revision aborts the entire transaction if the CAS or grant changed.
 statements.push(db.prepare(`INSERT INTO av_revisions(assessment_id,revision,status,manifest_hash,key_version,encrypted_json,created_at) VALUES(?,(SELECT CASE WHEN current_revision=? AND state='active' AND ${gate.sql} THEN ? ELSE NULL END FROM av_assessments WHERE id=? AND owner_id=?),?,?,?,?,?)`).bind(id,p.expectedRevision,...gate.args,revision,id,actor.id,p.status,record.manifestHash,ring.active,JSON.stringify(encrypted),now));
 statements.push(db.prepare('UPDATE av_assessments SET current_revision=?,updated_at=? WHERE id=? AND owner_id=? AND current_revision=?').bind(revision,now,id,actor.id,p.expectedRevision));
 if(ring.lifecycle){
  statements.push(fenceStatement(db,actor,p,id,revision,0,now));
  if(a){
   statements.push(db.prepare('DELETE FROM av_selections WHERE assessment_id=?').bind(id));
   statements.push(db.prepare('DELETE FROM av_revisions WHERE assessment_id=? AND revision<?').bind(id,revision));
   statements.push(db.prepare('DELETE FROM av_purge_guards WHERE assessment_id=?').bind(id));
  }
 }
 return commit(db,actor,ring,p,operation,statements,{ok:true,id,revision,manifestHash:record.manifestHash});
}
// Unknown incoming FKs (including CASCADE) must never erase independent results.
async function checkPurgeDependencies(db){
 const expected=new Set(['av_revisions:av_assessments:assessment_id:id','av_selections:av_revisions:assessment_id:assessment_id','av_selections:av_revisions:revision:revision','av_retention_holds:av_assessments:assessment_id:id','av_purge_guards:av_assessments:assessment_id:id']);
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results;
 for(const {name} of tables){
  const foreign=(await db.prepare('PRAGMA foreign_key_list("'+name.replaceAll('"','""')+'")').all()).results;
  if(foreign.some(f=>['av_assessments','av_revisions'].includes(f.table)&&!expected.has([name,f.table,f.from,f.to].join(':'))))
   deny(409,'unreviewed_dependency','Operação bloqueada por vínculo não homologado. Solicite conferência.');
 }
}
// A NULL guard aborts the batch on concurrent CAS, revocation or retention hold.
function purgeGuard(db,actor,p,g,id,requestId,kind){
 const gate=guard(actor,p,g);
 return db.prepare(`INSERT INTO av_purge_guards(assessment_id,owner_id,expected_revision,request_id,kind) VALUES(?,(SELECT CASE WHEN current_revision=? AND ${gate.sql} AND NOT EXISTS(SELECT 1 FROM av_retention_holds WHERE assessment_id=?) THEN owner_id ELSE NULL END FROM av_assessments WHERE id=? AND owner_id=?),?,?,?)`).bind(id,p.expectedRevision,...gate.args,id,id,actor.id,p.expectedRevision,requestId,kind);
}
function fenceStatement(db,actor,p,id,revision,deleted,now){
 return db.prepare('INSERT INTO av_lifecycle_fences VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id) DO UPDATE SET revision_floor=excluded.revision_floor,deleted=excluded.deleted,updated_at=excluded.updated_at').bind(id,actor.id,p.institutionId,p.classId,p.periodId,revision,deleted,now);
}
async function erase(db,actor,ring,id,p){
 exact(p,['requestId','expectedRevision','lifecycleVersion']);checkRevision(p.expectedRevision);
 if(!ring.lifecycle||p.lifecycleVersion!==ASSESSMENT_LIFECYCLE_VERSION)deny(409,'lifecycle_required','Exclusão indisponível neste servidor.');
 const operation={kind:'delete',id,p}, repeated=await replay(db,actor,ring,p.requestId,operation);if(repeated)return repeated;
 const a=await root(db,actor,id);
 await checkPurgeDependencies(db);
 if(a.current_revision!==p.expectedRevision)deny(409,'revision_conflict','A avaliação mudou. Reabra antes de excluir.');
 const held=await db.prepare('SELECT 1 FROM av_retention_holds WHERE assessment_id=?').bind(id).first();
 if(held)deny(409,'retention_hold','Exclusão bloqueada por vínculo acadêmico ou obrigação de guarda.');
 const scope=rowScope(a),statements=[purgeGuard(db,actor,{...scope,...p},a.grant,id,p.requestId,'delete'),
  fenceStatement(db,actor,scope,id,a.current_revision,1,new Date().toISOString()),
  db.prepare('DELETE FROM av_selections WHERE assessment_id=?').bind(id),
  db.prepare('DELETE FROM av_revisions WHERE assessment_id=?').bind(id),
  db.prepare('DELETE FROM av_purge_guards WHERE assessment_id=?').bind(id),
  db.prepare('DELETE FROM av_assessments WHERE id=? AND owner_id=?').bind(id,actor.id)];
 return commit(db,actor,ring,p,operation,statements,{ok:true,id,revision:a.current_revision,deleted:true});
}
async function archive(db,actor,ring,id,p) {
 exact(p,['requestId','expectedRevision']); checkRevision(p.expectedRevision);
 const operation={kind:'archive',id,p}, repeated=await replay(db,actor,ring,p.requestId,operation); if (repeated) return repeated;
 if(ring.lifecycle)deny(410,'archive_removed','Arquivamento não é exclusão.');
 const a=await root(db,actor,id), gate=guard(actor,rowScope(a),a.grant);
 if (a.state==='archived'||a.current_revision!==p.expectedRevision) deny(409,'revision_conflict','A avaliação mudou ou já está arquivada.');
 const receipt={ok:true,id,revision:a.current_revision,archived:true}, version=ring.active, mac=await operationMac(ring,version,operation);
 const statements=[db.prepare(`INSERT INTO av_requests(owner_id,request_id,body_mac,key_version,assessment_id,revision,receipt_json) VALUES(?,?,?,?,?,(SELECT CASE WHEN current_revision=? AND state='active' AND ${gate.sql} THEN current_revision ELSE NULL END FROM av_assessments WHERE id=? AND owner_id=?),?)`).bind(actor.id,p.requestId,mac,version,id,p.expectedRevision,...gate.args,id,actor.id,JSON.stringify(receipt)),
  db.prepare("UPDATE av_assessments SET state='archived',updated_at=? WHERE id=? AND owner_id=? AND current_revision=?").bind(new Date().toISOString(),id,actor.id,p.expectedRevision)];
 try { await db.batch(statements); } catch (error) {
  const r=await replay(db,actor,ring,p.requestId,operation); if (r) return r;
  if (/unique constraint failed|not null constraint failed|selection must be current|replacement contract required|deleted assessment/i.test(String(error?.message))) deny(409,'concurrent_change','A avaliação ou autorização mudou.');
  deny(503,'save_unconfirmed','Arquivamento não confirmado. Reenvie a mesma operação.');
 }
 return json(receipt);
}
async function select(db,actor,ring,p) {
 exact(p,['requestId','selectionId','assessmentId','revision']);
 if (!uuid(p.selectionId)||!uuid(p.assessmentId)) throw new TypeError('Identificação inválida.');
 checkRevision(p.revision);
 const operation={kind:'select',p}, repeated=await replay(db,actor,ring,p.requestId,operation); if (repeated) return repeated;
 const a=await root(db,actor,p.assessmentId), record=await load(db,actor,ring,p.assessmentId,p.revision), gate=guard(actor,rowScope(a),a.grant);
 if (a.state==='archived'||record.status!=='issued') deny(409,'not_issued','Selecione uma revisão emitida e não arquivada.');
 const now=new Date().toISOString(), receipt={ok:true,id:p.assessmentId,revision:p.revision,selectionId:p.selectionId,manifestHash:record.manifestHash};
 const statements=[db.prepare(`INSERT INTO av_selections(id,owner_id,assessment_id,revision,manifest_hash,created_at) VALUES(?,?,?,(SELECT CASE WHEN a.state='active' AND r.status='issued' ${ring.lifecycle?'AND a.current_revision=r.revision ':''}AND ${gate.sql} THEN r.revision ELSE NULL END FROM av_assessments a JOIN av_revisions r ON r.assessment_id=a.id WHERE a.id=? AND a.owner_id=? AND r.revision=?),?,?)`).bind(p.selectionId,actor.id,p.assessmentId,...gate.args,p.assessmentId,actor.id,p.revision,record.manifestHash,now)];
 return commit(db,actor,ring,p,operation,statements,receipt);
}
async function route(request,env) {
 if (env.ENABLE_ASSESSMENTS!=='true') deny(503,'disabled','Banco integrado ainda não habilitado.');
 if (!env.ASSESSMENTS_DB) deny(503,'database_unavailable','Banco indisponível.');
 if (!env.PORTAL_ORIGIN || request.headers.get('Origin')!==env.PORTAL_ORIGIN) deny(403,'origin_denied','Origem não autorizada.');
 const db=env.ASSESSMENTS_DB, actor=await principal(request,env,db), ring=keyring(env), url=new URL(request.url), path=url.pathname;
 ring.lifecycle=env.ENABLE_ASSESSMENT_LIFECYCLE==='true';
 if(ring.lifecycle){
  if(env.ASSESSMENT_RETENTION_POLICY!==ASSESSMENT_LIFECYCLE_VERSION)deny(503,'retention_policy_required','Política de retenção ainda não aprovada.');
  const schema=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='av_lifecycle_schema'").first();
  if(!schema||!(await db.prepare('SELECT version FROM av_lifecycle_schema WHERE version=?').bind(ASSESSMENT_LIFECYCLE_VERSION).first()))deny(503,'lifecycle_schema_required','Atualização estrutural pendente.');
  if(request.headers.get(LIFECYCLE_HEADER)!==ASSESSMENT_LIFECYCLE_VERSION)deny(503,'lifecycle_gateway_required','Gateway compatível ainda indisponível.');
 }
 if (path==='/assessments/v1/session'&&request.method==='GET') return json({authenticated:true,principalId:actor.id,epoch:actor.epoch,cryptoModel:'server-managed',scoreFormatVersion:SCORE_FORMAT_VERSION,embeddedLibraryVersion:'salta-embedded-library-v1',editorSnapshotVersion:EDITOR_SNAPSHOT_CAPABILITY,...(ring.lifecycle?{assessmentLifecycleVersion:ASSESSMENT_LIFECYCLE_VERSION}:{})});
 if (path==='/assessments/v1/grants'&&request.method==='GET') return json({grants:(await db.prepare('SELECT institution_id AS institutionId,class_id AS classId,period_id AS periodId FROM av_grants WHERE principal_id=? AND enabled=1 AND expires_at>? ORDER BY institution_id,class_id,period_id').bind(actor.id,Date.now()).all()).results});
 if (path==='/assessments/v1/assessments'&&request.method==='GET') {
  const allowed=['after','institutionId','classId','periodId'];
  if ([...url.searchParams.keys()].some(k=>!allowed.includes(k))||
      allowed.some(k=>url.searchParams.getAll(k).length>1))
   throw new TypeError('Parâmetros de catálogo inválidos.');
  const after=url.searchParams.get('after')||''; if (after&&!uuid(after)) throw new TypeError('Cursor inválido.');
  const hasScope=['institutionId','classId','periodId'].map(k=>url.searchParams.has(k));
  if (hasScope.some(Boolean)&&!hasScope.every(Boolean)) throw new TypeError('Informe o escopo completo.');
  const scope=hasScope.every(Boolean)?Object.fromEntries(['institutionId','classId','periodId'].map(k=>[k,url.searchParams.get(k)])):null;
  if (scope){checkScope(scope);await grant(db,actor,scope);}
  // One scoped, owner-filtered read of 10 entries plus lookahead. The latest
  // revisions remain encrypted in D1 and are authenticated/decrypted only
  // after the query. LEFT JOIN fails closed if an expected revision is missing.
  const rows=(await db.prepare(`
   SELECT a.id,a.owner_id,a.institution_id,a.class_id,a.period_id,a.current_revision,a.state,
    r.revision,r.status,r.manifest_hash,r.key_version,r.encrypted_json
   FROM av_assessments a
   JOIN av_grants g ON g.principal_id=a.owner_id AND g.institution_id=a.institution_id
    AND g.class_id=a.class_id AND g.period_id=a.period_id
   LEFT JOIN av_revisions r ON r.assessment_id=a.id AND r.revision=a.current_revision
   WHERE a.owner_id=? AND a.id>? AND g.enabled=1 AND g.expires_at>?
   ${scope?'AND a.institution_id=? AND a.class_id=? AND a.period_id=?':''}
   ORDER BY a.id LIMIT 11`).bind(actor.id,after,Date.now(),
    ...(scope?[scope.institutionId,scope.classId,scope.periodId]:[])).all()).results;
  const assessments=[];
  for (const a of rows.slice(0,10)) {
   const record={id:a.id,ownerId:actor.id,...rowScope(a),revision:a.current_revision,
    status:a.status,manifestHash:a.manifest_hash,keyVersion:a.key_version};
   let checked;
   try {
    if (a.owner_id!==actor.id||a.revision!==a.current_revision||!a.encrypted_json) throw Error('Revision missing');
    const definition=await open(ring,record,JSON.parse(a.encrypted_json));
    checked=validateDefinition(definition);
    if (checked.definition.manifest.contentHash!==record.manifestHash) throw Error('Manifest binding mismatch');
   } catch { deny(503,'record_unavailable','Não foi possível autenticar ou recuperar esta revisão.'); }
   assessments.push({id:a.id,...rowScope(a),revision:a.current_revision,state:a.state,
    title:checked.definition.title,totalUnits:checked.totalUnits,scoreScale:checked.scoreScale});
  }
  return json({assessments,nextCursor:rows.length>10?rows[9].id:null});
 }
 if (path==='/assessments/v1/selections'&&request.method==='POST') return select(db,actor,ring,await body(request));
 const selection=path.match(/^\/assessments\/v1\/selections\/([0-9a-f-]{36})$/i);
 if (selection&&uuid(selection[1])&&request.method==='GET') {
  const s=await db.prepare('SELECT * FROM av_selections WHERE id=? AND owner_id=?').bind(selection[1],actor.id).first(); if (!s) deny(404,'not_found','Sessão de correção não encontrada.');
  const record=await load(db,actor,ring,s.assessment_id,s.revision);
  if (record.manifestHash!==s.manifest_hash) throw Error('Selection binding mismatch');
  return json({selectionId:s.id,record});
 }
 const match=path.match(/^\/assessments\/v1\/assessments\/([0-9a-f-]{36})(?:\/(archive|duplicate|revisions|delete|status)(?:\/([1-9][0-9]*)(?:\/(print))?)?)?$/i);
 if (!match||!uuid(match[1])) deny(404,'not_found','Rota não encontrada.');
 const [,id,action,n,print]=match;
 if (n&&action!=='revisions') deny(404,'not_found','Rota não encontrada.');
 if (!action&&request.method==='PUT') return save(db,actor,ring,id,await body(request));
 if(action==='delete'&&request.method==='POST')return erase(db,actor,ring,id,await body(request));
 if(action==='status'&&request.method==='GET'&&ring.lifecycle){
  const fence=await db.prepare('SELECT * FROM av_lifecycle_fences WHERE assessment_id=? AND owner_id=?').bind(id,actor.id).first();
  if(!fence)deny(404,'not_found','Avaliação não encontrada.');await grant(db,actor,rowScope(fence));
  return json({id,revision:fence.revision_floor,deleted:Boolean(fence.deleted)});
 }
 if (action==='archive'&&request.method==='POST') return archive(db,actor,ring,id,await body(request));
 if (action==='duplicate'&&request.method==='POST') {
  const p=await body(request); exact(p,['requestId','newId','sourceRevision']); if (!uuid(p.newId)) throw new TypeError('Novo ID inválido.'); checkRevision(p.sourceRevision); if (!p.sourceRevision) throw new TypeError('Selecione uma revisão explícita.');
  const operation={kind:'duplicate',id,p}; const repeated=await replay(db,actor,ring,p.requestId,operation); if (repeated) return repeated;
  const source=await load(db,actor,ring,id,p.sourceRevision);
  return save(db,actor,ring,p.newId,{requestId:p.requestId,expectedRevision:0,institutionId:source.institutionId,classId:source.classId,periodId:source.periodId,status:'draft',definition:source.definition,...(ring.lifecycle?{lifecycleVersion:ASSESSMENT_LIFECYCLE_VERSION}:{})},operation);
 }
 if (request.method==='GET') {
  if(action==='revisions'&&!n&&ring.lifecycle)deny(410,'history_removed','Histórico de definições indisponível.');
  if (action==='revisions'&&!n) { await root(db,actor,id); return json({revisions:(await db.prepare('SELECT revision,status,manifest_hash AS manifestHash,created_at AS createdAt FROM av_revisions WHERE assessment_id=? ORDER BY revision').bind(id).all()).results}); }
  if (!action || action==='revisions'&&n) { if (n) checkRevision(Number(n)); const record=await load(db,actor,ring,id,n?Number(n):null);
   if (print) { if (record.status!=='issued') deny(409,'not_issued','Emita a revisão antes de gerar o arquivo de impressão.'); return json(printArtifact(record)); }
   return json({record});
  }
 }
 deny(405,'method_denied','Operação não permitida.');
}
export default {async fetch(request,env) {
 try { return await route(request,env); }
 catch (error) {
  if (error instanceof Failure) return json({error:error.message,code:error.code},error.status);
  if (error instanceof TypeError) return json({error:'Revise os campos e o contrato da avaliação.',code:'invalid_contract'},400);
  // Never log raw exception, body, cookies, plaintext, keys or SQL parameters.
  return json({error:'A operação não foi confirmada. Tente novamente.',code:'service_unavailable'},503);
 }
}};
