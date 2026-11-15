# Cabeçalho direto — Fase 1

Data: 15/11/2026. Base: PR #34 / `d47bcc3`.

Personalizar cabeçalho continua como seção expansível independente, inicialmente fechada. Seus controles ficam diretamente na seção, sem abas Título/Dados e logotipos. Há um editor do título da avaliação sincronizado nos dois sentidos com Dados da avaliação, por um único valor canônico; CARTÃO DE RESPOSTAS permanece o título fixo impresso e a instituição continua multilinha e independente.

Foram removidos o editor de criação de campos personalizados, o botão Adicionar campo, o aviso permanente de capacidade e seus handlers obsoletos. O estado/metadata e a interpretação de campos personalizados em manifestos anteriores permanecem preservados. Os erros reais de excesso de texto/capacidade continuam nos renderizadores originais.

Não há alterações em `corretor/v2/omr/`, geometria, renderização, manifestos históricos, Workers, autenticação, Diário ou dados. Os links do Corretor recebem somente novo cache da interface.

Validação: 93 testes integrados aprovados; teste comportamental do título único substitui o teste das abas removidas. Sintaxe inline e diff sem erros. Navegador: edição em ambos os campos, persistência ao recolher/reabrir, instituição multilinha, título fixo/subtítulo distinto e geração V2; desktop 1440 px e mobile 390 px sem overflow, console da aba local sem erros. Regressões ópticas e de logos executadas pela CI no SHA do PR. Capturas completas locais em `outputs/avaliacoes-fase1/`.

O ajuste não homologa papel/câmera físicos nem A-03. O banco de avaliações será tratado no segundo PR, em ambiente isolado.
