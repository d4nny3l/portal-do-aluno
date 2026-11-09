# Corretor SALTA v2 — fundação experimental

Este diretório contém domínio e contratos experimentais das Fases 1 e 2. Não altera o HTML do Corretor, o Diário, os Workers publicados, a Área do Aluno nem os bancos existentes. Não faz chamadas de rede.

## Contratos

- `domain/identity.mjs`: tenant pessoal/institucional, usuário, membership, ano, aluno, matrícula, turma, escopo e política de Código SALTA de sete dígitos.
- `domain/assessment.mjs`: versões imutáveis, snapshot cifrado de participantes, seções mistas, chave versionada, template, histórico sem conteúdo acadêmico em claro.
- `domain/scoring.mjs`: cálculo determinístico, ausências, segunda chamada, brancos, duplas, revisão e política explícita de anulação; somente publicação explícita libera nota definitiva.
- `contracts/crypto-envelope.mjs`: envelope compatível conceitualmente com Crypto Core; não implementa cifra nem inclui Worker de laboratório.
- `contracts/diary-sync.mjs`: request somente cifrado e definitivo, idempotência/conflito e confirmação explícita do adaptador simulado.
- `contracts/domain.d.ts`: tipos de referência para integração futura.
- `persistence/`: SQLite local via `node:sqlite`, migrations versionadas, repositório isolado por workspace/scope, reserva HMAC de código e adapter estrutural do Crypto Core.

## Limites de segurança

`assertScopePermission` é uma função de política, não um mecanismo de autenticação. Não confie em autorização que veio do browser; o futuro Worker deve derivar identidade e membership da sessão. Não existe registry persistente de códigos nem diretório global. O código gerado só é identificador e exige um serviço seguro para reserva única; nenhuma implementação de armazenamento de código foi incluída.

Os tipos `salta.assessment.*` e `salta.identity.code-claim.v1` são propostos e ainda não estão na allowlist nem na integração do Crypto Core do PR #4. O adapter delega no Core recebido; nenhum Core real é carregado por esta Fase 2. Fixtures de teste são ciphertext opaco sintético, não prova criptográfica. O SQLite só pode abrir arquivo local ou `:memory:` e não contém configuração D1/Cloudflare. Testes usam `:memory:` e arquivos temporários sintéticos apagados ao final.

`authorizeDatabaseAction` valida workspace, membership, scope, grant e permissão no lado do repositório; nos testes, usuários são identidades sintéticas. Isso não é autenticação: um Worker futuro deverá obter o usuário da sessão autenticada e chamar a política no servidor. A reserva global de Código SALTA usa HMAC de pepper injetado e guarda somente o digest e payload cifrado compactado; a chave de pepper fica fora do banco. As funções exigem callbacks de autorização e não expõem endpoint de busca.

As migrations são locais e têm down testado. `migrateDown` remove as tabelas do Corretor e seus dados no banco entregue; use somente em arquivo descartável. Nenhum script de deploy nem migration remota existe nesta etapa.

## Teste local

```sh
node --test corretor/v2/tests/*.test.mjs
```

Os testes são sintéticos, sem D1, Cloudflare, credenciais, arquivos reais ou dados de alunos.
