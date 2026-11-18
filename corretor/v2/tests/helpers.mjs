import { createAssessmentRevision } from "../domain/assessment.mjs";

export const id = value => `synthetic_${value}`;

export function makeAssessment({ count = 3, types = ["A-D", "A-E", "C-E"], weights, doubleMarkPolicy = "review", totalPoints = 10 } = {}) {
  const sections = [];
  let number = 1;
  for (let sectionIndex = 0; number <= count; sectionIndex++) {
    const type = types[sectionIndex % types.length];
    const questions = [];
    const size = Math.ceil((count - number + 1) / (types.length - (sectionIndex % types.length)));
    for (let j = 0; j < size && number <= count; j++, number++) {
      questions.push({ id: id(`q${number}`), number, weight: weights?.[number - 1] ?? 1 });
    }
    sections.push({ id: id(`section${sectionIndex + 1}`), type, questions });
  }
  const assessmentId = id("assessment1");
  return createAssessmentRevision({
    assessmentId, revisionId: id("revision1"), revision: 1, tenantId: id("tenant1"), scopeId: id("scope1"),
    classId: id("class1"), schoolYearId: id("year2026"), period: 1, totalPoints, status: "published",
    doubleMarkPolicy, sections, participantRefs: [id("participant1"), id("participant2")],
    template: { id: id("template1"), revision: 1, questionCount: count }
  });
}

export function makeKey(assessment, { annulled = [], policy = "award", choices = {} } = {}) {
  const answers = {};
  for (const question of assessment.sections.flatMap(section => section.questions)) {
    answers[question.id] = annulled.includes(question.number) ? "annulled" : choices[question.number] || (assessment.sections.find(section => section.questions.includes(question)).type === "C-E" ? "C" : "A");
  }
  return { assessmentId: assessment.assessmentId, assessmentRevision: assessment.revision, revisionId: id("keyrev1"), revision: 1, annulledPolicy: policy, answers };
}

export function syntheticEnvelope({ tenantId = id("tenant1"), scopeId = id("scope1"), objectId = id("result1"), objectType = "salta.diary.result.v1", revision = 1, ciphertext = "c2FsdGEtc3ludGhldGljLWNpcGhlcnRleHQ" } = {}) {
  return { tenant_id: tenantId, scope_id: scopeId, object_id: objectId, object_type: objectType, protocol_version: 1, key_version: 1, revision, kdf: "HKDF-SHA256", aead: "AES-256-GCM", salt: "c2FsdC1zeW50aGV0aWM", nonce: "bm9uY2Utc3ludGhldGlj", ciphertext };
}
