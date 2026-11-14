# CODEX — SALTA V2 | REFORMULAÇÃO DEFINITIVA DO CARTÃO-RESPOSTA E PUBLICAÇÃO

**Repositório:** `d4nny3l/portal-do-aluno`
**PR de referência:** #31
**Objetivo:** implementar integralmente o novo cartão-resposta SALTA V2, validar seu funcionamento e publicar a versão aprovada tecnicamente no GitHub Pages.

## 1. INSTRUÇÃO PRINCIPAL

Esta tarefa é de **implementação e publicação**, não de planejamento.

Continue a partir do trabalho existente no PR #31, preservando as funcionalidades atuais. Leia `AGENTS.md`, as especificações do cartão-resposta, os relatórios técnicos da V1 e os documentos de diretrizes do produto.

Não descarte código funcional nem recomece o projeto desnecessariamente.

O usuário aprovou as decisões visuais abaixo. Elas devem orientar a implementação definitiva.

## 2. IDENTIDADE VISUAL E MOLDURAS

O cartão deve ter aparência de documento escolar oficial: elegante, limpo, institucional, organizado e impresso em preto sobre branco.

Regras:

- A borda externa da página deve permanecer retangular, com cantos retos.
- Todas as molduras visuais internas devem ter cantos arredondados com raio inicial de **1 mm**.
- Cabeçalho, campo de nome, blocos de questões e módulo do código devem compartilhar a mesma linguagem visual.
- Divisórias internas devem ser linhas retas, finas e consistentes.
- Manter alinhamentos, margens e espaçamentos regulares.
- Os quatro marcadores ópticos devem permanecer quadrados.
- Não criar efeitos decorativos desnecessários.

## 3. CABEÇALHO INSTITUCIONAL — MODELO APROVADO

Redesenhar o cabeçalho como uma **moldura institucional única, arredondada e subdividida internamente**.

### Primeira região — Identificação institucional

Na aba **Título**, permitir um único campo de texto multilinha para a identificação institucional.

Exemplo:

SECRETARIA DE ESTADO DA EDUCAÇÃO
COLÉGIO ESTADUAL OLAVO BILAC

Requisitos:

- Texto livre, editável e opcional.
- Preservar as quebras de linha inseridas pelo professor.
- Centralizar cada linha.
- Não exigir campos separados para secretaria, escola ou mantenedora.
- Permitir logotipo institucional opcional.
- Manter o texto centralizado mesmo com um ou dois logotipos.
- Quando não houver identificação, eliminar o espaço correspondente.
- Inserir uma linha divisória horizontal abaixo da identificação, quando presente.
- Evitar sobreposição e oferecer tratamento claro para textos que excedam a área disponível.

### Segunda região — Título da avaliação

Título principal, centralizado e em destaque:

**CARTÃO DE RESPOSTAS**

Abaixo, exibir o subtítulo configurável da avaliação e/ou componente curricular, por exemplo:

BLOCO DE AVALIAÇÃO · MATEMÁTICA

Não repetir desnecessariamente informações que já apareçam em outros campos.

### Terceira região — Dados administrativos

Organizar **PROFESSOR, TURMA e DATA em uma única linha**, com três células.

Proporção inicial:

- Professor: 40%.
- Turma: 38%.
- Data: 22%.

Essas proporções podem ser ajustadas tecnicamente para garantir boa legibilidade, mas os três campos devem permanecer na mesma faixa.

A data impressa deve utilizar `DD/MM/AAAA`.

Não truncar nomes silenciosamente. Implementar quebra de linha controlada quando possível e mensagens claras quando o conteúdo não couber.

**O código óptico do estudante não pertence ao cabeçalho e não pode ocupar sua área.**

## 4. IDENTIFICAÇÃO DO ESTUDANTE

Criar uma região independente, com moldura arredondada e apresentação simples.

Modelo visual:

**NOME:** _______________________________________

Essa região deve adaptar-se automaticamente à modalidade de geração:

