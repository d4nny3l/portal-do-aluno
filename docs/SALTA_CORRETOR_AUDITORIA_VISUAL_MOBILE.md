# SALTA — auditoria visual e leitura móvel do Corretor

**Branch:** `codex/corretor-visual-audit`
**Base:** `origin/main` em `920861458cc833b136f7a7e4770a9d708ee98dd4`
**Escopo:** interface de `plataforma/corretor-v2.html` e segurança da orientação do leitor local. Sem mudanças em Auth, Workers, D1, Crypto Core ou Diário.

## Inconsistências verificadas

- A navegação interna usava botões roxos sólidos diferentes dos links SALTA e caía para uma coluna no celular.
- Os sete cards do dashboard reutilizavam a classe compartilhada, mas não exibiam a etiqueta e a descrição curta adotadas nos módulos oficiais do Professor.
- Painéis, campos, botões e estados vazios tinham escalas tipográficas e espaçamentos inconsistentes.
- A navegação lateral já usava a folha compartilhada `professor-theme.css`, mas as páginas carregavam versões diferentes do link do Corretor.
- Os quatro marcadores impressos eram iguais. A detecção geométrica podia encontrar a folha sem distinguir a orientação horizontal. Em testes sintéticos, a ordenação geométrica escolheu o lado contrário, o que podia inverter as alternativas.

## Correções feitas

- Reestilizei os componentes locais para usar os tokens e o shell compartilhado da Área do Professor: fundo quadriculado fixo, superfície branca, bordas suaves, roxo institucional, Inter, sidebar e topbar comuns.
- A navegação interna agora tem ícones SVG, estados transparentes/ativos compatíveis com `.teacher-shell-link` e grade adaptável: 4 colunas no desktop, 3 no tablet largo e 2 no celular.
- Recompus os sete cards com ícone, etiqueta, título, descrição curta e ação no padrão de `.module-card` da Visão Geral do Professor; os textos informam capacidades existentes sem sugerir persistência remota.
- Padronizei tipografia, campos, botões, diálogos, resultados, histórico e impressão. Os cards continuam usando `.module-card` e o grid compartilhado.
- Atualizei os menus e o redirecionamento compatível de `corretor/index.html` para a rota canônica. O arquivo EJA foi preservado sem alteração.
- O leitor requer orientação comprovada pela grade de identificação de sete dígitos para capturar automaticamente. Se essa grade estiver desativada, ausente ou não puder ser confirmada, a captura para e oferece o ajuste manual dos quatro cantos.
- A captura automática continua exigindo três frames estáveis, pausa mínima de dois segundos e retirada da folha antes da próxima leitura. Releitura reutiliza o mesmo item do histórico.
- O template impresso e as coordenadas das respostas não mudaram. A versão do normalizador foi elevada para `salta-omr-normalizer-v2` porque o contrato de orientação ficou mais estrito.

## Preservação e privacidade

- Imagens, respostas e notas provisórias continuam sendo processadas no navegador.
- Nenhum endpoint de gravação, sincronização ou envio de nota foi adicionado.
- A validação automática não transforma respostas em nota definitiva; itens em branco, duplos e ambíguos continuam exigindo conferência.
- Não houve alteração no cartão EJA arquivado nem no leitor legado.

## Testes

Os testes da etapa foram executados localmente com dados sintéticos. A suíte cobre dimensões A4, templates mistos e multipágina, bolhas em branco/duplas/ambíguas, detecção de marcadores, perspectiva sintética, orientação via grade de código, rejeição de orientação não confirmada e ajuste manual.

### Matriz de validação visual

| Viewport | Professor e Corretor comparados | Navegação e telas internas | Câmera |
| ---: | --- | --- | --- |
| 1468 × 720 | shell e dashboard comparados no Chrome; branch renderizada em cópia local | navegação e views principais conferidas na cópia local | não testada |
| 1024 px | não testado | não testado | não testada |
| 768 px | não testado | não testado | não testada |
| 390 px | não testado | não testado | não testada |
| 375 px | não testado | não testado | não testada |

A página publicada autenticada ainda serve a versão anterior ao PR. A comparação de conteúdo da branch foi feita na cópia local, sem publicação em Pages.

### Limites de homologação

- A foto de perspectiva é sintética; não mede desempenho com folhas, iluminação, foco ou câmeras físicas.
- A abertura da câmera requer permissão no navegador. Não foi solicitada permissão para acessar a câmera do usuário durante a auditoria.
- A compatibilidade física com iPhone/Safari e Android/Chrome ainda precisa de teste em dispositivo real. Emulação de viewport não substitui essa etapa.
- Cartões sem grade de identificação exigem ajuste manual de orientação para impedir leitura espelhada acidental.

