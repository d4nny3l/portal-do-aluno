# Piloto privado — preparação, sem ativação

Candidato consolidado sobre #68 `d453e1da14147990a8ba837a39f38975bbdff627`: incorpora integralmente o catálogo #72 `466a6780b29fe462cbf645ca6262b265a4c0c135` e o gateway #73 `06e876b6674b11a46caa177d45f9986986bcf06f`, preservando seus commits e branches. Backend/cliente/UI do catálogo permanecem byte a byte como #72. Stats/Auth/Diário, OMR e workflows de deploy existentes permanecem intactos. Diferenças e homologação mínima: [INTEGRATION.md](INTEGRATION.md).

O artefato do gateway importa **virtualmente do Git** o Stats produtivo `f4dce82716faa06720068f3228a6f890fd0f928f`, blob `3cb6e181d000f86a664edeefe9fad3aae0df51fe`, SHA-256 `6e1c0c0ad36d2c136ee0a6b8065ed2b611fea23828a4f3a0b8e8aead731a3fba`. Não importa `stats-worker/worker.js` do checkout, que contém D-04. O build falha se o hash divergir ou se o bundle incluir contrato/recibos D-04. O backend e cada dependência são conferidos contra #72 antes de gerar o artefato. `integrity.mjs` aceita exclusivamente os sete arquivos do catálogo, este diretório e sua CI; qualquer outro delta sobre #68 é recusado. O catálogo precisa coincidir exatamente com #72, exceto pela escolha determinística do ID em uma linha do teste de paginação (documentada em INTEGRATION.md).

O código acadêmico produtivo antigo permanece byte a byte como origem; este piloto não corrige nem homologa seu risco D-04. O wrapper encaminha a mesma Request/env/context e retorna a mesma Response em todas as rotas fora de `/assessments/v1/*`. Só a família nova recebe CORS/Origin/CSRF, sessão, limitadores e binding privado. Ela é tratada antes do OPTIONS global legado, sem modificar aquele handler.

## Executar somente localmente

```sh
npm ci --prefix assessments-lab --ignore-scripts --no-audit --no-fund
node --test private-pilot/tests/*.test.mjs
node --test private-pilot/tests/pilot.integration.mjs
node private-pilot/integrity.mjs
node private-pilot/build.mjs
```

Requer histórico Git com os dois commits fixados. O build não executa Wrangler, autentica, busca secrets, provisiona, migra ou publica. `dist/` contém dois bundles e `artifacts.json` com hashes/ref de origem; não contém credenciais nem configuração de recursos reais. O manifesto registra o HEAD do checkout; para um release futuro, produzir novamente no commit exato autorizado e conferir hashes/saída bem-sucedida, sem aproveitar arquivos antigos de outra geração.

O ensaio integrado executa três Workers reais em loopback, os limitadores nativos, Auth/SessionStore originais, D1 temporário e cliente/controlador do #72. Sessões sintéticas são criadas pelo binding privilegiado **do teste**, não por endpoint/bypass publicado. Cobre duas avaliações A4 de 60 questões com gabaritos distintos, catálogo por instituição/turma/período, duas identidades, outra sessão, persistência/reinício, CAS/replay, revogação, logout e histórico/seleção. Não é login real, ensaio físico ou homologação de Safari.

## Fronteira do gateway

- Flags inicialmente ausentes/falsas: `PRIVATE_GATEWAY_ENABLED` e `ENABLE_ASSESSMENTS`; UI do #68 continua falsa e sem URL configurada.
- Origin única `https://d4nny3l.github.io`; HTTPS, JSON e métodos/paths exatos do contrato. Catálogo permite cursor e escopo completo `institutionId/classId/periodId` do #72; filtros parciais, repetidos ou arbitrários são recusados. A autorização continua no backend. Sem wildcard, localhost produtivo, identidade em header, bearer alternativo, URL arbitrária, redirect ou cookie emitido pelo backend privado. O origin cobre todos os caminhos desse host Pages; não é defesa contra XSS de mesma origem.
- Só cookies de sessão reconhecidos são encaminhados, sem exposição ao JavaScript. Gateway consulta o binding AUTH existente para limitar a conta verificada; backend **revalida** sessão e grants/proprietário, sem confiar em identidade encaminhada. São duas validações internas, sem login novo ou mudança do Auth.
- Quatro limitadores próprios: 300/IP/min, 120/conta/min, 20 mutações/conta/min e 15 prints/conta/min. Binding ausente/falha fecha só o módulo. Limites nativos são aproximados/por localidade; não são teto global financeiro. Corpo máximo 1.000.000 bytes, inclusive stream sem Content-Length. 429 fornece Retry-After; nada faz retry automático de escrita.
- Resposta privada sempre no-store e CORS restrito; sem cache público, headers de identidade arbitrários ou Set-Cookie do backend. Conexão perdida pode ocorrer depois do commit: conservar requestId/corpo original e confirmar pelo cliente auditado.
- API autenticada no host Stats; backend sem endereço público direto e somente ASSESSMENTS_DB + AUTH. D1 de avaliações exclusivo. Chaves sob custódia do servidor, não E2EE. Usuários/grants não são criados automaticamente.

