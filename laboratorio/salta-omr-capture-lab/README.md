# SALTA — Laboratório de captura Scanner × OMR

## Acesso
`https://d4nny3l.github.io/portal-do-aluno/laboratorio/salta-omr-capture-lab/`

## Arquitetura e isolamento

- Snapshot da interface e do motor de captura do `laboratorio/salta-scan/`, congelado nesta pasta. O scanner original **não foi alterado**.
- `js/vision.js` continua detectando contorno e corrigindo perspectiva. `js/worker.js` aplica tratamento, e `js/app.js` emite apenas dois eventos de página pronta adicionados ao snapshot.
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
