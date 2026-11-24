// Server custody, NOT E2EE. Reuse the experimental envelope without changing it.
import {encryptJson} from '../assessments-lab/crypto/encryption.js';
import {decryptJson} from '../assessments-lab/crypto/decryption.js';
import {canonicalJson,fromBase64Url} from '../assessments-lab/crypto/crypto-format.js';

export function keyring(env) {
 const active = Number(env.ASSESSMENT_ACTIVE_KEY_VERSION);
 let keys; try { keys = JSON.parse(env.ASSESSMENT_KEYRING); } catch { throw Error('Key configuration unavailable'); }
 if (!Number.isSafeInteger(active) || active < 1 || !keys || typeof keys!=='object' || Array.isArray(keys) || !Object.hasOwn(keys,String(active)) || Object.entries(keys).some(([version,value])=>!(/^[1-9][0-9]*$/.test(version))||typeof value!=='string'||!(/^[A-Za-z0-9_-]{43}$/.test(value)))) throw Error('Active key unavailable');
 return {active, keys};
}
async function material(ring, version, algorithm, usages) {
 if (!Object.hasOwn(ring.keys,String(version))) throw Error('Historical key unavailable');
 const raw = fromBase64Url(ring.keys[version],32);
 if (raw.length !== 32) throw Error('Invalid key size');
 try { return await crypto.subtle.importKey('raw',raw,algorithm,false,usages); } finally { raw.fill(0); }
}
const context = record => ({tenantId:record.institutionId,scopeId:record.ownerId,objectId:record.id,type:'assessment.bundle.v1',keyVersion:record.keyVersion,revision:record.revision});
export async function seal(ring, record, definition) {
 return encryptJson(await material(ring,record.keyVersion,'HKDF',['deriveKey']),context(record),{
  schemaVersion:'salta-managed-assessment-record-v1', id:record.id, ownerId:record.ownerId,
  institutionId:record.institutionId,classId:record.classId,periodId:record.periodId,
  revision:record.revision,status:record.status,manifestHash:record.manifestHash,definition
 });
}
export async function open(ring, record, encrypted) {
 const value = await decryptJson(await material(ring,record.keyVersion,'HKDF',['deriveKey']),context(record),encrypted);
 for (const field of ['id','ownerId','institutionId','classId','periodId','revision','status','manifestHash']) if (value[field] !== record[field]) throw Error('Record binding mismatch');
 if (value.schemaVersion !== 'salta-managed-assessment-record-v1') throw Error('Unsupported record');
 return value.definition;
}
export async function operationMac(ring, version, operation) {
 const root = await material(ring,version,'HKDF',['deriveKey']);
 const key = await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new Uint8Array(32),info:new TextEncoder().encode('salta-assessment-operation-mac-v1')},root,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']);
 const signature = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(canonicalJson({purpose:'salta-assessment-operation-v1',operation})));
 return Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
