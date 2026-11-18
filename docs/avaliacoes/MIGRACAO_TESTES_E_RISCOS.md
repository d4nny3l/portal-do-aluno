# Implantação condicionada, testes e riscos — P0

## Estado desta entrega

Branch exclusiva `codex/salta-avaliacoes-arquitetura-20261118`, a partir da última main disponível localmente `f355d52187f1e797ddd912290af8a8581d744a6b`. Candidato backend em `assessments-service/`, documentação nesta pasta e workflow de testes sem deploy. Nenhuma alteração em Auth/Stats/Diário, lógica óptica, geometria, frontend publicado, laboratório, bindings oficiais ou bancos remotos.

A rede desta execução falhou por DNS/timeout no Git/CLI, GitHub conectado e ferramenta web. A interface de rede do Mac aparece conectada; isso não comprovou resolução/conexão aos serviços. Estado da main remota, PR e CI não puderam ser confirmados. Testes locais não devem ser rotulados como CI verde. Não fazer merge/deploy dessa branch sem revisão e autorização específica.

## Estrutura e reutilização

- `av_principals`: vínculo explícito do usuário verificado pelo Auth ao principal docente permanente, papel, ativação, época, validade.
- `av_grants`: instituição/turma/período autorizados por principal, ativação, época, validade.
- `av_assessments`: raiz privada e escopo imutável, ponteiro de revisão atual e arquivamento.
- `av_revisions`: snapshots cifrados append-only, status draft/issued e versão de chave, hash geométrico, criação.
- `av_selections`: vínculo imutável de sessão de correção com avaliação/revisão/hash.
- `av_requests`: recibos imutáveis e HMAC de operação por proprietário/requestId para reenvio.

O serviço reaproveita o importador e renderizador V1/V2 existentes e os envelopes AES-GCM/HKDF do Crypto Core. O desenho de CAS/batch/recibo e grants deriva do laboratório. Não modificar seus contratos para fingir login único; o serviço acrescenta uma fronteira explícita para sessão SALTA e custódia no servidor. O laboratório permanece recuperável com sua chave original. A nova estrutura é necessária para a identidade/escopo institucional, blocos e seleções, sem migração destrutiva da homologação.

## Testes executados e evidência

1. **162 testes completos aprovados:** Corretor V1/V2, plataforma, Stats/Diário, laboratório existente e nove testes do serviço novo. Incluem os testes geométricos/manifestos históricos já existentes; nenhum arquivo histórico foi regravado.
2. **Integração workerd/D1/Auth local:** teste adicional usando o Auth Worker e SessionStore originais por service binding, schema real no D1 isolado e sessões sintéticas. Exercita duas sessões independentes do mesmo usuário, recuperação sem frase, concorrência, reenvio, rollback completo com falha no último recibo, arquivo de impressão, seleção imutável, logout e reinício do runtime mantendo D1/sessões/chaves de servidor.
3. **Integração do laboratório existente:** HTTP real com Workerd/D1, ciphertext anterior, autorização, conflito, revisão histórica e rollback/reaplicação. Exige build allowlist local antes do ensaio.
4. Sintaxe de todos os módulos novos e `git diff --check`.

Evidências locais fora do repositório em `outputs/avaliacoes-arquitetura/`: `REGRESSAO_COMPLETA.log`, `SERVICO_AUTH_D1.log`, `LAB_D1_HTTP.log`, resumo e patch. Nomes de testes descrevem cenários sintéticos; não são homologação de conta, Safari, rede, operação ou criptografia em produção.

Negativos do serviço: cookie ausente/inválido/expirado; headers de identidade/bearer forjados; usuário não provisionado; Auth indisponível; principal/grant revogado, com época alterada ou expirado dentro do batch; instituição/turma/período não autorizados; acesso de outro proprietário; CSRF; contrato/gabarito/blocos inválidos; ciphertext e contexto adulterados; chave histórica indisponível; tentativa de editar/apagar revisão; atualização contra arquivamento; seleção após arquivamento ou de rascunho; nova revisão sem alterar a seleção anterior.

As sessões sintéticas são preparadas somente no teste por binding privilegiado do DO local. Não foi adicionado endpoint de fixture, nova senha, conta substituta, cookie artificial aceito por bypass ou chave no navegador. O servidor usa o mesmo protocolo de leitura de sessão do Auth existente; a emissão de login produtivo, Turnstile e cookie no navegador real continuam pendentes.

## Sequência de migração proposta — não executada

