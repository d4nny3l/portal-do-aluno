import { createAssessmentDefinition, MAX_QUESTIONS, QUESTION_TYPES } from "./assessment.mjs?v=20261114v2final";
import { composeLayout, validateLayoutManifest, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./layout.mjs?v=20261123embedalign01";

export const TEMPLATE_VERSION = "salta-omr-a4-v8";
export const LEGACY_TEMPLATE_VERSION = "salta-omr-a4-v7";
export { PAGE_HEIGHT_MM, PAGE_WIDTH_MM };
// Compatibility name used by the reader; v5 always represents one physical page.
export const MAX_QUESTIONS_PER_PAGE = MAX_QUESTIONS;
export { QUESTION_TYPES };

const cleanLabel = value => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);

export function createTemplate(sections, { templateId = "omr-a4", revision = 8, layoutVersion = "v2", title = "CARTÃO DE RESPOSTAS", schoolName = "", identityMode = "seven-digit-code", showName = true, student = null, mode = "full-page", embeddedSize = null, columnCount = null, metadata = {} } = {}) {
  if (!Array.isArray(sections) || sections.length === 0) throw new TypeError("Informe ao menos uma seção.");
  if(layoutVersion!=="v1")for(const[label,value,max]of[["Título",title,160],["Identificação institucional",schoolName,600],["Professor",metadata.teacher,256],["Turma",metadata.className,128],["Componente",metadata.subject,160]])if(String(value||"").length>max)throw new RangeError(`${label} excede ${max} caracteres. Revise o texto; nada foi cortado.`);
  const definition = createAssessmentDefinition({
    templateId,
    title: layoutVersion === "v1" ? cleanLabel(title) : String(title || "CARTÃO DE RESPOSTAS"),
    schoolName: layoutVersion === "v1" ? cleanLabel(schoolName) : String(schoolName || ""),
    metadata,
    mode,
    embeddedSize,
    columnCount,
    identity: { mode: identityMode, student, showName },
    sections: sections.map((section, sectionIndex) => {
      if (!section || !Object.hasOwn(QUESTION_TYPES, section.type)) throw new TypeError(`Formato inválido na seção ${sectionIndex + 1}.`);
      const label = cleanLabel(section.label) || `Seção ${sectionIndex + 1} · ${section.type}`;
      if (Array.isArray(section.items)) return { ...section, sectionId: section.sectionId || `section-${sectionIndex + 1}`, label };
      return { ...section, sectionId: section.sectionId || `section-${sectionIndex + 1}`, label };
    }),
  }, { templateId, revision });
  return Object.freeze({
    ...definition,
    version: layoutVersion === "v1" ? LEGACY_TEMPLATE_VERSION : TEMPLATE_VERSION,
    layoutVersion,
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
export function layoutTemplate(template, { width, height, page = 1, showCode = true, manifest: suppliedManifest = null } = {}) {
  if (!template || ![TEMPLATE_VERSION, LEGACY_TEMPLATE_VERSION].includes(template.version) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Template ou dimensões inválidas.");
  }
  if (page !== 1) throw new RangeError("O cartão v5 ocupa uma única página A4.");
  if (template.questions.some(question => question.type === "CDU")) {
    throw new TypeError("O leitor atual não interpreta respostas C-D-U. O cartão pode ser gerado, mas essa leitura exige uma etapa futura do leitor.");
  }
  let source = template;
  if (!showCode && template.identity?.mode === "seven-digit-code") {
    source = {
      ...template,
      identity: Object.freeze({ mode: "manual", showName: template.identity.showName, showClass: template.identity.showClass, student: template.identity.student }),
    };
  }
  const result = suppliedManifest ? { manifest: suppliedManifest, validation: validateLayoutManifest(suppliedManifest) } : composeLayout(source);
  if (!result.manifest || !result.validation.valid) throw new RangeError(result.validation.errors.join(" ") || "Layout inválido.");
  const manifest = result.manifest;
  if (manifest.questionCount !== template.questionCount || manifest.questions.some(q => !template.questions.some(t => t.questionId === q.questionId && t.number === q.number && t.type === q.type))) throw new TypeError("O modelo selecionado não corresponde ao manifesto da folha.");
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
    version: template.version,
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

export function createLegacyTemplate(sections, options = {}) { return createTemplate(sections, { ...options, layoutVersion: "v1", revision: options.revision ?? 7 }); }
