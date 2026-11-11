# SALTA — auditoria de interface administrativa

## Escopo e preservação

O PR #29 consolida a navegação administrativa e organiza a interface do Corretor 2.0. A revisão final foi feita em worktree limpo, a partir da branch remota `codex/salta-admin-ux-audit` (`bf460bf`), incorporando `main` em `a93089e` por merge, sem reescrever o histórico.

O hotfix do Diário do PR #30 foi preservado integralmente. O Diário, os diretórios `stats-worker`, `auth-worker` e `corretor/v2/omr` são idênticos à `main` atualizada. A câmera, a captura e os algoritmos de leitura OMR não foram modificados. Não houve acesso ou escrita em dados acadêmicos reais, D1 ou configurações Cloudflare. O fluxo de autenticação por sessão e cookies foi mantido.

## Padronização implementada

- `plataforma/admin-shell.mjs` centraliza cabeçalho, oito links administrativos, grupos, estado ativo, menu responsivo, backdrop e fechamento por Escape.
- O shell atende Visão Geral, relatórios acadêmicos, Corretor, avisos, fechamento bimestral, Festival e administração da Mostra Cultural.
- O Corretor usa quatro etapas: Visão geral, Criar avaliação, Corrigir cartões e Cartão-resposta. Placeholders sem função foram removidos da navegação visível.
- O formulário agrupa dados da avaliação, questões e apresentação. Dimensões incorporadas, identificação por código e posição C-D-U aparecem conforme a seleção.
- Os dados da avaliação são definidos uma vez. O modal mantém instituição, professor, série, ano e elementos visuais.
- PDF/impressão é a ação principal; outros formatos, arquivos técnicos e impressão em lote ficam em grupos recolhíveis. O seletor de página única foi mantido oculto por compatibilidade.
- Cards, cores, botões, foco e navegação seguem o tema compartilhado da Área do Professor. Os alvos do menu têm ao menos 44 px de altura.

## Falhas corrigidas na revisão final

1. O link “Plataforma SALTA” apontava um nível acima do correto. Agora retorna a `plataforma/` tanto nas páginas internas quanto na Mostra, respeitando o prefixo do GitHub Pages.
2. O cabeçalho público da Mostra havia sido removido. Foi restaurado, mantendo a navegação compartilhada no modo administrativo.
3. O botão `logoutButton` da Central de avisos havia sido removido, mas seu listener permanecia e interrompia a inicialização. O botão Sair foi recolocado no título da página; o handler de autenticação original não foi alterado.
4. Uma regra CSS mais específica mantinha a largura de desktop em quatro páginas no celular, reduzindo o conteúdo a 138 px num viewport de 390 px. A regra responsiva agora prevalece e usa toda a largura.
5. Cabeçalho e barra lateral receberam `box-sizing` consistente, e a Visão Geral usa as mesmas dimensões do shell.
6. Escape devolve o foco ao botão do menu somente quando o menu estava aberto, preservando o comportamento dos outros controles.

## Diário e bloqueio anterior

O diagnóstico inicial encontrou `plataforma/diario-teste.html` corrompido e binário. O PR #30 restaurou o HTML e adicionou a CI de integridade. Após incorporar `a93089e`, o teste de períodos e do adaptador HTTP passou. Nenhuma correção adicional no Diário foi necessária ou aplicada. Sua navegação interna permanece fora do escopo deste PR; o link para ele está preservado no menu compartilhado.

## Validação final antes do merge

- 51 testes aprovados: `node --test corretor/v2/tests/*.test.mjs stats-worker/tests/*.test.mjs plataforma/tests/*.test.mjs`.
- Sintaxe do shell, de todos os módulos OMR e dos 11 scripts inline em dez páginas aprovada.
- `git diff --check` aprovado; comparação com a main confirma ausência de mudanças no Diário, Workers e módulos OMR.
- Chrome em 1440 × 900 e 390 × 900: dez páginas administrativas e a Mostra pública, totalizando 22 combinações. Sem erros JavaScript ou overflow horizontal do documento. Todas as páginas administrativas têm oito links, um estado ativo e retorno correto à plataforma.
- Menu móvel verificado nas dez páginas administrativas: abertura, `aria-expanded`, fechamento por Escape e retorno do foco. A largura de conteúdo móvel é 390 px; a Mostra pública mantém margens e largura de 364 px.
- Corretor: campos condicionais de quadro incorporado e C-D-U, navegação entre etapas e geração de uma prévia SVG verificados nas duas larguras.
- Sete páginas verificadas com resposta de sessão não autenticada: login/redirecionamento ou painel bloqueado; nenhum painel acadêmico liberado.
- A CI de integração foi ampliada para executar também os testes do Diário e conferir a sintaxe de todas as páginas revisadas.

As verificações visuais e de sessão usam contextos de navegador isolados com respostas de rede simuladas e dados vazios. Os arquivos publicados mantêm o gate original. Login com credenciais reais e operações acadêmicas de escrita não foram exercitados. A auditoria não substitui uma avaliação formal com leitor de tela.

## Publicação e reversão

A publicação desta revisão está autorizada pelo responsável. O terminal não possui autenticação para push; a atualização é feita pelo conector GitHub autorizado, com conferência do SHA esperado da branch e sem force push. O merge só deve ocorrer após CI verde. Depois, deve ser conferida a execução do GitHub Pages e a correspondência dos arquivos servidos com o commit integrado.

Se for necessária reversão após publicação, reverta o merge deste PR, preservando o hotfix `a93089e` e os dados existentes.
