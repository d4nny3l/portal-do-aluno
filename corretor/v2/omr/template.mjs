import { createAssessmentDefinition, MAX_QUESTIONS, QUESTION_TYPES } from "./assessment.mjs";
import { composeLayout, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./layout.mjs";

export const TEMPLATE_VERSION = "salta-omr-a4-v5";
export { PAGE_HEIGHT_MM, PAGE_WIDTH_MM };
// Compatibility name used by the reader; v5 always represents one physical page.
export const MAX_QUESTIONS_PER_PAGE = MAX_QUESTIONS;
export { QUESTION_TYPES };

const cleanLabel = value => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);

export function createTemplate(sections, { templateId = "omr-a4", revision = 5, title = "CARTÃO DE RESPOSTAS", schoolName = "", identityMode = "seven-digit-code", student = null, mode = "full-page", embeddedSize = null, columnCount = null } = {}) {
  if (!Array.isArray(sections) || sections.length === 0) throw new TypeError("Informe ao menos uma seção.");
  const definition = createAssessmentDefinition({
    templateId,
    title: cleanLabel(title),
    schoolName: cleanLabel(schoolName),
    mode,
    embeddedSize,
    columnCount,
    identity: { mode: identityMode, student },
    sections: sections.map((section, sectionIndex) => {
      if (!section || !Object.hasOwn(QUESTION_TYPES, section.type)) throw new TypeError(`Formato inválido na seção ${sectionIndex + 1}.`);
      const label = cleanLabel(section.label) || `Seção ${sectionIndex + 1} · ${section.type}`;
      if (Array.isArray(section.items)) return { ...section, sectionId: section.sectionId || `section-${sectionIndex + 1}`, label };
      return { ...section, sectionId: section.sectionId || `section-${sectionIndex + 1}`, label };
    }),
  }, { templateId, revision });
  return Object.freeze({
    ...definition,
    version: TEMPLATE_VERSION,
    widthMm: definition.mode === "full-page" ? PAGE_WIDTH_MM : definition.embeddedSize?.widthMm,
    heightMm: definition.mode === "full-page" ? PAGE_HEIGHT_MM : definition.embeddedSize?.heightMm,
    layoutQuestions: Object.freeze(definition.questions.map(question => Object.freeze({
      ...question,
      sectionLabel: definition.sections[question.sectionIndex].label,
    }))),
    questions: Object.freeze(definition.questions.map(question => Object.freeze({
      ...question,
      sectionLabel: definition.sections[question.sectionIndex].label,
    })).sort((left, right) => left.number - right.number)),
    questionsPerPage: MAX_QUESTIONS_PER_PAGE,
    pageCount: 1,
  });
}

/**
 * Reader adapter. Physical coordinates from the immutable millimetre manifest
 * are scaled to the supplied raster without changing the print geometry.
 */
export function layoutTemplate(template, { width, height, page = 1, showCode = true } = {}) {
  if (!template || template.version !== TEMPLATE_VERSION || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Template ou dimensões inválidas.");
  }
  if (page !== 1) throw new RangeError("O cartão v5 ocupa uma única página A4.");
  if (template.questions.some(question => question.type === "CDU")) {
    throw new TypeError("O leitor atual não interpreta respostas C-D-U. O cartão pode ser gerado, mas essa leitura exige uma etapa futura do leitor.");
  }
  const orderedNumbers = [...template.questions].map(question => question.number).sort((a, b) => a - b);
  if (orderedNumbers.some((number, index) => number !== index + 1)) {
    throw new TypeError("O leitor atual exige numeração de 1 até o total de questões. A disposição visual pode mudar, mas os números devem permanecer contínuos.");
  }
  let source = template;
  if (!showCode && template.identity?.mode === "seven-digit-code") {
    source = {
      ...template,
      identity: Object.freeze({ mode: "manual", showName: template.identity.showName, showClass: template.identity.showClass, student: template.identity.student }),
    };
  }
  const result = composeLayout(source);
  if (!result.manifest || !result.validation.valid) throw new RangeError(result.validation.errors.join(" ") || "Layout inválido.");
  const manifest = result.manifest;
  const scaleX = width / manifest.paper.widthMm;
  const scaleY = height / manifest.paper.heightMm;
  const scale = Math.min(scaleX, scaleY);
  const cells = manifest.questions.map(question => Object.freeze({
    questionId: question.questionId,
    number: question.number,
    type: question.type,
    sectionIndex: question.sectionIndex,
    sectionLabel: template.sections?.[question.sectionIndex]?.label || "",
    x: question.x * scaleX,
    y: question.y * scaleY + question.height * scaleY / 2,
    bubbleRadius: manifest.geometry.bubbleDiameterMm / 2 * scale,
    bubbles: Object.freeze(question.bubbles.map(bubble => Object.freeze({
      choice: bubble.choice,
      x: bubble.x * scaleX,
      y: bubble.y * scaleY,
    }))),
  }));
  const groups = manifest.sections.map(section => Object.freeze({
    sectionId: section.sectionId,
    sectionIndex: template.sections?.findIndex(sourceSection => sourceSection.sectionId === section.sectionId) ?? -1,
    label: section.label,
    x: section.x * scaleX,
    y: section.y * scaleY,
    width: section.width * scaleX,
    height: section.height * scaleY,
  }));
  const codeGrid = manifest.identityBubbles.map(bubble => Object.freeze({
    column: bubble.column,
    digit: bubble.digit,
    x: bubble.x * scaleX,
    y: bubble.y * scaleY,
    radius: bubble.radiusMm * scale,
    filled: bubble.filled,
  }));
  return Object.freeze({
    templateId: manifest.templateId,
    revision: manifest.revision,
    version: TEMPLATE_VERSION,
    width,
    height,
    page: 1,
    pageCount: 1,
    columns: manifest.columns.length,
    columnWidth: manifest.columnWidthMm * scaleX,
    rowPitch: manifest.geometry.objectiveRowPitchMm * scaleY,
    fiducials: Object.freeze(manifest.technicalRegions.fiducials.map(marker => Object.freeze({
      x: marker.x * scaleX,
      y: marker.y * scaleY,
      size: marker.sizeMm * scale,
      markerId: marker.markerId,
    }))),
    codeGrid: Object.freeze(codeGrid),
    identityCode: manifest.identityCode,
    identityBubbles: Object.freeze(manifest.identityBubbles),
    sections: Object.freeze(groups),
    groups: Object.freeze(groups),
    cells: Object.freeze(cells.sort((a, b) => a.number - b.number)),
    manifest,
  });
}
