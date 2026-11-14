import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../corretor-v2.html", import.meta.url), "utf8");

test("Corretor: navegação única sem painel de cartões duplicados", () => {
  const tabs = [...html.matchAll(/<button class="tab" data-view="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(tabs, ["criar", "corrigir", "cartoes"]);
  assert.doesNotMatch(html, /id="dashboard"|data-go="(?:criar|corrigir|cartoes)"/);
  assert.match(html, /class="corretor-card module-view active" id="criar"/);
  assert.match(html, /id="corrigir"/);
  assert.match(html, /id="cartoes"/);
});

test("Corretor: retira mensagens decorativas sem apagar status operacional", () => {
  for (const copy of [
    "Adicione os blocos da prova na ordem original.",
    "Adicione um bloco e gere a prévia quando estiver pronto.",
    "Enquadre a folha inteira.",
    "Imagens e leituras são processadas neste navegador e não são enviadas para armazenamento remoto.",
  ]) assert.equal(html.includes(copy), false, `Texto desnecessário ainda visível: ${copy}`);

  assert.match(html, /id="previewModeLabel" hidden/);
  assert.match(html, /id="buildStatus" class="status" role="status"/);
  assert.match(html, /id="preview"/);
  assert.match(html, /id="read"/);
  assert.match(html, /id="printCard"/);
});
