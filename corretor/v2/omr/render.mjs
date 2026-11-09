import { layoutTemplate, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./template.mjs?v=20261109f";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const imageHref = value => /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value || "") ? value : "";
const visible = (header, key, fallback = false) => header?.visible?.[key] ?? fallback;

export const DEFAULT_CARD_HEADER = Object.freeze({
  layout: "text",
  institution: "",
  teacher: "",
  subject: "",
  className: "",
  grade: "",
  date: "",
  schoolYear: "",
  title: "CARTÃO DE RESPOSTAS",
  logo: "",
  secondaryLogo: "",
  showStudentCode: true,
  visible: Object.freeze({ institution: true, teacher: false, subject: false, className: false, grade: false, date: false, schoolYear: false, title: true, studentName: true }),
  customFields: Object.freeze([]),
});

function text(x, y, value, { size = 3.2, weight = 400, anchor = "start", color = "#20212a", maxWidth } = {}) {
  if (!String(value ?? "").trim()) return "";
  const estimate = [...String(value)].length * size * 0.58;
  const fit = Number.isFinite(maxWidth) && estimate > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}"${fit}>${esc(value)}</text>`;
}

function drawHeader(header, { width, scaleX, scaleY }) {
  const h = { ...DEFAULT_CARD_HEADER, ...header };
  const items = [];
  const hasCode = h.showStudentCode !== false;
  const layout = ["text", "logo-left", "dual-logo", "compact"].includes(h.layout) ? h.layout : "text";
  const leftLogo = imageHref(h.logo);
  const rightLogo = imageHref(h.secondaryLogo);
  const img = (href, x, y, w = 24, height = 24) => href ? `<image href="${href}" x="${x * scaleX}" y="${y * scaleY}" width="${w * scaleX}" height="${height * scaleY}" preserveAspectRatio="xMidYMid meet"/>` : "";
  const centerX = width / 2;
  if (layout === "logo-left" || layout === "dual-logo") items.push(img(leftLogo, 15, 13, 22, 22));
  if (layout === "dual-logo") items.push(img(rightLogo, 173, 13, 22, 22));
  const textLeft = layout === "logo-left" ? 42 : 14;
  const textRight = layout === "dual-logo" ? 168 : 196;
  const headingX = layout === "compact" ? 14 : textLeft;
  const headingAnchor = layout === "text" || layout === "dual-logo" ? "middle" : "start";
  const headingPos = headingAnchor === "middle" ? centerX * scaleX : headingX * scaleX;
  const headingMaxWidth = (layout === "dual-logo" ? 128 : textRight - textLeft) * scaleX;
  if (visible(h, "institution", true)) items.push(text(headingPos, 18 * scaleY, h.institution, { size: 4, weight: 700, anchor: headingAnchor, maxWidth: headingMaxWidth }));
  if (visible(h, "title", true)) items.push(text(headingPos, 26 * scaleY, h.title, { size: 5, weight: 700, anchor: headingAnchor, maxWidth: headingMaxWidth }));
  if (layout === "compact") {
    const line = [
      visible(h, "teacher") && h.teacher,
      visible(h, "subject") && h.subject,
      visible(h, "className") && h.className,
      visible(h, "grade") && h.grade,
      visible(h, "date") && h.date,
      visible(h, "schoolYear") && h.schoolYear,
    ].filter(Boolean).join(" · ");
    items.push(text(14 * scaleX, 37 * scaleY, line, { size: 2.8 }));
  } else {
    const fields = [
      ["teacher", "Professor", h.teacher], ["subject", "Componente", h.subject],
      ["className", "Turma", h.className], ["grade", "Ano/série", h.grade],
      ["date", "Data", h.date], ["schoolYear", "Ano letivo", h.schoolYear],
    ].filter(([key, , value]) => visible(h, key) && value);
    const custom = Array.isArray(h.customFields) ? h.customFields.filter(row => row && row.visible !== false && String(row.label || "").trim() && String(row.value || "").trim()).slice(0, 4).map(row => [`custom-${row.label}`, row.label, row.value]) : [];
    const content = [...fields, ...custom].map(([, label, value]) => `${label}: ${value}`);
    const fieldColumns = [14, 77, 140];
    content.forEach((field, index) => {
      const row = Math.floor(index / fieldColumns.length);
      const column = index % fieldColumns.length;
      items.push(text(fieldColumns[column] * scaleX, (34 + row * 4.8) * scaleY, field, { size: 2.6, maxWidth: (column === 2 ? 56 : 58) * scaleX }));
    });
  }
  if (hasCode) {
    items.push(text(14 * scaleX, 54 * scaleY, "Código do aluno", { size: 3.1, weight: 700 }));
    items.push(text(14 * scaleX, 59 * scaleY, "Preencha uma opção por coluna", { size: 2.2, color: "#5d6070" }));
    if (visible(h, "studentName", true)) items.push(text(14 * scaleX, 69 * scaleY, "Nome:", { size: 3.1, weight: 700 }));
    if (visible(h, "studentName", true)) items.push(`<line x1="${26 * scaleX}" y1="${68.2 * scaleY}" x2="${135 * scaleX}" y2="${68.2 * scaleY}" stroke="#555" stroke-width="${0.25 * Math.min(scaleX, scaleY)}"/>`);
    for (let column = 1; column <= 7; column++) items.push(text((153 + (column - 1) * 6.1) * scaleX, 48.5 * scaleY, String(column), { size: 2.3, weight: 700, anchor: "middle" }));
    for (let digit = 0; digit <= 9; digit++) items.push(text(150 * scaleX, (52 + digit * 4) * scaleY + 0.75 * scaleY, String(digit), { size: 2.3, anchor: "middle" }));
    const grid = layoutTemplate(h._template, { width, height: PAGE_HEIGHT_MM * scaleY, page: h._page || 1, showCode: true }).codeGrid;
    for (const dot of grid) items.push(`<circle cx="${dot.x}" cy="${dot.y}" r="${dot.radius}" fill="white" stroke="#222" stroke-width="0.28"/>`);
  } else if (visible(h, "studentName", true)) {
    items.push(text(14 * scaleX, 48 * scaleY, "Nome:", { size: 3.1, weight: 700 }));
    items.push(`<line x1="${26 * scaleX}" y1="${47.2 * scaleY}" x2="${196 * scaleX}" y2="${47.2 * scaleY}" stroke="#555" stroke-width="${0.25 * Math.min(scaleX, scaleY)}"/>`);
  }
  return items.join("");
}

