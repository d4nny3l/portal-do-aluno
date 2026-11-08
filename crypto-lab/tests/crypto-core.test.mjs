import assert from "node:assert/strict";
import test from "node:test";
import {
  createSaltaIdentity,
  createSaltaScope,
  EncryptedRepository,
  decryptJson,
  encryptJson,
  fingerprintPublicKey,
  rotateScopeRecords,
  serializeIdentityPublicKey,
  unwrapScopeKey
} from "../../security/crypto/index.js";

const context={tenantId:"tenant-crypto-test",scopeId:"scope-crypto-test",objectId:"object-crypto-001",type:"diary.student.v1",keyVersion:1,revision:1};

async function scopeWithIdentity() {
  const identity=await createSaltaIdentity({tenantId:context.tenantId,userId:"teacher-crypto-test",keyVersion:1});
  const publicBytes=await serializeIdentityPublicKey(identity.identity.publicKey);
  const fingerprint=await fingerprintPublicKey(publicBytes);
  const scope=await createSaltaScope({
    tenantId:context.tenantId,scopeId:context.scopeId,keyVersion:1,
    recipients:[{recipientId:"teacher-crypto-test",publicKey:identity.identity.publicKey,confirmedFingerprint:fingerprint}]
  });
  return {identity,scope,publicBytes,fingerprint};
}

test("AES-256-GCM cifra e abre JSON com contexto e versões corretos",async()=>{
  const {scope}=await scopeWithIdentity();
  const record={synthetic_student:"SINTÉTICO A",grades:[8.25,7.5],attendance:{present:9,total:10}};
  const encrypted=await encryptJson(scope.key,context,record);
  assert.equal(encrypted.protocol_version,1);
  assert.equal(encrypted.key_version,1);
  assert.equal((await decryptJson(scope.key,context,encrypted)).synthetic_student,"SINTÉTICO A");
  assert.equal(encrypted.nonce.length,16);
  assert.equal(encrypted.salt.length,43);
});

test("chave errada, ciphertext alterado e AAD/contexto alterado falham fechados",async()=>{
  const first=await scopeWithIdentity();
  const second=await scopeWithIdentity();
  const encrypted=await encryptJson(first.scope.key,context,{grade:9});
  await assert.rejects(decryptJson(second.scope.key,context,encrypted),/failed authentication/);
  const bytes=encrypted.ciphertext.split("");
  bytes[bytes.length-1]=bytes[bytes.length-1]==="A"?"B":"A";
  await assert.rejects(decryptJson(first.scope.key,context,{...encrypted,ciphertext:bytes.join("")}));
  await assert.rejects(decryptJson(first.scope.key,{...context,objectId:"object-other-002"},encrypted));
  await assert.rejects(decryptJson(first.scope.key,context,{...encrypted,key_version:2}),/format or version/);
});

test("cada operação gera salt e nonce novos e dados inválidos são recusados",async()=>{
  const {scope}=await scopeWithIdentity();
  const envelopes=await Promise.all(Array.from({length:64},(_,i)=>encryptJson(scope.key,{...context,objectId:"object-"+String(i).padStart(3,"0")},{score:i})));
  assert.equal(new Set(envelopes.map(item=>item.salt)).size,64);
  assert.equal(new Set(envelopes.map(item=>item.nonce)).size,64);
  await assert.rejects(encryptJson(scope.key,{...context,type:"unknown.data.v1"},{value:1}),/context/);
  await assert.rejects(encryptJson(scope.key,context,{"large":"x".repeat(1024*1024)}),/size limit/);
  await assert.rejects(encryptJson(scope.key,context,{value:undefined}),/plain JSON/);
  const circular={}; circular.self=circular;
  await assert.rejects(encryptJson(scope.key,context,circular),/circular/);
  await assert.rejects(encryptJson(scope.key,context,{value:Infinity}),/finite JSON/);
});

