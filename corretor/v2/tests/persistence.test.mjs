import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { reviseAssessment as makeNextRevision } from "../domain/assessment.mjs";
import { scoreAssessment } from "../domain/scoring.mjs";
import {
  appendAuditEvent, beginIdempotentOperation, completeIdempotentOperation, createAssessment, findCodeClaim,
  createAttempt, hashRequest, migrateDown, migrateUp, openLocalDatabase, recordDiarySyncState,
  recordOccurrence, reserveSaltaCode, reviseAssessment, revokeMemberAccess, saveAnswerKey,
  saveEncryptedObservation, saveManualReview, saveResult
} from "../persistence/index.mjs";
import { id, makeKey, syntheticEnvelope } from "./helpers.mjs";
import { contextA, createDatabase, makePersistableAssessment, provisionWorkspace, scopeA, teacherA, workspaceA } from "./persistence-support.mjs";

test("SQLite local inicializa vazio, aplica migration uma vez, faz down e up reversíveis", async () => {
  const db = openLocalDatabase(":memory:");
  const up = await migrateUp(db);
  assert.deepEqual(up.map(row => row.version), ["0001"]);
  assert.deepEqual((await migrateUp(db)).map(row => row.version), ["0001"]);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(await migrateDown(db), "0001");
  const remaining = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
  assert.deepEqual(remaining, ["schema_migrations"]);
  assert.deepEqual((await migrateUp(db)).map(row => row.version), ["0001"]);
  db.close();
});

