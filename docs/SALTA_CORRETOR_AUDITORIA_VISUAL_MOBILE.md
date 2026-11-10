# SALTA — auditoria visual e leitura móvel do Corretor

**Branch:** `codex/corretor-visual-audit`
**Base:** `origin/main` em `920861458cc833b136f7a7e4770a9d708ee98dd4`
**Escopo:** interface de `plataforma/corretor-v2.html` e segurança da orientação do leitor local. Sem mudanças em Auth, Workers, D1, Crypto Core ou Diário.

## Inconsistências verificadas

- A navegação interna usava botões roxos sólidos diferentes dos links SALTA e caía para uma coluna no celular.
- Os sete cards do dashboard repetiam título, descrição, etiqueta e ação, aumentando o ruído visual.
- Painéis, campos, botões e estados vazios tinham escalas tipográficas e espaçamentos inconsistentes.
- A navegação lateral já usava a folha compartilhada `professor-theme.css`, mas as páginas carregavam versões diferentes do link do Corretor.
- Os quatro marcadores impressos eram iguais. A detecção geométrica podia encontrar a folha sem distinguir a orientação horizontal. Em testes sintéticos, a ordenação geométrica escolheu o lado contrário, o que podia inverter as alternativas.

## Correções feitas

- Reestilizei os componentes locais para usar os tokens e o shell compartilhado da Área do Professor: fundo quadriculado fixo, superfície branca, bordas suaves, roxo institucional, Inter, sidebar e topbar comuns.
- A navegação interna agora tem ícones SVG, estados transparentes/ativos compatíveis com `.teacher-shell-link` e grade adaptável: 4 colunas no desktop, 3 no tablet largo e 2 no celular.
- Removi etiquetas decorativas e descrições redundantes dos cards. Mantive rótulos, privacidade, validações, limites, estados vazios e instruções necessárias à operação.
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

### Matriz visual a preencher após validação publicada

| Largura | Professor e Corretor comparados | Navegação e telas internas | Captura |
| ---: | --- | --- | --- |
| 1440 px | pendente | pendente | pendente |
| 1024 px | pendente | pendente | pendente |
| 768 px | pendente | pendente | pendente |
| 390 px | pendente | pendente | pendente |
| 375 px | pendente | pendente | pendente |

### Limites de homologação

- A foto de perspectiva é sintética; não mede desempenho com folhas, iluminação, foco ou câmeras físicas.
- A abertura da câmera requer permissão no navegador. Não foi solicitada permissão para acessar a câmera do usuário durante a auditoria.
- A compatibilidade física com iPhone/Safari e Android/Chrome ainda precisa de teste em dispositivo real. Emulação de viewport não substitui essa etapa.
- Cartões sem grade de identificação exigem ajuste manual de orientação para impedir leitura espelhada acidental.

## Checklist da auditoria

1. **Descrições redundantes:** corrigido nos cards; mensagens operacionais e acessibilidade mantidas.
2. **Versão anterior na navegação:** removida da navegação normal; rota antiga redireciona; arquivo EJA preservado.
3. **Tipografia:** padronizada com Inter e tokens SALTA; rótulos mantidos legíveis.
4. **Botões e menus:** shell lateral compartilhado preservado; navegação interna aproximada ao estado ativo SALTA.
5. **Composição:** cards, painéis, formulários, modais e resultados alinhados em um sistema consistente.
6. **Rótulos de desenvolvimento:** ausentes na interface comum; estado real de sessão e armazenamento continua explícito.
7. **Todas as telas:** dashboard, avaliação, lista, correção, revisão, modelos, cabeçalho, análise e impressão cobertos pela revisão.
8. **Renderização real:** pendente da revisão publicada em desktop e emulação mobile nas larguras da matriz.
9. **Regressão OMR e rotas:** testes sintéticos automatizados executados; câmera física e iPhone permanecem pendentes.
10. **Publicação:** pendente de PR, CI, merge e confirmação do GitHub Pages.

## Publicação

Atualizar este bloco com commit, PR, CI e URL confirmada depois da publicação. Nenhum deploy de Worker, migração ou gravação remota faz parte desta revisão.
