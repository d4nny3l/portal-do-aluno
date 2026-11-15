import {unlockProtectedRepository} from './unlock.mjs';
import {createScopeKeyMaterial} from '../../../assessments-lab/crypto/key-generation.js';
import {encryptJson} from '../../../assessments-lab/crypto/encryption.js';
import {decryptJson} from '../../../assessments-lab/crypto/decryption.js';
import {canonicalJson} from '../../../assessments-lab/crypto/crypto-format.js';
import {DeviceKeyStore} from '../../../assessments-lab/crypto/device-key-store.js';
import {cryptoContext,validateBundle} from './domain.mjs';
export class AssessmentRepository {
 constructor({fetchApi=globalThis.fetch.bind(globalThis),keyStore=new DeviceKeyStore()}={}){this.fetchApi=fetchApi;this.keyStore=keyStore;this.pending=null}
 async request(path,{method='GET',data}={}){
  let r;try{r=await this.fetchApi(path,{method,credentials:'include',cache:'no-store',headers:data?{'Content-Type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})})}catch{throw Object.assign(new Error('Falha de rede. Nenhum salvamento foi confirmado. Tente reenviar a mesma operação.'),{code:'network'})}
  const result=await r.json().catch(()=>({}));if(!r.ok&&[401,403].includes(r.status))this.lock();if(!r.ok)throw Object.assign(new Error(result.error||'O servidor não confirmou a operação.'),{code:r.status});return result;
 }
 async initialize(){
  this.session=await this.request('/api/session');if(!['synthetic-only','protected-synthetic'].includes(this.session.mode))throw Error('Este adaptador exige homologação sintética isolada.');
  this.classes=(await this.request('/api/classes')).classes;
  if(this.session.mode==='protected-synthetic'){await unlockProtectedRepository(this);return this}
  const rows=await this.list();
  this.key=await this.keyStore.getKey(this.session.principalId,'scope-hkdf');
  if(!this.key){
   if(rows.length)throw Error('Chave local ausente. Este dispositivo não pode abrir as avaliações existentes; recuperação e outros dispositivos ainda não estão homologados.');
   const material=await createScopeKeyMaterial();this.key=material.key;try{await this.keyStore.saveScopeKey(this.session.principalId,this.key)}finally{material.destroy()}
  }
  return this;
 }
 lock(){this.key=null;this.pending=null;clearTimeout(this.expiryTimer);clearInterval(this.sessionTimer)}
 async guard(){
  if(this.session?.mode!=='protected-synthetic')return;
  if(!this.key||Date.now()>=this.unlockedUntil){this.lock();throw Error('O cofre expirou. Desbloqueie novamente.')}
  const current=await this.request('/api/session');
  if(current.principalId!==this.session.principalId||current.epoch!==this.session.epoch){this.lock();throw Error('A sessão ou autorização mudou. Reabra o banco.')}
 }
 async list(){return (await this.request('/api/assessments')).assessments}
 async load(id,revision=null){
  await this.guard();
  if(!/^[a-f0-9-]{36}$/i.test(id)||revision!==null&&(!Number.isSafeInteger(revision)||revision<1))throw Error('Selecione avaliação e revisão válidas.');
  const {record}=await this.request('/api/assessments/'+id+(revision?'/revisions/'+revision:''));
  if(record.id!==id||revision&&record.revision!==revision||record.ownerId!==this.session.principalId)throw Error('Recibo de avaliação incompatível.');
  let bundle;try{bundle=await decryptJson(this.key,cryptoContext(record),record.encrypted)}catch{throw Object.assign(new Error('Não foi possível autenticar ou abrir esta revisão. Confira a chave local e os dados recuperados.'),{code:'crypto'})}
  return validateBundle(bundle,record);
 }
 async save(bundle){
  await this.guard();
  const stable=structuredClone(bundle);delete stable.answerKey.updatedAt;
  const fingerprint=canonicalJson(stable);
  if(this.pending?.fingerprint!==fingerprint){
   let encrypted;try{encrypted=await encryptJson(this.key,cryptoContext(bundle),bundle)}catch{throw Error('Não foi possível cifrar a avaliação. Verifique a chave local e o limite de 1 MB para dados e logotipos.')}
   this.pending={fingerprint,id:bundle.id,revision:bundle.revision,payload:{expectedRevision:bundle.revision-1,requestId:crypto.randomUUID(),classId:bundle.classId,periodId:bundle.periodId,state:bundle.state,manifestHash:bundle.manifest.contentHash,encrypted}};
  }
  const operation=this.pending;
  const receipt=await this.request('/api/assessments/'+operation.id,{method:'PUT',data:operation.payload});
  if(receipt.ok!==true||receipt.id!==operation.id||receipt.revision!==operation.revision)throw Error('A gravação não recebeu confirmação válida.');
  // Reopen the confirmed immutable revision; never equate a local draft with a save.
  let saved;try{saved=await this.load(operation.id,operation.revision)}catch{throw Object.assign(new Error(`O servidor confirmou a revisão ${operation.revision}, mas sua recuperação não foi concluída. Reenvie a mesma operação ou reabra a avaliação.`),{code:'recovery'})}
  this.pending=null;return saved;
 }
}
