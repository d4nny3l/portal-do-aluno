// Explicitly configured private client. The public Corretor never enables this.
// Do not put credentials, correct answers or student records in browser storage.
import {isUUID,definitionFromLocalPlan,pinnedSelection,planFromPrivateRecord} from './private-contract-adapter.mjs';

export class PrivateAssessmentError extends Error {
 constructor(message,{status=0,code='network',retryable=false}={}){
  super(message);this.name='PrivateAssessmentError';this.status=status;this.code=code;this.retryable=retryable;
 }
}
const fail=(message,code='invalid_contract')=>{throw new PrivateAssessmentError(message,{code})};
const state=error=>error?.status===401?'session':error?.status===403?'forbidden':
 error?.status===404?'missing':error?.status===409?'conflict':error?.status===429?'rate_limited':error?.status===503?'unavailable':
 error?.code==='disabled'?'unavailable':'failed';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const scopeFields=['institutionId','classId','periodId'];
const scopeEquals=(a,b)=>scopeFields.every(field=>a?.[field]===b?.[field]);
const scopeOkay=scope=>scopeFields.every(field=>typeof scope?.[field]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(scope[field]));

export function createPrivateAssessmentClient({enabled=false,baseUrl=null,fetchFn=null,uuidFn=null}={}){
 const makeId=uuidFn||(()=>crypto.randomUUID());
 // Never infer the production Stats URL or rely on published workers.
 let base=null;
 if(enabled){
  if(!baseUrl)fail('Integração privada sem rota autorizada. Serviço indisponível.','disabled');
  const url=new URL(baseUrl);
  if(!['https:','http:'].includes(url.protocol)||url.pathname!=='/assessments/v1'||
     url.search||url.hash||(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname)))
    fail('Endpoint privado não autorizado ou fora do contrato.');
  base=url;
 }
 const id=()=>{const value=makeId();if(!isUUID(value))fail('UUID v4 inválido.');return value};
 const request=async(method,path,payload,{signal}={})=>{
  if(!enabled||!base)throw new PrivateAssessmentError('Banco privado indisponível. Nenhum dado foi salvo.',{status:503,code:'disabled'});
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('://'))fail('Caminho da API inválido.');
  const url=new URL(base.href+path);
  if(url.origin!==base.origin||!url.pathname.startsWith('/assessments/v1/'))fail('Rota fora do domínio privado.');
  let response;
  try{
   const f=fetchFn||fetch;
   response=await f(url.href,{method,credentials:'include',cache:'no-store',redirect:'error',signal,
    headers:payload===undefined?{'Accept':'application/json'}:{'Accept':'application/json','Content-Type':'application/json'},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  }catch(error){
   if(error?.name==='AbortError')throw new PrivateAssessmentError('Operação cancelada; confira o estado remoto antes de continuar.',{code:'aborted',retryable:true});
   throw new PrivateAssessmentError('Sem confirmação do servidor. Reenvie a mesma operação, sem criar outra.',{code:'network',retryable:true});
  }
  let body=null;try{body=await response.json()}catch{throw new PrivateAssessmentError('Resposta do servidor inválida, operação sem confirmação.',{status:503,code:'invalid_response',retryable:true})}
  if(!response.ok)throw new PrivateAssessmentError(
   response.status===401?'Sessão SALTA expirada. Entre novamente pela SALTA.':
   response.status===403?'Acesso ou concessão revogada. Não altere o cofre.':
   response.status===404?'Avaliação, revisão ou seleção indisponível neste contexto.':
   response.status===409?'Conflito de revisão. Consulte o histórico; não sobrescreva automaticamente.':
   response.status===429?'Limite de requisições atingido. Aguarde e tente atualizar o catálogo manualmente.':
   response.status===503?'Serviço privado indisponível. Nenhuma gravação foi confirmada.':
   'Operação rejeitada pelo contrato privado.',
   {status:response.status,code:typeof body?.code==='string'?body.code:'http_error',
    retryable:[429,503].includes(response.status)});
  return {data:body,httpStatus:response.status};
 };
 const read=(path,options)=>request('GET',path,undefined,options).then(r=>r.data);
 const operation=(method,path,payload)=>Object.freeze({method,path,payload:structuredClone(payload)});
 async function confirmOperation(op){
  const result=await request(op.method,op.path,op.payload);
  if(!result.data?.ok||!isUUID(result.data?.id)||!Number.isSafeInteger(result.data?.revision))fail('Recibo incompleto.');
  return result.data;
 }
 async function saveAndVerify(op){
  const receipt=await confirmOperation(op);
  if(receipt.id!==op.path.slice('/assessments/'.length)||receipt.revision!==op.payload.expectedRevision+1)
    fail('Recibo de gravação não corresponde à solicitação.');
  const opened=await read('/assessments/'+receipt.id+'/revisions/'+receipt.revision);
  const record=opened?.record;
  if(record?.id!==receipt.id||record.revision!==receipt.revision||record.manifestHash!==receipt.manifestHash||
    record.status!==op.payload.status||!scopeEquals(record,op.payload))
    fail('Identidade, escopo ou hash do recibo e revisão recuperada divergentes. Não declarar salvo.');
  if(!same(record.definition,op.payload.definition))
    fail('Definição da revisão recuperada difere da operação. Não declarar salvo.');
  planFromPrivateRecord(record);
  return Object.freeze({receipt,record});
 }
 const scopeCheck=scope=>{if(!scopeOkay(scope))fail('Escopo da turma inválido.');return scope};
 const idCheck=value=>{if(!isUUID(value))fail('Identificador de avaliação inválido.');return value};
 return Object.freeze({
  enabled,
  newId:id,
  request,
  async session(){const data=await read('/session');if(data?.authenticated!==true||typeof data.principalId!=='string')fail('Sessão inválida.');return data},
  async grants(){const data=await read('/grants');return (data?.grants||[]).map(scopeCheck)},
  async list(after=null){if(after)idCheck(after);
   const data=await read('/assessments'+(after?'?after='+encodeURIComponent(after):''));
   if(!Array.isArray(data?.assessments)||data.assessments.length>10||
      !(data.nextCursor===null||isUUID(data.nextCursor)))fail('Página do catálogo incompatível com o limite de 10.');
   const ids=new Set();
   for(const item of data.assessments){
    if(!isUUID(item?.id)||ids.has(item.id)||after&&item.id<=after)fail('Ordenação ou identidade de catálogo inválida.');
    ids.add(item.id);
   }
   if(data.nextCursor!==null&&(!data.assessments.length||
      data.nextCursor!==data.assessments.at(-1).id))fail('Cursor de página não corresponde à última avaliação.');
   return data
  },
  async open(assessmentId,revision=null){idCheck(assessmentId);if(revision!==null&&(!Number.isInteger(revision)||revision<1))fail('Revisão inválida.');
   const data=await read('/assessments/'+assessmentId+(revision===null?'':'/revisions/'+revision));
   if(data?.record?.id!==assessmentId||(revision!==null&&data.record.revision!==revision))fail('Revisão recuperada divergente.');
   planFromPrivateRecord(data.record);return data.record},
  async history(assessmentId){idCheck(assessmentId);const data=await read('/assessments/'+assessmentId+'/revisions');if(!Array.isArray(data?.revisions))fail('Histórico inválido.');return data.revisions},
  prepareSave({plan,manifest,scope,assessmentId=null,expectedRevision=0,status='draft'}){
   scopeCheck(scope);if(!['draft','issued'].includes(status)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('Situação de revisão inválida.');
   const idValue=assessmentId?idCheck(assessmentId):id(),definition=definitionFromLocalPlan(plan,manifest);
   if(status==='issued'&&!definition.date)fail('A data é obrigatória antes de emitir.');
   return operation('PUT','/assessments/'+idValue,{requestId:id(),expectedRevision,...scope,status,definition});
  },
  saveAndVerify,
  prepareDuplicate(assessmentId,sourceRevision){
   idCheck(assessmentId);if(!Number.isSafeInteger(sourceRevision)||sourceRevision<1)fail('Revisão de origem inválida.');
   return operation('POST','/assessments/'+assessmentId+'/duplicate',{requestId:id(),newId:id(),sourceRevision});
  },
  async duplicateAndVerify(op){
   const receipt=await confirmOperation(op);
   if(receipt.id!==op.payload.newId||receipt.revision!==1)fail('Cópia não confirmada.');
   const record=await this.open(receipt.id,1);
   if(record.status!=='draft'||record.manifestHash!==receipt.manifestHash)fail('Cópia incompatível.');
   return {receipt,record};
  },
  prepareArchive(assessmentId,expectedRevision){
   idCheck(assessmentId);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)fail('Revisão inválida.');
   return operation('POST','/assessments/'+assessmentId+'/archive',{requestId:id(),expectedRevision});
  },
  async archiveAndVerify(op){
   const receipt=await confirmOperation(op);
   if(receipt.archived!==true||receipt.id!==op.path.split('/')[2]||receipt.revision!==op.payload.expectedRevision)fail('Arquivamento não confirmado.');
   const data=await read('/assessments/'+receipt.id);
   if(data.record?.archived!==true)fail('Arquivamento ainda não confirmado na consulta.');
   return {receipt,record:data.record};
  },
  prepareSelection(assessmentId,revision){
   idCheck(assessmentId);if(!Number.isSafeInteger(revision)||revision<1)fail('Revisão inválida.');
   return operation('POST','/selections',{requestId:id(),selectionId:id(),assessmentId,revision});
  },
  async selectAndVerify(op){
   const receipt=await confirmOperation(op);
   if(receipt.id!==op.payload.assessmentId||receipt.revision!==op.payload.revision||receipt.selectionId!==op.payload.selectionId)
    fail('Recibo da seleção divergente.');
   const selected=await this.resumeSelection(receipt.selectionId,{assessmentId:receipt.id,revision:receipt.revision,manifestHash:receipt.manifestHash});
   return Object.freeze({receipt,selection:selected});
  },
  async resumeSelection(selectionId,expect={}){idCheck(selectionId);
   const snapshot=await read('/selections/'+selectionId);
   return pinnedSelection(snapshot,{...expect,selectionId});
  },
  classifyError:state
 });
}
