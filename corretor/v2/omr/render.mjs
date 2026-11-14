import { createAssessmentDefinition } from "./assessment.mjs?v=20261110c";
import { createLayoutManifest, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./layout.mjs?v=20261110c";
import { createTemplate } from "./template.mjs?v=20261110c";
import { ARTWORK_VERSION, headerArtwork, sectionFrames } from "./artwork.mjs?v=20261114v1";

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
  const h = { ...DEFAULT_CARD_HEADER, ...manifest.header, ...header };
  // Invalid remote logos remain excluded; a configured valid logo is never
  // silently removed just because a different header style was selected.
  h.logo = imageHref(h.logo); h.secondaryLogo = imageHref(h.secondaryLogo);
  const artwork = headerArtwork(manifest, h);
  const parts = ['<defs><filter id="salta-logo-monochrome"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 1"/><feFuncG type="discrete" tableValues="0 1"/><feFuncB type="discrete" tableValues="0 1"/></feComponentTransfer></filter></defs>'];
  for (const logo of artwork.logos) parts.push(`<image href="${logo.href}" x="${logo.x}" y="${logo.y}" width="${logo.width}" height="${logo.height}" preserveAspectRatio="xMidYMid meet" filter="url(#salta-logo-monochrome)"/>`);
  for (const rule of artwork.rules) parts.push(`<line x1="${rule.x1}" y1="${rule.y1}" x2="${rule.x2}" y2="${rule.y2}" stroke="#000" stroke-width="0.2"/>`);
  for (const text of artwork.texts) parts.push(`<g data-header-field="${esc(text.id)}">${drawText(text.textX, text.baseline, text.text, { size: text.size, weight: text.weight, anchor: text.anchor })}</g>`);
  return parts.join("");
}

function drawIdentity(manifest) {
  const items = [];
  if (manifest.identity.mode === "seven-digit-code") {
    const grid = manifest.identityCode;
    for (const column of grid.columns) {
      items.push(`<rect x="${column.box.x}" y="${column.box.y}" width="${column.box.width}" height="${column.box.height}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);
      items.push(drawText(column.centerX, column.box.y + 3.05, column.printedDigit, { size: 2.8, weight: 700, anchor: "middle" }));
      for (const bubble of manifest.identityBubbles.filter(item => item.column === column.index + 1)) {
        items.push(`<circle class="omr-identity-bubble" data-column="${bubble.column}" data-digit="${bubble.digit}" cx="${bubble.x}" cy="${bubble.y}" r="${bubble.radiusMm}" fill="${bubble.filled ? "#000" : "#fff"}" stroke="#000" stroke-width="0.25"/>`);
        if (!bubble.filled) items.push(drawText(bubble.x, bubble.y + 0.68, String(bubble.digit), { size: 1.85, weight: 700, anchor: "middle", maxWidth: 2.7 }));
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
      pieces.push(drawText(bubble.x, bubble.y + 0.63, String(bubble.digit), { size: 1.85, weight: 700, anchor: "middle", maxWidth: 2.7 }));
    }
  } else {
    for (const bubble of question.bubbles) {
      pieces.push(`<circle class="omr-answer-bubble" data-question-id="${esc(question.questionId)}" data-question="${question.number}" data-choice="${bubble.choice}" cx="${bubble.x}" cy="${bubble.y}" r="${bubble.radiusMm}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);
      // Hollow glyphs keep the printed label legible while limiting dark ink in
      // the reader's central sampling area; the physical reader stays untouched.
      pieces.push(`<text x="${bubble.x}" y="${bubble.y + 0.72}" text-anchor="middle" font-family="Arial,sans-serif" font-size="2.05" font-weight="700" fill="#fff" stroke="#000" stroke-width="0.16" paint-order="stroke">${esc(bubble.choice)}</text>`);
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
  return Object.freeze({ ...createLayoutManifest(source), artworkVersion: ARTWORK_VERSION });
}

export function renderTemplateSvg(template, { page = 1, header = DEFAULT_CARD_HEADER, manifest: suppliedManifest = null, width = template?.widthMm ?? PAGE_WIDTH_MM, height = template?.heightMm ?? PAGE_HEIGHT_MM } = {}) {
  if (page !== 1) throw new RangeError("O cartão individual ocupa uma única página A4.");
  const manifest = suppliedManifest || createCardManifest(template, header);
  if (width !== manifest.paper.widthMm || height !== manifest.paper.heightMm) throw new RangeError("A exportação precisa preservar as dimensões físicas do manifesto.");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${manifest.paper.widthMm}mm" height="${manifest.paper.heightMm}mm" viewBox="0 0 ${manifest.paper.widthMm} ${manifest.paper.heightMm}" role="img" aria-label="Cartão de respostas" data-template-version="${esc(manifest.version)}" data-template-id="${esc(manifest.templateId)}" data-layout-hash="${manifest.contentHash}" data-page="1/1" data-artwork-version="${ARTWORK_VERSION}">`,
    `<rect width="${manifest.paper.widthMm}" height="${manifest.paper.heightMm}" fill="#fff"/>`,
    `<rect class="omr-card-border" x="${manifest.technicalRegions.border.x}" y="${manifest.technicalRegions.border.y}" width="${manifest.technicalRegions.border.width}" height="${manifest.technicalRegions.border.height}" fill="none" stroke="#000" stroke-width="${manifest.technicalRegions.border.strokeMm}"/>`,
    `<g class="card-header">${drawHeader(header, manifest)}${drawIdentity(manifest)}</g>`,
  ];
  for (const marker of manifest.technicalRegions.fiducials) {
    parts.push(`<rect class="omr-fiducial" data-marker="${marker.markerId}" x="${marker.x - marker.sizeMm / 2}" y="${marker.y - marker.sizeMm / 2}" width="${marker.sizeMm}" height="${marker.sizeMm}" fill="#000"/>`);
  }
  for (const frame of sectionFrames(manifest)) {
    parts.push(`<g class="omr-section-frame" data-section-id="${esc(frame.sectionId)}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="1" ry="1" fill="none" stroke="#000" stroke-width="0.2"/>`);
    parts.push(drawText(frame.x + frame.width / 2, frame.y + 3.1, frame.label, { size: frame.size, weight: 700, anchor: "middle" }));
    parts.push("</g>");
  }
  for (const question of manifest.questions) parts.push(`<g class="omr-question" data-question-id="${esc(question.questionId)}" data-question="${question.number}" data-type="${question.type}">${drawQuestion(question)}</g>`);

  parts.push("</svg>");
  return parts.join("");
}

export function renderHeaderPreviewSvg(header = DEFAULT_CARD_HEADER) {
  const template = createTemplate([{ type: "A-D", count: 1, label: "Prévia" }], { identityMode: header.showStudentCode === false ? "manual" : "seven-digit-code" });
  const svg = renderTemplateSvg(template, { header, height: PAGE_HEIGHT_MM });
  return svg.replace('height="297mm"', 'height="95mm"').replace('viewBox="0 0 210 297"', 'viewBox="0 0 210 95"');
}

// Explicit exports keep the canonical model available to the browser editor.
export { createAssessmentDefinition, createLayoutManifest };
