# SALTA — Corretor OMR 2.0 — Fase 1: fundação e contratos

**Estado:** PR draft aberto para revisão.
**Base:** `main` após merge documental do PR #5 (`73a0f3201f5bdd8aa226226ebef9452aa688095d`).
**Branch:** [`codex/salta-corretor-v2-fase1`](https://github.com/d4nny3l/portal-do-aluno/tree/codex/salta-corretor-v2-fase1).
**PR draft:** [#6 — contratos de domínio e sincronização](https://github.com/d4nny3l/portal-do-aluno/pull/6).
**Commit publicado:** `0e812119468a202f25db49947648682dd811289a`.
**Data:** 9 de novembro de 2026.

## Escopo desta entrega

A Fase 1 cria modelos de domínio puros, contratos de dados e testes sintéticos para estabelecer a base do Corretor. Não adiciona fluxo visual, OMR novo, persistência D1, rotas de Worker, autenticação multiusuário ou integração com o Diário publicado. Não acessa nem altera Cloudflare, secrets ou bancos remotos. Os testes usam SQLite `:memory:` com fixtures artificiais, não D1.

O plano e a matriz dos 65 requisitos permanecem no relatório da Fase 0, [SALTA_CORRETOR_AUDITORIA_E_PLANO.md](SALTA_CORRETOR_AUDITORIA_E_PLANO.md). Esta implementação materializa apenas a fundação contratual atribuída à Fase 1; requisitos que dependem de UI, persistência, OMR, identidade/autorização de produção ou deploy continuam pendentes.

## O que foi criado

- `corretor/v2/domain/identity.mjs`: tenant individual/institucional, usuário, membership, aluno, matrícula, turma, ano letivo e escopo; valida relações; política de autorização pura; geração CSPRNG de código SALTA com sete dígitos, zeros à esquerda e repetição controlada em colisão. A reserva única depende de um adapter futuro e nenhum diretório público é criado.
- `corretor/v2/domain/assessment.mjs`: revisão imutável da avaliação, 1–100 questões numeradas, seções mistas A–D/A–E/C–E, pesos, versão de gabarito e template, snapshot de participantes com envelope cifrado e eventos append-only sem conteúdo acadêmico em claro.
- `corretor/v2/domain/occurrence.mjs`: tentativa, ocorrência de cartão e reescaneamento distintos, versionamento do template, observações por questão e adjudicação manual vinculada à questão/tentativa.
- `corretor/v2/domain/scoring.mjs`: ausência sem nota zero, primeira/segunda chamada, branco, incorreta, dupla marcação, pendência, revisão manual, anulação por política `award`/`normalize`, arredondamento determinístico a duas casas e separação explícita entre provisório e definitivo. Resultado provisório nunca é elegível para o bimestre; definitivo exige publicação explícita e nenhuma pendência.
- `corretor/v2/contracts/crypto-envelope.mjs`: allowlist de envelope que aceita metadados e ciphertext, valida contexto/versão e recusa campos adicionais. Os tipos `salta.assessment.*` ainda não estão na allowlist do Crypto Core/Worker da branch experimental; esta entrega não os adiciona ao serviço.
- `corretor/v2/contracts/diary-sync.mjs`: contrato de envio apenas de resultado definitivo cifrado, chave idempotente, deduplicação concorrente em memória, tratamento retryable e ACK explícito antes de marcar sincronizado. É apenas um adapter contratual em memória, não uma fila ou endpoint de produção.
- `corretor/v2/contracts/domain.d.ts`: tipos de referência, incluindo assinaturas alinhadas às APIs reais do Crypto Core experimental; tipos não representam integração aprovada.
- `.github/workflows/test-salta-corretor.yml`: workflow de sintaxe/testes sintéticos acionado por mudanças em `corretor/v2/**` e pelo PR desta fase.

## Decisões e limites de arquitetura

1. O identificador de sete dígitos é somente uma chave opaca; não autentica, autoriza nem permite descoberta de aluno. O serviço de reserva única ainda precisa de persistência transacional e controle de tenant.
2. Funções de membership/grant são políticas puras de domínio. Em produção, o Worker deverá obter sessão e membership do servidor; não aceitar autorização fornecida pelo browser.
3. Nomes e notas não entram em claro nos snapshots ou pedidos de sincronização. O envelope é um contrato sintético e não prova E2EE. O Crypto Core está em PR experimental separado (#4), que permanece sem merge; ainda faltam allowlist, contexto/identidade autenticados e integração real.
4. Não há limiar de confiança OMR embutido. A confiança é preservada como sinal, mas só um estado explicitamente fornecido pode marcar uma resposta como revisão. A calibração depende de corpus rotulado e métricas de erro.
5. Histórico é append-only dentro do modelo puro, sem garantia de armazenamento imutável até haver serviço persistente e autorização de escrita.
6. Regras de anulação e dupla marcação são explícitas. A escolha da política pedagógica final deve ser validada pelo professor antes de persistência ou publicação.
7. A integração do Diário deverá passar por um adapter server-side com autorização por turma/avaliação, idempotência persistente, ACK verificável e operação de reconciliação. O mock atual não substitui essas garantias.

## Correção de segurança em branch separada

Foi feita uma correção independente no Corretor atual para não interpretar `localStorage.saltaKey` como HTML. A leitura do gabarito agora valida formato/tamanho/respostas e o renderizador monta elementos DOM com `textContent`. Ela está na branch `codex/salta-corretor-seguranca-html` e deve ser revisada em PR separado. A correção não altera cartão, coordenadas ou artefatos EJA ainda não publicados do checkout compartilhado; antes de qualquer merge, compare e reconcilie com essas mudanças locais.

## Testes realmente executados localmente

- Corretor v2: `node --test corretor/v2/tests/*.test.mjs` — **21/21 passaram**; inclui isolamento sintético de tenants em SQLite `:memory:`, envelope sem plaintext, pontuação, versionamento, idempotência e confiança OMR sem limiar implícito.
- Diário: `node --test stats-worker/tests/diario-periods.test.mjs` — **11/11 passaram**.
- Crypto Core experimental: `npm run test:e2ee` — **12/12 passaram** na worktree da branch E2EE, somente com fixtures locais.
- Correção XSS: `node --test corretor/tests/stored-answer-rendering.test.mjs` — **3/3 passaram**; `node --check` nos módulos tocados e nos três scripts inline do HTML — passou.
- `node --check` nos módulos da Fase 1 e `git diff --check` — passou.
- GitHub Actions no PR #6 — run #2 concluído com `success`.

Esses testes não provam precisão do OMR, segurança de produção, isolamento real no Cloudflare, comportamento de rede ou implantação. O check de CI registrado é somente o workflow local desta branch; ele não executa Workers, D1, navegador real ou OMR com fotos.

## Próximas etapas e critérios de aceite

| Etapa | Escopo | Critério para avançar |
|---|---|---|
| 1 — Contratos | Revisão deste domínio, identificadores, versões, regras de nota e envelope | Aprovação dos contratos; testes sintéticos verdes; nenhum acesso remoto ou plaintext acadêmico |
| 2 — Persistência isolada | Esquema relacional/objetos e adapters de repositório em ambiente local | Migrations reversíveis; integridade referencial/tenant; idempotência concorrente persistente; testes de falha e isolamento em DB local descartável |
| 3 — Captura e OMR | Extrair leitor; versões de cartão; observações e calibração | Corpus sintético/rotulado; matriz de confusão por formato e captura; ambiguidades sempre em revisão; nenhum resultado publicado automaticamente |
| 4 — Revisão do professor | UI de avaliações, roster snapshot, gabarito e fila de correção | Fluxo teclado/móvel acessível; histórico completo; segunda chamada/reescaneamento sem sobrescrita; testes de interação |
| 5 — Criptografia/autorização | Integrar Core após revisão/merge próprio; identidade de membro, escopo e rotação | Threat model revisado; somente ciphertext em repouso/trânsito; chaves e recuperação testadas; autorização verificada server-side; sem fallback plaintext |
| 6 — Diário | Adapter e reconciliação em D1 de teste realmente isolado | E2E de definitivo, retry, duplicidade, ACK, tenant errado e falha; nada grava no Diário de produção |
| 7 — Área do Aluno/rollout | Expor resultado publicado e política de histórico | Contrato do aluno, publicação/revogação, privacidade/retention e testes de regressão aprovados; deploy controlado depois de autorização própria |

## Publicação e ambiente

A branch experimental e o PR draft #6 estão publicados. A correção do armazenamento/renderização está isolada no [PR draft #7](https://github.com/d4nny3l/portal-do-aluno/pull/7), branch `codex/salta-corretor-seguranca-html`; nela os 3 testes locais passaram, mas não há workflow de CI configurado para esses caminhos. Não foi executada migração remota, deploy, merge em `main` de código, publicação em Pages nem alteração de Cloudflare/D1. O PR #4 de E2EE não foi mesclado. O PR #5 continha apenas documentação da auditoria Fase 0 e foi integrado em `main` antes desta branch.

Para validar futuramente em Cloudflare, primeiro criar Worker de teste e D1 isolado com nomes claramente distintos, revisar os bindings no painel, aplicar apenas migrations reversíveis ao banco vazio, configurar credenciais de teste fora do chat e usar fixtures sintéticas. Nenhum desses passos foi realizado nesta fase.

## Reversão

A entrega de código é isolada em duas branches e pode ser revertida fechando os PRs ou revertendo seus commits antes de merge. Se uma migration vier em etapa posterior, ela deverá acompanhar migration down testada e ser executada apenas em DB de teste isolado. O teste SQLite em memória não deixa dados persistidos.
