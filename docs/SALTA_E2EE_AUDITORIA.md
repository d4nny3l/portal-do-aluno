# SALTA — auditoria E2EE e arquitetura Zero-Knowledge

**Data:** 8 de novembro de 2026  
**Escopo:** inspeção estática do repositório e proposta arquitetural. Nenhuma integração de criptografia foi feita na aplicação ou em produção.

## A. Resumo executivo

O arquivo `salta-e2ee-prototype.js` e módulos E2EE relacionados não existem no checkout, em nenhuma branch remota consultada ou no histórico Git acessível. Portanto, não há implementação criptográfica ponta a ponta para aprovar, reprovar por defeito de algoritmo ou testar. O veredito é **inconclusivo; SALTA não está pronta para receber dados reais sob promessa E2EE**.

A aplicação atual é cliente-servidor: páginas HTML enviam dados ao `stats-worker`, que autentica e consulta/grava dados no D1. As tabelas observadas armazenam nomes, notas, frequência, comunicados e registros de avaliação em campos legíveis pelo serviço. Hashes de autenticação ou PIN não criptografam esses registros. E2EE mudaria consultas, relatórios, recuperação e suporte; não pode ser adicionada como uma camada isolada.

Foi proposta uma arquitetura sem chaves mestras do operador, com dados cifrados no navegador, chaves por escopo, envelopes por destinatário e autorização de tenant independente da criptografia. A proposta precisa de decisões de produto e validação externa antes de implementação.

## B. Estado do protótipo criptográfico

Buscas no checkout limpo e nas branches remotas disponíveis não localizaram `salta-e2ee-prototype.js`, nomes de arquivos com `e2ee`, `crypto` ou `crypt`, nem caminhos correspondentes no histórico completo acessível. O arquivo também não está no `main` consultado (`a2f1c331559790ddd9c1c948303eb0afee0ea739`). Não reconstruí nem presumi o conteúdo ausente.

O Worker utiliza primitivas `crypto` para usos distintos de E2EE, incluindo UUID aleatório, `getRandomValues`, digest SHA-256 e derivação PBKDF2 para PINs. Esses usos não criptografam dados acadêmicos de modo que o servidor não possa lê-los.

## C. Achados, gravidade e evidências

| Gravidade | Achado | Evidência e impacto |
|---|---|---|
| **Crítico para a alegação Zero-Knowledge** | Não há E2EE implementada ou auditável. | Protótipo ausente; o Worker executa consultas de notas, relatórios, frequência e avisos e recebe seus payloads. Não se deve anunciar confidencialidade contra o operador. |
| **Alto** | Dados educacionais são persistidos em campos comuns do D1. | `stats-worker/worker.js`: `salta_diario_students.name`, `salta_diario_records.score`, registros de frequência; tabelas `salta_comms_messages` e `salta_comms_announcement_reads`; submissões do Festival guardam nomes, respostas, pontuação e observações. O binding `DB` aponta para `portal-aluno-2026`. |
| **Alto** | Busca, cálculo e relatórios dependem de texto claro no Worker. | Rotas `/diario/notas`, `/diario/relatorios`, `/comms/student`, estatísticas e APIs de avaliação consultam os campos acadêmicos diretamente. Busca e relatórios terão de ser locais ou revelar informação por índices auxiliares. |
| **Alto** | O JavaScript servido ao navegador permanece parte da base de confiança. | Uma versão maliciosa do frontend pode capturar chaves após desbloqueio. E2EE web não protege contra servidor/CDN/repositório comprometido que entregue código alterado. |
| **Médio** | Identificadores e metadados revelam relações e rotina. | IDs, tenant, turma, datas, tamanho do ciphertext, eventos de acesso e recibos de leitura podem mostrar participação e horários mesmo sem conteúdo. |
| **Médio** | A consulta atual do estudante não equivale a uma identidade criptográfica. | O fluxo usa código de aluno e o backend recebe esse código e o registro correspondente. Isso não fornece chave privada do estudante, gestão de dispositivos ou recuperação E2EE. |

Não há vulnerabilidade de algoritmo do protótipo para classificar porque o protótipo não foi encontrado. Os achados descrevem a arquitetura atual em relação ao objetivo Zero-Knowledge; não afirmam que houve invasão ou vazamento.

