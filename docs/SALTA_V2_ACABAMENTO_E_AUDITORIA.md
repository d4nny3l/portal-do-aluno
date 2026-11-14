# SALTA V2 — acabamento terminológico e auditoria geral

Base: `16113b6d2c40971335e9eb7e2b8c071ee557300b`, publicada e aprovada visualmente. Pedido atual autoriza PR, CI, merge e Pages após validação. O cartão não foi redesenhado.

## 1. Alteração solicitada e implementação

O render V2 imprime **CÓDIGO DO ALUNO** em vez de CÓDIGO SALTA. Mantidos tamanho 2,2 mm, peso, centro, posição, moldura, sete colunas e 70 bolhas. Interface, ajuda, erros de validação e instruções de lote usam Código do aluno (7 dígitos) ou código do aluno, conforme o contexto. Os termos Nome nominal, Turma nominal e QR nominal continuam descrevendo seus próprios recursos.

Nenhum identificador interno, esquema, número/código armazenado, regra de validação ou contrato de reconhecimento mudou. Leitor, normalizador, câmera e composição geométrica têm somente URLs de importação atualizadas para evitar cache antigo. Versão de página/cache: `v2-20261114-final` / `20261114v2final`; versões e hashes dos manifestos continuam iguais para as mesmas entradas.

## 2. Testes e evidências

- **83 testes integrados aprovados localmente**, incluindo os cinco novos testes de manutenção, regressões do Corretor, plataforma e Worker (Worker sem alterações).
- Antes da troca, capturadas 15 referências da base publicada, A-D/A-E/C-E × 10/20/50/100/150. Após a troca, SHA-256 do manifesto inteiro permanece igual. SHA-256 do SVG também permanece igual depois de normalizar exclusivamente o título antigo para o novo. Isso confere todas as coordenadas, bolhas, marcadores, molduras, textos restantes e atributos; não apenas contagens.
- Título cabe com a fonte original, centralizado. Identificação manual, ausente ou código desligado não imprime módulo/título. A4 210×297 mm e lote nominal de duas folhas verificados.
- Importação/leitura V1 e das duas revisões V2 anteriores, usando os manifestos exatos. Nenhum arquivo histórico existente foi sobrescrito ou recomposto para acomodar o título. A fixture V2 do cabeçalho 1 é cópia do modelo sintético emitido pela publicação anterior.
- Raster: 15 composições padrão, 18 variantes de instituição/identificação/instruções, quatro casos de logos (quadrado, vertical, horizontal e duplo), identificação fictícia 0001200, alternativas preenchidas, duplas/fracas e cartões vazios. Sem regressão nos casos ensaiados; ambiguidades continuam exigindo revisão.
- **Exportações reais pela interface do Chrome:** SVG, PNG, JPG e JSON. PNG/JPG medidos em 2480×3508 px, 300 DPI; releitura do arquivo efetivamente baixado reconheceu 0001200 e 20 respostas em branco. O evento de download da extensão não notificou o PNG, mas o arquivo baixado foi encontrado, copiado e validado por conteúdo/metadados/leitor.
- Prévia nominal A4 inspecionada em SVG/PNG e em PDF de uma página gerado do PNG exportado a 300 DPI. PDF renderizado e conferido, sem declarar impressão física ou uso do diálogo nativo nesta rodada.
- Desktop: rótulo correto, sete colunas, 70 bolhas, quatro marcadores e status vazio. Campos personalizados aparecem com nomes acessíveis na árvore do Chrome.
- Mobile isolado em navegador interno, 390×844: rótulo e ajuda corretos, geração com novo título, scrollWidth=390 e status vazio. Viewport restaurado e aba temporária fechada. A sessão local foi simulada somente no servidor QA; autenticação de produção não foi alterada.

## 3. Auditoria por área

