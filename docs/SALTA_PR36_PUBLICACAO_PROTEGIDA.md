# PR #36 — homologação remota protegida

Esta etapa reaproveita o banco entregue em `c36b8ed`, sem reconstruí-lo. A alternativa autorizada é **homologação sintética isolada**. Não representa liberação de avaliações reais, integração ao Diário ou homologação institucional multiusuário.

## Identidade e autorização

- Origem única: `https://salta-assessments-homologacao.dannyel-moises.workers.dev`.
- Aplicação Access `ca620ad7-7e64-4295-b862-df2a8533d021`, política de inclusão restrita ao responsável da conta. A audiência pública consta no Wrangler protegido; não é um token de autenticação.
- O Worker exige `ctx.access` autenticado pelo runtime Cloudflare, audiência exata e identidade verificada. Headers de email/JWT enviados pelo cliente e login de fixture não concedem acesso remoto.
- Principal opaco é resolvido no D1 pelo hash do email verificado. Só há grant para a **turma sintética A / 4º bimestre**. Proprietário, turma e período continuam conferidos nas operações existentes.
- Aplicação Access: sessão de 30 minutos, HttpOnly, binding cookie, sem bypass/CORS aberto. Cada requisição de asset/API passa pelo controle de identidade; preview URLs desativadas. Mudança de hostname não libera acesso: a origem exata também é exigida no Worker.
- Controle de principal no servidor inclui `enabled`, `epoch` e expiração. A concessão inicial de teste dura 30 dias; o provisionamento repetido não renova, reativa ou apaga revogações. O batch de gravação revalida concessão, época e prazo para impedir escrita concorrente após revogação.

Isso resolve identidade/sessão no **ambiente de homologação**, usando um provedor separado e sem alterar o Auth Worker oficial. O login compartilhado da SALTA não foi convertido implicitamente em identidade de todos os docentes. Não foram criados vínculos com turmas reais.

## Chaves, recuperação, expiração e revogação

O envelope de avaliação existente (AES-256-GCM/HKDF, AAD e versão 1) permanece idêntico. Manifestos, revisões e gabaritos anteriores não são regenerados. O laboratório localhost continua usando seu IndexedDB original.

Na homologação remota, uma raiz aleatória de 256 bits é protegida por uma frase de recuperação escolhida no navegador. PBKDF2-SHA256 com 600.000 iterações e salt aleatório de 32 bytes deriva uma chave AES-256-GCM; nonce aleatório de 12 bytes e AAD vinculada ao principal autenticam o cofre. Só o cofre cifrado vai ao D1. Frase e raiz não são enviadas ou registradas em logs. A raiz é importada como HKDF não exportável; a cópia temporária é descartada.

Após fechar a página ou em outro navegador, a sessão Access e a mesma frase recuperam a chave a partir do cofre. A frase precisa ser guardada pelo responsável fora da SALTA. Perder a frase não permite um reset que abra os dados: não há escrow ou recuperação administrativa da chave. Outra frase, outro principal ou envelope adulterado falham. O servidor não permite substituir silenciosamente o cofre ou criar outra raiz sobre avaliações existentes.

O desbloqueio dura no máximo 15 minutos; não é um prazo renovado a cada clique. A aplicação verifica novamente a sessão antes de salvar/recuperar e periodicamente. Expiração, página encerrada ou revogação eliminam as referências da chave; expiração redireciona para um novo desbloqueio. Não há persistência da chave remota em IndexedDB. JavaScript não garante zeroização da memória/BFCache; respostas de produção usam no-store e restauração de página força reload.

`POST /api/access/revoke` revoga o próprio principal, incrementa sua época e bloqueia assets, avaliações e cofre, preservando ciphertext e revisões. A retomada exige ação administrativa explícita no D1 isolado e a frase de recuperação. Revogação não apaga cópias já baixadas nem desfaz conhecimento anterior de uma chave; rotação completa e redistribuição de chaves continuam requisitos de uma implantação com dados reais.

## Infraestrutura e operação

Somente `ASSESSMENTS_DB` / `fb74f058-06f8-40a5-8327-445bded453e3` é ligado ao novo Worker. Migração aditiva `0002_protected_access.sql` cria controles de acesso e cofre; o down correspondente é exclusivo do laboratório. Não executar down sem backup e chaves preservadas. Esquema anterior, raízes e revisões não são sobrescritos.

`wrangler.toml` continua local, sem rota pública. `wrangler.protected.toml` é a configuração remota, com Access obrigatório. `provision-homologation.mjs` concede apenas a identidade responsável e o escopo sintético; não lista alunos ou consulta bancos acadêmicos. O build copia assets por allowlist, adapta a sessão exclusivamente na cópia protegida e insere o SHA do código em `salta-deploy-commit`. Navegação acadêmica remete ao portal oficial; o Corretor permanece no ambiente isolado. Nenhum proxy para o Diário foi criado.

Sequência de publicação: aplicar migração ao UUID isolado → configurar Access e conferir a política → provisionar grant sintético → testes/CI verde no SHA exato → build protegido → deploy do Worker → validação de negação anônima e ciclo autenticado → merge seguro/Pages. Se algum controle falhar, não integrar/liberar o fluxo. Não expor `wrangler dev` por túnel.

```sh
npm ci --prefix assessments-lab --ignore-scripts --no-audit --no-fund
node --test corretor/v2/tests/*.test.mjs stats-worker/tests/*.test.mjs plataforma/tests/*.test.mjs assessments-lab/tests/*.test.mjs
node assessments-lab/build.mjs
node --test assessments-lab/tests/d1-http.integration.mjs
# Somente após confirmar Access e CI:
node assessments-lab/build.mjs --protected
node assessments-lab/node_modules/wrangler/bin/wrangler.js deploy --config assessments-lab/wrangler.protected.toml
```

## Validação e limites

Suíte de 105 testes, mais integração HTTP Workerd/D1. Os três testes novos cobrem identidade/audiência/header forjado/expiração/revogação, recuperação em novo dispositivo com adulteração e troca de principal, preservação de revisões, revogação durante transação e descarte da chave expirada. Regressões OMR anteriores continuam obrigatórias na CI; os módulos geométricos não mudaram nesta etapa.

Evidências finais de CI, SHA, deploy e ciclo autenticado são registradas na conversa do [PR #36](https://github.com/d4nny3l/portal-do-aluno/pull/36) e no relatório local `outputs/pr36-publicacao/`. A mera configuração do Access ou upload não comprova que o ciclo remoto funciona.

Para uso real permanecem: cadastro institucional de docentes e vínculos de turma/período, protocolo de recuperação e rotação/revogação de dispositivos revisado independentemente, proteção da entrega de JavaScript, políticas de backup e testes físicos/operacionais. A foto também não identifica automaticamente a avaliação/revisão quando a geometria coincide. A seleção correta pelo professor e a revisão humana permanecem necessárias. Nenhuma nota é publicada no Diário.

Referências oficiais: [Access em Workers e identidade do runtime](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [roteamento workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). A configuração efetiva e as verificações do deploy prevalecem sobre exemplos de documentação.
