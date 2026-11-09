import { createHash } from "node:crypto";
import { validateAssessmentRevision, appendHistoryEvent, createParticipantSnapshot } from "../domain/assessment.mjs";
import { createCardAttempt, createCardOccurrence } from "../domain/occurrence.mjs";
import { validateCiphertextEnvelope } from "../contracts/crypto-envelope.mjs";
import { authorizeDatabaseAction, revokeMembership } from "./authorization.mjs";

function transact(db, operation, beforeCommit = null) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = operation();
    if (beforeCommit) beforeCommit();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function safeJson(value) { return JSON.stringify(value); }
function hashRequest(value) { return createHash("sha256").update(value).digest("hex"); }

function authorizedAssessment(db, context, assessmentId, permission) {
  const assessment = db.prepare("SELECT id, workspace_id AS workspaceId, scope_id AS scopeId, class_ref AS classRef, school_year_ref AS schoolYearRef, current_revision AS currentRevision, status FROM assessments WHERE id=?").get(assessmentId);
  if (!assessment || assessment.workspaceId !== context.workspaceId || assessment.scopeId !== context.scopeId) throw new Error("Avaliação não encontrada no escopo autorizado.");
  authorizeDatabaseAction(db, { ...context, permission });
  return assessment;
}

function assertEncrypted(envelope, expected) {
  return safeJson(validateCiphertextEnvelope(envelope, expected));
}

