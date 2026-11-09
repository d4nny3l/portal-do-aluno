import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker.js";
import { decryptJson, unwrapScopeKey } from "../../security/crypto/index.js";
import {
  createFixture,
  createWorkerEnv,
  localWorkerRequest,
  MemoryD1,
  repositoryFor
} from "./helpers.mjs";

function requestWithPrincipal(path,{method="GET",body,actor,hostname="127.0.0.1"}={}) {
  return localWorkerRequest(path,{method,body,actor,hostname});
}

test("Diário experimental grava só ciphertext e professor autorizado lê e calcula localmente",async()=>{
  const db=new MemoryD1();
  const fixture=await createFixture(db);
  const spy=[];
  const owner=repositoryFor({
    userId:fixture.ids.owner,tenantId:fixture.tenantA,scopeId:fixture.scopeA,
    membershipId:"membership-"+fixture.ids.owner,scopeKey:fixture.scopeKeys.key,
    permissions:["read","write","share"],db,worker,spy
  });
  for(const envelope of fixture.scopeKeys.envelopes) await owner.publishEnvelope(envelope);

  const objectId="synthetic-diary-record-001";
  const syntheticRecord={
    student_display_name:"ESTUDANTE FICTÍCIO ALFA",
    subject:"MATEMÁTICA",
    evaluations:[{name:"PROVA SINTÉTICA",score:8,maximum:10},{name:"ATIVIDADE SINTÉTICA",score:6,maximum:10}],
    attendance:{present:18,lessons:20}
  };
  await owner.save({type:"diary.student.v1",objectId,data:syntheticRecord});

  const colleagueWithoutScopeKey=repositoryFor({
    userId:fixture.ids.colleague,tenantId:fixture.tenantA,scopeId:fixture.scopeA,
    membershipId:"membership-"+fixture.ids.colleague,permissions:["read","write"],db,worker
  });
  const envelope=await colleagueWithoutScopeKey.getMyEnvelope();
  const colleagueKey=await unwrapScopeKey(envelope,fixture.identities[fixture.ids.colleague].identityKeyPair,{
    tenantId:fixture.tenantA,scopeId:fixture.scopeA,recipientId:fixture.ids.colleague,keyVersion:1
  });
  const colleague=repositoryFor({
    userId:fixture.ids.colleague,tenantId:fixture.tenantA,scopeId:fixture.scopeA,
    membershipId:"membership-"+fixture.ids.colleague,scopeKey:colleagueKey,
    permissions:["read","write"],db,worker
  });
  const opened=await colleague.load({objectId});
  const average=opened.evaluations.reduce((sum,item)=>sum+item.score,0)/opened.evaluations.length;
  assert.equal(average,7);
  assert.equal(opened.student_display_name,"ESTUDANTE FICTÍCIO ALFA");

  const stored=db.prepare("SELECT * FROM encrypted_objects WHERE object_id=?").bind(objectId).first();
  assert.ok(stored.ciphertext);
  assert.doesNotMatch(JSON.stringify(stored),/ESTUDANTE FICTÍCIO|MATEMÁTICA|PROVA SINTÉTICA|"score"/u);
  assert.ok(spy.length>=3);
  for(const call of spy) {
    assert.doesNotMatch(call.body,/ESTUDANTE FICTÍCIO|MATEMÁTICA|PROVA SINTÉTICA|privateKey|private_key/u);
    if(call.url.startsWith("/v1/objects")&&call.method==="POST") {
      const body=JSON.parse(call.body);
      assert.equal(body.protocol_version,1);
      assert.equal(body.aead,"AES-256-GCM");
      assert.equal(body.kdf,"HKDF-SHA256");
      assert.equal(Object.hasOwn(body,"student_display_name"),false);
    }
  }
  const eventRows=db.prepare("SELECT COUNT(*) AS total FROM security_events").first();
  assert.equal(Number(eventRows.total),3);
});

test("D1 experimental bloqueia tenants, escopos e grants não autorizados",async()=>{
  const db=new MemoryD1();
  const fixture=await createFixture(db);
  const deniedScope=await worker.fetch(requestWithPrincipal(
    "/v1/objects?tenant_id="+fixture.tenantA+"&scope_id="+fixture.scopeA,
    {actor:fixture.ids.noAccess}
  ),createWorkerEnv(db));
  assert.equal(deniedScope.status,403);

  const crossTenant=await worker.fetch(requestWithPrincipal(
    "/v1/objects?tenant_id="+fixture.tenantA+"&scope_id="+fixture.scopeA,
    {actor:fixture.ids.outsider}
  ),createWorkerEnv(db));
  assert.equal(crossTenant.status,403);

  db.prepare("UPDATE scope_grants SET membership_id=? WHERE tenant_id=? AND scope_id=? AND principal_id=?")
    .bind("membership-"+fixture.ids.noAccess,fixture.tenantA,fixture.scopeA,fixture.ids.owner).run();
  const mismatchedMembership=await worker.fetch(requestWithPrincipal(
    "/v1/objects?tenant_id="+fixture.tenantA+"&scope_id="+fixture.scopeA,
    {actor:fixture.ids.owner}
  ),createWorkerEnv(db));
  assert.equal(mismatchedMembership.status,403);
  db.prepare("UPDATE scope_grants SET membership_id=? WHERE tenant_id=? AND scope_id=? AND principal_id=?")
    .bind("membership-"+fixture.ids.owner,fixture.tenantA,fixture.scopeA,fixture.ids.owner).run();

  db.prepare("UPDATE tenants SET status='suspended' WHERE id=?").bind(fixture.tenantA).run();
  const suspendedTenant=await worker.fetch(requestWithPrincipal(
    "/v1/objects?tenant_id="+fixture.tenantA+"&scope_id="+fixture.scopeA,
    {actor:fixture.ids.owner}
  ),createWorkerEnv(db));
  assert.equal(suspendedTenant.status,403);
  db.prepare("UPDATE tenants SET status='active' WHERE id=?").bind(fixture.tenantA).run();

  const unauthorizedShare=await worker.fetch(requestWithPrincipal("/v1/envelopes",{
    method:"POST",
    actor:fixture.ids.colleague,
    body:fixture.scopeKeys.envelopes[0]
  }),createWorkerEnv(db));
  assert.equal(unauthorizedShare.status,403);

  const publicHost=await worker.fetch(requestWithPrincipal("/health",{actor:fixture.ids.owner,hostname:"salta-stats.example.workers.dev"}),createWorkerEnv(db));
  assert.equal(publicHost.status,404);
});

