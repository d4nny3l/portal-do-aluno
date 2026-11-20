# SALTA — Biblioteca unificada de avaliações (P0)

**Decisão do proprietário:** plataforma única. A biblioteca fica somente em `plataforma/corretor-v2.html` → aba **Criar avaliação**. A aba **Corrigir cartões** mantém HTML, controles, câmera e CSS exatamente como na `main` de base. Nenhuma interface nova deve expor termos de teste/piloto/homologação.

## Implementação do PR

- UI compacta **Minhas avaliações / Nova avaliação / Salvar avaliação / Abrir avaliação / Duplicar avaliação**, mais **Usar na correção**, consultar versões, paginação e estado do servidor. Sem novo login e sem expor IDs.
- Usa os módulos originais já presentes na `main`: `private-client.mjs`, `private-library.mjs`, `private-contract-adapter.mjs`, `block-scoring.mjs`; não cria Auth, D1, Worker, endpoint, segredo ou armazenamento no navegador.
- Gateway único: `https://salta-stats.dannyel-moises.workers.dev/assessments/v1`; se estiver desativado, não informa que gravou. A autoridade é sempre a sessão SALTA, o gateway e os grants do servidor.
- Um único escopo concedido é selecionado automaticamente; múltiplos exigem seleção consciente. A biblioteca usa a revisão histórica por ID, com gravação confirmada por recibo + GET original, CAS e repetição idempotente.
- Salva somente avaliação **completa** como versão emitida: o contrato v2 atual exige data, todos os blocos com pontuação positiva e gabarito completo. Em nova edição, o backend cria nova revisão imutável. Cópia usa operação de duplicação original.
- Formatos suportados pelo contrato existente: **A–D, A–E e C–E**, inclusive seções mistas, **1–150 questões** sujeito à geometria A4; limite de 32 blocos e uma folha. A interface não limita a A/B nem a 60 questões. **CDU e formato incorporado** continuam utilizáveis no Corretor para suas funções publicadas, mas não são convertidos silenciosamente nem declarados persistidos pela biblioteca.
- Restaura `manifest` geométrico original e header do próprio manifesto, inclusive turma, instituição, docente, campos opcionais, visibilidade e logo incorporado, quando presentes no modelo. Não presume restauração de entrada nominal individual de estudante; é bloqueado seu cadastro como modelo reutilizável. Verificar em homologação real round-trip de logo e campos customizados, especialmente modelos legados.
- A correção exige **seleção humana explícita** de avaliação e versão emitida, com confirmação do lote, antes de fixar o gabarito. Não infere A/B de fotografia. No código da nota, com seleção vigente, usa o motor original de soma exata por bloco; se hash/modelo não coincide ou identificação está inconclusiva, falha fechado. Não altera marcação HTML da aba Corrigir, geometria, câmera, normalização óptica ou CSS. Sem lançamento automático no Diário.
- `plataforma/avaliacoes-biblioteca.css` só utiliza `#savedAssessments` dentro da aba Criar avaliação. O CSS antigo do Corretor permanece byte a byte inalterado.

## Contrato de persistência — lacunas para CODEX (somente se Diretoria autorizar)

**Pedido mínimo de análise ao CODEX, sem intervenção automática:** a definição v2 atual impõe `exact(input, ['schemaVersion','title','subject','kind','date','manifest','blocks','answers','display'])`. Confirme se a arquitetura deve passar a persistir um **snapshot completo e versionado dos campos do editor**, não apenas campos que participam do `manifest.header`. Há campos editoriais e preferências transitórias que não são cobertos explicitamente pelo payload (ex.: valores padrões de entrada/seletores, rascunho de gabarito incompleto). A classe/turma e os dados de apresentação podem ser recuperados de `manifest.header` do A4; entretanto, isso não substitui um contrato de editor universal, sobretudo ao ampliar modalidades.

A persistência de **rascunhos incompletos**, modelo **CDU** e quadro **incorporado** não é coberta por `validateDefinition()` hoje. Solicitar decisão de produto antes de alterar contrato, com migração compatível, validação de tamanho/segurança, história/revisões e testes de downgrade. **Não improvisar campos fora da allowlist nem criar tabelas.**

## Dependências e rollout

1. PR precisa de CI verde, auditoria independente do HEAD, avaliação da integridade/restauração do cabeçalho e regressão visual. Não fazer merge/deploy deste PR automaticamente.
2. Backend privado e gateway `/assessments/v1` do PR #74 **não estão incorporados à `main` de referência**; sua instalação/ativação e os grants são gate independente reservado ao CODEX/Diretoria. O frontend só não basta para salvar enquanto gateway/desbloqueio não estiver operacional.
3. Homologação física: login SALTA único, Mac/Safari e iPhone, criar A/B e outras avaliações, salvar, fechar a aba/navegador e reabrir, conferência de revisão, escopos diferentes, imagem/cartão real e escala A4. Sem alunos reais até aprovação.
4. **Remover página paralela** `plataforma/piloto-avaliacoes.html` (e script/CSS/testes/workflow exclusivos) **somente depois que a biblioteca principal estiver ativa, auditada, publicada e homologada**; não remover os cinco módulos `corretor/v2/assessments/private-*.mjs` compartilhados. Sugerir PR de limpeza pequeno sob autorização, não remover antes para evitar interrupção da rota atualmente publicada.
5. Futuro rollback de integração: revert exclusivo do merge aprovado deste PR; sem rollback de banco, Auth ou Stats. O estado de produção depende das decisões de implantação próprias.

**Parecer:** integração frontend candidata. **Não declarar pronta em produção** sem gateway, auditoria, backup e homologação real dos dispositivos.
