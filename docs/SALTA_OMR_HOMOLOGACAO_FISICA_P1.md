# SALTA — leitura de marcações humanas parciais (P1)

## Evidência de campo e limite do diagnóstico

O proprietário anexou **duas imagens** de um cartão físico de 60 questões (blocos 1–20 A–D, 21–40 A–E e 41–60 C–E). O código de sete dígitos foi relatado como reconhecido corretamente. Nenhuma imagem original de **raster já normalizado pelo aplicativo** nem o **manifesto JSON exato** da captura foi disponibilizado nesta etapa.

As medidas abaixo foram extraídas **apenas da segunda imagem, uma fotografia/representação em tons de cinza (884 × 1224)**, com centros aproximados de bolhas identificados pelo contorno impresso. Não são scores produzidos pelo leitor no momento do ensaio: podem divergir por redimensionamento, projeção, foco, limiar de normalização e posição relativa das amostras. As imagens não são adicionadas ao repositório por privacidade.

### Diagnóstico observacional (escores aproximados de tinta 0–255)

| Questão | Marcação indicada | Centro: alternativa indicada | Centro: melhor concorrente | Algoritmo antigo aplicado à imagem aproximada | Candidato aplicado à mesma medida | Observação |
| --- | --- | ---: | ---: | --- | --- | --- |
| 11 | Sem marca | — | até 98 | Em branco | Em branco | Controle negativo |
| 15 | A | 200 | 93 | A | A | Falha relatada não reproduzida nesta imagem |
| 26 | D | 183 | 89 | D | D | Falha relatada não reproduzida nesta imagem |
| 29 | B | 166 | 90 | B | B | Falha relatada não reproduzida nesta imagem |
| 41 | E | 131 | 74 | Em branco | **Revisão (E suspeita)** | Preenchimento irregular/sem tinta central suficiente |
| 50 | E | 179 | 80 | E | E | Falha relatada não reproduzida nesta imagem |
| 51 | C | 186 | 89 | C | C | Controle positivo, excesso de tinta |
| 54 | Sem marca | — | até 81 | Em branco | Em branco | Controle negativo |
| 58 | C | 119 | 86 | Em branco | **Revisão (C suspeita)** | Preenchimento parcial com centro claro |

**Atenção:** estas observações dependem de centros aproximados e não constituem validação exata dos seis resultados originais. O fato de 15, 26, 29 e 50 serem reconhecidos na foto anexada indica diferença relevante em relação ao raster original ou ao enquadramento daquele teste. É vedado declarar essas quatro falhas como definitivamente resolvidas sem reproduzi-las com a captura original e manifesto específico.

Na amostra aproximada de 60 linhas, 44 respostas classificadas como *read* pelo algoritmo anterior permaneceram *read* pelo candidato; das 15 linhas antes classificadas como *blank*, 12 passaram a **revisão**, incluindo 41 e 58, e três permaneceram em branco. Uma linha permaneceu ambígua por mais de uma marca. Esses totais **não são métricas de produção nem avaliação de acurácia real**: provêm de centralização estimada e não de labels independentes para todas as respostas.

## Causa-raiz técnica

O leitor original `reader.mjs` baseava a leitura de cada opção numa única **média quadrada central**, usando 42% do raio. Com limiar padrão de pixel escuro 100, a escolha automática exigia média de tinta de pelo menos 155 (255–100). Marcação em anel, risco lateral, tinta azul convertida a cinza ou deslocamento após alinhamento podem ter média insuficiente, mesmo quando há traços evidentes em outras partes internas da bolha.

## Proposta implementada

- **Manter a leitura automática original para marcas fortes:** uma única média central ≥155 e margem confiável em relação às demais.
- **Medir adicionalmente a região circular interna** de até 77% do raio, abaixo do contorno impresso, contabilizando intensidade média e cobertura de tinta. O centro/concorrentes da própria questão são referência relativa: sombra uniforme e letras impressas tendem a afetar alternativas semelhantes.
- Uma alternativa com evidência parcial e contraste interno suficiente é **`review`**, com `answer:null` e `marks` indicando candidato(s) para conferência humana; **nunca é convertida automaticamente em resposta definitiva**.
- Duas alternativas fortes continuam `double`; uma marca forte acompanhada de outra suspeita passa a `review` (não escolher silenciosamente uma só). Marcação com contraste incerto permanece em branco ou revisão, conforme evidência.
- A leitura de identidade de sete dígitos usa **exatamente o código original**: mesmos raios, limiares e coordenadas.
- Identificadores internos de versão, `questionId`, manifesto/hashes, gabaritos e cálculos pedagógicos não foram alterados.

## Reproduzir no mesmo cartão

1. No Corretor já publicado, selecione o **mesmo manifesto JSON exato** vinculado à folha e não recomponha/edite o cartão histórico.
2. Registre os resultados **antigos** para 11, 15, 26, 29, 41, 50, 51, 54, 58 e para as outras linhas antes reconhecidas. Guarde o raster de **tons de cinza já normalizado** pelo mesmo processo, se possível, antes da classificação. Não compartilhe nome, código ou notas reais.
3. Na branch candidata/ambiente de ensaio (não publicado), processe o **mesmo arquivo** com o novo leitor, sem refotografar para a comparação A/B. Inspecione classificação, alternativas suspeitas, margem/confiança e controles em branco.
4. Para diagnóstico offline, com consentimento e arquivos locais, execute `node scripts/diagnose-omr-raster.mjs modelo.json raster.gray largura altura 11,15,26,29,41,50,51,54,58` (8-bit grayscale, 1 byte por pixel, alinhado e sem cabeçalho). A saída contém apenas número da questão, estado e métricas de alternativas: sem identidade, escola, hash ou notas.
5. Repita depois a captura por fotografia em iluminação normal, sombras leves, pouco contraste e marcação parcial; qualquer leitura ambígua deve ir à revisão. Não tornar definitiva nenhuma resposta fraca apenas pelo algoritmo novo.

## Testes e bloqueios

- Testes sintéticos controlados em `corretor/v2/tests/reader-partial-marks.test.mjs`: histórico V1/V2, hashes, código, duplas, parcial, sombras, fraco, controles, atribuições por número.
- A regressão raster existente continua verificando 1–5 colunas, 10–150 questões, ambiguidades e fiduciais. **É preciso confirmar a CI no HEAD definitivo da branch**.
- **Pendências:** comparação exata dos seis casos com o raster original, teste físico com fotos equivalentes, revisão técnica independente e autorização do proprietário para merge/deploy. A aprovação anterior da aparência do cartão não autoriza publicar automaticamente esta alteração do leitor.
