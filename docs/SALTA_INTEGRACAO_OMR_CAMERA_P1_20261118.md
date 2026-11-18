# SALTA — Registro da integração coordenada OMR + câmera (P1)

## Referências imutáveis
- Base: `main af467942706f3b715c258b23ee9090ba26adaa7d`.
- PR #51 (autonomia óptica): `a0d137c72736f2ae527790173da01e67898c36ee`; parecer independente **APTO**: issue #55, comentário 6975160263.
- PR #54 (câmera automática): `92458149cbd6fb157533d3811d000680b40a10b0`; parecer independente **APTO**: issue #58, comentário 6975229471.
- Branch exclusiva: `integration/salta-omr-camera-p1-20261118`. Nenhuma mudança nos HEADs originais.

## Estratégia de Git
A branch foi criada **a partir de `main`**. A integração usou um **commit merge de dois pais**, primeiro o HEAD auditado do #51, depois o HEAD auditado do #54. Isso torna todos os commits originais ancestrais do candidato, sem cherry-pick que perderia metadados ou mutação das branches originais.

A árvore combinada partiu do HEAD #51 e aplicou os **sete arquivos exclusivos** do #54 diretamente de seus blobs auditados. O único arquivo compartilhado, `plataforma/corretor-v2.html`, foi reconciliado com alterações pontuais e verificadas:

1. Base do HTML: **#54** (captura automática, seleção traseira, fluxo de importação, `#read` oculto, torch, cache da câmera).
2. Substituição somente de `renderAnswers()` pelo **#51** para manter `recognition:'partial'`, nota provisória e edição manual pelo professor.
3. Referência `reader.mjs?v=20261117partial1` do **#51**, mantendo `camera.mjs?v=20261117autocamera1` do **#54**.
4. Preservados `readNormalized()` com bloqueio de carregamento do Banco, `prepareImage()`, `loadPhoto()`, `scanCameraFrame()`, quatro marcadores, nitidez, iluminação e estabilidade; sem recriar botões Fotografar/Ler imagem ou seleção manual.
5. Leitor OMR e testes exclusivos do #51 mantidos byte a byte por origem; módulo de câmera e testes exclusivos do #54 mantidos byte a byte por origem.

## Testes sintéticos cruzados
`plataforma/tests/corretor-omr-camera-cross-integration.test.mjs` usa os **handlers reais extraídos do HTML combinado** em VM com mocks e dados exclusivamente sintéticos:

- **A:** scanner automático alimenta `readNormalized`, reconhece resposta parcial e calcula nota provisória.
- **B:** professor substitui a alternativa e recalcula a nota.
- **C:** importação executa leitura imediata e aceita nova seleção do mesmo arquivo.
- **D:** o flag `#read.disabled` do Banco impede leitura até o carregamento terminar.
- **E:** scanner bloqueia duplicação com a folha presente e aceita o segundo cartão após retirada.
- **F:** contratos de brancos, duplas, marcas conflitantes, código de sete dígitos e manifestos são preservados, além de todas as suítes existentes de OMR/raster/V1/V2.

**Importante:** VM e regressões são testes automatizados sintéticos. A homologação no Safari do iPhone e com cartão físico A4 de 60 questões exige execução real pelo proprietário; os testes não demonstram seleção da lente física ou confiabilidade estatística universal.

## Gate de publicação
Este branch e seu PR são **somente candidatos a auditoria final**. Não realizar merge em `main`, deploy/GitHub Pages, migração, autenticação, Worker, D1, criptografia ou alterações no Diário. Revisão independente deve verificar especificamente o comportamento **combinado** e as alterações desta integração, sem repetir integralmente as auditorias isoladas. Se HEAD mudar após apontamentos, exigir nova verificação do HEAD e CI.
