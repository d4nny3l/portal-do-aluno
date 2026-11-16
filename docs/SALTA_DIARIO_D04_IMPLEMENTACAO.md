# SALTA Diário — D-04: confirmação explícita e persistência atômica

Data: 16/11/2026. Escopo exclusivo D-04. Base: `3c9a8286150d5430a7447bdfa25a874edf7fcaf2`. Branch: `codex/salta-diario-d04-20261116`.

## Resultado e limite de publicação

A implementação corrigida passa pelos testes sintéticos, inclusive workerd/D1 local real e interface desktop/celular. A autorização posterior do proprietário permite PR e integração à main. **Nenhum Worker oficial, banco remoto ou dado acadêmico real foi alterado.** O workflow de Stats passa a ser manual, para que integrar a main não publique um Worker sem homologar a migração e o vínculo institucional.

Publicar o frontend no Pages não implanta o backend. A interface nova negocia `d04-v1` e bloqueia a gravação contra um Worker antigo ou não habilitado. O backend produtivo inspecionado ainda contém a semeadura vulnerável; esta entrega de código não significa encerramento do P0 em produção. Clientes antigos continuam sendo um risco enquanto o Worker antigo estiver ativo.

## Causa-raiz demonstrada

O POST de aula gravava primeiro uma sessão e, em um segundo lote, `present=1` para todos os estudantes ativos. O POST diário legado repetia o padrão. A abertura pelo primeiro clique em falta chamava `ensureOccurrence`, recarregava e retornava sem aplicar a falta escolhida. O PUT não exigia versão e podia substituir decisões recentes.

Reprodução no código da base, com 30 estudantes e intenção de três faltas: POST sem lista revisada retornou 201 e gravou **30P/0F**. A reprodução em workerd/D1 local está em [BASELINE_REAL_D1.json](evidencias/diario-d04/BASELINE_REAL_D1.json). Não se trata de inferência sobre dados reais.

A inspeção somente de leitura do painel Cloudflare observou `salta-stats`, versão ativa prefixo `a6fb47fd`, 100% do tráfego, e o SQL vulnerável `INSERT INTO salta_diario_lesson_records (session_id,student_id,present) VALUES (?,?,1)` no código da versão ativa. O botão Deploy permaneceu desabilitado. Não houve consulta a endpoint acadêmico ou D1 Studio. [Metadados saneados](evidencias/diario-d04/PRODUCTION_READ_ONLY.json). A evidência de tela permanece local; não foi feita comparação byte a byte da fonte inteira.

## Arquivos e contratos

| Arquivo | Responsabilidade |
| --- | --- |
| `plataforma/diario-attendance.mjs` | Rascunho em memória; somente `confirm()` envia mutação; descarte de respostas antigas; retry da mesma confirmação. |
| `plataforma/diario-teste.html` | Revisar/Confirmar/Cancelar por aula; estados de rascunho, erro e recibo; contexto turma/período/aula. |
| `stats-worker/worker.js` | Gate do contrato, validação de contexto, CAS de versão/snapshot, lote atômico e recibo durável nas duas rotas. |
| `stats-worker/migrations/0001_d04_receipts.sql` | Uma tabela aditiva de recibos, aplicada **somente localmente**. |
| `stats-worker/tests/diario-d04*.mjs`, `tests/support/`, `tests/fixtures/d04/` | Testes sintéticos e adaptador exclusivamente local; a fixture nunca deve ser publicada. |
| `plataforma/tests/diario-attendance.test.mjs` | Rascunhos, cancelamento, replay, falhas e mudanças assíncronas de contexto. |
| `.github/workflows/test-diario-integrity.yml` | CI do Diário e ensaio D1 local com artefato sintético. |
| `.github/workflows/deploy-salta-stats.yml` | Remove publicação automática por push; mantém execução manual sem acioná-la. |

URLs de escrita preservadas: `/diario/frequencia/ocorrencias` e `/diario/frequencia`. POST/PUT agora exigem `confirm:true`, `request_id`, `expected_version`, `expected_snapshot` e lista completa `registros` com IDs únicos e booleanos estritos. PUT exige `session_id`. Clientes antigos sem confirmação/precondição recebem 428 e não escrevem. Esta incompatibilidade de escrita foi submetida e aprovada na proposta.

GETs novos e somente de leitura: `/diario/frequencia/contrato`, `/diario/frequencia/ocorrencias/rascunho`, `/diario/frequencia/rascunho`. Eles são tratados antes do inicializador antigo de esquema, sem DDL/defaults ou registros de frequência. Chamadas históricas sem recibo têm versão inicial 0 e snapshot de seus registros exatos; valores ausentes continuam ausentes até revisão explícita. Registros históricos de estudantes inativos são incluídos e preservados. Valores inalterados mantêm seus timestamps.

## Atomicidade, idempotência e concorrência

Um único `D1Database.batch` adquire a versão condicionalmente, cria a sessão quando necessária, grava exatamente o lote completo e finaliza o recibo. O guard compara versão, sessão, conteúdo/timestamps, roster ativo, turma, período e horário. Alterações concorrentes invalidam o lote. Se a finalização falhar silenciosamente, uma restrição CHECK aborta a transação inteira.

Chave única de request por instituição e de versão por contexto. Mesmo request/payload retorna o recibo original, inclusive depois de uma edição posterior; reutilização do request com payload diferente retorna 409. Requisições diferentes concorrentes resultam em uma gravação e um conflito; o mesmo request concorrente produz uma única confirmação. O frontend conserva o payload após falha ambígua e não o altera em um retry.

