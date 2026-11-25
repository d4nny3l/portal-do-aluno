# SALTA — Laboratório de captura Scanner × OMR

## Acesso
`https://d4nny3l.github.io/portal-do-aluno/laboratorio/salta-omr-capture-lab/`

## ESTADO VIGENTE — PAPER-TURBO-01 (24/11/2026)

**Captura automática voltou à detecção de contorno da FOLHA.** A tentativa anterior de usar os quatro marcadores como condição de disparo (FIDUCIAL-01, documentada abaixo como histórico) foi desativada após teste físico do proprietário, por ser lenta e menos fluida. Os cartões incorporados em provas foram **adiados** por decisão do proprietário.

Este laboratório permanece independente de `laboratorio/salta-scan/`; o scanner original não foi alterado.

### Política de captura vigente

- **Detecção leve:** `V.detectDocument` na prévia reduzida a 384 px de largura, com intervalo-alvo de 66 ms. Mantém a detecção de folhas sobre mesas/pisos difíceis e o fallback de contraste existente do motor Scancat SALTA. É a configuração de tentativas, não uma promessa de 15 FPS reais no iPhone.
- **Folha distante:** quando a busca rápida falha repetidamente, uma tentativa ocasional a 512 px procura um retângulo menor. Não redimensiona nem simula resolução na fotografia final.
- **Movimento moderado:** `shouldCapture` considera sequência de contornos válidos, estabilidade adaptativa, suporte e nitidez. Pode disparar após dois contornos confiáveis; para movimento forte, exige evidências adicionais. Não fotografa se o contorno está ausente ou inconsistente.
- **Seleção condicional:** o primeiro quadro é sempre fotografado em pixels nativos do vídeo. Quando a nitidez ou exposição parece baixa *e* existe estabilidade mínima, aguarda no máximo uma oportunidade curta (~2 quadros de animação, com timeout 115 ms), redetecta a folha e compara uma segunda fotografia real. Mantém o primeiro quadro se a posição mudou demais ou a segunda foto não melhorou significativamente.
- **Mesmo pixel, mesma geometria:** a foto JPEG de origem e o tratamento recebem o buffer escolhido e os cantos correspondentes. Nunca escolhe o quadro de outra perspectiva sem recalcular os cantos.
- **Mão tremendo:** a captura pode ocorrer sem `stable` positivo se há contorno repetidamente consistente, boa confiança e suficiente informação de bordas. Não promete corrigir desfoque óptico irreversível.
- **Privacidade:** nitidez, captura e warp acontecem localmente, sem upload de fotografia. O contato com a biblioteca privada segue somente consultas de leitura da avaliação autorizada.
- **Próxima folha:** só rearma após a folha desaparecer em vários ciclos, sem espera fixa adicional para quem troca de página rapidamente.

### Limitações e validação

- Seleção de foco é **relativa entre dois quadros**, não calibração ótica absoluta. Não gera texto/bolhas ausentes; respostas duplas ou inconclusivas continuam para revisão.
- Melhor captura à distância depende da resolução óptica real da lente, iluminação, tamanho impresso e foco oferecido pelo navegador.
- Regressões de política e blur em `tests/paper-turbo.test.mjs`: nove asserções passaram em execução isolada; casos de capture e estado foram simulados. **Homologação física no Safari/iPhone continua pendente**.
- O leitor oficial mantém `detectFiducials → warpFromFiducials → readRaster` **depois da fotografia**, independentemente de como a folha foi capturada. Isto não é busca dos marcadores como gatilho da câmera.

## Arquitetura e isolamento

- Snapshot inicial da interface e do motor do `laboratorio/salta-scan/`, depois aprimorado **somente nesta pasta**. O scanner original **não foi alterado**.
- `js/vision.js` detecta o papel e corrige perspectiva; `js/worker.js` aplica o tratamento; `js/app.js` adiciona captura adaptativa, seleção de nitidez e eventos locais de página pronta.
- `omr-lab.mjs` importa **os módulos oficiais da SALTA** de `../../corretor/v2/omr/{manifest,normalize,reader}.mjs`, além de `block-scoring.mjs` e do cliente privado de avaliações, sem cópias nem bifurcações do algoritmo.
- A digitalização, os arquivos e as leituras permanecem na memória do navegador.
- A URL do gateway é idêntica à usada pelo Corretor, `/assessments/v1`, com `credentials: include` e sem gravações. O laboratório **somente** chama GET em session, grants, list, history e open.
- Nenhum `POST`, `PUT`, alteração de Nota/Diário, migração, impressão ou salvamento automático; não chama a API de seleção privada, que faz escrita. Nenhum gabarito, cookie, nome ou código estudantil é enviado à página pública.