export function renderTemplateSvg(template, { page = 1, header = DEFAULT_CARD_HEADER, width = PAGE_WIDTH_MM, height = PAGE_HEIGHT_MM } = {}) {
  const geometry = layoutTemplate(template, { width, height, page, showCode: header?.showStudentCode !== false });
  const scaleX = width / PAGE_WIDTH_MM;
  const scaleY = height / PAGE_HEIGHT_MM;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cartão de respostas" data-template-version="${esc(geometry.version)}" data-template-id="${esc(geometry.templateId)}" data-page="${page}/${geometry.pageCount}">`,
    `<rect width="${PAGE_WIDTH_MM}" height="${PAGE_HEIGHT_MM}" fill="white"/>`,
    `<g class="card-header">${drawHeader({ ...header, _template: template, _page: page }, { width, scaleX, scaleY })}</g>`,
  ];
  for (const fiducial of geometry.fiducials) {
    parts.push(`<rect class="omr-fiducial" x="${fiducial.x - fiducial.size / 2}" y="${fiducial.y - fiducial.size / 2}" width="${fiducial.size}" height="${fiducial.size}" fill="#000"/>`);
  }
  for (const group of geometry.groups) {
    parts.push(`<rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="1.2" fill="#fafbfe" stroke="#c8cad5" stroke-width="0.25"/>`);
    parts.push(text(group.x + 2 * scaleX, group.y + 3.6 * scaleY, `${group.label}`, { size: 2.4, weight: 700, color: "#55586b" }));
  }
  for (const cell of geometry.cells) {
    parts.push(text(cell.x + 15 * scaleX, cell.y + 0.9 * scaleY, String(cell.number).padStart(2, "0"), { size: 3, weight: 700, anchor: "end" }));
    for (const bubble of cell.bubbles) {
      parts.push(text(bubble.x - 3 * scaleX, bubble.y + 0.85 * scaleY, bubble.choice, { size: 2.4, weight: 700, anchor: "end" }));
      parts.push(`<circle class="omr-answer-bubble" data-question="${cell.number}" data-choice="${bubble.choice}" cx="${bubble.x}" cy="${bubble.y}" r="${cell.bubbleRadius}" fill="white" stroke="#151515" stroke-width="0.32"/>`);
    }
  }
  parts.push(text(14 * scaleX, 287 * scaleY, `TEMPLATE OMR-A4-v3 · REV ${geometry.revision} · PÁGINA ${page}/${geometry.pageCount}`, { size: 2, color: "#626574" }));
  parts.push("</svg>");
  return parts.join("");
}

export function renderHeaderPreviewSvg(header = DEFAULT_CARD_HEADER) {
  const svg = renderTemplateSvg({
    templateId: "omr-a4", revision: 3, version: "salta-omr-a4-v3", widthMm: 210, heightMm: 297,
    questionCount: 1, pageCount: 1, questionsPerPage: 50,
    questions: Object.freeze([Object.freeze({ number: 1, type: "A-D", choices: Object.freeze(["A", "B", "C", "D"]), sectionIndex: 0, sectionLabel: "A-D" })]),
  }, { header });
  return svg.replace('height="297mm"', 'height="95mm"').replace('viewBox="0 0 210 297"', 'viewBox="0 0 210 95"');
}
