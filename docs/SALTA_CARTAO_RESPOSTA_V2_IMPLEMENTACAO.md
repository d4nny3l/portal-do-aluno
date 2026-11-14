# SALTA V2 — cartão-resposta, compatibilidade e publicação

Data: 14/11/2026. Base: PR #31, `0953be74811bc12e83ddfd1d5951941e0ecc38d9`.
Pedido aprovado: `SALTA_CARTAO_RESPOSTA_V2_SPEC.md`. A autorização desta rodada inclui merge e GitHub Pages após critérios automatizados e revisão visual; impressão/fotografia física não é declarada homologada e permanece pendente.

## O que mudou

- Cabeçalho único com moldura arredondada de 1 mm, divisórias retas e identificação institucional livre multilinha. Cada quebra explícita é preservada. A região institucional desaparece quando vazia; logos opcionais mantêm reserva simétrica e título centralizado.
- Título fixo CARTÃO DE RESPOSTAS e subtítulo da avaliação/componente sem repetição quando o componente já consta no título. PROFESSOR/TURMA/DATA ficam na mesma faixa, com proporções 40/38/22. Quebras de texto controladas; excedente não é espremido nem truncado silenciosamente pelo renderizador.
- Nome em moldura própria. Identificação manual, nominal, com código e ausente. Sem identificação remove a região e seu espaço; a turma nominal é mostrada no cabeçalho quando não existe turma global, sem duplicá-la junto ao nome.
- Código opcional em módulo independente. Em composições curtas fica centralizado após as respostas. Em composições densas pode ocupar o final de uma coluna do corpo. Nunca faz parte do cabeçalho.
- Letras pretas convencionais (Arial, sem contorno ou efeitos). Bolhas continuam com diâmetro de 4,5 mm; fiduciais quadrados de 5,5 mm com centros a 8 mm. Borda externa reta; molduras internas arredondadas.
- Colunas uniformes e seções de altura natural. O empacotamento percorre a ordem visual, reutiliza a parte livre da coluna para a próxima seção e repete o título nos segmentos de continuação. Não duplica questões. O passo das linhas só é compactado quando necessário, respeitando o mínimo de 4,85 mm; círculos não são reduzidos.
- Instruções opcionais, desligadas por padrão; sem área reservada quando desligadas.
- Impressão A4, SVG, PNG/JPG a 300 DPI, JSON e lotes preservados. Regra da última folha mantém uma página por cartão.

## Versão e modelo exato

O template novo é `salta-omr-a4-v8`, com manifesto `salta-layout-manifest-v2`. O hash inclui geometria, cabeçalho e apresentação; dados nominais e preenchimento do código não mudam o hash da composição. O compositor V1 está preservado em `layout-v1.mjs`, e seu render em `render-v1.mjs`.

Na interface é possível escolher V2 ou V1. A correção aceita o **manifesto exato** do cartão gerado ou importado por JSON. Importação não recalcula a geometria nem deduz a versão pela fotografia. Modelos desconhecidos/incompatíveis são rejeitados. Ao trocar/importar modelo, respostas e nota provisória anteriores são retiradas da tela para não misturar contextos.

A compatibilidade foi verificada com 15 hashes/digests ópticos arquivados antes da V1, além de testes de leitura com manifesto V1. Não se promete reconhecer qualquer cartão histórico sem seu modelo. A rota legada permanece disponível; não foi reescrita.

O leitor `salta-omr-reader-v5` amostra as coordenadas do manifesto selecionado. Além das respostas, lê as sete colunas do código e retorna revisão se a identificação estiver vazia, dupla ou incompleta. Não associa automaticamente a um cadastro, não envia nota ao Diário e não publica resultados acadêmicos.

C-D-U é gerado, mas continua sem correção automática. Quadros incorporados têm geração física preservada; leitura exige enquadramento próprio e é bloqueada explicitamente para evitar aplicar a homografia A4 a outro formato. QR continua indisponível, sem marca demonstrativa enganosa.

## Arquitetura

- `assessment.mjs` e `template.mjs`: definição, identificação ausente, texto institucional e seleção explícita V1/V2.
- `layout.mjs`: despacho versionado. `layout-v1.mjs`: contrato histórico preservado. `layout-v2.mjs`: medidas, regiões, empacotamento e validação de limites/colisões.
- `render.mjs`: apresentação V2. `render-v1.mjs`: render histórico. O rodapé técnico continua ausente, com metadados internos.
- `manifest.mjs`: importação validada de JSON do modelo, sem usar sessão/rede acadêmica.
- `reader.mjs`: coordenadas do modelo ativo/importado e conferência do código. `normalize.mjs`: somente endereço versionado de importação atualizado; algoritmo de perspectiva/câmera preservado.
- `export.mjs`: mesmo manifesto para prévia e saídas. Dados nominais não integram a definição JSON reutilizável.
- Página/CSS do Corretor: aba Título, identificação institucional multilinha, modos, instruções e importação. Links canônicos/cache atualizados; sem mudança de autenticação.