## Checklist da auditoria

1. **Composição dos cards:** corrigida para incluir etiqueta e descrição curta, conforme o componente oficial; conteúdo operacional mantido.
2. **Versão anterior na navegação:** removida da navegação normal; rota antiga redireciona; arquivo EJA preservado.
3. **Tipografia:** padronizada com Inter e tokens SALTA; rótulos mantidos legíveis.
4. **Botões e menus:** shell lateral compartilhado preservado; navegação interna aproximada ao estado ativo SALTA.
5. **Composição:** cards, painéis, formulários, modais e resultados alinhados em um sistema consistente.
6. **Rótulos de desenvolvimento:** ausentes na interface comum; estado real de sessão e armazenamento continua explícito.
7. **Todas as telas:** dashboard, avaliação, lista, correção, revisão, modelos, cabeçalho, análise e impressão cobertos pela revisão.
8. **Renderização real:** parcialmente verificada. A sessão autenticada permitiu abrir a versão pública atual e confirmar o shell. A página pública ainda serve o commit anterior; a branch foi renderizada em cópia local com gate de autenticação neutralizado apenas nessa cópia. As duas telas foram comparadas no Chrome em 1468 px, sem emulação mobile.
9. **Regressão OMR e rotas:** 19 testes sintéticos passaram; módulos OMR tiveram checagem de sintaxe. A conferência de câmera física e iPhone permanece pendente.
10. **Publicação:** commit e PR #27 publicados na branch experimental; CI passou no commit `4941c46c3dbfb78d7fb459d0f52fda97f5e0480b`. PR não mesclado e GitHub Pages de produção não atualizado, aguardando validação visual autenticada.

## Publicação

Branch experimental: `codex/corretor-visual-audit`. Commit de correção do workflow: `baf864040f0cb5d737fa3a002c51bba095d06d45`. PR #27: https://github.com/d4nny3l/portal-do-aluno/pull/27. CI: workflow `SALTA teacher OMR integration`, execução 42807388983, concluída com sucesso; 19 testes passaram, 2 scripts inline foram detectados e validados como ES modules, e `git diff --check` passou. A primeira execução do workflow havia extraído zero scripts por excesso de escape na expressão regular; a falha foi corrigida e revalidada. A URL pública consultada foi https://d4nny3l.github.io/portal-do-aluno/plataforma/corretor-v2.html?v=20261109q; a autenticação foi concluída nesta retomada e confirmou que o Pages ainda serve a versão anterior ao PR. Não houve merge ou deploy para Pages, nem deploy de Worker, migração ou gravação remota.


## Retomada em 10/11/2026

- Na primeira conferência da retomada, `git status` estava limpo e HEAD era `0164bfc`; os commits locais anteriores eram a auditoria e a limpeza de whitespace. A branch remota do PR foi sincronizada com as correções de documentação e de workflow descritas neste relatório.
- Testes locais repetidos: 19 aprovados, 0 falhas; `git diff --check` limpo. A execução CI do commit `4941c46c3dbfb78d7fb459d0f52fda97f5e0480b` concluiu com sucesso, mas a revisão revelou que o passo de sintaxe do workflow extraía zero scripts por uma expressão regular excessivamente escapada. O workflow foi corrigido para detectar e validar os dois módulos inline como ES modules; os dois passaram localmente e na execução remota 42807388983.
- Navegador real: o usuário concluiu o login na Área do Professor. A página pública abre autenticada e confirma que o Pages ainda entrega a versão antiga, sem as correções desta branch. Não foi solicitada permissão de câmera. A emulação de larguras responsivas ainda não foi executada.

- Renderização local no Chrome após liberar somente a cópia descartável do gate de sessão: menu, shell SALTA e dashboard conferidos lado a lado com a Área do Professor; criação de avaliação e prévia de cartão A4 sintético funcionaram. O gate original e todos os arquivos de produção permaneceram intactos.
- A renderização revelou o cascade do tema global sobre a navegação; o estado foi corrigido com `tab` e exclusão de `[data-view]` dos estilos genéricos. O teste verifica a exceção.
- A renderização também mostrou cards altos e vazios porque faltavam etiqueta e descrição. Os sete cards foram recompostos com os cinco elementos da referência; a cópia local foi recarregada e conferida visualmente, com textos e alinhamento visíveis.
