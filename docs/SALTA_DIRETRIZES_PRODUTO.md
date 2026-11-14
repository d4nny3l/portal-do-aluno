# SALTA — Diretrizes de produto e memória da auditoria comparativa

**Base de evidências:** Dossiê mestre V2 de 11/11/2026; inspeções autenticadas EducaDF Digital, SIAP Goiás e SALTA; código SALTA auditado em `4411dcf35629211758617a1680194fc0b73e75d2`.
**Natureza:** diretriz de produto para desenvolvimento; **não** representa homologação dos sistemas externos ou autorização para alterar seus dados. Revisar frente à versão mais recente da `main`.

## 1. Propósito

SALTA nasceu para solucionar a baixa transparência e a demora na comunicação de notas escolares. Evolução desejada: uma plataforma de trabalho pedagógico integrada, simples e com devolutiva explicável ao estudante. **Mais completa** não significa mais menus: priorizar tarefas inteiras concluídas com segurança e poucos passos.

Níveis de decisão:
1. **Decisão aprovada:** chamada nova sugere todos presentes **somente no rascunho**, requer revisão e confirmação antes de qualquer gravação.
2. **Problemas identificados:** D-01 a D-05 abaixo; reproduzir e corrigir com dados fictícios.
3. **Propostas condicionadas:** menu Hoje/Turmas/Avaliações/Acompanhamento/Avisos, planejamento integrado, Registro Rápido, integração OMR, institucional.
4. **Não homologado:** publicação automática de OMR, E2EE integral, sincronização Diário/portal, multi-escola e robustez offline.

## 2. Cobertura real da auditoria comparativa

| Sistema | O que foi visto | O que NÃO foi homologado |
|---|---|---|
| EducaDF | 13 destinos de menu catalogados; calendário; oito abas do Diário; Registro Rápido matricial; planos, cópia, procedimentos, resultados, acompanhamento, fechamento e RFA/EJA | Salvar aula/frequência/nota, concluir conselho/fechamento, emissão de relatórios nominais, mobile autenticado |
| SIAP | 28 destinos classificados; 22 com interface funcional; planejamento anual/aula/histórico/replicação; conteúdo planejado/ministrado; notas; relatórios por descritor, alternativa e frequência | Persistência, replicação efetiva, exportações nominais, 4 rotas sem carregamento confirmado, definição de escola, mobile |
| SALTA | Oito destinos globais; área administrativa, grade de notas, horários, modelos, importação, frequência, Corretor, relatórios, avisos, fechamento, eventos | Chamada em contexto com erro; testes de câmera/OMR físico; importação real; operações persistentes de relatório; Área do Aluno real; fluxo institucional |

Contagens referem-se a menus/telas **identificadas**, não a todas as operações executadas. Na auditoria, não houve escrita ou envio de notas, presença ou mensagens em sistemas externos.

## 3. Ideias a adaptar — e atritos a evitar

### Do EducaDF
- Entrada por aula/calendário, reuso do contexto e visão de pendências reais (aulas sem registro, prazos).
- Registro Rápido: matriz estudante × data/horário, separando completude da aula e da frequência; não copiar o anúncio de autosave como garantia técnica.
- Filtros de atenção em resultados: sem nota, queda de rendimento, frequência em risco, recuperação.
- Plano reaproveitável entre turmas: **não** pré-selecionar destinos e mostrar impacto/conflictos antes de substituir algo.
- Evitar filtros excessivos, ações coletivas com efeito implícito e divergências de estado.

### Do SIAP
- Vínculo planejado → ministrado → materiais → histórico/validação; referência ao currículo, com revisão humana e fonte.
- Modelos pedagógicos e replicação, sem duplicar identidade da aula, frequência ou resultados.
- Relatórios por descritor/alternativa com denominador, recorte e amostra claramente identificados.
- Recursos para inclusão com privacidade e autorização específica; não importar dados sensíveis sem governança.
- Evitar navegação com muitos filtros repetidos, campos sem rótulos acessíveis e ações pouco claras sobre gravação.

## 4. SALTA como fluxo contínuo

### Navegação candidata (a validar com o usuário)
**Hoje · Turmas · Avaliações · Acompanhamento · Avisos**, com administração, eventos e configurações em área secundária. Cada seção tem acesso funcional e sem cartões duplicados. URLs legadas permanecem compatíveis.

### Contexto de turma
Cabeçalho persistente: instituição autorizada, turma, componente, bimestre/semestre e aula/data. Trocar de aba não troca turma/período. Subáreas: **Aula · Notas · Acompanhamento**. A área Aula concentra chamada, conteúdo, recurso e resumo da execução; calendário/matriz histórica continua disponível para revisão.

### Painel Hoje
Próxima aula, pendências documentadas e atalhos para concluir tarefas. Nunca usar métricas inventadas; cada pendência exibe regra de apuração, fonte, período e destino. Priorizar estado vazio/erro compreensível.

### Notas
Reusar grade atual; fluxo de teclado, colagem/importação com prévia, salvamento confiável e recuperação. Cada lançamento distingue **vazio / zero / parcial / definitivo**; rejeitar valor acima do limite, nunca converter silenciosamente. Visibilidade ao aluno é estado separado da edição.