## Modelo de prova de Bloco de Matemática

A prova pode ser cadastrada em avaliações privadas: não existe um único manifesto/gabarito público e estático com esse nome. O laboratório:

1. Solicita conexão com a sessão autorizada do professor.
2. Mostra os contextos turma/período concedidos.
3. Lista avaliações, com destaque e pré-seleção quando **exatamente uma** coincidir com Matemática e Bloco.
4. Recupera apenas revisões `issued`, exige revisão escolhida e uma confirmação humana para vincular o cartão físico.
5. Valida o registro e manifesto pela função oficial `planFromPrivateRecord` e checa `manifestHash`.
6. Para uso sem conexão, aceita manifesto JSON exato exportado pelo Corretor (não fornece gabarito nem nota).

Se não houver prova coincidente, **não inventa** avaliação ou chave. Se um registro estiver em rascunho, não pode ser vinculado como revisão emitida.

## A/B controlado por captura

Um único evento de captura entrega dois caminhos:

- **Original (A):** JPEG da foto, antes do recorte/treatment do Scancat;
- **Scanner (B):** JPEG retificado/filtrado conforme modo selecionado no SALTA Scan.

Cada caminho: raster cinza → detecção de 4 fiduciais do contrato SALTA → homografia `warpFromFiducials` → `readRaster` com manifesto e template exatos. Confiança geométrica mínima 0,7 como no Corretor. O tamanho de saída segue o tratamento A4/embedded, nunca uma geometria deduzida da imagem.

A interface compara número de marcas lidas, revisão/duplas/brancos, confiança geométrica, classificação por questão, divergências e, **somente se completude permitir**, nota **local experimental** por blocos pelo `scoreIntegratedPlan`. Não escolhe automaticamente o caminho que parece melhor. Marcação parcial é sinalizada.

Reprocessamento explícito: editar cantos da foto no scanner e tocar **Ler última página novamente**.

## Limitações / homologação

- Precisa da sessão autorizada SALTA para obter título, manifesto, blocos e gabarito reais. Se o Safari bloquear cookies/cross-origin ou não houver concessão, somente a importação local de manifesto é permitida.
- Não identifica qual revisão/gabarito está no papel; duas provas podem ter geometria igual.
- **Sem publicação de resultados ou validação oficial de notas.** A pontuação apresentada é local e provisória.
- É um teste de pipeline, não um benchmark científico sem conjunto de fotos e gabarito manual independente. Mais respostas reconhecidas não significam menos erros.
- A primeira leitura depende de uma folha realmente impressa e de câmera física. Os testes automatizados de estrutura/sintaxe e lógica não comprovam leitura perfeita no iPhone.
- Arquivos originais e fotos deixam de estar acessíveis ao fechar/recarregar a aba; não há dados persistentes.

## Licença

O motor de captura continua derivado de Scancat (Nipun Batra, 2026, MIT), preservando `LICENSE-SCANCAT-MIT.txt`; módulos oficiais SALTA seguem as licenças/autorizações do próprio repositório.

## Novo enquadramento de câmera móvel — 24/11/2026

A versão experimental adotou uma solução **independente da câmera do Corretor** e sem alterar o SALTA Scan original.

- Câmera traseira continua automática pelo navegador. A preferência de vídeo é orientada a folha vertical (ideal 1440×1920, proporção 3:4 no celular em pé; todos os valores são opcionais e dependem do aparelho).
- Em iPhone na vertical, a janela de câmera é adaptada ao espaço da tela; quando a fonte física chega horizontal, a prévia pode mostrar um recorte central **real**, nunca um `object-fit: cover` decorativo separado dos pixels do scanner.
- `js/framing.js` centraliza a geometria `cameraRegion` e `cameraStageAspect`. Os mesmos `sx,sy,sw,sh` usados na prévia são aplicados por `drawImage` ao detector e à foto salva; as quatro coordenadas são reescalonadas por eixos separados.
- **Ver imagem inteira** troca para `fit`, sem cortar as bordas. A janela volta ao aspecto nativo da câmera; ela pode ficar mais baixa se o dispositivo fornecer vídeo horizontal, mas é a opção segura para folhas que não cabem no recorte ampliado.
- Mudanças de orientação/proporção reinicializam somente o estado de enquadramento e estabilidade. Não regeneram modelo nem alteram gabarito, notas ou leitura oficial.
- Ao tocar em **Abrir câmera**, a página rola até a janela de captura, em vez de deslocar a tela para o botão **Fechar câmera**.
- Mantidos o foco nativo WebKit, a captura automática, o botão de fechar, a importação e a comparação OMR dos dois caminhos. Sem exigir seleção manual de lente.

