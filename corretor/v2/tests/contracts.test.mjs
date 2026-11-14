import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  DiarySyncCoordinator, assertScopePermission, createCardAttempt, createCardOccurrence,
  createFinalDiarySyncRequest, requireCryptoCore, validateCiphertextEnvelope, validateRescan
} from "../index.mjs";
import { id, makeAssessment, makeKey, syntheticEnvelope as envelope } from "./helpers.mjs";

test("envelope aceita somente ciphertext versionado e rejeita campos acadêmicos plaintext", () => {
  const valid = envelope();
  assert.equal(validateCiphertextEnvelope(valid).object_type, "salta.diary.result.v1");
  assert.throws(() => validateCiphertextEnvelope({ ...valid, score: 9 }), /somente metadados e ciphertext/u);
  assert.throws(() => validateCiphertextEnvelope({ ...valid, object_type: "unknown.type.v1" }), /não registrado/u);
  assert.throws(() => validateCiphertextEnvelope(valid, { tenant_id: id("tenant2") }), /fora do tenant/u);
  assert.throws(() => requireCryptoCore({ encryptJson() {} }), /decryptJson/u);
  assert.equal(requireCryptoCore({ encryptJson() {}, decryptJson() {}, createSaltaScope() {}, unwrapScopeKey() {} }).encryptJson instanceof Function, true);
});

test("contrato do Diário recusa ausência e resultado provisional; não aceita notas em claro", () => {
  const base = { tenantId: id("tenant1"), scopeId: id("scope1"), assessmentId: id("assessment1"), diaryItemId: id("diaryitem1"), participantRef: id("participant1"), attempt: 1, resultRevision: 1, encryptedResult: envelope() };
  assert.throws(() => createFinalDiarySyncRequest({ ...base, resultStatus: "provisional" }), /Somente resultado definitivo/u);
  assert.throws(() => createFinalDiarySyncRequest({ ...base, resultStatus: "absent" }), /Somente resultado definitivo/u);
  const request = createFinalDiarySyncRequest({ ...base, resultStatus: "definitive" });
  assert.equal(request.idempotencyKey, `omr:${base.assessmentId}:${base.participantRef}:1:1`);
  assert.equal("score" in request, false);
  assert.equal("studentName" in request, false);
  assert.equal(request.encryptedResult.ciphertext, base.encryptedResult.ciphertext);
});

test("tentativa, ocorrência e reescaneamento mantêm assessment/template/attempt imutáveis", () => {
  const assessment = makeAssessment({ count: 2 });
  const first = createCardAttempt({ attemptId: id("attempt1"), assessment, participantRef: id("participant1"), attemptNumber: 1 });
  const original = createCardOccurrence({ occurrenceId: id("occurrence1"), attempt: first, cardToken: id("cardtoken1"), templateId: assessment.template.id, templateRevision: 1, pageIndexes: [1, 2], readerVersion: "omr-0.1" });
  const rescan = createCardOccurrence({ occurrenceId: id("occurrence2"), attempt: first, cardToken: id("cardtoken1"), templateId: assessment.template.id, templateRevision: 1, pageIndexes: [1, 2], readerVersion: "omr-0.1" });
  assert.equal(validateRescan({ original, rescan }), true);
  assert.throws(() => createCardOccurrence({ occurrenceId: id("occurrence3"), attempt: first, cardToken: id("cardtoken1"), templateId: id("othertemplate"), templateRevision: 1, pageIndexes: [1], readerVersion: "omr-0.1" }), /não corresponde/u);
  const secondAttempt = createCardAttempt({ attemptId: id("attempt2"), assessment, participantRef: id("participant1"), attemptNumber: 2, kind: "second_call" });
  const secondCall = createCardOccurrence({ occurrenceId: id("occurrence4"), attempt: secondAttempt, cardToken: id("cardtoken2"), templateId: assessment.template.id, templateRevision: 1, pageIndexes: [1], readerVersion: "omr-0.1" });
  assert.equal(validateRescan({ original, rescan: secondCall, sameAttempt: false }), true);
  assert.throws(() => createCardAttempt({ attemptId: id("badattempt"), assessment, participantRef: id("unknownparticipant"), attemptNumber: 1 }), /fora do snapshot/u);
});