## D. Mecanismos recomendados

- **Dados:** AES-256-GCM via Web Crypto API, com DEK aleatória, nonce de 96 bits de CSPRNG, tag de 128 bits e validação estrita do formato. Nonce nunca repete sob a mesma chave; definir limites operacionais e rotação.
- **AAD:** autenticar versão do protocolo, tenant opaco, escopo, ID aleatório do objeto, versão da chave e tipo do objeto. O cliente valida o contexto esperado antes de aceitar plaintext. Alteração de AAD deve falhar na autenticação.
- **Envelope encryption:** DEK aleatória por escopo ou conjunto de objetos; cifrar DEK para cada chave pública autorizada. Separar chaves de conteúdo, identidade, recuperação e sessão.
- **Identidade e encapsulamento:** usar primitivas Web Crypto interoperáveis e protocolos revistos. ECDH P-256 mais HKDF-SHA-256 é a opção inicial mais compatível; avaliar HPKE padronizado com biblioteca mantida/fixada se a matriz de navegadores permitir. Não inventar protocolo ou formato de envelope.
- **Senha:** nunca usar senha diretamente como chave. Preferir Argon2id de implementação WebAssembly confiável, auditada, versionada e calibrada nos dispositivos. Web Crypto não oferece Argon2id nativamente. PBKDF2-HMAC-SHA-256 com salt único e custo alto é alternativa de interoperabilidade mais fraca contra ataque offline.
- **Aleatoriedade:** `crypto.getRandomValues`/`crypto.subtle.generateKey`; nunca `Math.random` para segredo, chave, salt ou nonce. Derivar subchaves por HKDF com contexto distinto.
- **Formato:** envelope versionado com algoritmo, versão de chave, nonce, ciphertext/tag e AAD canônico. Rejeitar algoritmo desconhecido, campos faltantes, tamanho excessivo ou versão incompatível; sem fallback permissivo.

## E. Modelo de ameaças e limites

**Protege contra:** leitura casual de snapshots, backups e consultas diretas ao conteúdo no D1; leitura pelo operador de infraestrutura, desde que as chaves não sejam enviadas/recuperáveis pelo servidor e o cliente legítimo permaneça íntegro.

**Não protege contra:** dispositivo desbloqueado comprometido, malware/extensões, captura de tela, exportação deliberada, senha roubada, professor autorizado que copie conteúdo, frontend adulterado servido durante o desbloqueio, metadados observáveis, falhas de autorização ou cópias plaintext exportadas. Revogar acesso não apaga conteúdo anteriormente copiado.

O servidor continua responsável por autenticação, autorização por tenant/escopo, limites, versionamento e disponibilidade. Cifra não substitui autorização.

## F. Chaves para professor individual

1. Gerar localmente uma chave de identidade assimétrica e um segredo aleatório de conta. A chave privada fica cifrada por chave derivada da senha; o servidor recebe chave pública e envelope cifrado.
2. Gerar DEKs independentes por ano/turma e, quando necessário, categoria. Cifrar cada objeto no navegador e envelopar a DEK para a chave pública do professor e dispositivos aprovados.
3. Vincular novo dispositivo por aprovação de dispositivo autorizado ou código de recuperação offline. Não enviar segredo mestre ao Worker.
4. A recuperação não é unilateral pela SALTA. Se professor perder senha, dispositivos e recuperação, dados tornam-se irrecuperáveis; avisar antes de ativar.

## G. Chaves para instituição multiusuário

- Cada instituição possui ID aleatório opaco e política de membros. Cada usuário tem identidade criptográfica própria. Cada turma/ano ou escopo recebe DEK versionada; uma chave única escolar não dá granularidade suficiente.
- Para adicionar professor, verificar identidade e papel, adicionar chave pública e gerar envelopes apenas dos escopos autorizados. O servidor guarda ACL e envelopes, mas não obtém plaintext.
- Acesso efetivo é a interseção de papel, vínculo institucional, escopo e chave envelopada. D1 rejeita toda leitura/escrita entre tenants, mesmo que o ciphertext seja válido.
- **Papéis sugeridos:** professor acessa turmas atribuídas; coordenador acessa escopos delegados; administrador gerencia membros, mas só lê conteúdo se receber envelope autorizado; operador SALTA não recebe chaves.
- Acesso de secretaria, direção, substituição e suporte deve ter escopo e prazo explícitos. Compartilhar apenas o necessário.