1. **Manual:** linha para o estudante escrever o nome.
2. **Nominal:** imprimir o nome do estudante diretamente no campo.
3. **Com código óptico:** permitir o campo de nome e a grade de sete dígitos.
4. **Sem identificação:** remover inteiramente os elementos de identificação e seus espaços reservados.

O campo NOME deve continuar simples, sem o título redundante “IDENTIFICAÇÃO DO ESTUDANTE”.

Não repetir a turma nessa região se ela já estiver identificada no cabeçalho, salvo necessidade funcional explícita.

## 5. GRADE ÓPTICA DE SETE DÍGITOS

A grade de identificação por bolhas deve ser **opcional e totalmente independente do cabeçalho**.

Para cartões curtos, priorizar uma moldura própria centralizada abaixo dos blocos de respostas.

Para cartões maiores, calcular um posicionamento adequado com base no espaço disponível, mantendo sequência de leitura e geometria óptica válida.

Regras:

- Sete colunas e dígitos de 0 a 9.
- Não deformar as bolhas.
- Não sobrepor questões, molduras, títulos ou marcadores.
- Não reservar espaço vazio quando o código estiver desabilitado.
- Não misturar o código com os dados institucionais.
- Não reduzir bolhas abaixo de um tamanho seguro apenas para encaixar mais conteúdo.
- Se a composição não couber em A4, informar claramente ao professor.

**Atenção:** a mudança de localização da grade exige atualizar as coordenadas no manifesto e o comportamento correspondente do leitor.

Criar uma versão de layout identificável e preservar a possibilidade de usar corretamente cartões anteriores com seus respectivos modelos. Não presumir que o leitor consiga reconhecer automaticamente versões históricas se essa função não existir.

## 6. BOLHAS E LETRAS

Substituir o estilo atual das letras contornadas artificialmente por letras convencionais.

Novo padrão:

- Letras A, B, C, D, E e demais alternativas em fonte comum.
- Cor preta.
- Sem contorno artificial, sombra, relevo ou efeitos SVG.
- Centralização precisa.
- Espessura e tamanho consistentes.

**Requisito crítico:** verificar que as letras pretas dentro das bolhas vazias não sejam interpretadas pelo leitor como respostas preenchidas.

Executar testes de densidade óptica, falsos positivos e leitura de marcações reais ou sintéticas. Se a tipografia convencional aumentar os falsos positivos, ajustar o desenho ou o processamento mediante testes, sem simplesmente ignorar o risco.

## 7. BLOCOS DE RESPOSTAS — FLUXO INTELIGENTE

Implementar uma composição dinâmica de seções.

**Padrão aprovado: larguras uniformes, com alturas independentes.**

Requisitos:

- Colunas com larguras padronizadas.
- Blocos iniciando em referências de alinhamento consistentes.
- Cada seção dentro de uma moldura arredondada independente.
- Título centralizado em cada moldura.
- Quando uma seção continuar em outra coluna, repetir seu título e identificação visual, sem duplicar questões.
- Cada moldura termina onde o conteúdo termina; não esticar artificialmente um bloco curto.
- Utilizar os espaços verticais livres para inserir outros blocos.
- Preservar a sequência de leitura e a numeração das questões.
- Priorizar ordem natural antes de otimização de espaço.
- Nunca misturar questões de tipos diferentes de modo confuso.
- Manter espaçamentos uniformes entre molduras.

**Larguras adaptáveis não são o padrão.** Só podem ser consideradas como otimização quando houver justificativa concreta, legibilidade preservada e validação óptica.

A composição deve funcionar para avaliações com blocos de tamanhos diferentes e tipos distintos: A–D, A–E, certo/errado, CDU e outras modalidades já existentes.

Não declarar correção óptica de CDU homologada caso o leitor ainda não a implemente.

## 8. INSTRUÇÕES OPCIONAIS

Permitir que o professor habilite ou desabilite as instruções de preenchimento.

- Desabilitadas por padrão.
- Quando habilitadas, utilizar uma região discreta e bem integrada ao documento.
- Quando desabilitadas, remover inteiramente o espaço correspondente.
- Não inserir instruções obrigatórias desnecessárias dentro do cabeçalho.

