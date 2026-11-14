# SALTA V2 — correção da faixa administrativa e dos logotipos

Base publicada: `8de3228d4308e01cf988490ce4019ebab2aa7ca3`. Solicitação de 14/11/2026 autoriza PR, merge após CI/revisão visual e publicação Pages. Escopo restrito ao cabeçalho e à apresentação dos logos.

## Correções

- Professor, Turma, Data, Ano/série, Ano letivo e campos personalizados habilitados ocupam uma única faixa. Larguras variam conforme o conteúdo; fonte administrativa permanece 2,6 mm, com até duas linhas dentro de cada célula. Rótulos compactos e divisórias únicas, sem linhas adicionais abaixo da faixa.
- Visibilidade é respeitada tanto na composição quanto na interface. Alterar um valor não reativa uma opção que o professor ocultou. Instituição/componente também respeitam as respectivas opções; o título principal continua fixo. Menos conteúdo permite uma faixa menor; sem campos não há faixa vazia.
- Campos semanticamente duplicados com mesmo valor são impressos uma vez. Duplicações conflitantes exigem ajuste explícito. Excesso de texto bloqueia a prévia e as exportações com mensagem; fontes não são comprimidas, textos não são cortados e a composição não cria uma segunda faixa.
- Uma turma global vazia conserva espaço para duas linhas de turma nominal no lote, sem recalcular o modelo por estudante. Turmas nominais que não cabem recebem erro explícito.
- O snapshot imutável do cabeçalho é independente do estado do editor. Antes, congelar o manifesto também congelava a lista de campos personalizados, impedindo adicionar/editar após gerar. A lista agora continua editável e o manifesto anterior não muda.
- Logos usam apenas saturação zero em sRGB, com alpha intacto. Removida a transferência discreta 0/1 que apagava detalhes claros e transformava meios-tons em blocos pretos. Preservados `xMidYMid meet`, proporção original, limite de 26 mm de largura e 22 mm de altura. Texto institucional e um/dois logos ficam centralizados verticalmente na mesma região; reserva lateral simétrica mantém o texto no centro da folha.

## Contrato OMR

Não houve mudança de algoritmo de leitura, câmera ou normalização. Diâmetros de 4,5 mm, passos protegidos, áreas de segurança, fiduciais de 5,5 mm e seus centros foram mantidos. A altura corrigida do cabeçalho pode alterar o início do corpo; as coordenadas efetivas são calculadas pelo compositor e registradas no manifesto/hash exatos, com `headerRevision: salta-v2-header-1`. Não se reutilizam coordenadas novas para uma folha anterior.

V1 permanece preservada e o leitor continua aceitando o manifesto V2 publicado antes desta correção. Uma fixture integral desse modelo anterior foi arquivada; importação, igualdade das coordenadas e leitura são verificadas sem recomposição. Alterações em imports dos módulos antigos e do leitor são apenas endereços de cache. Links e meta da página usam `20261114v2h1` / `v2-20261114-h1`.

## Validação

- Oito novos testes: faixa com sete campos, visibilidade/altura, excesso seguro, duplicatas/conflitos, edição após congelamento, turma nominal em lote, três proporções/dois logos e manifesto V2 anterior exato. Suíte integrada: 78 testes aprovados localmente.
- Raster de logos quadrado, vertical 1:4, horizontal 4:1 e dois simultâneos. Imagens sintéticas têm fundo transparente, preenchimento claro com alpha 0,6, cinza intermediário e traço fino. Amostras renderizadas esperadas 255/228/144 confirmam transparência, meio-tom e detalhe claro; limites e ausência de sobreposição são validados.
- Em todos esses cartões: nenhum falso positivo em branco, alternativa C preenchida reconhecida e quatro marcadores detectados. Regressão geral: A-D/A-E/C-E × 10/20/50/100/150, 18 combinações de identificação/instituição/instruções, JPEG/PNG, dupla/fraca, código nominal e modelos históricos.
- Navegador local com sessão simulada isolada: campos opcionais visíveis, inclusão/edição de campo após gerar, seis campos na mesma faixa, excesso com prévia vazia e botão de impressão desativado. Nenhuma alteração de autenticação no código servido em produção.
- Comparações antes/depois derivadas do render da versão publicada e desta correção, com as mesmas imagens/dados fictícios, em SVG e PNG. PDF comparativo de quatro páginas e cartão A4 de uma página renderizados e inspecionados. Os PDFs de evidência são compostos com rasters do SVG; o cartão usa 300 DPI. Não são prova de impressão física nem PDF salvo pelo Chrome nesta rodada.

O upload pelo conector do Chrome exigiu acesso a file URLs e não foi concluído; essa permissão não foi alterada. O processamento dos mesmos PNGs foi verificado por raster/manifesto e os SVGs são fornecidos para conferência no navegador. Não foi possível operar a janela nativa de impressão enquanto o usuário utilizava o Chrome. O documento HTML imprimível acompanha as evidências; a validação PDF usou renderização local independente.

## Publicação, limites e reversão

A CI executa ambas as regressões raster e publica somente imagens sintéticas. Confirmar CI do HEAD, merge sem conflito, deploy Pages do merge e versão efetivamente servida/geração pública antes de declarar conclusão. Links definitivos e evidências públicas serão registrados no PR e no relatório local.

Não há alterações em Diário, notas, frequência, Workers, D1 ou autenticação. Sem dados reais nos testes. Ensaios de papel, caneta, câmera e diversidade de impressoras permanecem pendentes. Leitura de CDU e quadros incorporados segue bloqueada. Reversão por novo PR, sem migração ou alteração de banco; conservar manifestos emitidos.
