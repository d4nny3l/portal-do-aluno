import { createAssessmentDefinition, MAX_QUESTIONS, QUESTION_TYPES } from "./assessment.mjs";

export const LAYOUT_MANIFEST_VERSION = "salta-layout-manifest-v1";
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const INITIAL_GEOMETRY = Object.freeze({
  bubbleDiameterMm: 4.5,
  objectiveRowPitchMm: 6.2,
  choicePitchMm: 5.2,
  codeRowPitchMm: 5.2,
  numericRowPitchMm: 5.1,
  fiducialSizeMm: 5.5,
  borderStrokeMm: 0.25,
  safeMarginMm: 10,
});

export class LayoutCapacityError extends RangeError {
  constructor(report) {
    super(report.errors.join(" ") || "A composição não cabe em uma única página.");
    this.name = "LayoutCapacityError";
    this.report = report;
  }
}

const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

function stableHash(value) {
  const source = JSON.stringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function report(errors = [], warnings = []) {
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
}

function pageSize(definition, options) {
  if (definition.mode === "full-page") return { kind: "A4", widthMm: PAGE_WIDTH_MM, heightMm: PAGE_HEIGHT_MM };
  const size = options.widthMm && options.heightMm
    ? { widthMm: Number(options.widthMm), heightMm: Number(options.heightMm) }
    : definition.embeddedSize;
  if (!size || !Number.isFinite(size.widthMm) || !Number.isFinite(size.heightMm)) {
    throw new TypeError("Informe a largura e a altura físicas do quadro incorporável em milímetros.");
  }
  if (size.widthMm <= 0 || size.heightMm <= 0 || size.widthMm > PAGE_WIDTH_MM || size.heightMm > PAGE_HEIGHT_MM) {
    throw new RangeError("O quadro incorporável deve ter dimensões positivas e não pode exceder A4.");
  }
  return { kind: "embedded", ...size };
}

function identityFor(definition, size) {
  const identity = definition.identity;
  if (identity.mode === "qr") {
    const matrix = identity.qrMatrix;
    if (!matrix?.length || !matrix.every(row => row.length === matrix.length)) {
      throw new TypeError("A identificação QR exige uma matriz gerada por um provedor de QR autorizado; nenhum QR de demonstração será impresso.");
    }
    return {
      mode: "qr",
      zone: { x: size.widthMm - 43, y: 25, width: 32, height: 32 },
      matrix,
      student: identity.student,
    };
  }
  if (identity.mode === "seven-digit-code") {
    const diameter = INITIAL_GEOMETRY.bubbleDiameterMm;
    const pitch = INITIAL_GEOMETRY.codeRowPitchMm;
    const gridWidth = 6 * pitch + diameter;
    const x = size.widthMm - 13 - gridWidth;
    const boxesY = 29;
    const firstY = 37.5;
    const bubbles = [];
    const columns = [];
    const code = identity.student?.code || "";
    for (let column = 0; column < 7; column += 1) {
      const centerX = x + diameter / 2 + column * pitch;
      columns.push(Object.freeze({ index: column, centerX, box: { x: centerX - 2.1, y: boxesY, width: 4.2, height: 4.2 }, printedDigit: code ? code[column] : "" }));
      for (let digit = 0; digit <= 9; digit += 1) {
        bubbles.push(Object.freeze({
          bubbleId: `identity:column-${column + 1}:digit-${digit}`,
          column: column + 1,
          digit,
          x: centerX,
          y: firstY + digit * pitch,
          radiusMm: diameter / 2,
          filled: Boolean(code) && code[column] === String(digit),
        }));
      }
    }
    return { mode: identity.mode, x, y: boxesY, width: gridWidth, height: firstY + 9 * pitch - boxesY + diameter / 2, columns, bubbles, student: identity.student };
  }
  return {
    mode: "manual",
    student: identity.student,
    fields: {
      showName: identity.showName,
      showClass: identity.showClass,
      name: identity.student?.name || "",
      className: identity.student?.className || "",
    },
  };
}

function questionHeight(question, geometry) {
  return geometry.objectiveRowPitchMm;
}

function segmentHeight(items, start, end, geometry) {
  let height = 0;
  const seenSections = new Set(items.slice(0, start).map(item => item.sectionId));
  for (let index = start; index < end; index += 1) {
    if (!seenSections.has(items[index].sectionId)) height += 4.5;
    seenSections.add(items[index].sectionId);
    height += questionHeight(items[index], geometry);
  }
  return height;
}

function optimalContiguousColumns(items, columnCount, geometry) {
  const n = items.length;
  const dp = Array.from({ length: columnCount + 1 }, () => Array(n + 1).fill(Infinity));
  const cuts = Array.from({ length: columnCount + 1 }, () => Array(n + 1).fill(-1));
  dp[0][0] = 0;
  for (let columns = 1; columns <= columnCount; columns += 1) {
    for (let end = columns; end <= n - (columnCount - columns); end += 1) {
      for (let start = columns - 1; start < end; start += 1) {
        const cost = Math.max(dp[columns - 1][start], segmentHeight(items, start, end, geometry));
        if (cost < dp[columns][end]) {
          dp[columns][end] = cost;
          cuts[columns][end] = start;
        }
      }
    }
  }
  if (!Number.isFinite(dp[columnCount][n])) return null;
  const result = [];
  let end = n;
  for (let columns = columnCount; columns > 0; columns -= 1) {
    const start = cuts[columns][end];
    result.unshift(items.slice(start, end));
    end = start;
  }
  const offsets = [];
  let index = 0;
  for (const column of result) {
    offsets.push(index);
    index += column.length;
  }
  return { columns: result, maxHeightMm: dp[columnCount][n], heights: result.map((column, columnIndex) => segmentHeight(items, offsets[columnIndex], offsets[columnIndex] + column.length, geometry)) };
}

function requiredContentWidth(type, geometry) {
  const choiceCount = QUESTION_TYPES[type].length;
  return 7.2 + 1.3 + (choiceCount - 1) * geometry.choicePitchMm + geometry.bubbleDiameterMm;
}

function chooseColumns(definition, size, bounds, startY, endY, geometry, requestedColumns = definition.columnCount) {
  const safeWidth = bounds.width;
  const layoutQuestions = definition.layoutQuestions || definition.questions;
  const maxChoiceWidth = Math.max(...layoutQuestions.map(question => requiredContentWidth(question.type, geometry)));
  const gapMm = size.kind === "A4" ? 2.4 : 1.5;
  const maxColumns = Math.max(1, Math.min(layoutQuestions.length, Math.floor((safeWidth + gapMm) / (maxChoiceWidth + gapMm))));
  const availableHeight = endY - startY;
  const candidates = [];
  if (requestedColumns != null && (!Number.isInteger(requestedColumns) || requestedColumns < 1 || requestedColumns > maxColumns)) return null;
  const target = requestedColumns ?? Math.max(1, Math.min(maxColumns, Math.ceil(Math.sqrt(definition.questionCount / 5))));
  for (let columns = requestedColumns ?? 1; columns <= (requestedColumns ?? maxColumns); columns += 1) {
    const columnWidthMm = (safeWidth - gapMm * (columns - 1)) / columns;
    if (columnWidthMm < maxChoiceWidth) continue;
    const packed = optimalContiguousColumns(layoutQuestions, columns, geometry);
    if (!packed || packed.maxHeightMm > availableHeight) continue;
    const spread = Math.max(...packed.heights) - Math.min(...packed.heights);
    candidates.push({ ...packed, columnCount: columns, columnWidthMm, gapMm, spread, targetColumns: target, cost: Math.abs(columns - target) * 1000 + packed.maxHeightMm + spread * 0.18 + columns * 0.01 });
  }
  const selected = candidates.sort((a, b) => a.cost - b.cost)[0];
  if (!selected) return null;
  const labels = selected.heights.map((height, index) => height - selected.columns[index].length * geometry.objectiveRowPitchMm);
  const rowPitchMm = Math.max(geometry.objectiveRowPitchMm, Math.min(14, ...selected.columns.map((column, index) => (availableHeight - labels[index]) / column.length)));
  selected.rowPitchMm = rowPitchMm;
  selected.heights = selected.columns.map((column, index) => labels[index] + column.length * rowPitchMm);
  selected.maxHeightMm = Math.max(...selected.heights);
  return selected;
}

function createColumnPlacements(definition, packed, bounds, startY, endY, geometry) {
  const columns = [];
  const questions = [];
  const sections = [];
  const seenSections = new Set();
  const rowGeometry = { ...geometry, objectiveRowPitchMm: packed.rowPitchMm };
  for (let columnIndex = 0; columnIndex < packed.columnCount; columnIndex += 1) {
    const x = bounds.x + columnIndex * (packed.columnWidthMm + packed.gapMm);
    let y = startY;
    let previousSectionId = null;
    for (const question of packed.columns[columnIndex]) {
      if (question.sectionId !== previousSectionId) {
        if (!seenSections.has(question.sectionId)) {
          const section = definition.sections[question.sectionIndex];
          sections.push(Object.freeze({ sectionId: section.sectionId, label: section.label, x, y, width: packed.columnWidthMm, height: 4.5, columnIndex }));
          y += 4.5;
          seenSections.add(question.sectionId);
        }
        previousSectionId = question.sectionId;
      }
      const radiusMm = rowGeometry.bubbleDiameterMm / 2;
      const centerY = y + rowGeometry.bubbleDiameterMm / 2 + (rowGeometry.objectiveRowPitchMm - rowGeometry.bubbleDiameterMm) / 2;
      const firstX = x + 9.1;
      const bubbles = question.choices.map((choice, index) => Object.freeze({
        bubbleId: `${question.questionId}:${choice}`,
        choice,
        x: firstX + index * rowGeometry.choicePitchMm,
        y: centerY,
        radiusMm,
      }));
      questions.push(Object.freeze({ questionId: question.questionId, number: question.number, type: question.type, sectionId: question.sectionId, x, y, width: packed.columnWidthMm, height: rowGeometry.objectiveRowPitchMm, bubbles: Object.freeze(bubbles), columnIndex }));
      y += rowGeometry.objectiveRowPitchMm;
    }
    columns.push(Object.freeze({ columnIndex, x, y: startY, width: packed.columnWidthMm, height: y - startY }));
  }
  return { columns: Object.freeze(columns), sections: Object.freeze(sections), questions: Object.freeze(questions) };
}

function createCduPlacements(groups, bounds, startY, geometry) {
  const questions = [];
  const sections = [];
  const columnsPerRow = Math.max(1, Math.floor(bounds.width / 22.6));
  const rowHeight = 12 + 9 * geometry.numericRowPitchMm + geometry.bubbleDiameterMm / 2 + 1;
  let y = startY;
  for (const group of groups) {
    const sectionTop = y;
    sections.push(Object.freeze({ sectionId: group.section.sectionId, label: group.section.label, x: bounds.x, y, width: bounds.width, height: 4.5, region: "CDU" }));
    y += 4.5;
    for (let index = 0; index < group.questions.length; index += 1) {
      const row = Math.floor(index / columnsPerRow);
      const column = index % columnsPerRow;
      const x = bounds.x + column * 22.6;
      const rowTop = y + row * rowHeight;
      const bubbles = [];
      for (let digit = 0; digit <= 9; digit += 1) {
        for (let placeIndex = 0; placeIndex < 3; placeIndex += 1) {
          const place = ["C", "D", "U"][placeIndex];
          bubbles.push(Object.freeze({
            bubbleId: `${group.questions[index].questionId}:${place}:${digit}`,
            place,
            digit,
            x: x + 7.8 + placeIndex * geometry.choicePitchMm,
            y: rowTop + 12 + digit * geometry.numericRowPitchMm,
            radiusMm: geometry.bubbleDiameterMm / 2,
          }));
        }
      }
      questions.push(Object.freeze({
        questionId: group.questions[index].questionId,
        number: group.questions[index].number,
        type: "CDU",
        sectionId: group.section.sectionId,
        x,
        y: rowTop,
        width: 22.6,
        height: rowHeight,
        bubbles: Object.freeze(bubbles),
        numericPlaces: Object.freeze(["C", "D", "U"]),
        region: "CDU",
        columnIndex: column,
      }));
    }
    y += Math.ceil(group.questions.length / columnsPerRow) * rowHeight;
  }
  return { questions: Object.freeze(questions), sections: Object.freeze(sections), height: y - startY };
}

export function validateLayoutManifest(manifest) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== LAYOUT_MANIFEST_VERSION) return report(["Manifesto de layout desconhecido."]);
  if (manifest.pages?.length !== 1) errors.push("Um cartão individual precisa caber em exatamente uma página.");
  if (manifest.questions.length !== manifest.questionCount) errors.push("A quantidade de questões não corresponde ao manifesto.");
  const ids = new Set();
  const numbers = new Set();
  const circles = [...manifest.identityBubbles, ...manifest.questions.flatMap(question => question.bubbles)];
  for (const question of manifest.questions) {
    if (ids.has(question.questionId)) errors.push(`ID de questão repetido: ${question.questionId}.`);
    ids.add(question.questionId);
    if (numbers.has(question.number)) errors.push(`Número de questão repetido: ${question.number}.`);
    numbers.add(question.number);
    for (const bubble of question.bubbles) {
      if (bubble.radiusMm * 2 !== manifest.geometry.bubbleDiameterMm) errors.push(`Diâmetro divergente na questão ${question.number}.`);
    }
  }
  for (const bubble of manifest.identityBubbles) {
    if (bubble.radiusMm * 2 !== manifest.geometry.bubbleDiameterMm) errors.push("A grade de identificação usa diâmetro diferente das questões.");
  }
  for (const column of manifest.columns) {
    if (Math.abs(column.width - manifest.columnWidthMm) > 1e-6) errors.push("As colunas não têm a mesma largura.");
  }
  const bounds = manifest.safeBoundsMm;
  for (const bubble of circles) {
    if (bubble.x - bubble.radiusMm < bounds.x - 1e-6 || bubble.y - bubble.radiusMm < bounds.y - 1e-6 || bubble.x + bubble.radiusMm > bounds.x + bounds.width + 1e-6 || bubble.y + bubble.radiusMm > bounds.y + bounds.height + 1e-6) {
      errors.push(`Bolha fora da área segura: ${bubble.bubbleId}.`);
    }
  }
  const minCenterDistance = manifest.geometry.bubbleDiameterMm + 0.35;
  for (let index = 0; index < circles.length; index += 1) {
    for (let other = index + 1; other < circles.length; other += 1) {
      const distance = Math.hypot(circles[index].x - circles[other].x, circles[index].y - circles[other].y);
      if (distance < minCenterDistance - 1e-6) errors.push(`Colisão entre bolhas ${circles[index].bubbleId} e ${circles[other].bubbleId}.`);
    }
  }
  if (manifest.identity.mode === "seven-digit-code" && manifest.identityCode.columns.length !== 7) errors.push("A identificação precisa ter sete colunas.");
  for (const column of manifest.identityCode?.columns || []) {
    const matching = manifest.identityBubbles.filter(bubble => bubble.column === column.index + 1);
    if (matching.length !== 10) errors.push(`A coluna ${column.index + 1} não contém dez bolhas.`);
    if (Math.abs(column.box.centerX - column.centerX) > 1e-6) errors.push(`A caixa da coluna ${column.index + 1} está desalinhada.`);
  }
  return report(errors, manifest.mode === "embedded" ? ["Dimensões incorporáveis não foram homologadas fisicamente; imprimir e validar em escala real."] : ["Diâmetros e espaçamentos são parâmetros iniciais, ainda não homologados em impressão física."]);
}