## Preparar configuração fechada

Somente depois de obter os metadados de recursos exclusivos aprovados, fornecer um JSON privado com os campos `workerName`, `databaseName`, `databaseId`, `activeKeyVersion` e `limiterNamespaces` (`ip`, `account`, `write`, `print`). Nomes devem começar por `salta-assessments-private-`; UUID deve ser o D1 exclusivo real aprovado; os quatro namespaces numéricos devem ser novos e distintos. Não fornecer senha, token, frase ou keyring nesse JSON. Não há IDs remotos inventados neste pacote.

```sh
node private-pilot/prepare.mjs /caminho/approved-resources.json private-pilot/prepared
```

Este comando apenas gera bundles, migração existente e dois TOMLs locais com **flags falsas**. Bloqueia UUIDs conhecidos de DB/DIARIO_DB/Banco v1 e colisões conhecidas com os limitadores do Auth. Essa validação não comprova que um UUID arbitrário seja exclusivo: o operador deve conferir o destino autorizado. O TOML do gateway conserva a configuração versionada de produção, trocando só o entrypoint e acrescentando binding/flags/limitadores do módulo novo. O backend recebe workers_dev=false, preview_urls=false e nenhum DB/DIARIO_DB. Conferir ainda a configuração dinâmica efetiva antes de qualquer publicação futura.

## Checklist operacional — tudo pendente de autorização

1. **Revisão:** fixar HEAD, CI verde, aprovação do delta pelo Auditor/proprietário e reconferir Stats ativo `a6fb47fd-9dc7-4415-b8e4-8d18928232ac`/100% e hash da fonte. Se a produção ou os HEADs auditados mudarem, parar e revalidar; não adaptar silenciosamente a base. Não usar workflow histórico, workflow de deploy Stats ou entrypoint Stats da main.
2. **Recursos:** autorização específica para cadastrar Worker privado com workers.dev/previews/rotas públicas desativados **antes de enviar código**, criar D1 exclusivo vazio e namespaces dos limitadores. Nenhum recurso é criado por estes scripts. Registrar IDs/destinos aprovados sem segredo, gerar TOMLs fechados e conferir hashes do manifesto/commit.
3. **Dados e chaves:** autorizar separadamente a migração única no D1 exclusivo, configuração de versões de chave no servidor com backup protegido e cadastro explícito de principal/grants aprovados. Dados do piloto continuam sintéticos. Não reutilizar bancos/chaves do Diário ou laboratório. Antes de dados úteis, testar backup/restauração incluindo recibos/seleções/versões de chave. Catálogo #72 retorna até dez registros por página e mede até três chamadas D1.prepare locais; esses números não homologam CPU/rows_read/custos ou plano Workers Free. Aprovar capacidade e medir em homologação autorizada antes de habilitar uso real.
4. **Deploy isolado:** somente com autorização posterior, publicar o bundle privado e o wrapper usando **os TOMLs de prepared/** no commit aprovado, mantendo flags falsas. O `main` do gateway aponta para `stats-gateway.mjs` gerado da fonte selada, nunca para Stats da main. Preservar bindings, secrets existentes e configuração dinâmica do Stats; não aplicar D-04, migração acadêmica ou qualquer outro delta. Verificar negação de acesso direto ao backend e rotas antigas antes de pedir habilitação.
5. **Homologação/flags:** autorização específica para ligar as duas flags de servidor, usar sessão real do proprietário e habilitar/configurar UI do #68 em publicação Pages controlada. A UI não foi alterada aqui. Conferir Safari/iPhone, segundo dispositivo, persistência/reabertura, isolamento/revogação/erros, limites e cartão sintético físico A4/60. Nenhuma integração automática ao Diário. Não alegar funcionamento publicado a partir dos testes locais.

Não há comando de deploy/migração remota nos scripts ou CI deste diretório. Cada operação remota acima é um gate separado; gerar arquivos locais não constitui autorização.

## Rollback mínimo

Com autorização de emergência previamente acordada: fechar a flag do gateway e do backend e ocultar a UI nova, preservando banco, chaves, revisões, recibos e seleções. Se necessário, restaurar **a versão produtiva anterior fixada** do Stats após reconferir metadados/configuração, sem substituí-la pelo Stats da main ou acionar workflow antigo. Não apagar D1, aplicar down ou trocar chaves para contornar falha. Uma gravação pode ter sido confirmada antes da perda de resposta; reconsultar o recibo original.