test("integridade referencial rejeita grant que cruza workspace", async () => {
  const db = await createDatabase();
  const otherWorkspace = id("tenant2");
  provisionWorkspace(db, { workspaceId: otherWorkspace, scopeId: id("scope2"), teacher: id("teacher2"), membershipId: id("member2") });
  assert.throws(() => db.prepare("INSERT INTO scope_grants(id,workspace_id,scope_id,membership_id,status,permissions_json) VALUES (?,?,?,?,'active','[\"read\"]')")
    .run(id("crossgrant1"), workspaceA, id("scope2"), id("member2")), /FOREIGN KEY/u);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("avaliação persiste revisão, snapshot, template e gabarito somente como envelope", async () => {
  const db = await createDatabase();
  const { assessment, snapshot, answerKeyEnvelope } = makePersistableAssessment();
  createAssessment(db, { context: contextA, assessment, snapshot, answerKeyEnvelope });
  const answerKey = db.prepare("SELECT * FROM answer_keys").get();
  const participants = db.prepare("SELECT * FROM snapshot_participants").all();
  const questions = db.prepare("SELECT * FROM assessment_questions ORDER BY question_number").all();
  assert.equal(answerKey.annulled_policy, "award");
  assert.match(answerKey.encrypted_payload_json, /ciphertext-key-fixture/u);
  assert.equal(participants.length, 2);
  assert.match(participants[0].encrypted_display_json, /ciphertext-display-fixture/u);
  assert.throws(() => db.prepare("UPDATE snapshot_participants SET enrollment_ref=?").run(id("different_enrollment")), /append-only/u);
  assert.equal(questions.length, 3);
  const allRows = JSON.stringify({ answerKey, participants, questions });
  assert.doesNotMatch(allRows, /KAMILA|studentName|"answers"|"score"|"nota"/iu);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("snapshot e versões de avaliação/gabarito são append-only com revisão otimista", async () => {
  const db = await createDatabase();
  const { assessment, snapshot, answerKeyEnvelope } = makePersistableAssessment();
  createAssessment(db, { context: contextA, assessment, snapshot, answerKeyEnvelope });
  saveAnswerKey(db, { context: contextA, assessmentId: assessment.assessmentId, assessmentRevision: 1, keyRevision: 2, annulledPolicy: "normalize", encryptedEnvelope: syntheticEnvelope({ tenantId: workspaceA, scopeId: scopeA, objectId: id("keypayload2"), objectType: "salta.assessment.key.v1", revision: 2, ciphertext: "ciphertext-key-version-2" }) });
  const next = makeNextRevision(assessment, { revisionId: id("assessmentrev2"), status: "draft", totalPoints: 12, template: { ...assessment.template, revision: 2 } });
  assert.equal(reviseAssessment(db, { context: contextA, previous: assessment, next, expectedCurrentRevision: 1 }), 2);
  assert.throws(() => reviseAssessment(db, { context: contextA, previous: assessment, next: makeNextRevision(assessment, { revisionId: id("assessmentrev2b"), status: "draft" }), expectedCurrentRevision: 1 }), /Conflito de revisão/u);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assessment_revisions").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM card_templates").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM answer_keys").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM snapshot_participants").get().n, 2);
  db.close();
});

test("revisão interrompida faz rollback sem deixar versão ou pointer parcial", async () => {
  const db = await createDatabase();
  const { assessment, snapshot, answerKeyEnvelope } = makePersistableAssessment();
  createAssessment(db, { context: contextA, assessment, snapshot, answerKeyEnvelope });
  const next = makeNextRevision(assessment, { revisionId: id("rollbackrev2"), status: "draft", template: { ...assessment.template, revision: 2 } });
  assert.throws(() => reviseAssessment(db, { context: contextA, previous: assessment, next, expectedCurrentRevision: 1, beforeCommit() { throw new Error("synthetic interruption"); } }), /synthetic interruption/u);
  assert.equal(db.prepare("SELECT current_revision FROM assessments WHERE id=?").get(assessment.assessmentId).current_revision, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assessment_revisions").get().n, 1);
  db.close();
});

test("processo encerrado antes do commit reabre SQLite sem operação parcial", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "salta-omr-interrupt-"));
  const filename = path.join(temporary, "synthetic.sqlite");
  const initial = openLocalDatabase(filename);
  await migrateUp(initial);
  provisionWorkspace(initial);
  initial.close();
  const worker = new Worker(new URL("./interruption-worker.mjs", import.meta.url), { workerData: { filename, context: contextA, idempotencyKey: "interrupted-operation", requestHash: hashRequest("synthetic interrupted request") } });
  await new Promise((resolve, reject) => {
    worker.once("message", message => message.open ? resolve() : reject(new Error(message.error)));
    worker.once("error", reject);
  });
  await worker.terminate();
  const recovered = openLocalDatabase(filename);
  assert.equal(recovered.prepare("SELECT COUNT(*) AS n FROM idempotency_operations WHERE idempotency_key='interrupted-operation'").get().n, 0);
  const retry = beginIdempotentOperation(recovered, { context: contextA, idempotencyKey: "interrupted-operation", requestHash: hashRequest("synthetic interrupted request") });
  assert.equal(retry.created, true);
  recovered.close();
  await rm(temporary, { recursive: true, force: true });
});

test("tenant e permissão impedem leitura/gravação cruzada; revogação bloqueia chamadas futuras", async () => {
  const db = await createDatabase();
  const { assessment, snapshot, answerKeyEnvelope } = makePersistableAssessment();
  createAssessment(db, { context: contextA, assessment, snapshot, answerKeyEnvelope });
  const workspaceB = id("tenant2"), scopeB = id("scope2"), teacherB = id("teacher2");
  provisionWorkspace(db, { workspaceId: workspaceB, scopeId: scopeB, teacher: teacherB, membershipId: id("membership2"), permissions: ["read"] });
  const contextB = { workspaceId: workspaceB, scopeId: scopeB, userRef: teacherB };
  assert.throws(() => createAttempt(db, { context: contextB, assessmentId: assessment.assessmentId, participantRef: assessment.participantRefs[0], attemptNumber: 1, attemptId: id("crossattempt1") }), /não encontrada no escopo/u);
  assert.throws(() => createAttempt(db, { context: contextB, assessmentId: assessment.assessmentId, participantRef: assessment.participantRefs[0], attemptNumber: 1, attemptId: id("crossattempt2") }), /não encontrada no escopo/u);
  assert.throws(() => createAttempt(db, { context: { ...contextA, userRef: teacherB }, assessmentId: assessment.assessmentId, participantRef: assessment.participantRefs[0], attemptNumber: 1, attemptId: id("unauthattempt1") }), /Acesso negado/u);
  assert.equal(revokeMemberAccess(db, { context: contextA, membershipId: id("membership1") }), true);
  assert.throws(() => createAttempt(db, { context: contextA, assessmentId: assessment.assessmentId, participantRef: assessment.participantRefs[0], attemptNumber: 1, attemptId: id("revokedattempt1") }), /Acesso negado/u);
  db.close();
});

