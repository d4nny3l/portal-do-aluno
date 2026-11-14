import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAssessmentDefinition } from "../omr/assessment.mjs";
import { createLayoutManifest, INITIAL_GEOMETRY, LayoutCapacityError, validateLayoutManifest } from "../omr/layout.mjs";
import { createTemplate, layoutTemplate, MAX_QUESTIONS_PER_PAGE, PAGE_HEIGHT_MM, PAGE_WIDTH_MM, TEMPLATE_VERSION } from "../omr/template.mjs";
import { DEFAULT_CARD_HEADER, renderHeaderPreviewSvg, renderTemplateSvg } from "../omr/render.mjs";
import { readRaster, READER_VERSION } from "../omr/reader.mjs";
import { addJpegDensity, addPngDensity, buildManifestJson, buildPrintDocument, EXPORT_VERSION, getLayoutVersion, listLayoutVersions, saveLayoutVersion, selectStudentPages, sortStudentRoster } from "../omr/export.mjs";
import { reorderQuestion, reorderSection, restoreAutomaticArrangement } from "../omr/editor.mjs";

const card = (count, type = "A-E", options = {}) => createTemplate([{ type, count, label: "Questões" }], options);

test("assessment definition preserves stable IDs and explicit question numbers", () => {
  const definition = createAssessmentDefinition({ sections: [{ id: "calc", label: "Cálculo", items: [
    { id: "q-8", number: 8, type: "A-D" }, { id: "q-3", number: 3, type: "C-E" },
  ] }] });
  assert.deepEqual(definition.questions.map(item => [item.questionId, item.number]), [["q-8", 8], ["q-3", 3]]);
  assert.throws(() => createAssessmentDefinition({ sections: [{ type: "A-D", count: 151 }] }), /limite lógico/);
  assert.throws(() => createAssessmentDefinition({ sections: [{ type: "A-D", items: [{ number: 1 }, { number: 1 }] }] }), /aparece mais de uma vez/);
});

test("10–150 A–E question cards fit one A4 with fixed circles and equal-width columns", () => {
  assert.equal(TEMPLATE_VERSION, "salta-omr-a4-v7");
  assert.equal(MAX_QUESTIONS_PER_PAGE, 150);
  assert.equal(INITIAL_GEOMETRY.bubbleDiameterMm, 4.5);
  for (const count of [10, 20, 30, 50, 100, 150]) {
    const template = card(count);
    const layout = layoutTemplate(template, { width: 2100, height: 2970 });
    assert.equal(template.pageCount, 1);
    assert.equal(layout.cells.length, count);
    assert.equal(layout.fiducials.length, 4);
    assert.equal(layout.codeGrid.length, 70);
    assert.equal(layout.manifest.pages.length, 1);
    assert.equal(validateLayoutManifest(layout.manifest).valid, true);
    assert.ok(layout.columns >= 2 && layout.columns <= 5);
    if (count === 150) { assert.equal(layout.columns, 5); assert.ok(layout.manifest.geometry.objectiveRowPitchMm >= 4.85); assert.ok(layout.manifest.geometry.objectiveRowPitchMm < 6.2); }
    assert.ok(layout.manifest.sections.every(group => group.height === 4.5));
    if (count >= 20) assert.equal(layout.manifest.sections.filter(group => group.label === "Questões").length, 1, "A section title is printed only at its first physical occurrence");
    for (const cell of layout.cells) {
      assert.equal(cell.bubbles.length, 5);
      assert.ok(Math.abs(cell.bubbleRadius * 2 - 4.5 * 10) < 1e-7);
      for (const bubble of cell.bubbles) {
        assert.ok(bubble.x >= 0 && bubble.x <= layout.width);
        assert.ok(bubble.y >= 0 && bubble.y <= layout.height);
      }
    }
  }
});

