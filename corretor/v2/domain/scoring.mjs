import { validateAssessmentRevision, validateAnswerKey } from "./assessment.mjs";

function roundHundredth(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function allowedChoices(sectionType) {
  return sectionType === "A-D" ? ["A", "B", "C", "D"] : sectionType === "A-E" ? ["A", "B", "C", "D", "E"] : ["C", "E"];
}

export function scoreAssessment({ assessment, answerKey, observations, participantStatus = "present", attemptKind = "first", publishDefinitive = false, provisionalEnabled = false }) {
  validateAssessmentRevision(assessment);
  validateAnswerKey({ assessment, answerKey });
  if (!["present", "absent"].includes(participantStatus)) throw new TypeError("Situação do participante inválida.");
  if (!["first", "second_call"].includes(attemptKind)) throw new TypeError("Tipo de tentativa inválido.");
  if (!Array.isArray(observations)) throw new TypeError("Leituras da avaliação inválidas.");
  if (participantStatus === "absent") {
    return Object.freeze({ status: "absent", score: null, provisionalRange: null, eligibleForBimester: false, attemptKind, pendingQuestionIds: Object.freeze([]) });
  }

  const questionEntries = assessment.sections.flatMap(section => section.questions.map(question => ({ question, sectionType: section.type })));
  const observationMap = new Map();
  for (const observation of observations) {
    if (observationMap.has(observation.questionId)) throw new TypeError("Há leitura duplicada para a mesma questão.");
    observationMap.set(observation.questionId, observation);
  }
  const knownIds = new Set(questionEntries.map(entry => entry.question.id));
  for (const id of observationMap.keys()) if (!knownIds.has(id)) throw new TypeError("A leitura referencia uma questão inexistente.");

  let earnedMin = 0;
  let earnedMax = 0;
  let denominator = 0;
  const pendingQuestionIds = [];
  for (const { question, sectionType } of questionEntries) {
    const keyAnswer = answerKey.answers[question.id];
    const isAnnulled = keyAnswer === "annulled";
    if (isAnnulled && answerKey.annulledPolicy === "normalize") continue;
    denominator += question.weight;
    if (isAnnulled) {
      earnedMin += question.weight;
      earnedMax += question.weight;
      continue;
    }

    const observation = observationMap.get(question.id);
    const manuallyDecided = observation?.manualDecision !== undefined;
    let selected = observation?.manualDecision !== undefined ? observation.manualDecision : observation?.marks;
    let state;
    if (!observation || (!manuallyDecided && (selected === "review" || observation.state === "review")) || selected === undefined || selected === null) {
      state = "review";
    } else if (selected === "blank" || (!manuallyDecided && observation.state === "blank") || (Array.isArray(selected) && selected.length === 0)) {
      state = "blank";
    } else if ((!manuallyDecided && observation.state === "double") || (Array.isArray(selected) && selected.length > 1)) {
      state = "double";
    } else {
      const answer = Array.isArray(selected) ? selected[0] : selected;
      if (!allowedChoices(sectionType).includes(answer)) throw new TypeError(`Resposta inválida na questão ${question.number}.`);
      state = answer === keyAnswer ? "correct" : "incorrect";
    }
    if (state === "correct") earnedMin += question.weight, earnedMax += question.weight;
    else if (state === "review" || (state === "double" && assessment.doubleMarkPolicy === "review")) {
      pendingQuestionIds.push(question.id);
      earnedMax += question.weight;
    }
    // Em política explícita `zero`, uma dupla marcação é resolvida como 0.
    // Brancos e respostas incorretas também valem 0, mas não são ausência.
  }

  if (denominator === 0) {
    denominator = 1;
    earnedMin = 1;
    earnedMax = 1;
  }
  const min = roundHundredth((earnedMin / denominator) * assessment.totalPoints);
  const max = roundHundredth((earnedMax / denominator) * assessment.totalPoints);
  if (publishDefinitive && pendingQuestionIds.length) throw new Error("Não é possível publicar enquanto houver questões pendentes de revisão.");
  const definitive = publishDefinitive && pendingQuestionIds.length === 0;
  return Object.freeze({
    status: definitive ? "definitive" : "provisional",
    score: definitive ? min : null,
    provisionalRange: provisionalEnabled && !definitive ? Object.freeze({ min, max }) : null,
    eligibleForBimester: definitive,
    attemptKind,
    pendingQuestionIds: Object.freeze(pendingQuestionIds)
  });
}
