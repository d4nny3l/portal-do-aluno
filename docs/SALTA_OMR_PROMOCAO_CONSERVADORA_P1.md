# SALTA — estudo P1 de reconhecimento automático de marcas fracas

**Tipo:** estudo experimental separado da interface e do leitor publicado. Não contém alteração de `reader.mjs`; nenhuma resposta é promovida em produção.

## Evidência disponível
O proprietário observou, em testes físicos recentes, que as sugestões de marcação para preenchimentos imperfeitos e a lápis coincidiram com as marcações pretendidas nos casos conferidos. Essas observações **não incluem ainda as matrizes normalizadas originais, os manifestos exatos, o total de amostras verificadas ou a taxa de erro de todos os negativos**. Logo, são indício favorável para pesquisar autonomia, não base suficiente para uma alteração automática de nota.

O PR #45, já integrado, só aceita automaticamente uma bolha central forte. Uma marca parcial pode receber estado `review` com `answer:null` e lista de alternativas candidatas. Essa proteção é intencional. O teste sintético rotulado existente tem 23 cenários com 5 respostas únicas corretamente definidas, 5 respostas únicas pendentes de revisão e 1 marca fraca ignorada; nenhum falso definitivo nesse conjunto.

## Hipótese pesquisada (não aplicada)
`reader-auditor-adversarial.test.mjs` inclui agora um *dry-run* apenas com dados sintéticos, reproduzindo os mesmos pixels e manifestos. Só calcula promoção hipotética quando a classificação corrente é `review`, há exatamente **uma** alternativa suspeita e não há resposta já atribuída.

Limiar exploratório (escore de tinta 0–255, **não aprovado para produção**):

| Evidência | Limite exploratório |
| --- | ---: |
| Média central | ≥118 |
| Melhor centro deslocado | ≥128 |
| Média circular interna | ≥105 |
| Cobertura escura interna | ≥30% |
| Margem central vs. concorrente mais forte | ≥42 |
| Margem deslocada vs. concorrente mais forte | ≥55 |
| Margem circular vs. concorrente mais forte | ≥35 |

Todos os limites devem ser satisfeitos simultaneamente. Duas alternativas, branco real, ausência de candidato e estados `double` continuam fora da hipótese. **Não alterar o limiar do leitor atual, número da questão, gabarito ou código de sete dígitos.** A hipótese produz apenas contagem em teste local; o professor ainda confirma toda marca parcial no módulo publicado.

## Risco fundamental
Uma marca em grafite e uma mancha localizada podem produzir pixels idênticos. O segundo teste cria duas etiquetas opostas sobre um **mesmo raster** para demonstrar que nenhum limiar de tons de cinza sozinho prova a intenção do aluno. Sombras, rasuras e marcas apagadas exigem rótulos físicos independentes e uma taxa documentada de falso positivo. Isso limita a generalização dos 23 sintéticos.

## Portões para uma futura alteração do leitor
1. Obter um conjunto físico consentido e **anonimizado**, com manifestos exatos e as mesmas imagens normalizadas em antes/depois; nenhum upload a servidores, sem códigos reais ou nomes. Registrar pelo menos 200 marcações únicas (lápis forte, médio e fraco, caneta e preenchimento parcial), 100 questões brancas, 100 duplas/rasuradas, sob luz adequada, moderada, fraca e sombras.
2. Definir verdade de terreno por conferência independente da imagem e papel impresso, antes de testar o algoritmo; separar exemplares de treino/proposta e validação sem reusar imagens. Registrar confusão por alternativa, estado, intensidade, revisão e dispositivo.
3. **Zero** respostas definitivas incorretas no conjunto físico de validação, nenhuma resposta dupla ou branco confirmado promovidos, nenhuma regressão de respostas fortes e identificação de sete dígitos; se falhar, não promover. Documentar explicitamente limites estatísticos dessa amostra — zero erros não significa risco zero.
4. Reduzir revisões apenas quando não aumentar notas incorretas; não usar o gabarito para orientar a interpretação das bolhas. Preservar a substituição manual do professor.
5. Auditoria independente do PR que vier a modificar `reader.mjs`, regressões V1/V2, QR, manifestos/hashes, fotografia em iPhone/Android e autorização específica para merge/deploy.

## Separação de missões
O PR de interface/lâmpada não tem alterações no motor OMR. O problema de iluminação tem duas etapas distintas: captura/segmentação fiducial e evidência de tinta. Não combinar a pesquisa de promoção automática com melhorias de captura antes de poder isolar seus efeitos.

**Conclusão provisória:** a autonomia pode ser estudada; não deve ainda substituir a revisão humana com base apenas nas sugestões corretas observadas.
