# SALTA SCAN LAB — Protótipo independente

Digitalizador experimental de documentos: detecção automática de folhas em fundos variados, captura por câmera ou foto da galeria, recorte por quatro cantos, correção de perspectiva, tratamento de sombras em cor/cinza/P&B, edição dos cantos, rotação e PDF multipágina.

## Uso

Página isolada: `https://d4nny3l.github.io/portal-do-aluno/laboratorio/salta-scan/`.

- Acesse por HTTPS em Safari/iPhone ou Chrome/Android; toque em **Abrir câmera** e autorize a câmera. O navegador seleciona a câmera traseira automaticamente (`facingMode: environment`) e o aplicativo solicita `focusMode: continuous` somente quando o aparelho disponibiliza essa capacidade. Caso contrário, usa o foco padrão do celular; não é possível garantir qual lente interna será selecionada.
- Enquadre uma folha inteira, com quatro bordas visíveis. A captura acontece automaticamente após estabilização; não há botão manual de disparo nem seletor de lentes.
- Se a detecção falhar ou se a câmera não estiver acessível, toque em **Importar foto** e ajuste os quatro cantos manualmente.
- Experimente as aparências Cor aprimorada, Cinza, Preto e branco, Original. Salve como PDF A4, Carta ou proporcional, ou JPEG.
- Fotos, pixels e PDF ficam no navegador; não existem endpoints para upload e a página aplica CSP restritiva.
- Toque na miniatura para visualizar a foto e no **× Fechar foto** para sair da visualização. **Fechar câmera** libera o acesso à câmera sem excluir as páginas já digitalizadas.
- As páginas ficam na memória da aba, sem sincronização. Exporte antes de fechar ou recarregar.

## Fonte, direito de reutilização e adaptações

Base de scanner original **Scancat**, © 2026 Nipun Batra, licença MIT: https://github.com/nipunbatra/scancat. A licença integral encontra-se em `LICENSE-SCANCAT-MIT.txt`.

Mantidos com atribuição `js/vision.js`, `js/worker.js`, `js/pdf.js` e estilos base `css/style.css`. O fluxo `js/app.js` foi adaptado para interface SALTA, idioma, captura local de imagens importadas e processamento em navegador. Adicionada camada visual `css/salta-scan.css`, ícone e página próprios.

O projeto priorizou JavaScript puro sem bibliotecas grandes. Alternativas estudadas: `quannqit/doc-scanner` (MIT), `julian-r/scanoficus` (BSD-3-Clause), `puffinsoft/jscanify` (MIT, usa OpenCV.js), `petermartis/docuSnap` (MIT, fluxo de qualidade), `santiagoisra/nitidoc` (AGPL). Os algoritmos desses outros projetos não foram copiados aqui.

## Escopo/limites

- O laboratório é um scanner **de documentos** sem identificação de aluno, leitura OMR, modificação de notas ou integração com o Corretor.
- PDF e JPEG resultam de fotografia: não há garantia de equivalência a digitalização profissional, correção de curvatura de livros, OCR, texto selecionável, autenticidade documental ou remoção perfeita de reflexos.
- P&B pode eliminar detalhes coloridos; use Cor aprimorada ou Original para assinaturas, timbres e carimbos.
- Qualidade e velocidade variam conforme aparelho, iluminação, foco, sombra e resolução. Não foram realizados testes físicos em dispositivos do proprietário.
- O reconhecimento geométrico é heurístico. Sempre confira os quatro cantos antes de exportar.
- Não há armazenamento persistente de documentos, login, banco de dados ou conexões com Worker/D1/Stats.

## Revisão UX — câmera e fechamento (24/11/2026)

- Seletor de lentes e cache de `deviceId` removidos; o navegador/sistema decide a lente traseira automaticamente.
- Foco contínuo solicitado somente por `getCapabilities()` / `applyConstraints()` quando suportado. Sem troca de câmera e sem falha se o Safari ignorar a configuração.
- Captura automática sempre ligada; botão e atalho de disparo manual removidos.
- Visualização de foto recebe botão `×` de fechamento; modal interrompe a detecção em segundo plano durante edição.
- `Fechar câmera` desativa vídeo e preserva os documentos já capturados.
- Validação automatizada com objetos de navegador simulados e verificação de todos os IDs DOM. Homologação física em Safari/iPhone e Android permanece necessária.
