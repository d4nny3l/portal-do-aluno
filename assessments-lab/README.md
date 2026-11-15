# Banco de avaliações — laboratório isolado

**Somente dados sintéticos em localhost. Não usar avaliações reais.** O Worker recusa hosts externos e não está publicado. O D1 remoto separado contém apenas o esquema vazio; o fluxo funcional usa D1 local.

## Executar

Na raiz do repositório, com Node 24:

```sh
npm ci --prefix assessments-lab --ignore-scripts --no-audit --no-fund
npm --prefix assessments-lab run build
npm --prefix assessments-lab run migrate:local
npm --prefix assessments-lab run seed:local
npm --prefix assessments-lab run dev
```

Abrir `http://127.0.0.1:8791/` e escolher Professor sintético A ou B. São fixtures, não contas de produção. A fixture A acessa somente sua turma/período; B não pode acessar avaliações de A. Nenhum binding `DB`, `DIARIO_DB` ou `AUTH` integra este Worker.

Adicionar questões A–D/A–E/C–E, preencher título/componente, escolher o gabarito por questão e salvar. Após confirmação do servidor, fechar a página, reabrir e selecionar a avaliação/revisão. Gerar o cartão; a correção recupera gabarito, máximo e manifesto exatos. Nome/código nominal são informados localmente para a impressão e não integram o cadastro reutilizável.

Os assets são gerados por allowlist em `public/`, ignorada pelo Git. Somente a cópia local recebe a adaptação de sessão; a autenticação da página publicada permanece intacta. Reexecutar `build` após modificar a interface.

## Persistência e chaves

D1 local: `assessments-lab/.wrangler/state`. Chave HKDF não exportável: IndexedDB do navegador, por principal sintético. Preservar ambos para continuar o ensaio. Outro navegador/dispositivo ou remoção dos dados locais não dispõe dessa chave; a aplicação falha fechada e não gera uma chave substituta para registros já existentes. Recuperação, enrollment, compartilhamento e rotação produtivos não estão implementados.

As revisões são append-only. Um recibo perdido pode ser reenviado com o mesmo requestId/payload; concorrência retorna 409. Uma avaliação arquivada permanece legível, mas não recebe novas revisões.

## Testes

```sh
node --test corretor/v2/tests/*.test.mjs stats-worker/tests/*.test.mjs plataforma/tests/*.test.mjs assessments-lab/tests/*.test.mjs
node --test assessments-lab/tests/d1-http.integration.mjs
```

O segundo comando cria seu próprio D1 temporário e porta livre, executa Workerd real, testa HTTP, conflito, replay e rollback/reaplicação. Não compartilha o banco/chave do ensaio no navegador e não acessa D1 remoto.

## Migração e reversão

`migrations/0001_assessments.sql` cria somente tabelas deste domínio. `migrations/down/0001_assessments.sql` desfaz a estrutura e remove apenas sua entrada do ledger de migrações do Wrangler, permitindo reaplicar a versão. A reversão estrutural foi testada em D1 temporário; **não restaura registros**. Antes de uma reversão de um laboratório com dados úteis, exportar seu ciphertext e preservar o perfil/chaves do navegador. Nunca executar esse down em bancos acadêmicos.

Scripts npm de execução/migração/seed usam `--local` explicitamente. Nenhum script publica Worker ou migra produção. A única migração remota desta missão foi aplicada ao UUID isolado identificado no relatório, sem seed ou avaliações.

## Bloqueio de uso real

A sessão atual da SALTA e o Crypto Core experimental não fornecem ainda vínculo autenticado de chave/dispositivo, recuperação institucional e autorização produtiva por docente/turma/período para esta API. Não substituir essa lacuna por um ID do navegador, uma chave mestra no Worker ou um header de teste. Ver [relatório técnico](../docs/SALTA_AVALIACOES_GABARITOS_FASE1.md).
