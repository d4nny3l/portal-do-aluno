# DOSSIÊ DE INTEGRAÇÃO — SALTA SCAN SAFE V2 / SCAN-INTEGRATION-01

**Data:** 25/11/2026. **Origem:** SALTA PESQUISADOR. **Destino:** DIRETOR DE OPERAÇÕES SALTA. **Prioridade proposta:** P1. **Estado:** especificação aprovada pelo proprietário; PR draft de preparação, não integração concluída. **Repositório:** d4nny3l/portal-do-aluno.

## 1. Mandato e referência congelada

O proprietário aprovou fisicamente o laboratório e solicitou o comportamento completo da câmera e da digitalização, sem prejudicar a forma como a nota aparece. A aprovação é relato qualitativo de uso real, não medição de acurácia universal. As dez decisões abaixo foram acordadas em sequência. Abrir PR para avaliação da Diretoria, não fazer merge/publicação oficial nesta etapa.

- Laboratório aprovado: https://d4nny3l.github.io/portal-do-aluno/laboratorio/salta-omr-scan-safe-02/?engine=edge&v=safe02
- Publicação: 195585572bdcefee809981aada4ee7614b7e023f; código candidato original 0942fe6b875131346d587103d8248f3aa0fe817b.
- Árvore experimental publicada: 80d374b9aa4536292abd87d643a77ab365288039. Preservar a página aprovada como referência de comparação.
- Relatório técnico: laboratorio/salta-omr-scan-safe-02/OMR-SCAN-SAFE-02.md.
- PR histórico #134: origem do Magic Scan; não confundir com este transplante. Issue #132 e PR #133 não são autorização de merge. O presente dossiê substitui a proposta antiga de manter a câmera oficial intacta, apenas no escopo desta futura integração aprovada.
- Base de inspeção oficial: 195585572bdcefee809981aada4ee7614b7e023f, plataforma/corretor-v2.html blob 8c14b0f45446bf30472f45a2cd5c99ed87f88788.

## 2. Decisões vinculantes do proprietário

| ID | Decisão | Aceite objetivo |
|---|---|---|
| D01 | Transplante completo da câmera (B) | Prévia, comportamento WebKit, proporção, contorno, enquadramento, captura e flash iguais ao laboratório; preservar o restante do Corretor. |
| D02 | Nota permanece até a próxima captura (B) | Câmera continua aberta; resultado anterior visível até o disparo seguinte, sem misturar estudante e nota; no disparo, invalidar apresentação anterior. |
| D03 | Magic Scan prevalece, sem comparação | Uma foto, um motor documental, uma única chamada ao leitor OMR, nenhum painel comparativo, nenhuma escolha de motor, nenhuma segunda leitura silenciosa em produção. |
| D04 | Congelar comportamento de captura | Manter parâmetros e experiência aprovados; sem aceleração artificial ou renegociação de resolução. |
| D05 | Identificação pendente não interrompe correção (B) | Mostrar nota local provisória quando respostas e gabarito permitirem; código pendente evidente; não vincular nem lançar nota até identificação válida. |
| D06 | Imagem aprimorada no local atual (B) | Mesma posição e controles de consulta da foto existente, sem painel ou modal extra; nota e câmera preservadas. |
| D07 | Câmera essencialmente automática | Abertura/fechamento, importação, iluminação suportada; remover controles manuais de foco, zoom e calibração; manter acessibilidade e design. |
| D08 | Prevenção de duplicatas automática (A) | Nenhum botão de liberação da folha; retirada comprovada rearma; sem cooldown artificial; ausência momentânea não rearma. |
| D09 | Qualidade antes de otimização | Uma captura/leitura, Worker, gestão de buffers e histórico atual, sem limite arbitrário de 100 cartões, sem baixar qualidade, sem dependências/APIs externas. |
| D10 | PR auditável, homologação antes da publicação | Código existente reaproveitado, regressões, auditoria independente, reversão segura, homologação pelo proprietário. Codex pode resolver incompatibilidades estruturais. |