function insertRevision(db, revision, createdAt) {
  const version = revision.revision;
  db.prepare(`INSERT INTO assessment_revisions(id,assessment_id,revision,period,total_points,status,double_mark_policy,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(revision.revisionId, revision.assessmentId, version, revision.period, revision.totalPoints, revision.status, revision.doubleMarkPolicy, createdAt);
  const sectionInsert = db.prepare("INSERT INTO assessment_sections(revision_id,id,section_number,question_type) VALUES (?,?,?,?)");
  const questionInsert = db.prepare("INSERT INTO assessment_questions(revision_id,section_id,id,question_number,weight) VALUES (?,?,?,?,?)");
  revision.sections.forEach((section, sectionIndex) => {
    sectionInsert.run(revision.revisionId, section.id, sectionIndex + 1, section.type);
    for (const question of section.questions) questionInsert.run(revision.revisionId, section.id, question.id, question.number, question.weight);
  });
  db.prepare("INSERT INTO card_templates(id,assessment_id,revision,question_count,layout_version) VALUES (?,?,?,?,?)")
    .run(revision.template.id, revision.assessmentId, revision.template.revision, revision.template.questionCount, revision.template.layoutVersion || "unspecified");
}

export function createAssessment(db, { context, assessment, snapshot, answerKeyEnvelope, now = () => new Date().toISOString(), beforeCommit = null }) {
  validateAssessmentRevision(assessment);
  authorizeDatabaseAction(db, { ...context, permission: "write" });
  if (assessment.revision !== 1) throw new TypeError("Uma avaliação nova deve começar na revisão 1.");
  if (assessment.tenantId !== context.workspaceId || assessment.scopeId !== context.scopeId) throw new Error("Avaliação fora do workspace ou escopo autorizado.");
  if (!snapshot || snapshot.assessmentId !== assessment.assessmentId || snapshot.assessmentRevision !== assessment.revision || snapshot.tenantId !== assessment.tenantId || snapshot.classId !== assessment.classId || !Array.isArray(snapshot.participants) || snapshot.participants.length === 0) throw new TypeError("Snapshot não corresponde à revisão da avaliação.");
  snapshot = createParticipantSnapshot(snapshot);
  const expectedParticipants = [...assessment.participantRefs].sort();
  const snapshotParticipants = snapshot.participants.map(participant => participant.participantRef).sort();
  if (expectedParticipants.length !== snapshotParticipants.length || expectedParticipants.some((participant, index) => participant !== snapshotParticipants[index])) throw new TypeError("Snapshot de participantes deve corresponder integralmente à revisão.");
  const answerEnvelope = assertEncrypted(answerKeyEnvelope, { tenant_id: context.workspaceId, scope_id: context.scopeId, object_type: "salta.assessment.key.v1", revision: assessment.revision });
  const stamp = now();
  return transact(db, () => {
    db.prepare("INSERT INTO assessments(id,workspace_id,scope_id,class_ref,school_year_ref,current_revision,status,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(assessment.assessmentId, assessment.tenantId, assessment.scopeId, assessment.classId, assessment.schoolYearId, assessment.revision, assessment.status, stamp);
    insertRevision(db, assessment, stamp);
    db.prepare("INSERT INTO participant_snapshots(id,assessment_id,assessment_revision,created_at) VALUES (?,?,?,?)")
      .run(snapshot.snapshotId, assessment.assessmentId, snapshot.assessmentRevision, snapshot.createdAt);
    const participantInsert = db.prepare("INSERT INTO snapshot_participants(snapshot_id,participant_ref,enrollment_ref,encrypted_display_json) VALUES (?,?,?,?)");
    for (const participant of snapshot.participants) {
      const display = assertEncrypted(participant.encryptedDisplay, { tenant_id: context.workspaceId, scope_id: context.scopeId, object_type: "salta.assessment.participants.v1" });
      participantInsert.run(snapshot.snapshotId, participant.participantRef, participant.enrollmentId, display);
    }
    db.prepare("INSERT INTO answer_keys(id,assessment_id,assessment_revision,revision,annulled_policy,encrypted_payload_json,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(assessment.revisionId + "_key_1", assessment.assessmentId, assessment.revision, 1, "award", answerEnvelope, stamp);
    return Object.freeze({ assessmentId: assessment.assessmentId, revision: assessment.revision, snapshotId: snapshot.snapshotId });
  }, beforeCommit);
}

export function reviseAssessment(db, { context, previous, next, expectedCurrentRevision, now = () => new Date().toISOString(), beforeCommit = null }) {
  validateAssessmentRevision(previous);
  validateAssessmentRevision(next);
  const current = authorizedAssessment(db, context, previous.assessmentId, "write");
  if (current.currentRevision !== expectedCurrentRevision || previous.revision !== expectedCurrentRevision) throw new Error("Conflito de revisão: a avaliação foi atualizada por outra gravação.");
  if (next.assessmentId !== previous.assessmentId || next.revision !== expectedCurrentRevision + 1 || next.tenantId !== previous.tenantId || next.scopeId !== previous.scopeId || next.classId !== previous.classId || next.schoolYearId !== previous.schoolYearId) throw new TypeError("A nova revisão deve preservar identidade e avançar exatamente uma versão.");
  return transact(db, () => {
    insertRevision(db, next, now());
    const update = db.prepare("UPDATE assessments SET current_revision=?,status=? WHERE id=? AND current_revision=?")
      .run(next.revision, next.status, next.assessmentId, expectedCurrentRevision);
    if (update.changes !== 1) throw new Error("Conflito de revisão: recarregue os dados antes de salvar.");
    return next.revision;
  }, beforeCommit);
}

export function saveAnswerKey(db, { context, assessmentId, assessmentRevision, keyRevision, annulledPolicy, encryptedEnvelope, now = () => new Date().toISOString() }) {
  const assessment = authorizedAssessment(db, context, assessmentId, "write");
  if (!Number.isInteger(keyRevision) || keyRevision < 1 || !["award", "normalize"].includes(annulledPolicy)) throw new TypeError("Revisão ou política de gabarito inválida.");
  if (!db.prepare("SELECT 1 AS ok FROM assessment_revisions WHERE assessment_id=? AND revision=?").get(assessmentId, assessmentRevision)) throw new Error("Revisão de avaliação inexistente.");
  const latestKey = db.prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM answer_keys WHERE assessment_id=? AND assessment_revision=?").get(assessmentId, assessmentRevision).revision;
  if (keyRevision !== latestKey + 1) throw new Error("Conflito de revisão do gabarito: use a próxima revisão disponível.");
  const payload = assertEncrypted(encryptedEnvelope, { tenant_id: context.workspaceId, scope_id: context.scopeId, object_type: "salta.assessment.key.v1", revision: keyRevision });
  const id = `${assessmentId}_r${assessmentRevision}_key${keyRevision}`;
  db.prepare("INSERT INTO answer_keys(id,assessment_id,assessment_revision,revision,annulled_policy,encrypted_payload_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, assessmentId, assessmentRevision, keyRevision, annulledPolicy, payload, now());
  return id;
}

export function createAttempt(db, { context, assessmentId, participantRef, attemptNumber, kind = "first", attemptId, now = () => new Date().toISOString() }) {
  const assessmentRow = authorizedAssessment(db, context, assessmentId, "write");
  const revision = db.prepare("SELECT r.*,a.workspace_id FROM assessment_revisions r JOIN assessments a ON a.id=r.assessment_id WHERE r.assessment_id=? AND r.revision=?").get(assessmentId, assessmentRow.currentRevision);
  const sections = db.prepare("SELECT id,question_type FROM assessment_sections WHERE revision_id=? ORDER BY section_number").all(revision.id);
  const hydrated = {
    assessmentId, revisionId: revision.id, revision: revision.revision, tenantId: revision.workspace_id, scopeId: context.scopeId,
    classId: assessmentRow.classRef, schoolYearId: assessmentRow.schoolYearRef, period: revision.period, totalPoints: revision.total_points,
    status: revision.status, doubleMarkPolicy: revision.double_mark_policy,
    sections: sections.map(section => ({ id: section.id, type: section.question_type, questions: db.prepare("SELECT id,question_number AS number,weight FROM assessment_questions WHERE revision_id=? AND section_id=? ORDER BY question_number").all(revision.id, section.id) })),
    participantRefs: db.prepare("SELECT participant_ref FROM snapshot_participants p JOIN participant_snapshots s ON s.id=p.snapshot_id WHERE s.assessment_id=? AND s.assessment_revision=? ORDER BY p.participant_ref").all(assessmentId, assessmentRow.currentRevision).map(row => row.participant_ref),
    template: db.prepare("SELECT id,revision,question_count AS questionCount,layout_version AS layoutVersion FROM card_templates WHERE assessment_id=? ORDER BY revision DESC LIMIT 1").get(assessmentId)
  };
  const attempt = createCardAttempt({ attemptId, assessment: hydrated, participantRef, attemptNumber, kind, createdAt: now() });
  db.prepare("INSERT INTO attempts(id,assessment_id,assessment_revision,participant_ref,attempt_number,kind,status,template_id,template_revision,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(attempt.attemptId, attempt.assessmentId, attempt.assessmentRevision, attempt.participantRef, attempt.attemptNumber, attempt.kind, attempt.status, attempt.templateId, attempt.templateRevision, attempt.createdAt);
  return attempt;
}

export function recordOccurrence(db, { context, attemptId, occurrenceId, cardToken, pageIndexes, readerVersion, capturedAt = new Date().toISOString() }) {
  const row = db.prepare("SELECT t.*,a.workspace_id,a.scope_id FROM attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.id=?").get(attemptId);
  if (!row || row.workspace_id !== context.workspaceId || row.scope_id !== context.scopeId) throw new Error("Tentativa fora do escopo autorizado.");
  authorizeDatabaseAction(db, { ...context, permission: "write" });
  const attempt = { attemptId: row.id, assessmentId: row.assessment_id, assessmentRevision: row.assessment_revision, participantRef: row.participant_ref, attemptNumber: row.attempt_number, kind: row.kind, templateId: row.template_id, templateRevision: row.template_revision };
  const occurrence = createCardOccurrence({ occurrenceId, attempt, cardToken, templateId: row.template_id, templateRevision: row.template_revision, pageIndexes, readerVersion, capturedAt });
  db.prepare("INSERT INTO scan_occurrences(id,attempt_id,assessment_id,card_token,template_id,template_revision,page_indexes_json,reader_version,captured_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(occurrence.occurrenceId, occurrence.attemptId, occurrence.assessmentId, occurrence.cardToken, occurrence.templateId, occurrence.templateRevision, safeJson(occurrence.pageIndexes), occurrence.readerVersion, occurrence.capturedAt);
  return occurrence;
}

export function saveEncryptedObservation(db, { context, occurrenceId, observationSetId, observationId, questionRef, revision, envelope, now = () => new Date().toISOString() }) {
  const row = db.prepare("SELECT a.workspace_id,a.scope_id FROM scan_occurrences o JOIN attempts t ON t.id=o.attempt_id JOIN assessments a ON a.id=t.assessment_id WHERE o.id=?").get(occurrenceId);
  if (!row || row.workspace_id !== context.workspaceId || row.scope_id !== context.scopeId) throw new Error("Ocorrência fora do escopo autorizado.");
  authorizeDatabaseAction(db, { ...context, permission: "write" });
  if (typeof questionRef !== "string" || questionRef.length < 8) throw new TypeError("Referência opaca da questão obrigatória.");
  const payload = assertEncrypted(envelope, { tenant_id: context.workspaceId, scope_id: context.scopeId, object_type: "salta.assessment.observation.v1", revision });
  const existingSet = db.prepare("SELECT id,occurrence_id,revision FROM answer_observation_sets WHERE id=?").get(observationSetId);
  if (existingSet && (existingSet.occurrence_id !== occurrenceId || existingSet.revision !== revision)) throw new Error("O conjunto de observações já pertence a outra ocorrência/revisão.");
  transact(db, () => {
    if (!existingSet) db.prepare("INSERT INTO answer_observation_sets(id,occurrence_id,revision,created_at) VALUES (?,?,?,?)").run(observationSetId, occurrenceId, revision, now());
    db.prepare("INSERT INTO answer_observations(id,observation_set_id,question_ref,encrypted_payload_json) VALUES (?,?,?,?)").run(observationId, observationSetId, questionRef, payload);
  });
}

export function saveManualReview(db, { context, occurrenceId, reviewId, questionRef, reviewerRef, reasonCode, envelope, now = () => new Date().toISOString() }) {
  const row = db.prepare("SELECT a.workspace_id,a.scope_id FROM scan_occurrences o JOIN attempts t ON t.id=o.attempt_id JOIN assessments a ON a.id=t.assessment_id WHERE o.id=?").get(occurrenceId);
  if (!row || row.workspace_id !== context.workspaceId || row.scope_id !== context.scopeId) throw new Error("Ocorrência fora do escopo autorizado.");
  authorizeDatabaseAction(db, { ...context, permission: "review" });
  if (!["omr_uncertain", "double_mark_confirmed", "blank_confirmed", "manual_correction", "template_review"].includes(reasonCode)) throw new TypeError("Motivo de revisão inválido.");
  const payload = assertEncrypted(envelope, { tenant_id: context.workspaceId, scope_id: context.scopeId, object_type: "salta.assessment.observation.v1" });
  db.prepare("INSERT INTO manual_reviews(id,occurrence_id,question_ref,reviewer_ref,reason_code,decision_envelope_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(reviewId, occurrenceId, questionRef, reviewerRef, reasonCode, payload, now());
}

export function saveResult(db, { context, attemptId, resultId, revision, expectedPreviousRevision, scoredResult, envelope, now = () => new Date().toISOString() }) {
  const row = db.prepare("SELECT a.workspace_id,a.scope_id FROM attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.id=?").get(attemptId);
  if (!row || row.workspace_id !== context.workspaceId || row.scope_id !== context.scopeId) throw new Error("Tentativa fora do escopo autorizado.");
  authorizeDatabaseAction(db, { ...context, permission: "publish" });
  const status = scoredResult?.status;
  const eligibleForBimester = scoredResult?.eligibleForBimester;
  if (!["absent", "provisional", "definitive"].includes(status) || eligibleForBimester !== (status === "definitive") || !Array.isArray(scoredResult.pendingQuestionIds)) throw new TypeError("Resultado de pontuação inválido.");
  if (status === "definitive" && (scoredResult.score === null || scoredResult.pendingQuestionIds.length > 0)) throw new Error("Resultado definitivo exige nota e revisão de todas as questões.");
  if (status !== "definitive" && scoredResult.score !== null) throw new Error("Resultado ausente/provisório não pode conter nota definitiva.");
  const latest = db.prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM results WHERE attempt_id=?").get(attemptId).revision;
  if (expectedPreviousRevision !== latest || revision !== latest + 1) throw new Error("Conflito de revisão do resultado: atualize antes de publicar.");
  const payload = assertEncrypted(envelope, { tenant_id: context.workspaceId, scope_id: context.scopeId, object_type: "salta.assessment.result.v1", revision });
  return transact(db, () => {
    db.prepare("INSERT INTO results(id,attempt_id,revision,status,eligible_for_bimester,encrypted_payload_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(resultId, attemptId, revision, status, eligibleForBimester ? 1 : 0, payload, now());
    db.prepare("UPDATE attempts SET status=? WHERE id=?").run(status === "absent" ? "absent" : status, attemptId);
    return resultId;
  });
}

export function appendAuditEvent(db, { context, event, now = () => new Date().toISOString() }) {
  const assessment = authorizedAssessment(db, context, event.assessmentId, "write");
  if (event.actorRef !== context.userRef) throw new Error("Ator do histórico deve corresponder à identidade autenticada no serviço.");
  const safe = appendHistoryEvent([], { ...event, occurredAt: event.occurredAt || now() })[0];
  db.prepare("INSERT INTO audit_events(id,workspace_id,assessment_id,actor_ref,revision,event_type,subject_ref,ciphertext_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(safe.eventId, assessment.workspaceId, safe.assessmentId, safe.actorRef, safe.revision, safe.type, safe.subjectRef ?? null, safe.ciphertextHash ?? null, safe.occurredAt);
  return safe.eventId;
}

export function beginIdempotentOperation(db, { context, idempotencyKey, requestHash, now = () => new Date().toISOString() }) {
  authorizeDatabaseAction(db, { ...context, permission: "write" });
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 180 || !/^[a-f0-9]{64}$/u.test(requestHash)) throw new TypeError("Chave idempotente ou hash inválido.");
  return transact(db, () => {
    const existing = db.prepare("SELECT request_hash,state,response_envelope_json FROM idempotency_operations WHERE workspace_id=? AND scope_id=? AND idempotency_key=?")
      .get(context.workspaceId, context.scopeId, idempotencyKey);
    if (existing) {
      if (existing.request_hash !== requestHash) throw new Error("Conflito idempotente: mesma chave para conteúdo diferente.");
      return Object.freeze({ created: false, state: existing.state, responseEnvelope: existing.response_envelope_json ? JSON.parse(existing.response_envelope_json) : null });
    }
    db.prepare("INSERT INTO idempotency_operations(workspace_id,scope_id,idempotency_key,request_hash,state,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?)")
      .run(context.workspaceId, context.scopeId, idempotencyKey, requestHash, now(), now());
    return Object.freeze({ created: true, state: "pending", responseEnvelope: null });
  });
}

export function completeIdempotentOperation(db, { context, idempotencyKey, requestHash, state, responseEnvelope, now = () => new Date().toISOString() }) {
  authorizeDatabaseAction(db, { ...context, permission: "write" });
  if (!["succeeded", "retryable"].includes(state)) throw new TypeError("Estado final da operação inválido.");
  const payload = responseEnvelope ? assertEncrypted(responseEnvelope, { tenant_id: context.workspaceId, scope_id: context.scopeId }) : null;
  const result = db.prepare("UPDATE idempotency_operations SET state=?,response_envelope_json=?,updated_at=? WHERE workspace_id=? AND scope_id=? AND idempotency_key=? AND request_hash=? AND state IN ('pending','retryable')")
    .run(state, payload, now(), context.workspaceId, context.scopeId, idempotencyKey, requestHash);
  if (result.changes !== 1) throw new Error("Operação idempotente inexistente, conflitante ou já concluída.");
  return true;
}

export function recordDiarySyncState(db, { context, attemptId, resultRevision, state, idempotencyKey, acknowledgedRevision = null, now = () => new Date().toISOString() }) {
  const row = db.prepare("SELECT a.workspace_id,a.scope_id FROM attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.id=?").get(attemptId);
  if (!row || row.workspace_id !== context.workspaceId || row.scope_id !== context.scopeId) throw new Error("Tentativa fora do escopo autorizado.");
  authorizeDatabaseAction(db, { ...context, permission: "write" });
  if (!["pending", "synced", "retryable"].includes(state) || (state === "synced" && acknowledgedRevision !== resultRevision)) throw new TypeError("ACK de sincronização incompatível.");
  const existing = db.prepare("SELECT state,idempotency_key,acknowledged_revision FROM diary_sync_states WHERE attempt_id=? AND result_revision=?").get(attemptId, resultRevision);
  if (existing?.idempotency_key !== undefined && existing.idempotency_key !== idempotencyKey) throw new Error("Conflito de idempotência na sincronização do Diário.");
  if (existing?.state === "synced") {
    if (state !== "synced" || acknowledgedRevision !== existing.acknowledged_revision) throw new Error("Sincronização confirmada não pode regredir ou mudar de revisão.");
    return true;
  }
  db.prepare(`INSERT INTO diary_sync_states(attempt_id,result_revision,state,idempotency_key,acknowledged_revision,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(attempt_id,result_revision) DO UPDATE SET state=excluded.state,idempotency_key=excluded.idempotency_key,acknowledged_revision=excluded.acknowledged_revision,updated_at=excluded.updated_at`)
    .run(attemptId, resultRevision, state, idempotencyKey, acknowledgedRevision, now());
  return true;
}

export function revokeMemberAccess(db, { context, membershipId }) {
  authorizeDatabaseAction(db, { ...context, permission: "manage" });
  return revokeMembership(db, { workspaceId: context.workspaceId, membershipId });
}

export { hashRequest };
