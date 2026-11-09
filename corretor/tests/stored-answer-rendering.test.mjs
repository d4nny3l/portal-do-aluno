import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { renderSafeResult } from "../result-renderer.mjs";

const require = createRequire(import.meta.url);
const { normalizeSavedAnswerKey } = require("../answer-key-storage.js");

class FakeNode {
  constructor(tag = "#text") { this.tag = tag; this.children = []; this.className = ""; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(_) { throw new Error("innerHTML must not be used by the safe result renderer"); }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
}

function fakeDocument() {
  const elements = { body: new FakeNode("tbody"), score: new FakeNode("div") };
  return {
    elements,
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { return new FakeNode(tag); },
    createTextNode(value) { const node = new FakeNode(); node.textContent = value; return node; }
  };
}

test("dados de saltaKey são allowlistados; JSON/códigos malformados são ignorados sem limpar storage", () => {
  assert.deepEqual(normalizeSavedAnswerKey(JSON.stringify({ count: 2, answers: ["A", "E"] })), { count: 2, answers: ["A", "E"] });
  assert.deepEqual(normalizeSavedAnswerKey(JSON.stringify(["", "D"])), { count: 2, answers: ["", "D"] });
  for (const malicious of [
    JSON.stringify(["<img src=x onerror=alert(1)>"]),
    JSON.stringify({ count: 1, answers: ["<svg/onload=alert(1)>"] }),
    JSON.stringify({ count: 2, answers: ["A"] }),
    "not-json"
  ]) assert.equal(normalizeSavedAnswerKey(malicious), null);
});

test("resultado usa nós de texto, não interpreta resposta/gabarito como HTML", () => {
  const document = fakeDocument();
  const payload = "</td><img src=x onerror=alert(1)>";
  const hits = renderSafeResult(document, [payload, "?"], [payload, "B"]);
  assert.equal(hits, 1);
  assert.equal(document.elements.body.children.length, 2);
  assert.equal(document.elements.body.children[0].children[1].textContent, payload);
  assert.equal(document.elements.body.children[0].children.length, 4);
  assert.equal(document.elements.body.children[0].children[1].children.length, 0);
  assert.equal(document.elements.score.textContent, "1/2questões acertadas");
});

test("a página não interpola mais resultados com innerHTML e valida localStorage ao iniciar", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /SaltaAnswerKeyStorage\.normalizeSavedAnswerKey/u);
  assert.match(html, /renderSafeResult\(document,r,key,offset\)/u);
  assert.doesNotMatch(html, /getElementById\("body"\)\.innerHTML/u);
  assert.doesNotMatch(html, /getElementById\("score"\)\.innerHTML/u);
});