test("tentativa, reescaneamento, observações e revisão manual preservam ocorrências distintas e ciphertext", async () => {
  const db = await createDatabase();
  const { assessment, snapshot, answerKeyEnvelope } = makePersistableAssessment();
  createAssessment(db, { context: contextA, assessment, snapshot, answerKeyEnvelope });
  const attempt = createAttempt(db, { context: contextA, assessmentId: assessment.assessmentId, participantRef: assessment.participantRefs[0], attemptNumber: 1, attemptId: id("attempt1") });
  const occurrence1 = recordOccurrence(db, { context: contextA, attemptId: attempt.attemptId, occurrenceId: id("occurrence1"), cardToken: id("cardtoken1"), pageIndexes: [1], readerVersion: "omr-0.1" });
  const occurrence2 = recordOccurrence(db, { context: contextA, attemptId: attempt.attemptId, occurrenceId: id("occurrence2"), cardToken: id("cardtoken1"), pageIndexes: [1], readerVersion: "omr-0.1" });
  assert.notEqual(occurrence1.occurrenceId, occurrence2.occurrenceId);
  const observation = syntheticEnvelope({ tenantId: workspaceA, scopeId: scopeA, objectId: id("observation1"), objectType: "salta.assessment.observation.v1", ciphertext: "ciphertext-observation-fixture" });
  saveEncryptedObservation(db, { context: contextA, occurrenceId: occurrence1.occurrenceId, observationSetId: id("observationset1"), observationId: id("observationitem1"), questionRef: id("question1"), revision: 1, envelope: observation });
  saveEncryptedObservation(db, { context: contextA, occurrenceId: occurrence1.occurrenceId, observationSetId: id("observationset1"), observationId: id("observationitem2"), questionRef: id("question2"), revision: 1, envelope: syntheticEnvelope({ tenantId: workspaceA, scopeId: scopeA, objectId: id("observation2"), objectType: "salta.assessment.observation.v1", ciphertext: "ciphertext-observation-fixture-2" }) });
  saveManualReview(db, { context: contextA, occurrenceId: occurrence1.occurrenceId, reviewId: id("manualreview1"), questionRef: id("question1"), reviewerRef: teacherA, reasonCode: "omr_uncertain", envelope: observation });
  const records = JSON.stringify(db.prepare("SELECT encrypted_payload_json FROM answer_observations UNION ALL SELECT decision_envelope_json FROM manual_reviews").all());
  assert.match(records, /ciphertext-observation-fixture/u);
  assert.match(records, /ciphertext-observation-fixture-2/u);
  assert.doesNotMatch(records, /"answer"\s*:/u);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM answer_observations WHERE observation_set_id=?").get(id("observationset1")).n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM scan_occurrences").get().n, 2);
  db.close();
});

