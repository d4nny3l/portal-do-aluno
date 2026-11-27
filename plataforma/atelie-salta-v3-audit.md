# SALTA EXECUTOR VISUAL — DESIGN-SALTA-03

**Missão:** Issue [#149](https://github.com/d4nny3l/portal-do-aluno/issues/149) + [adendo obrigatório #7224525896](https://github.com/d4nny3l/portal-do-aluno/issues/149#issuecomment-7224525896).
**Base:** `main@e9ed27f75eeb9f747a78c240c8766e8db5fee748`, com DESIGN-SALTA-02 (#148) já integrado.
**PR:** #150 — branch `feat/design-salta-03-direct-bulk-matrix`, obrigatoriamente **DRAFT**.
**Estado:** implementação demonstrativa concluída, CI isolada conforme; **auditoria independente e nova homologação física dirigidas aos dois pontos P1 ainda pendentes**. Não há autorização para merge/deploy.

## Matriz de correspondência (Issue #149 e adendo)

| Decisão do proprietário | Implementação estritamente no Ateliê | Interação demonstrável | Teste/evidência | Risco remanescente |
|---|---|---|---|---|
| Vistos diretamente na célula, sem popup comum | `assignCommon` + `paint` in-place em `atelie-salta-v2-matrix.mjs` | —→✓→×→✓ na mesma célula por clique, toque, Enter ou Espaço | `atelie-salta-v3.test.mjs` + Playwright 03 | Rehomologação física |
| Vistos especiais não sobrescritos | `isSpecial('checks')` para ◷/FJ/FA/Isento | Clique comum preserva; botão explícito “Estado especial / limpar célula selecionada” abre edição deliberada | Teste de exceção por célula e lote; captura `checks-after` | Sem regras legais inventadas |
| “Todos realizados”/“Todos não realizados” | `applyBulk('checks',rows,j,'✓'/'×')` | Selecionar explicitamente uma atividade por cabeçalho ou seletor; aplicar somente a essa coluna | Unitários + Playwright 03 | Proteção de exceções deliberada |
| Escopo da turma inteira | 30 estudantes sintéticos em memória, sem limitar pelos resultados da busca | Filtrar por “Estudante 07” e acionar “Todos”: a indicação comunica 30 estudantes | Unitário `query` + Playwright com filtro | Nunca aplicar a dados reais |
| Preservar ajustes individuais | Lote altera somente coluna escolhida; edição subsequente altera apenas célula | Após lote, clique em um estudante, mude para outra atividade e verifique o ajuste | Unitário e Playwright de colunas independentes | Outro lote deliberado na mesma atividade naturalmente altera células comuns |
| Chamada P↔F sem popup comum | `assignCommon('attendance')`, —→P e contadores derivados | Clique/toque/Enter/Espaço; mudança imediata sem modal | Unitários + browser 03 | Nenhuma frequência real registrada |
| “Todos presentes”/“Todos ausentes” | `applyBulk('attendance',students,lesson,'P'/'F')` | Operar na aula selecionada, 30 estudantes, mantendo FJ/FA | Unitário exceções + Playwright 03 | Aula de exemplo, não turma real |
| Preservar FJ/FA e motivos | Estados e motivos são ignorados pela mudança comum e pelo lote; editar/limpar apenas pelo botão explícito | Ajustar FJ de um estudante, lançar “Todos presentes” e conferir FJ preservado | Playwright 03 + fixture unitário | Razões jurídicas exigem missão de regras própria |
| Confirmação coletiva explícita | `attendance.confirmed[lesson]` alterado somente após “Confirmar rascunho” ou invalidado por alteração efetiva naquela aula | Confirmar Aula 1, editar Aula 1, garantir Aula 2 independente | Unitários + Playwright 03 | Sem recibo/servidor |
| Contadores imediatos | `updateSummary()` in-place | P/F/FJ/FA/— por aula; ✓/×/—/◷/FJ/FA/Isento por atividade selecionada, total 30 | Playwright textos atualizados e testes unitários | Denominadores acadêmicos não inferidos |
| Grade, foco e rolagem preservados | `paint()` altera só o botão; `markActive()` altera classes; cabeçalho duplo e coluna fixa seguem intactos | Rolagem profunda, célula 25, tecla Enter/Espaço, busca e lote sem perder scroll | Browser 03 390/1440/WebKit 390 | Conferir toque em iPhone físico e voz/zoom |
| Notas e outras 20 decisões | Modo `grades` mantém editor intencional; 22 composições e biblioteca dos 68 ícones inalterados | Abrir Notas, editar/cancelar; navegar 15.1–15.22 | Browser original 6/6 + 24/24 + 389/389 | Auditor visual deve conferir diff |
| Favicon C aprovado | SVG C preexistente (`#17324D → #166AA6`, S branco) é único `rel=icon` do Ateliê; C preselecionado na galeria | Compare A/B/D, mas C continua decisão aprovada; não alterar favicon raiz/PWA | Testes unitários + navegador/head + captura | Aplicação ao sistema oficial é outra missão |

## Como reproduzir sem dados reais

Abrir localmente `plataforma/atelie-salta.html` da branch do PR #150 por um servidor HTTP estático isolado. As demonstrações usam somente fixtures com 30 estudantes genéricos. **Não inserir dados pessoais ou credenciais.** No Ateliê, abrir **Telas → 15.8 (Chamada)**: clicar duas vezes na mesma célula, aplicar “Todos ausentes”, ajustar um aluno, configurar FJ pelo controle especial, aplicar “Todos presentes”, confirmar, trocar aula e conferir independência. Em **15.10 (Vistos)**: clicar —→✓→×→✓, selecionar “Revisão”, executar ambos os lotes, filtrar e verificar o total de 30, ajustar uma célula, preservar ◷ e limpar somente pelo botão especial. Em **Cores**, comparar ícones com C preselecionado; favicon da aba deve ser sempre C. Em **15.9 (Notas)**, o editor deve continuar deliberado, conforme DESIGN-SALTA-02.

## Evidências de execução

- [Workflow exclusivo DESIGN-SALTA-03 — SUCCESS](https://github.com/d4nny3l/portal-do-aluno/actions/runs/46044196545).
- [Pacote de capturas e relatórios](https://github.com/d4nny3l/portal-do-aluno/actions/runs/46044196545/artifacts/15221438502), aproximadamente 20,6 MB: `atelie-v2-evidence/`, `atelie-v2-fidelity-evidence/` e `atelie-v3-interaction-evidence/`. Este último inclui `attendance-before/after` e `checks-before/after` para Chromium 390, Chromium 1440 e WebKit 390, além de `report.json`.
- 24/24 testes estáticos, 389/389 regressões, 6/6 verificações responsivas 22/68, 6/6 verificações de fidelidade do V2, 3/3 cenários novos de clique/lote/teclado/toque/scroll. Guard de escopo PASS, `git diff --check` PASS.
- [Check paralelo OMR](https://github.com/d4nny3l/portal-do-aluno/actions/runs/46044196505): FAILURE por `Unauthorized #141 context` em `Scan Safe candidate contracts`; não modificado. Não usar este laboratório como aprovação óptica.

## Proteções e portões

- O PR muda **somente o HTML/CSS/JS do Ateliê, seus testes e workflow**. Os outros módulos, favicon raiz, manifest/PWA, câmera, OMR, Auth, Workers, D1 e dados não entram no diff.
- Comparação com main é parte obrigatória do guard. Nenhum serviço, login, API, armazenamento ou transmissão de dados é acionado.
- **Auditoria independente**: conferir logicamente cada item da tabela, capturas e HEAD final, inclusive o impacto limitado em Notas e no editor de exceções.
- **Homologação do proprietário**: testar fisicamente no iPhone/Safari; especialmente disparos rápidos, atalhos, seleção de atividade, foco, rolagem, conteúdo dos contadores e ausência de popup comum.
- **Próximo passo condicionado**: somente com parecer independente e nova autorização poderão ser considerados merge/deploy; a aplicação visual às interfaces oficiais será missão posterior e separada.
