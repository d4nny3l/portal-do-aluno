# SALTA OMR — reconhecimento automático de marcações parciais (PR #51)

**Estado:** implementação funcional em branch de PR, **não publicada**. Sincronizada à `main` `af467942706f3b715c258b23ee9090ba26adaa7d` preservando histórico da pesquisa. O parecer de auditoria independente e a autorização de publicação ainda são necessários.

## Requisitos do proprietário
Nos mais de 20 ensaios físicos relatados pelo proprietário, as sugestões únicas de marcação provável conferidas estavam corretas. Essa experiência justifica testar autonomia, mas não é uma estimativa estatística de precisão sobre todos os cartões. Não há fotografias reais com dados pessoais armazenadas no repositório.

## Mudança funcional
No `corretor/v2/omr/reader.mjs`, após a classificação atual:
- Resposta **forte única** continua com `state:'read'`, `answer` e `recognition:'strong'`.
- Quando **não há marca forte**, a rotina `candidate()` anterior já verificou deslocamento, tinta interna, cobertura e margens relativas das bolhas. Se existir **exatamente uma** marca parcial, e **não houver outro candidato com sinais de tinta independentes** (limites mínimos de shifted 95, extended 92, cobertura 0,16), e **não houver múltiplas marcas fracas significativas** (`multipleWeak.length <= 1`), retorna `state:'read'`, `answer:partial[0].choice`, `recognition:'partial'`.
- A resposta selecionada é a **candidata óptica**, não necessariamente a maior intensidade central (importante para tinta deslocada). O gabarito oficial não participa dessa decisão.
- Duas marcas, uma marca forte com concorrência, sombras uniformes, ausência de marcas, limite insuficiente e casos conflituosos continuam `double`, `review` ou `blank` com `answer:null`. Quando o cartão exige código de sete dígitos e a identificação fica `review`, uma evidência parcial **também permanece `review` sem resposta automática**, mesmo que seja única. Marcas fortes permanecem no fluxo anterior.
- `readerVersion` e contratos dos cartões/manifestos, geometria, identificação de 7 dígitos e validação permanecem inalterados.

Na interface, `renderAnswers` já considera `state:'read'` como `reviewed:true`, portanto a marcação parcial é imediatamente **incluída no cálculo de nota provisória**. A questão mostra a origem óptica, com seleção editável pelo professor. A correção do professor substitui o resultado automático sem exigir confirmação anterior. A nota provisória não é registrada no Diário automaticamente.

## Evidência A/B
O teste `reader-auditor-adversarial.test.mjs` contém 23 cartões sintéticos rotulados. Comparação exata com o **leitor anteriormente publicado** do blob Git `545ef8fcd03ed255382394d8dd834e0bff607b69` (cópia congelada em `tests/fixtures/reader-before-pr51.mjs`, modificando exclusivamente o caminho do import ESM): mesmo manifesto, mesmos pixels, mesma geometria.

| Indicador (23 cenários sintéticos) | Antes do PR | Candidato |
| --- | ---: | ---: |
| Respostas definitivas | 5 | 10 |
| Marcas para revisão | 8 | 3 |
| Questões em branco | 7 | 7 |
| Respostas duplas | 3 | 3 |
| Promoções de `review` para `read` | — | 5 |
| Novas respostas definitivas incorretas | 0 | 0 |
| Brancos ou duplas promovidos | — | 0 |

Esse quadro é uma hipótese a ser confirmada pela CI no HEAD final. O conjunto cobre marcas fortes, preenchimento irregular, grafite/azul deslocado, sombras, impressões/ruído, brancos, duplas e rasuras sintéticas. Os 60 itens físicos de referência no teste `reader-partial-marks.test.mjs` verificam 15-A, 26-D, 29-B, 41-E, 50-E, 58-C; 51-C forte; 11 e 54 brancos; código sintético de sete dígitos `0001123`. O segundo teste UI do PR prova que uma resposta parcial reconhecida aparece como nota provisória sem confirmação e que o professor consegue substituí-la.

## Riscos e critérios de publicação
- Uma mancha parecida e uma marca a lápis podem gerar o mesmo raster: nenhum limiar elimina essa ambiguidade abstrata. Zero falsas automações neste conjunto não significa risco estatístico zero.
- Precisa de auditoria independente do HEAD completo com revisão da competição de marcas e tratamento de rasuras. Nenhuma alteração automática em gabaritos oficiais.
- Depois do parecer, o proprietário deve repetir a homologação no Safari com cartões reais **sem enviar dados acadêmicos ou fotos ao repositório**, incluindo sombras, marcas fracas, rasuras e duplas. A nota permanece provisória, com correção manual.
- Se a validação detectar falsa resposta automática, **não publicar** até corrigir o caso e fixá-lo como regressão.
- A câmera tem PR e CI distintos. Sem alteração de código de captura/normalização nesta entrega.

## Histórico
O PR #51 começou como pesquisa com um envelope de promoção restritivo, que somente recuperava uma sugestão dentre as marcações parciais de interesse. O ensaio anterior foi preservado como investigação; a versão funcional utiliza o detector parcial existente com vetos explícitos de concorrência, e não abaixa indiscriminadamente os limiares nem usa uma regra cega de `marks.length===1`.