## H. Modelo D1 proposto (não aplicado)

Esboço conceitual; **não é migração pronta para produção**:

```sql
tenants(id TEXT PRIMARY KEY, status TEXT, created_at TEXT)
principals(id TEXT PRIMARY KEY, public_key BLOB, key_alg TEXT, key_version INTEGER, status TEXT)
memberships(tenant_id TEXT, principal_id TEXT, role TEXT, status TEXT, created_at TEXT,
  PRIMARY KEY (tenant_id, principal_id))
scopes(id TEXT PRIMARY KEY, tenant_id TEXT, scope_type TEXT, academic_year INTEGER,
  status TEXT, key_version INTEGER)
scope_grants(scope_id TEXT, principal_id TEXT, role TEXT, granted_by TEXT, revoked_at TEXT,
  PRIMARY KEY (scope_id, principal_id))
key_envelopes(scope_id TEXT, key_version INTEGER, recipient_id TEXT, envelope_version INTEGER,
  wrapped_dek BLOB, wrap_alg TEXT, created_at TEXT,
  PRIMARY KEY (scope_id, key_version, recipient_id))
encrypted_objects(id TEXT PRIMARY KEY, tenant_id TEXT, scope_id TEXT, object_type TEXT,
  protocol_version INTEGER, key_version INTEGER, nonce BLOB, ciphertext BLOB,
  aad_version INTEGER, created_at TEXT, updated_at TEXT)
security_events(id TEXT PRIMARY KEY, tenant_id TEXT, actor_id TEXT, scope_id TEXT,
  event_type TEXT, key_version INTEGER, occurred_at TEXT)
```

Possíveis campos visíveis: IDs aleatórios, tenant opaco, papel/ACL, versão do protocolo/chave, tipo genérico de objeto, timestamps necessários e tamanho do ciphertext. Devem ficar cifrados: nome de estudante, matrícula/código, turma identificável, disciplina se sensível, notas, vistos, frequência, avisos, avaliações, respostas, comentários, critérios particulares e relatórios. Até tipo, datas e tamanho podem revelar metadados; limitar retenção. Índices determinísticos para nome/nota vazam igualdade e padrões e não são padrão recomendado.

Toda rota valida tenant, associação, papel, escopo e versão antes de fornecer envelopes ou objetos. UUID difícil de adivinhar não é controle de acesso. Chaves privadas e plaintext nunca entram em logs, URL, analytics ou payloads do Worker.

## I. Recuperação, revogação e rotação

- **Senha esquecida:** código aleatório de uso único guardado offline ou trustees institucionais; SALTA não redefine a chave privada. Sem recuperação, os dados são irrecuperáveis.
- **Novo dispositivo/perda:** revogar sessão e dispositivo; aprovar novo dispositivo por dispositivo existente ou recuperação; proteger armazenamento local e bloquear por inatividade.
- **Saída de professor:** desativar associação e bloquear novos acessos imediatamente; rotacionar DEKs dos escopos compartilhados e criar envelopes apenas para os membros restantes. Recriptografar histórico se política exigir. O ex-membro pode manter cópias anteriores.
- **Chave comprometida:** invalidar versão, gerar DEK nova, reenvelopar e recriptografar conteúdo afetado. Rotação não recupera sigilo de plaintext já copiado.
- **Recuperação institucional:** avaliar aprovação 2-de-3 trustees, com biblioteca/protocolo revisto; trustees não entregam material à SALTA. Chave universal do desenvolvedor é proibida.
- Registrar versões e eventos sem nome de estudante, nota ou plaintext, conforme retenção e resposta a incidentes.

## J. Funcionalidades SALTA afetadas

