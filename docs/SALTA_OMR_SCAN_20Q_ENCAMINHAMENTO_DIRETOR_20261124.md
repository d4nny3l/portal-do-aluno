# SALTA — ENCAMINHAMENTO AO DIRETOR DE OPERAÇÕES
## Integração oficial do motor de digitalização ao Corretor OMR — 20/20 em campo

**Data do registro:** 24/11/2026 (Brasília)  
**Missão oficial no GitHub:** [Issue #132 — DIRETOR / OMR-SCAN-20Q](https://github.com/d4nny3l/portal-do-aluno/issues/132)  

**Origem:** proprietário da SALTA / laboratório experimental `salta-omr-capture-lab`  
**Prioridade solicitada:** P1 — avaliar, implementar em branch isolada, auditar e homologar.  
**Repositório:** `d4nny3l/portal-do-aluno`  
**Snapshot imutável para auditoria:** `ca3216112c45860743bfa21ee9efcac7035263ac`  
**Situação:** solicitação ao Diretor; **NENHUMA alteração no Corretor oficial foi autorizada por este registro**, nenhuma fusão/publicação do módulo em produção.  
**Documento complementar:** `docs/SALTA_OMR_SCAN_20Q_PACOTE_CODIGO_AUDITORIA_20261124.md`.

### 1. Decisão do proprietário — a regra superior

> **Manter a câmera atual da SALTA porque está perfeita. Não mudar o visual, os formatos, os controles, os textos ou a interface. Acoplar o motor de escaneamento comprovado no laboratório à captura existente, antes do leitor OMR. Somente duas mudanças visíveis estão autorizadas dentro do visor: o contorno/enquadramento da FOLHA e o flash/piscar no instante da captura, iguais ao experimento bem-sucedido. Nenhum texto novo.**

Proibido trocar a câmera oficial, alterar `CameraSession`, seleção de lente, foco nativo, zoom, resolução/negociação, torch, proporção de vídeo, navegação, layout, temas, labels, mensagens, painéis, botões ou desenho geral. Proibido transportar para o Corretor a solução **experimental de correção de câmera/enquadramento** que o proprietário rejeitou. A câmera já usada pelo Corretor é a fonte de quadros e permanece integralmente dona do `MediaStream`.

**Não há autorização para redesenhar o Corretor, implantar o laboratório inteiro ou incorporar de uma vez os arquivos `js/app.js`/CSS do protótipo.**

### 2. Evidência física — registrar sem inflar

- **Relato do proprietário:** no laboratório restaurado `PRIMARY STABLE`, uma prova/cartão com **20 questões teve as 20 questões lidas com sucesso** em ambiente classificado pelo proprietário como **completamente hostil**.
- **Versão atribuída pelo histórico à sessão:** `laboratorio/salta-omr-capture-lab/` após restauração do motor primário; snapshot Git `ca3216112c45860743bfa21ee9efcac7035263ac`. A interface do experimento compara leitura da foto original com a versão retificada.
- **Evolução anterior registrada:** antes da versão estável, um teste apresentou 19 de 20 questões reconhecidas e confiança geométrica reportada de 92% no caminho do scanner; o resultado de 20/20 é um novo relato do proprietário. Não substituir um registro pelo outro.
- **Limites:** ainda não foi anexado neste registro um conjunto independente de imagem original + imagem processada + resposta real por questão + dados do dispositivo/iluminação. Logo **20/20 = cobertura de marcações lidas relatada, não certificação independente de 100% de alternativas corretas**. Não inventar porcentagens, tempos ou métricas ópticas não coletadas.
- **Valor técnico:** prova de conceito física favorável da combinação `detecção da folha → retificação → realce → leitura SALTA` em condições adversas.

### 3. O que exatamente integrar

**Arquitetura alvo, com câmera oficial preservada:**

```text
CORRETOR OFICIAL (CÂMERA, STREAM, CONTROLES, VIEWPORT: INTACTOS)
   video atual → frame real da câmera oficial
     → localização estável do CONTORNO EXTERNO da FOLHA
     → mostrar SOMENTE o enquadramento/retângulo da folha no visor atual
     → disparo automático com estabilidade real e SEM fotos repetidas
     → piscar/flash visual breve SOMENTE no instante efetivo da fotografia
     → JPEG/raster original íntegro (não substituir por frame redimensionado da prévia)
     → retificação do quadrilátero EXTERNO do papel (homografia)
     → realce configurado e previamente testado do SALTA Scan (local, CPU/Worker)
     → conversão/ponte para o raster aceito pelo Corretor
     → reconhecimento dos QUATRO MARCADORES da prova NA IMAGEM CORRIGIDA
     → normalização oficial SALTA → readRaster() oficial → revisão/nota já existentes
```

**Invariantes geométricas essenciais:**
1. Os quatro cantos usados para escanear são cantos do **PAPEL**; os quatro marcadores pretos são centros internos do **CARTÃO**. **Nunca passar cantos do papel como `manualCorners` de `warpFromFiducials`**, porque a função espera os quatro fiduciais. O processamento em duas fases deve preservar essa distinção.
2. A câmera oficial continua entregando o **quadro inteiro nativo** (`drawVideoFrame`/canvas existente); o preview e o retângulo devem usar a transformação de coordenadas **já implementada** no Corretor (`containMapping`, `positionGuides` ou projeção equivalente). Proibido introduzir crop, espelho, zoom CSS, `object-fit:cover` ou alterar `video.videoWidth/Height` por conta do laboratório.
3. Detector de folha rápido pode usar amostra reduzida, mas o **raster de captura** deve vir da câmera oficial com a geometria mapeada ao raster efetivo, nunca da miniatura. O leitor não deve depender de redimensionamento por CSS.
4. O realce é **posterior** à captura, e não deve falsificar uma resposta, descaracterizar tinta fraca/dupla ou sobrepor a fotografia original. Manter a imagem original separada em memória para comparação, falha segura ou revisão.
5. O OMR oficial continua responsável por manifesto, hashes, revisão, quantidade de perguntas, código estudantil, gabarito, classificação de dupla/branco/parcial, revisão manual e nota; não duplicar essas regras no scanner.
6. **Quadros incorporados em provas**: explicitamente adiados pelo proprietário; não ampliar escopo nesta entrega.

### 4. Contratos do código atual que o implementador precisa respeitar

- `plataforma/corretor-v2.html`: `scanCameraFrame()` faz a leitura periódica da câmera oficial; `captureFrameGray()`, `prepareImage()`, `toPageRaster()` e `readNormalized()` constituem o pipeline existente.
- `corretor/v2/omr/camera.mjs`: `CameraSession`, `drawVideoFrame()`, `containMapping()`, `captureQuality()`, foco, zoom e negociação da lente **preservados**, exceto adaptação mínima justificada dentro do ponto de integração da foto — nunca substituir a câmera.
- `corretor/v2/omr/normalize.mjs`: `detectFiducials()`, `normalizeCard()`, `warpFromFiducials()` continuam sendo usados **após o scanner**.
- `corretor/v2/omr/reader.mjs`: `readRaster()` inalterado.
- `laboratorio/salta-omr-capture-lab/js/vision.js`: extrair/reutilizar com licença preservada `detectDocument()`, `outputSize()`, `warp()` e `enhance()`, com atenção à ordem das operações, tratamento de cores e coordenação de pixels.
- `laboratorio/salta-omr-capture-lab/js/worker.js`: referência de processamento local `warp → enhance → rotate`, **não** substituir o worker/controle de câmera do Corretor. O main thread não deve bloquear vídeo em captura.
- `laboratorio/salta-omr-capture-lab/js/app.js`: somente fonte para compreender a **estabilidade original** (10 observações válidas, tolerância de deslocamento 2% da largura, suavização 0,45, disparo de um frame, `flash()`). **Não copiar** sua lógica de abertura de câmera, CSS, layout, modo de visualização ou controles.
- `laboratorio/salta-omr-capture-lab/omr-lab.mjs`: referência de integração e comparação A/B com o leitor oficial; fluxo experimental não deve se tornar API de notas em produção.

### 5. Mudança visível permitida — duas, e apenas duas

**(A) Enquadramento da folha:** o vídeo/visor existente continua exatamente no mesmo tamanho e posição. Reaproveitar a camada de guias existente ou adicionar um elemento interno, visual e não interativo **sobre** o mesmo visor para desenhar a linha do quadrilátero do papel, sem deslocamento de layout e sem remover as guias atuais. Retângulo só deve surgir com geometria confiável. Nenhum badge, texto ou controle novo; sem mudança de cores gerais/temas.

**(B) Flash da captura:** um piscar curto sobre o próprio visor quando o frame **realmente for capturado**, sem congelar o preview, sem modal e sem alterar a posição de nenhum componente. Respeitar `prefers-reduced-motion` e não disparar o flash quando houver apenas detecção sem captura.

**Nada mais.** O nome do módulo, botões, labels, mensagens, controles, exibição de notas, histórico, câmera e CSS estrutural devem permanecer como estão. O Auditor Visual deve comparar antes/depois em desktop e celular. Não adicionar um único texto à interface.

### 6. Exclusões inegociáveis

- Não importar `framing.js`, `quality.js`, `marker-capture.js`, nova política de `cameraRegion`, `fullPaperVisible` experimental, controle de `getUserMedia`, ajuste de Safari, novo foco, novo zoom, novo `object-fit`, polling ampliado em 512 px, burst ou escolha de dois quadros. São tentativas históricas que **não** fazem parte da melhoria aprovada.
- Não trocar o gatilho para procurar os quatro quadradinhos em todos os quadros. A folha exterior é a detecção que o proprietário considerou rápida e eficaz. O leitor OMR pode continuar procurando fiduciais **depois** do escaneamento.
- Não introduzir bibliotecas pagas, serviços remotos para fotos, OCR externo, armazenamento de imagens de alunos, exportação não solicitada, ajustes em banco, Worker Cloudflare, Diário, segurança/autenticação ou registros acadêmicos.
- Não modificar arquivos do laboratório/versão aprovada durante a integração. Fixar o commit de referência e criar código adaptador **separado**.

### 7. Plano de execução recomendado ao Diretor

1. **DIRETOR DE OPERAÇÕES SALTA:** instituir missão P1 e aprovar escopo; designar dono da integração e congelar o snapshot `ca3216112c45860743bfa21ee9efcac7035263ac`.
2. **SALTA EXECUTOR / CODEX SALTA:** inspecionar as fontes imutáveis e criar uma branch exclusiva `feat/omr-paper-scan-engine-p1` a partir da `main` atual; implementar somente adaptador de detecção/retificação/realce e as duas respostas visuais admitidas. Não tocar em código fora do escopo sem justificar e retornar à Diretoria.
3. **SALTA AUDITOR:** revisar a diferença de cada arquivo, comprovar preservação da câmera/controles/textos e conferir OMR/manifesto, falhas seguras, desempenho, licença, privacidade, duplicatas, cantos geométricos, flash e não regressão.
4. **SALTA AUDITOR VISUAL:** comparar DOM, todos os textos, CSS e capturas do visor para certificar que **nenhuma outra diferença visual** foi introduzida.
5. **SALTA HOMOLOGADOR:** orientar execução física com o proprietário no Safari/iPhone: mesmo cartão de 20 questões, condições favoráveis e hostis, distância variada, sombras e movimento; registrar lista de alternativas versus verdade independente, revisão e rejeições.
6. **DIRETOR:** somente após pareceres, CI verde e autorização expressa decidir merge/deploy. Este registro é encaminhamento e não autorização automática de publicação do Corretor.

### 8. Critérios de aceite (gates)

- [ ] `CameraSession` e seus contratos nativos preservados; nenhum novo ajuste de lente, zoom, foco ou proporção.
- [ ] Nenhuma alteração de texto ou componente da interface existente; somente contorno externo e flash sobre o visor.
- [ ] Folha capturada **uma vez** depois de estar estável; nenhuma sequência frenética, nenhum bloqueio manual, possibilidade de próxima folha.
- [ ] Escaneamento produz imagem **retificada**, com todos os marcadores internos preservados; não cortar bolhas/margens e não misturar cantos da folha com fiduciais.
- [ ] OMR recebe raster retificado e continua respeitando revisão/hash/modelo; brancos, duplas, parciais e revisão humana preservados.
- [ ] O tratamento melhora ou mantém a leitura no conjunto de teste etiquetado, sem reduzir acurácia da alternativa marcada; caso degradado recusa ou recorre com segurança à fotografia original.
- [ ] Nenhum dado escolar ou imagem sai do navegador por causa do scanner; manter licença MIT e atribuição do motor Scancat.
- [ ] Testes automatizados de câmera e integração, casos adversos e auditorias independentes aprovados.
- [ ] Homologação física de 20 questões e cenários hostis, acompanhada de evidências reprodutíveis; não confundir cobertura 20/20 com acurácia.
- [ ] Merge e deploy somente após autorização explícita do proprietário.

### 9. Links para a Diretoria

- [Laboratório experimental vigente](https://d4nny3l.github.io/portal-do-aluno/laboratorio/salta-omr-capture-lab/?v=primary-restore-1)
- [Fontes do laboratório — snapshot imutável](https://github.com/d4nny3l/portal-do-aluno/tree/ca3216112c45860743bfa21ee9efcac7035263ac/laboratorio/salta-omr-capture-lab)
- [Corretor atual — snapshot imutável](https://github.com/d4nny3l/portal-do-aluno/blob/ca3216112c45860743bfa21ee9efcac7035263ac/plataforma/corretor-v2.html)
- [Motor de câmera oficial — snapshot imutável](https://github.com/d4nny3l/portal-do-aluno/blob/ca3216112c45860743bfa21ee9efcac7035263ac/corretor/v2/omr/camera.mjs)
- [Manifesto completo de código para auditoria](SALTA_OMR_SCAN_20Q_PACOTE_CODIGO_AUDITORIA_20261124.md)
- Histórico de integração conservadora: `docs/SALTA_INTEGRACAO_OMR_CAMERA_P1_20261118.md`.
