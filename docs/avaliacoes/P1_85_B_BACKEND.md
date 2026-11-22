# P1 85 B Backend mínimo candidato

Candidata local e de PR, sem publicação. [Ordem da Diretoria](https://github.com/d4nny3l/portal-do-aluno/issues/85#issuecomment-7068747150). Main verificada: `5865dfc43efeada4effa2c8a96a3543794a6ff7f`; contrato #86: `5798112330260138ea4124cb9ea6d7f202248ddc`; frontend #88: `8141984e03cf43632b3313ddcb6159f0ab5a9ac2`. Os PRs existentes e a main não são modificados.

## Composição seletiva

A base desta candidata adiciona uma única cópia do helper puro `corretor/v2/assessments/score-format.mjs`, com blob `6f1b34d68f5406f24f5d40a05b04916c083e54a9`, idêntico ao #86 e #88. A branch do backend deriva dessa base e adiciona somente os três arquivos de runtime do serviço e suporte local de build/teste/documentação. Não importa a história nem os diretórios do piloto #74/#68, nem páginas ou controladores antigos. Os treze inputs já presentes são reutilizados sem modificação.

A separação preserva o guard frontend existente: o PR da base pura não tem backend; o PR exclusivo do backend não modifica helpers/DOM e depende da base. Nenhum workflow de deploy é alterado ou acionado. O guard novo aceita apenas arquivos nominados do serviço, sua CI e este documento, e rejeita Auth, Stats, OMR, frontend, configurações de deploy e novas migrações. Antes de eventual retarget para main, integrar a base somente sob autorização e revalidar o diff/CI.

## Matriz completa das dependências

Origem de todos os blobs candidatos: snapshot final do contrato #86 acima. Os treze blobs idênticos já estão na main fixada; os três arquivos de serviço não existem nela e são indispensáveis ao backend ausente. O quarto ausente é o helper puro, fornecido uma única vez pela base e também presente no #88. Não há diferença de bytes entre runtime candidato e contrato aprovado. SHA-256 adicional de cada input em `assessments-service/dependencies.json`.

| Nº | Caminho | Blob main | Blob candidato | Comparação | Indispensabilidade |
| --- | --- | --- | --- | --- | --- |
| 1 | `corretor/v2/omr/assessment.mjs` | `d58ae56ced0488c9bc1693b468efac7bdba07612` | `d58ae56ced0488c9bc1693b468efac7bdba07612` | idêntico, reutilizado | Tipos/limites de questão exigidos pelo manifesto. |
| 2 | `corretor/v2/omr/layout-v1.mjs` | `4970e5e293ac95b3612aeb20e9cecbd81bebca33` | `4970e5e293ac95b3612aeb20e9cecbd81bebca33` | idêntico, reutilizado | Leitura/renderização de manifestos legados V1. |
| 3 | `corretor/v2/omr/artwork.mjs` | `ae54deee5c53bffc538075ca4ef9b19a9f081824` | `ae54deee5c53bffc538075ca4ef9b19a9f081824` | idêntico, reutilizado | Arte gráfica existente usada na impressão neutra. |
| 4 | `corretor/v2/omr/layout-v2.mjs` | `1a63c9fbac0a04bb55f792add2b202c0cc3e2d0d` | `1a63c9fbac0a04bb55f792add2b202c0cc3e2d0d` | idêntico, reutilizado | Geometria V2 existente. |
| 5 | `corretor/v2/omr/layout.mjs` | `31b1901d1e2a76e9b2e134a8317c3e2378ff998b` | `31b1901d1e2a76e9b2e134a8317c3e2378ff998b` | idêntico, reutilizado | Despacho das versões de geometria. |
| 6 | `corretor/v2/omr/template.mjs` | `d0c0e0a5a061b778a4b92973f0fd3009a1683f30` | `d0c0e0a5a061b778a4b92973f0fd3009a1683f30` | idêntico, reutilizado | Reconstrução e validação do template. |
| 7 | `corretor/v2/omr/manifest.mjs` | `0a83331c35f467fe3e123daf1775010e5f3e9e0b` | `0a83331c35f467fe3e123daf1775010e5f3e9e0b` | idêntico, reutilizado | Importação e vínculo/hash do manifesto histórico. |
| 8 | `corretor/v2/omr/render-v1.mjs` | `b6937214caf1a31d8bb74458e9a9445bd4f1f4a7` | `b6937214caf1a31d8bb74458e9a9445bd4f1f4a7` | idêntico, reutilizado | Impressão de revisões V1 sem alterar o manifesto. |
| 9 | `corretor/v2/omr/render.mjs` | `90667f4dc78ee1f6d071325f4bb3077f431f3bb5` | `90667f4dc78ee1f6d071325f4bb3077f431f3bb5` | idêntico, reutilizado | Impressão/validação dos modelos V1/V2 existentes. |
| 10 | `corretor/v2/assessments/score-format.mjs` | ausente | `6f1b34d68f5406f24f5d40a05b04916c083e54a9` | ausente na main; adicionar | Único helper puro e versão do contrato, compartilhado com frontend #88. |
| 11 | `assessments-service/definition.mjs` | ausente | `f9e3ae756a076c1b09d519bf2d39da3ca34a94b8` | ausente na main; adicionar | Valida definição V2, preferência opcional e projeção de impressão sem gabarito. |
| 12 | `assessments-lab/crypto/crypto-format.js` | `51ade0e2692cdbc6708f7576130c090883ff2c58` | `51ade0e2692cdbc6708f7576130c090883ff2c58` | idêntico, reutilizado | Envelope e JSON canônico criptográfico existente. |
| 13 | `assessments-lab/crypto/key-generation.js` | `673f4fbb4b2204522e88837256c9f5594c026e9a` | `673f4fbb4b2204522e88837256c9f5594c026e9a` | idêntico, reutilizado | Derivação existente do material de cifra. |
| 14 | `assessments-lab/crypto/encryption.js` | `0c82b313c9e8a3a11423463780fcf32faf2d1b06` | `0c82b313c9e8a3a11423463780fcf32faf2d1b06` | idêntico, reutilizado | Cifra autenticada existente da revisão. |
| 15 | `assessments-lab/crypto/decryption.js` | `9e2c1fe6a0c520c5342980bc8808ff1bd15d4f30` | `9e2c1fe6a0c520c5342980bc8808ff1bd15d4f30` | idêntico, reutilizado | Recuperação autenticada existente da revisão. |
| 16 | `assessments-service/crypto.mjs` | ausente | `29220ef7163efefe7fb01facb27e4bfa3a4a621d` | ausente na main; adicionar | Cifra/AAD/HMAC já existentes, sem alteração de formato ou chave. |
| 17 | `assessments-service/worker.mjs` | ausente | `a7a2f0dbe236c338a76d3d1734edb17561bbee6b` | ausente na main; adicionar | Rotas privadas, autorização, catálogo, CAS/recibos/seleções e capability/guarda de downgrade aprovados. |

O guard recomputa os blobs das duas referências Git e confere os arquivos efetivos; o build confronta o grafo esbuild completo (17 inputs), os blobs, SHA-256 e o hash final. Uma alteração no serviço, criptografia ou grafo não passa apenas por editar um caminho. Build equivalente: `e094439ca5c0bfa3dd80307d2aa4c866846c9e05199ec8dd83c6245059b004c2`.

## Contrato e suporte autenticado

Mantém o schema privado V2, cifra, AAD, HMAC, CAS e seis tabelas. `display.scoreDecimals` admite somente inteiro numérico 0/1/2; ausente significa duas casas na apresentação sem inserir ou regravar o campo legado. Valores exatos usam `POINT_SCALE=10000n`; a apresentação não altera unidades, gabarito, manifesto ou hash. O helper de entrada recusa valores editados incompatíveis; valores históricos de quatro casas são preservados.

A capability está no **GET privado /assessments/v1/session**, depois de Auth e principal autorizados: `scoreFormatVersion:"salta-score-format-v1"`. Não é adicionada ao Auth nem a /auth/session. Sem sessão retorna 401; sessão sem principal/grant aplicável é recusada pelo contrato. PUT/GET, cópia, histórico e seleção recuperam a definição exata. Cliente antigo omitindo preferência já explícita recebe 409; reenvio do recibo original permanece válido.

Nenhuma rota, binding, cookie, origem, limitador ou comportamento do Stats é modificado. DELETE/exclusão #81 ficam fora do escopo. O gateway histórico é carregado do Git somente nos testes, com fonte Stats selada e hash de bundle existente `2100592bf4f565388fe23f5ffc2e9675a8b25e4c9ff716eca795f10c0ec5dc74`; não entra no artefato do backend. A fonte antiga do Diário não é corrigida nem republicada aqui.

## Build e testes somente locais

`npm ci --prefix assessments-lab --ignore-scripts --no-audit --no-fund`

`node assessments-service/integrity.mjs`

`node --test assessments-service/tests/build.test.mjs`

`node assessments-service/test-composition.mjs`

`node assessments-service/build.mjs`

O runner extrai o snapshot imutável do frontend #88 para diretório temporário, sobrepõe somente este serviço e usa dependências Node locais. O checkout original e o PR #88 não são editados. Regressões usam UI/cliente/controlador/formatadores do #88; testes novos conectam seu DOM real emulado à implementação Auth/SessionStore e ao backend com SQLite sintético para 0/1/2. Há também gateway + backend + Auth em Workerd/D1 temporário, segunda sessão/reinício, e regressão HTTP do laboratório. Tokens/chaves são criados exclusivamente em memória das fixtures locais, nunca no bundle publicado.

A CI é somente pull_request, contents:read, Node 24, sem credencial Cloudflare, recurso remoto ou comando de deploy/migração. O manifesto diferencia `candidate-not-published` de composição sintética; registra HEAD, proveniência, grafo e hash. Ausência da flag de ambiente é fechada pelo próprio Worker; não há TOML operacional nem recurso/segredo real neste PR. Configuração candidata fechada não equivale à flag efetiva do ambiente.

## Flags efetivas e limites da verificação

A leitura de configurações de 21/11/2026, 17h35 Brasília, confirmou Stats `ad1c79aa-4f42-4861-82db-3470f91d4a77` com `PRIVATE_GATEWAY_ENABLED=true` e backend `0f15f962-09b8-4746-a9d2-f70bacd8b029` com `ENABLE_ASSESSMENTS=true`, ambos a 100%. O backend ativo continua no bundle anterior `7f507c36f5e0eabd1d061f000b607b6560438ab097b64a9bfd317e51b81551a9`, sem a capability nova. Backend direto permanece sem workers.dev/previews.

Essas flags **não foram alteradas**. A consulta usou somente metadados, sem SQL remoto, sessão real, leitura de chave ou dados acadêmicos. Não se presume banco vazio. Evidência saneada fica no relatório local da missão, sem URLs privadas ou identificadores pessoais neste documento. O teste da capability foi feito exclusivamente em ambiente sintético, não por ativação produtiva.

## Integração e reversão futuras

Separar os gates: (1) auditoria do novo HEAD/backend e composição com #88; (2) decisão expressa para integrar a base e o backend; (3) publicação exclusiva de backend compatível e confirmação autenticada da capability, preservando configurações efetivas; (4) autorização/publicação da UI #88; (5) homologação real com dados sintéticos autorizados, Safari/iPhone/segundo dispositivo/impressão. Merge não equivale a deploy; CI verde não autoriza produção. Nenhum desses gates produtivos é executado nesta missão.

**Sem migração D1.** O arquivo 0001 é apenas o schema histórico usado em D1 local e permanece byte a byte igual ao #86. Não executar SQL remoto, criar tabela/índice novo, cadastrar principal/grant, mudar chave ou reconstruir o banco.

Depois de gravar revisões com scoreDecimals, não restaurar a allowlist antiga nem remover campos de históricos. Antes da publicação futura, reservar uma versão fechada do **novo leitor compatível** e os IDs de reversão. Em regressão: fechar primeiro o gateway privado, selecionar o backend fechado compatível, preservar D1/keyring/revisões/seleções/recibos e corrigir para frente. Reconciliar mutações incertas pelo requestId/recibo e impedir sobreposição de deployment concorrente. O backend anterior pode falhar ao listar/abrir revisões novas; usar o rollback antigo da P0-08B-06 cegamente não é seguro. Backup da chave não substitui backup recuperável das avaliações.

Não há migração, deploy, mudança produtiva, exclusão, homologação física nem parecer de aprovação emitido por este implementador. Novo HEAD deve ser encaminhado ao SALTA AUDITOR. Issues #82/#85 permanecem abertas.