## 3. Arquitetura e fronteira óptica obrigatória

Câmera nativa → apresentação proporcional (canvas WebKit) → detector EDGE-FIRST → 10 observações estáveis → captura nativa única + flash → perspectiva no Worker → dois produtos derivados da MESMA foto, mas apenas UMA leitura:
- Produto documental: enhanceDocument (Magic Scan), para a imagem de conferência no lugar atual.
- Produto óptico: raster retificado em cinza do caminho Scanner óptico do laboratório (V.enhance em gray, sem JPEG), alinhado pelos fiduciais e manifesto exato → uma chamada readRaster. Trata-se de candidato a caminho único, NÃO demonstrado superior em todos os cartões. Não produzir o segundo raster de comparação em runtime oficial.
- O aprimoramento visual não pode alterar a matriz óptica. Não usar JPEG decodificado, canvas visual, gabarito ou maior confiança entre leituras como fonte de decisão.
- **Distinção essencial:** o laboratório aprovado executa duas leituras e reconcile. Retirar a comparação muda a política de segurança. Em ensaios anteriores Magic Scan cinza diretamente no leitor converteu A moderado em branco e A+B em A. A separação corrigiu ambos nos dois rasters de teste. Isso não prova que a leitura única seja equivalente ao consenso em casos adversos. Validar offline contra ambos os caminhos congelados, com verdade rotulada; nenhuma comparação em runtime do Corretor. Se a equivalência de segurança não for demonstrada, não publicar: encaminhar evidência ao Diretor, não reintroduzir comparação sem aprovação.
- O módulo experimental integration/single-optical.mjs nesta preparação implementa apenas a fronteira de uma leitura com injeção de funções para testes. Não altera a UI, não calcula notas, não está conectado ao Corretor e não substitui a homologação do raster.

## 4. Mapa de transplante

| Fonte no laboratório congelado | Destino / responsabilidade |
|---|---|
| js/camera-presentation.mjs + css/omr-lab.css | Adaptar à superfície de vídeo oficial sem deslocar #cameraGrade; canvas no WebKit, vídeo nativo nos demais; desenho do frame inteiro. |
| js/app.js startCamera, stopCameraView, loop, track, capture | Adaptar aquisição, ciclo de sessão e eventos; preservar 10 quadros, DET_W 384, LOOP_MS 66, MIN_SCORE .22, suavização .45, MAX_SIDE 2600 de processamento. Preservar resolução solicitada por navegador, sem troca automática de lente. |
| js/experimental-detector.mjs + candidates/edge-first-01.mjs | Detector EDGE escolhido; fallback de pesquisa PRIMARY permanece no laboratório, não expor seletor no produto. |
| js/card-flow-safe.mjs + js/safe-scan.mjs | Bloqueio por cartão, frescor temporal, mudança estrutural; retirar botão manual somente após provar desarme/rearme automático seguro. |
| js/paper-geometry.js + js/vision.js | Contorno completo, margem externa, homografia; cantos do papel NÃO equivalem aos centros dos marcadores da avaliação. |
| js/worker.js + js/document-enhance.mjs | Worker com transferência de buffers, timeout, recuperação, produto documental separado do raster de leitura. Adaptar Worker para gerar um único raster óptico. |
| omr-lab.mjs candidateRead | Adaptar contrato de normalização por fiduciais; preservar dimensões e layouts V1/V2, quadros incorporados, página correta, manifesto e hash. Não copiar analyze/reconcile/renderResult nem painel experimental. |
| plataforma/corretor-v2.html | Ponto oficial de integração: startCamera, scanCameraFrame, prepareImage, loadPhoto, readNormalized, renderAnswers, calculateScore, showCameraGrade, renderHistory; preservar fluxos de biblioteca, importação, revisão e histórico. |

