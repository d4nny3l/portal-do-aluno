# SCAN-INTEGRATION-01 — candidata conectada, publicação bloqueada por G3 e G6

Base: `195585572bdcefee809981aada4ee7614b7e023f`. Preparação original do PR #138: `7309f448a48d5e522232080b613b157d3caa1503`. O dossiê original e o laboratório congelado permanecem byte a byte. Este código é candidato em PR draft; não é homologação física nem autorização de merge/deploy.

## Implementação

- O HTML oficial candidato usa `camera.mjs`: EDGE-FIRST, 10 observações estáveis, DET_W 384, LOOP_MS 66, MIN_SCORE .22, suavização .45, quadro nativo integral e apresentação canvas no WebKit. Resolução negociada por navegador igual à referência; sem zoom/foco manual, renegociação ou cooldown. Flash único no disparo.
- `processor.mjs`/`worker.mjs` geram Magic Scan documental e Scanner gray óptico separados da mesma RGBA nativa. Um alinhamento por manifesto e **uma chamada** ao leitor; zero se a geometria falhar. Sem JPEG, gabarito, seleção de motor ou consenso em runtime. O ajuste explícito de marcadores usa o raster geométrico, com nova operação/token; não reaprimora nem reutiliza coordenadas documentais.
- O cliente transfere buffers, limita-se a um trabalho corrente, termina Worker em cancelamento/erro/timeout e rejeita resposta antiga. Captura/sessão/hash/revisão/página são fixados. Fechar, desconectar ou trocar o modelo invalida pendências. Uma permissão tardia cancelada não abre fallback.
- G6 (candidata): a retirada exige deslocamento coerente da folha inteira em direção à borda, similaridade do padrão interno, referências fixas da mesa em pelo menos três lados na captura e confirmação da superfície exposta nas quatro observações frescas da janela original de 650 ms. Obstrução, quadro inválido, perda de contorno, sombra, folha parcial ou tempo isolado não liberam. Rotação/lacuna de quadros invalida a evidência de movimento. Não há botão de liberação, novo cooldown, limite de 100 fotos ou alteração dos parâmetros de captura.
- A imagem documental ocupa `#canvas`. Regras da nota original continuam byte a byte; câmera aberta e nota visível até o disparo seguinte. Prévia provisória mantém `identity.state=review`, precisão/pesos oficiais e veto a reconhecimento parcial. Nunca autoriza vínculo ou lançamento. Código válido continua requisito acadêmico.
- Páginas exigem escolha explícita. Agregação só aceita partição explícita de questões, páginas completas e mesmo código válido; não inventa partição nos modelos atuais, todos de uma página. Sem contrato multipágina verificável, a nota final fica pendente.

## Bloqueador comprovado

O corpus rotulado tem 46 casos/750 questões (23 com uma marca, 21 múltiplas, 706 brancas). Nos três casos `shadow-AB-110/130/150`, A+B vira **read A** no Scanner gray; o consenso congelado exige revisão. A API candidata reproduz exatamente o caso 130 com uma única chamada. Não foi alterado nenhum limiar nem motor para contornar o achado.

No corpus adverso, single teve 11 respostas únicas definitivas incorretas contra 8 do consenso, além de 7 brancos indevidos em cada caminho. Precisão single entre respostas únicas: 16/27; cobertura das verdadeiras respostas únicas: 16/23. Não confundir 27 respostas lidas com acertos nem usar o grande número de brancos para anunciar acurácia. Não são taxas físicas/universais.

Contraprova adicional do teste de enquadramento: apagando um fiducial, o detector existente pode substituí-lo por impressão e perder uma marca para branco, mantendo identidade pendente. Uma prévia numérica não corrige esse erro geométrico. Isso também exige avaliação antes de qualquer publicação.

**G6 — correção candidata, sem autorização de publicação:** a contraprova original (mesma folha, quatro quadros novos pretos por 660 ms e retorno aos mesmos pixels) passa a exigir que permaneça o ID 1. O teste conserva o detector EDGE e os pixels originais, verifica que o gate estrutural antigo ainda aceitaria a obstrução e acrescenta controle positivo com superfície identificável. O módulo `withdrawal.mjs` usa grade RGB 24×24, padrão interno 12×12, deslocamento coerente mínimo de 3,5% da menor dimensão, referências de contraste na mesa e comparação espacial da superfície. São critérios exclusivos de retirada, não limiares de captura/OMR. Uma mesa lisa, superfície muito heterogênea, retirada não observada (incluindo durante processamento lento), movimento de câmera sem referência suficiente ou iluminação que apague as referências permanece bloqueada. Imagens indistinguíveis não provam verdade física; câmera móvel e superfícies reais ainda precisam de homologação. G6 não deve ser considerado universalmente aprovado. G3 permanece intocado.

