import {protectedMode,accessPrincipal,validateVault} from './protected-auth.mjs';
// Synthetic laboratory: loopback fixtures or an explicitly configured Access-protected origin.
const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]']);
const STATES=new Set(['draft','issued','archived']);
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9.-]{1,127}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
class LabError extends Error {constructor(status,message){super(message);this.status=status}}
const reject=(status,error)=>{throw new LabError(status,error)};
async function body(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))reject(415,'Envie JSON.');
 const reader=request.body?.getReader();if(!reader)reject(400,'Requisição vazia.');
 const chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1_500_000){await reader.cancel();reject(413,'A avaliação excede o limite permitido.')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{reject(400,'JSON inválido.')}
}
function validatePayload(p){
 const allowed=['expectedRevision','requestId','classId','periodId','state','manifestHash','encrypted'];
 if(!p||Object.keys(p).some(k=>!allowed.includes(k))||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0||!uuid(p.requestId)||!id(p.classId)||!id(p.periodId)||!STATES.has(p.state)||!/^[a-f0-9]{16,128}$/.test(p.manifestHash))reject(400,'Contrato de avaliação inválido.');
 const e=p.encrypted;
 if(!e||Object.keys(e).sort().join(',')!==['aead','ciphertext','kdf','key_version','nonce','protocol_version','revision','salt'].sort().join(',')||e.protocol_version!==1||e.key_version!==1||e.revision!==p.expectedRevision+1||e.aead!=='AES-256-GCM'||e.kdf!=='HKDF-SHA256'||!/^[-_A-Za-z0-9]{43}$/.test(e.salt)||!/^[-_A-Za-z0-9]{16}$/.test(e.nonce)||!/^[-_A-Za-z0-9]{22,1400000}$/.test(e.ciphertext))reject(400,'Payload cifrado inválido.');
}
async function principal(request,db){
 // Only server-issued opaque cookies are accepted; IDs/headers from clients confer no rights.
 const cookie=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)salta_assessment_lab=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!cookie)reject(401,'Entre na sessão sintética do laboratório.');
 const row=await db.prepare('SELECT p.id,p.label FROM assessment_lab_sessions s JOIN assessment_principals p ON p.id=s.principal_id WHERE token_hash=? AND expires_at>?').bind(await hash(cookie),Date.now()).first();
 if(!row)reject(401,'A sessão sintética expirou.');return row;
}
async function grant(db,owner,classId,periodId){
 if(!await db.prepare('SELECT 1 AS ok FROM assessment_grants WHERE principal_id=? AND class_id=? AND period_id=? AND active=1').bind(owner,classId,periodId).first())reject(403,'Turma ou período não autorizado.');
}
async function root(db,owner,assessmentId){
 const r=await db.prepare('SELECT * FROM assessment_roots WHERE id=? AND owner_id=?').bind(assessmentId,owner).first();
 if(!r)reject(404,'Avaliação não encontrada.');await grant(db,owner,r.class_id,r.period_id);return r;
}
const receipt=row=>({ok:true,id:row.assessment_id,revision:row.revision});
async function replay(db,owner,requestId,digest){
 const previous=await db.prepare('SELECT * FROM assessment_requests WHERE owner_id=? AND request_id=?').bind(owner,requestId).first();
 if(!previous)return null;
 if(previous.body_hash!==digest)reject(409,'Identificador de reenvio já utilizado com outro conteúdo.');
 await root(db,owner,previous.assessment_id);return receipt(previous);
}
async function save(db,owner,assessmentId,p,access=null){
 validatePayload(p);await grant(db,owner,p.classId,p.periodId);
 const digest=await hash(JSON.stringify({id:assessmentId,...p}));const prior=await replay(db,owner,p.requestId,digest);if(prior)return json({...prior,replayed:true});
 const existing=await db.prepare('SELECT * FROM assessment_roots WHERE id=?').bind(assessmentId).first();
 if(existing&&(existing.owner_id!==owner||existing.class_id!==p.classId||existing.period_id!==p.periodId))reject(404,'Avaliação não encontrada.');
 if((existing?.current_revision||0)!==p.expectedRevision||existing?.state==='archived')reject(409,'Conflito de revisão. Reabra a avaliação antes de salvar novamente.');
 if(!existing&&p.expectedRevision!==0)reject(409,'A revisão não existe.');
 const next=p.expectedRevision+1,now=new Date().toISOString(),statements=[];
 if(!existing)statements.push(db.prepare('INSERT INTO assessment_roots(id,owner_id,class_id,period_id,updated_at) VALUES(?,?,?,?,?)').bind(assessmentId,owner,p.classId,p.periodId,now));
 // A NOT NULL revision guard makes a stale CAS or a revoked grant abort the whole D1 batch.
 statements.push(db.prepare(`INSERT INTO assessment_revisions(assessment_id,revision,state,manifest_hash,encrypted_json,created_at)
  VALUES(?,(SELECT CASE WHEN current_revision=? AND state<>'archived' AND EXISTS(SELECT 1 FROM assessment_grants WHERE principal_id=? AND class_id=? AND period_id=? AND active=1) AND (?=0 OR EXISTS(SELECT 1 FROM assessment_access_control WHERE principal_id=? AND enabled=1 AND epoch=? AND expires_at>?)) THEN ? ELSE NULL END FROM assessment_roots WHERE id=? AND owner_id=?),?,?,?,?)`).bind(assessmentId,p.expectedRevision,owner,p.classId,p.periodId,access?1:0,owner,access?.epoch||0,Date.now(),next,assessmentId,owner,p.state,p.manifestHash,JSON.stringify(p.encrypted),now));
 statements.push(db.prepare('UPDATE assessment_roots SET current_revision=?,state=?,updated_at=? WHERE id=? AND owner_id=? AND current_revision=?').bind(next,p.state,now,assessmentId,owner,p.expectedRevision));
 statements.push(db.prepare('INSERT INTO assessment_requests(owner_id,request_id,body_hash,assessment_id,revision) VALUES(?,?,?,?,?)').bind(owner,p.requestId,digest,assessmentId,next));
 try{await db.batch(statements)}catch(error){
  const repeated=await replay(db,owner,p.requestId,digest);if(repeated)return json({...repeated,replayed:true});
  if(/constraint|unique|not null/i.test(String(error?.message)))reject(409,'Conflito de revisão. Reabra a avaliação antes de salvar novamente.');
  reject(503,'A gravação não foi confirmada. Tente reenviar a mesma operação.');
 }
 return json({ok:true,id:assessmentId,revision:next},201);
}
async function route(request,env,url,ctx){
 const db=env.ASSESSMENTS_DB;if(!db)reject(503,'Banco de homologação indisponível.');
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)reject(403,'Origem não autorizada.');
 if(url.pathname==='/__lab/login'&&request.method==='POST'){
  if(protectedMode(env))reject(404,'Rota não encontrada.');
  const p=await body(request);const subject={'teacher-one':'lab:teacher-one','teacher-two':'lab:teacher-two'}[p.fixture];
  if(!subject)reject(400,'Escolha uma identidade sintética.');
  const actor=await db.prepare('SELECT id FROM assessment_principals WHERE auth_subject=?').bind(subject).first();if(!actor)reject(503,'Fixture local não preparada.');
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  await db.prepare('INSERT INTO assessment_lab_sessions VALUES(?,?,?)').bind(await hash(token),actor.id,Date.now()+4*3600_000).run();
  return json({ok:true},200,{'Set-Cookie':`salta_assessment_lab=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=14400`});
 }
 const actor=protectedMode(env)?await accessPrincipal(env,ctx,db):await principal(request,db);
 if(protectedMode(env)&&url.pathname==='/api/key-vault'){
  if(request.method==='GET'){const row=await db.prepare('SELECT encrypted_json FROM assessment_key_vaults WHERE principal_id=?').bind(actor.id).first();return json({vault:row?JSON.parse(row.encrypted_json):null})}
  if(request.method==='PUT'){
   const payload=validateVault(await body(request));
   if(await db.prepare('SELECT 1 AS ok FROM assessment_roots WHERE owner_id=? LIMIT 1').bind(actor.id).first())reject(409,'Há avaliações existentes. Recupere o cofre; não crie outra chave.');
   try{await db.prepare('INSERT INTO assessment_key_vaults(principal_id,encrypted_json,created_at) VALUES(?,?,?)').bind(actor.id,JSON.stringify(payload),new Date().toISOString()).run()}catch{reject(409,'Cofre já existente. Recupere a chave previamente cadastrada.')}
   return json({ok:true},201);
  }
 }
 if(protectedMode(env)&&url.pathname==='/api/access/revoke'&&request.method==='POST'){
  await db.prepare('UPDATE assessment_access_control SET enabled=0,epoch=epoch+1 WHERE principal_id=?').bind(actor.id).run();return json({ok:true,revoked:true});
 }
 if(url.pathname==='/api/session')return json({ok:true,authenticated:true,user:actor.label,principalId:actor.id,mode:protectedMode(env)?'protected-synthetic':'synthetic-only',epoch:actor.epoch,expiresAt:actor.expires_at});
 if(url.pathname==='/api/classes'&&request.method==='GET')return json({classes:(await db.prepare('SELECT class_id AS classId,period_id AS periodId,label FROM assessment_grants WHERE principal_id=? AND active=1 ORDER BY label').bind(actor.id).all()).results});
 if(url.pathname==='/api/assessments'&&request.method==='GET')return json({assessments:(await db.prepare(`SELECT a.id,a.current_revision AS revision,a.state,a.class_id AS classId,a.period_id AS periodId,a.updated_at AS updatedAt FROM assessment_roots a JOIN assessment_grants g ON g.principal_id=a.owner_id AND g.class_id=a.class_id AND g.period_id=a.period_id WHERE a.owner_id=? AND g.active=1 ORDER BY a.updated_at DESC LIMIT 200`).bind(actor.id).all()).results});
 const match=url.pathname.match(/^\/api\/assessments\/([a-f0-9-]{36})(?:\/revisions\/(\d+))?$/i);
 if(match&&uuid(match[1])){
  const assessmentId=match[1];
  if(request.method==='PUT'&&!match[2]){
   if(protectedMode(env)&&!await db.prepare('SELECT 1 AS ok FROM assessment_key_vaults WHERE principal_id=?').bind(actor.id).first())reject(409,'Cadastre e confirme o cofre antes de salvar avaliações.');
   return save(db,actor.id,assessmentId,await body(request),protectedMode(env)?actor:null);
  }
  if(request.method==='GET'){
   const a=await root(db,actor.id,assessmentId),revision=match[2]?Number(match[2]):a.current_revision;
   const r=await db.prepare('SELECT * FROM assessment_revisions WHERE assessment_id=? AND revision=?').bind(assessmentId,revision).first();if(!r)reject(404,'Revisão não encontrada.');
   return json({record:{id:assessmentId,ownerId:actor.id,classId:a.class_id,periodId:a.period_id,revision:r.revision,state:r.state,manifestHash:r.manifest_hash,updatedAt:r.created_at,encrypted:JSON.parse(r.encrypted_json)}});
  }
 }
 reject(404,'Rota não encontrada.');
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(!(env.SALTA_ASSESSMENTS_MODE==='local-only'&&LOOPBACK.has(url.hostname))&&!(protectedMode(env)&&url.origin===env.PUBLIC_ORIGIN&&url.protocol==='https:'))return json({error:'Laboratório bloqueado fora de localhost; autenticação e chaves reais ainda não homologadas.'},403);
 try{
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/__lab/'))return await route(request,env,url,ctx);
  if(protectedMode(env))await accessPrincipal(env,ctx,env.ASSESSMENTS_DB);
  if(env.ASSETS){const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");return new Response(response.body,{status:response.status,headers})}
  return json({error:'Recursos locais indisponíveis.'},404);
 }catch(error){if(error?.accessStatus)return json({error:'Acesso protegido indisponível ou revogado.'},error.accessStatus);return json({error:error instanceof LabError?error.message:'A operação de homologação falhou. Nenhuma confirmação de salvamento foi recebida.'},error instanceof LabError?error.status:503)}
}};
