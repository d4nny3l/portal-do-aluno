# P1-85 — contrato persistente do formato da nota

Candidata local/PR, sem autorização de merge ou publicação. Issue #85; UX-79C/#82. PR #84 (catálogo/ícones) e exclusão #81 permanecem separados.

## Diagnóstico e base

O backend do PR #74 (`7080d2de0b5a01bbe417b71732221a869e7a4d42`) admite somente `display:{score}` pela allowlist de `assessments-service/definition.mjs`. A definição integral já é cifrada/autenticada em cada revisão D1; duplicação e seleção recuperam essa definição, com recibos HMAC e CAS. Portanto não é necessário criar tabela, coluna, nova chave ou rota para a preferência.

A main consultada, `5865dfc43efeada4effa2c8a96a3543794a6ff7f`, ainda não contém o código do backend. Esta branch é derivada do #74 e o PR deve mirá-lo: o diff mostra somente a candidata #85, sem integrar ou modificar a branch original. Os três módulos compartilhados afetados (`block-scoring`, `private-contract-adapter` e o novo `score-format`) podem ser incorporados pelo Executor em sua branch própria sobre a main; os dois módulos preexistentes eram idênticos entre main e #74. Não copiar páginas/controladores antigos do #74 para a main nem substituir o trabalho do #84.

## Extensão compatível V2

Contrato de apresentação identificado como `salta-score-format-v1`, mantendo `schemaVersion:"salta-assessment-definition-v2"`:

```json
{"display":{"score":"both","scoreDecimals":0}}
```

- `score` continua `final|blocks|both`.
- `scoreDecimals`, se presente, é **número inteiro 0, 1 ou 2**; strings, null, booleanos, frações, campos desconhecidos e valores fora do intervalo são recusados com 400.
- Campo ausente significa **duas casas na apresentação**. Não é inserido no objeto recuperado/validado nem regravado automaticamente. JSON legado, manifestos e recibos continuam iguais.
- Está na definição privada cifrada, nunca no manifesto geométrico, URL, cache público, localStorage ou SVG/PNG/JPG/PDF de impressão.
- GET privado `/session` acrescenta `scoreFormatVersion:"salta-score-format-v1"` somente depois da autorização normal. A ausência desse sinal em um backend anterior impede o frontend novo de oferecer persistência do seletor; não é um novo login ou endpoint.

| Operação | Comportamento |
| --- | --- |
| PUT revisão nova | Valida e cifra a preferência junto da definição, com a transação/recibo existentes. |
| GET atual ou histórico | Recupera exatamente a preferência da revisão, mantendo ausência em legados. |
| Duplicação | Clona a definição da revisão selecionada; a cópia pode alterar a preferência em revisão posterior. |
| Seleção/retomada de correção | Reconstrói `plan.scoreDecimals` a partir da revisão fixada; editar a avaliação atual não muda a seleção histórica. |
| Replay | O corpo original já inclui a preferência no MAC; mesma solicitação continua idempotente. Reutilizar requestId com outra preferência retorna 409. |
| Histórico resumido/recibo/listagem | Não precisam expor a definição nem receber novos campos; a preferência é recuperada pelo GET da revisão vinculada. |
| Cliente antigo omitindo preferência já explícita | Novo PUT retorna 409 `score_format_required`, sem escrever. A escolha não pode desaparecer silenciosamente. Enviar `scoreDecimals:2` explicitamente é permitido. |

Novas avaliações criadas por cliente antigo ainda podem omitir o campo (padrão 2). Revisões legadas continuam editáveis nesse formato enquanto não tiverem preferência explícita. O replay de um recibo legado continua válido mesmo após uma revisão posterior escolher um formato.

## Aritmética e entradas

