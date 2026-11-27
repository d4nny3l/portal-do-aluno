# DESIGN-SALTA-04 — Matriz de contrato, escopo e homologação

**Fonte oficial:** [Issue #151](https://github.com/d4nny3l/portal-do-aluno/issues/151), [adendo de trava e precisão #7224865256](https://github.com/d4nny3l/portal-do-aluno/issues/151#issuecomment-7224865256), **retificação final de bloqueio silencioso** [#7224898116](https://github.com/d4nny3l/portal-do-aluno/issues/151#issuecomment-7224898116).

**Base congelada:** `main@d58b3091860bc6f88feb4f8bfcececc6a816f384`, depois de DESIGN-SALTA-03 já integrado.
**Branch exclusiva:** `feat/design-salta-04-inline-grade-mask`. **PR único:** [#152](https://github.com/d4nny3l/portal-do-aluno/pull/152), **DRAFT**. Sem merge, deploy ou alteração oficial.

## Matriz de conformidade

| Requisito | Como foi implementado somente no Ateliê | Teste reproduzível |
|---|---|---|
| Um toque abre edição na mesma célula | Botão da grade vira `input.f2-grade-edit` na própria célula; botão retornará após confirmar/cancelar. **Sem popup/modal.** | Browser 04 Chromium 390/1440 e WebKit 390 |
| Precisão configurável 0/1/2 | `[data-f2-grade-precision]` afeta apenas novas digitações, sem reformatar fixtures existentes | Unitário p0/p1/p2; troca de precisão no browser |
| Máscara posicional de teclas individuais | O dígito digitado é inteiro escalado: 10→1,0 (p1); 10→0,10 (p2); 245→2,45 (p2); 1000→10,00 (p2) | Unitário e navegador com `pressSequentially` |
| Limite preventivo exato | Comparação em `BigInt` entre dígitos escalados e limite próprio `max×10^p` | 100 e 1000 permitidos; 101/1001 rejeitados; p0 11 rejeitado |
| Máximo específico | Avaliações originais A=10, B=8 e recuperação=10 na *amostra*, com resultado derivado intocado | B p1 80→8,0, 81 rejeitado; contrato genérico máximo 2,0: 20 aceito/21 rejeitado |
| Bloqueio **silencioso** | Entrada inválida é interceptada sem alterar input, seleção/caret ou status; sem toast, erro, animação, modal, som | WebKit/Chromium validam valor e status iguais antes/depois, 0 alertas |
| Colagem e Excel com semântica convencional | Colar 10 significa **10**, não 0,10 ou 1,0; 2,45 continua 2,45; validação de precisão e máximo sem truncar nem arredondar | Colagem 2,45/10 aceita em p2; 12, 2,345, 12,2222 e 10,01 rejeitadas |
| Autofill, IME e inputs alternativos | Inserção em bloco não é sequência de teclas mascaradas; `beforeinput` distingue blocos e `input` fallback valida independentemente | Browser 04 injeta `insertReplacementText`, composição, `insertText` múltiplo e `input` direto |
| Zero ≠ não lançado | `0,0`/ `0,00` é dado confirmado somente no rascunho local; campo apagado gera vazio | Browser testa criar zero, apagar e ver `—` |
| Cancelamento e navegação | Escape restaura original; Enter confirma local e avança abaixo; Tab/Shift+Tab avança horizontalmente; setas fora de edição preservadas | Browser 04 + regressão responsive |
| Marcação parcial | Botão contextual separado permite alternar `partial` da Avaliação A; editar nota não modifica marcador | Regra de armazenamento preservada; inspeção do diff |
| Preservar scroll/foco/grade | Atualização apenas da célula ativa sem reconstruir a tabela; cabeçalhos sticky, estudante sticky, zebra, 27px desktop / 44px mobile | Browser 04 célula distante, rolagem vertical/horizontal e foco |
| Preservar chamada/vistos da DESIGN-03 | Algoritmo `assignCommon` e lotes/contadores permanecem fora do ramo de notas | 7 testes 03 + Playwright 03/04 |
| Favicon C/22 composições/68 símbolos | HTML carrega só SVG C; nenhuma alteração no favicon raiz, sprite ou outras telas | Guard, 6 viewports e regressões |
| Isolamento e dados sintéticos | Sem `fetch`, armazenamento, câmera, Workers, Auth, D1, serviços, leitura óptica ou dados pessoais | Guard comparando exatamente com base autorizada; CI geral |

## Regras de interpretação e segurança

- A precisão é **parâmetro demonstrativo**, não alterando automaticamente notas previamente lançadas. Um valor preexistente que não cabe na nova precisão continua sendo exibido como veio, e deve ser selecionado/substituído explicitamente para nova edição.
- A máscara aplica-se **somente a teclas numéricas individuais**. Colagem, preenchimento automático, texto composto ou entrada convencional são analisados como números em pt-BR, sem conversão posicional implícita.
- O bloqueio de entrada inválida **não produz mensagem** — prevalece o último adendo da Issue #151 sobre a proposta preliminar de feedback inline. Alertas de problemas reais de salvamento/sincronização não foram alterados, pois não existe persistência nesta prévia.
- Na aplicação produtiva futura, nenhuma validação frontend substitui a validação de domínio, persistência ou permissões; esse trabalho **não está autorizado nesta missão**.
- Somente resultados originais/recuperação simulados, com máximos explicitados; coluna Resultado permanece **Não calculado**, não editável. Fórmulas, médias, pesos e arredondamentos não foram implementados nem modificados.

## Roteiro físico para o proprietário

No computador e no iPhone/Safari com branch do PR #152 servida por HTTP local confiável, sem dados reais:
1. **Telas → 15.9 (Notas)**. Toque uma célula, confirme que um único input aparece na mesma célula, sem diálogo.
2. Com **1 casa**, apague ou selecione todo o conteúdo anterior e digite `10` (1,0), `25` (2,5), `100` (10,0); tente exceder e confirme ausência absoluta de aviso e valor estável.
3. Com **2 casas**, digite `10` (0,10), `245` (2,45), `1000` (10,00); tente 1001 e colar `2,345` e `12`. Digite zero e depois apague totalmente.
4. Avalie a coluna **Avaliação B** com limite 8, além da recuperação. Teste colar `2,45` e o inteiro `10` e verifique significado convencional.
5. Teste Escape, Enter, Tab, Shift+Tab, edição em célula distante com rolagem, posição dos cabeçalhos, destaque cruzado e toque em sequência.
6. Visite 15.8 (Chamada), 15.10 (Vistos), Cores (favicon C), e outras composições; confira que comportamentos já aprovados seguem intactos.

## Auditoria independente e restrições

- Auditar **HEAD final** no PR #152, diff/guard/testes/capturas e analisar especialmente `beforeinput`, `input` fallback, colagem, seleção/caret, eventos de foco e preservação de dados existentes.
- Playwright WebKit 390 **não substitui** homologação em Safari real ou tecnologias assistivas físicas.
- A suíte exclusiva do Ateliê é independente do **guard OMR #141**, que não foi alterado nem neutralizado. Qualquer falha contextual nesse fluxo deve ser analisada pelo responsável da missão #141, sem ampliar escopo.
- **Sem merge, deploy, publicação, aplicação ao produto SALTA, alterações em algoritmos acadêmicos/OMR/câmera/Magic Scan, armazenamento, autenticação ou APIs.** Exigir auditoria independente e GO explícito do proprietário para fases posteriores.
