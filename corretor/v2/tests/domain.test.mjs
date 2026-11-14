import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateUniqueSaltaCode, appendHistoryEvent, assertScopePermission, createManualAdjudication, createParticipantSnapshot,
  generateSaltaCode, reviseAssessment, scoreAssessment,
  validateAssessmentRevision, validateIdentityGraph, validateSaltaCode, validateAnswerKey
} from "../index.mjs";
import { id, makeAssessment, makeKey } from "./helpers.mjs";

function identityGraph(tenantId = id("tenant1")) {
  return {
    tenant: { id: tenantId, kind: "institution", status: "active" },
    user: { id: id("teacher1"), status: "active" },
    membership: { id: id("membership1"), tenantId, userId: id("teacher1"), role: "teacher", status: "active" },
    schoolYear: { id: id("year2026"), tenantId, year: 2026 },
    student: { id: id("student1"), status: "active" },
    classroom: { id: id("class1"), tenantId, schoolYearId: id("year2026") },
    enrollment: { id: id("enrollment1"), tenantId, studentId: id("student1"), classId: id("class1"), schoolYearId: id("year2026"), status: "active" },
    scope: { id: id("scope1"), tenantId, resourceId: id("class1"), type: "class" }
  };
}

test("identidade acadêmica separa tenant, usuário, membership, aluno, matrícula, turma, ano e escopo", () => {
  const context = validateIdentityGraph(identityGraph());
  assert.equal(context.userId, id("teacher1"));
  assert.equal(context.studentId, id("student1"));
  const mixedTenant = identityGraph();
  mixedTenant.membership.tenantId = id("tenant2");
  assert.throws(() => validateIdentityGraph(mixedTenant), /Membership não pertence/u);
  const badEnrollment = identityGraph();
  badEnrollment.enrollment.classId = id("otherclass");
  assert.throws(() => validateIdentityGraph(badEnrollment), /não correspondem/u);
});

test("membership autoriza apenas tenant, escopo e grant correspondentes", () => {
  const graph = identityGraph();
  const context = { actor: { id: id("teacher1"), status: "active" }, membership: graph.membership, scope: graph.scope, grant: { tenantId: id("tenant1"), scopeId: id("scope1"), membershipId: id("membership1"), status: "active", permissions: ["read", "write"] } };
  assert.equal(assertScopePermission({ ...context, permission: "write" }), true);
  assert.throws(() => assertScopePermission({ ...context, permission: "publish" }), /negado/u);
  assert.throws(() => assertScopePermission({ ...context, scope: { ...graph.scope, tenantId: id("tenant2") }, permission: "read" }), /negado/u);
  assert.throws(() => assertScopePermission({ ...context, membership: { ...graph.membership, status: "revoked" }, permission: "read" }), /negado/u);
});

test("Código SALTA tem sete dígitos, aceita zeros à esquerda e requer CSPRNG", () => {
  assert.equal(validateSaltaCode("0000007"), "0000007");
  assert.throws(() => validateSaltaCode("123456"), /sete dígitos/u);
  assert.throws(() => validateSaltaCode("12345678"), /sete dígitos/u);
  assert.throws(() => validateSaltaCode("12A4567"), /sete dígitos/u);
  assert.equal(generateSaltaCode({ getRandomValues(bytes) { bytes.fill(0); return bytes; } }), "0000000");
  assert.throws(() => generateSaltaCode(null), /CSPRNG/u);
});

test("reserva de código repete em colisão e falha sem reutilizar código", async () => {
  const sequence = [0, 1];
  const cryptoProvider = { getRandomValues(bytes) { const value = sequence.shift() ?? 2; bytes.fill(0); bytes[2] = value; return bytes; } };
  const seen = new Set(["0000000"]);
  const reserved = await allocateUniqueSaltaCode({ cryptoProvider, claimUnique: async code => !seen.has(code) && (seen.add(code), true), maxAttempts: 3 });
  assert.equal(reserved, "0000001");
  assert.deepEqual([...seen], ["0000000", "0000001"]);
  await assert.rejects(() => allocateUniqueSaltaCode({ cryptoProvider: { getRandomValues(bytes) { bytes.fill(0); return bytes; } }, claimUnique: async () => false, maxAttempts: 2 }), /colisões/u);
});

