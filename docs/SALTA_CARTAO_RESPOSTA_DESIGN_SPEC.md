# SALTA — Dossiê visual definitivo de referência do cartão-resposta

**Versão:** 1.0 — 14/11/2026
**Status:** requisitos de produto aprovados; proposta geométrica e implementação ainda sujeitas a homologação OMR.
**Escopo:** gerador de cartão-resposta SALTA, impressão e legibilidade óptica (não inclui redesign da prova de questões).
**Fontes analisadas:** `TESTE.pdf` (cartão A4 produzido pela SALTA, 1 página); `2_SEM_EJA_MEDIO_OLAVO_BILAC_1BIM_2025_MATEMATICA.pdf` (referência institucional, especialmente página 1; as páginas 2–4 são o caderno de questões); código do repositório `d4nny3l/portal-do-aluno` na `main` `4411dcf` e PR #31 de limpeza do Corretor. As fontes PDF são **referências visuais** e não devem ser inseridas integralmente em repositório público sem necessidade.

## 1. Decisão central de design

A SALTA adotará um cartão com **linguagem de documento escolar oficial**, elegante, modernizado, **preto sobre branco** e adequado à impressão econômica. A referência de 2025 inspira a organização institucional por células e a hierarquia de informações; não se copiam logos, diagramação exata, marca ou elementos específicos de terceiros. A versão SALTA deve ser própria, clara e rápida de preencher.

O resultado procurado é simultaneamente:

1. **Confiabilidade de leitura OMR:** bolhas, identificação e quatro marcadores de canto reconhecidos sem ambiguidade.
2. **Elegância documental:** cabeçalho institucional, títulos centralizados, seções enquadradas, alinhamento consistente.
3. **Usabilidade para o aluno:** identificação óbvia, instruções mínimas úteis e alternativas claramente legíveis.
4. **Robustez:** formatos A–D, A–E, C–E, C-D-U, 1–150 questões (respeitando a capacidade real), um cartão A4, modo incorporado com tratamento próprio.

## 2. Requisitos aprovados — obrigatórios

| ID | Requisito | Critério observável |
|---|---|---|
| CV-01 | **Nenhum rodapé técnico visível.** Remover `MODELO omr-a4 · REV 48 · 176537de` e equivalentes de impressão, prévia, PDF, PNG, JPG e SVG. | A folha não contém texto técnico de modelo, hash ou revisão; a versão permanece **internamente** no manifesto/JSON e em metadados técnicos quando aplicável. |
| CV-02 | **Todos os títulos centralizados.** | Título principal e títulos de cada seção têm centralização geométrica dentro de sua região visual; logotipos ou campos não deslocam arbitrariamente o centro. Campos de informação e etiquetas podem permanecer alinhados à esquerda. |
| CV-03 | **Nenhuma sobreposição.** | Turma, data, professor, componente, logotipos, nome e outros campos nunca invadem a área do código SALTA de 7 dígitos, entre si, nem os quatro marcadores OMR. Textos longos quebram em linhas dentro do próprio bloco ou provocam erro explicável, sem compressão ilegível. |
| CV-04 | **Moldura envolvendo cada seção.** | Cada grupo de questões recebe um quadro fechado, com título centralizado e área de bolhas dentro. Não basta uma linha horizontal. Se a seção se divide entre colunas, cada segmento visual tem moldura e identificação sem gerar duplicidade de questões. |
| CV-05 | **Cabeçalho institucional sofisticado.** | Usar bordas finas pretas, organização tabular e hierarquia semelhante ao exemplo fornecido, sem cópia literal. Identidade própria SALTA. |
| CV-06 | **A–E e dígitos nítidos.** | Letras/números legíveis na impressão real em P&B e na imagem capturada; não aumentar tinta nos centros ópticos sem provas de leitura. |
| CV-07 | **Data brasileira.** | Se preenchida e válida, imprimir `dd/mm/aaaa`, exemplo `01/12/2026`, preservando ISO no estado interno. |
| CV-08 | **Cabeçalho institucional respeitado.** | Nome da escola e logotipos, quando configurados, têm prioridade e não podem ser removidos para caber. Componentes opcionais são organizados sem invasões. |
| CV-09 | **Interface limpa do Corretor.** | Preservar PR #31: navegação compacta Criar avaliação / Corrigir cartões / Cartão-resposta, sem hub duplicado e sem mensagens decorativas removidas. Preservar erros, permissões, validações e status operacionais. |