test("duas instituições sintéticas não leem nem modificam ciphertext uma da outra", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE scopes(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);
    CREATE TABLE memberships(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE grants(tenant_id TEXT NOT NULL, scope_id TEXT NOT NULL, membership_id TEXT NOT NULL, status TEXT NOT NULL, permissions TEXT NOT NULL, PRIMARY KEY(tenant_id,scope_id,membership_id));
    CREATE TABLE encrypted_objects(tenant_id TEXT NOT NULL, scope_id TEXT NOT NULL, object_id TEXT NOT NULL, object_type TEXT NOT NULL, key_version INTEGER NOT NULL, revision INTEGER NOT NULL, ciphertext TEXT NOT NULL, PRIMARY KEY(tenant_id,scope_id,object_id));`);
  const tenants = [id("tenant1"), id("tenant2")];
  for (const [index, tenantId] of tenants.entries()) {
    const userId = id(`teacher${index + 1}`), membershipId = id(`membership${index + 1}`), scopeId = id(`scope${index + 1}`);
    db.prepare("INSERT INTO scopes VALUES (?,?)").run(scopeId, tenantId);
    db.prepare("INSERT INTO memberships VALUES (?,?,?,?)").run(membershipId, tenantId, userId, "active");
    db.prepare("INSERT INTO grants VALUES (?,?,?,?,?)").run(tenantId, scopeId, membershipId, "active", JSON.stringify(["read", "write"]));
  }
  function auth(userId, membershipId, tenantId, scopeId, permission) {
    const membership = db.prepare("SELECT id,tenant_id AS tenantId,user_id AS userId,status FROM memberships WHERE id=?").get(membershipId);
    const scope = db.prepare("SELECT id,tenant_id AS tenantId FROM scopes WHERE id=?").get(scopeId);
    const grant = db.prepare("SELECT tenant_id AS tenantId,scope_id AS scopeId,membership_id AS membershipId,status,permissions FROM grants WHERE tenant_id=? AND scope_id=? AND membership_id=?").get(tenantId, scopeId, membershipId);
    assert.ok(membership && scope && grant);
    grant.permissions = JSON.parse(grant.permissions);
    return assertScopePermission({ actor: { id: userId, status: "active" }, membership, scope, grant, permission });
  }
  const a = envelope({ tenantId: tenants[0], scopeId: id("scope1"), objectId: id("cipher1"), ciphertext: "c2lwaGVydGV4dC1zZW5zaXRpdm8tYQ" });
  const b = envelope({ tenantId: tenants[1], scopeId: id("scope2"), objectId: id("cipher2"), ciphertext: "c2lwaGVydGV4dC1zZW5zaXRpdm8tYg" });
  const insert = db.prepare("INSERT INTO encrypted_objects VALUES (?,?,?,?,?,?,?)");
  assert.equal(auth(id("teacher1"), id("membership1"), tenants[0], id("scope1"), "write"), true);
  insert.run(tenants[0], id("scope1"), a.object_id, a.object_type, a.key_version, a.revision, a.ciphertext);
  assert.equal(auth(id("teacher2"), id("membership2"), tenants[1], id("scope2"), "write"), true);
  insert.run(tenants[1], id("scope2"), b.object_id, b.object_type, b.key_version, b.revision, b.ciphertext);
  assert.throws(() => auth(id("teacher1"), id("membership1"), tenants[0], id("scope2"), "read"));
  assert.throws(() => auth(id("teacher2"), id("membership2"), tenants[1], id("scope1"), "write"));
  const rows = db.prepare("SELECT * FROM encrypted_objects ORDER BY tenant_id").all();
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["ciphertext", "key_version", "object_id", "object_type", "revision", "scope_id", "tenant_id"].sort());
  assert.doesNotMatch(JSON.stringify(rows), /nome|student|score|nota/u);
  db.close();
});

function createSyncFixture() {
  const assessment = makeAssessment({ count: 1 });
  const key = makeKey(assessment);
  const request = createFinalDiarySyncRequest({ tenantId: assessment.tenantId, scopeId: assessment.scopeId, assessmentId: assessment.assessmentId, diaryItemId: id("diaryitem1"), participantRef: assessment.participantRefs[0], attempt: 1, resultRevision: 1, resultStatus: "definitive", encryptedResult: envelope({ tenantId: assessment.tenantId, scopeId: assessment.scopeId }) });
  assert.ok(key);
  return request;
}

function createSyntheticDiaryTransport({ delay = 0 } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE receipts(idempotency_key TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, scope_id TEXT NOT NULL, assessment_id TEXT NOT NULL, result_revision INTEGER NOT NULL, ciphertext TEXT NOT NULL)");
  let calls = 0, failNext = false;
  return {
    db,
    get calls() { return calls; },
    failOnce() { failNext = true; },
    async writeFinalResult(request) {
      calls++;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (failNext) { failNext = false; throw new Error("synthetic connection reset"); }
      const encryptedJson = JSON.stringify(request.encryptedResult);
      const previous = db.prepare("SELECT ciphertext,result_revision FROM receipts WHERE idempotency_key=?").get(request.idempotencyKey);
      if (previous && (previous.ciphertext !== encryptedJson || previous.result_revision !== request.resultRevision)) return { persisted: false, idempotencyKey: request.idempotencyKey, revision: previous.result_revision };
      if (!previous) db.prepare("INSERT INTO receipts VALUES (?,?,?,?,?,?)").run(request.idempotencyKey, request.tenantId, request.scopeId, request.assessmentId, request.resultRevision, encryptedJson);
      return { persisted: true, idempotencyKey: request.idempotencyKey, revision: request.resultRevision };
    }
  };
}

test("sync do Diário confirma somente ACK real e retries reaproveitam a mesma chave idempotente", async () => {
  const transport = createSyntheticDiaryTransport();
  const coordinator = new DiarySyncCoordinator(transport);
  const request = createSyncFixture();
  transport.failOnce();
  const failed = await coordinator.sync(request);
  assert.equal(failed.state, "retryable");
  const retried = await coordinator.sync(request);
  assert.equal(retried.state, "synced");
  assert.equal(retried.idempotencyKey, request.idempotencyKey);
  assert.equal(transport.db.prepare("SELECT COUNT(*) AS n FROM receipts").get().n, 1);
  const columns = transport.db.prepare("PRAGMA table_info(receipts)").all().map(row => row.name);
  assert.equal(columns.includes("score"), false);
  assert.equal(columns.includes("student_name"), false);
  transport.db.close();
});

test("sync concorrente colapsa chamadas simultâneas e a persistência sintética duplica zero resultados", async () => {
  const transport = createSyntheticDiaryTransport({ delay: 10 });
  const coordinator = new DiarySyncCoordinator(transport);
  const request = createSyncFixture();
  const [a, b, c] = await Promise.all([coordinator.sync(request), coordinator.sync(request), coordinator.sync(request)]);
  assert.deepEqual([a.state, b.state, c.state], ["synced", "synced", "synced"]);
  assert.equal(transport.calls, 1);
  assert.equal(transport.db.prepare("SELECT COUNT(*) AS n FROM receipts").get().n, 1);
  transport.db.close();
});

test("mesma chave idempotente com ciphertext diferente não confirma atualização silenciosa", async () => {
  const transport = createSyntheticDiaryTransport();
  const coordinator = new DiarySyncCoordinator(transport);
  const request = createSyncFixture();
  assert.equal((await coordinator.sync(request)).state, "synced");
  const conflicting = { ...request, encryptedResult: { ...request.encryptedResult, ciphertext: "Y2lwaGVydGV4dC1kaWZlcmVudGU" } };
  assert.equal((await coordinator.sync(conflicting)).state, "retryable");
  assert.equal(transport.db.prepare("SELECT COUNT(*) AS n FROM receipts").get().n, 1);
  transport.db.close();
});