`POINT_SCALE=10000n`, strings `valueUnits/totalUnits`, pesos iguais por bloco, acertos, gabaritos e soma racional permanecem inalterados. O arredondamento continua half up determinístico em BigInt e ocorre somente na geração do texto. `10/3` produz `3`, `3,3` ou `3,33`. O total é formatado a partir da soma racional original, nunca da soma dos textos arredondados dos blocos. Os subtotais exibidos podem não somar visualmente ao total arredondado; isso não autoriza modificar a nota exata.

APIs compartilhadas:

```js
import {formatScore,scoreDecimals} from './score-format.mjs';
import {POINT_SCALE,scoreInputUnits,createIntegratedPlan} from './block-scoring.mjs';
const precision = scoreDecimals(plan.scoreDecimals); // ausente -> 2
const maximum = formatScore(BigInt(plan.totalUnits), POINT_SCALE, precision);
const editedUnits = scoreInputUnits('1,2', 1); // "12000"; '1,21' é recusado
```

`formatScore(n,d,places)` é exclusivo de apresentação (0/1/2). `formatExact` mantém a API anterior, inclusive quatro casas, para transporte/serialização sem perda; não deve ser usado como política visual. `draftSummary({...,scoreDecimals})` e `scoreIntegratedPlan(plan,...)` já utilizam a preferência. `createIntegratedPlan({...,scoreDecimals})` e os adaptadores preservam o campo opcional.

**Separar entrada nova de valor recuperado:** `scoreInputUnits` valida valores digitados/editados sem truncamento; zeros adicionais sem significado são aceitos (`1,2000` é compatível com uma casa). Um valor histórico exato, por exemplo `12345` unidades, não deve ser reanalisado a partir de um texto arredondado. O domínio persistente mantém até quatro casas exatas independentemente da apresentação: mudar apenas a preferência nunca converte `1,2345` em `1`, `1,2` ou `1,23` no banco. A UI deve manter unidades originais em estado separado e aplicar o validador de entrada somente ao campo efetivamente editado. A validação da definição não impõe quantização destrutiva a valores históricos.

## Entrega necessária ao SALTA EXECUTOR

A candidata NÃO acrescenta seletor nas páginas: a conexão DOM pertence à etapa frontend solicitada, depois da auditoria/coordenação do backend. Não ativar seletor fictício contra o backend atual.

1. Após sessão privada reconhecida e suporte `scoreFormatVersion` confirmado, criar um único seletor **Criar avaliação → Questões e organização → Formato da nota**, opções visuais exatas **10**, **10,0**, **10,00** (valores internos 0, 1, 2). Nenhum texto sobre número de casas nas demais telas.
2. Guardar preferência no estado da avaliação, passar a `createIntegratedPlan`, `draftSummary`, `definitionFromLocalPlan` e operações privadas originais. Reabrir/duplicar restaura a preferência da definição; legado sem campo apresenta 2, sem autosave.
3. Usar `scoreInputUnits` nos valores novos/editados de blocos. Manter unidades exatas recuperadas separadas da representação dos inputs; não reconstruir definição com notas de apresentação. Mudar formato não altera gabarito, valores, manifesto, ID/revisão geométrica ou seleção em andamento.
4. Centralizar TODAS as saídas em `formatScore`: valores de blocos, totais, `draftSummary`, eventual `scoreForInput`, `scanMaxScore`, prévia, correção tradicional e privada, notas por bloco, resultado e histórico. Para a nota tradicional usar a razão exata de acertos e máximo; não introduzir `toFixed` ou conversão intermediária de valores persistidos em Number. `scoreIntegratedPlan` já formata as razões exatas pela preferência da seleção.
5. Nos inputs HTML numéricos, respeitar a serialização com ponto exigida pelo elemento sem alterar a precisão/valor no estado; texto visível de nota usa vírgula e zeros finais pt-BR. Não salvar o texto arredondado mostrado no máximo como novo valor acadêmico.
6. Ao abrir/editar outra avaliação, invalidar estado visual antigo conforme geração, sessão/grant/escopo e erro 401/403. Nada de cache durável de gabarito ou preferências como fonte da verdade. Após erro não mostrar Salvo nem trocar a preferência da avaliação anterior.
7. Testar integralmente o DOM no frontend atual da main, desktop/mobile e todos os pontos acima. O contrato já cobre escore/recuperação; isso não substitui QA dos campos, scanner/histórico e UI do Executor. PR próprio, separado do #84; não alterar câmera/OMR nem exclusão #81.

