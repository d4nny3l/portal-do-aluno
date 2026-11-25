# CAMERA-FIX-01 — apresentação da câmera do laboratório

Data: 25/11/2026. Base verificada por `git fetch origin main`: `7861007`.
Branch exclusiva: `fix/camera-presentation`.

## Reabertura — CAMERA-JSON-RETURN-02

O teste físico do proprietário confirmou que a publicação anterior **não resolveu
o relato**: no Safari do iPhone, importar o modelo JSON ainda encolhia/deformava a
prévia. O diagnóstico inicial de retângulo desatualizado era reproduzível, porém
não cobria o retorno do seletor nativo nem a transformação interna da camada de
vídeo do WebKit. As seções abaixo documentam historicamente a primeira intervenção.

Investigação da segunda intervenção, baseada na main `0fa1b40`:

- `omr-lab.mjs::bindLocalManifest` importa o modelo, atualiza os textos e pode
  analisar a última foto. Não altera vídeo, stream, resolução, CSS do visor ou lente.
- Faltava retomar a reprodução nos eventos `change`/`cancel` do seletor e no retorno
  de foco. O observador anterior só tratava visibilidade, pageshow e unmute.
  Esses eventos não são equivalentes: um seletor pode devolver o controle sem
  mudar as dimensões do vídeo ou emitir visibilitychange.
- O campo de arquivo herdava fonte de aproximadamente 12,32 px. Foi ajustado para
  pelo menos 16 px em telas móveis, reduzindo o gatilho de zoom por foco do Safari,
  sem bloquear o zoom manual/acessibilidade nem alterar o viewport meta.
