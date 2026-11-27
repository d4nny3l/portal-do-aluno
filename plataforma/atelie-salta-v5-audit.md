# SALTA EXECUTOR VISUAL — DESIGN-SALTA-05

**Missão:** [Issue #153](https://github.com/d4nny3l/portal-do-aluno/issues/153) · Ações coletivas nos cabeçalhos e date picker modal.

**Base autorizada:** `main@3f844540296e69074af0746d755526d2d9418bf4` (DESIGN-SALTA-04 já integrado).
**Branch:** `feat/design-salta-05-header-bulk-picker` · **PR DRAFT:** [#154](https://github.com/d4nny3l/portal-do-aluno/pull/154).

## Matriz de correspondência

| Decisão aprovada | Implementação demonstrável no Ateliê existente | Evidência / teste | Ressalva |
|---|---|---|---|
| Frequência: dois atalhos por aula sob data | `f2-head-bulk` em cada `th` de duas aulas fictícias, com `data-f2-col-target` explícito, ícones locais check-circle/x, P/F visível | Teste 05 + browser 6 resoluções | Não representa gravação real |
| Uma aula não modifica outra | `bulk('attendance',j,target)` direcionado pelo próprio botão; estado `attendance.lesson` apenas acompanha o contexto da coluna acionada | Testes de unidade e navegador com Aula 1/Aula 2 | Não inventa ocorrências ou datas |
| Chamada FJ/FA, motivos e confirmação | Reuso **sem alteração** de `applyBulk` e checagens `isSpecial`; confirmação invalidada somente quando a própria aula sofreu mudança, confirmação final explícita | Unitários e Playwright 03/05 | Estado de confirmação apenas sintético |
| Vistos: dois atalhos sob cada atividade | Ícones locais check-circle/x e legenda ✓/× abaixo dos 8 cabeçalhos; acionamento instantâneo direto de coluna | Testes 05 dos 8 botões e atalhos acessíveis | Sem pré-seletor |
| Vistos ◷/FJ/FA/Isento | Mesma `applyBulk`, sem sobrescrever exceções; não afeta outras colunas | Teste com todas as exceções e ajuste individual posterior | Estado especial depende de comando deliberado |
| Busca não altera escopo coletivo | `bulk` usa todos os 30 estudantes e aplica `paint` somente nas células visíveis, com feedback de turma inteira | Browser com filtro reduzindo a uma linha | Fixtures sintéticas |
| Densidade/cabeçalhos fixos/rolagem | Somente `th` do segundo nível cresce para acomodar dois botões. Linhas preservam 27px no desktop e 44px no mobile, sem coluna nova | Browser 320/390/768/1440/1920 e WebKit390 | Auditor conferir zoom real |
| Nome acessível, legenda, tooltip | `aria-label`, `title`, ícones SVG originais, letra P/F ou ✓/× e `role=tooltip` visível por hover/foco de teclado | HTML e browser 05 com foco/tecla/touch | Não confiar só em cor |
| Date picker centralizado e branco | `openPickerModal` em `atelie-salta-v2-calendar.mjs`: `role=dialog`, `aria-modal=true`, backdrop navy 24%, blur 2px, largura máxima 390px e foco protegido | Browser 05 com verificação de CSS/geometria e screenshots | WebKit CI ≠ Safari físico |
| Fechar, cancelar, confirmar, limpar | Escape, clique fora, Cancelar preservam valor anterior; Limpar altera somente `state.selected`; Confirmar aplica e fecha. Retorno do foco ao gatilho e scroll bloqueado/restaurado | Browser 05 e teste estático do módulo | Nenhuma escrita de servidor |
| Data única, intervalo, 15.22 | `controls.mjs` e `compositions.mjs` invocam o **mesmo** `openPickerModal`, sem slot inline exibido | Browser 05 e regressão 02 | Nenhum picker paralelo |
| Mês/ano/bissexto e Hoje | `mountPicker` original reutilizado, com foco recuperado após trocar ano/mês/dia e seleção nula não confundida com data escolhida | Browser 29/02/2024; confirmar/cancelar | Ano permitido 1900–2100 como antes |
| Agenda mensal/semanal/diária | `mountCalendar` **byte a byte preservado** em relação à base autorizada, verificado no guard | Testes 02/05 e comparação textual em CI | Não converter agenda em modal |
| Notas da DESIGN-04 | `grade-mask.mjs` e seus contratos não estão no diff; editor inline, máximo, precisão 0/1/2, colagem convencional e trava silenciosa preservados | Regressão browser 04/05 + unitários | Não são lançamentos oficiais |
| Favicon C, 22 composições e 68 símbolos | Assets preexistentes permanecem byte a byte inalterados no diff; navegação e seis abas mantidas | Guard + 6 viewports + unitários | Aplicação produtiva é missão futura |

## Roteiro de homologação dirigido

**A. Frequência 15.8 (C):** abrir a planilha e clicar no ícone F sob **Aula 2** antes de selecionar qualquer aula. Conferir que 30 estudantes sintéticos foram marcados nessa coluna, enquanto **Aula 1** permanece intacta. Confirmar Aula 2, mudar Aula 1 pelo cabeçalho e retornar à Aula 2: sua confirmação permanece. Marcar um FJ com motivo sintético em Aula 1, executar Todos presentes nessa mesma coluna, verificar FJ protegido; filtrar um estudante, aplicar outro lote e confirmar escopo de 30. Teclado (Enter), toque, scroll/foco e ausência de popup comum.

**B. Vistos 15.10 (C):** sem seletor prévio, acionar ✓ sob Revisão e × sob Estatística. Verificar alterações somente em cada atividade, contador de 30, preservação de ◷/FJ/FA/Isento e dos ajustes individuais feitos em outra coluna. Testar a pesquisa e os 8 pares de botões, rótulos, tooltip por foco e mobile.

**C. Date picker:** em Componentes escolher data; observar overlay translúcido/desfocado e painel branco central, sem empurrar conteúdo. Navegar até fevereiro/2024 e confirmar 29/02/2024; reabrir, limpar e cancelar (deve restaurar data); testar Escape, clique fora, abrir novamente, limpar/confirmar, Hoje. Verificar foco retorna ao botão, que Tab/Shift+Tab não saem do diálogo, scrollbar de fundo fica bloqueada e não há duas instâncias. Testar início/fim do intervalo e seletor da composição **15.22**. Em **15.7** alternar agendas mensal/semanal/diária sem modal.

**D. Regressões:** editar nota na célula, digitar `245` com 2 casas (2,45), tentar entrada acima de 10,00 sem qualquer aviso; verificar zero/vazio, notas anteriores, cabeçalhos, rolagem e favicon C. Percorrer seis abas, 22 composições e 68 símbolos.

## Estratégia de segurança e limites

- **Único laboratório autorizado:** Ateliê existente, somente dados sintéticos (30 alunos de exemplo), nenhuma API, Worker, Auth, D1, armazenamento real, câmera, leitor OMR, Magic Scan, cartões/PDF, CSS compartilhado ou interface oficial modificada.
- **Guard cumulativo:** compara PR com base exata, restringe arquivos, exige contratos 03/04/05 e prova que `mountCalendar` está **identicamente preservado** ao da base autorizada. Executa `git diff --check`.
- **CI:** executar sintaxe, testes unitários, regressão geral `AGENTS.md`, navegadores Chromium/WebKit, captura de estados antes/depois e relatório JSON, sem deploy. Os relatórios são armazenados em artefato da própria GitHub Actions, sem publicar o Ateliê.
- **Limitações obrigatórias:** WebKit automatizado não substitui Safari físico; revisão de leitor de tela e toque real dependem do Homologador. Não confundir simulação com confirmação de servidor. Qualquer bloqueio contextual externo ao escopo (por exemplo, guard OMR #141) permanece preservado, sem contorno.
- **Portões:** auditor visual independente deve confrontar esta matriz e o HEAD final, depois o proprietário faz homologação física. O PR permanece **DRAFT**, sem merge ou deploy até autorização específica; aplicação oficial da identidade é projeto posterior.
