# Codex — missão: redesign do cartão-resposta SALTA

## Base obrigatória
- Repositório: `d4nny3l/portal-do-aluno`.
- Prosseguir na branch do PR #31: `codex/salta-contexto-corretor-ux-20261114`. Confirmar que ela está atualizada e que não há alterações locais não commitadas; não sobrescrever trabalho pendente.
- Ler integralmente `AGENTS.md`, `docs/SALTA_DIRETRIZES_PRODUTO.md`, `docs/SALTA_CORRETOR_REVISAO_VISUAL_20261114.md`, `docs/SALTA_CARTAO_RESPOSTA_DESIGN_SPEC.md` e a documentação técnica OMR em `docs/`.
- Anexo de referência visual: prova institucional de 2025 (página 1) e `TESTE.pdf` gerado pela SALTA. Se não estiverem acessíveis ao Codex, basear-se no dossiê técnico, registrar essa limitação e solicitar anexos apenas para a comparação final. Não adicionar PDFs com dados nominais ao repositório público.

## Implementação aprovada
1. Remover na **origem do SVG**, e portanto de todas as exportações, o texto impresso de modelo/revisão/hash. Preservar manifesto, revisionamento e compatibilidade de leitura internamente.
2. Centralizar títulos principal e de seções nos seus limites geométricos.
3. Reorganizar cabeçalho com identidade institucional, metadados e aluno em regiões bem definidas. Não permitir interseção com o código óptico de 7 dígitos nem com marcadores.
4. Desenhar borda fechada envolvendo todas as questões de cada seção; tratar seções que continuam em outra coluna com segmentos visuais e título centralizado, sem duplicar questões.
5. Estilo próprio SALTA, institucional sofisticado, preto no branco. Não copiar literalmente o PDF de referência.
6. Melhorar legibilidade das alternativas A–E e dígitos. Verificar densidade óptica: trocar letras contornadas por preto sólido sem testes pode produzir falsos positivos.
7. Imprimir datas válidas em `dd/mm/aaaa`, mantendo ISO em dados internos.
8. Preservar a limpeza de interface do PR #31, a saída A4, os quatro fiduciais, modo incorporado, exportação e compatibilidade de cartões anteriores.

## Execução
- Auditar `corretor/v2/omr/{render,layout,template,reader,normalize,export}.mjs` e o código da interface. Entregar resumo do risco geométrico antes de alterações destrutivas.
- Implementar diretamente as regras em commits pequenos na branch de revisão; não fique somente criando um novo plano.
- Criar testes para: ausência de rodapé, títulos centralizados, seções com moldura, colisões com cabeçalho, A-D/A-E/C-E/CDU, 7 dígitos, nomes/turmas longos, com/sem logos, modo incorporado, 10/20/50/100/150 questões.
- Testar SVG, PDF via impressão, PNG e JPG; se um cartão não couber com geometria segura, comunicar limite sem diminuir bolhas silenciosamente.
- Gerar arquivos sintéticos antes/depois e registrar observações de eventual validação física pendente. Não afirmar aprovação OMR sem testes com impressora e câmera reais.
- Executar os testes integrados, CI e inspeção de telas desktop/mobile, documentando o que não pôde ser verificado.
- Atualizar PR #31 em draft ou abrir PR relacionado e explicar sua base se o escopo ficar grande. Fornecer links para commits, CI, exemplos gerados e checklist de revisão.

## Limites
- Autorizo somente **branch e PR para revisão**, não merge ou deploy em produção.
- Não alterar D1 remoto, Workers, Diário, notas, alunos ou autenticação.
- Nunca expor credenciais, arquivos nominais ou registros escolares reais.