test("all four response formats render from the same millimetre manifest", () => {
  for (const type of ["A-D", "A-E", "C-E", "CDU"]) {
    const manifest = createLayoutManifest({ sections: [{ label: `Formato ${type}`, type, count: type === "CDU" ? 2 : 10 }] });
    assert.equal(manifest.questionCount, type === "CDU" ? 2 : 10);
    assert.equal(manifest.pages.length, 1);
    assert.equal(validateLayoutManifest(manifest).valid, true);
    if (type === "CDU") assert.equal(manifest.questions[0].bubbles.length, 30);
    else assert.equal(manifest.questions[0].bubbles.length, type === "A-D" ? 4 : type === "A-E" ? 5 : 2);
  }
  assert.throws(() => layoutTemplate(card(2, "CDU"), { width: 420, height: 594 }), /não interpreta respostas C-D-U/);
});

test("case matrix T01–T15 produces the planned acceptance decisions", () => {
  const cases = [
    ["T01", { mode: "embedded", embeddedSize: { widthMm: 100, heightMm: 180 }, identityMode: "manual" }, [{ type: "A-E", count: 10 }], true],
    ["T02", {}, [{ type: "A-D", count: 20 }], true],
    ["T03", { student: { code: "7654321" } }, [{ type: "A-E", count: 50 }], true],
    ["T04", {}, [{ type: "A-D", count: 15 }, { type: "A-E", count: 20 }, { type: "C-E", count: 10 }], true],
    ["T05", {}, [{ type: "A-E", count: 100 }], true],
    ["T06", {}, [{ type: "A-E", count: 150 }], true],
    ["T07", {}, [{ type: "A-D", count: 50 }, { type: "A-E", count: 50 }, { type: "CDU", count: 50 }], false],
    ["T08", {}, [{ type: "A-E", count: 65 }, { type: "CDU", count: 5 }], true],
    ["T09", {}, [{ type: "CDU", count: 20 }, { type: "A-E", count: 80 }], false],
    ["T10", { identityMode: "qr" }, [{ type: "A-E", count: 15 }], false],
    ["T11", {}, [{ type: "A-E", count: 150 }], true],
    ["T12", { identityMode: "manual" }, [{ type: "C-E", count: 30 }], true],
  ];
  for (const [id, options, sections, expected] of cases) {
    const template = createTemplate(sections, options);
    let valid = true;
    try { createLayoutManifest(template); } catch { valid = false; }
    assert.equal(valid, expected, `${id} has an unexpected physical-fit result`);
  }
});

test("embedded card SVG preserves its smaller physical size and prints centered on A4", () => {
  const template = card(10, "A-E", { mode: "embedded", embeddedSize: { widthMm: 100, heightMm: 180 }, identityMode: "manual" });
  const svg = renderTemplateSvg(template);
  assert.match(svg, /width="100mm" height="180mm" viewBox="0 0 100 180"/);
  assert.match(svg, /<line x1="19" y1="33\.3" x2="93"/);
  const printHtml = buildPrintDocument(template);
  assert.match(printHtml, /width:210mm;height:297mm;display:flex;align-items:center;justify-content:center/);
  assert.match(printHtml, /width="100mm" height="180mm"/);
  assert.throws(() => createLayoutManifest(card(1, "A-D", { mode: "embedded", embeddedSize: { widthMm: 100, heightMm: 180 } })), /sete dígitos exige quadro incorporável/);
});

test("mixed sections remain identified and question numbers are not renumbered", () => {
  const input = { sections: [
    { id: "s-a", label: "Múltipla escolha A–D", type: "A-D", items: [{ id: "question-10", number: 10 }, { id: "question-2", number: 2 }] },
    { id: "s-b", label: "Certo ou errado", type: "C-E", items: [{ id: "question-31", number: 31 }] },
    { id: "s-c", label: "Centena, dezena e unidade", type: "CDU", items: [{ id: "question-70", number: 70 }] },
  ] };
  const manifest = createLayoutManifest(input);
  assert.deepEqual(manifest.questions.map(question => question.number), [10, 2, 31, 70]);
  assert.deepEqual([...new Set(manifest.sections.map(section => section.label))], ["Múltipla escolha A–D", "Certo ou errado", "Centena, dezena e unidade"]);
});

