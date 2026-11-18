import { assertOpaqueId } from "./identity.mjs";
import { validateCiphertextEnvelope } from "../contracts/crypto-envelope.mjs";

const CHOICES = Object.freeze({ "A-D": ["A", "B", "C", "D"], "A-E": ["A", "B", "C", "D", "E"], "C-E": ["C", "E"] });
const OBJECT_TYPES = new Set([
  "salta.assessment.v1", "salta.assessment.participants.v1", "salta.assessment.key.v1",
  "salta.assessment.capture.v1", "salta.assessment.observation.v1", "salta.assessment.result.v1",
  "salta.diary.result.v1"
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateAssessmentRevision(revision) {
  if (!revision || typeof revision !== "object") throw new TypeError("Revisão da avaliação obrigatória.");
  assertOpaqueId(revision.assessmentId, "assessmentId");
  assertOpaqueId(revision.revisionId, "revisionId");
  assertOpaqueId(revision.tenantId, "tenantId");
  assertOpaqueId(revision.scopeId, "scopeId");
  assertOpaqueId(revision.classId, "classId");
  assertOpaqueId(revision.schoolYearId, "schoolYearId");
  if (!Number.isInteger(revision.revision) || revision.revision < 1) throw new TypeError("Versão da avaliação inválida.");
  if (!Number.isInteger(revision.period) || revision.period < 1 || revision.period > 4) throw new TypeError("Bimestre inválido.");
  if (!Number.isFinite(revision.totalPoints) || revision.totalPoints <= 0 || revision.totalPoints > 100) throw new TypeError("Pontuação total inválida.");
  if (!Array.isArray(revision.sections) || revision.sections.length === 0) throw new TypeError("A avaliação deve ter ao menos uma seção.");
  const questionIds = new Set();
  const questionNumbers = new Set();
  let count = 0;
  for (const section of revision.sections) {
    assertOpaqueId(section.id, "section.id");
    if (!Object.hasOwn(CHOICES, section.type)) throw new TypeError("Tipo de questão inválido.");
    if (!Array.isArray(section.questions) || section.questions.length === 0) throw new TypeError("Cada seção deve conter questões.");
    for (const question of section.questions) {
      if (count >= 100) throw new TypeError("A avaliação deve ter de 1 a 100 questões.");
      assertOpaqueId(question.id, "question.id");
      if (questionIds.has(question.id)) throw new TypeError("ID de questão duplicado.");
      if (!Number.isInteger(question.number) || question.number < 1 || question.number > 100 || questionNumbers.has(question.number)) throw new TypeError("Numeração de questão inválida ou duplicada.");
      if (!Number.isFinite(question.weight) || question.weight <= 0 || question.weight > 100) throw new TypeError("Peso da questão inválido.");
      questionIds.add(question.id);
      questionNumbers.add(question.number);
      count++;
    }
  }
  if (count < 1 || count > 100) throw new TypeError("A avaliação deve ter de 1 a 100 questões.");
  for (let n = 1; n <= count; n++) if (!questionNumbers.has(n)) throw new TypeError("A numeração das questões deve ser contínua de 1 até a quantidade cadastrada.");
  const template = revision.template;
  if (!template) throw new TypeError("Modelo de cartão versionado obrigatório.");
  assertOpaqueId(template.id, "template.id");
  if (!Number.isInteger(template.revision) || template.revision < 1 || template.questionCount !== count) throw new TypeError("A versão do cartão deve corresponder à avaliação.");
  if (!Array.isArray(revision.participantRefs) || revision.participantRefs.length === 0) throw new TypeError("Snapshot de participantes obrigatório.");
  const participants = new Set();
  for (const participantRef of revision.participantRefs) {
    assertOpaqueId(participantRef, "participantRef");
    if (participants.has(participantRef)) throw new TypeError("Participante duplicado no snapshot.");
    participants.add(participantRef);
  }
  if (!["draft", "published", "closed"].includes(revision.status)) throw new TypeError("Estado da avaliação inválido.");
  if (!["review", "zero"].includes(revision.doubleMarkPolicy)) throw new TypeError("Política de dupla marcação inválida.");
  return revision;
}

export function createParticipantSnapshot({ snapshotId, assessmentId, assessmentRevision, tenantId, classId, schoolYearId, participants, createdAt = new Date().toISOString() }) {
  for (const [label, value] of Object.entries({ snapshotId, assessmentId, tenantId, classId, schoolYearId })) assertOpaqueId(value, label);
  if (!Number.isInteger(assessmentRevision) || assessmentRevision < 1) throw new TypeError("Versão da avaliação inválida.");
  if (!Array.isArray(participants) || participants.length === 0) throw new TypeError("O snapshot precisa de participantes.");
  const seen = new Set();
  const safeParticipants = participants.map(participant => {
    assertOpaqueId(participant.participantRef, "participantRef");
    assertOpaqueId(participant.enrollmentId, "enrollmentId");
    if (seen.has(participant.participantRef)) throw new TypeError("Participante duplicado no snapshot.");
    seen.add(participant.participantRef);
    const encryptedDisplay = validateCiphertextEnvelope(participant.encryptedDisplay, { tenant_id: tenantId, object_type: "salta.assessment.participants.v1" });
    if ("name" in participant || "studentName" in participant) throw new TypeError("Nome em claro não pode ser incluído no snapshot persistível.");
    return { participantRef: participant.participantRef, enrollmentId: participant.enrollmentId, encryptedDisplay: { ...encryptedDisplay } };
  });
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Data do snapshot inválida.");
  return deepFreeze({ snapshotId, assessmentId, assessmentRevision, tenantId, classId, schoolYearId, createdAt: date.toISOString(), participants: safeParticipants });
}

export function createAssessmentRevision(input) {
  const next = structuredClone(input);
  validateAssessmentRevision(next);
  return deepFreeze(next);
}

export function reviseAssessment(previous, changes) {
  validateAssessmentRevision(previous);
  const next = structuredClone({ ...previous, ...changes, assessmentId: previous.assessmentId, tenantId: previous.tenantId, scopeId: previous.scopeId, classId: previous.classId, schoolYearId: previous.schoolYearId, revision: previous.revision + 1, revisionId: changes.revisionId });
  validateAssessmentRevision(next);
  return deepFreeze(next);
}

export function validateAnswerKey({ assessment, answerKey }) {
  validateAssessmentRevision(assessment);
  if (!answerKey || answerKey.assessmentId !== assessment.assessmentId || answerKey.assessmentRevision !== assessment.revision) throw new TypeError("Gabarito incompatível com a versão da avaliação.");
  assertOpaqueId(answerKey.revisionId, "answerKey.revisionId");
  if (!Number.isInteger(answerKey.revision) || answerKey.revision < 1) throw new TypeError("Versão do gabarito inválida.");
  if (!["award", "normalize"].includes(answerKey.annulledPolicy)) throw new TypeError("Regra de questão anulada inválida.");
  const questions = assessment.sections.flatMap(section => section.questions.map(question => ({ question, choices: CHOICES[section.type] })));
  const byId = new Map(questions.map(entry => [entry.question.id, entry]));
  if (!answerKey.answers || typeof answerKey.answers !== "object") throw new TypeError("Respostas do gabarito obrigatórias.");
  for (const { question, choices } of questions) {
    const value = answerKey.answers[question.id];
    if (value === "annulled") continue;
    if (!choices.includes(value)) throw new TypeError(`Resposta incompatível na questão ${question.number}.`);
  }
  for (const id of Object.keys(answerKey.answers)) if (!byId.has(id)) throw new TypeError("O gabarito contém questão fora da versão da prova.");
  return answerKey;
}

export function appendHistoryEvent(history, event) {
  if (!Array.isArray(history) || !event || typeof event !== "object") throw new TypeError("Histórico inválido.");
  for (const key of ["eventId", "assessmentId", "actorRef"]) assertOpaqueId(event[key], key);
  const allowedKeys = new Set(["eventId", "assessmentId", "actorRef", "revision", "type", "occurredAt", "subjectRef", "previousRevision", "ciphertextHash"]);
  if (Object.keys(event).some(key => !allowedKeys.has(key))) throw new TypeError("Histórico aceita apenas metadados allowlistados, sem dados acadêmicos em claro.");
  if (!Number.isInteger(event.revision) || event.revision < 1 || typeof event.type !== "string" || !/^(assessment\.(created|revised|closed)|participants\.snapshot\.created|answer_key\.(changed|published)|card\.rescanned|attempt\.(created|absent)|result\.(reviewed|published)|diary\.sync\.(confirmed|retry))$/u.test(event.type)) throw new TypeError("Evento de histórico inválido.");
  if (event.subjectRef !== undefined) assertOpaqueId(event.subjectRef, "subjectRef");
  if (event.previousRevision !== undefined && (!Number.isInteger(event.previousRevision) || event.previousRevision < 1)) throw new TypeError("Revisão anterior inválida.");
  if (event.ciphertextHash !== undefined && !/^[A-Fa-f0-9]{64}$/u.test(event.ciphertextHash)) throw new TypeError("Hash de ciphertext inválido.");
  const next = deepFreeze({ ...event, occurredAt: new Date(event.occurredAt || Date.now()).toISOString() });
  return Object.freeze([...history, next]);
}

export const assessmentObjectTypes = Object.freeze([...OBJECT_TYPES]);
