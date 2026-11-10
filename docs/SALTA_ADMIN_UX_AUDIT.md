# SALTA — auditoria de interface administrativa

## Escopo

Esta revisão consolida a navegação administrativa em um componente compartilhado e organiza a interface do Corretor 2.0. O trabalho foi feito em worktree isolado na branch `codex/salta-admin-ux-audit`, baseada na `origin/main` em `dec31ff`.

Não foram alterados Workers, D1, notas, frequência, rotinas de autenticação no servidor, o leitor OMR ou os dados acadêmicos. O fluxo de autenticação do professor foi preservado; na Visão Geral, a classe visual da área administrativa só é ativada depois da resposta de sessão autenticada.

## Implementado

- `plataforma/admin-shell.mjs` centraliza cabeçalho, menu lateral, estado ativo, retorno à Visão Geral, botão responsivo, backdrop e fechamento por `Escape`.
- O shell foi integrado à Visão Geral, relatórios acadêmicos, Corretor, avisos, fechamento bimestral, Festival da Consciência Negra e administração da Mostra Cultural.
- O Corretor deixou de repetir a navegação administrativa e passou a usar o mesmo shell. O menu interno agora contém quatro etapas de trabalho. Painéis que eram apenas placeholders de persistência, análises ou revisões foram removidos da navegação visível; as operações existentes de captura, leitura, conferência e exportação foram preservadas.
- O formulário do gerador foi organizado em dados da avaliação, questões e apresentação. Identificação por código, dimensões do quadro incorporado e posição C-D-U aparecem conforme o formato escolhido.
- Removi `assessmentValue`, que não era lido pelo código nem participava do gabarito ou do cálculo de nota. O valor da correção continua no controle ativo da área de leitura.
- Título, componente, turma e data da avaliação são definidos uma vez; o modal do cabeçalho mantém instituição, professor, série, ano letivo e elementos visuais.
- PDF/impressão passou a ser a ação principal. SVG, PNG e JPG ficam em “Outros formatos”; JSON e mapas de layout ficam em “Arquivos técnicos”; impressão em lote fica recolhida separadamente. O seletor de página única não aparece, mas seu elemento oculto foi mantido por compatibilidade com a leitura existente.
- As cores e o layout dos cards passaram a seguir os componentes `.module-card` da Área do Professor. Corrigi a regra global de botões SALTA que originalmente pintava os cards inteiros de roxo.
- O contraste de foco, alvos de navegação e textos da navegação compartilhada foram ajustados. Os links do Corretor usam um identificador de cache novo para servir o HTML/CSS revisados.

## Páginas consideradas

Foram auditados: `plataforma/professor.html`, `plataforma/corretor-v2.html`, `plataforma/estatistica.html`, `plataforma/estatistica-individual.html`, `plataforma/estatistica-turma.html`, `plataforma/estatistica-acessos.html`, `plataforma/mensagens.html`, `plataforma/fechamento-bimestre.html`, `plataforma/festival-consciencia-negra-admin.html` e `mostra-cultural.html`.

### Bloqueio do Diário

`plataforma/diario-teste.html` foi identificado como arquivo binário (“data”), não HTML textual. A leitura não permite delimitar o shell, confirmar seu fluxo ou aplicar a navegação sem reconstruir/substituir conteúdo. Como esta auditoria proíbe mudanças no Diário e nos dados, ele não foi editado. A rota do Diário permanece no menu compartilhado; é necessário recuperar uma versão textual íntegra antes de padronizar essa página.

## Validação realizada

- 38 testes combinados de layout/OMR e do shell passaram (`node --test plataforma/tests/*.test.mjs corretor/v2/tests/*.test.mjs`).
- `node --check` passou no componente do shell e em todos os módulos OMR.
- 11 scripts inline das páginas administrativas analisadas passaram em `node --check`.
- Verificações estáticas confirmaram IDs únicos na página do Corretor, ausência de referências `$()` sem elemento e uma ocorrência de cada controle de impressão.
- Navegador local (Chrome): menu administrativo renderizado na Mostra em modo administrativo; área restrita continuou bloqueada quando a sessão local não estava disponível.
- Para avaliar a tela do Corretor visualmente, foi usado um fixture local temporário que substituiu somente o gate de sessão no arquivo de `/tmp`; nenhum arquivo de autenticação do repositório ou serviço foi modificado. Foram renderizados o dashboard em 1440 px e 390 px, e a tela de criação em 1280 px. No viewport mobile emulado por CDP, a largura do documento foi 390 px, sem overflow horizontal. Cards brancos, abas neutras, menu hambúrguer e uma coluna foram confirmados.
- No mesmo navegador local, a tela de criação confirmou que as dimensões incorporadas ficam ocultas inicialmente e aparecem ao selecionar quadro incorporado; o controle C-D-U aparece ao selecionar esse formato.
- `git diff --check` passou.

### Teste amplo do Worker

O comando `node --test corretor/v2/tests/*.test.mjs stats-worker/tests/*.test.mjs plataforma/tests/*.test.mjs` terminou com 38 testes aprovados e 1 falha preexistente em `stats-worker/tests/diario-periods.test.mjs`: o teste não consegue extrair o adaptador HTTP da interface do Diário. A causa é a mesma limitação do arquivo binário acima. Não tentei contornar isso alterando o Diário ou o Worker.

## Limites e próximos passos

- Esta branch não foi publicada, mesclada nem implantada; não há CI remoto a reportar.
- O login real não foi exercitado por este preview local. Nenhum token, senha ou sessão foi gravado ou alterado.
- O Diario aguarda recuperação do HTML textual. A Mostra foi inspecionada com backend local indisponível, de modo que os dados e ações administrativas continuaram protegidos.
- A auditoria não é certificação de acessibilidade. Foram verificados rótulos, foco visível, estado ativo, menu por teclado e largura mobile; uma avaliação formal com leitor de tela ainda é necessária.

## Reversão

Como as alterações estão isoladas em `codex/salta-admin-ux-audit`, a reversão é simplesmente fechar ou excluir essa branch/worktree após revisão. Nenhum deploy, merge ou alteração remota foi realizado.