test("manipular IDs, enviar campos em plaintext e usar versão incompatível é recusado",async()=>{
  const db=new MemoryD1();
  const fixture=await createFixture(db);
  const owner=repositoryFor({
    userId:fixture.ids.owner,tenantId:fixture.tenantA,scopeId:fixture.scopeA,
    membershipId:"membership-"+fixture.ids.owner,scopeKey:fixture.scopeKeys.key,
    permissions:["read","write","share"],db,worker
  });
  const envelope=fixture.scopeKeys.envelopes[0];
  await owner.publishEnvelope(envelope);
  await owner.save({type:"diary.record.v1",objectId:"synthetic-record-003",data:{score:9}});

  const idTamper=await worker.fetch(requestWithPrincipal(
    "/v1/objects/synthetic-record-003?tenant_id="+fixture.tenantB+"&scope_id="+fixture.scopeA,
    {actor:fixture.ids.outsider}
  ),createWorkerEnv(db));
  assert.equal(idTamper.status,403);

  const plainRequest=await worker.fetch(requestWithPrincipal("/v1/objects",{
    method:"POST",actor:fixture.ids.owner,body:{
      tenant_id:fixture.tenantA,scope_id:fixture.scopeA,object_id:"synthetic-record-004",
      object_type:"diary.record.v1",protocol_version:1,key_version:1,revision:1,
      kdf:"HKDF-SHA256",aead:"AES-256-GCM",salt:"A".repeat(43),nonce:"B".repeat(16),
      ciphertext:"C".repeat(32),student_name:"ESTUDANTE FICTÍCIO"
    }
  }),createWorkerEnv(db));
  assert.equal(plainRequest.status,400);

  const versionMismatch=await worker.fetch(requestWithPrincipal("/v1/objects",{
    method:"POST",actor:fixture.ids.owner,body:{
      tenant_id:fixture.tenantA,scope_id:fixture.scopeA,object_id:"synthetic-record-005",
      object_type:"diary.record.v1",protocol_version:2,key_version:1,revision:1,
      kdf:"HKDF-SHA256",aead:"AES-256-GCM",salt:"A".repeat(43),nonce:"B".repeat(16),ciphertext:"C".repeat(32)
    }
  }),createWorkerEnv(db));
  assert.equal(versionMismatch.status,400);
});

test("updates use optimistic revisions; revocation removes envelope and blocks later reads",async()=>{
  const db=new MemoryD1();
  const fixture=await createFixture(db);
  const owner=repositoryFor({
    userId:fixture.ids.owner,tenantId:fixture.tenantA,scopeId:fixture.scopeA,
    membershipId:"membership-"+fixture.ids.owner,scopeKey:fixture.scopeKeys.key,
    permissions:["read","write","share"],db,worker
  });
  for(const envelope of fixture.scopeKeys.envelopes) await owner.publishEnvelope(envelope);
  const objectId="synthetic-record-revision";
  await owner.save({type:"diary.record.v1",objectId,data:{score:7}});
  await owner.update({type:"diary.record.v1",objectId,expectedRevision:1,data:{score:8}});
  const stale=owner.update({type:"diary.record.v1",objectId,expectedRevision:1,data:{score:4}});
  await assert.rejects(stale,error=>error.status===409);
  const row=db.prepare("SELECT revision FROM encrypted_objects WHERE object_id=?").bind(objectId).first();
  assert.equal(row.revision,2);

  const response=await worker.fetch(requestWithPrincipal("/v1/access-grants/revoke",{
    method:"POST",actor:fixture.ids.owner,
    body:{tenant_id:fixture.tenantA,scope_id:fixture.scopeA,principal_id:fixture.ids.colleague}
  }),createWorkerEnv(db));
  assert.equal(response.status,200);
  assert.equal((await response.json()).requires_key_rotation,true);
  const envelopeAfter=db.prepare("SELECT COUNT(*) AS total FROM key_envelopes WHERE recipient_id=?")
    .bind(fixture.ids.colleague).first();
  assert.equal(Number(envelopeAfter.total),0);
  const denied=await worker.fetch(requestWithPrincipal(
    "/v1/objects/"+objectId+"?tenant_id="+fixture.tenantA+"&scope_id="+fixture.scopeA,
    {actor:fixture.ids.colleague}
  ),createWorkerEnv(db));
  assert.equal(denied.status,403);
});
