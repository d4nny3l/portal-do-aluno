export const QUESTION_TYPES = Object.freeze({
  "A-D": Object.freeze(["A", "B", "C", "D"]),
  "A-E": Object.freeze(["A", "B", "C", "D", "E"]),
  "C-E": Object.freeze(["C", "E"]),
  CDU: Object.freeze(["C", "D", "U"]),
});

export const IDENTITY_MODES = Object.freeze(["manual", "seven-digit-code", "qr"]);
export const ASSESSMENT_MODES = Object.freeze(["full-page", "embedded"]);
export const MAX_QUESTIONS = 150;

const clean = (value, max = 96) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
const idPart = value => clean(value, 48).replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "item";

function assertQuestionType(type) {
  if (!Object.hasOwn(QUESTION_TYPES, type)) throw new TypeError(`Formato de questão inválido: ${type}`);
}

/**
 * Builds an immutable assessment definition. Explicit question numbers and IDs
 * are preserved; only the compact count-based form receives sequential defaults.
 */
export function createAssessmentDefinition(input, { templateId = "salta-assessment", revision = 1 } = {}) {
  if (!input || typeof input !== "object") throw new TypeError("Informe os dados da avaliação.");
  const sourceSections = input.sections;
  if (!Array.isArray(sourceSections) || sourceSections.length === 0) throw new TypeError("Informe ao menos uma seção.");
  if (sourceSections.length > 32) throw new RangeError("O cartão aceita até 32 seções.");
  if (!Number.isInteger(revision) || revision < 1) throw new TypeError("Revisão do layout inválida.");

  const usedSectionIds = new Set();
  const usedQuestionIds = new Set();
  const usedNumbers = new Set();
  let nextNumber = 1;
  let total = 0;

  const sections = sourceSections.map((source, sectionIndex) => {
    if (!source || typeof source !== "object") throw new TypeError(`Seção ${sectionIndex + 1} inválida.`);
    const sectionId = idPart(source.sectionId || source.id || `section-${sectionIndex + 1}`);
    if (usedSectionIds.has(sectionId)) throw new TypeError(`Identificador de seção repetido: ${sectionId}`);
    usedSectionIds.add(sectionId);
    const label = clean(source.label || source.title || `Seção ${sectionIndex + 1}`, 64);
    const items = Array.isArray(source.items)
      ? source.items
      : Number.isInteger(source.count) && source.count > 0
        ? Array.from({ length: source.count }, () => ({ type: source.type }))
        : null;
    if (!items?.length) throw new TypeError(`A seção “${label}” precisa conter questões.`);

    const questions = items.map((item, itemIndex) => {
      if (!item || typeof item !== "object") throw new TypeError(`Questão ${itemIndex + 1} inválida na seção “${label}”.`);
      const type = item.type || source.type;
      assertQuestionType(type);
      const number = item.number ?? nextNumber;
      if (!Number.isInteger(number) || number < 1 || number > 999) throw new RangeError(`Número inválido na seção “${label}”.`);
      if (usedNumbers.has(number)) throw new TypeError(`O número ${number} aparece mais de uma vez.`);
      usedNumbers.add(number);
      nextNumber = Math.max(nextNumber, number + 1);
      const questionId = idPart(item.questionId || item.id || `${sectionId}-q${itemIndex + 1}`);
      if (usedQuestionIds.has(questionId)) throw new TypeError(`Identificador de questão repetido: ${questionId}`);
      usedQuestionIds.add(questionId);
      total += 1;
      return Object.freeze({
        questionId,
        number,
        type,
        choices: QUESTION_TYPES[type],
        sectionId,
        sectionIndex,
        visualOrder: Number.isInteger(item.visualOrder) ? item.visualOrder : total - 1,
      });
    });
    return Object.freeze({ sectionId, label, visualOrder: Number.isInteger(source.visualOrder) ? source.visualOrder : sectionIndex, questions: Object.freeze(questions) });
  });

  if (total > MAX_QUESTIONS) throw new RangeError(`O limite lógico é ${MAX_QUESTIONS} questões; esta avaliação tem ${total}.`);
  const identityMode = input.identity?.mode || input.identityMode || "seven-digit-code";
  if (!IDENTITY_MODES.includes(identityMode)) throw new TypeError("Selecione identificação manual, código de sete dígitos ou QR.");
  const mode = input.mode || "full-page";
  if (!ASSESSMENT_MODES.includes(mode)) throw new TypeError("Tipo de cartão inválido.");
  const columnCount = input.columnCount == null ? null : Number(input.columnCount);
  if (columnCount != null && (!Number.isInteger(columnCount) || columnCount < 1 || columnCount > 5)) throw new RangeError("A quantidade manual de colunas deve ficar entre 1 e 5.");
  const studentInput = input.identity?.student || input.student;
  const student = studentInput && typeof studentInput === "object" ? Object.freeze({
    id: clean(studentInput.id, 96),
    name: clean(studentInput.name, 96),
    className: clean(studentInput.className, 64),
    code: clean(studentInput.code, 7),
  }) : null;
  if (identityMode === "seven-digit-code" && student?.code && !/^\d{7}$/.test(student.code)) {
    throw new TypeError("O código nominal precisa conter exatamente sete dígitos, incluindo zeros à esquerda.");
  }
  if (identityMode === "qr" && !input.qrTokenProvider) {
    // Deliberately record an unconfigured adapter; no student data is turned
    // into a QR payload by the generator itself.
  }

  return Object.freeze({
    templateId: idPart(input.templateId || templateId),
    revision,
    title: clean(input.title, 96),
    schoolName: clean(input.schoolName, 96),
    mode,
    columnCount,
    embeddedSize: input.embeddedSize ? Object.freeze({ widthMm: Number(input.embeddedSize.widthMm), heightMm: Number(input.embeddedSize.heightMm) }) : null,
    identity: Object.freeze({
      mode: identityMode,
      showName: input.identity?.showName !== false,
      showClass: input.identity?.showClass !== false,
      student,
      qrMatrix: Array.isArray(input.qrMatrix) ? Object.freeze(input.qrMatrix.map(row => Object.freeze(row.map(Boolean)))) : null,
    }),
    logo: input.logo && typeof input.logo === "object" ? Object.freeze({ href: clean(input.logo.href, 2_800_000), widthMm: Number(input.logo.widthMm || 20), heightMm: Number(input.logo.heightMm || 20) }) : null,
    sections: Object.freeze(sections),
    questions: Object.freeze(sections.flatMap(section => section.questions)),
    questionCount: total,
    pageCount: 1,
    schemaVersion: "salta-assessment-definition-v1",
  });
}
