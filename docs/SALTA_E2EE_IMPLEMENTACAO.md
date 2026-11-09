# SALTA — implementação experimental do Crypto Core

**Data da verificação:** 8 de novembro de 2026
**Branch:** `codex/salta-e2ee-implementacao` (derivada da branch de auditoria)
**Escopo:** biblioteca reutilizável, adaptador de armazenamento, Worker/D1 exclusivamente locais e demonstração sintética. Nenhum módulo oficial, binding de produção, dado escolar real ou secret foi modificado.

## A. Resumo executivo

Há uma primeira implementação funcional, isolada e reutilizável do SALTA Crypto Core. O navegador cifra um registro sintético de diário com AES-256-GCM; um Worker local recebe somente ciphertext/metadados e envelopes HPKE; uma segunda identidade autorizada recupera a chave e calcula a média no navegador. Testes automatizados em Node/SQLite em memória e o fluxo integrado em navegador real passaram.

**Estado: experimental funcional localmente.** Isso não é E2EE de produção, não foi revisado independentemente e não deve receber dados reais. A homologação Cloudflare remota ainda não existe: a migração aplicada foi somente ao D1 local do Wrangler. Branch/PR são registrados nesta seção após publicação.

## B. Arquitetura criptográfica implementada

- **Conteúdo:** AES-256-GCM Web Crypto, tag de 128 bits, nonce aleatório de 96 bits e salt HKDF-SHA-256 aleatório de 256 bits em cada operação. HKDF deriva uma subchave por objeto/revisão/contexto.
- **Contexto autenticado:** AAD canônico vincula versão do protocolo, tenant, escopo, objeto, tipo, versão da chave e revisão. Contexto ou ciphertext adulterado falha fechado.
- **Envelope:** HPKE conforme RFC 9180, usando `@hpke/core` fixado em `1.9.0`, DHKEM P-256/HKDF-SHA-256 e AES-256-GCM. Operações `seal/open` são de uma única operação, sem reutilizar contexto HPKE.
- **Chaves:** chaves de identidade P-256 distintas das chaves de escopo HKDF e das chaves derivadas por registro. Chave privada é reimportada como não exportável; o pacote IndexedDB guarda o par necessário ao HPKE, com a privada não exportável.
- **Recuperação:** a API gera um código aleatório de 256 bits, fora do Worker, para cifrar uma cópia de recuperação da chave privada. A API e os testes existem, mas a demonstração visual ainda não oferece uma tela segura para exibir/guardar esse código. Não há chave mestra do servidor. Perder código e dispositivo causa perda dos dados.
- **Formato:** protocolo v1, allowlist de tipos, serialização JSON canônica restrita a valores JSON simples, limites de tamanho e rejeição de versões/algoritmos desconhecidos.