test("provisório nunca é elegível; resultado definitivo e ACK de sync exigem estado/revisão explícitos", async () => {
  const db = await createDatabase();
  const { assessment, snapshot, answerKeyEnvelope } = makePersistableAssessment();
  createAssessment(db, { context: contextA, assessment, snapshot, answerKeyEnvelope });
  const attempt = createAttempt(db, { context: contextA, assessmentId: assessment.assessmentId, participantRef: assessment.participantRefs[0], attemptNumber: 1, attemptId: id("attemptresult1") });
  const provisional = syntheticEnvelope({ tenantId: workspaceA, scopeId: scopeA, objectId: id("resultpayload1"), objectType: "salta.assessment.result.v1", ciphertext: "ciphertext-provisional" });
  const answerKey = makeKey(assessment);
  const provisionalScore = scoreAssessment({ assessment, answerKey, observations: [{ questionId: id("q1"), marks: ["A"] }], provisionalEnabled: true });
  assert.throws(() => saveResult(db, { context: contextA, attemptId: attempt.attemptId, resultId: id("resultbad1"), revision: 1, expectedPreviousRevision: 0, scoredResult: { ...provisionalScore, eligibleForBimester: true }, envelope: provisional }), /Resultado de pontuação/u);
  saveResult(db, { context: contextA, attemptId: attempt.attemptId, resultId: id("resultprovisional1"), revision: 1, expectedPreviousRevision: 0, scoredResult: provisionalScore, envelope: provisional });
  assert.equal(db.prepare("SELECT eligible_for_bimester FROM results WHERE id=?").get(id("resultprovisional1")).eligible_for_bimester, 0);
  const finalEnvelope = syntheticEnvelope({ tenantId: workspaceA, scopeId: scopeA, objectId: id("resultpayload2"), objectType: "salta.assessment.result.v1", revision: 2, ciphertext: "ciphertext-definitive" });
  const definitiveScore = scoreAssessment({ assessment, answerKey, observations: assessment.sections.flatMap(section => section.questions.map(question => ({ questionId: question.id, marks: [section.type === "C-E" ? "C" : "A"] }))), publishDefinitive: true });
  assert.throws(() => saveResult(db, { context: contextA, attemptId: attempt.attemptId, resultId: id("resultstale1"), revision: 2, expectedPreviousRevision: 0, scoredResult: definitiveScore, envelope: finalEnvelope }), /Conflito de revisão/u);
  saveResult(db, { context: contextA, attemptId: attempt.attemptId, resultId: id("resultdefinitive1"), revision: 2, expectedPreviousRevision: 1, scoredResult: definitiveScore, envelope: finalEnvelope });
  assert.throws(() => recordDiarySyncState(db, { context: contextA, attemptId: attempt.attemptId, resultRevision: 2, state: "synced", idempotencyKey: "diary-sync-key-2", acknowledgedRevision: 1 }), /ACK/u);
  recordDiarySyncState(db, { context: contextA, attemptId: attempt.attemptId, resultRevision: 2, state: "synced", idempotencyKey: "diary-sync-key-2", acknowledgedRevision: 2 });
  assert.throws(() => recordDiarySyncState(db, { context: contextA, attemptId: attempt.attemptId, resultRevision: 2, state: "retryable", idempotencyKey: "diary-sync-key-2" }), /não pode regredir/u);
  assert.equal(db.prepare("SELECT state FROM diary_sync_states WHERE attempt_id=? AND result_revision=2").get(attempt.attemptId).state, "synced");
  db.close();
});

test("eventos de auditoria são append-only e recusam plaintext/ator adulterado", async () => {
  const db = await createDatabase();
  const { assessment, snapshot, answerKeyEnvelope } = makePersistableAssessment();
  createAssessment(db, { context: contextA, assessment, snapshot, answerKeyEnvelope });
  const event = { eventId: id("event1"), assessmentId: assessment.assessmentId, actorRef: teacherA, revision: 1, type: "result.published", occurredAt: "2026-11-09T12:00:00.000Z" };
  appendAuditEvent(db, { context: contextA, event });
  assert.throws(() => db.prepare("UPDATE audit_events SET event_type='changed' WHERE id=?").run(event.eventId), /append-only/u);
  assert.throws(() => appendAuditEvent(db, { context: contextA, event: { ...event, eventId: id("event2"), score: 10 } }), /dados acadêmicos/u);
  assert.throws(() => appendAuditEvent(db, { context: contextA, event: { ...event, eventId: id("event3"), actorRef: id("teacher2") } }), /Ator do histórico/u);
  db.close();
});

