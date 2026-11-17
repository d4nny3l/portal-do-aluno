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


## Correção P1 após auditoria independente — marcadores falsos em imagens escuras

**Auditoria:** [issue #49](https://github.com/d4nny3l/portal-do-aluno/issues/49), comentário `6933905386`, parecer inicial **REQUER AJUSTES** sobre o HEAD `78ed450ce321ea7373ab62996ad6e2893e2ee4d9`. O Auditor reproduziu três quadros artificiais escuros aceitos pelo fallback apesar de não conterem um cartão A4 verdadeiro.

### Causa e controle implantado

A busca original `components(sample) + chooseQuad()` continua **inalterada na decisão da primeira tentativa**. O percentil 90 ≤110, a exigência da primeira busca ter falhado e a confiança mínima ≥0,75 do fallback também permanecem.

`chooseQuad()` já penalizava o erro de área física `sizeError` no **ranking**, mas a confiança calculada para o fallback ignorava essa penalidade. Agora o candidato **vencedor**, e somente ele, recebe uma validação física independente antes de aceitar a segunda segmentação. O cálculo aproveita a escala local do quadrilátero (distância entre centros adjacentes e área do paralelogramo dos vizinhos). Com os centros de referência **194 × 281 mm** e fiduciais quadradas de **5,5 × 5,5 mm**, a área esperada na imagem é proporcional a `área_local × 5,5² / (194 × 281)`. O formato esperado compara os lados projetados por 194 e 281 mm com a proporção do retângulo segmentado.

A aceitação adicional requer, no candidato vencedor:

- Média de `|ln(área_observada / área_esperada)|` ≤ `ln(1,4)`, aproximadamente 18% de variação linear uniforme.
- Cada fiducial com erro de área ≤ `ln(1,7)`, permitindo variação local mais ampla sob perspectiva e quantização.
- Média de desvio logarítmico do formato projetado ≤ `ln(1,45)`; cada componente ≤ `ln(1,8)`. Os limites de forma são mais amplos para acomodar perspectiva, desfoque e pequenas deformações.

Estes limites **não são universais ou calibrados em iPhone**: são limiares conservadores derivados do tamanho impresso e exercitados pelos testes com **escala 90%, 100% e 110%**, perspectiva oblíqua, sombra, baixa luz e quantização da grade. O detector pode recusar fotografias com deformação maior; isso deve resultar em nova captura/ajuste manual, nunca em aceitação de um canto falso. A validação só ocorre **depois** da busca combinatória, uma vez no quadrilátero vencedor; não se adiciona custo geométrico ao cálculo de todos os candidatos.

### A/B no mesmo raster sintético

| Entrada de 900 × 1000 px | PR #48 auditado (sem gate físico) | Candidato corrigido |
| --- | --- | --- |
| Papel claro ou moderado, fiduciais de escala física coerente | Detecta, primeiro passe | Detecta, primeiro passe idêntico |
| Papel 65/50/45/30, fiduciais coerentes | Detecta em fallback | Detecta em fallback |
| Papel escuro, sombra gradual, escala 90–110% e perspectiva ensaiada | Detecta em fallback | Detecta em fallback |
| Sem cartão, com **4 retângulos de 13 × 9 px** | Aceita falsamente | **Recusa** |
| Sem cartão, com **4 retângulos de 25 × 17 px** | Aceita falsamente | **Recusa** |
| Sem cartão, com **4 retângulos de 41 × 25 px** | Aceita falsamente | **Recusa** |
| Apenas 3 ou menos marcadores, quadro incompleto, distractores impressos isolados | Recusa | Recusa |
| Quadro físico coerente + distractores internos | Detecta | Detecta |

**Correção necessária da fixture anterior:** o teste inicial do PR #48 utilizava como marcador positivo um retângulo de **25 × 17 px**, com os mesmos centros e tamanho do objeto falso independente de 25 × 17 px. Em uma imagem contendo apenas quatro retângulos, esses exemplos são indistinguíveis por geometria. A fixture positiva foi ajustada para a projeção física efetiva de 5,5 mm segundo a distância entre fiduciais; a negativa preservou os **25 × 17 px** auditados. Isto não falsifica evidência: explicita uma contradição das fixtures e torna possível testar a regra geométrica solicitada. Quatro objetos artificiais que imitem **perfeitamente** as fiduciais reais, inclusive área, forma, localização e perspectiva, podem continuar indistinguíveis sem evidência adicional do cartão.

O teste `normalize-low-light.test.mjs` compara as duas regras em **rasters idênticos**, reconstituindo a função anterior ao retirar somente o gate físico da fonte candidata na importação de teste. Não altera a implementação produtiva e não usa fotografias ou dados acadêmicos.

### Desempenho e limites operacionais

A aceitação geométrica adiciona quatro verificações locais **uma vez ao final** do `chooseQuad()`, e não outro passe de segmentação. O benchmark embutido no teste executa em Node.js três medições por cenário, com os mesmos pixels de 900 × 1000 nas versões anterior/candidata, e registra a **mediana** de imagem clara, papel muito escuro e falsos marcadores. O resultado exato deve ser lido na CI do HEAD final; sua variação depende do processador, aquecimento do JIT e carga do runner. **Não extrapolar essa medição ao Safari do iPhone** nem inferir que a captura automática, cujo intervalo é 450 ms, esteja homologada.

Não foram alterados o método de `warpFromFiducials()`, o raster ótico, a identificação de sete dígitos, `reader.mjs`, `camera.mjs`, layouts/manifestos, hashes, gabaritos, notas, revisão humana, interface, Diário, Workers, D1 ou o PR #44.

**Portões restantes:** CI verde no HEAD final, **reauditoria independente somente deste ajuste**, homologação física após autorização da Diretoria e nenhuma integração/deploy nesta missão.