test("HPKE envelope é exportável como JSON e só a identidade destinatária o abre",async()=>{
  const first=await scopeWithIdentity();
  const other=await createSaltaIdentity({tenantId:context.tenantId,userId:"teacher-other-crypto",keyVersion:1});
  const envelope=JSON.parse(JSON.stringify(first.scope.envelopes[0]));
  const key=await unwrapScopeKey(envelope,first.identity.identityKeyPair,{
    tenantId:context.tenantId,scopeId:context.scopeId,recipientId:"teacher-crypto-test",keyVersion:1
  });
  assert.equal(key.extractable,false);
  const clear=await encryptJson(key,context,{ok:true});
  assert.deepEqual(await decryptJson(key,context,clear),{ok:true});
  await assert.rejects(unwrapScopeKey(envelope,other.identity.identityKeyPair,{
    tenantId:context.tenantId,scopeId:context.scopeId,recipientId:"teacher-crypto-test",keyVersion:1
  }));
  await assert.rejects(unwrapScopeKey(envelope,first.identity.identityKeyPair,{
    tenantId:context.tenantId,scopeId:context.scopeId,recipientId:"teacher-someone-else",keyVersion:1
  }),/does not match/);
});

test("fingerprint divergente não recebe compartilhamento",async()=>{
  const first=await scopeWithIdentity();
  await assert.rejects(createSaltaScope({
    tenantId:context.tenantId,scopeId:context.scopeId,keyVersion:1,
    recipients:[{recipientId:"teacher-crypto-test",publicKey:first.identity.identity.publicKey,confirmedFingerprint:"0".repeat(64)}]
  }),/fingerprint/);
});

test("endpoint remoto em HTTP ou com credenciais embutidas é recusado",async()=>{
  const args={actorId:"teacher-test-user",membershipId:"membership-test",tenantId:context.tenantId,scopeId:context.scopeId,keyVersion:1};
  assert.throws(()=>new EncryptedRepository({endpoint:"http://api.example.test",...args}),/HTTPS/);
  assert.throws(()=>new EncryptedRepository({endpoint:"https://user:secret@example.test/api",...args}),/HTTPS/);
  assert.doesNotThrow(()=>new EncryptedRepository({endpoint:"http://127.0.0.1:8788",...args}));
});

test("código de recuperação offline restaura chave privada não exportável e detecta segredo incorreto",async()=>{
  const identity=await createSaltaIdentity({tenantId:context.tenantId,userId:"teacher-recovery-test",keyVersion:1});
  assert.equal(identity.identity.privateKey.extractable,false);
  assert.equal(identity.identity.privateKeyBytes,undefined);
  const restored=await (await import("../../security/crypto/recovery.js")).recoverIdentity(
    identity.recoveryCode,identity.recoveryBundle,{tenantId:context.tenantId,userId:"teacher-recovery-test",keyVersion:1}
  );
  assert.equal(restored.privateKey.extractable,false);
  assert.deepEqual(restored.publicKeyBytes,await serializeIdentityPublicKey(identity.identity.publicKey));
  const wrong=await createSaltaIdentity({tenantId:context.tenantId,userId:"teacher-recovery-other",keyVersion:1});
  await assert.rejects((await import("../../security/crypto/recovery.js")).recoverIdentity(
    wrong.recoveryCode,identity.recoveryBundle,{tenantId:context.tenantId,userId:"teacher-recovery-test",keyVersion:1}
  ),/incorrect|damaged/);
  await assert.rejects((await import("../../security/crypto/recovery.js")).recoverIdentity(
    identity.recoveryCode,identity.recoveryBundle,{tenantId:"tenant-different",userId:"teacher-recovery-test",keyVersion:1}
  ),/does not match/);
});

test("rotação cria ciphertext novo e a versão antiga não abre o registro rotacionado",async()=>{
  const old=await scopeWithIdentity();
  const next=await createSaltaScope({
    tenantId:context.tenantId,scopeId:context.scopeId,keyVersion:2,
    recipients:[{recipientId:"teacher-crypto-test",publicKey:old.identity.identity.publicKey,confirmedFingerprint:old.fingerprint}]
  });
  const oldContext={...context,revision:1};
  const encrypted=await encryptJson(old.scope.key,oldContext,{grade:6.5,student:"SINTÉTICO"});
  const rotated=await rotateScopeRecords({
    records:[{object_id:context.objectId,object_type:context.type,revision:1,encrypted}],
    oldScopeKey:old.scope.key,newTenantKey:next.key,tenantId:context.tenantId,scopeId:context.scopeId,
    oldKeyVersion:1,newKeyVersion:2
  });
  assert.equal(rotated[0].key_version,2);
  assert.deepEqual(await decryptJson(next.key,{...context,keyVersion:2,revision:2},rotated[0]),{grade:6.5,student:"SINTÉTICO"});
  await assert.rejects(decryptJson(old.scope.key,{...context,keyVersion:2,revision:2},rotated[0]));
});