test("idempotência sobrevive a nova conexão, aceita repetição igual e barra payload diferente", async () => {
  const db = await createDatabase();
  const rawRequest = "synthetic-request-with-no-student-data";
  const requestHash = hashRequest(rawRequest);
  const first = beginIdempotentOperation(db, { context: contextA, idempotencyKey: "request-key-0001", requestHash });
  assert.equal(first.created, true);
  completeIdempotentOperation(db, { context: contextA, idempotencyKey: "request-key-0001", requestHash, state: "succeeded", responseEnvelope: syntheticEnvelope({ tenantId: workspaceA, scopeId: scopeA, objectId: id("receipt1"), objectType: "salta.diary.result.v1" }) });
  const repeated = beginIdempotentOperation(db, { context: contextA, idempotencyKey: "request-key-0001", requestHash });
  assert.equal(repeated.created, false);
  assert.equal(repeated.state, "succeeded");
  assert.throws(() => beginIdempotentOperation(db, { context: contextA, idempotencyKey: "request-key-0001", requestHash: hashRequest("different request") }), /Conflito idempotente/u);
  const rows = db.prepare("SELECT * FROM idempotency_operations").all();
  assert.doesNotMatch(JSON.stringify(rows), /synthetic-request|student|score|nota/u);
  db.close();
});

test("operações simultâneas em workers SQLite compartilham uma única chave persistente", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "salta-omr-persist-") );
  const filename = path.join(temporary, "synthetic.sqlite");
  const db = openLocalDatabase(filename);
  await migrateUp(db);
  provisionWorkspace(db);
  db.close();
  const workerData = { filename, context: contextA, idempotencyKey: "parallel-request-01", requestHash: hashRequest("synthetic parallel body") };
  const results = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./idempotency-worker.mjs", import.meta.url), { workerData });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", code => { if (code !== 0) reject(new Error(`Worker saiu com ${code}`)); });
  })));
  const resultDb = openLocalDatabase(filename);
  assert.ok(results.every(result => result.ok));
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(resultDb.prepare("SELECT COUNT(*) AS n FROM idempotency_operations").get().n, 1);
  resultDb.close();
  await rm(temporary, { recursive: true, force: true });
});