**Observação:** a instrução geral anterior “rodapé de modelo/revisão pode permanecer” é revogada por CV-01. Se alguma dependência técnica exigir marca impressa, reportar o impedimento antes de implementá-la; não reintroduzir texto visível silenciosamente.

## 3. Diagnóstico comparativo dos PDFs

### 3.1. Cartão atual — `TESTE.pdf`, página 1

- Cabeçalho contém nome da instituição, logotipo, título e campos da prova; a informação da **turma invade o bloco das sete colunas ópticas**, na região superior direita.
- Título da avaliação varia de posicionamento conforme modelo do cabeçalho, e títulos de seção são alinhados à esquerda.
- As seções apresentam somente rótulo mais linha, sem borda envolvendo as questões.
- Alternativas A–E parecem débeis/duplamente contornadas na renderização fornecida.
- Data surge em formato ISO (`2026-12-01`).
- Rodapé impresso mostra `MODELO omr-a4 · REV 48 · 176537de`.
- Área inferior relativamente vazia no exemplo de 20 questões; isso **não autoriza** esticar bolhas ou deformar a matriz para preencher a página.

### 3.2. Referência — avaliação de 2025, página 1

- Cabeçalho dividido em **três faixas de leitura**: instituição/logos; professor-disciplina-data; turma-nome-acertos. Bordas e compartimentos dão acabamento institucional.
- Título `CARTÃO DE RESPOSTAS` é visível e centralizado.
- Campo para assinatura e quadro breve de instruções ajudam o preenchimento; na SALTA são **opcionais** e só entram se couberem sem disputa com o código óptico.
- Alternativas visualmente mais marcadas. **Não copiar** orientação horizontal da grade ou pontos circulares de detecção: o leitor SALTA usa contrato próprio de quatro fiduciais quadrados.
- As páginas 2–4 são itens da prova, não modelo de cartão-resposta; não são escopo deste redesign.

### 3.3. Escolhas: adotar, adaptar ou não copiar

| Referência | Decisão SALTA |
|---|---|
| Quadro institucional com células | **Adotar como princípio**, com identidade e proporções originais |
| Título centrado e contraste alto | **Adotar** |
| Assinatura / instruções | **Avaliar como opcional**, apenas se não reduzir área necessária de OMR |
| Bolhas em colunas por alternativa da referência | **Não copiar automaticamente**; preservar orientação/calibração até estudo técnico |
| Pontos circulares de referência | **Não copiar**; SALTA mantém seus quatro fiduciais quadrados |
| Texto de revisão técnica no cartão SALTA | **Remover** |

## 4. Wireframe funcional proposto — conceito, não modelo homologado

A composição visual inicial para **A4 independente com código de sete dígitos** será:

```text
┌──────────────────────────────────────────────────────────────────┐
│ [LOGO]        NOME DA INSTITUIÇÃO / REDE                 [LOGO] │
│                   TÍTULO DA AVALIAÇÃO                           │
├─────────────────────────────────────────────┬────────────────────┤
│ PROFESSOR: ...        COMPONENTE: ...        │ CÓDIGO DO ALUNO    │
│ TURMA: ...            DATA: dd/mm/aaaa       │ □ □ □ □ □ □ □      │
├─────────────────────────────────────────────┤ 0 0 0 0 0 0 0      │
│ NOME: ____________________________________ │ 1 1 1 1 1 1 1      │
│ TURMA (se necessária): _________________   │ ...                │
│ [INSTRUÇÃO ÚTIL E CURTA]                   │ 9 9 9 9 9 9 9      │
├─────────────────────────────────────────────┴────────────────────┤
│       ┌──────  MATEMÁTICA — QUESTÕES 01–10  ───────┐            │
│       │ 01  (A) (B) (C) (D) (E)                │            │
│       │ 02  (A) (B) (C) (D) (E)                │            │
│       │ ...                                    │            │
│       └────────────────────────────────────────┘            │
│       ┌──────  MATEMÁTICA — QUESTÕES 11–20 ───────┐            │
│       │ 11  (A) (B) (C) (D) (E)                │            │
│       └────────────────────────────────────────┘            │
│                  (sem rodapé técnico)                          │
└──────────────────────────────────────────────────────────────────┘
```

