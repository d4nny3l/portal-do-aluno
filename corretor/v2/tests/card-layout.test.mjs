import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTemplate, layoutTemplate, MAX_QUESTIONS_PER_PAGE, PAGE_HEIGHT_MM, PAGE_WIDTH_MM, TEMPLATE_VERSION } from "../omr/template.mjs";
import { DEFAULT_CARD_HEADER, renderHeaderPreviewSvg, renderTemplateSvg } from "../omr/render.mjs";
import { readRaster, READER_VERSION } from "../omr/reader.mjs";

const card = count => createTemplate([{ type: "A-E", count, label: "Questões" }]);

test("template version v3 publishes a compact horizontal-choice A4 geometry", () => {
  assert.equal(TEMPLATE_VERSION, "salta-omr-a4-v3");
  for (const count of [10, 20, 30, 50, 100]) {
    const template = card(count);
    assert.equal(template.revision, 3);
    assert.equal(template.pageCount, Math.ceil(count / MAX_QUESTIONS_PER_PAGE));
    for (let page = 1; page <= template.pageCount; page++) {
      const geometry = layoutTemplate(template, { width: PAGE_WIDTH_MM, height: PAGE_HEIGHT_MM, page });
      const pageCount = Math.min(MAX_QUESTIONS_PER_PAGE, count - (page - 1) * MAX_QUESTIONS_PER_PAGE);
      assert.equal(geometry.cells.length, pageCount);
      assert.equal(geometry.fiducials.length, 4);
      assert.equal(geometry.codeGrid.length, 70);
      assert.ok(geometry.rowPitch >= 7.1, `${count} questões, página ${page}: pitch ${geometry.rowPitch}`);
      assert.ok(geometry.rowPitch <= 10.5 + 1e-8);
      assert.equal(geometry.columns, Math.min(3, Math.ceil(pageCount / 4)));
      for (const cell of geometry.cells) {
        assert.ok(cell.bubbleRadius * 2 >= 4.8, "bolhas têm diâmetro físico mínimo de 4,8 mm");
        assert.ok(cell.y >= 90 && cell.y <= 281);
        assert.equal(cell.bubbles.length, 5);
        for (let i = 0; i < cell.bubbles.length; i++) {
          const bubble = cell.bubbles[i];
          assert.ok(bubble.x - cell.bubbleRadius >= 4 && bubble.x + cell.bubbleRadius <= PAGE_WIDTH_MM - 4);
          assert.ok(bubble.y - cell.bubbleRadius >= 4 && bubble.y + cell.bubbleRadius <= PAGE_HEIGHT_MM - 4);
          if (i) assert.ok(Math.abs((bubble.x - cell.bubbles[i - 1].x) - 8) < 1e-8);
        }
      }
      for (const fiducial of geometry.fiducials) {
        assert.ok(fiducial.x - fiducial.size / 2 >= 4);
        assert.ok(fiducial.y - fiducial.size / 2 >= 4);
        assert.ok(fiducial.x + fiducial.size / 2 <= PAGE_WIDTH_MM - 4);
        assert.ok(fiducial.y + fiducial.size / 2 <= PAGE_HEIGHT_MM - 4);
      }
      for (const dot of geometry.codeGrid) {
        assert.ok(dot.x - dot.radius > 150 && dot.x + dot.radius < 197);
        assert.ok(dot.y - dot.radius >= 49 && dot.y + dot.radius < 90);
      }
    }
  }
});

test("mixed answer formats are grouped and never overlap section labels", () => {
  const template = createTemplate([
    { type: "A-D", count: 10, label: "Múltipla escolha" },
    { type: "A-E", count: 20, label: "Questões ampliadas" },
    { type: "C-E", count: 10, label: "Certo ou errado" },
  ]);
  const geometry = layoutTemplate(template, { width: PAGE_WIDTH_MM, height: PAGE_HEIGHT_MM });
  assert.deepEqual([...new Set(geometry.cells.map(cell => cell.type))], ["A-D", "A-E", "C-E"]);
  assert.ok(geometry.groups.some(group => group.label === "Múltipla escolha"));
  assert.ok(geometry.groups.some(group => group.label === "Certo ou errado"));
  for (const group of geometry.groups) {
    const cellRows = geometry.cells.filter(cell => cell.sectionIndex === group.sectionIndex && cell.x >= group.x && cell.x < group.x + group.width);
    assert.ok(cellRows.every(cell => cell.y > group.y));
    assert.ok(cellRows.every(cell => cell.bubbles.every(bubble => bubble.y - 2.45 > group.y + 4 && bubble.y + 2.45 < group.y + group.height)));
  }
});

