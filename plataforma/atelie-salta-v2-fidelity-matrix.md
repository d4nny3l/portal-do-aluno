# DESIGN-SALTA-02 — Matriz de fidelidade e testes de homologação interativa

**Autoridade:** Issue #147 (reprovação física), ata #143 comentário 7218594671, retificação 7206977286. **Base:** `main@f8319e05506861b15589e22aa2a4436df336581a`. **Escopo:** apenas Ateliê; nenhuma tela oficial, OMR, Magic Scan, Auth, Worker, D1, dados. O código das 68 escolhas anteriores não foi alterado. Os novos ícones de favicon A/B/C/D são candidatos, NÃO aprovados.

**Como ler:** “Em implementação” é estado inicial; somente marcar Conforme após aprovação dos testes específicos *e* auditoria manual. A reprovação física anterior continua válida até nova homologação do proprietário. Os valores das prévias são sintéticos; não representam regra acadêmica.

| Decisão | Alternativa aprovada | Antes: lacuna/divergência #147 | Prévia / componente corrigido | Interação verificável | Evidência / teste | Estado de homologação |
|---|---|---|---|---|---|---|
| 1–7 | B aprovado | Tokens de marca, tipografia, paleta; favicon O + A/B/C/D pendente | Ateliê/Cores | Alternar radio favicon, inspeção 16/32/48/64 e abas claras/escuras | f2-favicon-choice; screenshot Cores | Em implementação |
| 8 | mensal/semanal/diária | Calendário com datas reais e turnos; agenda coerente | 15.7 | Mudar mês, semana, dia e escolher data; aulas dependem de dia | monthDays; cal-prev; cal-next; cal-today | Em implementação |
| 9 | popup branco | Seletor de datas, confirmação, edição e ficha | Componentes/15.22 | Selecionar e confirmar/cancelar data; modal Escape e foco | picker-confirm/cancel/clear; v2-modal-overlay | Em implementação |
| 10 | tabela C 27px | 30 linhas, 2 cabeçalhos fixos, 1ª coluna fixa, cruzamento | 15.8/15.9/15.10 | Clicar/teclar célula, editar, confirmar/cancelar e scroll | f2-sheet-scroller; f2-active-cell | Em implementação |
| 11 | controles nativos customizados | Checkbox, rádio, switch trilho, upload dropzone, menu, filtros | Componentes | Indeterminate, seleção única, switch, upload/remover/erro, filtro, tooltip | f2-control-app | Em implementação |
| 12 | movimento C | Menos movimento, feedback rápido, sem efeitos em OMR | Movimentos/Componentes | Hover, press, modal 200ms e preferência reduced motion | prefers-reduced-motion | Em implementação |
| 13 | estados semânticos | Rascunho != servidor, avisos lido != resolvido | Componentes/15.18 | Alternar estados, aviso lido/não lido, toast e conflito | v2-state-render; f2-notice-filter | Em implementação |
| 14 | responsividade híbrida C | desktop sidebar 240/tablet rail64/mobile nav horizontal + atalhos | 22 prévias | Interagir em 320/390/768/1440/1920/WebKit, scroll matriz | f2-shell-nav; f2-shortcuts | Em implementação |
| 15.1 | B | Portal premium sem sidebar genérica | Entrada | Entrar por Área Professor/Aluno na prévia | entry; f2-entry-shell | Em implementação |
| 15.2 | B | Login institucional sem credenciais reais | Login | Digitar ID sintético, validar campo sem autenticar, exibir senha | login-submit; login-show | Em implementação |
| 15.3 | A | Atalhos ANTES da agenda e indicadores | Professor | Abrir destino de ferramenta pela primeira seção | f2-home-shortcuts DOM order | Em implementação |
| 15.4 | B | Diário no contexto instituição/turma | Diário | Trocar tab Aula/Notas/Acompanhamento/Planejamento e contexto | f2-context; f2-diary-grade-preview | Em implementação |
| 15.5 | B | Instituições com turmas sob seleção | Instituições | Selecionar escola e turma; contexto visível | f2-school; f2-class | Em implementação |
| 15.6 | B | Ficha acadêmica com sete abas | Ficha | Notas/Frequência/Vistos/Observações/Habilidades/Avisos/Cadastro | f2-record-matrix; f2-tab-type | Em implementação |
| 15.7 | B | Calendário + agenda integrada | Calendário | Dia/mês/semana e três turnos, próxima aula | f2-calendar-slot | Em implementação |
| 15.8 | C | Duas aulas independentes, rascunho e histórico | Chamada | P/F/FJ/FA/— mesma célula, cancelar/confirmar e histórico | matrix-lesson-0/1; matrix-confirm | Em implementação |
| 15.9 | C | Originais x recuperação separadas, 0/vazio/* | Notas | Editar célula, respeitar máximo sintético; sem motor de cálculo | matrix-apply; f2-grade-max | Em implementação |
| 15.10 | C | Vistos por atividade e planilha | Vistos | Alterar mesmo visto para ✓/×/◷/—/exceções; modo individual | matrix-tab-single; f2-check-state | Em implementação |
| 15.11 | C | Biblioteca, sequência, editor detalhado | Planejamento | Usar modelo, validar campos, limpar | plan-use; plan-review; plan-clear | Em implementação |
| 15.12 | B | Central gerencial sem óptica | Corretor | Selecionar avaliação e filtrar exemplo | f2-scan; f2-scan-filter | Em implementação |
| 15.13 | B | Gerador com prévia simultânea NÃO óptica | Gerador | Configurar formato/quantidade/turma, atualizar cartão conceitual | f2-gen; gen-preview | Em implementação |
| 15.14 | B | Gráfico numerado + legenda + tabela | Estatísticas | Trocar dimensão de gráfico e comparar contagens | f2-chart; f2-tab-type | Em implementação |
| 15.15 | B | Resumo próprio, atalhos e aviso | Portal do Aluno | Abrir calendário/avisos sem consulta acadêmica | student; f2-go | Em implementação |
| 15.16 | C | Projetos por planejamento/execução/conclusão | Projetos | Selecionar projeto; ficha de grupo/avaliador/critério/resultado/publicação | f2-project | Em implementação |
| 15.17 | B | CONNECT por sistema, prévia, histórico, conflito | CONNECT | Selecionar sistema, navegar e comparar conflito fictício | f2-connect; connect-compare | Em implementação |
| 15.18 | B | Central de avisos premium | Avisos | Filtrar/lido/não lido/adicionar aviso sintético | notice-new; notice- | Em implementação |
| 15.19 | B | Documentos por categoria e formato | Documentos | Mudar categoria e formato; atualizar prévia branca não óptica | f2-doc; f2-doc-preview | Em implementação |
| 15.20 | B | Configurações por finalidade | Configurações | Mudar tabs e checkboxes da prévia | f2-setting; f2-tab-type | Em implementação |
| 15.21 | A | 68 SVG aprovados inalterados | Símbolos | Acessar catálogo original, pesquisar/trocar tamanho | open-symbols; v2-icon-search | Em implementação |
| 15.22 | B | Secundários, estados, 404, perfil, picker | Secundários | Abrir aviso e date picker, cancelar/confirmar | secondary-picker; secondary-notifications | Em implementação |
| favicon | ABCD pendente | Quatro variações + original sem alterar produção | Cores | Selecionar localmente, comparar cinco tamanhos/abas | f2-favicon-gallery | Pendente: escolha do proprietário |

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
