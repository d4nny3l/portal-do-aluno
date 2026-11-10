import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./template.mjs?v=20261110c";
import { createCardManifest, renderTemplateSvg, DEFAULT_CARD_HEADER } from "./render.mjs?v=20261110c";

export const EXPORT_VERSION = "salta-omr-export-v1";

export function sortStudentRoster(students, order = "name-asc") {
  if (!Array.isArray(students)) throw new TypeError("A lista de alunos precisa ser uma lista.");
  if (order === "input") return [...students];
  if (order !== "name-asc") throw new RangeError("Ordem de impressão desconhecida.");
  return [...students].sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), "pt-BR", { sensitivity: "base" })
    || String(left?.className || "").localeCompare(String(right?.className || ""), "pt-BR", { sensitivity: "base" })
    || String(left?.code || "").localeCompare(String(right?.code || "")));
}

export function selectStudentPages(students, selection = "") {
  if (!Array.isArray(students)) throw new TypeError("A lista de alunos precisa ser uma lista.");
  const source = String(selection || "").trim();
  if (!source) return [...students];
  const indexes = new Set();
  for (const token of source.split(",").map(value => value.trim()).filter(Boolean)) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) throw new TypeError("Selecione páginas no formato 1, 3-5.");
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > students.length) throw new RangeError(`A seleção precisa estar entre 1 e ${students.length}.`);
    for (let page = start; page <= end; page += 1) indexes.add(page - 1);
  }
  if (!indexes.size) throw new TypeError("Selecione ao menos uma página do lote.");
  return [...indexes].sort((left, right) => left - right).map(index => students[index]);
}
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]));

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const bytes = new Uint8Array(data.length + 12);
  writeUint32(bytes, 0, data.length);
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index);
  bytes.set(data, 8);
  writeUint32(bytes, bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}

export function addPngDensity(bytes, dpi) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (source.length < 33 || source[0] !== 137 || source[1] !== 80 || source[2] !== 78 || source[3] !== 71) throw new TypeError("PNG inválido para registrar a resolução física.");
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 600) throw new RangeError("A resolução deve ficar entre 72 e 600 DPI.");
  const density = new Uint8Array(9);
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  writeUint32(density, 0, pixelsPerMeter);
  writeUint32(density, 4, pixelsPerMeter);
  density[8] = 1;
  const chunks = [source.subarray(0, 8)];
  let offset = 8;
  let inserted = false;
  while (offset + 12 <= source.length) {
    const length = ((source[offset] << 24) | (source[offset + 1] << 16) | (source[offset + 2] << 8) | source[offset + 3]) >>> 0;
    const end = offset + length + 12;
    if (end > source.length) throw new TypeError("Chunk PNG incompleto.");
    const type = String.fromCharCode(...source.subarray(offset + 4, offset + 8));
    if (type === "pHYs") { offset = end; continue; }
    chunks.push(source.subarray(offset, end));
    if (type === "IHDR") { chunks.push(pngChunk("pHYs", density)); inserted = true; }
    offset = end;
    if (type === "IEND") break;
  }
  if (!inserted) throw new TypeError("O PNG não contém um cabeçalho IHDR válido.");
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
  return output;
}

export function addJpegDensity(bytes, dpi) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) throw new TypeError("JPEG inválido para registrar a resolução física.");
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 600) throw new RangeError("A resolução deve ficar entre 72 e 600 DPI.");
  const density = Math.round(dpi);
  let offset = 2;
  while (offset + 4 < source.length && source[offset] === 0xff) {
    const marker = source[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (source[offset + 2] << 8) | source[offset + 3];
    if (length < 2 || offset + 2 + length > source.length) break;
    if (marker === 0xe0 && String.fromCharCode(...source.subarray(offset + 4, offset + 9)) === "JFIF\0") {
      const output = source.slice();
      output[offset + 11] = 1;
      output[offset + 12] = (density >>> 8) & 255;
      output[offset + 13] = density & 255;
      output[offset + 14] = (density >>> 8) & 255;
      output[offset + 15] = density & 255;
      return output;
    }
    offset += 2 + length;
  }
  const header = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, density >>> 8, density & 255, density >>> 8, density & 255, 0, 0]);
  const output = new Uint8Array(source.length + header.length);
  output.set(source.subarray(0, 2));
  output.set(header, 2);
  output.set(source.subarray(2), 2 + header.length);
  return output;
}

