# Biblioteca de quadros incorporados — candidata #118

Base: `81dfa2a6c404213403cdc7d98a0873b58e789f4c`. Serviço mínimo reutilizado do #90, `72695b469d7e9b3140371a196ce235918b3df307`; não incorpora #74 nem código/configuração produtiva do Stats. Este PR não publica, não configura recursos, não faz migração e não acessa credenciais. Requer auditoria independente do HEAD final e autorização posterior de publicação.

## Contrato

- `salta-assessment-definition-v2` permanece. A4 V1/V2 continua aceito. `embedded` só é aceito com manifesto V2 e questões A–D/A–E/C–E; CDU e modelos com dados individuais continuam recusados.
- Sessão privada autenticada: campo opcional `embeddedLibraryVersion: "salta-embedded-library-v1"`. É uma capacidade do serviço, independente de `scoreFormatVersion`; não muda identidade, login ou grants. Clientes antigos ignoram o campo. Ausência/valor desconhecido mantém A4, desabilita o botão Salvar no editor incorporado e impede a preparação/envio do PUT.
- Ao abrir um incorporado, `cardMode`, largura e altura vêm exclusivamente de `manifest.mode` e `manifest.paper`. Não se reutilizam dimensões de outra avaliação. O editor e o modelo precisam concordar antes do salvamento.
- O snapshot é transportado integralmente, sem nova composição para adaptar o histórico. `saveAndVerify` conserva recibo + GET da revisão e igualdade integral dos dados. A serialização cifrada existente canonicaliza a ordem das chaves JSON; valores, dimensões, coordenadas e `contentHash` permanecem iguais.
- Identidade da correção: avaliação + revisão privada + manifesto/hash exatos. Revisão privada e revisão óptica são distintas. Mudar só gabarito/valores cria revisão privada sem necessariamente mudar o hash geométrico. Duplicação conserva a definição original e cria ID independente/revisão privada 1 em rascunho.
- Não há nova tabela, coluna ou formato criptográfico. `migrations/0001_private_library.sql` é a cópia histórica byte a byte do #90, exclusivamente necessária aos testes locais; não é uma migração nova nem deve ser aplicada remotamente nesta entrega.

## Escopo e build

Mudanças funcionais: guarda/restauração/capability na biblioteca, allowlist no adaptador, allowlist na definição do serviço e capability na sessão privada. No HTML, somente o aviso falso de leitura incorporada foi removido; câmera, scanner, avisos de resolução e restrição CDU não mudam.

A main ainda não tinha `assessments-service`. O diretório mínimo e os testes do #90 são reutilizados neste único PR; runtime alterado apenas em `definition.mjs` e na resposta de `/session`. Os 14 módulos compartilhados são byte a byte os da base publicada, incluindo os módulos OMR do #117. Criptografia e SQL são conferidos contra #90. Os 17 inputs e o bundle são fixados em `dependencies.json`; `integrity.mjs` recusa arquivos fora da lista, configuração de deploy, mudanças de Auth/Stats/OMR/crypto/CSS e qualquer outra mudança no HTML.

O guard histórico da biblioteca recusava todo backend e fixava uma main de 20/11. Ele foi substituído pelo guard exato desta composição autorizada, sem exceção genérica de pasta. O único pin funcional atualizado no teste do piloto é o adaptador; os pins ópticos, cliente e controller permanecem.

```sh
npm ci --prefix assessments-lab --ignore-scripts --no-audit --no-fund
node assessments-service/integrity.mjs
node --test assessments-service/tests/build.test.mjs
node assessments-service/test-composition.mjs
node assessments-service/build.mjs
```

O runner testa a árvore candidata atual, sem substituí-la pelo frontend histórico. Inclui testes existentes de OMR/câmera/Stats/Diário, serviço, Auth/D1/limitação/gateway em workerd local, reinício/persistência e HTTP legado. A fixture do gateway é compilada de fonte histórica selada e confere o hash; não vira input do backend. Nenhum fixture é publicado.

Navegador isolado: instalar Playwright `1.65.1` e seu Chromium, definir `SALTA_PLAYWRIGHT_MODULE` para `playwright/index.mjs` e executar `node assessments-service/tests/embedded-browser.mjs`. `SALTA_CHROME` pode apontar para um Chrome já instalado. Rotas de rede são interceptadas antes de sair do navegador; fonte candidata, Auth e SQLite sintéticos executam localmente. A CI realiza a mesma passagem e guarda screenshots em `dist/`, não no Git.

Matriz nova: A–D 100×160, A–E 120×180 e C–E 180×240; identidades sem identificação/manual/sete dígitos. Recibo/GET, replay, abertura após outro tamanho, impressão física/SVG sem gabarito, duplicação, edição imutável, seleção e nota exata. Também: versões A4 históricas header-0/header-1/V1, perda de resposta após commit, concorrência 409, 401/403/404, expiração, turma alheia, CDU/V1 incorporado/geometria inválida e hash de vinculação trocado. O gateway real local testa salvar/selecionar/imprimir um incorporado e recuperá-lo após reinício.

## Publicação futura — não executar nesta missão

1. Reconfirmar HEAD auditado, CI, bundle, seis bindings, isolamento, versões e estado remoto; não presumir que flags estejam falsas. Obter autorização específica.
2. Reservar no Worker privado existente uma versão do bundle candidato **compatível e fechada**, `ENABLE_ASSESSMENTS=false`, sem deployment e sem URL pública. Herdar D1/Auth/origem/versão de chave/keyring por referência à versão verificada; não ler nem recriar segredos. Conferir hash e configuração resolvidos. Registrar seu ID como **reversão mínima**.
3. Fazer a troca controlada do backend, mantendo uma versão fechada compatível disponível. Habilitar o mesmo bundle conforme autorização e comprovar, pela origem/sessão oficial, a nova capability, anonimato recusado, origem restrita e backend sem acesso público direto. Stats e seus bindings/rotas/limitadores não precisam mudar.
4. Somente depois integrar/publicar o frontend autorizado. Sem capability real, não anunciar salvamento incorporado. Homologar salvar/reabrir/duplicar/selecionar/imprimir/corrigir com avaliações sintéticas e dois contextos autorizados, sem tocar avaliações existentes. Comparar manifesto e revisão após GET.

### Reversão e recuperação

**Após o primeiro incorporado gravado, proibir a seleção de qualquer bundle cujo leitor não aceite esse contrato**, inclusive o backend antigo de hash `e094439c…`. Ele pode devolver 503 até no catálogo ao validar uma revisão incorporada. Em falha, selecionar exclusivamente o ID **fechado compatível** registrado no passo 2; preservar D1, revisões, recibos, seleções e keyring. Nunca apagar/regravar documentos para caber no leitor antigo. Reverter só o frontend quando necessário e manter o leitor compatível fechado. Antes de reabrir, conferir hash do bundle compatível e recuperar a revisão sintética por GET. Não há botão/script de deploy ou rollback remoto neste PR; a operação futura deve impor esse piso e registrar os IDs.

Histórico/cifra mantêm a recuperação por revisão/chave existente; esta alteração não certifica backups nem altera a custódia. O aceite residual de recuperação registrado na #85 permanece. Riscos residuais: dispositivos físicos/Safari precisam de homologação, capacidade/limites do corpo continuam os existentes, e o operador precisa respeitar a ordem backend → capability → frontend. Falha de sessão, conflito ou resposta ambígua nunca deve ser apresentada como “Salvo”.