Aparência: manter #cameraGrade, #cameraGradeValue, #photoGrade, #scanScore e área de #canvas; não trocar tipografia, tamanho, alinhamento ou posição atuais da nota. A camada de vídeo/canvas deve ficar sob a nota. Manter mapeamento do toque manual sobre o raster geométrico correto; não confundir coordenadas da imagem documental com as da imagem normalizada.

## 5. Contratos de sessão, resultado e identidade

Estados mínimos: aguardando folha → estável → capturando (um flash) → processando → resultado atual → aguardando retirada → próxima folha. Falha de captura não registra nota; resposta atrasada não pode atualizar nova sessão, avaliação, revisão ou fotografia. Associar identificador monotônico de captura, sessão, hash, revisão e página a cada processamento. Invalidar nota anterior no disparo seguinte, não na mera procura da próxima folha; nunca exibir nota antiga como nova. Fechar câmera/alterar modelo cancela processamento antigo e libera recursos.

A decisão D05 muda um contrato atual: calculateScore bloqueia identidade review, tanto no modo público quanto no scorer privado. Implementar uma apresentação de **nota provisória sem vínculo**, separada de nota acadêmica definitiva. Reusar exatamente a aritmética oficial e pesos/precisão; não falsificar identityState='read', nem alterar scoreIntegratedPlan para aceitar identidade inexistente como válida. Se houver questão inconclusiva, gabarito ausente, página incompleta ou modelo incompatível, não apresentar nota definitiva. Guardar pendência por captura para revisão sem atribuição a outra pessoa. O leitor hoje veta reconhecimento parcial se a identidade obrigatória estiver ilegível; preservar essa proteção. Diário/escrita remota não autorizados; manter bloqueio, autenticação e seleção validada. Não criar integração de lançamento inexistente.

Páginas múltiplas: conservar/implementar contrato explícito do modelo e página; não inferir estudante ou página de uma folha semelhante. Nota final exige conjunto completo e compatível, sem duplicatas; se agregação ainda não existe, não simular conclusão nem reduzir cobertura. Compatibilidade com recursos oficiais existentes é gate.

## 6. Riscos e requisitos de correção

- Mesa branca: mudança estrutural ajuda, mas folha pouco texturizada, sombra localizada ou mudança de foco podem confundir a retirada. Sem botão de emergência conforme D08, testar rigorosamente; se bloqueio persistir, suspender integração em vez de introduzir botão ou liberar pela simples passagem do tempo.
- Frescor: currentTime repetido não soma estabilidade; avanço de relógio não garante novo pixel. Verificar track muted/ended, visibility/picker e quadro efetivamente atualizado. Não alterar apresentação sem evidência.
- Geometria: mudança de dimensões invalida cantos antigos, preserva bloqueio da folha; rejeitar folha parcial, preservar marcadores periféricos; homografia não confunde quadro incorporado com contorno externo.
- Memória: não transportar bandeja, PDF, exportações nem limite 100/96 MiB. Histórico oficial não deve crescer com buffers RGBA por cartão; liberar bitmaps, URLs e workers conforme ciclo de vida. Preservar consulta atual da última foto. Não prometer retenção ilimitada de fotos. Medir iPhone real.
- Importação: mesma proteção óptica, sem segunda compressão JPEG; respeitar validações de tipo/tamanho/orientação existentes.
- Privacidade: pixels e resultados em memória local, sem telemetria de fotos/código/gabarito, sem dados de alunos em fixtures. Não alterar Workers/D1/autenticação/backend. Reuso de Scancat exige conservar atribuição MIT.
- O laboratório não constitui prova da integração oficial; não copiar global test hooks ou controles privados experimentais.

## 7. Matriz mínima de homologação e critérios de aceite