`@hpke/core` está em versão corrigida para o advisory de reutilização concorrente de nonce que afetou versões até 1.7.4. A escolha e a restrição one-shot estão anotadas por causa do risco histórico; isso não substitui auditoria da dependência. Fontes: [advisory do projeto](https://github.com/dajiaji/hpke-js/security/advisories/GHSA-73g8-5h73-26h4), [pacote @hpke/core](https://www.npmjs.com/package/@hpke/core), [RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html).

### D. Hierarquia e recuperação de chaves

```text
Identidade P-256 do usuário (privada não exportável)
  └─ HPKE recebe uma chave de escopo HKDF aleatória
       └─ HKDF por objeto + AAD do objeto
            └─ chave AES-256-GCM do registro

Código offline aleatório → AES-GCM → cópia cifrada da privada para recuperação
```

O servidor armazena chave pública, envelope HPKE, grants e ciphertext. O segredo de recuperação não é enviado. Não existe derivação da chave de identidade a partir da senha de login. O protótipo ainda não define aprovação de dispositivo, trustees nem recuperação institucional.

## C. Arquivos criados ou alterados

- `security/crypto/`: formato, validação, criptografia/descriptografia, geração e gestão, envelopes, compartilhamento, recuperação, rotação e API pública.
- `security/access/permissions.js`: validação fail-closed de contexto local de tenant/escopo/permissão.
- `security/storage/`: repositório cifrado e armazenamento local IndexedDB de CryptoKeys; a interface não coloca plaintext em requests.
- `crypto-lab/`: Worker isolado, interface demo, migrações D1 `up/down`, Wrangler local e testes sintéticos.
- `package.json` e locks: workspaces/dependências com versões fixadas; `.gitignore`: estado de D1 local.
- `.github/workflows/test-salta-e2ee.yml`: CI de testes/build sem etapa de deploy.
- `docs/SALTA_E2EE_IMPLEMENTACAO.md`: este relatório.
- `docs/SALTA_E2EE_AUDITORIA.md`: relatório anterior, preservado sem alterações.

## E. Modelo multi-institucional

D1 experimental separa `tenants`, `principals`, `memberships`, `cryptographic_scopes`, `scope_grants`, `key_envelopes`, `encrypted_objects` e `security_events`. As operações de objeto checam, em conjunto, vínculo ativo, escopo pertencente ao tenant e grant ativo para a ação. Gravar/envelopar exige `can_write`/`can_share`; ler exige `can_read`. A revogação remove grant e envelope e exige rotação para acesso futuro.

O `X-SALTA-Lab-Principal` só simula a identidade em localhost e o Worker recusa qualquer host diferente de localhost/127.0.0.1/::1. **Não é autenticação de produção**; ao integrar deverá ser substituído por identidade de sessão verificada no Worker, com membership derivada da sessão em vez de valores aceitos do cliente. O Core não presume que um tenant_id seja autorização.

## F. Estrutura D1 experimental

Migração local versionada em `crypto-lab/migrations/0001_e2ee_schema.sql`; reversão estrutural correspondente em `migrations/down/0001_e2ee_schema.sql`. Ela define chaves estrangeiras, constraints para protocolo/algoritmos, índices de ACL/escopo e eventos sem dados escolares. Os tipos genéricos de objeto, IDs, tenant, escopo, versões, timestamps, ACL e tamanho aproximado continuam visíveis. Tipo e cadência ainda permitem inferência.

Aplicada apenas ao banco Wrangler local, identificado como `salta-e2ee-local-only`, com ID dummy. Não foi executada em Cloudflare nem nos bancos `portal-aluno-2026` ou `salta-diario-teste`.

## G. Contratos do SALTA Crypto Core

API pública em `security/crypto/index.js`: criar/restaurar identidade, criar escopo, verificar chave de escopo, serializar/fingerprinting chave pública, cifrar/abrir JSON, compartilhar, rotacionar e operar `EncryptedRepository`. O repositório valida contexto e grants no cliente, cifra antes da requisição, exige chave para plaintext, usa `credentials: include`, `cache: no-store`, pagina ciphertext e aplica revisão otimista. O Worker repete autorização e valida envelope/algoritmo/tamanho.

Os grants do cliente são conveniência para interface; apenas o Worker é autoridade de autorização. O Worker local não serve para deploy público e não possui integração real ao Auth Worker.

## H. Diário experimental

A página em `crypto-lab/public/` cria dois professores sintéticos de uma instituição temporária. O professor 1 cria escopo e envelopes, grava avaliações/frequência fictícias cifradas, e o professor 2 obtém seu envelope, abre o registro e calcula a média no browser. O banco local só recebe fixture sintética, chaves públicas, envelopes, ciphertext e metadados. Não há dependência do Diário oficial nem de seus bindings.

Validado no navegador in-app em `http://127.0.0.1:8788/`: estado exibiu fluxo concluído, 1 objeto ciphertext, média 8,00 calculada no browser e abertura do envelope HPKE. Console sem erros após corrigir o binding de `fetch` do adaptador. Essa evidência é somente para o navegador e dados sintéticos observados.

## I. Matriz dos módulos SALTA

O contrato futuro é objetos cifrados por escopo (instituição/ano/turma, com grants por membro); pesquisa, agregação e relatório são calculados localmente nos escopos abertos. Não foram migrados módulos legados.

| Módulo | Dados/modelo atual e sensibilidade | Escopo e permissões futuras | Migração/consultas em claro, compatibilidade e teste exigido | Estado |
|---|---|---|---|---|
| Diário eletrônico | Turmas, períodos e atividades; sensibilidade institucional. | tenant/ano/turma; docente lê/escreve conforme grant. | Substituir APIs de escrita/leitura por repository; migrar com coexistência opt-in. Testar CRUD, conflitos e offline. | Protótipo cifrado local testado. |
| Cadastro de alunos | Nome, identificadores e vínculo; alto. | tenant/ano/turma/aluno. | Worker não pode pesquisar nome; roster local e IDs opacos. Testar isolamento e minimização. | Projetado. |
| Cadastro de turmas | Nome, escola, segmento, horário; institucional. | tenant/ano/turma. | Eliminar consultas plaintext; importar localmente. Testar mudanças de membership/ano. | Projetado. |
| Avaliações | Título, data, valor e critérios; acadêmico. | tenant/ano/turma. | Metadata pode vazar tipo/data; cifrar corpo e manter catálogo versionado. Testar tipos permitidos. | Projetado. |
| Notas | Scores e recuperação; alto. | turma/aluno/bimestre. | Cálculo exclusivamente local; nenhuma soma SQL em claro. Testar regras DF/GO/EJA e AAD. | Demo sintética parcial. |
| Frequência | Presenças, faltas, datas/aulas; alto. | turma/aluno/data. | Worker não agrega frequência; sincronização ciphertext. Testar datas passadas, conflitos e ACL. | Demo sintética parcial. |
| Calendário acadêmico | Bimestres, datas e eventos; sensibilidade média/institucional. | tenant/ano/calendário. | Separar calendário público e conteúdo restrito por allowlist explícita. Testar datas e acesso. | Contrato de tipo, sem módulo. |
| Relatório individual | Notas, evolução, presença; alto. | escopo de aluno e grants de professor/responsável. | Gerar localmente após abrir chave. Testar ausência de plaintext em rede/export. | Projetado. |
| Relatório por turma | Agregações e roster; alto. | turma/ano. | Agregar localmente; limitar memória/paginação. Testar turma grande e remoção de grant. | Projetado. |
| Estatísticas | Métricas agregadas; podem reidentificar. | tenant/turma, cálculo local. | Não enviar estatística derivada sem política. Testar reidentificação/metadados. | Projetado. |
| Fechamento de bimestre | Snapshot imutável de notas/atividades; alto. | turma/ano/bimestre. | Criar snapshot cifrado com revisão/proveniência. Testar integridade e restauração. | Projetado. |
| Importação/exportação | Planilhas com dados acadêmicos; alto. | contexto selecionado pelo usuário. | Parse e validação no browser; exportações são plaintext no dispositivo. Testar arquivos malformados e confirmar destino local. | Projetado. |
| Consulta do estudante | Registro acadêmico e credencial atual; alto. | identidade de aluno vinculada a grants mínimos. | Código previsível não é chave/credencial; requer identidade e recuperação adequadas a menores. | Projetado/bloqueado por decisão de identidade. |
| Avisos e mensagens | Conteúdo, destinatários, leituras; alto e metadados. | tenant/turma/aluno; professor publica, destinatário lê. | Cifrar mensagem/destinatários; notificações sem conteúdo. Testar leitura individual e revogação. | Tipo seguro declarado, módulo não integrado. |
| Corretor | Gabarito, respostas e resultados; alto. | avaliação/turma/avaliador. | Processamento local; armazenamento cifrado. Testar imagem/PDF e autoria. | Projetado. |
| Festival/Mostra Cultural | Participante, notas, respostas, comentários; alto. | tenant/evento/turma/avaliador. | Cifrar submissões e resultados; pesquisa local. Testar isolamento do avaliador. | Tipo seguro declarado, módulo não integrado. |
| Administração institucional | Membros, papéis e configurações; sensibilidade de acesso. | tenant e escopos; gestão de ACL separada de acesso a plaintext. | Worker mantém ACL minimizada; leitura de conteúdo requer envelope. Testar revogação e chave pública autenticada. | Esquema/ACL experimentais parciais. |
| Módulos futuros | Classificar payload antes de integrar. | Escopo explícito e menor privilégio. | Proibir endpoint plaintext; contrato, teste de payload e revisão de segurança obrigatórios. | Política definida, sem módulos. |

## J. Recuperação, rotação e revogação

O bundle de recuperação experimental protege a chave privada com código aleatório offline. Rotação descriptografa registros permitidos, gera chave de escopo nova, cifra os registros novamente e incrementa versão/revisão. O Worker revoga grant e apaga envelope, mas o endpoint de revogação não executa recriptografia atômica; ele sinaliza `requires_key_rotation`. Cópias já abertas/copiadas não podem ser removidas. Fluxo de segundo dispositivo/trustees, recuperação institucional e revogação de device são **não implementados**.

## K. Testes executados e resultados

Comandos executados:

- `npm run test:e2ee` — **12/12 testes passaram**. Incluem cifra, chave errada, ciphertext/AAD alterados, nonce/salt distintos, JSON inválido, endpoint inseguro, envelope HPKE, fingerprint incompatível, recovery, rotação, leitura em segundo professor, autorização/tenant e revogação/conflito de revisão.
- [GitHub Actions — execução da PR #4](https://github.com/d4nny3l/portal-do-aluno/actions/runs/42526033676) — **success** para o head publicado `3538ae09`; workflow executou migração local, testes e build. O CI não faz deploy.
- `npm run build:e2ee` — **passou**, bundle browser de 78,7 kB.
- `npm --workspace crypto-lab exec -- wrangler --version` — Wrangler `4.158.0`.
- `npm --workspace crypto-lab run migrate:local` — uma migração, 13 comandos, executada no D1 local Wrangler.
- `npm --workspace crypto-lab run dev:local` e teste de navegador real — **passou**: criação de fixture, gravação, envelope, abertura HPKE e média no browser. Console do navegador não foi coletado; Wrangler registrou apenas rotas/status e nenhum payload.

Não foram realizados teste em browser adicional (Firefox/Safari), auditoria externa, fuzzing, ensaio em staging Cloudflare ou desempenho de turma grande.

## L. Riscos e pendências

1. JavaScript malicioso entregue pela origem confiável pode ler dados depois de descriptografados ou usar chaves desbloqueadas. CSP, Trusted Types e chave não exportável reduzem classes de falha, não eliminam esse risco.
2. Não há autenticação real no Worker experimental; o principal em header só é aceito em loopback. Não fazer deploy desse worker.
3. Sem auditoria independente, verificação formal, testes cross-browser ou modelagem completa de XSS/supply chain.
4. Metadados visíveis permitem inferir relação, tipo aproximado, tamanho e horário.
5. Revogar não apaga dados previamente copiados; rotação precisa ser executada e verificada pelo cliente.
6. Recuperação depende exclusivamente de código do usuário no experimento; perda do código e dispositivos é perda irreversível.
7. Grants no cliente não são fonte de autoridade; requer Auth Worker e checagem server-side integrados.
8. O esquema e fluxo ainda não incluem device enrollment, logout/expiração e auditoria com retenção formal.

## M. Segurança do navegador

O demo empacota dependência fixa, porém ainda é JavaScript web servido pela mesma origem. Não foram configurados CSP, Trusted Types nem SRI no experimento. XSS, extensão maliciosa, frontend/CDN/repositório comprometido, captura de tela, memória do processo e plaintext exportado permanecem fora da proteção criptográfica. Não declarar “Zero-Knowledge” ou segurança para produção com esta implementação.

## N. Homologação Cloudflare

**Não criada.** A etapa local demonstrou o Worker com `E2EE_DB` local e ativo `SALTA_E2EE_LAB=local-only`, sem `DB`, `AUTH`, `portal-aluno-2026` ou `salta-diario-teste`. O binding usa D1 local Wrangler. Um Worker/D1 remoto próprio pode gerar custo e precisa de autorização explícita antes da criação. Nunca reaproveitar bindings de produção.

## O. Git, branch e Pull Request

- Base: commit de auditoria `fbdddabbeb9cdd22edd2f153bb14938756421bd0`, da branch `codex/salta-e2ee-auditoria`, que deriva da main `f4dce82716faa06720068f3228a6f890fd0f928f` observada no início desta etapa.
- Branch de implementação: `codex/salta-e2ee-implementacao`.
- Branch publicada: [`codex/salta-e2ee-implementacao`](https://github.com/d4nny3l/portal-do-aluno/tree/codex/salta-e2ee-implementacao).
- Commit de implementação publicado: [`5929de8856d6bdf4d8f00971b4030451779f0fdd`](https://github.com/d4nny3l/portal-do-aluno/commit/5929de8856d6bdf4d8f00971b4030451779f0fdd).
- PR aberto em modo draft para `main`, sem merge: [#4 — SALTA Crypto Core](https://github.com/d4nny3l/portal-do-aluno/pull/4). O commit de auditoria `fbdddabbeb9cdd22edd2f153bb14938756421bd0` está na ancestralidade desta branch.
- A branch de auditoria e `main` não foram alteradas.

## P. Próximas etapas para módulos existentes

1. Aprovar threat model, identidade e recuperação para professores, escola, alunos menores e responsáveis.
2. Integrar login/session verificável e associação autenticada da chave pública; remover qualquer identidade de teste.
3. Definir dados públicos/metadados, retenção e estratégia de pesquisa/agregação local.
4. Fazer piloto de módulo com dados integralmente sintéticos num Worker/D1 remotos isolados, depois de autorização de criação.
5. Executar browsers suportados, segurança independente, XSS/CSP/SRI e testes de carga.
6. Planejar migração opt-in por tenant, backup e rollback; manter legado intacto até validação explícita.

## Q. Critérios ainda não atendidos para produção

Autenticação e recuperação produtivas; binding/chaves verificadas; identidade de usuário/chave resistente a substituição; device enrollment; política institucional aprovada; deploy controlado de scripts; CSP/Trusted Types e mitigação XSS; rotação/revogação atômicas e verificadas; operação de backup/restore; testes cross-browser e carga; auditoria criptográfica independente; plano de suporte/perda de chaves; revisão LGPD e retenção; validação remota de sandbox. Nenhum dado real deve ser colocado antes disso.

## R. Estado e matriz de conclusão

| Critério | Estado comprovado |
|---|---|
| Crypto Core compartilhado | Implementado; testado localmente. |
| Multi-tenant experimental | Implementado no Worker/D1 local; teste negativo de tenant passou. |
| Diário E2EE sintético | Implementado e testado em Node e navegador local. |
| Contratos para 18 módulos | Projetados/documentados; somente Diário tem fluxo implementado. |
| D1 experimental | Migração aplicada localmente; reversão escrita, não executada. |
| CI | Workflow executado no GitHub Actions; execução da PR #4 concluiu com sucesso, sem deploy. |
| Navegadores | Navegador in-app validado; Firefox/Safari não testados. |
| Homologação Cloudflare | Não publicada; requer novo Worker/D1 e autorização. |
| Produção | Não publicada, não autorizada e inadequada. |
| Veredito | **Experimental funcional localmente; parcial fora do laboratório.** |

| Fase | Estado |
|---|---|
| Apenas projetado | Contratos de migração dos 17 módulos além do Diário. |
| Implementado | Crypto Core, repositório, ACL experimental, esquema e demo sintética. |
| Testado localmente | 12 testes Node/SQLite e migração Wrangler local. |
| Validado no navegador | Fluxo sintético no navegador in-app; outros navegadores pendentes. |
| Publicado em homologação | Não publicado. |
| Aprovado para produção | Não aprovado; exige segurança, identidade e recuperação reais, revisão independente e autorização. |

## Reversão

Não há reversão necessária para produção, pois nada foi aplicado lá. Para limpar apenas o ambiente local de teste, pare Wrangler e remova `crypto-lab/.wrangler/` (conteúdo descartável e ignorado pelo Git); não executar o SQL `down` em banco remoto. A migração down é estrutural e destrói todas as tabelas do esquema experimental, portanto só pode ser usada em ambiente descartável isolado.
