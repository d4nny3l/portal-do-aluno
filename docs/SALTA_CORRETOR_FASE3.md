# SALTA Corretor 2.0 — Fase 3 (primeiro protótipo)

**Estado:** experimental, PR draft #9 encadeado ao PR #8. Esta entrega não está homologada para correção real.

## Implementação

- `corretor/v2/omr/template.mjs`: contrato `salta-omr-a4-v1`, cartões SVG A4, 1–100 questões, seções A–D/A–E/Certo-Errado, geometria determinística, duas colunas acima de 50, quatro fiduciais de 6 unidades e raio mínimo de bolha 2,8 unidades na escala de layout usada nos testes.
- `render.mjs`: renderização vetorial com identificador/revisão e campo de nome manuscrito. O SVG usa viewBox 794×1123 e tamanho físico 210×297 mm.
- `reader.mjs`: lê raster em tons de cinza já alinhado. Resposta simples, vazia, dupla e baixa separação recebem estados distintos; vazio/dupla/revisão manual nunca viram nota definitiva.
- `demo.html`: fluxo estático para compor seções, gerar/baixar/imprimir SVG, importar imagem ou abrir câmera, exibir leituras e alterar manualmente respostas. Processamento permanece no navegador; não há fetch, backend ou armazenamento remoto.
- `omr-synthetic.mjs` e `omr.test.mjs`: fixtures sintéticas e verificações geométricas e funcionais.

O demo não altera nem importa o Corretor legado. A compatibilidade EJA é preservada por isolamento; o leitor legado não foi modularizado nesta revisão.

## Métricas realmente medidas

A suíte possui um cenário sintético de quatro itens: duas marcações simples reconhecidas (2/2), uma dupla identificada para revisão e uma questão em branco identificada para revisão. Isso valida o fluxo determinístico de amostragem no raster canônico, mas **não é uma taxa de precisão OMR**. Não foi calculada matriz de confusão nem precisão em imagens de fotografia.

Não há ainda conjuntos independentes de calibração e validação. Rotação, perspectiva, sombras, desfoque, rasuras e impressão física não foram medidos. Não alegar precisão real.

## Testes executados

- `node --test corretor/v2/tests/*.test.mjs`: 39/39 testes passaram (contratos, persistência e 3 testes OMR).
- `node --check` nos módulos OMR e testes OMR: passou.
- `git diff --check`: passou.
- A execução local do navegador/câmera e a impressão não foram realizadas nesta revisão. A CI remota deve ser confirmada no head final do PR antes de considerar a publicação validada.

## Hospedagem e segurança

Branch `codex/salta-corretor-v2-fase3`; commit funcional local `fb10ba3` (rebaseado para a base remota Fase 2 antes da publicação por API); PR draft #9: https://github.com/d4nny3l/portal-do-aluno/pull/9. Nenhum merge, deploy, Worker ou D1 foi executado.

Não disponibilizei URL HTTPS. O repositório já usa GitHub Pages para o portal; acionar um novo deploy de Pages poderia publicar conteúdo no domínio ativo. Não existe configuração comprovada de preview isolado neste checkout e não foi autorizado criar hospedagem externa ou recurso pago. A URL pode ser fornecida quando houver host de preview independente aprovado/disponível.

## Limitações conhecidas

- Leitura somente de imagem alinhada ao template e escala esperada. Fiduciais são desenhados, mas ainda não detectados; nenhuma correção de rotação/perspectiva está conectada.
- PDF não implementado; câmera depende de HTTPS e permissões do navegador.
- O template da demo é simplificado e o campo de nome é apenas impresso; o código de sete dígitos por bolhas não foi desenhado.
- Sem calibração/validação independente, métricas de falso positivo/falso negativo, comparação com OpenCV.js, nem desempenho avaliado em iPhone.
- Seções mistas geram o cartão; a leitura por amostragem não reconhece fotografias arbitrárias nem identifica automaticamente a versão impressa.

## Homologação futura

1. Abrir o protótipo apenas em host HTTPS isolado e confirmar câmera com permissão local.
2. Aprovar visualmente o layout antes de testes físicos.
3. Imprimir em A4, escala 100%, sem ajustar à página, e conferir margens, círculos e fiduciais.
4. Fotografar com iPhone e Mac em ângulos, rotações, iluminação e distâncias variadas; guardar apenas fixtures sintéticas.
5. Implementar detecção/retificação, dividir corpus em calibração/validação antes de ajustar limiares, medir FP/FN/revisão e repetir testes nos dois dispositivos.