## Contraprovas e integridade do build

`assessments-service/tests/score-format.test.mjs` cobre 0/1/2, rejeições, JSON/adapter roundtrip, ausência legada, half up/zeros/1/3, valores exatos de quatro casas, validação de entrada, impressão neutra, persistência SQLite, duplicação, CAS, replay/MAC, histórico e seleção, 401/403/404 e cifra.

`private-pilot/tests/pilot.integration.mjs` executa gateway + backend + Auth/SessionStore originais em Workerd/D1 temporário: A formato 0, B formato 1, A/revisão 2 formato 2; segunda sessão e reinício recuperam cada preferência, e a seleção de A/revisão 1 continua com formato 0. Limitadores, revogação, isolamento e recuperação existentes continuam testados. Nenhum fixture de teste entra no bundle.

O build anterior rejeitava qualquer delta de backend. O allowlist do candidato nomeia somente cinco arquivos de runtime e os testes/documento/CI relacionados. O Worker só admite as inserções textuais declaradas: suporte de versão na sessão e recusa de downgrade. Demais bytes do serviço continuam comparados à base. Stats/Auth/Diário/OMR, migrações e workflows de deploy continuam bloqueados. O manifesto de build identifica `contractCandidate:{issue:85,base:"7080d2d...",audited:false}` e hashes dos inputs; não afirma que o novo backend já foi auditado. As configurações geradas continuam fechadas, sem deploy automático.

## Publicação futura e riscos — NÃO executar nesta missão

1. Auditor independente deve revisar este HEAD exato: allowlist, aritmética/entradas, dados legados e recibos, guarda de clientes antigos, seleção histórica, cifra/privacidade, delta de build e testes.
2. Diretoria aprova separadamente integração do código, publicação do backend e conexão/publicação frontend. O PR é empilhado sobre #74 por causa do backend ausente na main; não fazer merge automático do #74 ou retarget para main arrastando o piloto completo. A integração futura pode promover somente os commits/arquivos autorizados, com CI conjunta.
3. Backend compatível primeiro, preservando flags/bindings/chaves/D1/Origin efetivos; reconferir o sinal de suporte autenticado. Só depois liberar a UI nova. Gateway/rotas/Auth não precisam de modificação: a definição já atravessa o corpo opaco do PUT. O bundle do gateway não deve ser republicado junto por conveniência.
4. **Nenhuma migração D1 é necessária.** Mesma cifra, AAD, chave, recibos, revisão e tabelas; nenhuma atualização massiva de dados. Preferência explícita passa a existir apenas nas revisões criadas sob o novo contrato.
5. **Rollback após novas revisões:** o backend anterior tem allowlist que rejeita o campo novo, inclusive ao ler/listar definições cifradas. Não restaurá-lo cegamente depois que registros com preferência forem gravados. Desativar gateway/backend por flags preservando os dados, e corrigir para frente mantendo o leitor compatível; downgrade de código só após comprovar ausência de definições novas, em operação autorizada. Nunca remover campos de revisões históricas ou apagar recibos para contornar incompatibilidade.
6. Legados de quatro casas merecem atenção no frontend: formatar entrada e depois salvar seu texto destruiria precisão. A guarda de servidor também faz clientes antigos exibirem 409 em vez de apagar a preferência. Ambos são critérios obrigatórios da auditoria/QA.

Não se declara funcionalidade entregue em produção: contrato, backend e helpers são candidatos funcionais; UI final, auditoria, homologação real e autorizações de integração/publicação permanecem pendentes. Não encerrar a issue #85 antes dessas etapas.
