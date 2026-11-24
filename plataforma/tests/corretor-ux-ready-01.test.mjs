import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const library=readFileSync(new URL('../avaliacoes-biblioteca.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../corretor-v2.css',import.meta.url),'utf8');
const pdfSource=readFileSync(new URL('../../corretor/v2/omr/pdf-download.mjs',import.meta.url),'utf8');
const directWorkflow=readFileSync(new URL('../../.github/workflows/test-direct-pdf.yml',import.meta.url),'utf8');

test('UX-READY-01: nenhuma narrativa de homologacao/versao na experiencia publica',()=>{
 assert.doesNotMatch(html,/A leitura óptica de quadros reduzidos ainda não foi homologada/);
 assert.doesNotMatch(html,/Formato padrão V2|Questões do modelo padrão|cartões anteriores|avaliações anteriores/);
 assert.doesNotMatch(html,/CARTÃO DE RESPOSTAS é o título fixo do cartão/);
 assert.doesNotMatch(html,/Um único arquivo PDF reúne as páginas selecionadas/);
 assert.match(html,/<label>Formato<select id="scanType">/);
 assert.match(html,/<label>Questões<input id="scanCount"/);
 assert.match(html,/<p id="scanModelStatus" class="status" role="status"><\/p>/);
 assert.match(html,/Imprima em tamanho real \(100%\), sem ajustar à página/);
 assert.match(html,/Confira a escala nas opções de impressão/);
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

test('CLEAN UX 01: comparacao curta preserva contexto acessivel e leitura sem falsa confirmacao',()=>{
 assert.match(html,/<details id="captureComparison"[^>]*><summary>Conferir imagem<\/summary>/);
 assert.match(html,/<figcaption>Imagem original \(em cinza\)<\/figcaption>/);
 assert.match(html,/<figcaption>Imagem ajustada<\/figcaption>/);
 assert.match(html,/id="originalCapture" aria-label="Imagem original em tons de cinza, sem correção de lente"/);
 assert.match(html,/id="normalizedCapture" aria-label="Imagem ajustada pela perspectiva dos quatro marcadores"/);
 assert.match(html,/id="canvas" class="scan-canvas" hidden aria-label="Prévia da imagem ajustada do cartão"/);
 assert.match(html,/\$\('status'\)\.textContent=`Imagem preparada\.`/);
 assert.match(html,/Não foi possível preparar a imagem\. Tente novamente\./);
 assert.doesNotMatch(html,/Folha reconhecida\. Imagem normalizada/);
 assert.match(html,/manifest\.mode!=='embedded'/);
 assert.match(html,/validateLayoutManifest\(manifest\)\.valid/);
 assert.match(html,/Selecione o modelo correspondente ao cartão/);
 assert.match(html,/id="loadManifest" accept="application\/json,.json" aria-label="Importar modelo do cartão em JSON"/);
});

test('CLEAN UX 01: titulo da avaliacao e orientacao de enquadramento continuam contextuais',()=>{
 assert.match(html,/selection\.plan\.metadata\.title\+' · avaliação confirmada para correção\. Confira se os cartões pertencem a esta avaliação\.'/);
 assert.match(html,/'Avaliação '\+bundle\.title\+' · Confira se os cartões pertencem a esta avaliação\.'/);
 const source=html.match(/^function scanModelNotice\(model\).*$/m)?.[0];
 assert.ok(source,'função de aviso contextual deve continuar definida');
 const notice=model=>vm.runInNewContext(source+';scanModelNotice(model)',{model});
 const embedded=notice({mode:'embedded',questions:[{type:'A-E'}]});
 const cdu=notice({mode:'full-page',questions:[{type:'CDU'}]});
 const combined=notice({mode:'embedded',questions:[{type:'CDU'}]});
 assert.match(embedded,/Aproxime a câmera se o quadro estiver distante/);
 assert.doesNotMatch(embedded,/CDU/);
 assert.match(cdu,/CDU: sem leitura automática/);
 assert.match(combined,/Aproxime a câmera/);
 assert.match(combined,/CDU: sem leitura automática/);
 assert.equal(notice({mode:'full-page',questions:[{type:'A-D'}]}),'');
});

test('CLEAN UX 01: orientacao fisica e privacidade do lote permanecem verdadeiras',()=>{
 assert.match(html,/Imprima em tamanho real \(100%\), sem ajustar à página/);
 assert.match(html,/\$\{plan\.orientation==='landscape'\?'paisagem':'retrato'\}/);
 assert.match(html,/<button id="printBatch">Baixar PDF do lote<\/button><p class="status">Dados do lote: apenas nesta sessão, sem envio\.<\/p>/);
 assert.match(pdfSource,/loadScript\('\.\.\/\.\.\/\.\.\/plataforma\/vendor\/pdf\/jspdf\.umd\.min\.js'\)/);
 assert.match(pdfSource,/return new Blob\(\[buffer\],\{type:'application\/pdf'\}\)/);
 assert.doesNotMatch(pdfSource,/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
 assert.match(pdfSource,/students\.length>500/);
 assert.match(html,/CDU: sem leitura automática/);
 assert.match(library,/Não foi possível salvar todas as configurações\. Nada foi salvo/);
 assert.match(library,/Alguns campos não foram recuperados\. Confira os dados antes de editar/);
});

test('CLEAN UX 01: workflow PDF deve conferir HEAD real do PR antes do guard estrito',()=>{
 assert.match(directWorkflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert.match(directWorkflow,/node scripts\/verify-product-ux-scope\.mjs/);
 assert.match(directWorkflow,/node scripts\/verify-direct-pdf-browser\.mjs/);
});