**Não literal:** o formato da matriz, a quantidade de colunas e a posição dos quadros variam conforme o manifesto e a capacidade; os quatro marcadores quadrados permanecem fora das áreas de conteúdo. Os dois quadros ilustrados podem representar **fragmentos visuais da mesma seção**; não criar duas seções lógicas falsas.

### 4.1. Zonas de segurança do layout atual (referências, não imposição estética final)

No gerador atual A4 (`layout.mjs`), a folha é `210 × 297 mm`; os quatro fiduciais quadrados têm centro a `8 mm` dos cantos e tamanho nominal de `5,5 mm`. A grade de 7 dígitos começa por volta de `x=161 mm`, com caixas superiores a `y=29 mm` e bolhas até aproximadamente `y=87 mm`; as questões A4 com código começam por volta de `y=94 mm`. **Revalidar diretamente a geometria na branch antes de alterar.**

Sugestão para o cabeçalho: reservar integralmente a zona óptica direita, projetar metadados numa faixa à esquerda, e colocar o título geral **centralizado na largura imprimível** numa altura livre da grade. Não usar somente `textLength` para espremer palavras longas: reduzir/truncar visualmente não resolve colisão sem métricas de caixa.

### 4.2. Títulos e molduras

- Título principal: centralização real, peso forte, quebra de linha e área institucional bem delimitada.
- Nome da seção: centralizado na faixa superior do quadro, com borda fechada em torno das questões.
- Molduras de seção não invadem centros de bolhas ou área de marcas OMR; espessura leve e constante, respeitando contraste.
- Se uma seção se estende por mais de uma coluna, apresentar segmentos com cabeçalho de continuidade, sem renumeração e sem confusão de seção no manifesto.
- Não enfeitar as bordas com elementos próximos às regiões que o leitor interpreta como bolhas/marcadores.

## 5. Implementação técnica orientada pelo código

**Arquivos atuais relevantes:**

- `corretor/v2/omr/render.mjs`: `drawHeader`, `drawIdentity`, `drawQuestion`, `renderTemplateSvg`, rodapé de revisão, títulos e linhas de seção.
- `corretor/v2/omr/layout.mjs`: `createColumnPlacements`, `createCduPlacements`, `createLayoutManifest`, `validateLayoutManifest`, limites e geometria.
- `corretor/v2/omr/template.mjs`: manifesto utilizado no template, células e regiões.
- `corretor/v2/omr/reader.mjs`, `corretor/v2/omr/normalize.mjs`: interpretação e alinhamento; revisar apenas se mudar zonas/contratos.
- `corretor/v2/omr/export.mjs`: impressão/lotes e formatos gerados.
- `plataforma/corretor-v2.html`, `plataforma/corretor-v2.css`: prévia e configurações; PR #31 já simplifica a interface.
- `corretor/v2/tests/card-layout.test.mjs` e demais testes OMR; ampliar verificações para rodapé, moldura, alinhamento de centro e colisão.

**Pontos encontrados no código atual:**

1. `renderTemplateSvg` imprime literalmente texto `MODELO ... · REV ... · hash` no rodapé. Remover **somente a renderização visível**; preservar manifesto e rastreabilidade técnica via atributos/dados internos.
2. `renderTemplateSvg` usa `drawText(section.x, ...)` para seção (ancoragem à esquerda) e `<line>` horizontal em vez de `<rect>` de contorno. Rever `sections` para ter retângulo envolvendo a extensão real do grupo e o título centrado, inclusive quando quebrado entre colunas.
3. `drawHeader` desenha campos em colunas fixas `[14,78,142]`, sem reservar de forma consistente o retângulo óptico direito; origem direta do conflito com a turma.
4. `drawQuestion` usa letras brancas de contorno preto fino (`fill="#fff"; stroke="#000"`). Elas ficam pouco legíveis, mas trocar diretamente por preto sólido pode aumentar tinta na área central amostrada pelo leitor. Criar opções visuais e comparar leitura antes de escolher.
5. A data da avaliação é passada sem formatação brasileira no texto SVG; formatar no renderizador (preservando valor interno ISO).

**Rastreabilidade técnica:** o PDF impresso por navegador pode não preservar os atributos SVG como dado acessível ao leitor. O Codex deve comprovar como o leitor encontra o manifesto correto **sem depender do texto impresso**. Se necessário, propor mecanismo próprio de versão compatível que não exponha o antigo rodapé nem introduza marca óptica não testada.

## 6. Casos de teste e aceitação

