# SALTA — câmera automática, lente principal e zoom nativo (P1)

**Branch:** `feat/salta-camera-auto-lente-20261117`. Base `main af467942706f3b715c258b23ee9090ba26adaa7d`. **PR separado do #51; sem merge ou publicação.**

## Diagnóstico do campo de visão
O Corretor já desenha o vídeo com `object-fit:contain`, sem `scale` CSS; a extração `drawVideoFrame` lê todo o `video.videoWidth × video.videoHeight` numa matriz proporcional. O navegador pode, porém, selecionar lente ultra-angular, teleobjetiva ou câmera virtual por `facingMode`; limites de dimensão e `resizeMode` não garantem o campo de visão físico. Relatos antigos de WebKit registram peculiaridades de câmeras virtuais iOS; não há captura do dispositivo do proprietário, portanto **não é possível provar qual lente efetivamente causou o zoom aparente**.

O código anterior já ordenava dispositivos por rótulo e preferia a câmera traseira física sem qualificadores ('Back Camera') acima da virtual/tripla, da ultra-angular e da frontal. Esta melhoria preserva a classificação e recusa uma câmera cuja `getSettings().facingMode === 'user'` ou cujo rótulo seja explicitamente frontal. A primeira requisição pede `facingMode: { exact: 'environment' }`. Caso Safari não suporte ou não consiga entregar a câmera traseira, mostra mensagem e mantém a importação de imagem; não troca silenciosamente para câmera frontal.

Quando `getCapabilities().zoom` fornece limites numéricos e `getSettings().zoom` informa um zoom acima do mínimo, solicita `applyConstraints({advanced:[{zoom:min}]})`. **Não presume que 1.0 é válido**. Valida se `getSettings().zoom` realmente diminuiu antes de registrar sucesso. Sem capability, sem valor atual ou se o navegador recusar, preserva o stream sem aplicar zoom artificial. `getConstraints` é consultado apenas para diagnóstico local; nenhum log externo ou upload. Essa escolha é uma tentativa de recuperar o campo de visão nativo, não garantia de lente física correta.

## Captura inteiramente automática
- Remove botões **Fotografar** e **Ler imagem**, assim como a seleção manual de câmeras. A interface comum passa a ter **Abrir/Fechar câmera**, botão **💡 Luz** real quando disponível, **Importar fotografia** e mensagens/guia.
- Preserva `scanCameraFrame()`, com os mesmos limites de confiança da geometria, brilho, foco, estabilidade e `stableFrames>=3`; não modifica limiar nem pixels do leitor.
- A captura processada coloca `waitingForRemoval=true`; duas verificações sucessivas sem a folha liberam a próxima. A falha de normalização ou leitura não trava a próxima tentativa.
- Importar uma imagem agora normaliza e chama `readNormalized()` automaticamente. Reimportar o mesmo arquivo é possível; não há necessidade de controles manuais ocultos.
- O botão de luz reutiliza `applyCameraControl('torch',...) `; câmera fechada ou troca de stream desliga iluminação sempre que suportado.
- Nenhum dado, foto ou nota é enviado a servidor como parte dessas mudanças; serviços acadêmicos não foram tocados.

## Regressões e limites
Testes Node/CI: chamada nativa de zoom com limite não 1, restrições recusadas/ignoradas, câmera principal versus ultra, bloqueio de frontal, fallback traseiro, permissão negada e recuperação, foto importada e reimportação, capture-quality, 3 quadros estáveis, prevenção de duplicação, retirada da folha e reinício após falha. Regressões das marcas e notas continuam independentes no PR #51. **Estes testes simulados não comprovam camera física do Safari/Android.**

Homologação no iPhone: abrir Corretor no Safari HTTPS; autorizar câmera; confirmar que o quadro mostra a folha A4 completa a distância confortável; checar se os quatro cantos ficam verdes; aguardar captura automática; retirar folha e apresentar outro cartão; repetir com luz moderada, lâmpada e importação. Anotar se o Safari permite trocar o campo de visão e se `torch` aparece. Se persistir enquadramento muito estreito, coletar localmente apenas os valores de `zoom` (`min/max/current`), `facingMode`, `resizeMode`, `videoWidth×videoHeight`, sem identificadores ou fotografias reais. Não declarar câmera homologada sem esse teste.

**Critérios de merge:** CI verde do HEAD exato; revisão de segurança e regressão proporcional ao risco; autorização específica. Não alterar `main`, PR #44/#51, Auth, Diário, Workers ou D1.
