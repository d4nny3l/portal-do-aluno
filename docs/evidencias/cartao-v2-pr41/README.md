# SALTA — PR complementar das molduras e numeração V2

Evidências vetoriais **sintéticas**, geradas diretamente pelos módulos reais do Corretor V2. A comparação usa o mesmo template e o mesmo manifesto óptico com `sectionFrameStyle:'content'` para os dois lados: à esquerda o render do PR #38/#39; à direita o acabamento mais compacto desta branch. Não há dados reais de estudantes.

| Caso | Comparação A/B SVG |
| --- | --- |
| 10 questões / 1 coluna / identificação sintética de sete dígitos | [01-10-uma-coluna.svg](./01-10-uma-coluna.svg) |
| 20 questões / 2 colunas / título longo | [02-20-duas-colunas.svg](./02-20-duas-colunas.svg) |
| 50 questões / múltiplos blocos e tipos | [03-50-multiplos-blocos.svg](./03-50-multiplos-blocos.svg) |
| 29 questões / A–D, C–E, A–E | [04-29-mistas.svg](./04-29-mistas.svg) |

**Leitura:** ambos os lados mostram uma folha A4 inteira de 210 × 297 mm. O novo retângulo de seção envolve os números e as bolhas efetivamente desenhados, com título quebrado dentro da altura reservada pelo manifesto, sem alteração das coordenadas ópticas. A moldura tem raio de 1 mm e traço de 0,25 mm, como a caixa de código do aluno.

**Limites:** os SVGs não substituem o exame de PNG rasterizado, o PDF salvo pelo navegador ou impressão/fotografia física. A execução raster do novo estilo permanece no workflow `SALTA teacher OMR integration`, que deposita PNGs comparativos no artefato `tmp/card-artwork-evidence/pr38/` (incluindo casos 10/20/50 e misto). Confirme a execução no SHA definitivo antes de aceitar.

**Homologação do proprietário:** pendente. Não fazer merge/deploy com base apenas nestes exemplos.
