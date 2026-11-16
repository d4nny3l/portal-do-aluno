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


## Cartão-resposta SALTA V2 — autorização e contrato atual

- Pedido atual: `docs/SALTA_CARTAO_RESPOSTA_V2_SPEC.md`; implementação/limites em `docs/SALTA_CARTAO_RESPOSTA_V2_IMPLEMENTACAO.md`. Essas decisões substituem as escolhas visuais V1 abaixo para novos cartões.
- V2 usa cabeçalho institucional único, texto livre multilinha, faixa Professor/Turma/Data, nome independente, código fora do cabeçalho, letras pretas convencionais e seções com larguras uniformes/alturas naturais. Instruções são opcionais e desligadas por padrão.
- Geometria nova tem versão própria; preservar os modelos V1 e usar o manifesto exato ao corrigir. Não inventar reconhecimento automático de versão por fotografia. CDU e leitura de quadros incorporados não estão homologados.
- Nesta missão V2 o responsável **autorizou expressamente merge e GitHub Pages após CI, testes e revisão visual disponíveis**, sem exigir nova confirmação. Ensaios físicos continuam pendentes e devem ser declarados; não equivalem à publicação da interface. Isso não autoriza Worker, D1 ou dados acadêmicos.

- Ajuste posterior de cabeçalho/logos: `docs/SALTA_V2_CORRECAO_CABECALHO_LOGOS.md`. Todos os campos administrativos visíveis compartilham uma faixa com capacidade explícita. Logos permitem escala de cinza suave, com transparência e proporção preservadas; não reaplicar binarização 0/1.

- Acabamento aprovado: `docs/SALTA_V2_ACABAMENTO_E_AUDITORIA.md`. O módulo numérico V2 imprime CÓDIGO DO ALUNO, sem alterar coordenadas/esquemas. A-03 (correção com números não contíguos) está documentado para revisão separada; não renumerar silenciosamente cartões ou alterar regras de nota.

- Fechamento da interface: `docs/SALTA_CORRETOR_FECHAMENTO_VISUAL.md`. Identificação e Personalizar cabeçalho são seções nativas expansíveis, independentes e inicialmente fechadas; não reintroduzir modal, seletor de geração V1, versões locais ou Recompor layout. Novos cartões são V2; a importação JSON exata continua lendo V1/V2. Não apagar armazenamento histórico do navegador. A-03 permanece sinalizado e não homologado. Preservar a imagem inteira ao reduzir fotografias no frontend; esse ajuste não modifica o algoritmo OMR.

- Fase 1 posterior: `docs/SALTA_CABECALHO_DIRETO_FASE1.md`. Cabeçalho sem abas internas, com título da avaliação sincronizado ao formulário principal por uma única fonte. Não reintroduzir criação de campos personalizados; conservar sua interpretação nos manifestos históricos e erros reais de capacidade. O pedido atual permite corrigir A-03 em commit separado para o banco de avaliações, com regressão específica e sem alterar geometria/fórmulas pedagógicas.

- Banco Fase 1: `docs/SALTA_AVALIACOES_GABARITOS_FASE1.md` e `assessments-lab/README.md`. Fluxo funcional somente em localhost com D1 local, fixtures e Crypto Core experimental; D1 remoto próprio possui só esquema vazio, sem Worker publicado. Não promover login/header de fixture a autenticação produtiva nem reutilizar `DB`/`DIARIO_DB`. Identidade/grants reais, enrollment/recuperação de chaves e identificação física da avaliação/revisão bloqueiam uso real. A-03 nesta branch usa IDs estáveis em commit separado, preservando geometria/manifestos/fórmula; não confundir implementação de homologação com publicação na main.

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

## Continuação do PR #36 — publicação protegida autorizada

Pedido atual autoriza merge/CI/deploy e, enquanto a integração institucional produtiva não estiver homologada, publicação somente sintética em ambiente isolado e protegido. Ver `docs/SALTA_PR36_PUBLICACAO_PROTEGIDA.md`. Reutilizar domínio/crypto/revisões do PR. Não promover fixtures para a internet. Worker remoto exige contexto Access verificado do runtime, audiência/origem exatas e grants explícitos; não confiar em headers de identidade. Cofre remoto usa frase e raiz aleatória, sem persistir chave desbloqueada no navegador, com expiração/revogação e preservação de ciphertext. O localhost e seus dados/chaves originais continuam separados. Não modificar Auth/Stats/Diário oficiais ou D1 acadêmicos. Relatórios da entrega inicial em c36b8ed são históricos; o estado final deve ser confirmado por CI, deploy e ciclo remoto, sem declarar uso real homologado.

## Diário D-04 — contrato de confirmação

- Implementação e limites em `docs/SALTA_DIARIO_D04_IMPLEMENTACAO.md`. Abrir/cancelar rascunho nunca envia POST/PUT. Somente confirmação explícita envia lote completo, request id e versão/snapshot. Não reintroduzir semeadura automática de presenças.
- POST/PUT legados sem precondições são recusados; recibos e registros são atômicos. Preservar tabela de recibos no rollback. Mapa institucional de servidor atende a conta docente única; não equivale a RBAC multiusuário.
- Publicação na main foi autorizada nesta missão; Worker oficial, migração remota e configuração real não foram autorizados. Deploy de Stats é manual. Não acionar como consequência de um merge. Não confundir Pages novo com backend corrigido em produção. D-01/02/03/05 continuam fora deste escopo.