test("avaliação versionada suporta tipos mistos, versões e 1 a 100 questões", () => {
  const assessment = makeAssessment({ count: 100, types: ["A-D", "A-E", "C-E"] });
  validateAssessmentRevision(assessment);
  assert.equal(assessment.sections.flatMap(section => section.questions).length, 100);
  assert.deepEqual(new Set(assessment.sections.map(section => section.type)), new Set(["A-D", "A-E", "C-E"]));
  assert.throws(() => makeAssessment({ count: 101 }), /1 a 100/u);
  const changed = reviseAssessment(assessment, { revisionId: id("revision2"), status: "draft", totalPoints: 20 });
  assert.equal(changed.revision, 2);
  assert.equal(changed.assessmentId, assessment.assessmentId);
  assert.equal(assessment.revision, 1);
  assert.throws(() => { assessment.status = "closed"; }, TypeError);
  assert.throws(() => validateAnswerKey({ assessment: changed, answerKey: makeKey(assessment) }), /incompatível/u);
});

test("snapshot de participantes é imutável e não aceita nome em claro", () => {
  const participants = [{ participantRef: id("personref1"), enrollmentId: id("enrollment1"), encryptedDisplay: {
    tenant_id: id("tenant1"), scope_id: id("scope1"), object_id: id("display1"), object_type: "salta.assessment.participants.v1", protocol_version: 1, key_version: 1, revision: 1, kdf: "HKDF-SHA256", aead: "AES-256-GCM", salt: "salt-synthetic", nonce: "nonce-synthetic", ciphertext: "ciphertext-fixture"
  } }];
  const snapshot = createParticipantSnapshot({ snapshotId: id("snapshot1"), assessmentId: id("assessment1"), assessmentRevision: 1, tenantId: id("tenant1"), classId: id("class1"), schoolYearId: id("year2026"), participants });
  participants[0].participantRef = id("changedref");
  assert.equal(snapshot.participants[0].participantRef, id("personref1"));
  assert.equal(Object.isFrozen(snapshot.participants[0]), true);
  assert.throws(() => createParticipantSnapshot({ snapshotId: id("snapshot2"), assessmentId: id("assessment1"), assessmentRevision: 1, tenantId: id("tenant1"), classId: id("class1"), schoolYearId: id("year2026"), participants: [{ participantRef: id("personref1"), enrollmentId: id("enrollment1"), name: "ALUNO SINTÉTICO", encryptedDisplay: participants[0].encryptedDisplay }] }), /Nome em claro/u);
});

test("regras de estado mantêm ausência fora da nota e distinguem segunda chamada", () => {
  const assessment = makeAssessment({ count: 2 });
  const key = makeKey(assessment);
  const absent = scoreAssessment({ assessment, answerKey: key, observations: [], participantStatus: "absent", publishDefinitive: true });
  assert.deepEqual({ status: absent.status, score: absent.score, eligible: absent.eligibleForBimester }, { status: "absent", score: null, eligible: false });
  const second = scoreAssessment({ assessment, answerKey: key, observations: [{ questionId: id("q1"), marks: ["A"] }, { questionId: id("q2"), marks: ["A"] }], attemptKind: "second_call", publishDefinitive: true });
  assert.equal(second.attemptKind, "second_call");
  assert.equal(second.status, "definitive");
});

test("branco, erro, dupla marcação e revisão produzem intervalo provisional", () => {
  const assessment = makeAssessment({ count: 5, weights: [2, 2, 1, 3, 2] });
  const key = makeKey(assessment, { choices: { 1: "A", 2: "A", 3: "A", 4: "A", 5: "C" } });
  const result = scoreAssessment({ assessment, answerKey: key, observations: [
    { questionId: id("q1"), marks: ["A"] },
    { questionId: id("q2"), marks: ["B"] },
    { questionId: id("q3"), marks: [] },
    { questionId: id("q4"), marks: ["A", "B"] }
  ], provisionalEnabled: true });
  assert.equal(result.status, "provisional");
  assert.equal(result.score, null);
  assert.deepEqual(result.provisionalRange, { min: 2, max: 7 });
  assert.deepEqual(result.pendingQuestionIds, [id("q4"), id("q5")]);
  assert.equal(result.eligibleForBimester, false);
  assert.throws(() => scoreAssessment({ assessment, answerKey: key, observations: [], publishDefinitive: true }), /pendentes/u);
  const hidden = scoreAssessment({ assessment, answerKey: key, observations: [] });
  assert.equal(hidden.provisionalRange, null);
});

test("decisão manual resolve revisão e só a publicação explícita define a nota", () => {
  const assessment = makeAssessment({ count: 2, weights: [1, 3] });
  const key = makeKey(assessment);
  const observations = [{ questionId: id("q1"), marks: "review", manualDecision: "A" }, { questionId: id("q2"), marks: ["B"] }];
  const preview = scoreAssessment({ assessment, answerKey: key, observations, provisionalEnabled: true });
  assert.equal(preview.status, "provisional");
  assert.deepEqual(preview.provisionalRange, { min: 2.5, max: 2.5 });
  const published = scoreAssessment({ assessment, answerKey: key, observations, publishDefinitive: true });
  assert.equal(published.status, "definitive");
  assert.equal(published.score, 2.5);
  assert.equal(published.eligibleForBimester, true);
});

