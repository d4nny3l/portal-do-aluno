# SALTA #122 — impressão econômica de quadros incorporados

Escopo: exclusivamente apresentação para imprimir, sem alteração dos modelos ópticos, hashes, gabaritos, revisão, banco de dados, Auth, Cloudflare ou leitor. PR único DRAFT, baseado em `main@ce74c520a464a17ed7fda2991df92f984a04d8e7` (salvamento integral #121 incluído).

## Interface

Apenas no formato *Quadro incorporado à prova*, a área **Pré-visualização do cartão → Outros formatos** oferece a seleção transitória **2 quadros por folha A4** ou **4 quadros por folha A4** e permite retornar à impressão normal. A ação continua sendo **Imprimir cartão A4 / salvar PDF**. A impressão nominal em lote usa seu próprio botão e nunca recebe `economyCopies`. O seletor não participa de `EDITOR_FIELD_IDS`, `editorSnapshot`, nenhuma operação PUT, gabarito ou revisão. Voltar a A4 independente limpa a seleção.

## Composição geométrica e vetorial

`planEconomySheet(manifest,copies)` usa apenas as dimensões físicas imutáveis do manifesto. As candidatas são: 2 cópias em metades verticais ou horizontais, A4 retrato ou paisagem; 4 cópias em quadrantes 2×2, A4 retrato ou paisagem. O critério é maior escala **uniforme** factível sem ampliar além de 100%; empates preferem retrato. Não gira cartões individualmente, até existir validação de orientação óptica para rotação independente.

- Folha: A4 210×297 mm ou 297×210 mm, `@page size:A4 portrait|landscape; margin:0`.
- Margem de segurança nas bordas externas: 6 mm; reserva entre quadro e divisória interna: 4 mm, em cada lado.
- Fator de escala: mínimo entre 1, largura útil/largura original e altura útil/altura original, **arredondado para baixo a seis casas** para evitar extrapolação.
- Cada cópia é o **mesmo SVG original**, com `viewBox` e conteúdo internos preservados, apenas colocado em um viewport SVG filho com posição/tamanho em unidades de usuário da folha. Apenas a raiz do A4 usa `mm` físicos; evita dupla conversão SVG.
- Guias pontilhadas exclusivamente centrais: linha reta vertical ou horizontal para 2; cruz para 4; traço 1,7 mm, espaço 1,5 mm, espessura 0,32 mm, cinza `#777`.
- Tesoura SVG por folha, 7 mm, com duas argolas, duas lâminas e articulação, placa branca discreta no centro para legibilidade. Sem emoji, legenda, serviços externos nem contornos de cartões.

### Exemplos geométricos verificados em Chromium headless

| Quadro original | Cópias | A4 | Escala | Quadro na folha (aprox.) | Bolha original de 4,5 mm |
|---|---:|---|---:|---|---:|
| 100×160 mm | 2 | paisagem | 100,0000% | 100×160 mm | 4,50 mm |
| 100×160 mm | 4 | retrato | 86,5625% | 86,56×138,50 mm | 3,90 mm |
| 120×180 mm | 2 | paisagem | 100,0000% | 120×180 mm | 4,50 mm |
| 120×180 mm | 4 | retrato | 76,9444% | 92,33×138,50 mm | 3,46 mm |
| 180×240 mm | 2 | paisagem | 76,9444% | 138,50×184,67 mm | 3,46 mm |
| 180×240 mm | 4 | retrato | 52,7777% | 95,00×126,67 mm | 2,37 mm |

O fato de uma configuração caber em papel **não significa** que o leitor tenha sido homologado para a nova dimensão. Especialmente quatro quadros grandes têm bolhas fisicamente menores. A validação de leitura com impressão física, recorte, câmera e iluminação reais é uma etapa separada do SALTA HOMOLOGADOR.

## Testes automatizados e evidências

- `corretor/v2/tests/economy-print.test.mjs`: seis composições A4, geometria/encaixe/guia, inversão exata das coordenadas de bolhas, identidade de conteúdo SVG, casos A–D/A–E/C–E/CDU, cabeçalhos e logotipos, manifesto imutável, A4 independente/lote anteriores, estado temporário.
- `scripts/verify-economy-browser.mjs`: prova em Chromium com PNG/PDF para 2 e 4 cópias nos três tamanhos; valida número de páginas do PDF, posições físicas, hash, marcações e ícone. Inclui navegação na página original para alterar 2→4→normal, sem PUT. Rede e dados são sintéticos/isolados.
- `https://github.com/d4nny3l/portal-do-aluno/actions/runs/45458175479/artifacts/14951761723`: primeira evidência de seis PDFs/PNGs, geometria visual PASS. Verificar artefato do HEAD final para a prova adicional de interface.
- Não foi executada impressão física ou leitura por câmera real. A inversão geométrica dos pontos não substitui a leitura fotográfica.

## Compatibilidade e riscos

A função pública `buildPrintDocument` mantém seu comportamento quando `economyCopies=0`, que é o padrão; o lote nominal existente é preservado e proibido no ramo econômico. A4 independente rejeita o ramo 2/4. Não há reprocessamento de manifesto para as cópias, nem recomposição do OMR.

**Riscos remanescentes:** configuração da impressora/navegador diferente de 100% e área física não imprimível, interpretação do `@page` em Safari, contraste da tesoura em impressoras de baixa qualidade, e baixa resolução de marcadores/bolhas em cartões mais reduzidos. A homologação física será organizada após autorização da publicação.

O workflow histórico de laboratório embedded contém um guard específico à mudança #120 e rejeita arquivos novos de impressão #122 quando executado em PR de frontend, apesar de não haver alteração de backend. Não alterar o próprio guard de backend nem declarar seu PASS artificialmente. O workflow isolado da impressão #122 é a fonte específica de evidências deste escopo.