| Módulo atual | Uso atual no servidor | Efeito e alternativa |
|---|---|---|
| Diário de Classe | Cadastro, avaliações, notas, vistos, presença, período e média no D1. | Cifrar nomes/notas/presença; calcular no cliente. Busca e relatório global precisam processar localmente os escopos autorizados. |
| Consulta do aluno | Código consulta notas e marca leitura de avisos. | Código não pode derivar chave com segurança. Exigir identidade/segredo do estudante, convite e recuperação; ficha calculada localmente. |
| Relatórios/estatísticas | Agregações de turma, bimestre, acesso e média no Worker. | Agregação sensível vai para o cliente; recibos de leitura também são metadados sensíveis. |
| Importação/exportação | Planilhas/relatórios no navegador e Worker. | Importar e validar localmente antes de cifrar; descriptografar localmente para exportar. Arquivos baixados permanecem plaintext no aparelho. |
| Avisos | Conteúdo, destinatários, status e leitura. | Cifrar conteúdo e destinatários; distribuir chaves por pessoa/grupo. Notificações não devem conter texto sensível. |
| Fechamento bimestral | Snapshots de notas por pessoa/período. | Snapshot cifrado no cliente com proveniência e retenção; sem cópia plaintext “para facilitar”. |
| Festival/Mostra/corretor | Critérios, avaliador/participante, respostas, pontuação e observações. | Cifrar identidade/respostas/resultados; corrigir localmente; avaliadores autorizados recebem envelopes e precisam resolver versões/conflitos. |
| Login/auditoria | Sessões, horários, acesso e tentativas. | Metadados continuam visíveis; minimizar e pseudonimizar. E2EE não oculta quem usa o serviço nem quando. |

O custo principal é trocar consultas SQL por sincronização de objetos cifrados e processamento no dispositivo. Turmas grandes elevam download, memória e demora; paginar por escopo sem ampliar metadados.

## K. Testes e cobertura

**Testes E2EE:** nenhum executado; inexiste código E2EE auditável. Não há resultados para os 15 cenários solicitados: chave correta/incorreta, adulteração de ciphertext/AAD, nonce, compartilhamento, importação/exportação, corrupção, payload sem plaintext/chave privada, isolamento, autorização, revogação, rotação e recuperação.

**Testes do Diário:** executados separadamente no trilho de estabilização: 11 testes sintéticos passaram em SQLite em memória, além de `node --check` e `git diff --check`. Isso não valida E2EE, navegador real ou staging.

**Navegador/Cloudflare E2EE:** não realizado. Nenhum ambiente E2EE foi criado e nenhuma migração foi aplicada.

Antes de implementar: vetores conhecidos e testes Web Crypto em navegador real/Node; adulteração de campos; dois tenants sintéticos; ACL/envelope no Worker local; interceptação de rede provando ausência de plaintext/chave privada; fluxo de dispositivos, rotação e recuperação; fuzz de formato; auditoria independente.

## L. Riscos residuais

1. JavaScript entregue pelo site pode ser alterado para exfiltrar chaves; risco estrutural central de E2EE web.
2. Perda de todas as chaves pode causar perda permanente de dados.
3. Membership, cadência de acesso, tamanho, datas e recibos ainda revelam metadados.
4. Autorização multi-tenant, recuperação e revogação são tão críticas quanto os algoritmos.
5. Extensões, malware, memória e exportações escapam do modelo de proteção do servidor.
6. WebAssembly/dependências aumentam a superfície de supply chain.
7. Não há estrutura de migração; coexistência entre dados antigos em claro e novos cifrados exige política explícita.

## M. Plano de implementação, aceite e rollback

1. **Decisões/threat model:** aprovar identidades, trustees, metadados, retenção e dispositivos. Aceite: mapa de acesso e cenários de perda aprovados.
2. **Protótipo isolado:** cliente local ou Worker separado, D1 novo sem bindings de produção, credenciais de teste e dados sintéticos. Aceite: testes criptográficos e ausência de plaintext em payloads passam nos navegadores suportados.
3. **Autorização multi-tenant:** dois tenants sintéticos, permissões, compartilhamento, revogação/rotação. Aceite: zero acesso/envelope cruzado.
4. **Fluxos do cliente:** importar/cifrar, consultar/calcular/exportar; medir celulares e turmas grandes. Aceite: paridade funcional e plaintext ausente da rede.
5. **Revisão externa e entrega web:** auditoria criptográfica, dependências fixadas, proteção/revisão de branch, artefato verificável, mitigação XSS. Aceite: nenhum achado crítico/alto em aberto.
6. **Piloto opt-in:** backup cifrado verificado, aviso e retorno testado. Não apagar origem até verificar contagens e descriptografia do cliente. Dados reais apenas após autorização específica.
7. **Expansão:** habilitar por tenant, telemetria sem plaintext. Rollback retorna frontend/Worker compatíveis; ciphertext só é revertido com chaves do cliente, nunca com chave do operador.

