# Salvamento integral — issue #120

Base de integração: `main@e156a8673a10421e8d62728c1b6a4ff7f6c0d1d3`. Um único PR DRAFT; backend primeiro e frontend em sequência na mesma branch. Nenhuma operação remota de infraestrutura faz parte desta implementação.

## Contrato especializado

- Definições novas: `schemaVersion: "salta-assessment-definition-v3"`, mesmos campos acadêmicos da v2 mais `editorSnapshot` obrigatório. `salta-assessment-definition-v2` continua aceito, sem snapshot nem regravação automática. Não existe migração D1.
- Capability autenticada: `editorSnapshotVersion: "salta-editor-snapshot-v1"`. Independente das capabilities de notas e quadros incorporados. Sessão ausente ou docente não autorizado não recebe a capability. O frontend deve bloquear novos salvamentos sem ela, sem degradar silenciosamente para v2.
- Snapshot: `schemaVersion: "salta-editor-snapshot-v1"`, `version: 1`, `sections`, `header`, `layoutRevision`, `nextQuestionNumber`, `nextSectionOrder`, `fields`, `showInstructions`. As chaves exatas são compartilhadas em `corretor/v2/assessments/editor-snapshot.mjs`.
- `EDITOR_FIELD_IDS` contém os 13 controles persistentes, incluindo `sectionLabel`. Título, componente, tipo e data são confrontados com a definição; formato, identificação, dimensões, questões, ordem, IDs, cabeçalho, visibilidades e revisão são confrontados com o manifesto, sem reconstruir sua geometria.
- `header.logo`/`secondaryLogo`: somente `"manifest.header.logo"`/`"manifest.header.secondaryLogo"` ou `""`. A imagem permanece no manifesto original. Não aceitar URL, Base64, caminho livre ou imagem de outra revisão no snapshot. A hidratação restitui os bytes exatos do manifesto.
- Limites: snapshot até 128.000 bytes UTF-8; corpo HTTP permanece até 1.000.000 bytes. Allowlist em todos os níveis, strings limitadas, booleanos estritos, IDs e contadores consistentes. Não aceitar nome/código/turma nominal de estudante, listas, fotos, credenciais ou estado de sessão em nenhuma chave adicional. Campos institucionais livres exigem uso responsável; a validação estrutural não é um classificador de dados pessoais em texto livre.
- `count` da seção preserva o estado de criação; a cobertura real usa `items`. `fields.count/type/sectionLabel` são controles do próximo bloco, não precisam corresponder à primeira seção. `order` e `originalOrder` preservam a capacidade de restaurar a ordem. Novos IDs não podem colidir com os existentes.
- `createEditorSnapshot(editor,manifest)` projeta somente propriedades editoriais e troca imagens por referências. `validateEditorSnapshot(snapshot,{manifest,template?,definition?})` confere a estrutura e o vínculo; `editorFromSnapshot(snapshot,manifest)` retorna editor versão 1, sem depender do editor anterior.
- Gabarito, valores inteiros exatos, formato da nota, manifesto e hash permanecem em seus campos já existentes. Snapshot também fica dentro da definição cifrada, do MAC da operação e da revisão imutável. Duplicação conserva a definição integral; seleção continua presa à revisão. Impressão pública exclui snapshot, gabarito e valores.

## Decisão de produto e integração frontend

Salvar continua exigindo avaliação completa, gabarito e valores válidos. Não se adiciona um comando de salvar rascunho incompleto nem persistência automática. O estado Salvo exige PUT, recibo, GET e igualdade integral; editar durante/depois da operação não confirma a alteração posterior.

O Executor Funcional completa o inventário de controles e liga captura → controller → client → adaptador → PUT, restauração sem `previousEditor`, prévia dos logotipos e avisos de legado. Registros antigos não permitem recuperar preferências que nunca foram transmitidas: reconstruir somente os dados verificáveis, com padrões determinísticos e aviso dessa limitação. A revisão óptica original continua sendo a fonte da impressão inalterada.

## Testes e publicação posterior

Os testes especializados cobrem referência de logos, todos os níveis da allowlist, contradições, limites, três dimensões embedded, A4 V1/V2 anteriores, save/GET, replay, professores isolados, duplicação, seleção e imutabilidade. O Executor acrescenta comparação de todos os controles no navegador completo, A→B→A, nova sessão/contexto, fechamento/reabertura, impressão e edição pendente, no mesmo PR. Nenhum dado real é usado.

Publicação exige autorização posterior: reservar backend v3 compatível FECHADO sem tráfego; conferir bindings, segredo herdado e hash; ativar backend; comprovar capability autenticada e leitura histórica; somente depois frontend/Pages. Após a primeira definição v3 persistida, **não selecionar backend v2-only**, inclusive o backend de quadros incorporados do #119: sua allowlist antiga rejeita o campo e pode quebrar GET/catálogo. Recuperação usa somente backend v3 compatível, preservando D1, chaves, revisões, recibos e seleções. A versão fechada interrompe também leituras. Rollback de frontend não autoriza downgrade de backend. A homologação física não é substituída por testes sintéticos.