test("reserva Código SALTA trata colisão, guarda HMAC/ciphertext sem tenant ou código e exige autorização", async () => {
  const db = await createDatabase();
  const workspaceB = id("tenant2"), scopeB = id("scope2");
  provisionWorkspace(db, { workspaceId: workspaceB, scopeId: scopeB, teacher: id("teacher2"), membershipId: id("membership2") });
  const pepperKey = new Uint8Array(32).fill(7);
  const sequence = ["0000042", "0000042", "0000043"];
  const sealClaim = async ({ workspaceId, scopeId }) => syntheticEnvelope({ tenantId: workspaceId, scopeId, objectId: id("claimpayload1"), objectType: "salta.identity.code-claim.v1", ciphertext: "opaque-encrypted-claim-ciphertext" });
  const first = await reserveSaltaCode({ db, workspaceId: workspaceA, scopeId: scopeA, participantRef: id("person1"), pepperKey, sealClaim, authorizeReservation: async () => true, generateCode: () => sequence.shift(), maxAttempts: 3 });
  const second = await reserveSaltaCode({ db, workspaceId: workspaceB, scopeId: scopeB, participantRef: id("person2"), pepperKey, sealClaim, authorizeReservation: async () => true, generateCode: () => sequence.shift(), maxAttempts: 3 });
  assert.equal(first.code, "0000042");
  assert.equal(second.code, "0000043");
  assert.equal(second.attempts, 2);
  const concurrentCandidates = ["0001000", "0001000", "0001001"];
  const [concurrentA, concurrentB] = await Promise.all(["person3", "person4"].map(person => reserveSaltaCode({
    db, workspaceId: workspaceA, scopeId: scopeA, participantRef: id(person), pepperKey, sealClaim,
    authorizeReservation: async () => true, generateCode: () => concurrentCandidates.shift(), maxAttempts: 3
  })));
  assert.notEqual(concurrentA.code, concurrentB.code);
  const stored = JSON.stringify(db.prepare("SELECT * FROM salta_code_claims").all());
  assert.doesNotMatch(stored, /0000042|0000043|0001000|0001001|workspace|tenant|participant/u);
  assert.match(stored, /opaque-encrypted-claim/u);
  await assert.rejects(() => findCodeClaim(db, { code: first.code, pepperKey, workspaceId: workspaceA, scopeId: scopeA, openClaim: async () => null }), /Acesso negado/u);
  await assert.rejects(() => reserveSaltaCode({ db, workspaceId: workspaceA, scopeId: scopeA, participantRef: id("person3"), pepperKey, sealClaim, generateCode: () => "0000044", maxAttempts: 1 }), /Acesso negado/u);
  await assert.rejects(() => reserveSaltaCode({ db, workspaceId: workspaceA, scopeId: scopeA, participantRef: id("person3"), pepperKey, generateCode: () => "0000044" }), /adapter criptográfico/u);
  db.close();
});

test("adapter delega ao Crypto Core e rejeita envelope/contexto inválido antes da decifragem", async () => {
  const { createCryptoCoreAdapter } = await import("../persistence/crypto-adapter.mjs");
  let decryptCalls = 0;
  const core = {
    encryptJson: async () => ({ protocol_version: 1, key_version: 1, revision: 1, kdf: "HKDF-SHA256", aead: "AES-256-GCM", salt: "synthetic-salt", nonce: "synthetic-nonce", ciphertext: "opaque-ciphertext" }),
    decryptJson: async (_key, _context, encrypted) => { decryptCalls++; return encrypted; },
    createSaltaScope() {}, unwrapScopeKey() {}
  };
  const adapter = createCryptoCoreAdapter(core);
  const context = { tenant_id: workspaceA, scope_id: scopeA, object_id: id("adapterobject"), object_type: "salta.assessment.result.v1", key_version: 1, revision: 1 };
  const envelope = await adapter.seal({}, context, { score: "synthetic" });
  assert.equal((await adapter.open({}, context, envelope)).ciphertext, "opaque-ciphertext");
  assert.equal(decryptCalls, 1);
  await assert.rejects(() => adapter.open({}, { ...context, tenant_id: id("tenant2") }, envelope), /fora do tenant/u);
  await assert.rejects(() => adapter.open({}, context, { ...envelope, ciphertext: undefined }), /Campo cifrado inválido/u);
  assert.equal(decryptCalls, 1);
});

test("reserva de Código SALTA falha fechado ao esgotar colisões", async () => {
  const db = await createDatabase();
  const pepperKey = new Uint8Array(32).fill(8);
  const sealClaim = async ({ workspaceId, scopeId }) => syntheticEnvelope({ tenantId: workspaceId, scopeId, objectId: id("claimduplicate"), objectType: "salta.identity.code-claim.v1", ciphertext: "opaque-claim-ciphertext" });
  const options = { db, workspaceId: workspaceA, scopeId: scopeA, participantRef: id("person1"), pepperKey, sealClaim, authorizeReservation: async () => true, generateCode: () => "0000001", maxAttempts: 2 };
  await reserveSaltaCode(options);
  await assert.rejects(() => reserveSaltaCode(options), /várias colisões/u);
  db.close();
});
