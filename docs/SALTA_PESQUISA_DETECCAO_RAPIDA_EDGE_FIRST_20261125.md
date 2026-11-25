# SALTA — PESQUISA APLICADA DE DETECÇÃO RÁPIDA DA FOLHA (EDGE-FIRST-01)

**Data:** 25/11/2026 (America/Sao_Paulo)  
**Prioridade:** P1 — investigação e protótipo, ainda sem homologação física.  
**Missão vinculada:** [DIRETOR #132](https://github.com/d4nny3l/portal-do-aluno/issues/132).  
**Branch exclusiva:** `experiment/omr-paper-detection-fast-p1-20261125`, originada da `main` SHA `f4621cea08f652fd1a86165c80c288d8d145545b`.  
**Estado:** sem merge, sem deploy, sem alteração na câmera oficial nem no experimento 20/20 aprovado.

## 1. Pergunta e limite do escopo

Como localizar a **folha inteira** mais rapidamente em condições adversas, sem obrigar o professor a ficar procurando iluminação/ângulo/imobilidade perfeitos, **mantendo a câmera própria SALTA e a captura primária estável de uma foto por cartão?**

**Não confundir duas tarefas:** (a) autofocus óptico da lente, sob controle do hardware/Safari, e (b) detecção geométrica da folha no vídeo. Esta investigação modifica somente (b). No Safari iOS não há garantia de controle de foco manual a partir de `getUserMedia`; não alterar `CameraSession` nem tentar uma solução falsa de foco por software. O módulo proposto NÃO abre câmera, NÃO tira fotos, NÃO renderiza HTML e NÃO altera o OCR/OMR oficial.

## 2. Fontes e candidatos pesquisados

| Tecnologia | Evidência verificável | Decisão |
|---|---|---|
| [Scancat — Nipun Batra](https://github.com/nipunbatra/scancat) | Já adotado pela SALTA, JS puro, Canny + Hough + quadrilátero + warp, MIT. No laboratório estável o proprietário relatou 20/20 em ambiente hostil. | **Preservar como baseline**. |
| [@quannqit/doc-scanner](https://github.com/quannqit/doc-scanner) | JS sem OpenCV; combina proposta por cor e por bordas; valida degrau de brilho coerente dentro/fora da folha (não confundir rejuntes e molduras); refinamento local. Declara ~20 ms/360 px em laptop — **afirmação do projeto, não medida SALTA**. | **Adotar somente o princípio de evidência de borda** em implementação própria; não copiar UI/câmera. |
| [OpenCV.js — documentação oficial](https://opencv.org/smart-document-scanning-with-live-ocr-using-opencv-js/) | Pipeline Canny, contornos, homografia e threshold adaptativo para sombras. Mais dependências/memória quando usado na Web. | Não instalar pacote pesado nesta fase. |
| [Scanic Rust/WASM](https://github.com/marquaye/scanic) | Aceleração WASM e ML opcional, MIT. Métricas publicadas de **transformação** não são benchmark da detecção SALTA no iPhone. | Alternativa B, apenas se o candidato leve falhar nas imagens reais. |
| [quadscan](https://github.com/storrealbac/quadscan) | Modelo ONNX DocAligner, WebGPU/WASM, ~4,5 MB de pesos + runtime; MIT/Apache-2.0. Mais custo de inicialização. | Alternativa C, fallback condicional futuro; não usar no preview inteiro agora. |
| [ml-web-scanner](https://github.com/andor83/ml-web-scanner) | Document corner detection ONNX em Web Worker, uso de um frame em voo, captura por estabilidade; MIT/Apache-2.0. | Inspirar política de descartes de quadros, sem importar câmera/UI. |
| [Google ML Kit Document Scanner](https://developers.google.com/ml-kit/vision/doc-scanner/android) | Auto capture e detector de documentos via SDK Android/Play Services. | Incompatível como substituto direto em página estática no Safari. |
| [Apple Vision VNDetectRectanglesRequest](https://developer.apple.com/documentation/vision/vndetectrectanglesrequest) | Detecção nativa de retângulos, controle de proporção/confiança. | Exige integração nativa, não está exposta como API JS para a SALTA web. |
| [W3C Image Capture](https://www.w3.org/TR/image-capture/) e [Dynamsoft (14/07/2026)](https://www.dynamsoft.com/codepool/camera-focus-control-on-web.html) | O conjunto de restrições admite `focusMode` onde disponível, mas o Safari iOS não oferece o mesmo controle fino de foco do Chrome Android. | **Não trocar lente, foco ou zoom da câmera oficial**. |
| [MDN requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) | Entrega callbacks ligados aos quadros reais de vídeo, em vez de polling ligado à frequência da tela. | Ideia de otimização **separada**, sujeita a testes Safari; não faz parte deste patch. |

## 3. Inspeção do código SALTA — gargalos e riscos demonstrados

Código original: `laboratorio/salta-omr-capture-lab/js/vision.js` (Scancat com fallback SALTA), `detectDocument(data,w,h)`:

- Edge detector estilo Canny → Hough orientado por gradiente → busca de melhor quadrilátero sustentado por linhas.
- Quando falha, `paperContrastQuad` tenta localizar componente claro com threshold e rejeições conservadoras.
- O protótipo `PRIMARY STABLE` analisa miniatura de 384 px de largura e exige **10 detecções estáveis** antes da captura; essa política **NÃO É ALTERADA** aqui.
- Em testes sintéticos **sem papel**, linhas de rejunte podem produzir um quadrilátero grande, score alto e falso positivo pelo Hough. A pontuação baseada em suporte de linhas isoladamente não distingue folha real de rejunte.
- Ensaios de normalização global de luminosidade para procurar papel escuro **não melhoraram** os exemplos sintéticos difíceis; às vezes deslocaram os cantos. **Estratégia descartada** como default.
- Tempo do detector depende fortemente da escala de entrada. Este fator foi maior que mudar apenas a janela angular do Hough (12° vs 4°), cuja economia nos exemplos foi pequena.
- **Limite físico:** um cartão demasiado pequeno no sensor continua invisível tanto ao detector rápido quanto ao primário, mesmo após aumentar processamento. Ampliação digital não cria marcas reais para o OMR.

## 4. Candidato isolado: EDGE-FIRST-01

Código: [`laboratorio/salta-omr-capture-lab/candidates/edge-first-01.mjs`](../laboratorio/salta-omr-capture-lab/candidates/edge-first-01.mjs).  
Testes: [`laboratorio/salta-omr-capture-lab/tests/edge-first-01.test.mjs`](../laboratorio/salta-omr-capture-lab/tests/edge-first-01.test.mjs).

1. **Mesma detecção Scancat**, sem substituir o motor que produziu 20/20; apenas usa uma miniatura de **224 px** por padrão, preservando proporção do vídeo.
2. **Verifica quatro bordas reais da folha** após obter o quadrilátero: amostras internas e externas ao contorno; exige diferença espacial e polaridade coerente. Isso rejeita rejunte, moldura/linhas internas e falsos quadriláteros, independentemente da luminosidade absoluta da cena.
3. **Coordenadas retornam na escala original** do buffer de entrada. Não muda câmera, CSS, `getUserMedia`, autofoco, zoom ou formato da fotografia.
4. **Fallback em resolução original** é opcional (`allowFullResolution`) e não ocorre por padrão. Se um agente implementar disparo no futuro, essa segunda tentativa deve ser ocasional, não uma segunda análise pesada em cada quadro sem folha.
5. **Não altera** estabilidade de 10 leituras válidas, antirrepetição, foto única, perspectiva, algoritmo OMR, gabarito, textos ou interface. Módulo NÃO ligado à página nem ao Corretor; apenas código de POC e testes.

## 5. Benchmarks sintéticos pareados (mesmo raster de entrada)

Medições feitas com execução JS de teste (V8 de ferramenta), três execuções por caso, **mediana**. Não é benchmark físico do iPhone, não é promessa de FPS, não houve imagens reais de alunos.

| Cena / folha | Primário 288px | EDGE-FIRST-01 224px | Achado |
|---|---:|---:|---|
| Clara, contraste alto | 125 ms | **99 ms** | Ambos detectam, erro máx. de canto 3,3 vs 4,2 px |
| Bem escura | 125 ms | **98 ms** | Ambos detectam |
| Pouco contraste | 129 ms | **106 ms** | Ambos detectam |
| Inclinada | 110 ms | **93 ms** | Ambos detectam, erro 1,9 vs 3,2 px |
| Piso com linhas, sem papel | 143 ms, **falso positivo** | **115 ms, rejeitado** | Melhor seletividade neste caso |
| Fundo complexo com folha | 136 ms, canto incorreto (máx. 66,7px) | **113 ms, canto ~0,6px** | Melhora aparente no ensaio, ainda não generalizada |
| Folha muito pequena/distante | 117 ms, **não detecta** | 95 ms, **não detecta** | Limite ainda não resolvido |

Há ruído/estampas simples e cenas idealizadas nesses rasters; o cenário de fundo complexo não representa um benchmark padronizado. O custo de reduzir os pixels pode diminuir a precisão dos cantos em ~1–2 px nos exemplos claros, o que precisa ser validado contra OMR real. Não aceitar melhora de tempo à custa de resultados incorretos.

**Regressões do protótipo:** 13 casos de teste, 45 asserções aprovadas no executor JS isolado, incluindo claro, escuro, baixo contraste, inclinado, fundo com linhas, ausência de folha, escala de coordenadas e preservação dos pixels. O caso de folha minúscula foi registrado como `TODO`, não como falha que deve permanecer para sempre.

## 6. Exclusões e gates para uma adoção futura

- **NÃO fazer merge agora.** Este PR deve permanecer `DRAFT` e não tem autorização para deploy.
- Não conectar protótipo à câmera oficial até o Diretor aprovar ensaio controlado.
- Não alterar `plataforma/corretor-v2.html`, `plataforma/corretor-v2.css`, `corretor/v2/omr/camera.mjs` ou `reader.mjs`. Não adicionar texto na UI; o escopo da issue #132 continua prevalecendo.
- Comparar a mesma foto real (não foto nova) pelo primário e candidato, com ângulos, claro/escuro, sombras, distâncias, pisos e papel parcialmente fora de campo; contar canto errado/falso positivo, detecção e tempos.
- Depois, ensaiar sequências de vídeo com **a câmera existente** e o mesmo protocolo de 10 quadros estáveis; medir tempo até aquisição de 1 única fotografia/folha e leitura OMR com alternativa correta conhecida.
- Exigir zero regressões nos testes de OMR (brancos, duplas, parciais, hash, identificação, revisões), testes da câmera, visual e fluxo de importação.
- Se EDGE-FIRST-01 não vencer fisicamente, descartar. Alternativa B é testar um motor WASM/ML apenas em módulo separado, sem substituir a câmera, comparando os mesmos arquivos.
- Preservar licença e atribuição `MIT © 2026 Nipun Batra`.

## 7. Parecer de pesquisa

**Candidato técnico preferencial para A/B físico:** EDGE-FIRST-01, **sem autorização de merge**.

A seleção é por *risco menor* e *evidência sintética promissora*, não por superioridade comprovada no iPhone. A implantação depende de prova real contra a versão PRIMARY STABLE que alcançou 20/20. Não rever sem evidência os limiares conservadores de 10 quadros estáveis e captura única.
