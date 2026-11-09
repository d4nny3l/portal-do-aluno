export const TEMPLATE_VERSION = "salta-omr-a4-v3";
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const MAX_QUESTIONS_PER_PAGE = 50;
export const QUESTION_TYPES = Object.freeze({
  "A-D": Object.freeze(["A", "B", "C", "D"]),
  "A-E": Object.freeze(["A", "B", "C", "D", "E"]),
  "C-E": Object.freeze(["C", "E"]),
});

const cleanLabel = value => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 48);

function assertType(type) {
  if (!Object.hasOwn(QUESTION_TYPES, type)) throw new TypeError(`Formato inválido: ${type}`);
}

export function createTemplate(sections, { templateId = "omr-a4", revision = 3 } = {}) {
  if (!Array.isArray(sections) || sections.length === 0) throw new TypeError("Informe ao menos uma seção.");
  if (sections.length > 8) throw new RangeError("O cartão aceita até 8 seções para manter os rótulos legíveis.");
  const normalized = [];
  sections.forEach((section, sectionIndex) => {
    assertType(section.type);
    if (!Number.isInteger(section.count) || section.count < 1) throw new TypeError("Quantidade de questões inválida.");
    const label = cleanLabel(section.label) || `Seção ${sectionIndex + 1} · ${section.type}`;
    for (let i = 0; i < section.count; i++) {
      normalized.push(Object.freeze({
        number: normalized.length + 1,
        type: section.type,
        choices: QUESTION_TYPES[section.type],
        sectionIndex,
        sectionLabel: label,
      }));
    }
  });
  if (normalized.length > 100) throw new RangeError("O cartão aceita no máximo 100 questões.");
  const pages = Math.ceil(normalized.length / MAX_QUESTIONS_PER_PAGE);
  return Object.freeze({
    templateId: cleanLabel(templateId) || "omr-a4",
    revision,
    version: TEMPLATE_VERSION,
    widthMm: PAGE_WIDTH_MM,
    heightMm: PAGE_HEIGHT_MM,
    questionCount: normalized.length,
    pageCount: pages,
    questionsPerPage: MAX_QUESTIONS_PER_PAGE,
    questions: Object.freeze(normalized),
  });
}

function columnsFor(count) {
  return Math.min(3, Math.ceil(count / 4));
}

/**
 * Coordinates are millimetres when width/height are 210×297, and scale to
 * the supplied raster dimensions when called by the OMR reader. v3 packs
 * question rows into up to three columns with a compact, fixed vertical rhythm.
 */
