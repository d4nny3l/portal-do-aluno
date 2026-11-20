# SALTA — P0-08B-03 — Página isolada de homologação A/B (preparação)

**Estado:** somente PR preparatório. **NÃO publicar/merge/deploy nesta missão.** Dados exclusivamente sintéticos.
**Fonte auditada:** PR #74, HEAD `7080d2de0b5a01bbe417b71732221a869e7a4d42`.
**Base:** `main` em `bcae46584a92b683f6e3edf0028f22dc029e7a0b`.
**Candidato de URL:** `https://d4nny3l.github.io/portal-do-aluno/plataforma/piloto-avaliacoes.html` — **NÃO publicada por este PR**.

## Isolamento e árvore mínima

O **Corretor publicado `plataforma/corretor-v2.html` não é editado**. A nova página inclui:
- `plataforma/piloto-avaliacoes.html`: markup independente, `noindex`, CSP restritiva, sem gabarito estático
- `plataforma/piloto-avaliacoes.mjs`: apenas adaptador de entrada de 60 respostas sintéticas, sessão SALTA, seleção e impressão A4; **não reimplementa armazenamento, criptografia, autorização ou gabarito privado**
- `plataforma/piloto-avaliacoes.css`: layout e impressão A4
- Cinco módulos copiados **byte a byte** do SHA #74 no **mesmo caminho canônico**:
  `corretor/v2/assessments/{block-scoring,private-contract-adapter,private-client,private-library,private-ui}.mjs`
- Reutiliza sem mudanças os módulos ópticos `corretor/v2/omr/{assessment,artwork,layout,layout-v1,layout-v2,manifest,render,render-v1,template}.mjs` já existentes na `main` com blobs idênticos ao #74

**Auth:** página primeiro valida `GET https://salta-stats.dannyel-moises.workers.dev/auth/session` com `credentials:include`, `cache:no-store`, requer `ok=true`, `authenticated=true` e `user` não vazio. Não lê cookies no JavaScript, não armazena usuário, token ou sessão. Mesmo assim, **o gateway/backend validam novamente o login e grants antes de qualquer operação**; o gate da página não é controle de acesso do servidor.

**Gateway:** cliente original recebe **somente** `https://salta-stats.dannyel-moises.workers.dev/assessments/v1`; não acessa Worker privado diretamente, não cria endpoint nem altera Stats. Todas as chamadas são com `credentials:include`, sem Authorization embutido, `cache:no-store`. Gateway já requer Origin da Pages, sessão, service binding, grants e flags do Worker. Se indisponível: falha fechada (sem gravação confirmada).

**Modelo:** A/B são ambas 60 questões A–E em uma folha A4 V2; blocos 1–30 = 6 e 31–60 = 4 pontos. Professor cola **gabarito sintético** do pacote local na textarea durante o piloto; ele **não está** no HTML/JS/CSS e não é salvo em localStorage/sessionStorage/IndexedDB. Respostas recuperadas de revisão privada aparecem transitoriamente apenas na aba autenticada. A prévia SVG é gerada com **manifesto da seleção confirmada** e é neutra (sem respostas), sem vínculo a Diário. Impresso A4 via navegador; é obrigatório conferir escala física. A câmera pública não é modificada/ativada por esta página.

## Testes e gates

Workflow `.github/workflows/test-pilot-pages-isolated.yml`:
1. Verifica sintaxe dos módulos sem código produtivo alterado.
2. Testa originalidade dos SHA Git blob dos cinco módulos e componentes OMR.
3. Valida planos A/B distintos, 60 A–E, 30+30, 6+4, manifesto, impressão SVG A4 e pontuação do motor original.
4. Testa C/D/E, vazias, duplas, erros de gabarito, autenticação 401, `ok/authenticated/user`, `credentials:include`, `no-store` e chamadas somente ao gateway.
5. Monta UI original com sessão e grants sintéticos, sem escrita, e executa regressões OMR originais.
6. Verifica ausência de segredos/gabaritos embutidos e ausência de referência a esta página no Corretor publicado.
Nenhum teste CI acessa serviço remoto, D1 real, Auth real, dados acadêmicos, configurações Cloudflare ou chaves.

**Limitações:** CI em Node/DOM sintético não homologa Safari/iPhone, cookies de terceiros (WebKit/ITP), scanner/câmera, impressão física A4, D1 remoto, Worker Free, nem homologação ponta a ponta. Página HTML do GitHub Pages é sempre pública como arquivo, ainda que o acesso aos registros dependa do login e grants. A URL oficial do gateway está fixa, mas as flags dos Workers **continuam desativadas** nesta entrega.

## Publicação futura — OPERAÇÃO DEPENDE DE AUTORIZAÇÃO EXPRESSA

**Não executar agora.** O PR preparatório **mira `main`**, não o PR #74. Procedimento **exclusivamente se** a Diretoria validar:
1. Auditor independente aprova HEAD deste PR, diff limitado, hashes e CI. Verificar se a identidade AUTH P0-08A, backup independente P0-06, grants, chaves/rollback e demais gates de infraestrutura foram homologados; **este PR não os resolve**.
2. Conferir em **Settings → Pages → Build and deployment** se a origem atual é **Deploy from a branch → `main` / `(root)`**; este endpoint administrativo não pôde ser consultado pelo conector. Se a origem for outra, **não publicar por suposição**: devolver ao CODEX/Diretoria para identificar a operação correta, sem mudar configuração.
3. Após autorização específica do proprietário, efetuar **merge somente do PR preparatório na `main`** (ou cherry-pick estritamente de seus commits para um PR próprio aprovado). **Não fazer merge de #74**. Não executar workflows históricos de deploy dos Workers.
4. Verificar a conclusão da publicação GitHub Pages **somente para os assets estáticos novos**, e testar via navegador a URL acima. Conferir que `plataforma/corretor-v2.html` continua byte a byte idêntico ao baseline; testar página deslogada (bloqueada), autenticada mas não provisionada (403) e, somente quando houver autorização independente de serviço/grants, cenários com dados A/B sintéticos.
5. O ato de colocar HTML/JS no Pages **não habilita** a biblioteca: ativação de Workers/gateway e cadastro são **autorizações separadas**, não incluídas nesta missão.

## Reversão futura — operação supervisionada

- Se o PR não foi integrado: fechar o PR ou descartar a branch; nada muda no Pages.
- Se já publicado e ainda isolado: executar um **revert do commit de merge/squash exclusivo deste PR**, por outro PR de remoção aprovado. Confirmar o novo build da Pages e ausência da página. Não reverter acidentalmente outros módulos ou alterações; conferir dependentes antes.
- Em risco de escrita indevida, o CODEX/Diretoria deve avaliar **fechamento da flag do gateway** em gate separado. Nenhuma credencial/keyring, D1, Stats, Auth ou Diário deve ser alterado neste PR.

**Status:** preparado para auditoria, não publicado, não ativado, sem evidência de homologação com dispositivos reais.