### 6.1. Matriz mínima automática

- Formatos: A–D, A–E, C–E, C-D-U e mistos; rótulos longos; múltiplas seções; seções que atravessam colunas.
- Contagens: 10, 20, 50, 100, 150 questões. **Se inviável por restrições de capacidade, mostrar erro claro; jamais diminuir as bolhas silenciosamente**.
- Identificação: sem código, código de 7 dígitos em branco, código nominal, lote; nomes/turmas curtos e muito longos.
- Cabeçalho: sem logotipos, logo esquerdo, dois logos, texto longo, campos personalizados, datas válidas e vazias.
- Saídas: prévia SVG, impressão/PDF, PNG e JPG; A4 100% sem escala adaptativa; modo incorporado sem regressão.
- Estrutura: nenhum rodapé visível de revisão/modelo/hash; títulos centralizados; bordas realmente fechadas ao redor das seções; não duplicar questões.
- Colisões: verificar bounding boxes entre texto, logotipos, grade óptica, bordas, bolhas, marcadores, títulos e área de assinatura opcional. Rejeitar ou reorganizar se impossível.

### 6.2. Homologação física (obrigatória antes de publicação)

1. Imprimir cartões sintéticos de 20 e 50 questões em P&B em impressora comum, A4 sem ajuste à página.
2. Preencher algumas folhas com caneta preta e azul, uma marca por questão, marca fraca, rasura e código de 7 dígitos.
3. Capturar em dois celulares e duas condições de luz; variar leve rotação e perspectiva.
4. Verificar reconhecimento dos quatro fiduciais, identificação por código, escolhas e falso positivo em bolhas vazias.
5. Registrar taxa de leitura, erros, casos de revisão e imagens sintéticas sem dados pessoais reais. Comparar com a versão anterior.
6. **Bloquear publicação** se o redesign piorar a leitura ou produzir erro de identificação, ainda que visualmente melhor.

### 6.3. Gates de engenharia

- Executar CI e testes relevantes; adicionar testes visuais de regressão (render de SVG/PDF) e geométricos para colisão.
- Mostrar *antes/depois* com dados totalmente fictícios.
- Documentar alterações de manifesto/layout/revisão e incompatibilidade com cartões antigos, se houver.
- Cartões antigos precisam continuar reconhecíveis com seu manifesto original; evitar migração destrutiva.
- Validar desktop e celular na interface de configuração e prévia.
- Abrir PR **sem merge, sem deploy de produção e sem alteração D1/Workers** até aprovação explícita.

## 7. Ordem de execução e entregáveis do Codex

**Etapa A — diagnóstico e protótipo:** auditar o código do PR #31, identificar bloqueios geométricos, propor o cabeçalho e as molduras com wireframe/previews de 20 questões; apresentar a proposta visual e limitações técnicas.
**Etapa B — implementação:** aplicar CV-01 a CV-09, preservar os contratos do leitor, ampliar testes de colisão, verificação visual e regressão.
**Etapa C — homologação e PR:** gerar PDFs e SVGs sintéticos para 20/50/100 questões, relatar CI, checklist físico pendente e criar/atualizar PR em draft para revisão. Não integrar à `main` sem autorização.

**Arquivos de entrega esperados**: relatório técnico de modificações, PDFs comparativos (com dados fictícios), imagens das variantes, logs dos testes, incompatibilidades potenciais, checklist físico e link do PR. Não publicar como “homologado” sem fotografias/testes reais.

## 8. Não objetivos

- Não mudar o caderno de questões, notas, Diário, D1, Workers, autenticação ou dados acadêmicos.
- Não copiar códigos, logotipos ou informações sensíveis do EducaDF/SIAP.
- Não prometer 150 questões se a geometria do A4 não permitir.
- Não introduzir QR obrigatório, assinatura obrigatória ou componente opcional que crie colisão.
- Não gravar dados nominais ou credenciais em capturas, logs, PRs ou exemplos.

## 9. Referências internas SALTA

- `AGENTS.md` — contexto permanente para Codex.
- `docs/SALTA_DIRETRIZES_PRODUTO.md` — memória comparativa EducaDF/SIAP.
- `docs/SALTA_CORRETOR_REVISAO_VISUAL_20261114.md` — problemas iniciais C-01 a C-05.
- PR #31 — limpeza da interface e contexto para implementação: <https://github.com/d4nny3l/portal-do-aluno/pull/31>.