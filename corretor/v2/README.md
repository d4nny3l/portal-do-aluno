# Corretor SALTA v2 — fundação experimental

Este diretório contém apenas domínio puro e contratos da Fase 1. Não altera o HTML do Corretor, o Diário, os Workers, a Área do Aluno nem os bancos existentes. Os módulos não fazem chamadas de rede nem persistem dados acadêmicos.

## Contratos

- `domain/identity.mjs`: tenant pessoal/institucional, usuário, membership, ano, aluno, matrícula, turma, escopo e política de Código SALTA de sete dígitos.
- `domain/assessment.mjs`: versões imutáveis, snapshot cifrado de participantes, seções mistas, chave versionada, template, histórico sem conteúdo acadêmico em claro.
- `domain/scoring.mjs`: cálculo determinístico, ausências, segunda chamada, brancos, duplas, revisão e política explícita de anulação; somente publicação explícita libera nota definitiva.
- `contracts/crypto-envelope.mjs`: envelope compatível conceitualmente com Crypto Core; não implementa cifra nem inclui Worker de laboratório.
- `contracts/diary-sync.mjs`: request somente cifrado e definitivo, idempotência/conflito e confirmação explícita do adaptador simulado.
- `contracts/domain.d.ts`: tipos de referência para integração futura.

## Limites de segurança

`assertScopePermission` é uma função de política, não um mecanismo de autenticação. Não confie em autorização que veio do browser; o futuro Worker deve derivar identidade e membership da sessão. Não existe registry persistente de códigos nem diretório global. O código gerado só é identificador e exige um serviço seguro para reserva única; nenhuma implementação de armazenamento de código foi incluída.

Os tipos `salta.assessment.*` são propostos e ainda não estão na allowlist nem na integração do Crypto Core do PR #4. Até uma revisão de contrato e autorização, envelopes são fixtures sintéticas e o Core real não é chamado. O banco SQLite criado nos testes é exclusivamente `:memory:` e armazena apenas envelopes ciphertext de fixtures.

## Teste local

```sh
node --test corretor/v2/tests/*.test.mjs
```

Os testes são sintéticos, sem D1, Cloudflare, credenciais, arquivos reais ou dados de alunos.
