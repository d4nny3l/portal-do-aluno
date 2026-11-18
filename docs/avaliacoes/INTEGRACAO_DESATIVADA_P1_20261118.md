# SALTA — Integração desativada dos PRs #63 e #65

Data: 18/11/2026. Base main: bcae46584a92b683f6e3edf0028f22dc029e7a0b.
Composição sem conflitos: commit de duas linhagens 7dadc6b9f61e7f4f58dc035d364f55f9877939c6; pais HEAD #63 95ae742d206c8ddb5ca5a0b89f9e010f4535dc91 e #65 d6ab0ee9766c526bb0b3f14812320b57b256643c. Os blobs aprovados foram preservados exatamente, sem mudança nas branches originais.

## Estado e barreiras

- PR draft de auditoria, não autorizado para merge, deploy, Pages ou uso real. `ENABLE_PRIVATE_ASSESSMENTS_UI=false` e `AUTHORIZED_PRIVATE_GATEWAY=null` estão fixos na página. Nenhum botão da biblioteca privada é apresentado quando desligada; nenhum endpoint remoto é chamado.
- O backend mantém `ENABLE_ASSESSMENTS` diferente de `true` como HTTP 503 e ainda não possui rota/gateway ativo nem provisionamento de docentes reais. A proposta de gateway em Stats não foi implementada.
- A biblioteca privada do contrato v2 é distinta da biblioteca transitória local e do Banco experimental protegido v1. O modo v1 não migra ciphertext/cofres automaticamente.
- A chave do serviço privado fica sob custódia do servidor; **não é E2EE**. O proprietário precisa aprovar modelo de custódia, recuperação e governança antes de autorizar operação.

## Adaptador e fronteira do contrato

`corretor/v2/assessments/private-contract-adapter.mjs` adapta snapshots locais explicitamente: metadata, manifesto inteiro e exato, `sectionId → blockId`, `valueUnits` em strings inteiras escala 10000, gabarito completo por `questionId` e `display.score`. Valida questão, tipo, seção, número e cobertura sem adicionar respostas ao manifesto. Usa `templateId`, `revision` e `contentHash` apenas para validar a geometria; revisão da avaliação é o campo `record.revision` confirmado pelo backend.

O inverso reconstrói o mesmo plano racional do registro privado recuperado e recusa hash/valor/cobertura/tipo inválidos. `pinnedSelection()` exige `{selectionId,assessmentId,revision,manifestHash}` consistentes com uma revisão **issued** e nunca presume que duas geometrias iguais são a mesma prova.

## Cliente, biblioteca e estados

`private-client.mjs` só pode ser construído habilitado com URL de gateway **expressamente configurada e aprovada**. Não fornece URL de produção, chave, login alternativo ou header de identidade. Usa `credentials: include`, `cache: no-store`, `redirect: error`, sem tokens manuais.

`private-library.mjs` mantém estado rascunho/carregando/salvando/salvo/falha/conflito/indisponível, consulta sessão/grants, lista e filtra avaliações por escopo, abre revisão, consulta histórico, duplica, arquiva, emite uma nova revisão (CAS), e permite seleção fixa após confirmação explícita do lote. O sucesso exige recibo coerente e GET da revisão exata; não se declara salvo em 201 isolado. Erros de rede, 503 e 409 deixam a operação original pendente. `retry` reenviará o mesmo objeto/corpo/`requestId`; nenhuma operação de outra sessão/turma será reaplicada no contexto atual. Trocas de contexto descartam resultados de consultas antigas.

`private-ui.mjs` prepara controles de biblioteca em pt-BR apenas para execução sintética explicitamente habilitada e com cliente injetado. `plataforma/corretor-v2.html` registra os callbacks da ponte, mas a condição constante falsa torna a nova interface inacessível e sem tráfego. A seleção remota, quando autorizada em outro gate, deve fixar gabarito, modelo, pontuação e hash recuperados; a impressão física ainda exige exportação com binding explícito e supervisão do professor. Não reutilizar download local como comprovante de revisão remota sem o registro de binding.

## Faltas deliberadas e dependências CODEX SALTA

1. Definir e auditar gateway de menor privilégio no host Stats, com CORS exato, credenciais e roteamento ao binding privado; proteger `OPTIONS`, session/Auth, grants e controles de origem. Não conectar em produção nesta etapa.
2. Aprovar provisioning/revogação real de docentes e grants, política de auditoria/logs sem gabarito, custódia de chaves no servidor, armazenamento/backup/rotação/recuperação e não-E2EE.
3. Homologar exportação de SVG/PNG/JPG/PDF com binding imutável `(assessmentId, revision, manifestHash)` no pacote/registro sem respostas certas; imagem avulsa desprovida de binding não identifica avaliação automaticamente.
4. Validar em navegador autenticado, Safari iPhone, desktop/mobile e sessão real autorizada; conferir físicas A4 de 60 itens. Testes sintéticos não equivalem a uso real.

## Ensaios sintéticos

- `assessments-service/tests/private-bridge.integration.test.mjs`: adaptador v2 contra validador do serviço, Auth Worker real e D1 local em memória, dois atores, concessões, PUT CAS, abertura histórica, emissão, retry idempotente, 401/403/404/409/503, seleção fixa, cópia, arquivo e impressão sem gabarito.
- `plataforma/tests/corretor-private-ui-disabled-p1.test.mjs`: condição desativada no HTML, isolamento do Banco legado e controlador da UI sintética com estados e confirmação.
- Suítes anteriores de Corretor, Banco, Auth, geometria e raster devem passar no HEAD integrado. Nenhuma execução remota de D1, gateway ou Worker foi realizada.

## Reversão

Descartar o PR/branch de integração preserva main, PRs #63/#65 e todos os serviços. Não existe migração remota ou dado real novo a restaurar.