test("anulação concede o peso ou remove o peso e normaliza, conforme política", () => {
  const assessment = makeAssessment({ count: 2, totalPoints: 10 });
  const awardKey = makeKey(assessment, { annulled: [1], policy: "award", choices: { 2: "A" } });
  const normalizeKey = makeKey(assessment, { annulled: [1], policy: "normalize", choices: { 2: "A" } });
  const observations = [{ questionId: id("q1"), marks: [] }, { questionId: id("q2"), marks: ["B"] }];
  const awarded = scoreAssessment({ assessment, answerKey: awardKey, observations, publishDefinitive: true });
  const normalized = scoreAssessment({ assessment, answerKey: normalizeKey, observations, publishDefinitive: true });
  assert.equal(awarded.score, 5);
  assert.equal(normalized.score, 0);
  const allAnnulled = makeKey(assessment, { annulled: [1, 2], policy: "normalize" });
  assert.equal(scoreAssessment({ assessment, answerKey: allAnnulled, observations: [], publishDefinitive: true }).score, 10);
});

test("pesos decimais arredondam de modo estável a duas casas", () => {
  const assessment = makeAssessment({ count: 3, weights: [1, 1, 1], totalPoints: 10, types: ["A-D"] });
  const result = scoreAssessment({ assessment, answerKey: makeKey(assessment), observations: [{ questionId: id("q1"), marks: ["A"] }, { questionId: id("q2"), marks: [] }, { questionId: id("q3"), marks: [] }], publishDefinitive: true });
  assert.equal(result.score, 3.33);
});

test("histórico append-only rejeita plaintext acadêmico", () => {
  const event = { eventId: id("event1"), assessmentId: id("assessment1"), actorRef: id("actor1"), revision: 2, type: "answer_key.changed", occurredAt: "2026-11-09T12:00:00.000Z" };
  const history = appendHistoryEvent([], event);
  assert.equal(Object.isFrozen(history), true);
  assert.equal(Object.isFrozen(history[0]), true);
  assert.throws(() => appendHistoryEvent([], { ...event, score: 9 }), /dados acadêmicos/u);
});

test("revisão manual é vinculada à ocorrência e à questão, sem texto livre de aluno", async () => {
  const { createCardAttempt, createCardOccurrence, createAnswerObservations } = await import("../index.mjs");
  const assessment = makeAssessment({ count: 2, types: ["A-D"] });
  const attempt = createCardAttempt({ attemptId: id("attemptreview"), assessment, participantRef: id("participant1"), attemptNumber: 1 });
  const occurrence = createCardOccurrence({ occurrenceId: id("occreview"), attempt, cardToken: id("cardreview"), templateId: assessment.template.id, templateRevision: 1, pageIndexes: [1], readerVersion: "omr-0.1" });
  const observations = createAnswerObservations({ assessment, occurrence, observations: [
    { questionId: id("q1"), marks: ["A", "B"], confidence: 0.2, state: "review" },
    { questionId: id("q2"), marks: [], confidence: 0.9 }
  ] });
  assert.equal(observations.observations[0].state, "review");
  assert.equal(observations.observations[1].state, "blank");
  const decision = createManualAdjudication({ adjudicationId: id("decision1"), assessment, attempt, occurrenceId: occurrence.occurrenceId, questionId: id("q1"), reviewerRef: id("teacher1"), selectedAnswer: "D", reasonCode: "omr_uncertain" });
  assert.equal(decision.selectedAnswer, "D");
  assert.throws(() => createManualAdjudication({ adjudicationId: id("decision2"), assessment, attempt, occurrenceId: occurrence.occurrenceId, questionId: id("q1"), reviewerRef: id("teacher1"), selectedAnswer: "E", reasonCode: "omr_uncertain" }), /incompatível/u);
});

test("confiança baixa não usa limiar OMR ainda não calibrado", async () => {
  const { createCardAttempt, createCardOccurrence, createAnswerObservations } = await import("../index.mjs");
  const assessment = makeAssessment({ count: 1, types: ["A-D"] });
  const attempt = createCardAttempt({ attemptId: id("attemptconfidence"), assessment, participantRef: assessment.participantRefs[0], attemptNumber: 1 });
  const occurrence = createCardOccurrence({ occurrenceId: id("occconfidence"), attempt, cardToken: id("cardconfidence"), templateId: assessment.template.id, templateRevision: 1, pageIndexes: [1], readerVersion: "omr-0.1" });
  const result = createAnswerObservations({ assessment, occurrence, observations: [{ questionId: id("q1"), marks: ["A"], confidence: 0.01 }] });
  assert.equal(result.observations[0].state, "read");
});
