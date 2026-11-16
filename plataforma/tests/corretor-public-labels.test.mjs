import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../corretor-v2.html');
const shell = read('../admin-shell.mjs');
const professor = read('../professor.html');
const diario = read('../diario-teste.html');
const redirect = read('../../corretor/index.html');
const bank = read('../../corretor/v2/assessments/editor.mjs');

test('Corretor de Avaliações has a consistent name in heading, title and main navigation', () => {
  assert.match(html, /<title>Corretor de Avaliações · SALTA<\/title>/);
  assert.match(html, /<h1>Corretor de Avaliações<\/h1>/);
  assert.match(redirect, /<title>Corretor de Avaliações · SALTA<\/title>/);
  assert.match(redirect, />Abrir Corretor de Avaliações<\/a>/);
  assert.match(shell, /label: "Corretor de Avaliações"/);
  assert.ok(professor.includes('>Corretor de Avaliações<'));
  assert.ok(diario.includes('>Corretor de Avaliações<'));
  assert.match(html, /<label>Formato das questões<select id="scanType">/);
  assert.doesNotMatch(html, /Formato padrão V2|Composição padrão V2/);
});

test('status public hides layout versions and hashes but preserves assessment revision', () => {
  const messages = [...html.matchAll(/\$\('scanModelStatus'\)\.textContent=([^;\n]+)/g)].map(m => m[1]);
  assert.ok(messages.length >= 5);
  for (const message of messages) assert.doesNotMatch(message, /activeManifest\.version|activeManifest\.contentHash|V[12]\b/);
  assert.match(html, /'Avaliação '\+bundle\.title\+' · revisão '\+bundle\.revision/);
  assert.doesNotMatch(bank, /gabarito vinculado ao modelo \$\{bundle\.optical\.contentHash\}/);
  assert.match(bank, /\$\{bundle\.title\} · revisão \$\{bundle\.revision\} · gabarito vinculado ao cartão salvo/);
  assert.match(bank, /manifest\?\.contentHash===saved\.optical\.contentHash/);
});

test('SVG/JSON exports use human filenames and retain technical data in the manifest', () => {
  assert.match(html, /downloadText\(svg,'image\/svg\+xml','cartao-respostas\.svg'\)/);
  assert.match(html, /'cartao-respostas-modelo\.json'/);
  assert.doesNotMatch(html, /cartao-\$\{template\.templateId\}-r\$\{template\.revision\}/);
  assert.match(html, /buildManifestJson\(template,\{header:headerState,manifest:activeManifest\}\)/);
  assert.match(html, /layoutVersion:'v2'/);
});
