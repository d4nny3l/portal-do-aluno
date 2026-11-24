# CAM-FOCUS-01 — issue #52
Base: 65ca8f4286b6fbbe663e9451ed5978eea4ccb50b. Candidato, sem homologação física.
## Diagnóstico
O gate de ocupação de 18% precedia nitidez e resolução. Isso pode induzir aproximação além da distância focal mínima; a distância real e a lente do aparelho do proprietário não foram medidas. A captura final de até 1800 px verificava os quatro marcadores e geometria, mas um score óptico nulo não impedia a normalização; desabilitar a seleção opcional também pulava a qualidade final.
## Alteração
Mantém a regra de 18% para o fluxo existente, com alternativa restrita para 8–18%: quatro fiduciais já aceitos pelo detector existente, menor aresta projetada >= 360 px de captura efetiva, núcleo escuro medido >=4 px na prévia e >=10 px projetados. A captura final verifica os seus próprios pixels, não os da prévia; a alternativa exige núcleo >=10 px na imagem final. Brilho/contraste/nitidez/movimento e margem anteriores mantidos. Não extrapola resolução nativa; não usa zoom digital. Ajuste candidato, não limiar clinicamente/opticamente homologado. Não muda normalizador, leitor, manifesto ou notas. A seleção entre dois quadros continua opcional e exige consistência por marcador.
Foco contínuo solicitado apenas se capabilities o anunciam; botão acessível de solicitação de foco com recuperação de timeout. Não promete refoco físico. Mantida a seleção traseira pré-existente (labels são pistas, e ultrawide requer confirmação de resolução); sem troca automática nova de lentes sem evidência. Não adicionado botão Capturar agora: bypass de estabilidade poderia piorar foco; importação de foto permanece disponível.
## Testes
Fixtures sintéticas de qualidade com a mesma área antiga/nova, desfoque por média móvel, diferentes proporções, ausência de foco nativo, movimento e falha final/recuperação. CI existente executa suítes de câmera, OMR, UI e geometria. A fixture usa centros fornecidos, não é demonstração de reconhecimento de papel real.
## Limites
Não foram medidos iPhone/Android físicos, distância focal, lente, acurácia de bolhas reduzidas ou desempenho real. Auditoria e homologação independentes obrigatórias; não publicar. Nenhum dado acadêmico real.
