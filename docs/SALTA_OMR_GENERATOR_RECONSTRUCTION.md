# SALTA — Gerador de Cartões-Resposta: reconstrução e validação

## Escopo desta entrega

Esta branch reconstrói o modelo de avaliação, a composição física, a renderização SVG, a edição visual e as exportações locais do gerador. O leitor OMR existente foi preservado: não foi refeita a câmera, a normalização de perspectiva nem a decisão de respostas. Diário, autenticação, Workers, D1, dados reais, cartões EJA e o corretor legado não foram alterados funcionalmente.

A página mantém o shell SALTA e gera/processa os arquivos no navegador. Avaliações não persistem entre sessões e nenhuma exportação é enviada ao servidor.

## Arquitetura implementada

- `corretor/v2/omr/assessment.mjs`: valida a definição, formatos, códigos nominais, IDs estáveis e numeração.
- `corretor/v2/omr/layout.mjs`: fonte geométrica em milímetros; manifesto versionado, cálculo de colunas, regiões protegidas e validação de limites/colisões.
- `corretor/v2/omr/template.mjs`: adaptador de cartão para o leitor atual. Mantém a ordem visual separada da sequência numérica consumida pelo leitor.
- `corretor/v2/omr/render.mjs`: SVG físico em preto e branco, com círculos rotulados, cabeçalho, código, borda, versão e marcadores.
- `corretor/v2/omr/editor.mjs`: operações puras para mover seções/questões preservando IDs e números e restaurar a ordem automática.
- `corretor/v2/omr/export.mjs`: SVG, PNG/JPG por Canvas, JSON de geometria sem identidade e documento de impressão A4, inclusive lote local.
- `plataforma/corretor-v2.html` e `.css`: interface integrada ao shell existente; editor de blocos e cabeçalho, prévia e exportações.

O contrato do leitor continua `salta-omr-reader-v4`; o cartão é `salta-omr-a4-v7` / `salta-layout-manifest-v1`, com revisão geométrica 7. O leitor não interpreta C-D-U e rejeita esse formato explicitamente. Nesta revisão, leitor e normalizador receberam apenas uma nova versão no endereço de importação para invalidar o cache; câmera, normalização e interpretação não foram modificadas. Mudanças nos parâmetros de geometria exigem nova revisão; bolhas não são reduzidas para caber.

## Geometria física atual

| Elemento | Medida / regra |
| --- | --- |
| Papel do cartão completo | A4 retrato, 210 × 297 mm; uma página por cartão |
| Margem segura | 10 mm em A4 |
| Bolhas de resposta e identificação | diâmetro fixo 4,5 mm |
| Passo entre alternativas | 5,2 mm |
| Passo vertical objetivo | variável de 4,85 a 14 mm conforme o espaço disponível; o diâmetro não muda |
| Código nominal | 7 colunas × 10 dígitos = 70 bolhas; caixas e centros de coluna alinhados |
| Passo das bolhas do código | 5,2 mm |
| Marcadores de leitura | quadrados pretos de 5,5 mm; centros preservados a 8 mm de cada canto, compatíveis com o contrato v4 |
| Versão impressa | ID curto, revisão e prefixo do hash do manifesto no rodapé |
| CDU | área numérica separada, com centenas/dezenas/unidades e dígitos 0–9 |

O compositor rejeita cartões que não cabem dentro de uma única folha, preservando bolhas de 4,5 mm. O limite lógico é 150; ele não é garantia de capacidade física. O cartão nominal incorporável requer pelo menos 112 × 112 mm para proteger a grade de sete dígitos; cartões menores devem usar identificação manual.

## Matriz de validação executada

| Cenário | Resultado observado |
| --- | --- |
| 10, 20, 30, 50 e 100 questões A–E, código de sete dígitos, A4 | cabem; uma página; 4 marcadores; círculos de 4,5 mm |
| A–D, A–E, C–E e C–D–U | manifesto válido para os quatro formatos |
| Mistura A–D/A–E/C–E | composição em uma página na configuração testada |
| 65 A–E + 5 CDU | cabe na configuração testada |
| 50 A–D + 50 A–E + 50 CDU | rejeitado por falta de área física |
| 20 CDU + 80 A–E | rejeitado por falta de área física |
| 150 A–E | cabe em cinco colunas na A4 testada, passo mínimo de pelo menos 4,85 mm e círculos de 4,5 mm |
| 150 A–E em lote sintético | prévia de 150 questões e PDF local de duas identidades sintéticas, uma página A4 por cartão |
| 15 A–E com QR sem provedor de tokens/codificador | bloqueado antes da exportação |
| Reordenação visual de seções com formatos diferentes | IDs e números estáveis; o índice do leitor continua ligado ao número da questão |
| Cartão incorporável manual 100 × 180 mm | SVG físico preservado e centralizado na página A4 de impressão |
| Cartão incorporável 100 × 180 mm com grade de 7 dígitos | bloqueado por dimensão mínima explícita |
| Manifesto sintético de leitura | resposta marcada lida; questão em branco sinalizada para revisão |
| Colisão forçada entre círculos | validação rejeita o manifesto |
| Exportação JSON nominal | código, nome, turma e pré-marcações removidos |
| PDF/lote | documento de impressão cria N páginas A4 isoladas; ordenação alfabética é padrão, ordem de entrada pode ser mantida, e páginas podem ser selecionadas por índices/faixas; geração do PDF final é feita pelo diálogo de impressão do navegador |
| Borda e conteúdo | linhas de seção, caixas, bolhas e rodapé são validados dentro do contorno, com folga para a borda e os quatro marcadores |

