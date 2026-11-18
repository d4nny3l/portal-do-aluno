# SALTA — Ajuste fino P1 do Corretor (18/11/2026)

Base verificada: `main 12c47b8fcb47b56a624a22eb90b79c273e659ed1`. Nenhum merge/deploy autorizado.

## 1. Correção automática, sem registro externo
- `reader.mjs`: `needsReview` passa a sinalizar **somente** falha de identidade e classificação **inconclusiva** (`review`), não brancos e duplas já classificados. `multipleWeak` com 2+ evidências substanciais passa a dupla; com apenas uma evidência insuficiente vai para `review`, nunca branco. Todos os limiares do detector mantidos.
- `renderAnswers`: `read`, `blank` e `double` já vêm classificados; opções manuais permanecem livres. Rótulos: `Inválida — dupla marcação`, `Sem resposta — inválida`, e `Leitura inconclusiva` quando exige nova fotografia.
- `calculateScore`: **Nota final** apenas se **todas as questões da página única** estiverem classificadas, a identificação obrigatória tiver sido lida, não houver observações inconclusivas, e o gabarito/valor máximo forem válidos. O denominador é `template.questions.length` incluindo erros, brancos e duplas (zero). Para múltiplas páginas, **não** conclui sem a reunião de todas as páginas (fluxo ainda não implementado); evita nota incorreta. Nada é gravado no Diário ou banco.
- Após iniciar outra captura/importação, o resultado anterior exibido fica marcado como `Última leitura bem-sucedida` até ser substituído; falhas não promovem nota velha à leitura atual.

## 2. Indicadores da câmera
Três rótulos no palco de visualização, sem botões/painéis: **Folha estável** quando captura com 3 quadros válidos; **Captura consolidada** apenas após captura e normalização com retorno válido; **Cartão reconhecido** apenas quando leitura terminou e nota está classificada sem pendências. Espera de retirada da folha, reset na próxima e em falhas, zoom e iluminação preservados. Captura totalmente automática mantida. Sem novo temporizador de UI.

## 3. Lente traseira mais aberta e zoom nativo
- O ranking original preserva a câmera traseira principal como padrão. A ultra-angular deixa de ser proibida em todas as situações: `widerRearCandidate` só recomenda **sondar** câmera traseira ampla se houver **zoom mínimo nativo elevado (>1,25)** ou recorte `crop-and-scale` reportado.
- Sondagem aceita a alternativa apenas se ela não for frontal, reportar tamanho nativo utilizável (lado menor ≥960, maior ≥1280), não elevar zoom mínimo e não contradizer o ID solicitado. Caso contrário reabre a traseira anterior. Controles `torch`, streams e geração assíncrona mantidos.
- Nada é redimensionado via CSS/crop para simular ângulo. Identidade de lente, distorção, campo de visão e nitidez **não** são verificáveis conclusivamente em mocks. Se o navegador ocultar zoom/lentes, permanece a câmera original e recomenda-se fotografar/importar. Não foi realizada homologação física de iPhone.

## Testes e limites
Suites preexistentes mantidas. Testes de nota final, brancos/duplas, erro, identidade, edição, cross-integration, câmera (principal/ultra/virtual/frontal/rejeição/fallback), indicadores e falha de captura usam exclusivamente dados sintéticos. Casos de manchas, sombras, manifestos V1/V2, 60 itens e raster continuam cobertos pelas suites existentes. Nenhum limiar óptico foi reduzido para forçar aprovação.

## Roteiro de homologação física pelo proprietário
1. No Corretor existente, testar A4 com 60 itens e código de 7 dígitos. Validar nota final para forte, parcial, branco, dupla, errada e mudança manual; testar código ilegível.
2. Com câmera ativa, confirmar três estados apenas após eventos reais; verificar recuperação de foto falha, retirada e cartão seguinte, e sinalização de nota anterior.
3. Em pelo menos iPhone Safari e outro celular, comparar distância de enquadramento, resolução, foco das bolhas e nitidez de bordas, lente/facing/zoom reportados (quando disponíveis), iluminação real e desempenho do OMR. Não declarar câmera fisicamente corrigida sem esse teste.
4. Conferir manifestos históricos V1/V2 e rejeição de faltas de página sem nota final.

**Auditoria independente obrigatória antes de qualquer autorização de publicação.**