1. Diretoria aprovar a arquitetura de custódia, responsáveis, retenção e identidade da conta docente atual. Validar IDs institucionais/grants de forma independente; não reutilizar mapa incompleto do Diário.
2. Confirmar main atual, resolver diferenças somente nesta branch e revisar PR/CI no commit exato. Não mudar branches de outros agentes.
3. Autorizar criação de Worker privado e D1 **novo**, sem DB/DIARIO_DB ou cópia de dados reais. Sem workers.dev, previews, rotas públicas ou Access alternativo. Aprovar separadamente a rota gateway no host autenticado; preservar as demais rotas e contratos.
4. Criar/guardar chaves aleatórias fora do código e do frontend, como segredos versionados. Registrar custódia e cópia protegida independente do D1, com acesso administrativo mínimo. Confirmar possibilidade de restauração antes de criar dados úteis.
5. Aplicar somente a migração nova no D1 exclusivo após autorização. Não existe seed produtivo. Provisionar principal/grants aprovados no servidor. Testar primeiro com dados sintéticos e módulo fechado para demais identidades.
6. Homologar criação, fechamento/reabertura, segundo dispositivo, bloqueio de aluno/anônimo/docente alheio, logout/expiração, revogação, concorrência e restauração. Conferir Safari com o cookie particionado já usado e mesma origem de topo Pages; não reduzir flags de cookie para contornar problemas.
7. Executor criar adaptador do contrato novo e confirmar revisão fixa para toda sessão. Guardar `selectionId`, `assessmentId`, revisão e hash como origem de futuras propostas de correção; nunca consultar o gabarito mais recente para reinterpretar uma correção anterior. Tratar bloqueios/confirmação humana e fórmula de blocos antes de conectar resultados.
8. Abrir o módulo somente após evidências e autorização específica. Nenhuma nota, Diário ou algoritmo óptico muda como efeito dessa habilitação.

Não migrar automaticamente os cofres antigos. Eles foram cifrados com outra raiz/contexto e continuam exigindo desbloqueio legítimo da origem. Importação futura deve manter origem/ID/revisão/hash, preservar o ciphertext original e pedir conferência explícita ao proprietário; um novo serviço não recupera por mágica uma chave perdida. Se a Diretoria exigir E2EE, parar a implantação deste modelo e desenhar um protocolo distinto de recuperação/enrollment antes de alterações.

## Rollback e compatibilidade

Antes da ativação, rollback é retirar/reverter o PR sem efeito remoto. Depois de implantação autorizada, desligar `ENABLE_ASSESSMENTS`, retirar apenas a rota nova e preservar banco, revisões, recibos, seleções e todas as versões de chave. Não aplicar down destrutivo; não apontar o código novo ao D1 acadêmico ou ao laboratório. Cliente antigo continua no ambiente anterior, sem acesso implícito ao banco novo. Um frontend com falha não pode recriar raiz/chave para contornar dados inacessíveis.

Restaurar D1 e chaves juntos em ambiente isolado, conferir contagens, FKs, revisões e vínculos antes de promover uma restauração. RPO/RTO e janela/retenção de backup precisam de definição operacional; não há ensaio de restauração de produção nesta missão. Reinício sintético local demonstra persistência, não substitui teste de recuperação de desastre.

## Riscos residuais e recomendação

**P0 de ativação:** principal/grants reais ainda não aprovados; segredo e custódia não provisionados; gateway/cookie real e navegador não homologados; estado remoto/main/CI indisponível nesta execução. Mantê-lo desligado. **Recomendação: apto para revisão técnica e homologação local sintética, inapto para uso acadêmico real ou deploy neste estado.**

**P0 de expansão:** Auth tem uma única conta configurada, sem subject imutável multiusuário nem diretório de permissões. Não habilitar outros docentes sob a mesma conta. A proposta de evolução do emissor deve ser aprovada antes de implementá-la.

**P1:** custódia no servidor tem domínio de comprometimento amplo; avaliar serviço gerenciado de chaves, separação de funções, trilha administrativa sem payload, limites de requisição/volume, paginação da listagem histórica de revisões e ensaio de backup/rotação. Esses pontos não justificam remover criptografia ou autorização agora.

**P1 de integração:** a definição nova armazena valores de blocos, mas o Corretor atual ainda usa fórmula global uniforme. Exibição e cálculo do Executor precisam de homologação própria; o backend não publica notas. Alterar rascunho ou prova nunca reescreve revisão anterior.

**Limites do cartão:** nenhuma identificação óptica nova da avaliação/revisão. Hash geométrico igual não prova gabarito igual. Professor confere a seleção e o lote físico; ensaio impresso/câmera e revisão humana continuam necessários.

**Segurança:** não há E2EE; operador do servidor com acesso a segredos pode ler avaliações. Revogação não apaga cópias já obtidas. Auth/DO e D1 não compartilham transação distribuída; requisição já validada pode terminar após logout. Logs do handler não incluem payload, SQL, tokens ou erros brutos; configurar observabilidade e retenção de rede no ambiente antes da liberação.