### Planejamento e conteúdo
Planejamento é uma intenção reutilizável e versionada; conteúdo ministrado é execução datada e não retroativamente alterada por edição do plano. Materiais, metodologia, habilidades BNCC/SAEB devem ter referência versionada; não inferir habilidades automaticamente sem confirmação.

### Avaliações e OMR
Cartões têm versão de geometria/gabarito; leitor e impressor precisam compartilhar manifesto geométrico. OMR gera rascunho de correção com ambiguidades e revisão; professor confirma antes de enviar ao Diário, com idempotência. Resultado por alternativa e descritor só aparece quando a fonte das questões é validada.

### Relatórios
Cada indicador explica população/denominador, regras de cálculo, período, atualização e estado parcial/definitivo. Estudante só vê seus próprios dados divulgados.

## 5. Achados P0 do Diário (auditoria V2)

| ID | Evidência | Conduta |
|---|---|---|
| D-01 | GET de frequência por ocorrências exibiu erro interno em turma DF/4º bimestre; causa NÃO isolada | Correlacionar referência de suporte e logs, reproduzir em ambiente isolado, erro recuperável |
| D-02 | Aba Frequência ativa com painel de Notas ainda visível após troca rápida de bimestre | Guardas de contexto/versão, descartar respostas assíncronas obsoletas |
| D-03 | Parser com máximo 10: entrada 11 virou 1,1; 999 virou 9,99 em teste sintético | Rejeitar excedente e preservar `0`, vírgula decimal e vazio |
| D-04 | Criar ocorrência no Worker marca todos presentes; primeiro clique individual pode apenas criar sessão | Novo contrato de rascunho, revisão e confirmação explícita sem efeito colateral |
| D-05 | Componentes não lançados podem contar como zero no resultado parcial | Diferenciar calculado, parcial, pendente e definitivo; não mudar fórmulas normativas sem aprovação |

**Regra aprovada D-04:** ao abrir chamada inédita, todos presentes aparecem somente como **sugestão não persistida**. Professor ajusta faltas e confirma a chamada completa. Abrir, editar rascunho ou cancelar não grava; após confirmação exibir recibo real de gravação; chamada existente abre seu estado persistido, nunca reinicializa para presentes.

Não reprojetar toda a persistência sem entender sessões/ocorrências atuais. Confirmar atomicidade, concorrência, reenvio idempotente e rollback usando D1 **isolado** com dados sintéticos. Não editar registros históricos sem plano de migração.

## 6. Ordem do roadmap

**P0 — estabilidade:** D-01 a D-05; contratos de escrita/leitura; diagnóstico de backup/restauração, autorização e estados.
**P1 — velocidade docente:** contexto e shell único, painel Hoje, Registro Rápido com conteúdo e frequência, grade com teclado/colagem revisável, biblioteca de planos.
**P2 — inteligência pedagógica:** OMR → revisão → nota, análises de item/descritor, resultados explicáveis ao aluno, comunicação e fechamento controlados.
**P3 — ampliação:** múltiplos professores/escolas (apenas após autorização por vínculo, isolamento e migração), offline e integrações oficiais mediante governança.

Se o piloto tiver mais de um docente/escola, segurança e isolamento tornam-se pré-requisito anterior ao piloto, mesmo classificados P1 no roadmap da conta individual.

## 7. Critérios de aceite transversais

- Nenhuma operação de escrita por simples abertura de tela; confirmação idempotente para lotes.
- Falha de rede não mostra “Salvo”; estados distinguem pendente/falha/conflito.
- Troca rápida de aba/turma/bimestre não mostra nem grava informações de outro contexto.
- Testar com uma turma sintética de 30 alunos, três faltas, data futura, dupla aula e bimestre vazio.
- Testar notas em máximo 10: vazio, 0, 10, 1,5, 11, 999, negativas; recuperação e arredondamento por rede.
- Regressão em desktop 1440 px e celular 390 px, teclado, leitor de tela quando possível, impressão e leitura OMR física para mudanças de cartão.
- Nenhuma inferência de produtividade em segundos sem ensaio controlado. Jamais alegar homologação completa com apenas testes sintéticos.

## 8. Estado e proteção

Repositório público não é razão para registrar dados reais nos documentos. Cópias autorizadas de capturas estruturais somente sem identificação de aluno. Nunca copiar partes privadas dos sistemas oficiais para a SALTA; comparar padrões e implementar solução própria.

Documentos de apoio existentes: `docs/SALTA_ADMIN_UX_AUDIT.md`, `docs/SALTA_CORRETOR_AUDITORIA_E_PLANO.md`, `docs/SALTA_CORRETOR_MOBILE_E_ROTAS.md`, `docs/SALTA_OMR_GENERATOR_RECONSTRUCTION.md`.

**Fonte principal da auditoria profunda:** `SALTA_DOSSIE_MESTRE_V2.md`, consolidado pelo Codex em 11/11/2026 e fornecido ao projeto. Este arquivo resume as decisões práticas; não substitui a leitura do dossiê completo quando se investigar um incidente.
