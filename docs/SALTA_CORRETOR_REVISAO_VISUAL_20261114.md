# SALTA — Revisão visual do Corretor e do cartão TESTE.pdf

Data: 14/11/2026. Material inspecionado: PDF A4 de uma página gerado pelo Corretor SALTA; teste com 20 questões A–E, duas colunas (01–10 e 11–20), cabeçalho institucional e grade de código de sete dígitos.

**Escopo desta fase:** limpeza de microtextos redundantes e documentação de problemas visuais. **Não é autorização para recalibrar o OMR** ou alterar modelo de impressão antes de teste conjunto de gerador/leitor. Não inserir a amostra PDF no repositório público como dado de produção.

## Ajustes de interface solicitados

Retirar da área visível:
- Aviso superior de processamento local de imagens.
- Texto “Adicione os blocos da prova na ordem original. O cartão permanece em uma folha A4.”
- Estado inicial de “Adicione um bloco e gere a prévia quando estiver pronto.”
- “Enquadre a folha inteira. A leitura só será apresentada depois que os quatro marcadores forem reconhecidos.”
- Legenda “A4 · uma folha”.
- Navegação de cartões duplicada: eliminar a tela inicial com três grandes botões explicativos se o menu compacto com Criar/Corrigir/Cartão cobrir as mesmas rotas. Todas as funções devem continuar acessíveis.
- Preservar avisos de erro, status de salvamento e informações essenciais para ação/segurança em seus contextos.

## Defeitos observados no PDF (página 1)

### C-01 — Cabeçalho institucional versus código do aluno — prioridade alta
A linha superior “Turma: 1SEM EJA MÉDIO” invade a área das sete caixas ópticas no canto direito. O problema é uma colisão de caixas geométricas no cabeçalho, com impacto de legibilidade e potencial interferência na identificação. Corrigir distribuição de áreas por largura reservada; nome da turma deve permanecer integral e legível, sem colidir com caixas/bolhas; cabeçalho institucional obrigatório permanece prioritário. Testar títulos e turmas longos.

### C-02 — Letras A–E com desenho tênue/duplicado — prioridade alta
Na amostra impressa, as letras dentro das bolhas aparecem contornadas ou pouco nítidas. No código `corretor/v2/omr/render.mjs`, o texto das alternativas é desenhado com `fill="#fff"`, `stroke="#000"` e `stroke-width="0.12"`. A hipótese técnica é que o preenchimento branco com contorno fino degrada a nitidez das letras pequenas. Investigar renderização de glifo com preto sólido, **sem alterar a geometria da bolha**; medir se o contraste continua favorável à leitura OMR. Testar PDF impresso em P&B e câmera real.

### C-03 — Formatação e distribuição — prioridade moderada
Data impressa em ISO (`2026-12-01`) em vez de formato brasileiro (`01/12/2026`); falta padronização tipográfica/acentuação em parte dos campos (e.g. nomes institucionais conforme informação de entrada). A distribuição 01–10 / 11–20 deixa área inferior vazia; isso pode ser uma escolha adaptativa para grandes provas, e não deve ser “corrigido” alongando o cartão de 20 questões sem analisar a capacidade das versões 1–150.

### C-04 — Hierarquia e espaços — prioridade moderada
Melhorar distância entre logo, título da prova e campos. O rótulo de seção está apenas na primeira coluna. Avaliar título por seção e cabeçalho sem duplicação. Evitar fontes abaixo da legibilidade impressa e truncamentos.

### C-05 — Identificação e impressão — segurança geométrica
Preservar quatro marcadores fiduciais nos cantos, margens, A4, escala 100% e padrão de sete dígitos. O rodapé de modelo/revisão pode permanecer para rastreabilidade mesmo que discreto. Não prometer leitura estável sem ensaio com lotes físicos.

## Critérios de aceite da revisão do cartão

1. Layout sem interseções entre cabeçalho e grade numérica em nomes/disciplinas/turmas curtos e longos.
2. Impressão A4 100% sem distorção; quatro marcadores preservados e reconhecidos pelo leitor.
3. Letras A–E e 0–9 legíveis em impressão monocromática e foto de celular.
4. Cartões de 10, 20, 50, 100, 150 questões e combinações de blocos, com rejeição explicável de layouts impossíveis.
5. PDF, SVG, PNG e JPG coerentes; sem “alinhamento correto” só na prévia do navegador.
6. Alterar layout somente com atualização de manifesto geométrico/reader quando necessário, teste de regressão e prova física.
7. Nenhuma mudança publicada sem PR, CI e autorização. Registrar escopo visual e motor preservado.

## Pendências de decisão do responsável
As observações C-01 a C-05 são propostas técnicas derivadas da amostra. Antes de mudar desenho do cartão, coletar preferências específicas de aparência e registrar aprovação de posições/tamanhos finais. A limpeza dos textos de interface é separada do projeto gráfico do PDF.
