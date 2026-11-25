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