Há testes específicos para casos aceitos e recusados. Os cartões 10, 20, 30, 50, 100, 150 A–E e um misto foram renderizados em SVG e inspecionados no Chrome local; também foi inspecionado um PDF A4 de duas páginas. As imagens são renderizações locais com dados sintéticos, sem validação física.

## Testes realmente executados

- `node --test corretor/v2/tests/*.test.mjs`: 33 passaram, 0 falharam após a revisão geométrica final.
- `node --check` em cada módulo OMR e no script ES module extraído da página: passou.
- Extração do bloco `<script type="module">` da página para arquivo `.mjs` temporário e `node --check`: passou.
- `git diff --check`: passou após as alterações.
- Chrome local: cartões A4 para 10, 20, 30, 50, 100, 150 A–E e seções mistas foram renderizados e conferidos; a prévia de 150 questões foi gerada na interface. Viewport mobile de 390 × 844 px sem rolagem horizontal.
- Chrome headless, `pdfinfo` e `pdftoppm`: lote sintético gerou PDF de duas páginas A4 (594,96 × 841,92 pt); ambas as páginas foram renderizadas e inspecionadas. Isso valida o arquivo local, não a impressão física.
- GitHub Pages e CI ainda aguardam validação no commit publicado.

## Limitações ainda abertas

1. **QR nominal:** não é emitido até existir provedor autorizado de tokens opacos e codificador QR. Não há QR demonstrativo que possa ser confundido com identidade real.
2. **C-D-U:** a geração está disponível, mas o leitor atual não a interpreta. A aba de captura continua oferecendo apenas A–D, A–E e C–E.
3. **Persistência:** avaliações, cabeçalhos e resultados não são salvos entre sessões e não são enviados a qualquer backend.
4. **PDF:** o navegador prepara um documento A4 vetorial; o arquivo PDF é salvo pelo diálogo de impressão, não por biblioteca PDF direta.
5. **Lote:** recebe registros nominais inseridos localmente e gera cartões sem comunicação com o Diário; ainda não importa a lista nominal do Diário. Ordenação, ordem de entrada e seleção de páginas atuam nesta impressão. O mapeamento entre versão/hash do layout e estudantes permanece apenas no armazenamento local do navegador.
6. **Validação física:** bolhas, marcadores e impressão em escala real ainda precisam ser homologados em impressora e fotografias reais. Não se declara precisão física ou câmera homologada.
7. **Composição automática:** ao detectar uma configuração impossível, o editor tenta a organização automática e apresenta o resultado para conferência; se continuar inviável, apaga a prévia e bloqueia exportações. Posição de logos e decisões pedagógicas não são alteradas automaticamente.

## Guia de homologação física futura

1. Gere e baixe um cartão SVG ou PNG a 300 DPI; para impressão técnica, prefira SVG/PDF vetorial.
2. No diálogo do navegador, use papel A4 retrato, escala 100% / tamanho real e desative “ajustar à página”.
3. Imprima somente cartões de dados sintéticos nesta rodada.
4. Fotografe a folha inteira, sem recortar os quatro marcadores, em luz uniforme; faça também uma foto inclinada e outra em orientação paisagem.
5. Compare a versão/revisão impressa e o hash curto com o manifesto JSON correspondente.
6. Não use resultados para lançamento acadêmico até revisão do layout e validação física do leitor.

## Arquivos desta branch

Veja `git diff --stat` e a lista de arquivos da PR. O usuário autorizou integração e publicação para inspeção visual. A branch só deve ser integrada após publicar o commit final, obter CI verde e confirmar as proteções do repositório. A publicação não equivale à homologação física do cartão ou do leitor.
