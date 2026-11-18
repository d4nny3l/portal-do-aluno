# Avaliações integradas — diagnóstico e arquitetura P0

Data: 18/11/2026. Estado: candidato local; nenhuma liberação produtiva.

## Base e limites da inspeção

Base local disponível: `f355d52187f1e797ddd912290af8a8581d744a6b` (merge do PR #45). A consulta da main remota falhou por rede tanto no Git/CLI quanto no conector GitHub nesta execução. Confirmar a base atual antes de publicar/revisar o PR; não considerar esta base como confirmação da produção atual.

Foram lidos AGENTS.md, diretrizes de produto, Auth, proxy de autenticação Stats, frontend professor/Corretor, domínio/repositório/criptografia do banco e seus contratos de homologação. Nenhum banco, sessão real, segredo ou dado acadêmico foi consultado. Os documentos históricos descrevem a homologação; não comprovam o estado remoto de hoje.

## Diagnóstico demonstrado pelo código

1. `auth-worker/worker.js`: um único par de credenciais docentes configurado no servidor; sessão opaca aleatória de 256 bits em Durable Object, prazo de quatro horas, revogação no logout. GET /session retorna `authenticated` e `user`, sem subject imutável, papéis ou vínculos institucionais. O login existente não é um diretório multiusuário.
2. `stats-worker/worker.js:proxyAuth`: o navegador autentica por `/auth/*` no host Stats, que encaminha ao binding AUTH. O cookie HttpOnly `__Host-salta_session`, Secure, SameSite=None e Partitioned fica nesse host. Um novo Worker com outro hostname não recebe esse cookie automaticamente. CORS não transfere cookies entre hosts. Nunca copiar o cookie para JavaScript ou usar localStorage como prova de identidade.
3. `authenticated()` retorna somente booleano. Isso não autoriza acesso à biblioteca de qualquer professor. O serviço novo consulta o Auth pelo binding e resolve `user` para um principal permanente explicitamente aprovado no seu próprio banco. Nome vindo de corpo/header não confere direitos.
4. Banco existente: `assessments-lab/worker.mjs`, domínio e repositório já fornecem revisões, CAS, reenvio idempotente, grants e envelopes AES-GCM/HKDF. O modo local tem fixtures estritamente locais. O modo protegido usa Access e cofre por frase: identidade diferente da sessão SALTA. Nenhum desses modos vira login produtivo nesta missão.
5. O bundle v1 atribui peso uniforme global e máximo único. Não comporta, por si só, valores diferentes por bloco. A extensão é um contrato de definição novo, sem mudar leitor, renderizador, manifesto ou cálculo de notas existente. O Executor precisará consumir o novo plano de pontuação explicitamente.

## Decisão de arquitetura

Reutilizar Auth e cookie existentes. Propor uma rota `/assessments/v1/*` no host Stats, encaminhada por service binding para um Worker exclusivo e sem URL pública. O backend revalida a sessão diretamente pelo binding AUTH em toda operação. O gateway não injeta docente, papel ou grants. Só encaminha Cookie e Origin, método, caminho, corpo e cabeçalhos de contrato necessários. Não encaminhar headers de identidade arbitrários.

**Nesta branch não alterar Stats, Auth, bindings oficiais, Pages ou ambiente remoto.** A implantação do gateway e a homologação do cookie em Safari dependem de autorização específica. Preparar um handler testável não demonstra uma sessão produtiva integrada. O serviço permanece desligado por padrão.

Para a conta docente única, a resolução explícita `issuer=salta-auth + auth_user → principal_id` é viável sem alterar Auth. O ID opaco é atribuído administrativamente, nunca derivado de um parâmetro do navegador. Renomear/reutilizar o nome de login exige atualizar o vínculo explicitamente; não autoassociar uma conta nova a dados antigos. Para múltiplos docentes, subject estável e papéis/vínculos no emissor são bloqueio crítico: apresentar evolução aditiva do Auth à Diretoria antes de implementá-la. Uma conta compartilhada não separa pessoas.

Biblioteca privada por proprietário. Cada avaliação tem instituição/turma/período autorizados no servidor. D1 exclusivo do domínio, sem DB/DIARIO_DB. Grants têm ativação, época e validade; são conferidos na entrada e novamente no batch de escrita. Revogação impede novas operações; não apaga conteúdo já obtido pelo usuário.

## Criptografia e recuperação sem frase

Modelo proposto: criptografia gerenciada pelo servidor, HTTPS no transporte, AES-256-GCM e HKDF-SHA256 reutilizados do Crypto Core experimental. Chaves aleatórias de 256 bits, versionadas, fornecidas exclusivamente como segredo do Worker. AAD vincula instituição, proprietário, avaliação, revisão e versão da chave. Gabarito, título, blocos, opções e manifesto ficam no payload cifrado; índices mínimos permanecem em claro no D1.

Não usar senha do login, cookie, nome do docente, email ou hash público como chave. Nenhuma chave de armazenamento vai ao navegador. O professor recebe os dados autorizados pelo HTTPS após login SALTA normal, em qualquer dispositivo. Não há enrollment de dispositivo nem frase extra no fluxo novo.

**Não é E2EE nem zero knowledge**: o runtime, os operadores com acesso a código/segredos e um servidor comprometido podem decifrar o conteúdo. XSS na sessão docente também pode ler gabaritos entregues. O reaproveitamento do Crypto Core não equivale a auditoria criptográfica independente.

Recuperação operacional exige backup cifrado do D1 **e** custódia separada das versões de chave. Perder todas as cópias da chave torna dados irrecuperáveis. Rotação: cadastrar nova versão, usá-la só em novas revisões e conservar antigas para leitura histórica. Não editar ciphertext das revisões imutáveis. Recriptografia/rewrap por envelope adicional é trabalho posterior sujeito a plano próprio; remover chave antiga não é rollback seguro. Comprometimento requer revogação de sessão/principal, troca de chave e avaliação do impacto; não desfaz vazamento prévio.

## Compatibilidade e migração

O laboratório permanece intacto. Esquema novo aditivo e isolado, sem reutilizar seu D1 ou modificar ciphertext/vaults. V1/V2 geométricos são importados exatamente pelo importador existente; nenhum manifesto histórico é regenerado. Dados do laboratório não são convertidos automaticamente: sua chave/frase continua necessária para abrir a origem. Importação opcional futura exige desbloqueio legítimo do cofre antigo pelo proprietário, conferência e vinculação da identidade e reenvio autenticado para nova revisão com proveniência; nunca inventar chave substituta. Nenhum dado real deve entrar nessa migração antes de revisão específica.

## Bloqueios de ativação

- Confirmar main/PR por rede e revisar o commit exato.
- Aprovar modelo de custódia de chaves gerenciado pelo servidor e responsável por backup/restauração.
- Provisionar principal real e grants por instituição/turma/período aprovados. O nome Colégio Olavo Bilac e turmas 1A/1B conhecidos de outra missão não constituem IDs institucionais aprovados para este domínio.
- Autorizar separadamente gateway no host autenticado e novo Worker privado/D1 exclusivo; nenhuma implantação automática nesta branch.
- Homologar cookie/sessão real no Safari e segundo dispositivo, logout/expiração, negação anônima, restauração e revogação.
- Executor integrar valores de blocos e seleção fixa de revisão; não usar o cálculo uniforme legado como se fosse ponderado por bloco.
- Mudanças no emissor Auth para múltiplos docentes requerem nova proposta/autorização, sem credenciais compartilhadas artificiais.

Referências técnicas consultadas: [service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), [batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/) e [escopo dos cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie). São capacidades da plataforma, não evidência de implantação SALTA.
