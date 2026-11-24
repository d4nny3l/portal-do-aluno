# SALTA — PDF direto #125

## Base e finalidade

Base: `main@14fa328e178bfa359de7177dce51d06283b4fc0c` (inclui salvamento integral #121 e composição econômica #124). Mudança restrita à **exportação em PDF no navegador**. Sem modificações no OMR, leitor, manifesto, conteúdo/hash, gabarito, avaliação, criptografia, Auth, Stats, Cloudflare, D1 ou Worker.

A ação principal passa a ser **Baixar PDF**; a impressão nominal em lote passa a **Baixar PDF do lote**. Não há `window.open`, `window.print`, diálogo de impressão ou serviço remoto por trás dessas ações. Os SVGs aprovados continuam disponíveis para SVG/PNG/JPG/JSON. O botão usa `Blob({type:'application/pdf'})` e a âncora de download do navegador, com os nomes fixos:
- `cartao-respostas-a4.pdf` — cartão independente ou quadro incorporado normal centrado no A4;
- `cartao-respostas-2-por-a4.pdf` — composição econômica de duas cópias idênticas;
- `cartao-respostas-4-por-a4.pdf` — quatro quadrantes;
- `cartoes-resposta-lote.pdf` — PDF multipáginas, respeitando ordenação e seleção.

## Pipeline técnico

`corretor/v2/omr/pdf-download.mjs` renderiza o SVG do **mesmo manifesto ativo**, incluindo identidade/cabeçalho da revisão, e transforma seu desenho em comandos PDF vetoriais via jsPDF + svg2pdf.js. Para quadros econômicos, chama diretamente `buildEconomySheetSvg` no módulo da #124, de modo que a composição de escala/posicionamento/guia/tesoura não é reimplementada nem recalculada. Para o lote, utiliza o mesmo `bindStudentToManifest` do gerador histórico, numa cópia em memória por aluno. Os dados nominais são locais e não entram em logs nem chamadas de rede.

Cada página recebe MediaBox A4 em pontos, derivado da orientação efetiva: 595,2756×841,8898 pt (retrato) ou 841,8898×595,2756 pt (paisagem). O SVG A4/embedded é centralizado sem ampliação adicional; o econômico usa exatamente os fatores uniformes da #124. Campos de controle, bolhas, fiduciais, textos, logotipos e ícone de tesoura são preservados em coordenadas da fonte.

Os arquivos das bibliotecas são carregados **somente na primeira geração**. O botão fica desabilitado enquanto a conversão prossegue, mostra **Gerando PDF…**, e volta ao estado original depois de sucesso/erro. Lote de até 500 páginas conserva o limite existente, com liberação periódica do loop ao navegador. Não há autorrequisições PUT nem alteração do estado salvo.

## Dependências locais pinadas, sem CDN/API paga

| Distribuição | Versão | Licença | Git blob SHA-1 original |
|---|---|---|---|
| `plataforma/vendor/pdf/jspdf.umd.min.js` | jsPDF 4.2.1 | MIT | `0e600d49d2b2bf81dd97c1509e22d108c2ddd3b4` |
| `plataforma/vendor/pdf/svg2pdf.umd.min.js` | svg2pdf.js 2.9.0 | MIT | `14cc33e1641818d84ebae6202ca4ba48aee68dfc` |

Fontes: tags `parallax/jsPDF@v4.2.1` e `yWorks/svg2pdf.js@v2.9.0`, reproduzidas byte a byte. Licenças completas em `plataforma/vendor/pdf/LICENSE.jspdf` e `LICENSE.svg2pdf`. Os distribuídos somam aproximadamente 508 KB antes de compressão HTTP e **não** integram o carregamento inicial do Corretor. Atributo Git específico preserva os espaços em branco dos avisos legais sem falhar `git diff --check`. Ferramentas pdf-lib/pdfjs-dist/Playwright são apenas de **CI**, não incluídas no produto.

## Testes, evidências e limites

- Contrato Node: assinaturas de arquivo e licenças, PIN de blobs originais, imutabilidade geométrica, ausência de janela/impressão no fluxo, UI/lote.
- Chromium hermético: clique real, evento de download, nome e bytes `%PDF-`, sem popup, print nem PUT; parsers externos confirmam `MediaBox`, número de páginas, comandos vetoriais e textos.
- Formatos cobertos: A4 independente, embedded unitário, 2/4 por A4 (100×160, 120×180, 180×240 mm) e lote sintético 2/3 páginas com ordenação e seleção de páginas.
- PDF e imagens candidatos em artefatos de GitHub Actions, sem cadastro real e sem produção.
- Os workflows históricos de #120/#122 preservam suas proteções; o classificador de escopo da #125 é aplicado somente ao PR autorizado, verificando a integridade da seção de correção e a allowlist exata.

Riscos: Safari/iOS pode apresentar sua interface nativa de arquivos/visualização apesar de o site não abrir abas; dispositivos móveis de pouca memória podem exigir menor lote por operação. A compatibilidade física de impressão (100%/tamanho real) e leitura óptica dos cartões econômicos reduzidos depende da homologação real do proprietário. Emulação mobile não substitui teste em aparelho físico.

**É proibido declarar os cartões reduzidos homologados opticamente sem impressão/recorte/câmera reais.** Nenhum merge/deploy é autorizado pelo PR de implementação; requer SALTA AUDITOR TÉCNICO e novo GO do proprietário.