| Área | Conferência | Resultado e limites |
|---|---|---|
| Cabeçalho, logos e metadados | Faixa única, visibilidade, limites, alpha/cinza, 1:1/1:4/4:1 e duplo | Regressões e inspeção visual preservadas; nenhuma nova alteração estética |
| Nome e código do aluno | Manual/nominal/ausente, zeros à esquerda e título | Nova terminologia; geometria e dados iguais; sem título quando desligado |
| Seções e numeração | Mistos, IDs, ordem visual e continuações | Sem duplicação nos modelos ensaiados; ver achado A-03 sobre correção com números não contíguos |
| Continuação e espaços | Molduras/limites e textos extensos | Mantidos, inclusive títulos (cont.); sem compactação adicional |
| SVG/PNG/JPG/A4 | Downloads reais, dimensão/DPI, PDF derivado | Aprovados nos arquivos fictícios testados; driver/impressora/câmera física não ensaiados |
| Nominal e lote | Nomes, código fictício, duas folhas, turma extensa | Exportação mantém modelo exato e código; excesso nominal continua erro explícito |
| Compatibilidade | V1, V2 anterior e cabeçalho 1 | Importação e leitura sem recomposição; exige modelo correto, sem autodetecção por fotografia |
| Óptica e ambiguidades | Vazias, marcadas, dupla/fraca e fiduciais | Casos sintéticos aprovados; não equivale a precisão em fotos reais |
| Erros e acessibilidade | Código inválido, excesso de campos, labels e revisão | Mensagens padronizadas e dois ajustes acessíveis; não houve teste com leitor de tela real |
| Campos extensos | Quebra em até duas linhas e rejeição de excesso | Mantida a proteção do PR32, sem fonte menor ou mudança de geometria |

## 4. Problemas adicionais

### A-01 — campos personalizados sem nomes programáticos (corrigido)

Rótulo e conteúdo dependiam de placeholders; caixa de visibilidade e botão × eram pouco distinguíveis entre vários campos. Acrescentados nomes acessíveis com o índice do campo, sem mudar a aparência ou o comportamento. A árvore do navegador confirmou Rótulo/Valor/Exibir/Remover campo personalizado 1.

### A-02 — revisão de respostas sem associação label/select (corrigido)

O label da questão e o select eram elementos irmãos sem vínculo programático. Adicionados ID ao select e htmlFor ao label. Sem mudança no leitor, respostas, gabarito ou cálculo da nota. A conferência desta associação foi de código/sintaxe; o fluxo completo de revisão com leitor de tela permanece pendente.

### A-03 — correção pressupõe numeração contígua a partir de 1 (P1, não alterado)

**Reprodução:** adicionar dois blocos de dez questões e remover o primeiro. O gerador preserva corretamente os números 11–20. A função real `parseKey()` foi executada em ensaio isolado com esse modelo e um gabarito válido 11 C ... 20 C. Retornou “Resposta inválida na questão 1 para o formato A-E.”. Além disso, `renderAnswers()` consulta `template.questions[observation.number-1]`, que fica fora do array para o primeiro número 11 nesse exemplo.

Evidência: `achado-numeracao.json` no pacote local; fonte: funções `parseKey` e `renderAnswers` de `plataforma/corretor-v2.html`. Não houve leitura/correção de aluno real ou cálculo/gravação de nota acadêmica no ensaio.

É um problema anterior à manutenção, não uma regressão da troca do título. Recomenda-se PR separado para mapear questões por número/ID e revisar a relação com o gabarito e a nota provisória. Não foi corrigido automaticamente porque afeta o fluxo de conferência da nota. Até validação específica, usar numeração contígua 1–N na correção por esta tela. O gerador de cartões não foi renumerado nem redesenhado.

## 5. Recomendações opcionais por prioridade

- **P1:** tratar A-03 em trabalho separado com gabaritos válidos/inválidos, exclusão/reordenação de blocos e notas provisórias, sem envolver dados reais. Não alterar fórmulas ou critérios pedagógicos.
- **P1 — homologação física:** imprimir em escala 100%, conferir medidas, fotografar/ler com canetas e celulares distintos, condições de iluminação e impressoras diferentes. É condição para afirmar robustez física, não resultado inferível dos testes sintéticos.
- **P2:** ensaio dedicado de teclado e leitores de tela, incluindo tablist do cabeçalho, foco/erros, captura manual e revisão. Os dois ajustes de labels não constituem auditoria WCAG completa.
- **P2:** comparar A4/lotes e tratamento de logos em outros navegadores/drivers. Não foi acrescentada configuração nova, autodetecção de modelos, QR ou leitura CDU/incorporada.

## 6. Publicação e segurança

Publicar somente o HEAD testado, após CI e prévia A4. Conferir Pages no commit integrado, conteúdo dos arquivos públicos e novo título na sessão autenticada. Os links e resultados efetivos constarão no PR e relatório final local.

Não há alterações em Diário, Workers, D1, notas, frequência, autenticação ou regras pedagógicas. Nenhum cadastro real foi acessado para gerar exemplos. Reversão por novo PR, sem migração. Manter manifestos históricos e códigos armazenados intactos.
