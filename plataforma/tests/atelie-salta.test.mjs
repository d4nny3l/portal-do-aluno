import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../atelie-salta.html', import.meta.url), 'utf8');
const tabs = ['cores','simbolos','botoes','componentes','telas','movimentos'];

const luminance = hex => {
  const channels = hex.match(/[\da-f]{2}/gi).map(x => parseInt(x,16) / 255);
  return channels.reduce((sum,channel,i) => sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126,.7152,.0722][i],0);
};
const contrast = (a,b) => {
  const [light,dark] = [luminance(a),luminance(b)].sort((a,b) => b-a);
  return (light + .05) / (dark + .05);
};

test('Ateliê tem seis abas vinculadas a painéis acessíveis', () => {
  assert.equal((html.match(/<button[^>]*role="tab"/g) || []).length,6);
  assert.equal((html.match(/<section[^>]*role="tabpanel"/g) || []).length,6);
  for(const key of tabs){
    assert.match(html,new RegExp(`id="tab-${key}"[^>]*aria-controls="painel-${key}"`));
    assert.match(html,new RegExp(`id="painel-${key}"[^>]*aria-labelledby="tab-${key}"`));
  }
  assert.match(html,/event\.key/);
  assert.match(html,/ArrowRight/);
  assert.match(html,/ArrowLeft/);
  assert.match(html,/Home/);
  assert.match(html,/End/);
});

test('Ateliê é autocontido, sem integrações, roteamento ou alterações globais', () => {
  // V2 carrega apenas ativos locais e exclusivos do Ateliê, nunca CDN ou CSS compartilhado.
  assert.match(html,/<link rel="stylesheet" href="\.\/atelie-salta-v2\.css">/);
  assert.match(html,/<script type="module" src="\.\/atelie-salta-v2\.mjs"><\/script>/);
  assert.equal((html.match(/<link\b[^>]*rel="stylesheet"/g)||[]).length,2);
  assert.equal((html.match(/<script\b[^>]*src=/g)||[]).length,7);
  assert.match(html, /<link rel="stylesheet" href="\.\/atelie-salta-v2-fidelity\.css">/);
  for(const module of ['fixtures','calendar','grade-mask','matrix','controls','compositions']){
    assert.match(html,new RegExp('src="\\.\\/atelie-salta-v2-'+module+'\\.mjs"'));
  }
  for(const url of [...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/g)].map(match=>match[1])){
    assert.ok(url.startsWith('./atelie-salta-v2')||url==='../favicon.svg','Not Ateliê-local asset: '+url);
  }
  assert.doesNotMatch(html,/(?:https?:)?\/\/[^\s"']+\.(?:css|js|woff2)/);
  assert.doesNotMatch(html,/<a\b[^>]*href=/);
  assert.doesNotMatch(html,/<iframe\b/i);
  assert.doesNotMatch(html,/\bfetch\s*\(/);
  assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b/);
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html,/aria-pressed/);
  assert.match(html,/aria-live="polite"/);
});

test('Pares textuais da paleta aprovada têm contraste WCAG AA', () => {
  assert.ok(contrast('17324D','FFFFFF')>=4.5);
  assert.ok(contrast('166AA6','FFFFFF')>=4.5);
  assert.ok(contrast('17324D','E7AA45')>=4.5);
  assert.ok(contrast('17324D','F5F8FB')>=4.5);
  for(const token of ['#17324D','#166AA6','#E7AA45','#F5F8FB','#BBC7D2']) assert.ok(html.includes(token));
});


test('Movimentos possui cinco experiências reversíveis e sem operações reais', () => {
  for (const id of ['motion-collection-a','motion-collection-b','motion-touch','motion-lift',
    'motion-list','motion-reorder','motion-item-toggle','motion-confirm','motion-confirmation']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /showCollection\('a'\)/);
  assert.match(html, /showCollection\('b'\)/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /confirmation\.hidden=!show/);
  assert.match(html, /moveList\(\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /Nenhuma informação foi enviada/);
});