test("SVG pages print at A4, retain markers and omit SALTA branding from visible copy", () => {
  const template = card(100);
  const svg = renderTemplateSvg(template, { page: 2, header: DEFAULT_CARD_HEADER });
  assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
  assert.match(svg, /data-page="2\/2"/);
  assert.match(svg, /data-template-version="salta-omr-a4-v3"/);
  assert.match(svg, /TEMPLATE OMR-A4-v3/);
  assert.equal((svg.match(/class="omr-fiducial"/g) || []).length, 4);
  assert.equal((svg.match(/class="omr-answer-bubble"/g) || []).length, 250);
  const visibleCopy = [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(match => match[1]).join(" ");
  assert.doesNotMatch(visibleCopy, /salta/i);
  assert.match(svg, /Código do aluno/);
  assert.match(renderHeaderPreviewSvg(DEFAULT_CARD_HEADER), /viewBox="0 0 210 95"/);
});

test("optional headers escape text and reject external image URLs", () => {
  const template = card(10);
  const svg = renderTemplateSvg(template, { header: { ...DEFAULT_CARD_HEADER, institution: "<script>alert(1)</script>", logo: "https://example.com/logo.png" } });
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(svg, /<image href="https?:/);
});

test("reader uses matching v3 coordinates and supports page two", () => {
  assert.equal(READER_VERSION, "salta-omr-reader-v3");
  const template = card(100);
  const width = 420;
  const height = 594;
  const geometry = layoutTemplate(template, { width, height, page: 1 });
  const pixels = new Uint8Array(width * height).fill(255);
  const chosen = geometry.cells[0].bubbles[2];
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
    if (x * x + y * y <= 25) pixels[(Math.round(chosen.y) + y) * width + Math.round(chosen.x) + x] = 0;
  }
  const firstPage = readRaster(template, pixels, width, height, { page: 1 });
  assert.equal(firstPage.observations[0].number, 1);
  assert.equal(firstPage.observations[0].answer, "C");
  assert.equal(firstPage.observations[0].state, "read");
  const secondPage = readRaster(template, new Uint8Array(width * height).fill(255), width, height, { page: 2 });
  assert.equal(secondPage.observations[0].number, 51);
  assert.equal(secondPage.pageCount, 2);
});

test("browser module imports pin cache versions for transitive OMR dependencies", async () => {
  const [renderSource, readerSource, pageSource, teacherSource] = await Promise.all([
    readFile(new URL("../omr/render.mjs", import.meta.url), "utf8"),
    readFile(new URL("../omr/reader.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../../plataforma/corretor-v2.html", import.meta.url), "utf8"),
    readFile(new URL("../../../plataforma/professor.html", import.meta.url), "utf8"),
  ]);
  assert.match(renderSource, /from ["']\.\/template\.mjs\?v=20261109h["']/);
  assert.match(readerSource, /from ["']\.\/template\.mjs\?v=20261109h["']/);
  assert.match(pageSource, /omr\/(?:template|render|reader)\.mjs\?v=20261109h/g);
  assert.match(teacherSource, /corretor-v2\.html\?v=20261109h/g);
  assert.match(pageSource, /<select id="type"><option>A-D<\/option><option>A-E<\/option><option>C-E<\/option><\/select>/);
  assert.match(pageSource, /let sections=\[\{type:'A-D',count:20,label:'Questões objetivas'\}\]/);
  assert.match(pageSource, /createTemplate\(sections,\{templateId:'omr-a4'\}\)/);
});
