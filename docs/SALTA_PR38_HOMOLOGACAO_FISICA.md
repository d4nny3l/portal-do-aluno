# SALTA — PR #38 | Roteiro de homologação física do cartão V2

**Escopo:** moldura proporcional `sectionFrameStyle: 'content'`, numeração após exclusão/inclusão e leitura de cartões A4. Este roteiro complementa os testes sintéticos; não representa um ensaio físico já realizado.

## Preparação

1. Confirmar o HEAD do PR #38 e o manifesto JSON exato do cartão utilizado.
2. Usar somente nomes, instituições e códigos fictícios (ex.: `0001200`). Não registrar dados pessoais de estudantes.
3. Separar cartão V2 com moldura anterior, V2 com moldura proporcional e um histórico V1 com seu próprio manifesto. Não deduzir versão por fotografia.
4. Imprimir A4 **210 × 297 mm**, retrato, **escala 100% / tamanho real**, sem ajustar à página, sem cabeçalhos/rodapés da impressora ou impressão duplex. Salvar também o PDF do mesmo diálogo, quando disponível.
5. Registrar fabricante/modelo da impressora, tipo/gramatura de papel, navegador, modo de impressão, dispositivo e aplicativo usados na captura; registrar sempre a revisão/hash do manifesto sem os dados nominais.

## Matriz mínima de cartões

| Caso | Cartão | O que conferir |
| --- | --- | --- |
| F-01 | A–E, 20 questões, 1 coluna | Moldura curta, título, uma página A4 e bolhas preservadas |
| F-02 | A–E, 20 questões, 5 colunas | Cinco colunas, molduras separadas e ordem das questões |
| F-03 | A–E, 50 questões | Repetição/continuação de seções e legibilidade |
| F-04 | A–D, 100 questões | Limites físicos e densidade |
| F-05 | Mista A–D/C–E/A–E, blocos 7/3/19 | Alturas diferentes, rótulos, números contínuos |
| F-06 | Após exclusão do primeiro bloco e inclusão de novo bloco | Números de 1 a N e vínculo dos gabaritos por `questionId` |
| F-07 | Modelo V2 anterior e histórico V1 | Importação do JSON exato, sem recompor/regravar o cartão |
| F-08 | Cartão com código de sete dígitos `0001200` e sem identificação | Grade opcional, zeros à esquerda, quatro fiduciais |

**Medidas nominais:** bolhas com diâmetro 4,5 mm; quatro marcadores quadrados 5,5 mm, centros a 8 mm dos cantos; borda externa na região de 186 × 273 mm para A4. Medir ao menos uma folha com régua e registrar qualquer variação, sem assumir tolerância de impressora não homologada.

## Leitura fotográfica

Para cada caso elegível ao leitor (C-D-U e modo incorporado não estão homologados para leitura automática):

1. Fotografar a **folha inteira**, com câmera traseira principal, sem cortar os fiduciais; guardar evidências sintéticas/ficcionais de orientação correta, rotação moderada e perspectiva inclinada.
2. Repetir sob luz difusa, sombra parcial e luz artificial. Não aplicar filtros que alterem as bolhas. Registrar qualidade, foco, desfoque, brilho, curvatura e falhas.
3. Ler um cartão **sem respostas**: nenhuma alternativa pode ser reconhecida como preenchida (sem falso positivo de moldura).
4. Ler cartão com gabarito conhecido: preencher alternadamente A–D/A–E ou C/E, usando caneta preta apropriada; conferir **questão a questão**, não somente quantidade de acertos.
5. Testar respostas **duplas**, **fracas** e **rasuradas**: exigir revisão humana quando ambíguas; não publicar nota definitiva.
6. Conferir código fictício de sete dígitos, posição de orientação e associação ao modelo/manifesto exato.
7. Repetir com pelo menos outra configuração de câmera ou impressora, quando disponível, registrando diferenças; não extrapolar robustez caso exista um único dispositivo.

## Revisão e persistência

1. Criar avaliação sintética e registrar gabarito de cada `questionId`.
2. Salvar revisão 1 no laboratório isolado; excluir um bloco, renumerar e adicionar outro.
3. Salvar revisão 2; reabrir explicitamente as revisões 1 e 2.
4. Conferir `questionId`, número visível, alternativa correta, manifesto e `contentHash` de cada revisão.
5. Corrigir imagens sintéticas usando a revisão correspondente, revisar ambiguidades e conferir a nota **provisória**. Não alterar notas pedagógicas nem Diário.
6. Confirmar que o histórico da revisão 1 permanece íntegro; jamais migrar ou sobrescrever histórico automaticamente.

## Critérios de liberação

- **Software:** testes unitários, integração de revisões, A/B geométrico e raster com `sectionFrameStyle:'content'` aprovados no HEAD final.
- **Visual:** SVG/PNG e PDF (quando gerado) do novo estilo inspecionados, bordas fechadas e proporcionais, texto legível, sem invasão de bolhas/fiduciais. A4 gera uma página por cartão.
- **Óptico físico:** leituras das respostas conhecidas e do código corretas, sem falsos positivos gerados por molduras; respostas fracas/duplas requerem revisão, e todos os erros são documentados e tratados.
- **Histórico:** V1 e V2 anteriores lidos apenas com seus manifestos exatos; revisões e gabaritos associados aos IDs preservados.
- **Decisão:** a Direção Geral/proprietário revisa e autoriza explicitamente a integração. CI verde por si só não homologa impressora ou celular.

## Registro do ensaio (preencher pelo responsável)

| Campo | Resultado |
| --- | --- |
| Data, responsável, PR e SHA | Pendente |
| Impressora, navegador, papel e escala | Pendente |
| Dispositivo, câmera e iluminação | Pendente |
| Casos F-01…F-08 (aprovado/falhou/não executado) | Pendente |
| Medidas verificadas | Pendente |
| Gabaritos, código e ambiguidades | Pendente |
| Arquivos de evidência (sem nomes reais) | Pendente |
| Defeitos e correções necessárias | Pendente |
| Decisão final do proprietário | Pendente |

**Status inicial:** testes físicos não realizados. Não declarar a SALTA Scanner Pro homologada com base em raster sintético.

Relatório de testes automatizados: [PR complementar #39](https://github.com/d4nny3l/portal-do-aluno/pull/39), dependente do PR #38. A homologação física continua pendente.