test("visual reorder keeps reader key indexing tied to stable question numbers", () => {
  const template = createTemplate([
    { sectionId: "visually-first", label: "Seção visual primeiro", type: "A-D", items: [{ questionId: "q2", number: 2 }] },
    { sectionId: "visually-second", label: "Seção visual depois", type: "C-E", items: [{ questionId: "q1", number: 1 }] },
  ], { identityMode: "manual" });
  assert.deepEqual(template.layoutQuestions.map(question => question.number), [2, 1]);
  assert.deepEqual(template.questions.map(question => [question.number, question.type]), [[1, "C-E"], [2, "A-D"]]);
  const layout = layoutTemplate(template, { width: 420, height: 594 });
  assert.deepEqual(layout.cells.map(question => [question.number, question.type]), [[1, "C-E"], [2, "A-D"]]);
  assert.ok(layout.cells[0].y > layout.cells[1].y, "Question 1 remains in its visually reordered position");
  const pixels = new Uint8Array(420 * 594).fill(255);
  const questionOneE = layout.cells[0].bubbles.find(bubble => bubble.choice === "E");
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) pixels[(Math.round(questionOneE.y) + y) * 420 + Math.round(questionOneE.x) + x] = 0;
  const output = readRaster(template, pixels, 420, 594);
  assert.equal(output.observations[0].number, 1);
  assert.equal(output.observations[0].answer, "E");
});

test("visual editor preserves IDs and numbers, creates a new revision, and restores auto order", () => {
  const definition = createAssessmentDefinition({ sections: [
    { id: "one", label: "Um", type: "A-D", items: [{ id: "q-one", number: 1 }, { id: "q-two", number: 2 }] },
    { id: "two", label: "Dois", type: "C-E", items: [{ id: "q-three", number: 3 }] },
  ] }, { revision: 5 });
  const moved = reorderQuestion(definition, "q-two", -1);
  assert.equal(moved.revision, 6);
  assert.deepEqual(moved.questions.map(question => [question.questionId, question.number]), [["q-two", 2], ["q-one", 1], ["q-three", 3]]);
  const movedSection = reorderSection(moved, "two", -1);
  assert.deepEqual(movedSection.sections.map(section => section.sectionId), ["two", "one"]);
  const restored = restoreAutomaticArrangement(movedSection);
  assert.deepEqual(restored.sections.map(section => section.sectionId), ["one", "two"]);
  assert.deepEqual(restored.sections[0].questions.map(question => question.number), [1, 2]);
});

test("seven-digit identity has seven aligned columns, 70 fixed bubbles and nominal prefill", () => {
  const template = card(10, "A-D", { student: { code: "0123456", name: "Aluno sintético", className: "Turma sintética" } });
  const manifest = createLayoutManifest(template);
  assert.equal(manifest.identityCode.columns.length, 7);
  assert.equal(manifest.identityBubbles.length, 70);
  assert.equal(manifest.identityBubbles.filter(bubble => bubble.filled).length, 7);
  assert.deepEqual(manifest.identityBubbles.filter(bubble => bubble.filled).map(bubble => bubble.digit), [0, 1, 2, 3, 4, 5, 6]);
  for (const column of manifest.identityCode.columns) assert.equal(column.box.centerX, column.centerX);
  assert.throws(() => card(1, "A-D", { student: { code: "123" } }), /exatamente sete dígitos/);
});

test("manual identity omits the bubble grid and QR is blocked without an authorized encoder", () => {
  const manual = card(10, "A-D", { identityMode: "manual" });
  assert.equal(createLayoutManifest(manual).identityBubbles.length, 0);
  assert.throws(() => createLayoutManifest(card(10, "A-D", { identityMode: "qr" })), LayoutCapacityError);
});