- Há relatos no próprio WebKit de vídeo pintado menor/deformado **dentro de caixas
  DOM corretamente dimensionadas**: [266688](https://bugs.webkit.org/show_bug.cgi?id=266688)
  e [259364](https://bugs.webkit.org/show_bug.cgi?id=259364). São evidências de um
  mecanismo compatível, **não prova da causa exata na versão de iOS do proprietário**.

Implementação: somente no WebKit, o vídeo nativo permanece ativo embaixo de um
canvas opaco que recebe o frame inteiro por `drawImage(video,0,0,videoWidth,videoHeight)`.
O bitmap tem as dimensões reais da fonte, sem crop, zoom, filtros ou transformação
de perspectiva. Ele determina a altura do visor e compartilha sua área com o SVG.
Isso remove a camada nativa de vídeo da apresentação visível, em vez de tentar
compensar sua transformação com escala CSS. A detecção e a fotografia continuam
lendo o vídeo original, sem passar pelo novo canvas. Chromium permanece com vídeo
nativo na apresentação.

O ciclo usa `requestVideoFrameCallback` (RAF somente como fallback), uma única
assinatura cancelável, e conserva o último frame válido enquanto o seletor suspende
a fonte. A volta por seleção, cancelamento, foco ou unmute renova a assinatura e
retoma o mesmo elemento/stream quando pausado; não chama getUserMedia novamente.
Ao fechar, remove listeners, cancela o callback e libera o bitmap. O diagnóstico
opcional registra apenas dimensões, modo de apresentação e contagem de frames.

Regressões novas: dois imports reais de um manifesto sintético pelo filechooser
automatizado, JSON inválido, cancelamento simulado e pausa da câmera **sem**
visibilitychange; conferência da retomada sem trocar stream; pixels do canvas
comparados à fonte sintética, bitmap nativo e alinhamento com o SVG. As interrupções
do iOS são simuladas; **o diálogo UIKit e a corrupção interna do compositor não
foram reproduzidos fisicamente neste ambiente**. A versão anterior reprova a
retomada e o tamanho de fonte; a nova passa nesses casos.

Quatro novos testes unitários cobrem o seletor, cópia integral do frame, dimensão
temporariamente zero, cancelamento de sessão, assinatura única e fallback RAF.
Conjunto atual: **371 testes aprovados, 1 TODO preexistente**, mais os três perfis
de navegador (WebKit EDGE, WebKit PRIMARY, Chromium EDGE). A CI também passa a rodar
em push da página paralela, sem depender de PR. O custo adicional do canvas é um
buffer nativo e uma cópia de apresentação por frame; consumo/fluidez no iPhone
precisam ser observados no teste do proprietário. Nenhuma garantia de desempenho
ou de resolução física definitiva é inferida dos ensaios sintéticos.

Homologação objetiva desta rodada: abrir a URL com `v=camera-json-return-02`, abrir
a câmera, importar o JSON e voltar ao visor; repetir cinco vezes, cancelar a seleção,
girar o aparelho e fotografar folhas consecutivas. Confirmar círculos proporcionais,
prévia em movimento, quatro bordas e contorno alinhados. Se persistir, coletar apenas
`cameraPresentation.snapshot('apos-json')` e `cameraPresentation.events` com
`cameraDebug=1` pelo Web Inspector. Não exportar imagens ou dados do cartão.

## Destino autorizado

O proprietário corrigiu expressamente o escopo da missão: atuar somente em
`laboratorio/salta-omr-capture-lab/?engine=edge`, criado com o Pesquisador.
Esta correção **não é da câmera oficial do Corretor**. O runtime alterado fica
inteiramente nesta pasta; a única mudança externa é o workflow de testes do próprio
laboratório. Na entrega inicial, a alteração ficou na branch `fix/camera-presentation`
e no PR #135, sem publicação. Posteriormente, o proprietário autorizou expressamente
a publicação imediata e direta das páginas paralelas, sem PR ou auditoria prévia.
O PR #135 é encerrado sem utilização para integração. O GitHub Pages serve `main`;
a publicação direta leva somente a correção do laboratório e seu suporte de testes,
sem modificar o Corretor oficial.
PR #133 e issue #132 permanecem fora da missão.

## Causa e evidências

1. `js/app.js` definia `viewport.style.aspectRatio` uma única vez após abrir a câmera.
2. O vídeo estava absolutamente posicionado, com largura e altura de 100% desse
   contêiner. `object-fit:contain!important` conservava a imagem inteira, porém a
   encaixava em um retângulo cuja proporção podia ficar desatualizada.
3. A detecção e a foto liam `videoWidth/videoHeight` atuais. A sobreposição SVG,
   com `preserveAspectRatio="none"`, continuava ocupando o retângulo antigo. Os
   cantos suavizados também podiam pertencer à geometria anterior.
4. O commit `90171af` removeu os listeners de `video.resize` e de resize da janela
   ao restaurar o scanner primário. `bc1f5dd` conservou o vídeo em `contain`.
   A ativação EDGE posterior não modificou essa apresentação.

Reprodução controlada com **o mesmo elemento, stream e track**, usando
`canvas.captureStream` e mudança real das dimensões intrínsecas recebidas pelo vídeo.
WebKit, perfil iPhone 13, viewport CSS 390×664:

| Medida | Base: início 1280×720 | Base: fonte mudou para 720×1280 | Correção: fonte 720×1280 |
|---|---:|---:|---:|
| Caixa do vídeo, px CSS | 368×206,125 | 368×206,125 | 368×654,219 |
| Imagem útil calculada por contain, px CSS | 366,444×206,125 | 115,945×206,125 | 367,998×654,219 |
| Texto da resolução | 1280×720 | **1280×720 desatualizado** | 720×1280 |
| Substituições de stream | 0 | 0 | 0 |

**Por que diminuía:** ao mudar de fonte horizontal para vertical, a imagem era
encaixada no retângulo horizontal antigo. A largura útil caiu para cerca de 31,5%
da largura disponível. Isso foi reproduzido em EDGE, PRIMARY e Chromium.

**Por que parecia deformar:** foi demonstrado o desacordo geométrico entre vídeo,
contorno SVG e coordenadas de outro tamanho de frame. O padrão circular no vídeo
permaneceu circular na reprodução: **não foi demonstrada deformação dos pixels
nativos da câmera física**. Reutilizar cantos antigos também permite um recorte de
perspectiva incorreto; a correção invalida esses cantos quando a origem muda.
Não se atribui ao Safari físico uma causa definitiva sem dados desse aparelho.

O teste final completo, executado também sobre uma exportação limpa de `7861007`,
produziu 24 asserções reprovadas por perfil na base e zero após a correção, nos três
perfis. São verificações repetidas de geometria, informação desatualizada,
coordenadas antigas e retomada de vídeo; não são 72 causas independentes.

## Hipóteses examinadas

| Área | Resultado |
|---|---|
| CameraSession oficial | Não é usada neste site. Nenhum arquivo oficial foi alterado. |
| getUserMedia, lente e resolução | Pedidos apenas na abertura e fallback inicial por erro. Não foi encontrada troca de stream durante processamento. Não foi provado qual lente física o iPhone escolhe. |
| applyConstraints | WebKit já evita o pedido opcional de foco. Não há renegociação periódica de resolução no laboratório. Mantido. |
| Dimensão intrínseca vs. renderizada | Divergência reproduzida após mudar a dimensão intrínseca; causa local demonstrada. |
| CSS, ancestrais, Grid/Flex | Três folhas carregadas. Retângulo congelado e vídeo absoluto eram decisivos. Grid altera largura legitimamente no breakpoint; tray e controles não encolheram o vídeo nos ensaios. |
| object-fit/object-position | contain centralizado mantém os pixels proporcionais, mas não corrige um visor com proporção antiga. Removido o conflito cover/contain no estilo específico do laboratório. |
| loadedmetadata/resize/orientação | Espera de metadata existia apenas na abertura; faltava sincronização posterior. Eventos agora atualizam informação/coordenadas, sem escrever largura/altura do visor. |
| VisualViewport e barras do Safari | A área útil não define mais nenhuma altura do vídeo. Resize comum não troca stream nem invalida a detecção quando as dimensões nativas são iguais. Animação real da barra depende do ensaio físico. |
| Assincronismo/ciclo de vida | Observadores são removidos ao fechar; retomada de play é protegida por sessão. RAF cancelado ao fechar e não duplicado em visibilitychange. |
| Processamento óptico | Worker, detectores e classificador permanecem intactos. Layout acompanha o vídeo mesmo com processamento óptico pausado. |
| Compositor WebKit/fonte física | Não comprovados como causa dos pixels deformados. Continuam hipóteses residuais para homologação. |

## Solução e arquivos

- `css/omr-lab.css`: vídeo em fluxo normal com `width:100%`, `height:auto`,
  proporção intrínseca e contain. O visor deriva sua altura do vídeo; SVG ocupa
  exatamente essa mesma área. Sem zoom, crop, limite arbitrário de altura ou resize
  guiado pela barra do navegador.
- `js/camera-presentation.mjs`: observador independente dos algoritmos ópticos,
  metadata/resize/orientação/viewport, retomada do mesmo vídeo após suspensão,
  limpeza de listeners e diagnóstico numérico opcional em memória.
- `js/app.js`: conexão do observador; descarte de coordenadas de origem antiga,
  preservando o objeto de bloqueio do cartão e o estado armed. Guarda adicional
  antes de detecção/foto para eventos resize atrasados. Encerramento consistente
  da apresentação e do único RAF da sessão.
- `index.html`: versão dos dois assets alterados para evitar cache antigo.
- `tests/camera-presentation.test.mjs`: sete testes de geometria, sessão, retorno,
  cancelamento e privacidade do diagnóstico.
- `tests/camera-presentation-browser.mjs`: reprodução e regressão em navegadores reais
  com MediaStream sintética e todos os pedidos externos bloqueados.
- `.github/workflows/test-camera-presentation-lab.yml`: CI exclusiva dos testes,
  sem publicação. Chromium/WebKit instalados apenas no runner; nenhuma dependência
  nova no produto.
- Este relatório e referência no README do laboratório.

Permanecem idênticos à base: `vision.js`, `worker.js`, `experimental-detector.mjs`,
`candidates/`, `card-flow.js`, `paper-geometry.js`, motor OMR, manifestos, gabaritos,
limiares, dez quadros estáveis, suavização 0,45, política de retirada da folha,
SALTA Scan original e câmera oficial. Cloudflare, D1, autenticação e dados reais
não foram acessados ou alterados.

## Testes e resultados

- `node --test corretor/v2/tests/*.test.mjs stats-worker/tests/*.test.mjs plataforma/tests/*.test.mjs`:
  **339 aprovados**.
- `node --test laboratorio/salta-omr-capture-lab/tests/*.test.mjs`:
  **27 aprovados, 1 TODO preexistente** de folha extremamente distante no EDGE.
- Browser: **WebKit EDGE, WebKit PRIMARY e Chromium EDGE aprovados**.
  Cada perfil abre, permanece ativo, muda a origem entre 1280×720, 720×1280,
  1440×1920, 1920×1440 e 640×480; redimensiona a janela entre desktop, paisagem e
  celular; verifica a área do vídeo/SVG e a informação da resolução.
- Cada perfil produz duas fotos manuais pelo Worker e duas automáticas de folhas
  distintas pelo detector real. Confirma ausência de duplicata com a mesma folha,
  não alteração do visor no processamento, quatro marcas coloridas das bordas
  preservadas no JPEG nativo, fechamento e reabertura com novo stream apenas na
  abertura, retomada simulada de visibilitychange e zero erros de página.
- Teste de geometria enquanto a detecção está pausada: apresentação continua a
  acompanhar a origem e não reutiliza cantos da geometria anterior.
- `node --check` de app, observador e runner; `git diff --check`: aprovados.
- Capturas sintéticas antes/depois foram inspecionadas visualmente. Os relatórios
  JSON/screenhots da CI são artefatos de curta retenção; não contêm imagens reais.

Execução do browser (Playwright apenas como ferramenta de teste):

```sh
SALTA_PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs \
SALTA_CAMERA_OUT=/tmp/salta-camera-presentation \
node laboratorio/salta-omr-capture-lab/tests/camera-presentation-browser.mjs
```

Para provar a falha anterior, exportar `7861007` para outra pasta e copiar somente
esse runner de teste para o mesmo caminho nela; executar o comando nessa cópia.
Não precisa de câmera, conta, credenciais nem backend.

## Homologação física obrigatória no iPhone

**Ainda pendente; não bloqueia a publicação experimental autorizada.** Depois de
confirmar a conclusão do build do Pages e os assets `camera-fix-01`, usar a página
pública do laboratório com `?engine=edge&v=camera-fix-01`. O parâmetro `v` sozinho
não publica código: conferir que o HTML e os assets novos foram realmente servidos.

1. Registrar modelo do iPhone, versão exata do iOS/Safari, orientação e commit
   servido pela prévia. Usar folha sintética com círculos, grade e marcas nos
   quatro extremos; nenhuma informação de aluno.
2. Abrir `?engine=edge&cameraDebug=1`. Conferir imagem inteira, círculos redondos e
   contorno do papel alinhado desde a abertura. Não forçar proporção/lente manual.
3. Manter dez minutos de uso, rolar para recolher/expandir a barra do Safari,
   abrir/fechar o teclado em um campo existente e retornar ao visor. A barra não
   deve alterar a largura útil do vídeo quando a fonte e a largura da página
   permanecerem iguais.
4. Fotografar pelo menos dez folhas consecutivas, respeitando a retirada real
   de cada folha. A câmera deve permanecer proporcional durante processamento,
   atualização da bandeja e leitura OMR. Conferir JPEG original e suas quatro
   bordas; separar o resultado de perspectiva da imagem nativa.
5. Girar retrato → paisagem → retrato cinco vezes. Conferir atualização da
   resolução e coincidência entre vídeo, contorno e captura. Mudança legítima de
   proporção da fonte pode mudar a altura do visor; não pode achatá-lo ou criar
   uma faixa de imagem estreita dentro de uma caixa de proporção antiga.
6. Alternar para outro app por 30 segundos e retornar; repetir após bloquear a
   tela. Se o sistema encerrou a track, a interface deve permitir nova abertura;
   se apenas pausou o vídeo, deve retomar a mesma fonte. Não prometer que o iOS
   mantém a câmera viva em segundo plano.
7. Fechar e reabrir cinco vezes, inclusive após girar o aparelho. Verificar que
   não permanecem camadas antigas, reprodução duplicada ou câmera presa.
8. Repetir com `?engine=primary&cameraDebug=1`, no mesmo aparelho e condições.

Se houver defeito, conectar o Web Inspector do Safari no Mac e coletar somente:

```js
JSON.stringify(window.__saltaScan.cameraPresentation.events)
JSON.stringify(window.__saltaScan.cameraPresentation.snapshot('defeito-visivel'))
```

O diagnóstico é desligado por padrão e, quando habilitado por `cameraDebug=1`,
retém no máximo 160 eventos numéricos em memória: dimensões, proporções, fit,
viewport, sessão e estados do vídeo/track. Não grava imagens, IDs de dispositivo,
nomes, modelos privados, tokens ou credenciais. Não transmite nem persiste logs.
Após recarregar a página, os eventos anteriores deixam de estar disponíveis.

## Riscos, aceite, Git e reversão

- A altura agora acompanha a fonte nativa. Um vídeo vertical pode ocupar mais
  altura que a tela; controles continuam acessíveis por rolagem. Essa é uma
  consequência de mostrar a imagem inteira sem crop/zoom.
- Callbacks de mudança real da origem descartam coordenadas anteriores; o próximo
  quadro precisa fornecer uma geometria válida. Não mudam o critério de estabilidade.
- Testes usam WebKit desktop com perfil móvel; visibilitychange/orientationchange
  são simulados. Não homologam compositor, foco, escolha de lente, toolbar,
  teclado ou suspensão real do iPhone, nem acurácia física do OMR.
- Se o vídeo nativo já vier deformado do aparelho, esta correção de apresentação
  não modifica esses pixels. A medição no iPhone é necessária para separar esse caso.
- A falha estrutural reproduzida está corrigida nos ensaios. **Não declarar o
  relato físico definitivamente resolvido antes do roteiro acima.** Auditoria não
  é exigência do proprietário para páginas paralelas.
- Implementação: `30ec60e0aa650f82ab3abc85a9ad149ea3484c19`, branch
  `fix/camera-presentation`. CI aprovada na execução `45609202247`, incluindo os
  três perfis de navegador em Linux. PR #135 encerrado por orientação do proprietário;
  publicação direta autorizada posteriormente, sem gate de auditoria.
- Reversão: reverter o commit desta correção. Não requer migração ou recuperação
  de dados. PRIMARY/EDGE continuam selecionáveis pelos parâmetros existentes.

Referências de contrato: [HTML — dimensões intrínsecas e resize do vídeo](https://html.spec.whatwg.org/multipage/media.html#dom-video-videowidth),
[CSS object-fit](https://www.w3.org/TR/css-images-3/#the-object-fit),
[Media Capture — dimensões e orientação da origem](https://www.w3.org/TR/mediacapture-streams/).
Os relatos externos de bugs do compositor WebKit não foram tratados como prova
da causa deste incidente.
