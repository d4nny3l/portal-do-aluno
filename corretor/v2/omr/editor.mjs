import { createAssessmentDefinition } from "./assessment.mjs?v=20261110a";

function toInput(definition, sections) {
  return createAssessmentDefinition({
    ...definition,
    identity: definition.identity,
    sections: sections.map(section => ({
      sectionId: section.sectionId,
      label: section.label,
      visualOrder: section.visualOrder,
      items: section.questions.map(question => ({
        questionId: question.questionId,
        number: question.number,
        type: question.type,
        visualOrder: question.visualOrder,
      })),
    })),
  }, { templateId: definition.templateId, revision: definition.revision + 1 });
}

export function reorderQuestion(definition, questionId, direction) {
  if (!Number.isInteger(direction) || Math.abs(direction) !== 1) throw new TypeError("A questão pode avançar ou voltar uma posição.");
  const sections = definition.sections.map(section => ({ ...section, questions: [...section.questions] }));
  const section = sections.find(item => item.questions.some(question => question.questionId === questionId));
  if (!section) throw new RangeError("Questão não encontrada.");
  const index = section.questions.findIndex(question => question.questionId === questionId);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= section.questions.length) return definition;
  [section.questions[index], section.questions[nextIndex]] = [section.questions[nextIndex], section.questions[index]];
  return toInput(definition, sections);
}

export function reorderSection(definition, sectionId, direction) {
  if (!Number.isInteger(direction) || Math.abs(direction) !== 1) throw new TypeError("A seção pode avançar ou voltar uma posição.");
  const sections = definition.sections.map(section => ({ ...section, questions: [...section.questions] }));
  const index = sections.findIndex(section => section.sectionId === sectionId);
  if (index < 0) throw new RangeError("Seção não encontrada.");
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= sections.length) return definition;
  [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
  return toInput(definition, sections);
}

export function restoreAutomaticArrangement(definition) {
  const sections = [...definition.sections]
    .sort((a, b) => a.visualOrder - b.visualOrder)
    .map(section => ({ ...section, questions: [...section.questions].sort((a, b) => a.number - b.number) }));
  return toInput(definition, sections);
}
