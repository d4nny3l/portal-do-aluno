# DESIGN-SALTA-02 — Matriz de fidelidade e testes de homologação interativa

**Autoridade:** Issue #147 (reprovação física), ata #143 comentário 7218594671, retificação 7206977286. **Base:** `main@f8319e05506861b15589e22aa2a4436df336581a`. **Escopo:** apenas Ateliê; nenhuma tela oficial, OMR, Magic Scan, Auth, Worker, D1, dados. O código das 68 escolhas anteriores não foi alterado. Os novos ícones de favicon A/B/C/D são candidatos, NÃO aprovados.

**Como ler:** “Conforme em CI sintética” significa exclusivamente que o exemplo teve verificação automatizada funcional na branch, sem atestar aprovação visual do proprietário. **A homologação física de 27/11 permanece REPROVADA até uma nova avaliação.** O status “Lacuna/decisão aberta” é mantido para alternativas não escolhidas. A reprovação física anterior continua válida até nova homologação do proprietário. Os valores das prévias são sintéticos; não representam regra acadêmica.

| Decisão | Alternativa aprovada | Antes: lacuna/divergência #147 | Prévia / componente corrigido | Interação verificável | Evidência / teste | Estado de homologação |
|---|---|---|---|---|---|---|
| 1–7 | B aprovado | Tokens de marca, tipografia, paleta; favicon O + A/B/C/D pendente | Ateliê/Cores | Alternar radio favicon, inspeção 16/32/48/64 e abas claras/escuras | f2-favicon-choice; screenshot Cores | Conforme em CI sintética; homologação física pendente |
| 8 | mensal/semanal/diária | Calendário com datas reais e turnos; agenda coerente | 15.7 | Mudar mês, semana, dia e escolher data; aulas dependem de dia | monthDays; cal-prev; cal-next; cal-today | Conforme em CI sintética; homologação física pendente |
| 9 | popup branco | Seletor de datas, confirmação, edição e ficha | Componentes/15.22 | Selecionar e confirmar/cancelar data; modal Escape e foco | picker-confirm/cancel/clear; v2-modal-overlay | Conforme em CI sintética; homologação física pendente |
| 10 | tabela C 27px | 30 linhas, 2 cabeçalhos fixos, 1ª coluna fixa, cruzamento | 15.8/15.9/15.10 | Clicar/teclar célula, editar, confirmar/cancelar e scroll | f2-sheet-scroller; f2-active-cell | Conforme em CI sintética; homologação física pendente |
| 11 | controles nativos customizados | Checkbox, rádio, switch trilho, upload dropzone, menu, filtros | Componentes | Indeterminate, seleção única, switch, upload/remover/erro, filtro, tooltip | f2-control-app | Conforme em CI sintética; homologação física pendente |
| 12 | movimento C | Menos movimento, feedback rápido, sem efeitos em OMR | Movimentos/Componentes | Hover, press, modal 200ms e preferência reduced motion | prefers-reduced-motion | Conforme em CI sintética; homologação física pendente |
| 13 | estados semânticos | Rascunho != servidor, avisos lido != resolvido | Componentes/15.18 | Alternar estados, aviso lido/não lido, toast e conflito | v2-state-render; f2-notice-filter | Conforme em CI sintética; homologação física pendente |
| 14 | responsividade híbrida C | desktop sidebar 240/tablet rail64/mobile nav horizontal + atalhos | 22 prévias | Interagir em 320/390/768/1440/1920/WebKit, scroll matriz | f2-shell-nav; f2-shortcuts | Conforme em CI sintética; homologação física pendente |
| 15.1 | B | Portal premium sem sidebar genérica | Entrada | Entrar por Área Professor/Aluno na prévia | entry; f2-entry-shell | Conforme em CI sintética; homologação física pendente |
| 15.2 | B | Login institucional sem credenciais reais | Login | Digitar ID sintético, validar campo sem autenticar, exibir senha | login-submit; login-show | Conforme em CI sintética; homologação física pendente |
| 15.3 | A | Atalhos ANTES da agenda e indicadores | Professor | Abrir destino de ferramenta pela primeira seção | f2-home-shortcuts DOM order | Conforme em CI sintética; homologação física pendente |
| 15.4 | B | Diário no contexto instituição/turma | Diário | Trocar tab Aula/Notas/Acompanhamento/Planejamento e contexto | f2-context; f2-diary-grade-preview | Conforme em CI sintética; homologação física pendente |
| 15.5 | B | Instituições com turmas sob seleção | Instituições | Selecionar escola e turma; contexto visível | f2-school; f2-class | Conforme em CI sintética; homologação física pendente |
| 15.6 | B | Ficha acadêmica com sete abas | Ficha | Notas/Frequência/Vistos/Observações/Habilidades/Avisos/Cadastro | f2-record-matrix; f2-tab-type | Conforme em CI sintética; homologação física pendente |
| 15.7 | B | Calendário + agenda integrada | Calendário | Dia/mês/semana e três turnos, próxima aula | f2-calendar-slot | Conforme em CI sintética; homologação física pendente |
| 15.8 | C | Duas aulas independentes, rascunho e histórico | Chamada | P/F/FJ/FA/— mesma célula, cancelar/confirmar e histórico | matrix-lesson-0/1; matrix-confirm | Conforme em CI sintética; homologação física pendente |
| 15.9 | C | Originais x recuperação separadas, 0/vazio/* | Notas | Editar célula, respeitar máximo sintético; sem motor de cálculo | matrix-apply; f2-grade-max | Conforme em CI sintética; homologação física pendente |
| 15.10 | C | Vistos por atividade e planilha | Vistos | Alterar mesmo visto para ✓/×/◷/—/exceções; modo individual | matrix-tab-single; f2-check-state | Conforme em CI sintética; homologação física pendente |
| 15.11 | C | Biblioteca, sequência, editor detalhado | Planejamento | Usar modelo, validar campos, limpar | plan-use; plan-review; plan-clear | Conforme em CI sintética; homologação física pendente |
| 15.12 | B | Central gerencial sem óptica | Corretor | Selecionar avaliação e filtrar exemplo | f2-scan; f2-scan-filter | Conforme em CI sintética; homologação física pendente |
| 15.13 | B | Gerador com prévia simultânea NÃO óptica | Gerador | Configurar formato/quantidade/turma, atualizar cartão conceitual | f2-gen; gen-preview | Conforme em CI sintética; homologação física pendente |
| 15.14 | B | Gráfico numerado + legenda + tabela | Estatísticas | Trocar dimensão de gráfico e comparar contagens | f2-chart; f2-tab-type | Conforme em CI sintética; homologação física pendente |
| 15.15 | B | Resumo próprio, atalhos e aviso | Portal do Aluno | Abrir calendário/avisos sem consulta acadêmica | student; f2-go | Conforme em CI sintética; homologação física pendente |
| 15.16 | C | Projetos por planejamento/execução/conclusão | Projetos | Selecionar projeto; ficha de grupo/avaliador/critério/resultado/publicação | f2-project | Conforme em CI sintética; homologação física pendente |
| 15.17 | B | CONNECT por sistema, prévia, histórico, conflito | CONNECT | Selecionar sistema, navegar e comparar conflito fictício | f2-connect; connect-compare | Conforme em CI sintética; homologação física pendente |
| 15.18 | B | Central de avisos premium | Avisos | Filtrar/lido/não lido/adicionar aviso sintético | notice-new; notice- | Conforme em CI sintética; homologação física pendente |
| 15.19 | B | Documentos por categoria e formato | Documentos | Mudar categoria e formato; atualizar prévia branca não óptica | f2-doc; f2-doc-preview | Conforme em CI sintética; homologação física pendente |
| 15.20 | B | Configurações por finalidade | Configurações | Mudar tabs e checkboxes da prévia | f2-setting; f2-tab-type | Conforme em CI sintética; homologação física pendente |
| 15.21 | A | 68 SVG aprovados inalterados | Símbolos | Acessar catálogo original, pesquisar/trocar tamanho | open-symbols; v2-icon-search | Conforme em CI sintética; homologação física pendente |
| 15.22 | B | Secundários, estados, 404, perfil, picker | Secundários | Abrir aviso e date picker, cancelar/confirmar | secondary-picker; secondary-notifications | Conforme em CI sintética; homologação física pendente |
| favicon | ABCD pendente | Quatro variações + original sem alterar produção | Cores | Selecionar localmente, comparar cinco tamanhos/abas | f2-favicon-gallery | Lacuna de decisão: proprietário escolher A/B/C/D; não aplicar |

## Roteiro de inspeção física pelo proprietário

1. **Componentes:** na aba Componentes, experimente marcar/desmarcar/indeterminado/indisponível, rádio de escolha única, switch com trilho e rótulo, selecionar e remover arquivo de teste (não use documentos sensíveis), erro e drag/drop; abra date picker, navegue mês/ano, selecione e confirme/cancele. Teste modal com Escape, foco e tooltip.
2. **Telas:** use as quatro ações rápidas Calendário, Chamada, Notas, Vistos. Em Calendário 15.7, experimente novembro de 2026 e fevereiro de 2024 no date picker; mude mês/semana/dia. Em Chamada 15.8, edite uma célula da Aula 1 e confirme apenas localmente; verifique a Aula 2 intocada e o Histórico. Em Notas 15.9, edite 0/vazio e valor maior que máximo sintético. Em Vistos 15.10, altere a mesma célula duas vezes e experimente registro individual.
3. **Composições:** use o seletor 15.1–15.22, cada tela possui uma ação focal: entrada, login sem credencial, atalhos do professor em primeiro lugar, Diário com abas, escola/turma, ficha com sete abas, planejamento com modelo/editor, gestão do Corretor **sem câmera**, gerador **sem geometria óptica**, gráficos com valores e legenda, Portal do Aluno, projetos por etapa, CONNECT com histórico/conflitos, avisos marcáveis, documentos com prévia dinâmica, configurações, catálogo SVG e estados auxiliares.
4. **Favicon:** aba Cores, escolha Original/A/B/C/D e compare o S em 16/32/48/64px e em abas claras/escuras. **Não há decisão aprovada sobre o novo favicon.**
5. **Tamanhos:** repetir no iPhone/Safari real, desktop, tablet, zoom 200%, modo de redução de movimento, teclado, leitura de tabelas com rolagem. Capturas CI são sintéticas e não substituem a verificação física.

## Lacunas não preenchidas unilateralmente

- Contratos pedagógicos e legais de FJ/FA/isenção, notas, recuperação e resultado final não são inferidos. Nenhum cálculo de resultado foi criado; os máximos apresentados pertencem apenas ao fixture.
- A conexão de CONNECT e qualquer autenticação real continuam fora de escopo.
- Favicon A/B/C/D aguarda escolha explícita. Não modificar `favicon.svg` oficial nem manifest/PWA.
- Fluxo óptico é deliberadamente NÃO demonstrado; cartões, câmera, overlay e leitor continuam protegidos.
- A eventual aplicação da identidade às telas oficiais exige nova autorização.

## Estado da validação

Atualizar no PR DRAFT com HEAD, relatório do CI, screenshots antes/depois, falhas remanescentes e parecer do AUDITOR VISUAL. Não confundir teste de navegador sintético com aprovação física.

## Resultado técnico consolidado para revisão independente

**HEAD validado:** `8ebc7d0edce74e5701f349b857587c97b86cbfa6` (antes desta atualização documental). Workflow exclusivo <https://github.com/d4nny3l/portal-do-aluno/actions/runs/46021060827>: **SUCCESS**. Provas: 17/17 testes estáticos, 382/382 regressões gerais, **6/6** viewports em testes originais e **6/6** nos testes comportamentais novos; cinco cenários Chromium (320, 390, 768, 1440 e 1920 px) e WebKit 390. Os três cenários de comportamento profundo foram Chromium 390, Chromium 1440 e WebKit 390. Guard de escopo aprovado antes e após a execução.

**Evidências com capturas (≈19 MB):** <https://github.com/d4nny3l/portal-do-aluno/actions/runs/46021060827/artifacts/15208910139>. Contêm capturas das páginas e de estados: favicon C, controles alterados, date picker bissexto, calendário atualizado, chamada/histórico, notas editadas e vistos individuais. O ensaio usa dados sintéticos e não realiza tráfego externo.

**Check paralelo ainda vermelho:** <https://github.com/d4nny3l/portal-do-aluno/actions/runs/46021060119>, guard de integração OMR reservado ao PR #141 (`Unauthorized #141 context`) no pipeline geral; não alterar proteção óptica neste escopo. O verde acima é do workflow próprio Ateliê V2, não de todos os checks do PR.

**Pendências formais:** auditoria visual independente dos 22 exemplos (comparação com ata e capturas), teclado/zoom/leitor de tela e Safari físico reais, e homologação renovada do proprietário. A escolha do favicon é **aberta**, logo a linha “favicon” é uma lacuna de decisão, não defeito de código corrigível unilateralmente. A versão main/oficial e suas funcionalidades não são modificadas.
