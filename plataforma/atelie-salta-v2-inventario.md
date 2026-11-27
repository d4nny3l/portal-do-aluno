# DESIGN-SALTA-01 — Inventário de interfaces, componentes e matriz de rastreabilidade

**Base estática conferida:** `main@b8968b70b7eebbe4d34b29acdb0336ba5e568f20` (Issue #143, ata #7218594671). **Árvore:** 468 entradas, 409 arquivos, sem truncamento; 25 HTML e 14 CSS. **Este levantamento NÃO certifica rotas ativas, persistência, regras acadêmicas nem funcionalidade.**

**Escopo vinculante:** somente `plataforma/atelie-salta.html` e arquivos **novos exclusivos do Ateliê V2**; testes do Ateliê apenas. Nenhum arquivo oficial ou laboratório OMR é alvo. Fonte: AGENTS.md, diretrizes de produto, ata final e retificação #7206977286.

## 1. HTML — 25 de 25 arquivos categorizados

### Portal e navegação

- `index.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/index.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/professor.html` — inventariado por caminho, atividade/estado público não inferidos
- `preview-aluno.html` — inventariado por caminho, atividade/estado público não inferidos

### Gestão e Diário

- `plataforma/diario-teste.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/fechamento-bimestre.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/mensagens.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/eleicoes.html` — inventariado por caminho, atividade/estado público não inferidos

### Análises, avaliações, estatísticas

- `plataforma/estatistica.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/estatistica-individual.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/estatistica-turma.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/estatistica-acessos.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/piloto-avaliacoes.html` — inventariado por caminho, atividade/estado público não inferidos

### Projetos, eventos e utilitários

- `mostra-cultural.html` — inventariado por caminho, atividade/estado público não inferidos
- `solucionador.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/festival-consciencia-negra.html` — inventariado por caminho, atividade/estado público não inferidos
- `plataforma/festival-consciencia-negra-admin.html` — inventariado por caminho, atividade/estado público não inferidos

### Corretor, legado e impressão (PROTEGIDO)

- `plataforma/corretor-v2.html` — não modificar
- `corretor/index.html` — não modificar
- `corretor/folha-resposta.html` — não modificar
- `corretor/legado-eja.html` — não modificar

### Laboratórios OMR independentes (PROTEGIDO)

- `laboratorio/salta-omr-capture-lab/index.html` — não modificar
- `laboratorio/salta-omr-scan-safe-02/index.html` — não modificar
- `laboratorio/salta-scan/index.html` — não modificar

### Ateliê existente (ALVO ÚNICO)

- `plataforma/atelie-salta.html` — único arquivo HTML editável neste ciclo

## 2. CSS — todos os 14 arquivos originais inventariados (NENHUM MODIFICADO)

- `laboratorio/salta-omr-capture-lab/css/omr-lab.css`
- `laboratorio/salta-omr-capture-lab/css/salta-scan.css`
- `laboratorio/salta-omr-capture-lab/css/style.css`
- `laboratorio/salta-omr-scan-safe-02/css/omr-lab.css`
- `laboratorio/salta-omr-scan-safe-02/css/salta-scan.css`
- `laboratorio/salta-omr-scan-safe-02/css/style.css`
- `laboratorio/salta-scan/css/salta-scan.css`
- `laboratorio/salta-scan/css/style.css`
- `plataforma/avaliacao-excluir-dialog.css`
- `plataforma/avaliacoes-biblioteca.css`
- `plataforma/corretor-v2.css`
- `plataforma/piloto-avaliacoes.css`
- `plataforma/professor-theme.css`
- `salta-theme.css`

## 3. JavaScript — caminhos relevantes para identificar componentes e comportamento dinâmico (SOMENTE LEITURA)

O inventário abaixo contém **todos os 227 arquivos JS/MJS** encontrados na árvore base; uma presença no repositório não significa que é carregado em determinada rota. Controles montados por JS demandam auditoria de execução posterior.

- `assessments-lab/build.mjs`
- `assessments-lab/crypto/crypto-format.js`
- `assessments-lab/crypto/decryption.js`
- `assessments-lab/crypto/device-key-store.js`
- `assessments-lab/crypto/encryption.js`
- `assessments-lab/crypto/key-generation.js`
- `assessments-lab/crypto/recovery-vault.mjs`
- `assessments-lab/protected-auth.mjs`
- `assessments-lab/provision-homologation.mjs`
- `assessments-lab/tests/d1-http.integration.mjs`
- `assessments-lab/tests/domain-worker.test.mjs`
- `assessments-lab/tests/editor-contract.test.mjs`
- `assessments-lab/tests/helpers.mjs`
- `assessments-lab/tests/pr38-revisions.test.mjs`
- `assessments-lab/tests/protected-access.test.mjs`
- `assessments-lab/tests/repository.test.mjs`
- `assessments-lab/worker.mjs`
- `assessments-service/build-gateway.mjs`
- `assessments-service/build.mjs`
- `assessments-service/crypto.mjs`
- `assessments-service/custody-client.mjs`
- `assessments-service/custody/build.mjs`
- `assessments-service/custody/config.mjs`
- `assessments-service/custody/export.mjs`
- `assessments-service/custody/ledger.mjs`
- `assessments-service/custody/operator.mjs`
- `assessments-service/custody/worker.mjs`
- `assessments-service/definition.mjs`
- `assessments-service/gateway-lifecycle.mjs`
- `assessments-service/integrity.mjs`
- `assessments-service/restore-fences.mjs`
- `assessments-service/test-composition.mjs`
- `assessments-service/tests/build.test.mjs`
- `assessments-service/tests/catalog-pages.test.mjs`
- `assessments-service/tests/correction-local-browser.mjs`
- `assessments-service/tests/custody-fixture.mjs`
- `assessments-service/tests/custody.test.mjs`
- `assessments-service/tests/d1-auth.integration.mjs`
- `assessments-service/tests/editor-frontend-browser.mjs`
- `assessments-service/tests/editor-snapshot.test.mjs`
- `assessments-service/tests/embedded-browser.mjs`
- `assessments-service/tests/embedded-library.integration.mjs`
- `assessments-service/tests/frontend88.integration.mjs`
- `assessments-service/tests/gateway.integration.mjs`
- `assessments-service/tests/helpers.mjs`
- `assessments-service/tests/lifecycle-browser.mjs`
- `assessments-service/tests/lifecycle-d1.integration.mjs`
- `assessments-service/tests/lifecycle-gateway.test.mjs`
- `assessments-service/tests/lifecycle.test.mjs`
- `assessments-service/tests/private-bridge.integration.test.mjs`
- `assessments-service/tests/score-format.test.mjs`
- `assessments-service/tests/sealed-gateway.mjs`
- `assessments-service/tests/service.test.mjs`
- `assessments-service/worker.mjs`
- `auth-worker/worker.js`
- `corretor/v2/assessments/block-scoring.mjs`
- `corretor/v2/assessments/correction-context.mjs`
- `corretor/v2/assessments/domain.mjs`
- `corretor/v2/assessments/editor-snapshot.mjs`
- `corretor/v2/assessments/editor.mjs`
- `corretor/v2/assessments/lifecycle.mjs`
- `corretor/v2/assessments/private-client.mjs`
- `corretor/v2/assessments/private-contract-adapter.mjs`
- `corretor/v2/assessments/private-library.mjs`
- `corretor/v2/assessments/private-ui.mjs`
- `corretor/v2/assessments/repository.mjs`
- `corretor/v2/assessments/score-format.mjs`
- `corretor/v2/assessments/unlock.mjs`
- `corretor/v2/omr/answer-key.mjs`
- `corretor/v2/omr/artwork.mjs`
- `corretor/v2/omr/assessment.mjs`
- `corretor/v2/omr/camera-calibration.mjs`
- `corretor/v2/omr/camera.mjs`
- `corretor/v2/omr/editor.mjs`
- `corretor/v2/omr/export.mjs`
- `corretor/v2/omr/layout-v1.mjs`
- `corretor/v2/omr/layout-v2.mjs`
- `corretor/v2/omr/layout.mjs`
- `corretor/v2/omr/manifest.mjs`
- `corretor/v2/omr/normalize.mjs`
- `corretor/v2/omr/pdf-download.mjs`
- `corretor/v2/omr/print-economy.mjs`
- `corretor/v2/omr/reader.mjs`
- `corretor/v2/omr/render-v1.mjs`
- `corretor/v2/omr/render.mjs`
- `corretor/v2/omr/template.mjs`
- `corretor/v2/scan-safe/camera.mjs`
- `corretor/v2/scan-safe/optical-guard.mjs`
- `corretor/v2/scan-safe/processor.mjs`
- `corretor/v2/scan-safe/score-preview.mjs`
- `corretor/v2/scan-safe/session.mjs`
- `corretor/v2/scan-safe/tests/camera.test.mjs`
- `corretor/v2/scan-safe/tests/g3-replay-policy.test.mjs`
- `corretor/v2/scan-safe/tests/official-browser.mjs`
- `corretor/v2/scan-safe/tests/offline-optical-validation.test.mjs`
- `corretor/v2/scan-safe/tests/protected-sources.test.mjs`
- `corretor/v2/scan-safe/tests/rearm-counterexample.test.mjs`
- `corretor/v2/scan-safe/tests/rearm-fixture.mjs`
- `corretor/v2/scan-safe/tests/score-preview.test.mjs`
- `corretor/v2/scan-safe/validation/g3-replay-policy.mjs`
- `corretor/v2/scan-safe/validation/legacy-optical-source.mjs`
- `corretor/v2/scan-safe/validation/offline-optical.mjs`
- `corretor/v2/scan-safe/validation/optical-corpus.mjs`
- `corretor/v2/scan-safe/validation/run-candidate-validation.mjs`
- `corretor/v2/scan-safe/validation/run-g3-validation.mjs`
- `corretor/v2/scan-safe/validation/run-optical-validation.mjs`
- `corretor/v2/scan-safe/withdrawal.mjs`
- `corretor/v2/scan-safe/worker-client.mjs`
- `corretor/v2/scan-safe/worker.mjs`
- `corretor/v2/tests/answer-key.test.mjs`
- `corretor/v2/tests/cam-focus-01.test.mjs`
- `corretor/v2/tests/camera.test.mjs`
- `corretor/v2/tests/card-artwork.test.mjs`
- `corretor/v2/tests/card-header.test.mjs`
- `corretor/v2/tests/card-layout.test.mjs`
- `corretor/v2/tests/card-maintenance.test.mjs`
- `corretor/v2/tests/card-v2.test.mjs`
- `corretor/v2/tests/economy-print.test.mjs`
- `corretor/v2/tests/embed-align-01.test.mjs`
- `corretor/v2/tests/fixtures/reader-before-pr51.mjs`
- `corretor/v2/tests/normalize-low-light.test.mjs`
- `corretor/v2/tests/normalize.test.mjs`
- `corretor/v2/tests/pdf-download.test.mjs`
- `corretor/v2/tests/pr38-optical-parity.test.mjs`
- `corretor/v2/tests/reader-auditor-adversarial.test.mjs`
- `corretor/v2/tests/reader-partial-marks.test.mjs`
- `corretor/v2/tests/worker.test.mjs`
- `laboratorio/salta-omr-capture-lab/candidates/edge-first-01.mjs`
- `laboratorio/salta-omr-capture-lab/js/app.js`
- `laboratorio/salta-omr-capture-lab/js/camera-presentation.mjs`
- `laboratorio/salta-omr-capture-lab/js/card-flow.js`
- `laboratorio/salta-omr-capture-lab/js/experimental-detector.mjs`
- `laboratorio/salta-omr-capture-lab/js/framing.js`
- `laboratorio/salta-omr-capture-lab/js/marker-capture.js`
- `laboratorio/salta-omr-capture-lab/js/paper-geometry.js`
- `laboratorio/salta-omr-capture-lab/js/pdf.js`
- `laboratorio/salta-omr-capture-lab/js/quality.js`
- `laboratorio/salta-omr-capture-lab/js/vision.js`
- `laboratorio/salta-omr-capture-lab/js/worker.js`
- `laboratorio/salta-omr-capture-lab/omr-lab.mjs`
- `laboratorio/salta-omr-capture-lab/tests/camera-presentation-browser.mjs`
- `laboratorio/salta-omr-capture-lab/tests/camera-presentation.test.mjs`
- `laboratorio/salta-omr-capture-lab/tests/edge-first-01.test.mjs`
- `laboratorio/salta-omr-capture-lab/tests/edge-first-live-integration.test.mjs`
- `laboratorio/salta-omr-capture-lab/tests/paper-safe.test.mjs`
- `laboratorio/salta-omr-capture-lab/tests/paper-turbo.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/candidates/edge-first-01.mjs`
- `laboratorio/salta-omr-scan-safe-02/integration/single-optical.mjs`
- `laboratorio/salta-omr-scan-safe-02/integration/single-optical.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/js/app.js`
- `laboratorio/salta-omr-scan-safe-02/js/camera-presentation.mjs`
- `laboratorio/salta-omr-scan-safe-02/js/card-flow-safe.mjs`
- `laboratorio/salta-omr-scan-safe-02/js/card-flow.js`
- `laboratorio/salta-omr-scan-safe-02/js/document-enhance.mjs`
- `laboratorio/salta-omr-scan-safe-02/js/experimental-detector.mjs`
- `laboratorio/salta-omr-scan-safe-02/js/framing.js`
- `laboratorio/salta-omr-scan-safe-02/js/marker-capture.js`
- `laboratorio/salta-omr-scan-safe-02/js/paper-geometry.js`
- `laboratorio/salta-omr-scan-safe-02/js/pdf.js`
- `laboratorio/salta-omr-scan-safe-02/js/quality.js`
- `laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs`
- `laboratorio/salta-omr-scan-safe-02/js/vision.js`
- `laboratorio/salta-omr-scan-safe-02/js/worker.js`
- `laboratorio/salta-omr-scan-safe-02/omr-lab.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/camera-presentation-browser.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/camera-presentation.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/edge-first-01.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/edge-first-live-integration.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/paper-safe.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/paper-turbo.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/safe-scan.test.mjs`
- `laboratorio/salta-omr-scan-safe-02/tests/worker-optical-isolation.test.mjs`
- `laboratorio/salta-scan/js/app.js`
- `laboratorio/salta-scan/js/pdf.js`
- `laboratorio/salta-scan/js/vision.js`
- `laboratorio/salta-scan/js/worker.js`
- `plataforma/admin-shell.mjs`
- `plataforma/avaliacao-excluir-dialog.mjs`
- `plataforma/avaliacoes-biblioteca.mjs`
- `plataforma/catalogo-avaliacoes.mjs`
- `plataforma/diario-attendance.mjs`
- `plataforma/festival-sw.js`
- `plataforma/piloto-avaliacoes.mjs`
- `plataforma/tests/admin-shell.test.mjs`
- `plataforma/tests/atelie-salta.test.mjs`
- `plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs`
- `plataforma/tests/browser-qa/qa_synthetic_gateway.js`
- `plataforma/tests/correction-context.test.mjs`
- `plataforma/tests/corretor-camera-progress-p1.test.mjs`
- `plataforma/tests/corretor-camera-torch-ui.test.mjs`
- `plataforma/tests/corretor-interface.test.mjs`
- `plataforma/tests/corretor-omr-camera-cross-integration.test.mjs`
- `plataforma/tests/corretor-review-suggestions.test.mjs`
- `plataforma/tests/corretor-stale-grade-audit-p1.test.mjs`
- `plataforma/tests/corretor-ux-ready-01.test.mjs`
- `plataforma/tests/corretor-visual-flow.test.mjs`
- `plataforma/tests/diario-attendance.test.mjs`
- `plataforma/tests/formato-nota-p1-85.test.mjs`
- `plataforma/tests/int-scan-01-frame-choice.test.mjs`
- `plataforma/tests/piloto-avaliacoes-isolado.test.mjs`
- `plataforma/vendor/pdf/jspdf.umd.min.js`
- `plataforma/vendor/pdf/svg2pdf.umd.min.js`
- `scripts/diagnose-omr-raster.mjs`
- `scripts/verify-auto-correction-scope.mjs`
- `scripts/verify-camera-focus-browser.mjs`
- `scripts/verify-camera-focus-raster.mjs`
- `scripts/verify-camera-focus-scope.mjs`
- `scripts/verify-camera-geometry.mjs`
- `scripts/verify-card-artwork-raster.mjs`
- `scripts/verify-card-header-raster.mjs`
- `scripts/verify-correction-local-scope.mjs`
- `scripts/verify-direct-pdf-browser.mjs`
- `scripts/verify-direct-pdf-mobile.mjs`
- `scripts/verify-direct-pdf-scope.mjs`
- `scripts/verify-economy-browser.mjs`
- `scripts/verify-economy-scope.mjs`
- `scripts/verify-product-ux-scope.mjs`
- `scripts/verify-scan-integration-scope.mjs`
- `scripts/verify-single-shot-scope.mjs`
- `stats-worker/tests/diario-d04-baseline.repro.mjs`
- `stats-worker/tests/diario-d04.integration.mjs`
- `stats-worker/tests/diario-d04.test.mjs`
- `stats-worker/tests/diario-periods.test.mjs`
- `stats-worker/tests/fixtures/d04/worker.mjs`
- `stats-worker/tests/support/d04-fixture.mjs`
- `stats-worker/tests/support/local-d1.mjs`
- `stats-worker/worker.js`

## 4. Componentes / estados transversais mapeados para prévias

| Família | Elementos incluídos no Ateliê V2 | Proteção |
|---|---|---|
| Marca e tokens | S/favicon existente; cores semânticas; Inter WOFF2 local; fundo quadriculado só no fundo; raio 14px, botão 11px | sem CSS global |
| Navegação | sidebar 240/64/280px de referência, cabeçalho, abas, breadcrumbs, menu de contexto, paginação | sem rotas reais |
| Campos | input, select, texto, busca, filtro, data, hora, intervalo, checkbox, radio, switch, upload visual | sem arquivo lido/enviado |
| Tabelas | zebra, colunas, estudante sticky, scroll horizontal, densidade acadêmica | sem cálculo, notas ou frequência reais |
| Estados | rascunho, salvando, salvo local, pendente, confirmado sintético, falha, conflito, offline, externo indisponível | nenhum recibo real |
| Popups e mensagens | confirmação, edição, ficha extensa, toast, accordion, estados vazios, indicadores | sem modificar dados |
| Diário | aula, mensal, semanal, diário, chamada, vistos, notas, planejamento | D01–D36 e regras preservados |
| Corretor/OMR | central ilustrativa de gerenciamento e gerador sem geometria óptica | scanner, overlay, câmera, folha e PDFs reais NÃO tocados |
| Estatísticas | KPIs, gráfico, tabela, sem origem numérica real | apenas valores fictícios |
| Projetos/Documentos | colunas por situação, categorias, prévia branca para impressão | nenhum serviço real |
| CONNECT | estado por sistema e aviso de integração indisponível | nenhum Auth/API/Worker |
| Movimentos | 200/150ms modal, feedback, menus, foco, reduced-motion | sem efeito em câmera/OMR |
| Ícones | 68 significados exatos, 5 famílias, SVG local, ISC | ícone aprovado sem significado trocado |

## 5. Rastreabilidade: decisão → componente → prévia → arquivo existente/candidato → evidência

| Decisão | Opção | Tema | Tokens/componentes | Prévia `kind` | Referência no código | Verificação |
|---|---|---|---|---|---|---|
| 15.1 | B | Entrada portal | paleta, marca, cartões de entrada | `entry` | index.html; plataforma/index.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.2 | B | Login institucional | formulário, segurança e acessibilidade | `login` | plataforma/index.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.3 | A | Professor central de ferramentas | menu lateral, agenda secundária, cards | `home` | plataforma/professor.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.4 | B | Diário integrado | contexto institucional, aula e estados | `diary` | plataforma/diario-teste.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.5 | B | Grupos institucionais | cards de instituição sem favoritos | `institutions` | plataforma/professor.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.6 | B | Ficha acadêmica | abas, KPIs, matrícula fictícia | `record` | plataforma/diario-teste.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.7 | B | Calendário e agenda | mês/semana/dia, próximos cartões | `calendar` | plataforma/diario-teste.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.8 | C | Chamada diária e histórico | tabela P/F/FJ/FA/—, rascunho | `attendance` | plataforma/diario-teste.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.9 | C | Notas e recuperação | tabela com 0/—/*, estudante fixo | `grades` | plataforma/diario-teste.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.10 | C | Vistos | visto ✓/×/◷/— e exceções | `checks` | plataforma/diario-teste.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.11 | C | Planejamento | biblioteca, sequência, formulário | `planning` | plataforma/diario-teste.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.12 | B | Corretor | central visual sem câmera nem OMR | `scanner` | plataforma/corretor-v2.html (PROTEGIDO) | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.13 | B | Gerador | configuração + prévia NÃO óptica | `generator` | plataforma/corretor-v2.html (PROTEGIDO) | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.14 | B | Estatísticas | KPIs, gráfico, tabela sintéticos | `stats` | plataforma/estatistica*.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.15 | B | Portal do Aluno | cartões, aviso de privacidade | `student` | preview-aluno.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.16 | C | Projetos | três colunas por situação | `projects` | mostra-cultural.html e festival* | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.17 | B | CONNECT | estado indisponível sem integração | `connect` | nenhuma rota confirmada | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.18 | B | Avisos | leitura diferente de resolução | `notices` | plataforma/mensagens.html | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.19 | B | Documentos | categorias/folha branca sem OMR | `docs` | relatórios candidatos | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.20 | B | Configurações | finalidades, sem mexer em preferências | `settings` | plataforma/professor.html (candidato) | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.21 | A | Símbolos livres | 68 Lucide locais, sem moldura | `symbols` | Ateliê | HTML/JS estáticos; browser CI sintético pendente de avaliação física |
| 15.22 | B | Secundários | perfil, erro, 404, modal | `secondary` | componentes transversais | HTML/JS estáticos; browser CI sintético pendente de avaliação física |

## 6. Rastreabilidade das 68 escolhas — nomes congelados

O catálogo exibido no Ateliê contém 12 módulos + 14 pedagógicos + 18 ações + 12 estados + 12 navegação (68 únicos). SVG da Lucide: `plataforma/atelie-salta-v2-icons.svg`; licença ISC local; aliases históricos documentados no arquivo `plataforma/atelie-salta-v2-ICONS-LICENSE.txt`. Nenhum ícone adicional foi inserido silenciosamente. A fonte Inter variável está incorporada localmente e sua licença OFL integral acompanha o Ateliê.

## 7. Lacunas e barreiras de homologação

1. **Inventário da árvore não é inventário de execução.** Confirmar em auditoria separada as rotas públicas efetivamente acessíveis, CSS computado, JS que monta modais/menus/tabelas e estados de rede.
2. **AA por contraste não significa homologação WCAG total.** Testar leitor de tela, teclado, zoom, 320px/390px, tablet, 1440px e orientação; densidade 27px exige tratamento de foco e toque.
3. **Prévia visual não aprova fluxos acadêmicos.** D01–D36, notas, recuperação, frequência e vínculo institucional permanecem fora de escopo.
4. **Corretor é protegido.** Exemplo do gerador não contém geometria OMR, marcadores, bolhas, câmera nem overlay real. Não usar o Ateliê como folha imprimível.
5. **CONNECT é candidato visual.** Não declarar integração, recibo nem salvamento real.
6. **Aplicação às telas oficiais requer nova missão/GO.** PR DRAFT sem merge/deploy; auditor visual independente e proprietário homologam as composições no Ateliê.

## 8. Fontes de autoridade verificadas

- Issue #143 e ata #7218594671; retificação #7206977286.
- `AGENTS.md`; `docs/SALTA_DIRETRIZES_PRODUTO.md`.
- Git tree `main@b8968b70b7eebbe4d34b29acdb0336ba5e568f20` (468 entradas).
- `plataforma/atelie-salta.html` original (6 abas antes da missão).
- Lucide SVG local, ISC, e Inter Variable WOFF2 local, OFL 1.1.

## 9. Inventário auxiliar da árvore completa (468 entradas)

Este apêndice permite reproduzir a contagem e detectar arquivos omitidos. Árvores são listadas com sufixo `/`; arquivos com extensão original.

- `.gitattributes` · blob · 119 bytes
- `.github/` · tree
- `.github/workflows/` · tree
- `.github/workflows/deploy-salta-auth.yml` · blob · 1129 bytes
- `.github/workflows/deploy-salta-stats.yml` · blob · 1531 bytes
- `.github/workflows/test-assessments-embedded.yml` · blob · 8998 bytes
- `.github/workflows/test-assessments-lab.yml` · blob · 1144 bytes
- `.github/workflows/test-avaliacoes-biblioteca.yml` · blob · 3097 bytes
- `.github/workflows/test-camera-presentation-lab.yml` · blob · 1892 bytes
- `.github/workflows/test-corretor-integrated.yml` · blob · 7173 bytes
- `.github/workflows/test-diario-integrity.yml` · blob · 2698 bytes
- `.github/workflows/test-direct-pdf.yml` · blob · 3721 bytes
- `.github/workflows/test-economy-print.yml` · blob · 1877 bytes
- `.github/workflows/test-pilot-pages-isolated.yml` · blob · 2080 bytes
- `.github/workflows/test-ux79c-browser-qa.yml` · blob · 5721 bytes
- `.github/workflows/test-ux79c-complete-02.yml` · blob · 4302 bytes
- `.gitignore` · blob · 42 bytes
- `AGENTS.md` · blob · 12468 bytes
- `COMUNICACAO-SALTA.md` · blob · 2571 bytes
- `assessments-lab/` · tree
- `assessments-lab/.gitignore` · blob · 44 bytes
- `assessments-lab/README.md` · blob · 4839 bytes
- `assessments-lab/build.mjs` · blob · 4221 bytes
- `assessments-lab/crypto/` · tree
- `assessments-lab/crypto/PROVENANCE.md` · blob · 1420 bytes
- `assessments-lab/crypto/crypto-format.js` · blob · 5740 bytes
- `assessments-lab/crypto/decryption.js` · blob · 1829 bytes
- `assessments-lab/crypto/device-key-store.js` · blob · 4072 bytes
- `assessments-lab/crypto/encryption.js` · blob · 1613 bytes
- `assessments-lab/crypto/key-generation.js` · blob · 1460 bytes
- `assessments-lab/crypto/recovery-vault.mjs` · blob · 2175 bytes
- `assessments-lab/fixtures/` · tree
- `assessments-lab/fixtures/seed.sql` · blob · 603 bytes
- `assessments-lab/migrations/` · tree
- `assessments-lab/migrations/0001_assessments.sql` · blob · 1633 bytes
- `assessments-lab/migrations/0002_protected_access.sql` · blob · 418 bytes
- `assessments-lab/migrations/down/` · tree
- `assessments-lab/migrations/down/0001_assessments.sql` · blob · 419 bytes
- `assessments-lab/migrations/down/0002_protected_access.sql` · blob · 138 bytes
- `assessments-lab/package-lock.json` · blob · 50545 bytes
- `assessments-lab/package.json` · blob · 593 bytes
- `assessments-lab/protected-auth.mjs` · blob · 2462 bytes
- `assessments-lab/provision-homologation.mjs` · blob · 2210 bytes
- `assessments-lab/tests/` · tree
- `assessments-lab/tests/d1-http.integration.mjs` · blob · 5516 bytes
- `assessments-lab/tests/domain-worker.test.mjs` · blob · 7346 bytes
- `assessments-lab/tests/editor-contract.test.mjs` · blob · 2456 bytes
- `assessments-lab/tests/helpers.mjs` · blob · 1939 bytes
- `assessments-lab/tests/pr38-revisions.test.mjs` · blob · 8253 bytes
- `assessments-lab/tests/protected-access.test.mjs` · blob · 10305 bytes
- `assessments-lab/tests/repository.test.mjs` · blob · 2169 bytes
- `assessments-lab/worker.mjs` · blob · 13147 bytes
- `assessments-lab/wrangler.protected.toml` · blob · 814 bytes
- `assessments-lab/wrangler.toml` · blob · 435 bytes
- `assessments-service/` · tree
- `assessments-service/.gitignore` · blob · 7 bytes
- `assessments-service/README.md` · blob · 942 bytes
- `assessments-service/build-gateway.mjs` · blob · 2081 bytes
- `assessments-service/build.mjs` · blob · 3047 bytes
- `assessments-service/crypto.mjs` · blob · 2943 bytes
- `assessments-service/custody-client.mjs` · blob · 3138 bytes
- `assessments-service/custody/` · tree
- `assessments-service/custody/build.mjs` · blob · 1692 bytes
- `assessments-service/custody/config.mjs` · blob · 1774 bytes
- `assessments-service/custody/export.mjs` · blob · 4808 bytes
- `assessments-service/custody/ledger.mjs` · blob · 13746 bytes
- `assessments-service/custody/operator.mjs` · blob · 2219 bytes
- `assessments-service/custody/sources.json` · blob · 458 bytes
- `assessments-service/custody/worker.mjs` · blob · 1740 bytes
- `assessments-service/definition.mjs` · blob · 5214 bytes
- `assessments-service/dependencies.json` · blob · 8775 bytes
- `assessments-service/gateway-lifecycle.mjs` · blob · 8319 bytes
- `assessments-service/integrity.mjs` · blob · 6054 bytes
- `assessments-service/migrations/` · tree
- `assessments-service/migrations/0001_private_library.sql` · blob · 3115 bytes
- `assessments-service/migrations/0002_assessment_lifecycle.sql` · blob · 3986 bytes
- `assessments-service/restore-fences.mjs` · blob · 4243 bytes
- `assessments-service/test-composition.mjs` · blob · 2320 bytes
- `assessments-service/tests/` · tree
- `assessments-service/tests/build.test.mjs` · blob · 4513 bytes
- `assessments-service/tests/catalog-pages.test.mjs` · blob · 8647 bytes
- `assessments-service/tests/correction-local-browser.mjs` · blob · 8913 bytes
- `assessments-service/tests/custody-fixture.mjs` · blob · 1658 bytes
- `assessments-service/tests/custody.test.mjs` · blob · 9565 bytes
- `assessments-service/tests/d1-auth.integration.mjs` · blob · 6308 bytes
- `assessments-service/tests/editor-frontend-browser.mjs` · blob · 19654 bytes
- `assessments-service/tests/editor-snapshot.test.mjs` · blob · 9876 bytes
- `assessments-service/tests/embedded-browser.mjs` · blob · 10581 bytes
- `assessments-service/tests/embedded-library.integration.mjs` · blob · 15524 bytes
- `assessments-service/tests/frontend88.integration.mjs` · blob · 5335 bytes
- `assessments-service/tests/gateway.integration.mjs` · blob · 12552 bytes
- `assessments-service/tests/helpers.mjs` · blob · 5415 bytes
- `assessments-service/tests/lifecycle-browser.mjs` · blob · 14158 bytes
- `assessments-service/tests/lifecycle-d1.integration.mjs` · blob · 9666 bytes
- `assessments-service/tests/lifecycle-gateway.test.mjs` · blob · 2799 bytes
- `assessments-service/tests/lifecycle.test.mjs` · blob · 11374 bytes
- `assessments-service/tests/private-bridge.integration.test.mjs` · blob · 22746 bytes
- `assessments-service/tests/score-format.test.mjs` · blob · 10247 bytes
- `assessments-service/tests/sealed-gateway.mjs` · blob · 2153 bytes
- `assessments-service/tests/service.test.mjs` · blob · 12752 bytes
- `assessments-service/worker.mjs` · blob · 29171 bytes
- `auth-worker/` · tree
- `auth-worker/worker.js` · blob · 10825 bytes
- `auth-worker/wrangler.toml` · blob · 448 bytes
- `corretor/` · tree
- `corretor/cartao-respostas-eja-20q-final.pdf` · blob · 230715 bytes
- `corretor/folha-resposta.html` · blob · 5565 bytes
- `corretor/index.html` · blob · 601 bytes
- `corretor/legado-eja.html` · blob · 45239 bytes
- `corretor/v2/` · tree
- `corretor/v2/assessments/` · tree
- `corretor/v2/assessments/block-scoring.mjs` · blob · 17773 bytes
- `corretor/v2/assessments/correction-context.mjs` · blob · 5534 bytes
- `corretor/v2/assessments/domain.mjs` · blob · 4120 bytes
- `corretor/v2/assessments/editor-snapshot.mjs` · blob · 9700 bytes
- `corretor/v2/assessments/editor.mjs` · blob · 10056 bytes
- `corretor/v2/assessments/lifecycle.mjs` · blob · 202 bytes
- `corretor/v2/assessments/private-client.mjs` · blob · 11517 bytes
- `corretor/v2/assessments/private-contract-adapter.mjs` · blob · 7397 bytes
- `corretor/v2/assessments/private-library.mjs` · blob · 16018 bytes
- `corretor/v2/assessments/private-ui.mjs` · blob · 8294 bytes
- `corretor/v2/assessments/repository.mjs` · blob · 5343 bytes
- `corretor/v2/assessments/score-format.mjs` · blob · 1828 bytes
- `corretor/v2/assessments/unlock.mjs` · blob · 2612 bytes
- `corretor/v2/omr/` · tree
- `corretor/v2/omr/answer-key.mjs` · blob · 1125 bytes
- `corretor/v2/omr/artwork.mjs` · blob · 8590 bytes
- `corretor/v2/omr/assessment.mjs` · blob · 8536 bytes
- `corretor/v2/omr/camera-calibration.mjs` · blob · 3254 bytes
- `corretor/v2/omr/camera.mjs` · blob · 17486 bytes
- `corretor/v2/omr/editor.mjs` · blob · 2529 bytes
- `corretor/v2/omr/export.mjs` · blob · 14381 bytes
- `corretor/v2/omr/layout-v1.mjs` · blob · 28740 bytes
- `corretor/v2/omr/layout-v2.mjs` · blob · 19990 bytes
- `corretor/v2/omr/layout.mjs` · blob · 923 bytes
- `corretor/v2/omr/manifest.mjs` · blob · 1918 bytes
- `corretor/v2/omr/normalize.mjs` · blob · 20139 bytes
- `corretor/v2/omr/pdf-download.mjs` · blob · 5515 bytes
- `corretor/v2/omr/print-economy.mjs` · blob · 6448 bytes
- `corretor/v2/omr/reader.mjs` · blob · 11060 bytes
- `corretor/v2/omr/render-v1.mjs` · blob · 10711 bytes
- `corretor/v2/omr/render.mjs` · blob · 11147 bytes
- `corretor/v2/omr/template.mjs` · blob · 7799 bytes
- `corretor/v2/scan-safe/` · tree
- `corretor/v2/scan-safe/README.md` · blob · 9886 bytes
- `corretor/v2/scan-safe/camera.mjs` · blob · 9777 bytes
- `corretor/v2/scan-safe/optical-guard.mjs` · blob · 3612 bytes
- `corretor/v2/scan-safe/processor.mjs` · blob · 8223 bytes
- `corretor/v2/scan-safe/score-preview.mjs` · blob · 1169 bytes
- `corretor/v2/scan-safe/session.mjs` · blob · 859 bytes
- `corretor/v2/scan-safe/tests/` · tree
- `corretor/v2/scan-safe/tests/camera.test.mjs` · blob · 6676 bytes
- `corretor/v2/scan-safe/tests/g3-replay-policy.test.mjs` · blob · 2924 bytes
- `corretor/v2/scan-safe/tests/official-browser.mjs` · blob · 16092 bytes
- `corretor/v2/scan-safe/tests/offline-optical-validation.test.mjs` · blob · 7343 bytes
- `corretor/v2/scan-safe/tests/protected-sources.test.mjs` · blob · 2745 bytes
- `corretor/v2/scan-safe/tests/rearm-counterexample.test.mjs` · blob · 3028 bytes
- `corretor/v2/scan-safe/tests/rearm-fixture.mjs` · blob · 1981 bytes
- `corretor/v2/scan-safe/tests/score-preview.test.mjs` · blob · 11187 bytes
- `corretor/v2/scan-safe/validation/` · tree
- `corretor/v2/scan-safe/validation/README.md` · blob · 7053 bytes
- `corretor/v2/scan-safe/validation/candidate-evidence.json` · blob · 38689 bytes
- `corretor/v2/scan-safe/validation/corpus-labels.json` · blob · 183277 bytes
- `corretor/v2/scan-safe/validation/g3-replay-policy.mjs` · blob · 3447 bytes
- `corretor/v2/scan-safe/validation/legacy-optical-source.mjs` · blob · 1389 bytes
- `corretor/v2/scan-safe/validation/moderate-A.png` · blob · 84225 bytes
- `corretor/v2/scan-safe/validation/moderate-A.rgba.gz` · blob · 83707 bytes
- `corretor/v2/scan-safe/validation/moderate-AB.png` · blob · 84341 bytes
- `corretor/v2/scan-safe/validation/moderate-AB.rgba.gz` · blob · 83816 bytes
- `corretor/v2/scan-safe/validation/offline-optical.mjs` · blob · 5147 bytes
- `corretor/v2/scan-safe/validation/optical-corpus.mjs` · blob · 5370 bytes
- `corretor/v2/scan-safe/validation/optical-evidence.json` · blob · 1078835 bytes
- `corretor/v2/scan-safe/validation/run-candidate-validation.mjs` · blob · 5038 bytes
- `corretor/v2/scan-safe/validation/run-g3-validation.mjs` · blob · 13068 bytes
- `corretor/v2/scan-safe/validation/run-optical-validation.mjs` · blob · 9121 bytes
- `corretor/v2/scan-safe/validation/shadow-AB-130-document.png` · blob · 150736 bytes
- `corretor/v2/scan-safe/validation/shadow-AB-130-optical.png` · blob · 302561 bytes
- `corretor/v2/scan-safe/validation/shadow-AB-130.png` · blob · 122989 bytes
- `corretor/v2/scan-safe/validation/shadow-AB-130.rgba.gz` · blob · 101493 bytes
- `corretor/v2/scan-safe/validation/visual-evidence.json` · blob · 651 bytes
- `corretor/v2/scan-safe/withdrawal.mjs` · blob · 6582 bytes
- `corretor/v2/scan-safe/worker-client.mjs` · blob · 4176 bytes
- `corretor/v2/scan-safe/worker.mjs` · blob · 765 bytes
- `corretor/v2/tests/` · tree
- `corretor/v2/tests/answer-key.test.mjs` · blob · 1853 bytes
- `corretor/v2/tests/cam-focus-01.test.mjs` · blob · 4320 bytes
- `corretor/v2/tests/camera.test.mjs` · blob · 19709 bytes
- `corretor/v2/tests/card-artwork.test.mjs` · blob · 6550 bytes
- `corretor/v2/tests/card-header.test.mjs` · blob · 6210 bytes
- `corretor/v2/tests/card-layout.test.mjs` · blob · 25751 bytes
- `corretor/v2/tests/card-maintenance.test.mjs` · blob · 4821 bytes
- `corretor/v2/tests/card-v2.test.mjs` · blob · 13326 bytes
- `corretor/v2/tests/economy-print.test.mjs` · blob · 8048 bytes
- `corretor/v2/tests/embed-align-01.test.mjs` · blob · 15368 bytes
- `corretor/v2/tests/fixtures/` · tree
- `corretor/v2/tests/fixtures/artwork-v0-optical.json` · blob · 2589 bytes
- `corretor/v2/tests/fixtures/maintenance-16113b6-golden.json` · blob · 3793 bytes
- `corretor/v2/tests/fixtures/reader-before-pr51.mjs` · blob · 8827 bytes
- `corretor/v2/tests/fixtures/v2-header0.manifest.json` · blob · 27029 bytes
- `corretor/v2/tests/fixtures/v2-header1.manifest.json` · blob · 68464 bytes
- `corretor/v2/tests/normalize-low-light.test.mjs` · blob · 7107 bytes
- `corretor/v2/tests/normalize.test.mjs` · blob · 6872 bytes
- `corretor/v2/tests/pdf-download.test.mjs` · blob · 3988 bytes
- `corretor/v2/tests/pr38-optical-parity.test.mjs` · blob · 3984 bytes
- `corretor/v2/tests/reader-auditor-adversarial.test.mjs` · blob · 12244 bytes
- `corretor/v2/tests/reader-partial-marks.test.mjs` · blob · 9037 bytes
- `corretor/v2/tests/worker.test.mjs` · blob · 17252 bytes
- `docs/` · tree
- `docs/SALTA_ADMIN_UX_AUDIT.md` · blob · 5588 bytes
- `docs/SALTA_AVALIACOES_GABARITOS_FASE1.md` · blob · 16954 bytes
- `docs/SALTA_CABECALHO_DIRETO_FASE1.md` · blob · 1678 bytes
- `docs/SALTA_CAMERA_AUTO_ZOOM_P1.md` · blob · 4444 bytes
- `docs/SALTA_CAMERA_OMR_FIDELIDADE.md` · blob · 12258 bytes
- `docs/SALTA_CARTAO_RESPOSTA_DESIGN_SPEC.md` · blob · 17837 bytes
- `docs/SALTA_CARTAO_RESPOSTA_V1_IMPLEMENTACAO.md` · blob · 9270 bytes
- `docs/SALTA_CARTAO_RESPOSTA_V2_IMPLEMENTACAO.md` · blob · 9127 bytes
- `docs/SALTA_CARTAO_RESPOSTA_V2_SPEC.md` · blob · 11829 bytes
- `docs/SALTA_CODEX_CARTAO_RESPOSTA_EXECUCAO.md` · blob · 3460 bytes
- `docs/SALTA_CORRETOR_AJUSTE_FINO_P1_20261118.md` · blob · 4261 bytes
- `docs/SALTA_CORRETOR_AUDITORIA_E_PLANO.md` · blob · 55179 bytes
- `docs/SALTA_CORRETOR_FECHAMENTO_VISUAL.md` · blob · 16246 bytes
- `docs/SALTA_CORRETOR_MOBILE_E_ROTAS.md` · blob · 4611 bytes
- `docs/SALTA_CORRETOR_REVISAO_VISUAL_20261114.md` · blob · 5269 bytes
- `docs/SALTA_DIARIO_D04_IMPLEMENTACAO.md` · blob · 10625 bytes
- `docs/SALTA_DIARIO_D04_PROPOSTA.md` · blob · 7815 bytes
- `docs/SALTA_DIRETRIZES_PRODUTO.md` · blob · 10077 bytes
- `docs/SALTA_INTEGRACAO_OMR_CAMERA_P1_20261118.md` · blob · 3494 bytes
- `docs/SALTA_OMR_BAIXA_LUMINOSIDADE_P1.md` · blob · 9809 bytes
- `docs/SALTA_OMR_GENERATOR_RECONSTRUCTION.md` · blob · 9308 bytes
- `docs/SALTA_OMR_HOMOLOGACAO_FISICA_P1.md` · blob · 10876 bytes
- `docs/SALTA_OMR_PROMOCAO_CONSERVADORA_P1.md` · blob · 5180 bytes
- `docs/SALTA_OMR_SCAN_20Q_ENCAMINHAMENTO_DIRETOR_20261124.md` · blob · 13553 bytes
- `docs/SALTA_OMR_SCAN_20Q_FONTES_AUDITORIA_20261124.json` · blob · 7592 bytes
- `docs/SALTA_OMR_SCAN_20Q_PACOTE_CODIGO_AUDITORIA_20261124.md` · blob · 16115 bytes
- `docs/SALTA_PR36_PUBLICACAO_PROTEGIDA.md` · blob · 8646 bytes
- `docs/SALTA_PR38_HOMOLOGACAO_FISICA.md` · blob · 5938 bytes
- `docs/SALTA_SCAN_SAFE_V2_DOSSIE_INTEGRACAO_20261125.md` · blob · 15762 bytes
- `docs/SALTA_V2_ACABAMENTO_E_AUDITORIA.md` · blob · 8632 bytes
- `docs/SALTA_V2_CORRECAO_CABECALHO_LOGOS.md` · blob · 5724 bytes
- `docs/assets/` · tree
- `docs/assets/camera-omr-20261115/` · tree
- `docs/assets/camera-omr-20261115/calibration.svg` · blob · 978 bytes
- `docs/assets/camera-omr-20261115/guides-before-after.json` · blob · 921 bytes
- `docs/assets/camera-omr-20261115/marker-order-before.json` · blob · 2096 bytes
- `docs/assets/camera-omr-20261115/order-before-after.png` · blob · 42699 bytes
- `docs/assets/camera-omr-20261115/results.json` · blob · 15004 bytes
- `docs/avaliacoes/` · tree
- `docs/avaliacoes/BIBLIOTECA_QUADROS_118.md` · blob · 7529 bytes
- `docs/avaliacoes/CAM_FOCUS_01.md` · blob · 5911 bytes
- `docs/avaliacoes/CORRECTION_LOCAL_01.md` · blob · 1957 bytes
- `docs/avaliacoes/EXCLUSAO_SUBSTITUICAO_81.md` · blob · 21429 bytes
- `docs/avaliacoes/IMPRESSAO_ECONOMICA_122.md` · blob · 5402 bytes
- `docs/avaliacoes/PDF_DIRETO_125.md` · blob · 4838 bytes
- `docs/avaliacoes/SALVAMENTO_INTEGRAL_120.md` · blob · 8052 bytes
- `docs/evidencias/` · tree
- `docs/evidencias/avaliacoes-fase1/` · tree
- `docs/evidencias/avaliacoes-fase1/ciclo-A-leitura.png` · blob · 206139 bytes
- `docs/evidencias/avaliacoes-fase1/ciclo-final.png` · blob · 208911 bytes
- `docs/evidencias/avaliacoes-fase1/conflito-revisao.png` · blob · 190504 bytes
- `docs/evidencias/avaliacoes-fase1/leitor-mobile.png` · blob · 155646 bytes
- `docs/evidencias/avaliacoes-fase1/pr1-publicado.png` · blob · 152200 bytes
- `docs/evidencias/cartao-v2-pr41/` · tree
- `docs/evidencias/cartao-v2-pr41/01-10-uma-coluna.svg` · blob · 89377 bytes
- `docs/evidencias/cartao-v2-pr41/02-20-duas-colunas.svg` · blob · 71368 bytes
- `docs/evidencias/cartao-v2-pr41/03-50-multiplos-blocos.svg` · blob · 176104 bytes
- `docs/evidencias/cartao-v2-pr41/04-29-mistas.svg` · blob · 113783 bytes
- `docs/evidencias/cartao-v2-pr41/README.md` · blob · 1693 bytes
- `docs/evidencias/corretor-fechamento-visual/` · tree
- `docs/evidencias/corretor-fechamento-visual/antes-modal-desktop.png` · blob · 69867 bytes
- `docs/evidencias/corretor-fechamento-visual/depois-cabecalho-desktop.png` · blob · 156133 bytes
- `docs/evidencias/corretor-fechamento-visual/depois-cabecalho-mobile.png` · blob · 100365 bytes
- `docs/evidencias/corretor-fechamento-visual/depois-correcao-desktop.png` · blob · 232490 bytes
- `docs/evidencias/diario-d04/` · tree
- `docs/evidencias/diario-d04/BASELINE_REAL_D1.json` · blob · 281 bytes
- `docs/evidencias/diario-d04/D04_REAL_D1.json` · blob · 476 bytes
- `docs/evidencias/diario-d04/PRODUCTION_READ_ONLY.json` · blob · 784 bytes
- `docs/evidencias/diario-d04/UI_CONFIRMED_COUNTS.json` · blob · 529 bytes
- `docs/evidencias/diario-d04/UI_DRAFT_COUNTS.json` · blob · 180 bytes
- `favicon.svg` · blob · 264 bytes
- `index.html` · blob · 51307 bytes
- `laboratorio/` · tree
- `laboratorio/salta-omr-capture-lab/` · tree
- `laboratorio/salta-omr-capture-lab/CAMERA-FIX-01.md` · blob · 18976 bytes
- `laboratorio/salta-omr-capture-lab/LICENSE-SCANCAT-MIT.txt` · blob · 1068 bytes
- `laboratorio/salta-omr-capture-lab/README.md` · blob · 23506 bytes
- `laboratorio/salta-omr-capture-lab/candidates/` · tree
- `laboratorio/salta-omr-capture-lab/candidates/edge-first-01.mjs` · blob · 3800 bytes
- `laboratorio/salta-omr-capture-lab/css/` · tree
- `laboratorio/salta-omr-capture-lab/css/omr-lab.css` · blob · 7939 bytes
- `laboratorio/salta-omr-capture-lab/css/salta-scan.css` · blob · 8284 bytes
- `laboratorio/salta-omr-capture-lab/css/style.css` · blob · 12654 bytes
- `laboratorio/salta-omr-capture-lab/favicon.svg` · blob · 418 bytes
- `laboratorio/salta-omr-capture-lab/index.html` · blob · 12765 bytes
- `laboratorio/salta-omr-capture-lab/js/` · tree
- `laboratorio/salta-omr-capture-lab/js/app.js` · blob · 36768 bytes
- `laboratorio/salta-omr-capture-lab/js/camera-presentation.mjs` · blob · 6301 bytes
- `laboratorio/salta-omr-capture-lab/js/card-flow.js` · blob · 2509 bytes
- `laboratorio/salta-omr-capture-lab/js/experimental-detector.mjs` · blob · 1160 bytes
- `laboratorio/salta-omr-capture-lab/js/framing.js` · blob · 2169 bytes
- `laboratorio/salta-omr-capture-lab/js/marker-capture.js` · blob · 5063 bytes
- `laboratorio/salta-omr-capture-lab/js/paper-geometry.js` · blob · 1096 bytes
- `laboratorio/salta-omr-capture-lab/js/pdf.js` · blob · 3550 bytes
- `laboratorio/salta-omr-capture-lab/js/quality.js` · blob · 3101 bytes
- `laboratorio/salta-omr-capture-lab/js/vision.js` · blob · 23998 bytes
- `laboratorio/salta-omr-capture-lab/js/worker.js` · blob · 738 bytes
- `laboratorio/salta-omr-capture-lab/omr-lab.mjs` · blob · 20127 bytes
- `laboratorio/salta-omr-capture-lab/tests/` · tree
- `laboratorio/salta-omr-capture-lab/tests/camera-presentation-browser.mjs` · blob · 18257 bytes
- `laboratorio/salta-omr-capture-lab/tests/camera-presentation.test.mjs` · blob · 8008 bytes
- `laboratorio/salta-omr-capture-lab/tests/edge-first-01.test.mjs` · blob · 3147 bytes
- `laboratorio/salta-omr-capture-lab/tests/edge-first-live-integration.test.mjs` · blob · 2434 bytes
- `laboratorio/salta-omr-capture-lab/tests/paper-safe.test.mjs` · blob · 2331 bytes
- `laboratorio/salta-omr-capture-lab/tests/paper-turbo.test.mjs` · blob · 2244 bytes
- `laboratorio/salta-omr-scan-safe-02/` · tree
- `laboratorio/salta-omr-scan-safe-02/CAMERA-FIX-01.md` · blob · 18976 bytes
- `laboratorio/salta-omr-scan-safe-02/LICENSE-SCANCAT-MIT.txt` · blob · 1068 bytes
- `laboratorio/salta-omr-scan-safe-02/OMR-SCAN-SAFE-02.md` · blob · 2724 bytes
- `laboratorio/salta-omr-scan-safe-02/README.md` · blob · 23506 bytes
- `laboratorio/salta-omr-scan-safe-02/candidates/` · tree
- `laboratorio/salta-omr-scan-safe-02/candidates/edge-first-01.mjs` · blob · 3800 bytes
- `laboratorio/salta-omr-scan-safe-02/css/` · tree
- `laboratorio/salta-omr-scan-safe-02/css/omr-lab.css` · blob · 7939 bytes
- `laboratorio/salta-omr-scan-safe-02/css/salta-scan.css` · blob · 8284 bytes
- `laboratorio/salta-omr-scan-safe-02/css/style.css` · blob · 12654 bytes
- `laboratorio/salta-omr-scan-safe-02/favicon.svg` · blob · 418 bytes
- `laboratorio/salta-omr-scan-safe-02/index.html` · blob · 12939 bytes
- `laboratorio/salta-omr-scan-safe-02/integration/` · tree
- `laboratorio/salta-omr-scan-safe-02/integration/single-optical.mjs` · blob · 2166 bytes
- `laboratorio/salta-omr-scan-safe-02/integration/single-optical.test.mjs` · blob · 2063 bytes
- `laboratorio/salta-omr-scan-safe-02/js/` · tree
- `laboratorio/salta-omr-scan-safe-02/js/app.js` · blob · 40016 bytes
- `laboratorio/salta-omr-scan-safe-02/js/camera-presentation.mjs` · blob · 6301 bytes
- `laboratorio/salta-omr-scan-safe-02/js/card-flow-safe.mjs` · blob · 1058 bytes
- `laboratorio/salta-omr-scan-safe-02/js/card-flow.js` · blob · 2509 bytes
- `laboratorio/salta-omr-scan-safe-02/js/document-enhance.mjs` · blob · 6366 bytes
- `laboratorio/salta-omr-scan-safe-02/js/experimental-detector.mjs` · blob · 1160 bytes
- `laboratorio/salta-omr-scan-safe-02/js/framing.js` · blob · 2169 bytes
- `laboratorio/salta-omr-scan-safe-02/js/marker-capture.js` · blob · 5063 bytes
- `laboratorio/salta-omr-scan-safe-02/js/paper-geometry.js` · blob · 1096 bytes
- `laboratorio/salta-omr-scan-safe-02/js/pdf.js` · blob · 3550 bytes
- `laboratorio/salta-omr-scan-safe-02/js/quality.js` · blob · 3101 bytes
- `laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs` · blob · 2976 bytes
- `laboratorio/salta-omr-scan-safe-02/js/vision.js` · blob · 23998 bytes
- `laboratorio/salta-omr-scan-safe-02/js/worker.js` · blob · 1475 bytes
- `laboratorio/salta-omr-scan-safe-02/omr-lab.mjs` · blob · 21586 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/` · tree
- `laboratorio/salta-omr-scan-safe-02/tests/camera-presentation-browser.mjs` · blob · 18257 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/camera-presentation.test.mjs` · blob · 8008 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/edge-first-01.test.mjs` · blob · 3147 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/edge-first-live-integration.test.mjs` · blob · 2434 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/paper-safe.test.mjs` · blob · 2331 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/paper-turbo.test.mjs` · blob · 2244 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/safe-scan.test.mjs` · blob · 3162 bytes
- `laboratorio/salta-omr-scan-safe-02/tests/worker-optical-isolation.test.mjs` · blob · 2104 bytes
- `laboratorio/salta-scan/` · tree
- `laboratorio/salta-scan/LICENSE-SCANCAT-MIT.txt` · blob · 1068 bytes
- `laboratorio/salta-scan/README.md` · blob · 4204 bytes
- `laboratorio/salta-scan/css/` · tree
- `laboratorio/salta-scan/css/salta-scan.css` · blob · 8284 bytes
- `laboratorio/salta-scan/css/style.css` · blob · 12654 bytes
- `laboratorio/salta-scan/favicon.svg` · blob · 418 bytes
- `laboratorio/salta-scan/index.html` · blob · 8999 bytes
- `laboratorio/salta-scan/js/` · tree
- `laboratorio/salta-scan/js/app.js` · blob · 33667 bytes
- `laboratorio/salta-scan/js/pdf.js` · blob · 3550 bytes
- `laboratorio/salta-scan/js/vision.js` · blob · 23998 bytes
- `laboratorio/salta-scan/js/worker.js` · blob · 738 bytes
- `mostra-cultural.html` · blob · 54233 bytes
- `plataforma/` · tree
- `plataforma/BIBLIOTECA_AVALIACOES_UNIFICADA.md` · blob · 5776 bytes
- `plataforma/PILOTO_AVALIACOES_HOMOLOGACAO.md` · blob · 6588 bytes
- `plataforma/admin-shell.mjs` · blob · 6939 bytes
- `plataforma/assets/` · tree
- `plataforma/assets/brasao-escola.svg` · blob · 165772 bytes
- `plataforma/assets/matematica.svg` · blob · 1249 bytes
- `plataforma/assets/voces-da-ancestralidade-africa.svg` · blob · 121250 bytes
- `plataforma/assets/voces-da-ancestralidade-cartaz.svg` · blob · 188510 bytes
- `plataforma/atelie-salta.html` · blob · 48637 bytes
- `plataforma/avaliacao-excluir-dialog.css` · blob · 1424 bytes
- `plataforma/avaliacao-excluir-dialog.mjs` · blob · 1798 bytes
- `plataforma/avaliacoes-biblioteca.css` · blob · 5939 bytes
- `plataforma/avaliacoes-biblioteca.mjs` · blob · 47196 bytes
- `plataforma/catalogo-avaliacoes.mjs` · blob · 2680 bytes
- `plataforma/corretor-v2.css` · blob · 19332 bytes
- `plataforma/corretor-v2.html` · blob · 75383 bytes
- `plataforma/diario-attendance.mjs` · blob · 5145 bytes
- `plataforma/diario-teste.html` · blob · 133091 bytes
- `plataforma/eleicoes.html` · blob · 22265 bytes
- `plataforma/estatistica-acessos.html` · blob · 11293 bytes
- `plataforma/estatistica-individual.html` · blob · 38426 bytes
- `plataforma/estatistica-turma.html` · blob · 40067 bytes
- `plataforma/estatistica.html` · blob · 10287 bytes
- `plataforma/fechamento-bimestre.html` · blob · 16029 bytes
- `plataforma/festival-consciencia-negra-admin.html` · blob · 36172 bytes
- `plataforma/festival-consciencia-negra.html` · blob · 37697 bytes
- `plataforma/festival-sw.js` · blob · 1274 bytes
- `plataforma/index.html` · blob · 12591 bytes
- `plataforma/mensagens.html` · blob · 34380 bytes
- `plataforma/piloto-avaliacoes.css` · blob · 3391 bytes
- `plataforma/piloto-avaliacoes.html` · blob · 3831 bytes
- `plataforma/piloto-avaliacoes.mjs` · blob · 7915 bytes
- `plataforma/professor-theme.css` · blob · 14661 bytes
- `plataforma/professor.html` · blob · 26797 bytes
- `plataforma/tests/` · tree
- `plataforma/tests/admin-shell.test.mjs` · blob · 7754 bytes
- `plataforma/tests/atelie-salta.test.mjs` · blob · 2879 bytes
- `plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs` · blob · 119306 bytes
- `plataforma/tests/browser-qa/` · tree
- `plataforma/tests/browser-qa/qa_complete_02.py` · blob · 27429 bytes
- `plataforma/tests/browser-qa/qa_integrada.py` · blob · 48298 bytes
- `plataforma/tests/browser-qa/qa_synthetic_gateway.js` · blob · 9884 bytes
- `plataforma/tests/correction-context.test.mjs` · blob · 4709 bytes
- `plataforma/tests/corretor-camera-progress-p1.test.mjs` · blob · 11961 bytes
- `plataforma/tests/corretor-camera-torch-ui.test.mjs` · blob · 17524 bytes
- `plataforma/tests/corretor-interface.test.mjs` · blob · 1583 bytes
- `plataforma/tests/corretor-omr-camera-cross-integration.test.mjs` · blob · 23347 bytes
- `plataforma/tests/corretor-review-suggestions.test.mjs` · blob · 9084 bytes
- `plataforma/tests/corretor-stale-grade-audit-p1.test.mjs` · blob · 16998 bytes
- `plataforma/tests/corretor-ux-ready-01.test.mjs` · blob · 6439 bytes
- `plataforma/tests/corretor-visual-flow.test.mjs` · blob · 15254 bytes
- `plataforma/tests/diario-attendance.test.mjs` · blob · 6664 bytes
- `plataforma/tests/formato-nota-p1-85.test.mjs` · blob · 6291 bytes
- `plataforma/tests/int-scan-01-frame-choice.test.mjs` · blob · 10647 bytes
- `plataforma/tests/piloto-avaliacoes-isolado.test.mjs` · blob · 18083 bytes
- `plataforma/vendor/` · tree
- `plataforma/vendor/pdf/` · tree
- `plataforma/vendor/pdf/LICENSE.jspdf` · blob · 1142 bytes
- `plataforma/vendor/pdf/LICENSE.svg2pdf` · blob · 1126 bytes
- `plataforma/vendor/pdf/jspdf.umd.min.js` · blob · 420165 bytes
- `plataforma/vendor/pdf/svg2pdf.umd.min.js` · blob · 87804 bytes
- `preview-aluno.html` · blob · 51199 bytes
- `salta-theme.css` · blob · 4778 bytes
- `scripts/` · tree
- `scripts/diagnose-omr-raster.mjs` · blob · 3774 bytes
- `scripts/verify-auto-correction-scope.mjs` · blob · 5999 bytes
- `scripts/verify-camera-focus-browser.mjs` · blob · 9722 bytes
- `scripts/verify-camera-focus-raster.mjs` · blob · 8047 bytes
- `scripts/verify-camera-focus-scope.mjs` · blob · 4236 bytes
- `scripts/verify-camera-geometry.mjs` · blob · 6986 bytes
- `scripts/verify-card-artwork-raster.mjs` · blob · 14167 bytes
- `scripts/verify-card-header-raster.mjs` · blob · 4224 bytes
- `scripts/verify-correction-local-scope.mjs` · blob · 5090 bytes
- `scripts/verify-direct-pdf-browser.mjs` · blob · 14452 bytes
- `scripts/verify-direct-pdf-mobile.mjs` · blob · 6034 bytes
- `scripts/verify-direct-pdf-scope.mjs` · blob · 2960 bytes
- `scripts/verify-economy-browser.mjs` · blob · 13147 bytes
- `scripts/verify-economy-scope.mjs` · blob · 2621 bytes
- `scripts/verify-product-ux-scope.mjs` · blob · 14436 bytes
- `scripts/verify-scan-integration-scope.mjs` · blob · 7422 bytes
- `scripts/verify-single-shot-scope.mjs` · blob · 4293 bytes
- `solucionador.html` · blob · 70357 bytes
- `stats-worker/` · tree
- `stats-worker/migrations/` · tree
- `stats-worker/migrations/0001_d04_receipts.sql` · blob · 845 bytes
- `stats-worker/tests/` · tree
- `stats-worker/tests/diario-d04-baseline.repro.mjs` · blob · 2855 bytes
- `stats-worker/tests/diario-d04.integration.mjs` · blob · 7495 bytes
- `stats-worker/tests/diario-d04.test.mjs` · blob · 9837 bytes
- `stats-worker/tests/diario-periods.test.mjs` · blob · 9939 bytes
- `stats-worker/tests/fixtures/` · tree
- `stats-worker/tests/fixtures/d04/` · tree
- `stats-worker/tests/fixtures/d04/worker.mjs` · blob · 2819 bytes
- `stats-worker/tests/fixtures/d04/wrangler.toml` · blob · 404 bytes
- `stats-worker/tests/support/` · tree
- `stats-worker/tests/support/d04-fixture.mjs` · blob · 3126 bytes
- `stats-worker/tests/support/local-d1.mjs` · blob · 2328 bytes
- `stats-worker/worker.js` · blob · 201800 bytes
- `stats-worker/wrangler.toml` · blob · 399 bytes