| Gate | Prova |
|---|---|
| G1 Câmera | iPhone Safari: importar JSON, cancelar picker, girar, alternar apps, fechar/reabrir, verificar círculos proporcionais, prévia viva e contorno alinhado; Chromium também. |
| G2 Nota | Comparar screenshots da UI oficial antes/depois em 320/390/768/1440 px; nota permanece até disparo seguinte, sem nota anterior em novo cartão; mesma posição/estilo; nota por bloco preservada. |
| G3 Óptica | Corpus sintético e físico rotulado (A moderado e A+B, fracas, duplas, branco, rasura, sombra, reflexo, azul/preto/lápis, C-E e formatos suportados); medir FP/FN, revisão, resposta incorreta definitiva e cobertura; zero novas respostas definitivas incorretas nas contraprovas conhecidas. Não usar número de lidas como acurácia. |
| G4 Caminho único | Instrumentar chamadas em teste: uma captura, uma leitura, nenhum fallback, painel comparativo ausente; filtros visuais não alteram raster óptico. Comparação A/B somente offline com laboratório congelado. |
| G5 Identidade | Sete dígitos inclusive zeros iniciais, código inválido/ilegível, identificação pendente em histórico, transição para aluno seguinte, proibição de vínculo/lançamento sem validação; pendência óptica continua bloqueando nota definitiva. |
| G6 Fluxo | Folha imóvel, perda temporária, troca rápida/lenta, mesa clara, sombra intensa localizada, folha parcial, folha semelhante, leitor lento, erro Worker, memória; sem duplicata nem bloqueio indefinido. |
| G7 Modelos | 10/20/60/100 e limites oficialmente suportados, multipágina, A-D/A-E/C-E, quadro incorporado V2 e V1, gabaritos revisados, pesos, notas por bloco e revisão manual. Sem regressão de contratos. |
| G8 Performance | Pelo menos 100 cartões consecutivos em ensaio físico/sintético; medir tempo captura→nota (mediana/p95), uso de memória, quadro/congelamento, temperatura e recuperação. Comparar com referência nas mesmas condições, sem meta numérica inventada. |
| G9 Segurança | Suite completa do repositório, CI verde no SHA candidato, auditoria independente, nenhuma alteração não autorizada, reversão demonstrada, homologação expressa do proprietário. |

## 8. Plano de execução para o Diretor

1. Fixar base atual e levantar diff/contratos oficiais. Usar Codex para integração estrutural e ciclo assíncrono, Executor para mudanças estritamente delimitadas, Auditor para contraprovas e Homologador para iPhone. Não duplicar trabalho do laboratório.
2. Adaptar os módulos de câmera/Worker preservando algoritmos e comportamento testado; conectar a interface oficial, primeiro em branch candidata. Manter a arquitetura antiga reversível durante testes, sem seletor visível ao professor.
3. Implementar caminho óptico único, cálculo provisório sem identificação e histórico de pendências; validar formatos existentes. Validar offline a perda do consenso e a retirada automática sem botão. Se critérios falharem, registrar bloqueador.
4. Executar CI e auditoria, entregar URL de homologação separada com SHA e roteiro. Somente após aceite explícito do proprietário, autorizar integração/publicação oficial. Merge/deploy não autorizados por este dossiê.
5. Reverter pelo commit/PR de integração ou mecanismo de rollback testado, sem migração de dados.

## 9. Estado deste PR e evidências

O proprietário aprovou o comportamento e as dez decisões. Este PR é preparação técnica **draft**: dossiê versionado, módulo candidato isolado e teste de contrato. Não é implementação integral na plataforma. O laboratório publicado permanece congelado. 6 verificações agrupadas de contrato foram executadas em JavaScript isolado com dependências simuladas, não suíte Node completa nem integração de navegador. Não há evidência nova de acurácia física do caminho único. A decisão de começar pelo raster retificado do Scanner óptico é recomendação técnica, condicionada ao gate G3. A escolha de deixar a integração estrutural para a Diretoria/Codex decorre da necessidade de preservar contratos e testar a divergência entre arquitetura aprovada e arquitetura desejada.

Teste do adaptador: `node --test laboratorio/salta-omr-scan-safe-02/integration/single-optical.test.mjs`. Executar no checkout completo do PR. Não há alterações no Corretor oficial, no backend ou no laboratório publicado na main.