export function layoutTemplate(template, { width, height, page = 1, showCode = true } = {}) {
  if (!template || template.version !== TEMPLATE_VERSION || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Template ou dimensões inválidas.");
  }
  if (!Number.isInteger(page) || page < 1 || page > template.pageCount) throw new RangeError("Página do cartão inválida.");
  const scaleX = width / PAGE_WIDTH_MM;
  const scaleY = height / PAGE_HEIGHT_MM;
  const radius = 2.45 * Math.min(scaleX, scaleY); // 4.9 mm diameter at 100% A4.
  const pitchX = 6.25 * scaleX;
  const startYmm = showCode ? 96 : 57;
  const endYmm = 280;
  const pageStart = (page - 1) * MAX_QUESTIONS_PER_PAGE;
  const pageQuestions = template.questions.slice(pageStart, pageStart + MAX_QUESTIONS_PER_PAGE);
  const columns = columnsFor(pageQuestions.length);
  const columnWidthMm = (PAGE_WIDTH_MM - 28) / columns;
  const chunks = Array.from({ length: columns }, (_, col) => {
    const start = Math.floor(pageQuestions.length * col / columns);
    const end = Math.floor(pageQuestions.length * (col + 1) / columns);
    return pageQuestions.slice(start, end);
  });
  const groupCount = chunk => chunk.reduce((n, question, i) => n + (i === 0 || question.sectionIndex !== chunk[i - 1].sectionIndex ? 1 : 0), 0);
  const maxSlots = Math.max(1, ...chunks.map(chunk => chunk.length + groupCount(chunk)));
  const totalHeight = (endYmm - startYmm) * scaleY;
  // Dense cards use the printable height; short cards keep compact rows and
  // center their answer blocks instead of stretching the questions apart.
  const rowPitch = Math.min(totalHeight / maxSlots, 10.5 * scaleY);
  if (radius < 2.2 * Math.min(scaleX, scaleY) || rowPitch / scaleY < 7.1) {
    throw new RangeError("A seção excede a área imprimível segura; reduza questões por seção ou divida a avaliação.");
  }
  const cells = [];
  const groups = [];
  chunks.forEach((chunk, col) => {
    const xMm = 14 + col * columnWidthMm;
    const rows = [];
    let slot = 0;
    let currentGroup = null;
    for (const question of chunk) {
      if (!currentGroup || currentGroup.sectionIndex !== question.sectionIndex) {
        if (currentGroup) currentGroup.endSlot = slot;
        currentGroup = { sectionIndex: question.sectionIndex, label: question.sectionLabel, type: question.type, startSlot: slot, endSlot: slot };
        groups.push(currentGroup);
        slot++;
      }
      rows.push({ question, slot });
      slot++;
    }
    if (currentGroup) currentGroup.endSlot = slot;
    const topOffset = 0;
    const colGroups = groups.filter(group => chunk.some(q => q.sectionIndex === group.sectionIndex) && group._column === undefined);
    // Group positions are derived from each question's slot; avoid mutating template data.
    for (const group of groups) if (group._column === undefined && chunk.some(q => q.sectionIndex === group.sectionIndex)) group._column = col;
    for (const row of rows) {
      const { question, slot: rowSlot } = row;
      const x = xMm * scaleX;
      const y = startYmm * scaleY + topOffset + (rowSlot + 0.5) * rowPitch;
      const choiceStepMm = 8;
      const contentWidthMm = 54;
      const contentXmm = xMm + Math.max(0, (columnWidthMm - contentWidthMm) / 2);
      cells.push(Object.freeze({
        number: question.number,
        type: question.type,
        sectionIndex: question.sectionIndex,
        sectionLabel: question.sectionLabel,
        x: contentXmm * scaleX,
        y,
        bubbleRadius: radius,
        bubbles: Object.freeze(question.choices.map((choice, i) => Object.freeze({
          choice,
          x: (contentXmm + 22 + i * choiceStepMm) * scaleX,
          y,
        }))),
      }));
    }
    for (const group of colGroups) {
      if (group._column !== col) continue;
      const top = startYmm * scaleY + topOffset + group.startSlot * rowPitch;
      const bottom = startYmm * scaleY + topOffset + group.endSlot * rowPitch;
      group.x = xMm * scaleX;
      group.y = top;
      group.width = columnWidthMm * scaleX;
      group.height = bottom - top;
    }
  });
  const fiducialSize = 6 * Math.min(scaleX, scaleY);
  const fiducials = [
    { x: 8, y: 8 }, { x: PAGE_WIDTH_MM - 8, y: 8 },
    { x: PAGE_WIDTH_MM - 8, y: PAGE_HEIGHT_MM - 8 }, { x: 8, y: PAGE_HEIGHT_MM - 8 },
  ].map(point => Object.freeze({ x: point.x * scaleX, y: point.y * scaleY, size: fiducialSize }));
  const codeGrid = showCode ? Array.from({ length: 7 }, (_, column) => Array.from({ length: 10 }, (_, digit) => Object.freeze({
    column: column + 1,
    digit,
    x: (153 + column * 6.1) * scaleX,
    y: (51 + digit * 4) * scaleY,
    radius: 1.55 * Math.min(scaleX, scaleY),
  }))).flat() : [];
  return Object.freeze({
    templateId: template.templateId,
    revision: template.revision,
    version: template.version,
    width,
    height,
    page,
    pageCount: template.pageCount,
    columns,
    rowPitch,
    fiducials: Object.freeze(fiducials),
    codeGrid: Object.freeze(codeGrid),
    groups: Object.freeze(groups.map(({ _column, ...group }) => Object.freeze(group))),
    cells: Object.freeze(cells.sort((a, b) => a.number - b.number)),
  });
}
