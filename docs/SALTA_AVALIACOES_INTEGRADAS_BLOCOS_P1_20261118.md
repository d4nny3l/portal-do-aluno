# SALTA — Avaliações integradas por blocos (candidato P1)

Base: main bcae46584a92b683f6e3edf0028f22dc029e7a0b, 18/11/2026.

## Limite de implementação

Esta entrega prepara planejamento, gabarito e correção por blocos **em memória da aba**, sem persistência nova. Nenhum dado é salvo em D1, Worker, IndexedDB ou servidor. Atualizar/fechar a aba elimina todas as versões temporárias. A ação chama-se **Registrar versão nesta aba**, nunca **Salvar avaliação**.

O contrato existente do Banco cifrado v1 aceita answerKey.questions com weight=1 e pontuação máxima uniforme. Este PR **não** altera makeBundle/validateBundle, persistência, Auth, Crypto, D1, Workers, grants, migração nem banco escolar. Quando o Banco autenticado de homologação está ativo, a seleção local é bloqueada. O CODEX SALTA deverá propor contratos v2 versionados e auditados para persistir valores por bloco, exibição e novas revisões, sem reescrever a história v1.

## Domínio puro

Arquivo: corretor/v2/assessments/block-scoring.mjs.

- Vínculo de blocos por sectionId e de questões por questionId, preservando gabarito sob reordenação e numeração não contígua.
- Leitura final somente em A–D, A–E e C–E; CDU não é classificado, pois não possui OMR homologado.
- Valor positivo para cada bloco com até quatro casas decimais; valores convertidos a unidades inteiras de 1/10000 por BigInt. A soma total usa inteiros e frações racionais, com redução por MDC; arredondamento apenas na apresentação.
- Exemplo: 8 questões em bloco de 4 pontos = 0,5 por questão acertada. Brancos, duplas e erros são zero. Notas por bloco e total são calculadas independentemente e sem somar os números já arredondados; a soma dos blocos exibidos com duas casas pode diferir 0,01 do total exibido.
- Gabarito visual e colagem compartilham o mesmo mapa por ID. Colagem aceita linhas numeradas ou a sequência completa na ordem atual; valida alternativas, quantidade, duplicidade, modelo e gabarito completo antes de selecionar.
- Plano local inclui dados, blocos, questões, gabarito, valores, modo de exibição e vínculo estrito a templateId, revision e contentHash do manifesto.
- Nota final exige modelo exato, identidade de sete dígitos quando configurada, número e ID de todas as questões e ausência de marcações inconclusivas. Revisão manual continua opcional e recalcula o resultado.
- A renderização da nota escapa os nomes dos blocos, impedindo que texto editável injete HTML.

## Interface

Arquivo: corretor/v2/assessments/draft-planner.mjs, integração leve em plataforma/corretor-v2.html e estilos na CSS existente.

O professor reaproveita campos e blocos existentes; informa valor de cada bloco, gabarito por questão ou por colagem e exibição: nota final, blocos ou ambas. O total e a completude são mostrados no mesmo formulário. Não há elaboração de enunciados.

A ação **Selecionar para correção nesta aba** cria snapshot coerente com o manifesto ativo, aplica o gabarito e a pontuação localmente e abre o Corretor. A câmera não deduz avaliação/revisão de provas fisicamente idênticas; seleção é um vínculo lógico, e a tela o informa. O cartão impresso permanece idêntico ao renderizador anterior e nunca recebe alternativas corretas.

A biblioteca **Versões desta aba** permite filtrar, registrar versão temporária, abrir, duplicar e editar. Ela não é a biblioteca remota real e não oferece persistência disfarçada.

## Testes e auditoria

- corretor/v2/tests/block-scoring-p1.test.mjs: cálculo por bloco, precisão racional, valor exato, chave parcial/incompatível, pasta C–E, erro, branco, dupla, manifesto, identidade, revisão, correção humana e apresentação.
- plataforma/tests/corretor-integrated-planner-p1.test.mjs: estado único visual/colagem, biblioteca temporária, invalidação da seleção, bloqueio do Banco protegido e presença dos controles.
- As suítes anteriores OMR, raster, geometria, V1/V2, Banco e plataforma permanecem obrigatórias.

**Pendente:** revisão independente SALTA AUDITOR, contrato v2 do CODEX SALTA, testes físicos 60 questões e aprovação expressa antes de qualquer merge/deploy. Esta implementação não prova homologia física nem gravação real.

**Reversão:** remover os dois módulos, fieldset de planejamento, estilos, testes e documentação. Nenhum rollback de dados/migração necessário.
