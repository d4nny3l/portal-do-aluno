export const TEMPLATE_VERSION = "salta-omr-a4-v1";
export const QUESTION_TYPES = Object.freeze({
  "A-D": Object.freeze(["A", "B", "C", "D"]),
  "A-E": Object.freeze(["A", "B", "C", "D", "E"]),
  "C-E": Object.freeze(["C", "E"]),
});

function assertType(type) {
  if (!Object.hasOwn(QUESTION_TYPES, type)) throw new TypeError(`Formato inválido: ${type}`);
}

export function createTemplate(sections, { templateId = "salta-a4", revision = 1 } = {}) {
  if (!Array.isArray(sections) || sections.length === 0) throw new TypeError("Informe ao menos uma seção.");
  const normalized = [];
  let number = 1;
  for (const section of sections) {
    assertType(section.type);
    if (!Number.isInteger(section.count) || section.count < 1) throw new TypeError("Quantidade de questões inválida.");
    for (let i = 0; i < section.count; i++) normalized.push(Object.freeze({ number: number++, type: section.type, choices: QUESTION_TYPES[section.type] }));
  }
  if (normalized.length > 100) throw new RangeError("O cartão aceita no máximo 100 questões.");
  return Object.freeze({ templateId, revision, version: TEMPLATE_VERSION, widthMm: 210, heightMm: 297, questionCount: normalized.length, questions: Object.freeze(normalized) });
}

export function layoutTemplate(template, { width, height, margin = 24 } = {}) {
  if (!template || template.version !== TEMPLATE_VERSION || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(margin) || margin < 12) throw new TypeError("Template ou dimensões inválidas.");
  const columns = template.questionCount > 50 ? 2 : 1;
  const rows = Math.ceil(template.questionCount / columns);
  const colWidth = (width - margin * 2) / columns;
  const top = margin + 22, bottom = height - margin - 12;
  const rowPitch = Math.min(20, (bottom - top) / Math.max(1, rows - 1));
  const radius = Math.min(4, rowPitch * .22);
  if (rowPitch < 9 || radius < 2.8 || colWidth < 100) throw new RangeError("Dimensão insuficiente para bolhas legíveis.");
  const cells = template.questions.map(q => {
    const col = Math.floor((q.number - 1) / rows), row = (q.number - 1) % rows;
    const x = margin + col * colWidth, y = top + row * rowPitch;
    const gap = Math.min(12, (colWidth - 44) / Math.max(1, q.choices.length - 1));
    return Object.freeze({ number: q.number, type: q.type, x, y, bubbleRadius: radius, bubbles: Object.freeze(q.choices.map((choice, i) => Object.freeze({ choice, x: x + 34 + i * gap, y }))) });
  });
  const mark = 6, offset = margin / 2;
  return Object.freeze({ templateId: template.templateId, revision: template.revision, version: template.version, width, height, margin, fiducials: Object.freeze([{x:offset,y:offset},{x:width-offset,y:offset},{x:width-offset,y:height-offset},{x:offset,y:height-offset}].map(p=>Object.freeze({...p,size:mark}))), cells: Object.freeze(cells) });
}