export async function embedRasterResolution(blob, { format, dpi }) {
  if (!blob || typeof blob.arrayBuffer !== "function") throw new TypeError("Imagem raster inválida.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const output = format === "image/png" ? addPngDensity(bytes, dpi) : format === "image/jpeg" ? addJpegDensity(bytes, dpi) : null;
  if (!output) throw new TypeError("Formato raster físico não suportado.");
  return new Blob([output], { type: format });
}

function bindStudentToManifest(manifest, student) {
  const bound = JSON.parse(JSON.stringify(manifest));
  if (bound.identityCode?.mode === "seven-digit-code") {
    const code = String(student?.code || "");
    if (code && !/^\d{7}$/.test(code)) throw new TypeError("O código nominal precisa conter exatamente sete dígitos.");
    bound.identityCode.student = student || null;
    bound.identityCode.columns = bound.identityCode.columns.map(column => ({ ...column, printedDigit: code ? code[column.index] : "" }));
    bound.identityBubbles = bound.identityBubbles.map(bubble => ({ ...bubble, filled: Boolean(code) && code[bubble.column - 1] === String(bubble.digit) }));
  } else if (bound.identityCode) {
    bound.identityCode.student = student || null;
  }
  return bound;
}

export function buildPrintDocument(template, { header = DEFAULT_CARD_HEADER, students = [], manifest: suppliedManifest = null } = {}) {
  if (!template || !Array.isArray(students)) throw new TypeError("Informe o modelo e a lista de cartões.");
  if (students.length > 500) throw new RangeError("A impressão em lote aceita até 500 cartões por operação.");
  const baseManifest = suppliedManifest || createCardManifest(template, header);
  const roster = students.length ? students : [template.identity?.student || null];
  const pages = roster.map((student, index) => {
    const studentManifest = bindStudentToManifest(baseManifest, student);
    const svg = renderTemplateSvg(template, { header, manifest: studentManifest });
    return `<section class="print-page" data-card="${index + 1}">${svg}</section>`;
  }).join("\n");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartões de resposta</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.print-page{width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;page-break-after:always;break-after:page;overflow:hidden}.print-page:last-child{page-break-after:auto;break-after:auto}.print-page svg{display:block;width:auto;height:auto;max-width:210mm;max-height:297mm}@media screen{body{background:#eee}.print-page{margin:12px auto;background:#fff;box-shadow:0 2px 14px #0002}}@media print{.print-page{margin:0;box-shadow:none}}</style><body>${pages}<script>addEventListener('load',()=>setTimeout(()=>print(),200))</script></body></html>`;
}

export function buildManifestJson(template, { header = DEFAULT_CARD_HEADER, manifest: suppliedManifest = null } = {}) {
  const source = {
    ...template,
    identity: Object.freeze({ ...template.identity, student: null }),
  };
  const manifest = suppliedManifest || createCardManifest(source, header);
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

const LAYOUT_HISTORY_KEY = "salta.omr.layout-history.v1";
const MAX_LAYOUT_HISTORY = 30;

function removeNominalData(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest));
  if (copy.identityCode) {
    delete copy.identityCode.student;
    if (Array.isArray(copy.identityCode.columns)) copy.identityCode.columns = copy.identityCode.columns.map(column => ({ ...column, printedDigit: "" }));
  }
  if (Array.isArray(copy.identityBubbles)) copy.identityBubbles = copy.identityBubbles.map(bubble => ({ ...bubble, filled: false }));
  if (copy.identity) delete copy.identity.student;
  return copy;
}

export function saveLayoutVersion(manifest, storage = globalThis.localStorage) {
  if (!manifest?.contentHash || !manifest?.templateId || !Number.isInteger(manifest.revision)) throw new TypeError("Manifesto versionado inválido.");
  if (!storage) throw new Error("Armazenamento local indisponível neste navegador.");
  const current = JSON.parse(storage.getItem(LAYOUT_HISTORY_KEY) || "[]");
  if (!Array.isArray(current)) throw new TypeError("Histórico local de modelos inválido.");
  const snapshot = removeNominalData(manifest);
  const record = {
    key: `${snapshot.templateId}:r${snapshot.revision}:${snapshot.contentHash}`,
    templateId: snapshot.templateId,
    revision: snapshot.revision,
    contentHash: snapshot.contentHash,
    savedAt: new Date().toISOString(),
    manifest: snapshot,
  };
  const history = [record, ...current.filter(item => item?.key !== record.key)].slice(0, MAX_LAYOUT_HISTORY);
  storage.setItem(LAYOUT_HISTORY_KEY, JSON.stringify(history));
  return record;
}

export function listLayoutVersions(storage = globalThis.localStorage) {
  if (!storage) return [];
  const value = JSON.parse(storage.getItem(LAYOUT_HISTORY_KEY) || "[]");
  return Array.isArray(value) ? value.filter(item => item?.manifest?.contentHash && item.key) : [];
}

export function getLayoutVersion(key, storage = globalThis.localStorage) {
  return listLayoutVersions(storage).find(item => item.key === key) || null;
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
    const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("O navegador não conseguiu exportar a imagem.")), format, quality));
    return await embedRasterResolution(blob, { format, dpi });
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
