# SALTA — baixa luminosidade: diagnóstico incremental do Corretor

**Base:** `main` com PR #45 publicado em `f355d52187f1e797ddd912290af8a8581d744a6b`.
**Status:** proposta incremental de código, não publicada e ainda sujeita a revisão. Sem fotografias reais ou dados acadêmicos no repositório.

## Causas distintas encontradas

1. **Câmera:** `corretor/v2/omr/camera.mjs` solicita câmera traseira, tenta controles de exposição/foco apenas se o navegador declarar suporte, e o capturador automático requer qualidade com confiança dos quatro marcadores ≥0,7, brilho do papel ≥95, contraste ≥35, foco e estabilidade. O suporte de exposição/torch no Safari do iPhone depende da câmera/versão. Nenhum desses controles foi alterado neste PR.
2. **Detecção de marcadores:** `corretor/v2/omr/normalize.mjs` usa Otsu +18 com **piso 65** para segmentação das quatro fiduciais. Num cartão sintético com papel abaixo de 65 (ex.: 50) e marcas com valor 5, esse piso classifica também o papel inteiro como escuro, funde componentes e a detecção falha.
3. **Normalização:** os quatro pontos alimentam a homografia e o redimensionamento bilinear. Não houve evidência de erro geométrico nessa transformação; coordenadas e píxeis são mantidos.
4. **Classificação de respostas:** `reader.mjs` preserva a média central absoluta para respostas definitivas e o fluxo de revisão do PR #45. Em fotos muito escuras, **reconhecer os marcadores não garante reconhecer corretamente as bolhas**; a captura automática pode continuar recusando e a revisão continua obrigatória.

## Correção proposta nesta etapa

- Manter a detecção e limiar originais como **primeira tentativa**. Somente em caso de fracasso e foto cujo percentil 90 de luminosidade esteja no máximo 110, calcular um limiar alternativo conservador baseado na intensidade do fundo.
- Reexecutar **somente** a localização dos quatro marcadores. A alternativa precisa alcançar confiança geométrica ≥0,75 (mais rígida que o mínimo normal ≥0,62). Se falhar, continuar recusando a leitura.
- Não modificar o raster original, a homografia, a posição dos marcadores, as bolhas, as alternativas, o código de sete dígitos, gabaritos, revisão, `contentHash`, manifestos V1/V2, Worker ou D1.
- A propriedade interna `lightingFallback` informa se a segunda tentativa foi necessária. Não há novo sufixo de versão na interface.

## Ensaios A/B sintéticos (900 × 1000 px; mesma quadrícula e marcadores)

| Tipo de imagem | Antes | Candidato |
| --- | --- | --- |
| Papel claro: 255, 180, 120 e 90 | 4 marcadores | 4 marcadores, sem fallback |
| Papel escuro: 65, 50, 45 e 30 | Não localiza | Localiza, sem alterar raster |
| Sombra gradual: papel inicial 45, 50, 60 e 75; variação de +15 | Não localiza | Localiza, com geometria válida |
| Sem marcação / apenas três marcadores | Recusa | Continua recusando |

Os 4 testes novos e os 12 testes existentes de `normalize.test.mjs` passaram na execução local; a suíte Corretor local completa passou com 90/90 testes. É necessária a CI do HEAD definitivo da branch.

## Limitações que exigem nova etapa, separada e auditada

Este PR **não resolve por si só** a restrição de brilho do capturador automático nem recupera a classificação de bolhas sob iluminação irregular. Uma correção subsequente deverá usar imagens reais e sintéticas com mesmo manifesto para testar ganho de contraste/exposição **sem transformar fundo escuro, letras ou contornos em respostas automáticas**. Não reduzir globalmente o limiar `readRaster` nem alterar os identificadores ópticos.

**Homologação física:** proprietário deve testar no mesmo cartão A4, com iluminação normal, moderada, reduzida e sombra, anotando (a) quatro marcadores detectados, (b) câmera permitiu captura, (c) quais respostas ficaram `read`, `blank`, `double` e `review`, (d) código de sete dígitos. Uma melhora de localização não equivale a nota correta.

**Publicação:** manter PR em draft até revisão proporcional ao risco, CI verde e confirmação da Diretoria. A homologação do PR #45 e o merge já realizado não aprovam automaticamente esta nova mudança.