export function composeLayout(input, options = {}) {
  const definition = input?.schemaVersion === "salta-assessment-definition-v1" ? input : createAssessmentDefinition(input, options);
  const size = pageSize(definition, options);
  if (!definition.questionCount || definition.questionCount > MAX_QUESTIONS) throw new RangeError(`O cartão aceita de 1 a ${MAX_QUESTIONS} questões.`);
  const geometry = { ...INITIAL_GEOMETRY, ...options.geometry };
  if (geometry.bubbleDiameterMm !== INITIAL_GEOMETRY.bubbleDiameterMm) throw new RangeError("O tamanho da bolha está protegido nesta versão; alterações exigem homologação física e nova revisão do contrato.");
  if (!["full-page", "embedded"].includes(definition.mode)) throw new TypeError("Modo de página inválido.");
  if (definition.identity.mode === "qr" && !definition.identity.qrMatrix) {
    return { manifest: null, validation: report(["QR não configurado: conecte um provedor autorizado de tokens opacos e um codificador QR antes de exportar."]) };
  }
  const margin = size.kind === "A4" ? geometry.safeMarginMm : 7;
  const safeBoundsMm = Object.freeze({ x: margin, y: margin, width: size.widthMm - margin * 2, height: size.heightMm - margin * 2 });
  if (safeBoundsMm.width < 32 || safeBoundsMm.height < 40) return { manifest: null, validation: report(["A área incorporável é menor que o mínimo geométrico calculado para bolhas de 4,5 mm e marcadores protegidos."]) };

  const identityCode = identityFor(definition, size);
  if (size.kind === "embedded" && identityCode.mode === "seven-digit-code" && (size.widthMm < 112 || size.heightMm < 112)) {
    return { manifest: null, validation: report(["A grade de identificação de sete dígitos exige quadro incorporável de pelo menos 112 × 112 mm; reduzi-la comprometeria o alinhamento e a leitura."]) };
  }
  const header = size.kind === "A4"
    ? { title: definition.title || "CARTÃO DE RESPOSTAS", schoolName: definition.schoolName, identityY: identityCode.mode === "seven-digit-code" ? 27.5 : 0 }
    : { title: definition.title || "RESPOSTAS", schoolName: "", identityY: identityCode.mode === "seven-digit-code" ? 17 : 0 };
  const startY = size.kind === "A4"
    ? identityCode.mode === "seven-digit-code" ? 94 : identityCode.mode === "qr" ? 69 : 59
    : identityCode.mode === "seven-digit-code" ? Math.max(68, identityCode.height + 14) : identityCode.mode === "qr" ? 53 : 40;
  const endY = size.heightMm - margin - 8;
  const layoutQuestions = definition.layoutQuestions || definition.questions;
  const objectiveQuestions = layoutQuestions.filter(question => question.type !== "CDU");
  const cduGroups = definition.sections.map(section => ({ section, questions: section.questions.filter(question => question.type === "CDU") })).filter(group => group.questions.length);
  const cduColumnsPerRow = Math.max(1, Math.floor(safeBoundsMm.width / 22.6));
  const cduRowHeight = 12 + 9 * geometry.numericRowPitchMm + geometry.bubbleDiameterMm / 2 + 1;
  const cduRegionHeight = cduGroups.reduce((sum, group) => sum + 4.5 + Math.ceil(group.questions.length / cduColumnsPerRow) * cduRowHeight, 0);
  const cduStartY = endY - cduRegionHeight;
  const objectiveEndY = cduGroups.length ? cduStartY - 3 : endY;
  const questionBounds = Object.freeze({ x: margin, y: startY, width: safeBoundsMm.width, height: Math.max(0, objectiveEndY - startY) });
  const objectiveDefinition = { ...definition, questions: objectiveQuestions, layoutQuestions: objectiveQuestions, questionCount: objectiveQuestions.length };
  const packed = objectiveQuestions.length ? chooseColumns(objectiveDefinition, size, questionBounds, startY, objectiveEndY, geometry) : null;
  if ((objectiveQuestions.length && !packed) || cduStartY < startY || cduStartY + cduRegionHeight > endY) {
    const maxChoiceWidth = objectiveQuestions.length ? Math.max(...objectiveQuestions.map(question => requiredContentWidth(question.type, geometry))) : 0;
    return {
      manifest: null,
      validation: report([
        `As ${definition.questionCount} questões não cabem em uma única folha com bolhas de 4,5 mm e o modo de identificação atual.`,
        "Não foi gerada uma segunda página nem reduzido o diâmetro. Revise a composição, a identificação, os títulos ou a região C-D-U.",
      ], maxChoiceWidth ? [`Largura mínima de coluna objetiva calculada: ${maxChoiceWidth.toFixed(1)} mm.`] : []),
    };
  }
  const objectivePlacements = packed ? createColumnPlacements(objectiveDefinition, packed, questionBounds, startY, objectiveEndY, geometry) : { columns: Object.freeze([]), sections: Object.freeze([]), questions: Object.freeze([]) };
  const cduPlacements = cduGroups.length ? createCduPlacements(cduGroups, safeBoundsMm, cduStartY, geometry) : { sections: Object.freeze([]), questions: Object.freeze([]) };
  const fiducials = [
    // Keep the reader/normalizer v4 corner contract: marker centers at 8 mm.
    { markerId: "fiducial-tl", x: 8, y: 8 },
    { markerId: "fiducial-tr", x: size.widthMm - 8, y: 8 },
    { markerId: "fiducial-br", x: size.widthMm - 8, y: size.heightMm - 8 },
    { markerId: "fiducial-bl", x: 8, y: size.heightMm - 8 },
  ].map(marker => Object.freeze({ ...marker, sizeMm: geometry.fiducialSizeMm }));
  const border = Object.freeze({ x: margin - 1, y: margin - 1, width: size.widthMm - 2 * (margin - 1), height: size.heightMm - 2 * (margin - 1), strokeMm: geometry.borderStrokeMm });
  const placementsById = new Map([...objectivePlacements.questions, ...cduPlacements.questions].map(placement => [placement.questionId, placement]));
  const questions = layoutQuestions.map(source => {
    const placement = placementsById.get(source.questionId);
    if (!placement) throw new Error(`Questão ${source.questionId} sem coordenadas no manifesto.`);
    const bubbles = placement.bubbles.map(bubble => Object.freeze({ ...bubble, filled: false }));
    return Object.freeze({ ...placement, sectionIndex: source.sectionIndex, bubbles: Object.freeze(bubbles) });
  });
  const columns = objectivePlacements.columns.map(column => Object.freeze({ x: column.x, width: column.width, height: column.height }));
  const identityBubbles = identityCode.mode === "seven-digit-code" ? identityCode.bubbles : [];
  const sections = [...objectivePlacements.sections, ...cduPlacements.sections];
  const manifestGeometry = Object.freeze({ ...geometry, objectiveRowPitchMm: packed?.rowPitchMm ?? geometry.objectiveRowPitchMm });
  const manifestCore = {
    schemaVersion: LAYOUT_MANIFEST_VERSION,
    templateId: definition.templateId,
    revision: definition.revision,
    version: `salta-omr-layout-v1-r${definition.revision}`,
    mode: definition.mode,
    paper: Object.freeze(size),
    identity: Object.freeze({ mode: identityCode.mode, showName: definition.identity.showName, showClass: definition.identity.showClass }),
    header: Object.freeze(header),
    geometry: manifestGeometry,
    safeBoundsMm,
    technicalRegions: Object.freeze({
      border,
      fiducials: Object.freeze(fiducials),
      qr: identityCode.mode === "qr" ? Object.freeze(identityCode.zone) : null,
      identityGrid: identityCode.mode === "seven-digit-code" ? Object.freeze({ x: identityCode.x, y: identityCode.y, width: identityCode.width, height: identityCode.height }) : null,
    }),
    identityCode: Object.freeze(identityCode.mode === "seven-digit-code" ? { ...identityCode, columns: Object.freeze(identityCode.columns.map(column => Object.freeze({ ...column, box: Object.freeze({ ...column.box, centerX: column.centerX }) }))), bubbles: undefined } : { mode: identityCode.mode, student: identityCode.student }),
    identityBubbles: Object.freeze(identityBubbles),
    columns: Object.freeze(columns),
    columnWidthMm: packed?.columnWidthMm ?? safeBoundsMm.width,
    sections: Object.freeze(sections),
    questions: Object.freeze(questions),
    questionCount: definition.questionCount,
    pages: Object.freeze([{ page: 1, widthMm: size.widthMm, heightMm: size.heightMm }]),
  };
  const contentHash = stableHash({ ...manifestCore, contentHash: undefined });
  const manifest = deepFreeze({ ...manifestCore, contentHash });
  return { manifest, validation: validateLayoutManifest(manifest) };
}

export function createLayoutManifest(input, options = {}) {
  const result = composeLayout(input, options);
  if (!result.validation.valid) throw new LayoutCapacityError(result.validation);
  return result.manifest;
}
