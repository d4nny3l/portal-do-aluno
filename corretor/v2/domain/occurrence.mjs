import { assertOpaqueId } from "./identity.mjs";
import { validateAssessmentRevision } from "./assessment.mjs";

export function createCardAttempt({ attemptId, assessment, participantRef, attemptNumber, kind = "first", status = "in_progress", createdAt = new Date().toISOString() }) {
  validateAssessmentRevision(assessment);
  assertOpaqueId(attemptId, "attemptId");
  assertOpaqueId(participantRef, "participantRef");
  if (!assessment.participantRefs.includes(participantRef)) throw new Error("Participante fora do snapshot desta avaliação.");
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new TypeError("Número da tentativa inválido.");
  if (!(["first", "second_call"].includes(kind)) || !(["in_progress", "needs_review", "provisional", "definitive", "absent"].includes(status))) throw new TypeError("Tentativa ou estado inválido.");
  if ((kind === "first" && attemptNumber !== 1) || (kind === "second_call" && attemptNumber < 2)) throw new TypeError("A segunda chamada deve ser uma tentativa distinta da primeira.");
  const time = new Date(createdAt);
  if (!Number.isFinite(time.getTime())) throw new TypeError("Data da tentativa inválida.");
  return Object.freeze({ attemptId, assessmentId: assessment.assessmentId, assessmentRevision: assessment.revision, participantRef, attemptNumber, kind, status, templateId: assessment.template.id, templateRevision: assessment.template.revision, createdAt: time.toISOString() });
}

export function createCardOccurrence({ occurrenceId, attempt, cardToken, templateId, templateRevision, pageIndexes, capturedAt = new Date().toISOString(), readerVersion }) {
  assertOpaqueId(occurrenceId, "occurrenceId");
  assertOpaqueId(cardToken, "cardToken");
  assertOpaqueId(templateId, "templateId");
  assertOpaqueId(attempt?.attemptId, "attempt.attemptId");
  if (!Number.isInteger(templateRevision) || templateRevision < 1 || !Number.isInteger(attempt.assessmentRevision) || templateId !== attempt.templateId || templateRevision !== attempt.templateRevision) throw new TypeError("Versão do cartão não corresponde à avaliação aplicada.");
  if (!Array.isArray(pageIndexes) || pageIndexes.length === 0 || pageIndexes.some(index => !Number.isInteger(index) || index < 1) || new Set(pageIndexes).size !== pageIndexes.length) throw new TypeError("Páginas da captura inválidas.");
  if (typeof readerVersion !== "string" || !/^[A-Za-z0-9._-]{1,64}$/u.test(readerVersion)) throw new TypeError("Versão do leitor inválida.");
  const time = new Date(capturedAt);
  if (!Number.isFinite(time.getTime())) throw new TypeError("Data da captura inválida.");
  return Object.freeze({ occurrenceId, attemptId: attempt.attemptId, assessmentId: attempt.assessmentId, assessmentRevision: attempt.assessmentRevision, participantRef: attempt.participantRef, attemptNumber: attempt.attemptNumber, attemptKind: attempt.kind, cardToken, templateId, templateRevision, pageIndexes: Object.freeze([...pageIndexes]), readerVersion, capturedAt: time.toISOString() });
}

export function validateRescan({ original, rescan, sameAttempt = true }) {
  if (!original || !rescan || original.assessmentId !== rescan.assessmentId || original.participantRef !== rescan.participantRef) throw new Error("Reescaneamento pertence a outro aluno ou avaliação.");
  if (sameAttempt && (original.attemptId !== rescan.attemptId || original.assessmentRevision !== rescan.assessmentRevision)) throw new Error("Reescaneamento da mesma tentativa precisa manter IDs e versão.");
  if (!sameAttempt && (original.attemptId === rescan.attemptId || rescan.attemptNumber <= original.attemptNumber || rescan.attemptKind !== "second_call")) throw new Error("Segunda chamada deve criar uma nova tentativa.");
  if (original.occurrenceId === rescan.occurrenceId) throw new Error("Cada leitura deve gerar uma ocorrência distinta.");
  return true;
}