Não converter ciphertext para plaintext automaticamente no rollback nem depender de segredo SALTA. Testar restauração do backup cifrado e leitura por versões anteriores antes de migração real.

## N. Decisões arquiteturais pendentes

- Identidade-base: professor, estudante, instituição, turma ou combinação?
- Como a escola verifica identidade e elegibilidade de avaliadores/alunos?
- Como estudantes menores recuperam acesso sem e-mail pessoal?
- Quem são trustees, quantos aprovam recuperação e qual tolerância a perda permanente?
- Coordenadores leem conteúdo ou administram ACLs apenas?
- Quais metadados e retenção são aceitáveis?
- Navegadores/dispositivos mínimos e funcionamento offline?
- Como importar dados atuais em claro? Opt-in e período de coexistência?
- Qual orçamento de desempenho, armazenamento e suporte?
- Qual biblioteca/protocolo de envelopes terá revisão independente?

## O. Arquivos, branch e estado

- Relatório criado: `docs/SALTA_E2EE_AUDITORIA.md`.
- Branch experimental: `codex/salta-e2ee-auditoria`, criada a partir do `main` observado.
- Base: `a2f1c331559790ddd9c1c948303eb0afee0ea739`.
- Nenhum código de produção, banco, secret ou configuração Cloudflare foi alterado neste trilho.
- Hash do commit do relatório será informado na entrega final. Não haverá merge ou deploy E2EE.

## P. Veredito

**INCONCLUSIVO — protótipo não disponível e E2EE não implementada.** Não há evidência para aprovar criptografia atual. O produto atual não é Zero-Knowledge e não deve ser apresentado como tal. AES-GCM sozinho não torna uma aplicação E2EE: distribuição de chaves, identidade, autorização, recuperação, revogação, entrega segura do frontend e funcionalidades precisam ser avaliadas em conjunto.

### Em linguagem direta

- **Já protegido:** alguns fluxos usam sessão e hash de PIN/códigos; isso não oculta notas, frequência, avisos ou respostas do Worker/D1.
- **Risco em relação ao objetivo:** operador com acesso ao Worker/D1 pode processar dados em texto claro; não há chaves E2EE dos clientes.
- **Falta:** protótipo verificável, gestão individual/institucional de chaves, identidade, recuperação, rotação/revogação, processamento local, testes e revisão externa.
- **Impacto aos usuários:** relatórios, busca, notas, frequência, avisos e importação/exportação terão processamento local ou compartilhamento de chaves autorizado.
- **Acesso do desenvolvedor:** no modelo proposto, pode manter serviço, ACLs e metadados mínimos, mas não deter chaves nem recuperar conteúdo unilateralmente. O código atual não dá essa garantia.
- **Prontidão:** SALTA ainda não está pronta para receber dados reais sob promessa E2EE. Nenhuma integração ou migração foi iniciada.

## Apêndice — isolamento de homologação

O `stats-worker/wrangler.toml` atual liga `DB` a `portal-aluno-2026` e `DIARIO_DB` a `salta-diario-teste`; não há isolamento total, porque o mesmo Worker mantém binding para produção. Não reutilizar esse Worker para staging E2EE.

Homologação futura deve ter Worker e nome próprios, configuração sem `DB`/`AUTH` de produção, D1 novo, credenciais de teste e dados artificiais. Antes do primeiro deploy, validar todos os bindings e URLs; aplicar apenas migrações revisadas no D1 isolado. Nesta etapa nenhum recurso remoto foi criado ou alterado.