## Testes executados

| Grupo | Cobertura |
|---|---|
| Integrados | 70 testes aprovados de Corretor, plataforma e Worker; sintaxe dos módulos/scripts e diff sem erros |
| A4 | A-D/A-E/C-E × 10/20/50/100/150 com capacidade real, círculos fixos, colunas uniformes, molduras e numeração |
| Variantes | 18 combinações de identificação manual/ausente/código × instituição vazia/uma/duas linhas × instruções ligadas/desligadas |
| Cabeçalho | Um/dois logos sintéticos, textos extensos, datas válidas/inválidas, centralização e erro explicável |
| Mistos | Seções desiguais A-D/C-E/A-E ocupando espaços verticais, e geração mista com CDU |
| Leitura | Raster real do SVG a 300 DPI, cartões vazios e alternativa C preenchida; dupla e fraca exigem conferência; código nominal fictício 0001200 reconhecido |
| Exportação | SVG e PNG/JPG 20/50/100; JPEG vazio sem marca falsa; documentos vetoriais e documento de impressão do exportador |
| V1 | 15 digests/hashes ópticos arquivados, modelo antigo selecionado e importação JSON sem recomposição |
| Navegador | Desktop de 1470 px; instituição em duas linhas, subtítulo e código independente; Chrome confirmou uma página A4 na impressão |
| Mobile | Viewport medido 390×844; modo sem identificação remove Nome/código, instruções aparecem quando habilitadas, sem overflow horizontal |

Os exemplos são inteiramente fictícios. A CI raster publica apenas SVG/PNG/JPG/JSON sintéticos. Os logs e exemplos finais, PDF salvo pelo Chrome e comparação V1/V2 são entregues na pasta local de saídas. Resultados e links definitivos de CI/merge/deploy constam no PR e na entrega final, após as respectivas verificações.

## Limites e segurança

Não houve impressão em papel, ensaio com canetas, câmera física, fotos reais ou avaliação em diferentes celulares/impressoras. Os resultados sintéticos não medem precisão em condições reais. A publicação autorizada desta interface não constitui homologação física do leitor.

A grade não é identificador automático de versão; exige o modelo correto. Não confundir código lido com autenticação ou autorização de aluno. Valores ambíguos não devem virar nota definitiva. CDU e enquadramento incorporado permanecem bloqueados para leitura.

Não foram alterados Diário, notas, frequência, banco D1, Worker, credenciais ou autenticação. Testes persistentes acadêmicos não foram executados. A inspeção local usa sessão simulada com conexões externas bloqueadas; a verificação publicada usa o fluxo normal de acesso.

## Publicação e reversão

Fluxo existente: Pages a partir de `main`, raiz do repositório. Não há necessidade de deploy de Worker. Antes do merge: CI verde, inspeção visual, conferência de escopo e commit exato. Depois: conferir build/deploy Pages e arquivos públicos por conteúdo, além de geração básica na URL publicada.

Reversão: reverter os commits V2 por novo PR, preservando os arquivos/modelos V1. Nenhuma migração de banco é necessária. Manter os JSONs de modelos emitidos para leitura histórica; não substituir silenciosamente suas coordenadas.

## Conferência da retomada

A retomada encontrou a branch `codex/salta-cartao-v2-20261114` no HEAD V1 `0953be7`, com a implementação V2 não commitada preservada. O PR #31 continuava aberto/em rascunho e a `main` em `4411dcf`, contendo o hotfix `a93089e`. Não houve reinicialização do projeto.

Foram repetidos apenas os testes necessários para conferir o estado final: 70 testes integrados passaram; a regressão raster e as 18 combinações passaram; sintaxe e diff foram verificados. Os quatro exemplos PDF foram atualizados a partir do SVG final e renderizados para inspeção, incluindo a manutenção da seção curta Lógica inteira na avaliação mista. Os quatro documentos têm uma página A4. O PDF adicional salvo pelo Chrome registra a conferência nativa de impressão; os outros foram convertidos do SVG vetorial com ReportLab/svglib.

O estado local mantém textos extensos até os limites explícitos dos campos; excedentes nos campos principais geram mensagem para revisão, sem corte silencioso. O relatório local de entrega registra os SHAs e os resultados efetivos de CI, merge e Pages depois da publicação.