export function createAnswerObservations({ assessment, occurrence, observations }) {
  validateAssessmentRevision(assessment);
  if (occurrence.assessmentId !== assessment.assessmentId || occurrence.assessmentRevision !== assessment.revision) throw new Error("Leitura não corresponde à revisão aplicada.");
  if (!Array.isArray(observations)) throw new TypeError("Observações de leitura inválidas.");
  const questions = new Map(assessment.sections.flatMap(section => section.questions.map(question => [question.id, { question, sectionType: section.type }])));
  if (observations.length !== questions.size) throw new TypeError("A leitura deve descrever cada questão; falhas de detecção ficam em revisão.");
  const seen = new Set();
  const checked = observations.map(observation => {
    const entry = questions.get(observation.questionId);
    if (!entry || seen.has(observation.questionId)) throw new TypeError("Questão de leitura desconhecida ou repetida.");
    seen.add(observation.questionId);
    if (!Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1) throw new TypeError("Confiança de leitura deve estar entre 0 e 1.");
    const marks = observation.marks;
    if (!Array.isArray(marks) || marks.length > 5) throw new TypeError("Marcação da questão inválida.");
    const validChoices = entry.sectionType === "A-D" ? ["A", "B", "C", "D"] : entry.sectionType === "A-E" ? ["A", "B", "C", "D", "E"] : ["C", "E"];
    if (marks.some(mark => !validChoices.includes(mark)) || new Set(marks).size !== marks.length) throw new TypeError("Opções lidas incompatíveis com a seção.");
    // Confidence is retained as a signal for a future calibrated reader; it
    // must not decide review status until a representative dataset defines a threshold.
    const state = observation.state || (marks.length > 1 ? "double" : marks.length === 0 ? "blank" : "read");
    if (!["read", "review", "double", "blank"].includes(state)) throw new TypeError("Estado de leitura inválido.");
    if ((state === "double" && marks.length < 2) || (state === "blank" && marks.length !== 0) || (state === "read" && marks.length !== 1)) throw new TypeError("Estado de leitura não corresponde às marcações.");
    return Object.freeze({ questionId: observation.questionId, marks: Object.freeze([...marks]), confidence: observation.confidence, state });
  });
  return Object.freeze({ occurrenceId: occurrence.occurrenceId, assessmentId: assessment.assessmentId, assessmentRevision: assessment.revision, attemptId: occurrence.attemptId, observations: Object.freeze(checked) });
}

export function createManualAdjudication({ adjudicationId, assessment, attempt, occurrenceId, questionId, reviewerRef, selectedAnswer, reasonCode, decidedAt = new Date().toISOString() }) {
  validateAssessmentRevision(assessment);
  for (const [label, value] of Object.entries({ adjudicationId, occurrenceId, questionId, reviewerRef })) assertOpaqueId(value, label);
  if (attempt.assessmentId !== assessment.assessmentId || attempt.assessmentRevision !== assessment.revision) throw new Error("Revisão manual não corresponde à tentativa.");
  const section = assessment.sections.find(item => item.questions.some(question => question.id === questionId));
  if (!section) throw new TypeError("Questão da revisão não existe.");
  const choices = section.type === "A-D" ? ["A", "B", "C", "D"] : section.type === "A-E" ? ["A", "B", "C", "D", "E"] : ["C", "E"];
  if (selectedAnswer !== "blank" && !choices.includes(selectedAnswer)) throw new TypeError("Decisão incompatível com o tipo de questão.");
  if (!["omr_uncertain", "double_mark_confirmed", "blank_confirmed", "manual_correction", "template_review"].includes(reasonCode)) throw new TypeError("Motivo de revisão inválido.");
  const time = new Date(decidedAt);
  if (!Number.isFinite(time.getTime())) throw new TypeError("Data de decisão inválida.");
  return Object.freeze({ adjudicationId, occurrenceId, assessmentId: assessment.assessmentId, assessmentRevision: assessment.revision, attemptId: attempt.attemptId, questionId, reviewerRef, selectedAnswer, reasonCode, decidedAt: time.toISOString() });
}