Originais, documental e raster óptico: [entrada](validation/shadow-AB-130.png), [documental](validation/shadow-AB-130-document.png), [óptica](validation/shadow-AB-130-optical.png). Hashes e classificações: [visual-evidence.json](validation/visual-evidence.json). Métodos/resultados completos: [validation/README.md](validation/README.md).

## Gates G1–G9

| Gate | Resultado desta candidata |
|---|---|
| G1 | Chromium/WebKit reais com MediaStream sintética: abertura, captura, cancelamento, orientação/picker/background e mesma fonte cobertos. **iPhone 17 Pro/Safari físico pendente**. |
| G2 | Comparação com DOM/CSS originais em 320/390/768/1440: posição relativa, tamanho e tipografia iguais. Nota persistente até disparo; prévia provisória e veto a marca parcial testados. Screenshots no artefato da CI. |
| G3 | **FALHOU: três novas respostas definitivas incorretas contra consenso.** Sem corpus físico rotulado. Publicação impedida. |
| G4 | Uma chamada ao leitor em captura válida; separação documental/óptica, buffers reais e falhas sem fallback instrumentados. |
| G5 | Identidade pendente/zeros iniciais/nota provisória, permissões locais de apresentação, revisão e contextos antigos testados. Nenhum vínculo ou escrita acadêmica criado. |
| G6 | Correção candidata da contraprova preta, testes de retirada observável e bloqueio conservador de cenas sem referência suficiente. **Publicação continua bloqueada**: homologação de superfícies e câmera física pendente e retirada não observável não pode ser inferida. |
| G7 | V1/V2, incorporados, A–D/A–E/C–E, 10/20/60/100/150 e pesos cobertos sinteticamente; biblioteca reaberta e correção privada com formatos 0/1/2 em backend local. Multipágina sem partição explícita não é declarada completa; impressão econômica e modelos originais preservados. |
| G8 | 100 processamentos pareados registrados em JSON; ensaio local adicional de 100 retiradas/capturas/Worker/notas em Chromium. Só dados sintéticos repetidos. CI repete 100 ciclos no HEAD exato; memória observada não é certificação de ausência de vazamento. Temperatura, sensor e Safari físico pendentes. |
| G9 | Escopo e dependências produtivas protegidos, suítes e CI; rollback por reversão do delta, sem dados/migração. **Auditoria independente e homologação do proprietário pendentes**. CI verde não torna G3 aprovado. |

O ensaio local inicial de 100 ciclos deu 141,5 ms de mediana/151 ms p95 disparo→nota; maior intervalo rAF 50 ms; heap JS observado de 3,74 MB a 6,64 MB, pico 7,21 MB. Foi desenvolvimento anterior aos últimos guardas de cancelamento; a CI fornece a contraprova no HEAD final. O benchmark pareado da API final, sem câmera/transporte/UI, está em `validation/candidate-evidence.json`; não misturar suas métricas com captura→nota.

## Reproduzir e reverter

```sh
node --test corretor/v2/tests/*.test.mjs plataforma/tests/*.test.mjs stats-worker/tests/*.test.mjs corretor/v2/scan-safe/tests/*.test.mjs
node --expose-gc corretor/v2/scan-safe/validation/run-candidate-validation.mjs
SALTA_SCAN_CYCLES=100 SALTA_PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node corretor/v2/scan-safe/tests/official-browser.mjs
```

O navegador de teste serve o checkout somente em loopback, intercepta Auth/API com fixtures sintéticas e bloqueia rede externa. Isso não substitui login real nem cria URL pública. **URL de homologação física não publicada devido aos G3/G6**; o laboratório aprovado continua sendo a referência congelada, não uma prévia desta candidata.

Reverter o commit de implementação devolve o frontend à preparação original `7309f44`, preservando o dossiê e laboratório. Não há migração, registro remoto, segredo ou alteração no backend para desfazer. Rascunhos de captura são memória local; notas não foram lançadas. A reversibilidade exata da árvore é conferida em índice temporário na entrega. A Diretoria deve decidir sobre a política óptica após contraprova independente, sem reintrodução silenciosa do consenso.