O contexto inclui instituição, modalidade diária/aula, turma, período, data, turno, dia e número da aula. A restrição histórica de aula omite turma/período; uma colisão nesse índice é recusada, sem reutilizar ou sobrescrever a sessão de outro contexto. A restrição não foi migrada.

O servidor resolve instituição por `DIARIO_ATTENDANCE_INSTITUTIONS`, mapa confiável de turma para instituição, e exige `DIARIO_ATTENDANCE_ENABLED=true`. Sem configuração ou tabela de recibos, a escrita fica bloqueada. O campo enviado pelo cliente não concede acesso. **O login atual é de conta docente única; este mapa não implementa autorização multiusuário/RBAC.** Expandir a vários professores exige missão separada. Autenticação e criptografia não foram modificadas.

## Testes e evidências

- Regressão completa exigida por AGENTS: `node --test corretor/v2/tests/*.test.mjs stats-worker/tests/*.test.mjs plataforma/tests/*.test.mjs` — **128/128**, zero falhas.
- Subconjunto Diário: 11 testes existentes + 12 casos backend novos + 8 frontend = **31/31**.
- Sintaxe Worker, módulo frontend, fixture e JavaScript inline; UTF-8 e `git diff --check` aprovados.
- workerd/D1 local real: [D04_REAL_D1.json](evidencias/diario-d04/D04_REAL_D1.json). POST antigo 428; rascunho sem escrita; confirmação **27P/3F**; replay após edição; duas confirmações diferentes 201/409; mesmo request concorrente; falha SQL induzida com rollback; instituição incorreta 403.
- Cancelar/abandonar rascunho sem gravação; erro de rede com recibo perdido e reenvio idempotente; versão obsoleta; troca de turma/aula/período durante awaits; preservação de chamada histórica e estudante inativo; lote incompleto/duplicado/coerção recusados; ausência de migração bloqueia sem writes.
- UI local, código real, D1 local e 60 pessoas sintéticas em duas turmas: abrir, escolher faltas 4/12/27 e cancelar deixou [zero sessões/registros/recibos](evidencias/diario-d04/UI_DRAFT_COUNTS.json). Depois da confirmação explícita, [30 registros, 27P/3F e um recibo](evidencias/diario-d04/UI_CONFIRMED_COUNTS.json). Reabrir preservou as três faltas. A segunda aula permaneceu pendente.
- Desktop e viewport 390×844: ações legíveis, estados distintos e tabela com rolagem própria; largura do documento móvel 390, sem overflow horizontal da página. Isto é emulação de viewport Chrome, não ensaio em aparelho físico/Safari.

A consulta de calendário apresentou o **D-01 preexistente** no ambiente local completo. Para o ensaio visual D-04, exclusivamente a listagem GET do calendário foi substituída por um DTO sintético no wrapper loopback; rascunhos, confirmações, recibos e persistência usaram a implementação real corrigida. O D-01 não foi corrigido e impede declarar homologação integral do calendário produtivo. O título D-02 também permanece. D-03 e D-05 não foram tocados.

Logs e screenshots em `outputs/diario-d04/` fora do worktree; nenhuma evidência contém dados acadêmicos reais. O laboratório escutou apenas em 127.0.0.1 e não foi exposto à internet.

## Migração, compatibilidade e rollback

Não é necessária alteração destrutiva de tabela acadêmica. A tabela aditiva é necessária para recibos duráveis e controle de versão; snapshot sem recibo não garantiria replay após edições. Nenhum manifesto OMR ou código do Corretor foi modificado. Não se recriam nem se reconstroem chamadas anteriores.

A migração remota, a configuração institucional real e a publicação do Worker continuam pendentes de autorização própria. Não executar o workflow manual nem SQL remoto como consequência da integração à main. Não usar a fixture para publicar um ambiente de produção.

Rollback seguro mantém a tabela de recibos e todas as confirmações. Desabilitar novas escritas com a configuração de frequência e corrigir adiante; nunca reativar o POST antigo que semeia presenças nem apagar recibos para reutilizar versões. Uma resposta perdida pode já ter sido confirmada: conferir/reenviar o mesmo request. Cancelar não desfaz uma confirmação já enviada.

Para implantação futura: interromper escritores antigos, homologar cópia isolada autorizada, provisionar a tabela aditiva e o mapa institucional validado para a conta única, testar o SHA exato, e publicar uma única versão de escrita sem tráfego dividido. Autorizar cada operação remota antes de executá-la. Conferir backend e frontend juntos com dados sintéticos autorizados. Histórico permanece intacto.

## Recomendação e riscos residuais

**Apto para revisão e integração de código; apto para homologação isolada sintética. Não declarar o P0 encerrado em produção.** A correção do backend depende da implantação autorizada; a interface nova falha sem gravar contra o Worker antigo. Sessões e abas antigas precisam ser retiradas no corte de versão. A comparação otimista detecta divergência, não mescla chamadas automaticamente.

Não é possível inferir quais presenças históricas foram implícitas a partir do valor `present=1`; não fazer reparação automática. Não houve inspeção de dados reais. D-01 exige correção separada para o fluxo de calendário completo; autorização multiusuário e revisão de vínculos institucionais também estão fora deste escopo.