### Verificação efetuada
- HTML/JS analisados sem erro de sintaxe; IDs DOM sem faltas/duplicações.
- Casos geométricos para fonte vertical/horizontal, prévia ampliada e imagem inteira: recorte dentro dos limites da fonte, correspondência matemática com `object-fit`.
- Teste sintético do `capture()` confirma o mesmo retângulo fonte e os pontos reescalonados nas páginas emitidas.
- O scanner independente original permanece intacto.

**Limitação:** ainda não houve homologação visual/captura física no Safari deste iPhone. Se o Safari mudar a orientação da fonte durante a execução, `video.resize` recalcula o enquadramento, mas precisa de teste real. Com fonte horizontal, a prévia ampliada pode cortar partes periféricas; use **Ver imagem inteira** ou afaste um pouco o aparelho.

## HISTÓRICO DESATIVADO — FIDUCIAL-01, captura por quatro quadradinhos (24/11/2026)

**Registro histórico, não vigente.** A antiga proposta não detectava as bordas do papel e usava os marcadores como gatilho. Foi substituída por PAPER-TURBO-01 após relato de lentidão, mantendo a possibilidade de pesquisa futura em cartões incorporados.

### Lógica

1. A prévia compartilha a mesma região da câmera com a captura, incluindo o modo **Ver imagem inteira**.
2. A cada ~250 ms, a câmera envia um quadro de até 640 px de largura ao Worker. O Worker roda o **detector oficial** `corretor/v2/omr/normalize.mjs::detectFiducials`, sem modificar esse código.
3. O detector localiza centros dos quatro marcadores pretos de **5,5 mm**, posicionados a **8 mm** das bordas. Se houver modelo confirmado, o Worker recebe apenas `paper`, `schemaVersion`, `mode` e os quatro centros do manifesto. Sem modelo, usa geometria pública A4 padrão de 210×297 mm.
4. Uma homografia de quatro pontos mapeia os centros físicos dos marcadores aos centros observados e **extrapola os quatro cantos externos do papel**. Não recortar o retângulo ligando diretamente os centros dos marcadores, pois isso excluiria as margens e deslocaria o leitor OMR.
5. Sem quatro marcadores válidos, confiança mínima 0,70 ou folha suficientemente enquadrada, **nenhuma captura automática**. A UI pede para afastar o telefone ou alternar **Ver imagem inteira** se a borda estiver cortada.
6. Após quatro quadros confiáveis e estáveis, o scanner salva a foto e realiza o mesmo recorte/perspectiva/tratamento de antes. O retângulo na prévia mostra as bordas projetadas; quatro pontos violetas mostram onde os marcadores foram encontrados.
7. A importação de fotos também usa os quatro marcadores; se falhar, mantém a edição manual de cantos em vez de presumir o contorno da folha.
8. A leitura `detectFiducials → warpFromFiducials → readRaster` e a pontuação experimental continuam intactas. Não há alterações no scanner original, no Corretor, nos Workers oficiais, no Diário, na autenticação ou nos dados acadêmicos.

### Testes até esta versão

- Sintaxe de app, Worker, detector e ponte privada verificada; IDs HTML consistentes.
- Detector SALTA original exercitado em rasters sintéticos A4 com fundo cinza, iluminação baixa, sem borda contrastante, cartão distante e folha cortada.
- Cartões **embedded 100×160 e 120×180 mm** testados com manifesto geométrico específico; projeção de bordas externas com erro máximo aproximado de 1,1 px nas amostras sintéticas.
- Homografia perspectiva testada com quatro marcadores matematicamente projetados; erro numérico da ordem de 1e-13 px na amostra.
- Máquina de estados testada com quatro quadros estáveis (uma captura), ausência de marcadores (nenhuma), marcadores instáveis (nenhuma), borda cortada (nenhuma).
- **Acurácia real no Safari/iPhone permanece não homologada.** Os testes sintéticos não demonstram desempenho de câmera física ou redução da taxa de erro das alternativas.
