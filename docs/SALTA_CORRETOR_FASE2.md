# SALTA Corretor 2.0 — Fase 2

**Estado:** experimental, publicado em PR draft encadeado; sem homologação remota e sem produção.
**Branch:** `codex/salta-corretor-v2-fase2`
**PR:** [#8 — Persistência experimental em SQLite local](https://github.com/d4nny3l/portal-do-aluno/pull/8)

## Resumo executivo

A Fase 2 acrescenta uma persistência isolada para o domínio do Corretor 2.0, com migrations SQLite versionadas, repositório transacional, autorização de escopo no servidor, reserva experimental do Código SALTA, contratos de ciphertext e testes sintéticos. O trabalho está encadeado ao PR #6 porque seus contratos são a base da persistência. O PR #6 está pronto para revisão, mas ainda não foi integrado.

Nada nesta fase conecta o corretor legado, o Diário publicado, Workers, Cloudflare ou qualquer D1 remoto. Não há interface de professor nem autenticação real. A implementação é uma fundação local para a próxima fase.

## Estado dos PRs e checkout compartilhado

- **PR #4 — Crypto Core:** aberto, draft e não integrado. A implementação E2EE é experimental. A Fase 2 não importa nem comprova criptografia real do Core.
- **PR #6 — contratos da Fase 1:** aberto, pronto para revisão, mergeável e não integrado. O PR #8 usa o head do PR #6 como base; não integre o PR #8 isoladamente em `main`.
- **PR #7 — correção XSS do corretor legado:** aberto, draft e não integrado. A CI confirmou testes e sintaxe, mas seu primeiro check falhou no `git diff --check` por checkout raso (`HEAD^` indisponível). O workflow foi corrigido localmente para `fetch-depth: 0`; a nova execução ainda precisa confirmar o resultado. Integração recomendada: transplantar apenas validação do `localStorage` e renderização com `textContent` sobre a versão EJA local, preservando geometria, coordenadas e detector OMR.
- **Checkout compartilhado `repository/`:** branch `main`, 166 commits atrás de `origin/main`, com 24 itens modificados/não rastreados observados nesta execução, inclusive páginas SALTA, `stats-worker/worker.js`, `corretor/index.html`, folha de respostas, artefatos EJA e `.wrangler/`. Nenhum foi alterado, limpo ou removido por este trabalho.

## Modelo de dados e integridade

A migration `corretor/v2/persistence/migrations/0001_up.sql` cria as tabelas para workspaces e memberships, usuários sintéticos, grants, avaliações e revisões, snapshots de participantes, seções e questões, gabaritos e templates versionados, tentativas e ocorrências de leitura, observações cifradas por questão, revisões humanas, resultados, eventos de auditoria, operações idempotentes, estado de sincronização e claims globais de código. Chaves estrangeiras, unicidade, checks e triggers preservam o isolamento e os registros append-only definidos pelo contrato.

`0001_down.sql` remove essas tabelas no banco local descartável. Os testes aplicam `up → down → up`; rollback não foi executado contra nenhum banco remoto.

O repositório implementa transações para alterações de revisão, snapshots imutáveis, controle otimista, isolamento por workspace e escopo, revogação de grants, gravações idempotentes, recuperação após interrupção e separação de resultado provisório de definitivo. Uma nota definitiva só pode ser reconhecida com estado/revisão explícitos; sincronização com o Diário requer ACK real do serviço futuro.

## Criptografia, privacidade e autorização

`crypto-adapter.mjs` valida envelope e contexto e delega as operações a uma interface Crypto Core fornecida pelo chamador. Não fornece algoritmo criptográfico próprio. O teste usa um Core simulado; portanto, não representa validação de criptografia ou integração com o PR #4. O objeto novo `salta.identity.code-claim.v1` ainda não foi autorizado pela allowlist do Core.

Os fixtures são sintéticos. Dados acadêmicos persistidos são envelopes opacos; a reserva de Código SALTA guarda digest HMAC e metadados cifrados, não o código em claro. A chave/pepper HMAC deve vir de fora do banco. O código de sete dígitos é identificador, nunca senha, chave ou mecanismo de autorização. A reserva exige um callback autorizado e não deve ser exposta como consulta pública.

As funções de autorização recebem contexto sintético nos testes; não autenticam usuários. No Worker futuro, identidade deve vir da sessão real do Auth e grants devem ser verificados no servidor. Nenhum teste usa dados de alunos.

## Testes executados

Testes locais no worktree da Fase 2, com SQLite em memória ou arquivos temporários descartáveis:

- `node --test corretor/v2/tests/*.test.mjs` — **36/36 passaram** (21 contratos da Fase 1 + 15 de persistência da Fase 2).
- `node --check` nos módulos de persistência e testes — passou.
- `git diff --check` local — passou.
- `node --test stats-worker/tests/diario-periods.test.mjs` — **11/11 passaram**.
- `npm run test:e2ee` no worktree experimental do Crypto Core — **12/12 passaram**.
- `node --test corretor/tests/stored-answer-rendering.test.mjs` — **3/3 passaram**.
- `node --check` nos módulos JS do corretor legado e nos três scripts inline de `corretor/index.html` — passou.

Os checks remotos iniciais do PR #8 confirmaram os 36 testes, mas o job terminou vermelho no passo de formatação porque o checkout shallow não contém `HEAD^`. O PR #7 teve a mesma causa; seus três testes e checagem de sintaxe passaram. Os workflows foram corrigidos com `fetch-depth: 0`. Os novos checks remotos após essa correção ainda estão pendentes, portanto não são contabilizados como aprovados.

## Arquivos da Fase 2

- `.github/workflows/test-salta-corretor-fase2.yml` — CI de sintaxe, testes e formato.
- `corretor/v2/README.md` — instruções da persistência experimental.
- `corretor/v2/contracts/crypto-envelope.mjs` — tipo de envelope proposto para claim.
- `corretor/v2/persistence/authorization.mjs`
- `corretor/v2/persistence/code-reservation.mjs`
- `corretor/v2/persistence/crypto-adapter.mjs`
- `corretor/v2/persistence/database.mjs`
- `corretor/v2/persistence/index.mjs`
- `corretor/v2/persistence/migrate.mjs`
- `corretor/v2/persistence/migrations/0001_up.sql`
- `corretor/v2/persistence/migrations/0001_down.sql`
- `corretor/v2/persistence/repository.mjs`
- `corretor/v2/tests/idempotency-worker.mjs`
- `corretor/v2/tests/interruption-worker.mjs`
- `corretor/v2/tests/persistence-support.mjs`
- `corretor/v2/tests/persistence.test.mjs`
- `docs/SALTA_CORRETOR_FASE2.md` — este relatório.

Além disso, `.github/workflows/test-corretor-security.yml` no worktree/PR #7 recebeu a configuração `fetch-depth: 0` para corrigir o mesmo problema de CI. Essa mudança pertence ao PR #7, não ao PR #8.

## Publicação, commits e limites

- Fase 2: branch publicada e PR #8 aberto em draft; comparação com a base encadeada mostra **1 commit à frente, 0 atrás**, antes deste relatório/workflow final ser enviado.
- Commit local da implementação: `e49b5979c1e613aa87bbde055d1f79bbc7a7fb72` (`feat(corretor): add isolated local persistence`). O SHA remoto pode diferir por publicação via API do GitHub.
- O commit de relatório e correção de workflow será registrado nesta branch e publicado como atualização do PR draft.
- PR #7 permanece separado; a correção do workflow será publicada em sua branch e aguardará CI.
- Não houve merge, deploy, uso de secrets, migração remota, escrita no D1, nem conexão ao Cloudflare. Os testes locais não equivalem a homologação no Cloudflare.

## Pendências para Auth, Diário e produto

1. Integrar a identidade do Worker com sessão real de Auth e derivar usuário/tenant do contexto autenticado.
2. Integrar o Crypto Core aprovado, rever allowlist/envelopes e validar context binding e gestão de chaves.
3. Definir armazenamento de pepper fora do banco e reserva concorrente no serviço autorizado.
4. Implementar rotas do Worker e sincronização com o Diário com autenticação, autorização e ACK idempotente; manter dados de nota fora de texto claro onde E2EE exigir.
5. Projetar e validar a interface docente sem alterar o corretor legado até uma migração explícita.
6. Construir corpus OMR representativo, medir falsos positivos/negativos e calibrar confiança antes de automatizar decisões.
7. Fazer revisão independente de segurança e, somente após aprovação, planejar ambiente de homologação separado e consentido.

## Critérios de aceite para iniciar a Fase 3

- PR #6 integrado ou base formalmente replanejada; PR #4 e PR #7 tratados em revisão independente, sem substituir a versão local EJA.
- Workflow do PR #8 verde em seu head final; suíte local e testes de migração repetíveis.
- Esquema e API revisados com Auth/Crypto Core reais, sem identidades de teste tratadas como autenticação.
- Contrato de sync com Diário especifica ACK, retry, idempotência, revisão e proteção de duplicidade.
- Threat model cobre isolamento multi-institucional, Código SALTA, chaves, recuperação, logs e abuso de autorização.
- Plano de OMR explicita corpus, métricas e encaminhamento obrigatório de baixa confiança para revisão humana.
- Ambiente local/teste isolado identificado; nenhum D1 de produção usado.

## Procedimento de rollback

Para descartar somente uma execução experimental, feche a conexão e remova o arquivo SQLite temporário criado pelo comando/teste correspondente. Em um banco SQLite local descartável, use o runner de migration para aplicar `0001_down.sql`. Não execute o down em banco compartilhado ou remoto. Para o código, reverta o commit da branch de trabalho ou feche o PR; não reescreva `main` nem force-push sem revisão.
