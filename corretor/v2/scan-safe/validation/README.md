# Contraprovas ópticas offline — SCAN-INTEGRATION-01

Este diretório é um instrumento de validação sintética local. Não é importado pela interface e não realiza rede, correção acadêmica ou leitura de dados de estudantes. Os SVGs são produzidos pelo renderizador oficial, com código fictício `0001123`, textos sintéticos e rótulos conhecidos. Fonte congelada, leitor e normalizador permanecem intactos.

**O gate G3 está bloqueado.** Nos casos `shadow-AB-110`, `shadow-AB-130` e `shadow-AB-150`, a verdade é A+B. A fotografia sintética sombreada é classificada `double` pelo caminho source; o caminho único Scanner gray retorna `read A`. O `reconcile` congelado impede a resposta definitiva e retorna revisão. Isso demonstra perda de uma proteção do consenso nas contraprovas conhecidas. Não alterar limiares ou reintroduzir duas leituras na interface para contornar a decisão sem autorização.

## Executar

```sh
node --expose-gc corretor/v2/scan-safe/validation/run-optical-validation.mjs
node --expose-gc corretor/v2/scan-safe/validation/run-candidate-validation.mjs
node --test corretor/v2/scan-safe/tests/offline-optical-validation.test.mjs
```

A geração precisa de Sharp instalado localmente; o ensaio procura o módulo disponível no runtime Codex ou o caminho definido em `SALTA_SHARP_MODULE`. Não instala dependências nem baixa imagens. Os testes usam Node e os rasters RGBA sintéticos compactados já gravados, dispensando Sharp em CI. Os PNGs permitem inspeção visual da mesma entrada e o SHA-256 prova correspondência ao raster rotulado.

## Contrato de comparação

`offline-optical.mjs` importa o Worker real do laboratório congelado, que produz `optical.source` e `optical.rectified` da mesma foto. Extrai literalmente a função interna `candidateRead` de `omr-lab.mjs` e injeta as mesmas funções `detectFiducials`, `warpFromFiducials` e `readRaster`. Aplica `reconcile` original somente offline. Os hashes das sete fontes ficam registrados para detectar mudança de referência. O caminho candidato é exclusivamente `rectified`, sem seleção por confiança ou gabarito.

`corpus-labels.json` contém parâmetros, modelos, hashes dos pixels e verdade por questão. `optical-evidence.json` contém cada saída dos dois leitores e consenso, diferenças, contagens e benchmark. Inclui V1, V2, quadro incorporado, 10/20/60/100/150, A-D/A-E/C-E e identificação ilegível. O contrato atual do gerador é uma página; não há alegação de cobertura multipágina.

FP/FN são contagens de alternativas marcadas: FP é alternativa prevista sem marca na verdade; FN é marca verdadeira ausente de `marks`, inclusive quando a leitura está indisponível. `incorrectDefinitiveAnswers` conta uma alternativa única errada ou uma escolha única em dupla/branco; `incorrectDefinitiveBlanks` conta marca verdadeira convertida em branco. `review` e `unavailable` são separados. `answerCoverage` é respostas únicas corretas divididas pelo total de questões com uma marca verdadeira; `definitiveAnswerPrecision` usa somente respostas `read` como denominador. `correctClassifications` exige estado, resposta e conjunto de marcas exatos; o complemento inclui abstenção e não deve ser descrito como taxa de resposta errada. Questões em branco compõem grande parte da amostra; acertos em branco não são usados para inflar precisão de respostas.

## Limites de desempenho e homologação

O benchmark mede 100 cartões sintéticos consecutivos com quatro rasters repetidos, alternando ordem de medição single/dual na mesma máquina. Mede processamento até a leitura óptica, sem captura, câmera, tela ou cálculo de nota. O Worker congelado ainda produz os dois rasters em ambas as medições; single apenas remove a normalização/leitura source e `reconcile`. Não é um benchmark do novo Worker de produção. Memória é RSS/heap/external/ArrayBuffers do processo Node, amostrada por cartão; pico transitório entre amostras pode ser maior. O histórico de imagens não é acumulado; a medição não prova retenção oficial nem ausência de vazamentos em navegador.

`candidate-evidence.json` acrescenta a comparação com a API `processCapture` coordenada em `processor.mjs`: 100 pares sequenciais, três rasters sintéticos repetidos, ordem alternada e SHA-256 do processador. Esse segundo ensaio mede o processador novo real contra o Worker e consenso congelados nas mesmas condições. Os três fixtures também exigem igualdade exata do resultado óptico e uma chamada ao leitor; o caso sombreado continua bloqueando G3. Não inclui transporte Worker, aquisição da câmera nem apresentação da nota.

Não foram medidos iPhone, Safari, sensores, congelamentos da prévia, temperatura ou materiais físicos. A busca das fixtures versionadas identificou testes e JSONs geométricos e screenshots de interface, sem corpus físico rotulado elegível; nenhum screenshot potencialmente pessoal foi aberto ou reutilizado. Não há dado enviado a terceiros. Nenhuma taxa deste corpus pode ser anunciada como acurácia física ou homologação universal.

## G3 — replay incremental (OPTICAL-GUARD-01)

O histórico acima e `optical-evidence.json`/`candidate-evidence.json` continuam sendo a evidência do defeito anterior, não do candidato corrigido. O novo `run-g3-validation.mjs` reconstitui os 46 rasters com Sharp, exige hash idêntico ao original, compara a API anterior e a candidata com o consenso congelado apenas offline e grava `tmp/scan-g3-evidence/report.json`. Inclui fiduciais removidos/pequenos/deslocados V1/V2/embedded e manual, FP/FN/review/indisponibilidade, 100 pares de latência e memória. Divergências de rasterização ou de cobertura bloqueiam o gate; não sobrescrever histórico. A CI fornece a execução vinculada ao SHA.
