# AGENTS.md — SALTA

## Projeto
SALTA é uma plataforma educacional brasileira, com Área do Aluno, Área do Professor, Diário, Corretor OMR, relatórios, comunicação e atividades/eventos. Repositório: `d4nny3l/portal-do-aluno`. Interface em português brasileiro. Direção de produto: menos passos para tarefas reais, confiabilidade de dados acadêmicos, transparência ao estudante e identidade visual própria.

Este arquivo é a memória operacional permanente do projeto. Antes de mudanças funcionais, ler `docs/SALTA_DIRETRIZES_PRODUTO.md` e os documentos técnicos relevantes em `docs/`. Não confundir proposta com funcionalidade implementada ou homologada.

## Aprendizados EducaDF e SIAP
- EducaDF: aproveitar entrada contextual por calendário/aula, painel de pendências derivadas de dados reais, Registro Rápido com estados independentes de conteúdo e frequência, avisos claros de gravação e filtros de atenção.
- SIAP: aproveitar vínculo versionado entre planejamento anual, aula prevista, conteúdo ministrado, materiais e histórico; reutilização consciente entre turmas; análises por item, descritor e alternativa; suportes de inclusão sujeitos a autorização.
- Não reproduzir aparência, código, textos proprietários, dados ou conteúdo interno dos sistemas; adaptar padrões funcionais à identidade SALTA.
- Menu de produto proposto: Hoje, Turmas, Avaliações, Análises/Acompanhamento e Avisos. Administração, eventos e configurações continuam acessíveis como contexto secundário. Não criar menus duplicados nem excluir funções ao reorganizar.
- Tela contextual da turma mantém escola autorizada, turma, componente, período e data. Priorizar ações realizadas num único fluxo e acesso direto às pendências.

## Direção estética e UX
- Visual limpo, moderno, responsivo e enxuto: título útil, campos precisos, ações claras; retirar descrições redundantes, slogan repetido, cartões de navegação duplicados e metadados decorativos.
- Não criar botões inativos/decorativos nem módulos fictícios. Não esconder funcionalidades necessárias por simplificação. Preservar foco, rótulos programáticos, estados de erro/carregamento, teclado, contraste e mobile.
- Exibir Salvo somente após confirmação real do servidor; diferenciar rascunho, salvando, falha, conflito, dado ausente e valor zero. Erros devem permitir recuperação e não misturar contexto de turma/aba/período.

## Diário — regras aprovadas e bloqueios de estabilidade
- Na chamada nova, **sugerir todos presentes apenas em rascunho**. Professor revisa faltas e confirma explicitamente; abrir/cancelar nunca grava. Após confirmação persistir exatamente o lote revisado; edição de chamada existente nunca sobrescreve silenciosamente.
- Não alterar dados de outra aula/turma, mesmo com requisições concorrentes; impedir que respostas antigas substituam seleção mais nova.
- Rejeitar notas acima do máximo com mensagem clara; não transformar `11` em `1,1` automaticamente. Preservar distinção entre `0`, ausência de lançamento, parcial e definitivo.
- Fórmulas e critérios DF/GO/EJA, recuperação e arredondamento exigem homologação pedagógica; nunca modificá-los implicitamente.
- Prioridades do dossiê V2: D-01 consulta de frequência com erro interno; D-02 aba Frequência exibindo Notas; D-03 parser de notas; D-04 primeira marcação coletiva implícita; D-05 cálculo parcial sem estado claro. Usar dados sintéticos e ambiente isolado em ensaios de escrita.

## Corretor OMR
- Motor geométrico e leitor são acoplados: nunca mover bolhas, marcadores, código de sete dígitos ou escala sem atualizar layout/manifesto/template/leitor/exportação e testes de regressão, incluindo impressão/escaneamento real.
- Cabeçalho institucional é prioritário. Conferir não-sobreposição entre identificação institucional, turma e grade de código. Não criar folhas visualmente melhores mas ilegíveis pelo scanner.
- Identificação por código numérico de sete dígitos e informações nominais requerem cuidado de privacidade. QR, integração ao Diário e publicação de nota não devem ser declarados prontos sem teste ponta a ponta.
- Correção OMR gera proposta revisável; publicação no Diário exige confirmação humana e idempotência.


## Cartão-resposta SALTA — decisões visuais aprovadas em 14/11/2026
- **Documento principal:** `docs/SALTA_CARTAO_RESPOSTA_DESIGN_SPEC.md`. **Roteiro de execução:** `docs/SALTA_CODEX_CARTAO_RESPOSTA_EXECUCAO.md`.
- Não imprimir metadados `MODELO ... · REV ... · hash` no rodapé: preservar a identificação de layout somente em manifesto/JSON e mecanismo técnico confiável, sem texto visível.
- Todos os **títulos** centrais (título principal e títulos de seções) são centralizados em suas regiões. Campos de metadados continuam com alinhamentos funcionais.
- Cabeçalho institucional segmentado, com espaço protegido para o código óptico de **7 dígitos**; nenhum dado de turma/data/professor invade a grade, logotipos ou os quatro marcadores.
- Cada seção de questões deve ser envolvida por **borda fechada**, não somente linha separadora; se dividir em colunas, desenhar segmentos visuais corretos sem duplicar questões.
- Estilo institucional original da SALTA, sofisticado e de alto contraste: **preto sobre branco**, sem cinza no cartão. Melhorar letras A–E sem criar falsos positivos de leitura óptica.
- A data visível deve estar no formato `dd/mm/aaaa`, preservando valores internos em ISO. Não alterar o motor/posicionamento OMR sem atualizar o manifesto e testar leitura, impressão e compatibilidade antiga.
- O redesenho do cartão somente pode ser aceito após testes automatizados e ensaios impressos/fotografados; não publicar a partir de uma prévia bonita.

## Arquitetura e segurança
- GitHub Pages no frontend; Workers Cloudflare para autenticação, estatísticas e Diário; bancos D1 separados `DB` e `DIARIO_DB`. Não presumir sincronização, isolamento institucional ou E2EE completo sem verificação.
- Verificar autorização por papel, instituição e turma no servidor antes de expandir a escolas/múltiplos professores.
- Nunca consultar/exportar alunos reais para demonstrar UX; não inserir credenciais, tokens, cookies, dados nominais ou imagens de respostas reais em logs, dossiês e PRs.
- Não mexer em D1 remoto, credenciais, Workers de produção, migrações ou dados acadêmicos reais sem autorização expressa para aquela operação.
- Mudanças pequenas, reversíveis, com branch e PR. Não fazer merge/deploy sem autorização específica. Preservar hotfix do Diário e compatibilidade de URLs.

## Verificação e entrega
- Testar ao menos `node --test corretor/v2/tests/*.test.mjs stats-worker/tests/*.test.mjs plataforma/tests/*.test.mjs`, os testes de sintaxe pertinentes e `git diff --check`.
- Verificar desktop e celular, fluxo autenticado quando viável, mensagens de erro, teclado, navegação e PDF renderizado. Testes unitários verdes não equivalem a homologação real.
- Em cada PR informar arquivos, comportamento antes/depois, testes, riscos residuais, dados e infraestrutura não tocados e estratégia de reversão. Dizer claramente o que não foi testado.
