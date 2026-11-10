# Corretor SALTA — câmera mobile, interface e rota canônica

**Data:** 9 de novembro de 2026
**Base:** merge do PR #24, `43e6260042aecea4ba439f944cdb8ef0cffc48f0`

## Alterações

- `corretor/v2/omr/normalize.mjs` localiza quatro componentes quadrados escuros, verifica a geometria quadrilateral e corrige inclinação, rotação de 90° e perspectiva para o raster A4 do template OMR v4. A leitura continua usando as coordenadas versionadas existentes.
- Se os marcadores não forem encontrados com a confiança geométrica mínima, a interface não inicia a leitura automática. A alternativa manual permite selecionar os centros dos quatro marcadores na ordem indicada, valida os pontos e aplica a mesma transformação.
- A câmera pede permissão somente após o professor tocar em **Abrir câmera**, solicita a câmera traseira e resolução ideal alta, lê `videoWidth`/`videoHeight`, usa `playsinline`, não corta a imagem com `object-fit: cover` e mostra os marcadores como reconhecidos somente após a detecção real.
- O enquadramento é observado em intervalos internos. A captura automática exige três quadros estáveis; há intervalo interno mínimo de 2 segundos e a câmera só aceita outra captura automática depois de detectar a retirada da folha. **Refazer última leitura** substitui a entrada mais recente da sessão.
- Respostas em branco, múltiplas ou ambíguas permanecem para conferência manual. A nota é provisória, só aparece após conferir todas as respostas e não é enviada ao Diário.
- As imagens, respostas e histórico de captura ficam apenas na memória da página durante a sessão. Nenhuma imagem ou nota é enviada a Worker, D1 ou armazenamento remoto.
- A folha e as demais áreas passaram a usar uma folha CSS própria, derivada dos componentes SALTA e do shell comum. O menu segue a ordem, os SVGs e a navegação mobile do Diário e da Área do Professor.
- Os links normais da plataforma apontam para `plataforma/corretor-v2.html`. `corretor/index.html` redireciona para essa rota; a implementação anterior foi preservada em `corretor/legado-eja.html`, sem acesso na navegação normal, para proteger a lógica e os cartões EJA durante a homologação.
- Foram removidos os rótulos de desenvolvimento da interface. A tela continua informando no momento pertinente que os dados não persistem entre sessões.

## Validação executada

Comandos executados localmente:

- `node --test corretor/v2/tests/*.mjs` — 16 testes passaram. Inclui geometria A4 e cartões de 10, 20, 30, 50 e 100 questões; formatos mistos; marcadores ausentes ou fora do quadro; foto inclinada; foto em paisagem; normalização seguida de leitura v4; e estados em branco, dupla marcação e ambiguidade.
- `node --check /tmp/salta-corretor-v2-inline.mjs` — sintaxe do JavaScript inline extraído da página.
- `node --check corretor/v2/omr/normalize.mjs` — sintaxe do módulo de normalização.
- `git diff --check` — sem erros de whitespace.
- Verificação estática dos IDs da página — nenhum ID duplicado; referências locais existentes.
- Busca de rotas HTML usuais — nenhum link de navegação restante para `../corretor/` ou `corretor/index.html`.
- Comparação de bytes — `legado-eja.html` é uma cópia do antigo `corretor/index.html` existente na base antes da mudança de rota.

## Limitações e homologação física

- Os testes de localização e retificação usam imagens sintéticas. Eles demonstram o contrato geométrico e a integração com o leitor, mas **não medem a precisão em fotografias reais**.
- Não houve teste em iPhone físico, Safari iOS ou Android físico nesta etapa. Permissão da câmera, foco, iluminação, rotação EXIF e diferenças entre navegadores ainda precisam ser homologadas em dispositivos reais.
- A confiança da localização é uma heurística geométrica, não uma probabilidade calibrada. Desfoque forte, sombra, baixo contraste, cartões cortados e marcadores cobertos podem exigir reenquadramento ou ajuste manual.
- PDFs não são aceitos nesta revisão; a importação disponível é de imagem. A nota para modelos com várias páginas é adiada até a conferência de todas as páginas; não há persistência nem integração com o Diário.
- A sessão mantém no máximo o histórico de leitura em memória; recarregar ou sair da página apaga esse histórico.

## Infraestrutura

Nenhum Worker, D1, secret, autenticação, dado escolar ou gabarito real foi alterado. Esta alteração contém somente frontend estático, módulo OMR local, redirecionamento da rota antiga e testes sintéticos.
