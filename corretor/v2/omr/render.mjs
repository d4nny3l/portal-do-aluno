import { createAssessmentDefinition } from "./assessment.mjs?v=20261110c";
import { createLayoutManifest, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./layout.mjs?v=20261110c";
import { createTemplate } from "./template.mjs?v=20261110c";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const imageHref = value => /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{1,2800000}$/i.test(value || "") ? value : "";

export const DEFAULT_CARD_HEADER = Object.freeze({
  layout: "text", institution: "", teacher: "", subject: "", className: "", grade: "", date: "", schoolYear: "",
  title: "CARTÃO DE RESPOSTAS", logo: "", secondaryLogo: "", showStudentCode: true,
  visible: Object.freeze({ institution: true, teacher: false, subject: false, className: false, grade: false, date: false, schoolYear: false, title: true, studentName: true }),
  customFields: Object.freeze([]),
});

function drawText(x, y, value, { size = 3, weight = 400, anchor = "start", maxWidth } = {}) {
  if (!String(value ?? "").trim()) return "";
  const estimate = [...String(value)].length * size * 0.56;
  const fit = Number.isFinite(maxWidth) && estimate > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="#000"${fit}>${esc(value)}</text>`;
}

function drawHeader(header, manifest) {
  const h = { ...DEFAULT_CARD_HEADER, ...header };
  const visible = (key, fallback = false) => h.visible?.[key] ?? fallback;
  const items = [];
  const layout = ["text", "logo-left", "dual-logo", "compact"].includes(h.layout) ? h.layout : "text";
  const leftLogo = imageHref(h.logo);
  const rightLogo = imageHref(h.secondaryLogo);
  const image = (href, x, y, width = 22, height = 22) => href ? `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" style="filter:grayscale(1)"/>` : "";
  if (manifest.mode === "embedded") {
    const width = manifest.paper.widthMm;
    if (leftLogo) items.push(image(leftLogo, 7, 5, Math.min(16, width / 5), 16));
    if (rightLogo) items.push(image(rightLogo, width - 23, 5, Math.min(16, width / 5), 16));
    const centerX = width / 2;
    const maxWidth = width - (leftLogo || rightLogo ? 46 : 14);
    if (visible("institution", true)) items.push(drawText(centerX, 10, h.institution || manifest.header.schoolName, { size: 3, weight: 700, anchor: "middle", maxWidth }));
    if (visible("title", true)) items.push(drawText(centerX, 17, h.title || manifest.header.title, { size: 4, weight: 700, anchor: "middle", maxWidth }));
    const fields = [
      ["Professor", h.teacher || manifest.header.teacher, "teacher"], ["Componente", h.subject || manifest.header.subject, "subject",], ["Turma", h.className || manifest.header.className, "className"],
      ["Ano/série", h.grade || manifest.header.grade, "grade"], ["Data", h.date || manifest.header.date, "date"], ["Ano letivo", h.schoolYear || manifest.header.schoolYear, "schoolYear"],
    ].filter(([, value, key]) => value && visible(key)).slice(0, 2);
    fields.forEach(([label, value], index) => items.push(drawText(7, 23 + index * 4, `${label}: ${value}`, { size: 2.4, maxWidth: width - 14 })));
    if (manifest.identity.mode === "manual" && visible("studentName", true)) {
      items.push(drawText(7, 34, "Nome:", { size: 2.7, weight: 700 }));
      const studentName = manifest.identity.student?.name;
      if (studentName) items.push(drawText(19, 34, studentName, { size: 2.7, maxWidth: width - 26 }));
      else items.push(`<line x1="19" y1="33.3" x2="${width - 7}" y2="33.3" stroke="#000" stroke-width="0.25"/>`);
    }
    return items.join("");
  }
  const logoDimensions = (aspect, requestedWidth) => {
    const safeAspect = Number.isFinite(Number(aspect)) && Number(aspect) > 0 ? Number(aspect) : 1;
    let width = Math.min(30, Math.max(14, Number(requestedWidth) || 22));
    let height = width / safeAspect;
    if (height > 22) { height = 22; width = height * safeAspect; }
    return { width, height, y: 13 + (22 - height) / 2 };
  };
  const logo1 = logoDimensions(h.logoAspect, h.logoWidthMm);
  const logo2 = logoDimensions(h.secondaryLogoAspect, h.secondaryLogoWidthMm);
  if (layout === "logo-left" || layout === "dual-logo") items.push(image(leftLogo, 14, logo1.y, logo1.width, logo1.height));
  if (layout === "dual-logo") items.push(image(rightLogo, 196 - logo2.width, logo2.y, logo2.width, logo2.height));
  const anchor = ["text", "dual-logo"].includes(layout) ? "middle" : "start";
  const x = anchor === "middle" ? 105 : layout === "logo-left" ? 42 : 14;
  const maxWidth = layout === "dual-logo" ? 128 : layout === "logo-left" ? 154 : 182;
  if (visible("institution", true)) items.push(drawText(x, 19, h.institution || manifest.header.schoolName, { size: 4, weight: 700, anchor, maxWidth }));
  if (visible("title", true)) items.push(drawText(x, 27, h.title || manifest.header.title, { size: 5, weight: 700, anchor, maxWidth }));
  if (layout === "compact") {
    const fields = [h.teacher || manifest.header.teacher, h.subject || manifest.header.subject, h.className || manifest.header.className, h.grade || manifest.header.grade, h.date || manifest.header.date, h.schoolYear || manifest.header.schoolYear].filter(Boolean).join(" · ");
    items.push(drawText(14, 36, fields, { size: 2.7, maxWidth: 182 }));
  } else {
    const fields = [
      ["Professor", h.teacher || manifest.header.teacher, "teacher"], ["Componente", h.subject || manifest.header.subject, "subject"], ["Turma", h.className || manifest.header.className, "className"],
      ["Ano/série", h.grade || manifest.header.grade, "grade"], ["Data", h.date || manifest.header.date, "date"], ["Ano letivo", h.schoolYear || manifest.header.schoolYear, "schoolYear"],
    ].filter(([, value, key]) => value && visible(key)).slice(0, 6);
    const columns = [14, 78, 142];
    const custom = Array.isArray(h.customFields)
      ? h.customFields.filter(field => field && field.visible !== false && String(field.label || "").trim() && String(field.value || "").trim()).slice(0, 4).map(field => [field.label, field.value])
      : [];
    [...fields, ...custom].forEach(([label, value], index) => items.push(drawText(columns[index % 3], 35 + Math.floor(index / 3) * 4.6, `${label}: ${value}`, { size: 2.6, maxWidth: 54 })));
  }
  if (manifest.identity.mode === "manual" && visible("studentName", true)) {
    const studentName = manifest.identityCode.student?.name;
    const studentClass = manifest.identityCode.student?.className;
    items.push(drawText(14, 52, "Nome:", { size: 3, weight: 700 }));
    if (studentName) items.push(drawText(27, 52, studentName, { size: 3, maxWidth: manifest.identity.showClass ? 108 : 169 }));
    else items.push(`<line x1="27" y1="51.2" x2="${manifest.identity.showClass ? 135 : 196}" y2="51.2" stroke="#000" stroke-width="0.25"/>`);
    if (manifest.identity.showClass) {
      items.push(drawText(141, 52, "Turma:", { size: 3, weight: 700 }));
      if (studentClass) items.push(drawText(157, 52, studentClass, { size: 3, maxWidth: 39 }));
      else items.push(`<line x1="157" y1="51.2" x2="196" y2="51.2" stroke="#000" stroke-width="0.25"/>`);
    }
  }
  return items.join("");
}

function drawIdentity(manifest) {
  const items = [];
  if (manifest.identity.mode === "seven-digit-code") {
    const grid = manifest.identityCode;
    items.push(drawText(14, 56, "CÓDIGO DO ALUNO · 7 DÍGITOS", { size: 3, weight: 700 }));
    items.push(drawText(14, 61, "Preencha uma opção em cada coluna", { size: 2.2 }));
    if (manifest.identity.showName) {
      items.push(drawText(14, 72, "Nome:", { size: 3, weight: 700 }));
      const rightEdge = grid.x - 8;
      if (manifest.identityCode.student?.name) items.push(drawText(26, 72, manifest.identityCode.student.name, { size: 3, maxWidth: Math.max(0, rightEdge - 26) }));
      else if (rightEdge > 28) items.push(`<line x1="26" y1="71.2" x2="${rightEdge}" y2="71.2" stroke="#000" stroke-width="0.25"/>`);
    }
    if (manifest.identity.showClass) {
      items.push(drawText(14, 81, "Turma:", { size: 3, weight: 700 }));
      const rightEdge = grid.x - 8;
      if (manifest.identityCode.student?.className) items.push(drawText(28, 81, manifest.identityCode.student.className, { size: 3, maxWidth: Math.max(0, rightEdge - 28) }));
      else if (rightEdge > 30) items.push(`<line x1="28" y1="80.2" x2="${rightEdge}" y2="80.2" stroke="#000" stroke-width="0.25"/>`);
    }
    for (const column of grid.columns) {
      items.push(`<rect x="${column.box.x}" y="${column.box.y}" width="${column.box.width}" height="${column.box.height}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);
      items.push(drawText(column.centerX, column.box.y + 3.05, column.printedDigit, { size: 2.8, weight: 700, anchor: "middle" }));
      for (const bubble of manifest.identityBubbles.filter(item => item.column === column.index + 1)) {
        items.push(`<circle class="omr-identity-bubble" data-column="${bubble.column}" data-digit="${bubble.digit}" cx="${bubble.x}" cy="${bubble.y}" r="${bubble.radiusMm}" fill="${bubble.filled ? "#000" : "#fff"}" stroke="#000" stroke-width="0.25"/>`);
        if (!bubble.filled) items.push(drawText(bubble.x, bubble.y + 0.68, String(bubble.digit), { size: 1.75, weight: 700, anchor: "middle", maxWidth: 2.7 }));
      }
    }
  } else if (manifest.identity.mode === "qr") {
    const { x, y, width, height, matrix } = manifest.technicalRegions.qr;
    const moduleSize = Math.min(width / matrix.length, height / matrix.length);
    items.push(drawText(x, y - 2, "IDENTIFICAÇÃO", { size: 2.2, weight: 700 }));
    matrix.forEach((row, rowIndex) => row.forEach((dark, columnIndex) => {
      if (dark) items.push(`<rect x="${x + columnIndex * moduleSize}" y="${y + rowIndex * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="#000"/>`);
    }));
  }
  return items.join("");
}

function drawQuestion(question) {
  const pieces = [];
  const centerY = question.type === "CDU" ? question.y + 3.3 : question.y + question.height / 2;
  pieces.push(drawText(question.x + 5.8, centerY + 0.9, String(question.number).padStart(2, "0"), { size: 2.8, weight: 700, anchor: "end" }));
  if (question.type === "CDU") {
    const places = ["C", "D", "U"];
    for (let placeIndex = 0; placeIndex < places.length; placeIndex += 1) {
      const box = question.responseBoxes?.[placeIndex];
      if (box) {
        pieces.push(drawText(box.centerX, box.y - 0.7, places[placeIndex], { size: 1.8, weight: 700, anchor: "middle" }));
        pieces.push(`<rect class="omr-cdu-response-box" data-place="${places[placeIndex]}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);
      }
    }
    for (const bubble of question.bubbles) {
      pieces.push(`<circle class="omr-answer-bubble" data-question-id="${esc(question.questionId)}" data-question="${question.number}" data-place="${bubble.place}" data-digit="${bubble.digit}" cx="${bubble.x}" cy="${bubble.y}" r="${bubble.radiusMm}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);
      pieces.push(drawText(bubble.x, bubble.y + 0.63, String(bubble.digit), { size: 1.7, weight: 700, anchor: "middle", maxWidth: 2.7 }));
    }
  } else {
    for (const bubble of question.bubbles) {
      pieces.push(`<circle class="omr-answer-bubble" data-question-id="${esc(question.questionId)}" data-question="${question.number}" data-choice="${bubble.choice}" cx="${bubble.x}" cy="${bubble.y}" r="${bubble.radiusMm}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);
      // Hollow glyphs keep the printed label legible while limiting dark ink in
      // the reader's central sampling area; the physical reader stays untouched.
      pieces.push(`<text x="${bubble.x}" y="${bubble.y + 0.72}" text-anchor="middle" font-family="Arial,sans-serif" font-size="2.05" font-weight="700" fill="#fff" stroke="#000" stroke-width="0.12" paint-order="stroke">${esc(bubble.choice)}</text>`);
    }
  }
  return pieces.join("");
}

export function createCardManifest(template, header = DEFAULT_CARD_HEADER) {
  const source = {
    ...template,
    title: header?.title || template.title,
    schoolName: header?.institution || template.schoolName,
    metadata: {
      ...template.metadata,
      ...header,
      logoAspect: header?.logoAspect ?? template.metadata?.logoAspect,
      secondaryLogoAspect: header?.secondaryLogoAspect ?? template.metadata?.secondaryLogoAspect,
      cduPosition: template.metadata?.cduPosition || "bottom",
    },
    identity: Object.freeze({
      ...template.identity,
      mode: header?.showStudentCode === false ? "manual" : template.identity?.mode,
      showName: header?.visible?.studentName ?? template.identity?.showName,
      showClass: template.identity?.student?.className ? true : header?.visible?.className ?? template.identity?.showClass,
    }),
  };
  return createLayoutManifest(source);
}

export function renderTemplateSvg(template, { page = 1, header = DEFAULT_CARD_HEADER, manifest: suppliedManifest = null, width = template?.widthMm ?? PAGE_WIDTH_MM, height = template?.heightMm ?? PAGE_HEIGHT_MM } = {}) {
  if (page !== 1) throw new RangeError("O cartão individual ocupa uma única página A4.");
  const manifest = suppliedManifest || createCardManifest(template, header);
  if (width !== manifest.paper.widthMm || height !== manifest.paper.heightMm) throw new RangeError("A exportação precisa preservar as dimensões físicas do manifesto.");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${manifest.paper.widthMm}mm" height="${manifest.paper.heightMm}mm" viewBox="0 0 ${manifest.paper.widthMm} ${manifest.paper.heightMm}" role="img" aria-label="Cartão de respostas" data-template-version="${esc(manifest.version)}" data-template-id="${esc(manifest.templateId)}" data-layout-hash="${manifest.contentHash}" data-page="1/1">`,
    `<rect width="${manifest.paper.widthMm}" height="${manifest.paper.heightMm}" fill="#fff"/>`,
    `<rect class="omr-card-border" x="${manifest.technicalRegions.border.x}" y="${manifest.technicalRegions.border.y}" width="${manifest.technicalRegions.border.width}" height="${manifest.technicalRegions.border.height}" fill="none" stroke="#000" stroke-width="${manifest.technicalRegions.border.strokeMm}"/>`,
    `<g class="card-header">${drawHeader(header, manifest)}${drawIdentity(manifest)}</g>`,
  ];
  for (const marker of manifest.technicalRegions.fiducials) {
    parts.push(`<rect class="omr-fiducial" data-marker="${marker.markerId}" x="${marker.x - marker.sizeMm / 2}" y="${marker.y - marker.sizeMm / 2}" width="${marker.sizeMm}" height="${marker.sizeMm}" fill="#000"/>`);
  }
  for (const section of manifest.sections) {
    parts.push(drawText(section.x, section.y + 3.2, section.label, { size: 2.7, weight: 700, maxWidth: section.width }));
    parts.push(`<line x1="${section.x}" y1="${section.y + section.height}" x2="${section.x + section.width}" y2="${section.y + section.height}" stroke="#000" stroke-width="0.2"/>`);
  }
  for (const question of manifest.questions) parts.push(`<g class="omr-question" data-question-id="${esc(question.questionId)}" data-question="${question.number}" data-type="${question.type}">${drawQuestion(question)}</g>`);
  parts.push(drawText(manifest.technicalRegions.border.x + 2, manifest.technicalRegions.border.y + manifest.technicalRegions.border.height - 2, `MODELO ${esc(manifest.templateId)} · REV ${manifest.revision} · ${manifest.contentHash.slice(0, 8)}`, { size: 2, maxWidth: manifest.paper.widthMm - 28 }));
  parts.push("</svg>");
  return parts.join("");
}

export function renderHeaderPreviewSvg(header = DEFAULT_CARD_HEADER) {
  const template = createTemplate([{ type: "A-D", count: 1, label: "Prévia" }], { identityMode: "manual" });
  const svg = renderTemplateSvg(template, { header: { ...header, showStudentCode: false }, height: PAGE_HEIGHT_MM });
  return svg.replace('height="297mm"', 'height="95mm"').replace('viewBox="0 0 210 297"', 'viewBox="0 0 210 95"');
}

// Explicit exports keep the canonical model available to the browser editor.
export { createAssessmentDefinition, createLayoutManifest };