## 9. PRESERVAÇÃO DAS FUNCIONALIDADES

Manter:

- Impressão em A4.
- Exportação vetorial e rasterizada.
- Geração individual e em lote.
- Identificação manual, nominal e óptica.
- Diferentes tipos e quantidades de questões.
- Numeração correta.
- Quatro marcadores ópticos.
- Leitura e correção OMR.
- Identificadores, versões e hashes necessários.
- Compatibilidade funcional com cartões anteriores quando seu modelo for corretamente selecionado.
- Interface limpa e enxuta do Corretor.

Não fazer alterações desnecessárias no Diário, no portal dos estudantes, nos bancos D1, na autenticação ou nos Workers da SALTA.

## 10. TESTES OBRIGATÓRIOS

Executar testes automatizados e gerar evidências visuais para, no mínimo:

- A–D, A–E e certo/errado com 10, 20, 50, 100 e 150 questões, respeitando a capacidade física de cada composição.
- Avaliações mistas com quantidades desiguais.
- Código de sete dígitos ativado e desativado.
- Identificação manual, nominal e ausente.
- Cabeçalho sem logotipo, com um e com dois logotipos.
- Identificação institucional vazia, com uma linha e com várias linhas.
- Instruções ativadas e desativadas.
- Nomes de escola, professor e turma extensos.
- Blocos ocupando espaços livres de diferentes alturas.
- Leitura de cartões vazios, preenchidos, com resposta dupla e com marcação fraca.
- Testes de alinhamento, sobreposição, margens e limites da folha.
- Impressão Chrome com uma página A4, sem página extra.
- PNG, JPG, SVG e documentos impressos.
- Regressão do OMR contra a versão anterior.

Gerar exemplos sintéticos de 20, 50 e 100 questões e pelo menos uma avaliação mista. Comparar visualmente antes e depois.

Não utilizar dados reais de alunos nos artefatos de teste.

Registrar explicitamente testes não realizados, especialmente os que dependem de impressora e fotografias físicas.

## 11. PUBLICAÇÃO — AUTORIZADA

**O usuário autoriza expressamente a publicação desta versão.**

Depois de implementar e concluir os testes:

1. Atualizar o PR #31 ou utilizar um PR sucessor claramente vinculado.
2. Executar todos os testes e a CI.
3. Corrigir falhas e regressões identificadas.
4. Confirmar que os modelos gerados não apresentam sobreposições ou perda de funcionalidade nas verificações disponíveis.
5. Se os critérios automatizados e a revisão visual forem satisfeitos, realizar o merge na `main`.
6. Publicar a versão no **GitHub Pages**, utilizando o fluxo de publicação existente no repositório.
7. Conferir a URL pública e validar que os arquivos atualizados estão efetivamente carregando.
8. Executar uma verificação básica de funcionamento da versão publicada.
9. Informar o commit final, o PR, a execução da CI e o endereço público.

**Não interromper a execução apenas para solicitar uma nova autorização de merge ou deploy. Ela já foi concedida.**

Se houver falha crítica, regressão óptica não resolvida ou impedimento técnico sério, não publicar uma versão defeituosa. Explicar objetivamente o bloqueio.

A publicação não equivale à homologação física do leitor: os testes com cartões impressos e fotografias reais continuarão pendentes até serem executados.

Não alterar nem publicar Workers ou bancos de dados sem necessidade técnica justificada.

## 12. ENTREGA FINAL

Entregar:

- Novo cartão-resposta SALTA V2 funcionando.
- Exemplos reais gerados pelo sistema em PDF e PNG.
- Comparação visual da V1 com a V2.
- Relatório dos testes e limitações.
- Evidências de validação óptica.
- PR e commits.
- Resultado da CI.
- URL pública da versão atualizada.

**Prioridade máxima:** implementar um cartão visualmente excelente, corretamente alinhado, flexível para diferentes avaliações e confiável na leitura óptica.

Não quero apenas outro relatório ou protótipo. Quero a **SALTA V2 implementada, testada e publicada**.