test("150 A–E fit one A4 by compacting row pitch without shrinking 4.5 mm bubbles", () => {
  const manifest = createLayoutManifest(card(150));
  assert.equal(manifest.pages.length, 1);
  assert.equal(manifest.columns.length, 5);
  assert.equal(manifest.geometry.bubbleDiameterMm, 4.5);
  assert.ok(manifest.geometry.objectiveRowPitchMm >= 4.85);
  assert.equal(manifest.questions.length, 150);
  assert.equal(card(150).pageCount, 1);
  assert.throws(() => layoutTemplate(card(10), { width: 210, height: 297, page: 2 }), /única página/);
});

test("layout validator detects forced collisions and does not repair them silently", () => {
  const manifest = createLayoutManifest(card(10, "A-D", { identityMode: "manual" }));
  const mutated = structuredClone(manifest);
  mutated.questions[1].bubbles[0].x = mutated.questions[0].bubbles[0].x;
  mutated.questions[1].bubbles[0].y = mutated.questions[0].bubbles[0].y;
  const result = validateLayoutManifest(mutated);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("Colisão")));
});

test("section rules, questions and footer stay inside the black border with a physical gap", () => {
  for (const template of [card(30, "A-E"), card(2, "CDU", { mode: "embedded", embeddedSize: { widthMm: 90, heightMm: 180 }, identityMode: "manual" })]) {
    const manifest = createLayoutManifest(template);
    const border = manifest.technicalRegions.border;
    for (const section of manifest.sections) {
      assert.ok(section.x >= border.x + 4);
      assert.ok(section.x + section.width <= border.x + border.width - 4);
    }
    for (const question of manifest.questions) {
      assert.ok(question.x >= border.x + 4);
      assert.ok(question.x + question.width <= border.x + border.width - 4);
    }
    const svg = renderTemplateSvg(template);
    assert.match(svg, /class="omr-card-border"/);
    const footerY = Number(svg.match(/<text x="[^"]+" y="([^"]+)"[^>]*>MODELO/)?.[1]);
    assert.ok(footerY < border.y + border.height);
  }
});

test("dense mixed CDU layout is rejected when it exceeds the physical A4 region", () => {
  const sections = [
    { type: "CDU", count: 20, label: "C-D-U" },
    { type: "A-E", count: 80, label: "Objetivas" },
  ];
  assert.throws(() => createLayoutManifest({ sections }), LayoutCapacityError);
});

test("SVG uses A4 physical dimensions, black-and-white marks, labels, code boxes and stable IDs", () => {
  const template = card(20, "A-E", { student: { code: "0001200" } });
  const svg = renderTemplateSvg(template, { header: { ...DEFAULT_CARD_HEADER, institution: "CEM 02" } });
  assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
  assert.match(svg, /data-page="1\/1"/);
  assert.match(svg, /data-template-version="salta-omr-layout-v1-r7"/);
  assert.equal((svg.match(/class="omr-fiducial"/g) || []).length, 4);
  assert.match(svg, /class="omr-card-border"[^>]*x="12" y="12"/);
  assert.equal((svg.match(/class="omr-answer-bubble"/g) || []).length, 100);
  assert.equal((svg.match(/class="omr-identity-bubble"/g) || []).length, 70);
  assert.equal((svg.match(/class="omr-question"/g) || []).length, 20);
  assert.match(svg, /fill="#fff" stroke="#000"/);
  assert.doesNotMatch(svg, /#fafbfe|#c8cad5|SALTA OMR/);
  assert.match(renderHeaderPreviewSvg(DEFAULT_CARD_HEADER), /viewBox="0 0 210 95"/);
});

test("reader adapter consumes matching v5 coordinates and keeps uncertain answers for review", () => {
  assert.equal(READER_VERSION, "salta-omr-reader-v4");
  const template = card(10, "A-D");
  const width = 420, height = 594;
  const layout = layoutTemplate(template, { width, height });
  const pixels = new Uint8Array(width * height).fill(255);
  const selected = layout.cells[0].bubbles[2];
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) pixels[(Math.round(selected.y) + y) * width + Math.round(selected.x) + x] = 0;
  const output = readRaster(template, pixels, width, height);
  assert.equal(output.observations[0].answer, "C");
  assert.equal(output.observations[0].state, "read");
  const blank = readRaster(template, new Uint8Array(width * height).fill(255), width, height);
  assert.equal(blank.observations[0].state, "blank");
  assert.equal(blank.needsReview, true);
});

test("optional header text is escaped and external logo URLs remain excluded", () => {
  const svg = renderTemplateSvg(card(10, "A-D"), { header: { ...DEFAULT_CARD_HEADER, institution: "<script>alert(1)</script>", logo: "https://example.org/logo.png" } });
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(svg, /<image href="https?:/);
});

test("print export creates exactly N isolated A4 pages and omits student codes from JSON", () => {
  const template = card(10, "A-D", { student: { code: "1234567", name: "Aluno sintético" } });
  const document = buildPrintDocument(template, { students: Array.from({ length: 32 }, (_, index) => ({ code: String(index + 1).padStart(7, "0") })) });
  assert.equal((document.match(/class="print-page"/g) || []).length, 32);
  assert.equal((document.match(/width="210mm" height="297mm"/g) || []).length, 32);
  assert.match(document, /@page\{size:A4 portrait;margin:0\}/);
  const json = buildManifestJson(template);
  assert.equal(JSON.parse(json).exportVersion, EXPORT_VERSION);
  assert.doesNotMatch(json, /1234567|Aluno sintético/);
  assert.equal(JSON.parse(json).manifest.identityBubbles.filter(bubble => bubble.filled).length, 0);
});

test("nominal student names and classes appear in code and manual cards and structured PDF batch", () => {
  const student = { name: "Aluna Sintética", className: "2º A Sintética", code: "0001200" };
  const coded = card(5, "A-D", { student });
  const codedSvg = renderTemplateSvg(coded, { header: { ...DEFAULT_CARD_HEADER, institution: "Escola Sintética", title: "Prova de Matemática", subject: "Matemática", className: "2º A", date: "2026-11-10", visible: { ...DEFAULT_CARD_HEADER.visible, subject: true, className: true, date: true } } });
  assert.match(codedSvg, /Aluna Sintética/);
  assert.match(codedSvg, /2º A Sintética/);
  assert.match(codedSvg, /Prova de Matemática/);
  assert.match(codedSvg, /Matemática/);
  assert.equal((codedSvg.match(/class="omr-identity-bubble"[^>]*fill="#000"/g) || []).length, 7);
  const manual = card(5, "A-D", { identityMode: "manual", student: { name: student.name, className: student.className } });
  const manualSvg = renderTemplateSvg(manual);
  assert.match(manualSvg, /Aluna Sintética/);
  assert.match(manualSvg, /2º A Sintética/);
  const html = buildPrintDocument(coded, { students: [student, { ...student, name: "Aluno Sintético Dois", code: "0001201" }] });
  assert.equal((html.match(/class="print-page"/g) || []).length, 2);
  assert.match(html, /Aluna Sintética/);
  assert.match(html, /Aluno Sintético Dois/);
  assert.match(html, /2º A Sintética/);
  assert.equal((html.match(/class="omr-identity-bubble"[^>]*fill="#000"/g) || []).length, 14);
});

test("CDU draws digits inside each C/D/U bubble and three aligned handwritten boxes per original question", () => {
  const template = createTemplate([{ type: "A-E", label: "Objetivas", items: [{ number: 2, type: "A-E" }] }, { type: "CDU", label: "Numéricas", items: [{ number: 8, type: "CDU" }, { number: 12, type: "CDU" }] }], { identityMode: "manual" });
  const manifest = createLayoutManifest(template);
  const svg = renderTemplateSvg(template);
  const numericQuestions = manifest.questions.filter(question => question.type === "CDU");
  assert.deepEqual(numericQuestions.map(question => question.number), [8, 12]);
  assert.ok(numericQuestions.every(question => question.responseBoxes.length === 3 && question.bubbles.length === 30));
  assert.equal((svg.match(/class="omr-cdu-response-box"/g) || []).length, 6);
  assert.equal((svg.match(/data-place="[CDU]" data-digit="[0-9]"/g) || []).length, 60);
  for (const question of numericQuestions) for (const box of question.responseBoxes) {
    const firstBubble = question.bubbles.find(bubble => bubble.place === box.place && bubble.digit === 0);
    assert.equal(firstBubble.x, box.centerX);
    assert.ok(firstBubble.y - firstBubble.radiusMm > box.y + box.height);
  }
});

test("header content is versioned while student PII does not change geometry hash", () => {
  const first = card(8, "A-E", { student: { name: "Pessoa Um", className: "Turma Um", code: "0000001" }, title: "Avaliação A", schoolName: "Escola A", metadata: { subject: "Matemática", className: "1º A", date: "2026-11-10", teacher: "Professor A" } });
  const second = card(8, "A-E", { student: { name: "Pessoa Dois", className: "Turma Dois", code: "0000002" }, title: "Avaliação A", schoolName: "Escola A", metadata: { subject: "Matemática", className: "1º A", date: "2026-11-10", teacher: "Professor A" } });
  assert.equal(createLayoutManifest(first).contentHash, createLayoutManifest(second).contentHash);
  const otherHeader = card(8, "A-E", { title: "Avaliação B", schoolName: "Escola A", metadata: { subject: "Matemática", className: "1º A", date: "2026-11-10", teacher: "Professor A" } });
  assert.notEqual(createLayoutManifest(first).contentHash, createLayoutManifest(otherHeader).contentHash);
  const visibleField = card(8, "A-E", { metadata: { customFields: [{ label: "Sala", value: "12", visible: true }] } });
  const hiddenField = card(8, "A-E", { metadata: { customFields: [{ label: "Sala", value: "12", visible: false }] } });
  assert.notEqual(createLayoutManifest(visibleField).contentHash, createLayoutManifest(hiddenField).contentHash);
});

test("layout version history keeps exact local geometry without student identity data", () => {
  const storage = { value: "[]", getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
  const template = card(7, "A-D", { student: { name: "Não guardar", className: "Não guardar turma", code: "1234567" } });
  const manifest = createLayoutManifest(template);
  const saved = saveLayoutVersion(manifest, storage);
  assert.equal(listLayoutVersions(storage).length, 1);
  assert.equal(getLayoutVersion(saved.key, storage).manifest.contentHash, manifest.contentHash);
  assert.deepEqual(getLayoutVersion(saved.key, storage).manifest.questions.map(question => question.questionId), manifest.questions.map(question => question.questionId));
  assert.doesNotMatch(storage.value, /Não guardar|1234567/);
});

test("PNG and JPG exports record their 300 DPI print density", () => {
  const png = new Uint8Array(45);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  png.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 16);
  png.set([0, 0, 0, 0], 29);
  png.set([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0], 33);
  const output = addPngDensity(png, 300);
  const pHYs = new TextDecoder().decode(output).indexOf("pHYs");
  assert.ok(pHYs > 0);
  const pixelsPerMeter = ((output[pHYs + 4] << 24) | (output[pHYs + 5] << 16) | (output[pHYs + 6] << 8) | output[pHYs + 7]) >>> 0;
  assert.equal(Math.round(pixelsPerMeter * 0.0254), 300);
  assert.throws(() => addPngDensity(png, 50), /72 e 600 DPI/);
  const jpeg = addJpegDensity(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 300);
  assert.deepEqual([...jpeg.slice(13, 18)], [1, 1, 44, 1, 44]);
});

test("batch roster defaults alphabetically and selects explicit 1-based page ranges", () => {
  const students = [
    { name: "Zélia", className: "2º B", code: "0000003" },
    { name: "ana", className: "1º A", code: "0000001" },
    { name: "Bruno", className: "1º A", code: "0000002" },
  ];
  assert.deepEqual(sortStudentRoster(students).map(item => item.name), ["ana", "Bruno", "Zélia"]);
  assert.deepEqual(sortStudentRoster(students, "input"), students);
  const sorted = sortStudentRoster(students);
  assert.deepEqual(selectStudentPages(sorted, "1, 3-3").map(item => item.name), ["ana", "Zélia"]);
  assert.deepEqual(selectStudentPages(sorted, "").map(item => item.name), ["ana", "Bruno", "Zélia"]);
  assert.throws(() => selectStudentPages(sorted, "1, quatro"), /formato 1, 3-5/);
  assert.throws(() => selectStudentPages(sorted, "2-4"), /entre 1 e 3/);
  assert.throws(() => sortStudentRoster(students, "random"), /desconhecida/);
});

test("browser modules pin generator assets and keep the legacy route intact", async () => {
  const [renderSource, readerSource, pageSource, teacherSource, themeSource, corretorCss, legacyRoute] = await Promise.all([
    readFile(new URL("../omr/render.mjs", import.meta.url), "utf8"),
    readFile(new URL("../omr/reader.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../../plataforma/corretor-v2.html", import.meta.url), "utf8"),
    readFile(new URL("../../../plataforma/professor.html", import.meta.url), "utf8"),
    readFile(new URL("../../../plataforma/professor-theme.css", import.meta.url), "utf8"),
    readFile(new URL("../../../plataforma/corretor-v2.css", import.meta.url), "utf8"),
    readFile(new URL("../../../corretor/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(renderSource, /from ["']\.\/template\.mjs\?v=20261110c["']/);
  assert.match(readerSource, /from ["']\.\/template\.mjs\?v=20261110c["']/);
  assert.match(pageSource, /omr\/(?:template|render|reader|normalize|export)\.mjs\?v=20261110c/g);
  assert.match(teacherSource, /corretor-v2\.html\?v=20261110ux1/g);
  assert.match(teacherSource, /professor-theme\.css\?v=20261110ux1/);
  assert.match(pageSource, /professor-theme\.css\?v=20261110ux1/);
  assert.doesNotMatch(pageSource, /id="dashboard"/);
  assert.match(pageSource, /class="corretor-card module-view active" id="criar"/);
  assert.match(pageSource, /data-view="criar"/);
  assert.doesNotMatch(pageSource, /id="modelos"|id="minhas"|id="revisoes"|id="analise"/);
  assert.match(pageSource, /id="manualAlign"/);
  assert.match(pageSource, /id="captureHistory"/);
  assert.match(pageSource, /id="restoreArrangement"/);
  assert.match(pageSource, /function currentSvg\(\)\{if\(!template\|\|!activeManifest\|\|!activeSvg\)/);
  assert.match(pageSource, /id="batchOrder"[\s\S]*?Alfabética \(padrão\)/);
  assert.match(pageSource, /id="batchPages"/);
  assert.match(pageSource, /sortStudentRoster\(students,\$\('batchOrder'\)\.value\)/);
  assert.match(pageSource, /selectStudentPages\(ordered,\$\('batchPages'\)\.value\)/);
  assert.doesNotMatch(pageSource, /onclick="window\.print\(\)"/);
  assert.match(legacyRoute, /location\.replace\('\.\.\/plataforma\/corretor-v2\.html/);
  assert.match(pageSource, /class="modules-grid"/);
  assert.equal((pageSource.match(/class="module-card secondary" data-go=/g) || []).length, 3);
  assert.doesNotMatch(pageSource, /corretor-grid|corretor-link/);
  assert.ok(themeSource.includes(".modules-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}"));
  assert.ok(corretorCss.includes("@media(max-width:760px)"));
});
