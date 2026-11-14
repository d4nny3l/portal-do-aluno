// Presentation only: all optical coordinates remain owned by layout.mjs.
export const ARTWORK_VERSION = "salta-card-artwork-v1";

export function brazilianDate(value) {
  const text = String(value || "");
  if (!text) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new RangeError("Informe uma data válida no formato ano-mês-dia.");
  const [, year, month, day] = match;
  const date = new Date(`${text}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new RangeError("A data da avaliação não existe no calendário.");
  return `${day}/${month}/${year}`;
}

// Conservative Arial widths in em. Never stretch/compress glyphs to fit.
export function textWidth(value, size) {
  return [...String(value)].reduce((sum, char) => sum +
    (/\s/.test(char) ? 0.32 : /[MW@%]/.test(char) ? 1 : /[ilI1.,:;!|]/.test(char) ? 0.36 : /[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ0-9]/.test(char) ? 0.79 : 0.66), 0) * size;
}

export function wrapText(value, width, size) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (textWidth(word, size) > width) throw new RangeError("Um texto do cartão é longo demais para sua região. Use palavras menores ou um cabeçalho mais amplo.");
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size) > width) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

export function headerArtwork(manifest, header) {
  const embedded = manifest.mode === "embedded";
  const compact = header.layout === "compact";
  const border = manifest.technicalRegions.border;
  const left = embedded ? 14 : border.x + 2, right = embedded ? manifest.paper.widthMm - 14 : border.x + border.width - 2;
  const width = right - left, center = manifest.paper.widthMm / 2;
  const coded = manifest.identity.mode === "seven-digit-code";
  const protectedZone = manifest.technicalRegions.identityGrid || manifest.technicalRegions.qr;
  const bodyRight = protectedZone ? protectedZone.x - 5 : right;
  const texts = [], rules = [], logos = [];
  const visible = key => header.visible?.[key] ?? ["institution", "title", "studentName"].includes(key);
  function block(id, value, x, y, w, h, size, { centerText = false, weight = 400 } = {}) {
    const lines = wrapText(value, w, size);
    const pitch = size * 1.3;
    if (lines.length * pitch > h + 1e-6) throw new RangeError(`O campo ${id} não cabe no cabeçalho sem sobreposição. Encurte o texto ou reduza os campos opcionais.`);
    const region = { id, x, y, width: w, height: lines.length * pitch };
    lines.forEach((text, index) => texts.push({ ...region, text, baseline: y + size + index * pitch, textX: centerText ? x + w / 2 : x, size, weight, anchor: centerText ? "middle" : "start" }));
    return lines.length * pitch;
  }
  const top = 14, topEnd = 27.5;
  const maxLogoHeight = topEnd - top - 1;
  for (const [key, aspectKey, widthKey, side] of [["logo", "logoAspect", "logoWidthMm", "left"], ["secondaryLogo", "secondaryLogoAspect", "secondaryLogoWidthMm", "right"]]) {
    if (!header[key]) continue;
    const aspect = Number(header[aspectKey]) > 0 ? Number(header[aspectKey]) : 1;
    const w = Math.min(Number(header[widthKey]) || 22, embedded ? 16 : 26, maxLogoHeight * aspect);
    logos.push({ href: header[key], x: side === "left" ? left : right - w, y: top, width: w, height: w / aspect });
  }
  const logoReserve = logos.length ? Math.max(...logos.map(logo => logo.width)) + 4 : 0;
  const titleWidth = width - logoReserve * 2;
  let y = top;
  if (visible("institution")) y += block("instituição", header.institution || manifest.header.schoolName, center - titleWidth / 2, y, titleWidth, topEnd - y, embedded ? 2.5 : compact ? 2.8 : 3.1, { centerText: true, weight: 700 });
  if (visible("title")) y += block("título", header.title || manifest.header.title, center - titleWidth / 2, y, titleWidth, topEnd - y, embedded ? 3.2 : compact ? 3.6 : 4, { centerText: true, weight: 700 });
  const fields = [["Professor", "teacher"], ["Componente", "subject"], ["Turma", "className"], ["Ano/série", "grade"], ["Data", "date"], ["Ano letivo", "schoolYear"]]
    .filter(([, key]) => visible(key) && (header[key] || manifest.header[key]))
    .map(([label, key]) => [label, key === "date" ? brazilianDate(header[key] || manifest.header[key]) : header[key] || manifest.header[key]]);
  fields.push(...(header.customFields || []).filter(field => field?.visible !== false && field.label && field.value).map(field => [field.label, field.value]));
  const bodyTop = embedded && !coded ? 28 : 30;
  const bodyEnd = embedded && !coded ? 29 : (coded ? 61 : 44);
  const cols = embedded ? 1 : coded && !compact ? 2 : 3;
  const cellWidth = (bodyRight - left - (cols - 1) * 4) / cols;
  y = bodyTop;
  for (let index = 0; index < fields.length; index += cols) {
    let rowHeight = 0;
    for (let column = 0; column < cols && index + column < fields.length; column++) {
      const [label, value] = fields[index + column];
      rowHeight = Math.max(rowHeight, block(label, `${label}: ${value}`, left + column * (cellWidth + 4), y, cellWidth, bodyEnd - y, embedded ? 2.2 : 2.5));
    }
    rules.push({ x1: left, y1: y + rowHeight + 0.5, x2: bodyRight, y2: y + rowHeight + 0.5 });
    y += rowHeight + 1.2;
  }
  const student = manifest.identityCode.student || manifest.identity.student;
  y = embedded ? (coded ? 64 : 31) : coded ? 65 : 46;
  const studentEnd = embedded && !coded ? 38 : coded ? 82 : 57;
  const studentRows = [];
  if (visible("studentName") && manifest.identity.showName) studentRows.push(["Nome", student?.name]);
  if (manifest.identity.showClass) studentRows.push(["Turma", student?.className]);
  for (const [label, value] of studentRows) {
    const height = block(label, `${label}: ${value || ""}`, left, y, bodyRight - left, studentEnd - y, embedded ? 2.3 : 2.8);
    if (!value) rules.push({ x1: left + 15, y1: y + 2.8, x2: bodyRight, y2: y + 2.8 });
    y += height + 1;
  }
  if (coded) block("instrução do código", "Código: preencha uma opção em cada coluna.", left, 85, bodyRight - left, 5, 2.2);
  if (fields.length) rules.push({ x1: left, y1: bodyTop - 1, x2: bodyRight, y2: bodyTop - 1 });
  const headerBottom = embedded && !coded ? 38.5 : coded ? 88 : 57.5;
  rules.push({ x1: border.x, y1: headerBottom, x2: border.x + border.width, y2: headerBottom });
  const dividerY = 28;
  rules.push({ x1: border.x, y1: dividerY, x2: border.x + border.width, y2: dividerY });
  if (coded) rules.push({ x1: bodyRight + 2, y1: dividerY, x2: bodyRight + 2, y2: manifest.identityCode.y + manifest.identityCode.height + 2 });
  return { texts, rules, logos, bodyRight };
}

export function sectionFrames(manifest) {
  const groups = [];
  for (const question of manifest.questions) {
    // CDU rows occupy their own horizontal region; objective columns keep
    // their existing layout, including continued sections with no title gap.
    const key = `${question.sectionId}:${question.region || "objective"}:${question.region === "CDU" ? "all" : question.columnIndex}`;
    let group = groups.find(item => item.key === key);
    if (!group) { group = { key, questions: [] }; groups.push(group); }
    group.questions.push(question);
  }
  return groups.map(group => {
    const first = group.questions[0];
    const source = manifest.sections.find(section => section.sectionId === first.sectionId && (first.region === "CDU" ? section.region === "CDU" : section.columnIndex === first.columnIndex));
    const x = Math.min(...group.questions.map(q => q.x));
    const bottom = Math.max(...group.questions.map(q => q.y + q.height));
    const y = source && source.y < first.y ? source.y : first.y - 4.5;
    const width = first.region === "CDU" ? manifest.contentBoundsMm.width : first.width;
    const label = source?.label || manifest.sections.find(section => section.sectionId === first.sectionId)?.label || "Seção";
    const size = 2.3;
    // Fixed geometry cannot make room for arbitrarily long column titles.
    // Reject instead of shrinking print or moving optical coordinates.
    if (textWidth(label, size) > width - 2) throw new RangeError(`O título da seção “${label}” não cabe na coluna. Encurte o título ou selecione menos colunas.`);
    return { sectionId: first.sectionId, x, y, width, height: bottom - y, label, size, questions: group.questions.map(q => q.questionId) };
  });
}
