import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const library=readFileSync(new URL('../avaliacoes-biblioteca.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../corretor-v2.css',import.meta.url),'utf8');

test('UX-READY-01: nenhuma narrativa de homologacao/versao na experiencia publica',()=>{
 assert.doesNotMatch(html,/A leitura óptica de quadros reduzidos ainda não foi homologada/);
 assert.doesNotMatch(html,/Formato padrão V2|Questões do modelo padrão|cartões anteriores|avaliações anteriores/);
 assert.doesNotMatch(html,/CARTÃO DE RESPOSTAS é o título fixo do cartão/);
 assert.doesNotMatch(html,/Um único arquivo PDF reúne as páginas selecionadas/);
 assert.match(html,/<label>Formato<select id="scanType">/);
 assert.match(html,/<label>Questões<input id="scanCount"/);
 assert.match(html,/<p id="scanModelStatus" class="status" role="status"><\/p>/);
 assert.match(html,/Imprima em escala 100%/);
 assert.match(html,/CDU: sem leitura automática/);
 assert.match(html,/id="cameraCaptureStatus" hidden>Foto capturada/);
 assert.doesNotMatch(library,/Avaliação histórica:|Preferências não registradas receberam padrões neutros/);
 assert.doesNotMatch(library,/O servidor conectado ainda não confirma/);
 assert.doesNotMatch(library,/Avaliação salva e conferida no servidor/);
});

test('UX-READY-01: status real de erro, pendente e salvamento permanece exposto',()=>{
 assert.match(library,/confirmedEarlierSave\?'Alterações não salvas\.'/);
 assert.match(library,/s\.pending\?'Conferindo a operação\. Alterações recentes não salvas\.'/);
 assert.match(library,/s\.phase==='saved'\?'Salvo\.'/);
 assert.match(library,/status\.dataset\.state='error'/);
 assert.match(library,/Não foi possível salvar todas as configurações\. Nada foi salvo/);
 assert.match(library,/Alguns campos não foram recuperados\. Confira os dados antes de editar/);
 assert.match(html,/id="cardLimitStatus" class="status" role="status" hidden/);
 assert.match(html,/id="cameraGuideStatus" role="status" aria-live="polite"/);
 assert.match(html,/id="buildStatus" class="status corretor-operation-status" role="status" aria-live="polite"/);
 assert.match(css,/#scanModelStatus:empty/);
 assert.doesNotMatch(css,/#scanModelStatus:empty\{display:none/);
});

test('UX-READY-01: laboratorios nao viram produto por remover avisos',()=>{
 assert.match(html,/<section id="assessmentBank" class="omr-group" hidden>/);
 assert.match(html,/<div id="assessmentReaderBank" hidden>/);
 assert.match(html,/Não use avaliações ou dados reais/);
 assert.match(library,/versionLabel\.hidden=true/);
 assert.match(html,/id="loadManifest" accept="application\/json,.json"/);
 assert.match(html,/id="printCard" type="button" class="button-primary">Baixar PDF/);
 assert.match(html,/id="camera" type="button">Abrir câmera/);
});
