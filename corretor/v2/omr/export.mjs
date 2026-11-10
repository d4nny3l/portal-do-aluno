import { createTemplate, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./template.mjs?v=20261110a";
import { createLayoutManifest } from "./layout.mjs?v=20261110a";
import { renderTemplateSvg, DEFAULT_CARD_HEADER } from "./render.mjs?v=20261110a";

export const EXPORT_VERSION = "salta-omr-export-v1";
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]));

export function buildPrintDocument(template, { header = DEFAULT_CARD_HEADER, students = [] } = {}) {
  if (!template || !Array.isArray(students)) throw new TypeError("Informe o modelo e a lista de cartões.");
  if (students.length > 500) throw new RangeError("A impressão em lote aceita até 500 cartões por operação.");
  const roster = students.length ? students : [template.identity?.student || null];
  const sections = template.sections.map(section => ({
    sectionId: section.sectionId,
    label: section.label,
    type: section.questions[0]?.type,
    items: section.questions.map(question => ({
      questionId: question.questionId,
      number: question.number,
      type: question.type,
      visualOrder: question.visualOrder,
    })),
  }));
  const pages = roster.map((student, index) => {
    const card = student ? createTemplate(sections, {
      templateId: template.templateId,
      revision: template.revision,
      title: template.title,
      schoolName: template.schoolName,
      identityMode: template.identity.mode,
      columnCount: template.columnCount,
      mode: template.mode,
      embeddedSize: template.embeddedSize,
      student,
    }) : template;
    const svg = renderTemplateSvg(card, { header });
    return `<section class="print-page" data-card="${index + 1}">${svg}</section>`;
  }).join("\n");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartões de resposta</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.print-page{width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;page-break-after:always;break-after:page;overflow:hidden}.print-page:last-child{page-break-after:auto;break-after:auto}.print-page svg{display:block;width:auto;height:auto;max-width:210mm;max-height:297mm}@media screen{body{background:#eee}.print-page{margin:12px auto;background:#fff;box-shadow:0 2px 14px #0002}}@media print{.print-page{margin:0;box-shadow:none}}</style><body>${pages}<script>addEventListener('load',()=>setTimeout(()=>print(),200))</script></body></html>`;
}

export function buildManifestJson(template, { header = DEFAULT_CARD_HEADER } = {}) {
  const source = {
    ...template,
    identity: Object.freeze({ ...template.identity, student: null }),
  };
  const manifest = createLayoutManifest(source);
  const identityCode = manifest.identityCode.mode === "seven-digit-code"
    ? { ...manifest.identityCode, student: null, columns: manifest.identityCode.columns.map(column => ({ ...column, printedDigit: "" })) }
    : { mode: manifest.identityCode.mode };
  return JSON.stringify({
    exportVersion: EXPORT_VERSION,
    manifest: {
      ...manifest,
      identityCode,
      identityBubbles: manifest.identityBubbles.map(bubble => ({ ...bubble, filled: false })),
      identity: { ...manifest.identity, student: undefined },
    },
    // JSON remains reusable and excludes names, class data, codes and QR payloads.
  }, null, 2);
}

export async function svgToBlob(svg, { format = "image/png", dpi = 300, quality = 0.94, widthMm = PAGE_WIDTH_MM, heightMm = PAGE_HEIGHT_MM } = {}) {
  if (!/^image\/(?:png|jpeg)$/.test(format)) throw new TypeError("Formato raster inválido.");
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 600) throw new RangeError("A resolução deve ficar entre 72 e 600 DPI.");
  if (typeof document === "undefined" || typeof Image === "undefined") throw new Error("Exportação PNG/JPG exige um navegador com Canvas.");
  const pixelsPerMm = dpi / 25.4;
  const canvas = document.createElement("canvas");
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || widthMm > PAGE_WIDTH_MM || heightMm <= 0 || heightMm > PAGE_HEIGHT_MM) throw new RangeError("Dimensões físicas raster inválidas.");
  canvas.width = Math.round(widthMm * pixelsPerMm);
  canvas.height = Math.round(heightMm * pixelsPerMm);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível neste navegador.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = blobUrl;
    await image.decode();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("O navegador não conseguiu exportar a imagem.")), format, quality));
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function createDownload(blob, filename) {
  if (!(blob instanceof Blob)) throw new TypeError("Arquivo de exportação inválido.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
