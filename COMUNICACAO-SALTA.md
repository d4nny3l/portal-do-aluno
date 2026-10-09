# Avisos da SALTA

A comunicação é unilateral: somente o professor publica avisos. Não há chat, caixa de entrada de alunos nem respostas.

## Funcionalidades

- Avisos globais e individuais, direcionados pelo código do aluno.
- Histórico dos avisos mais recentes na Área do Professor e na prévia independente do aluno.
- Contador de avisos não lidos e registro persistente da leitura por aluno.
- As tabelas `salta_comms_messages` e `salta_comms_announcement_reads` são criadas no D1 `portal-aluno-2026` pela primeira requisição de comunicação ao Worker.

`index.html` continua sendo a página oficial de consulta de notas. A Área do Aluno com avisos está em `preview-aluno.html`.

## Rotas

### Aluno

- `GET /comms/student?codigo=...`: retorna os avisos globais e os direcionados ao código informado, incluindo o estado de leitura.
- `POST /comms/student/read`: registra a leitura dos IDs aplicáveis ao código informado. Repetir a operação não duplica registros.

### Professor (sessão autenticada)

- `GET /comms/teacher/announcements`: lista o histórico recente.
- `POST /comms/teacher/announcement`: publica aviso global ou individual.

As rotas do aluno identificam a ficha pelo código escolar, assim como a consulta existente de notas. Esse código funciona como identificador no fluxo atual; não é uma sessão autenticada do aluno. O Worker valida que o código existe e limita a leitura registrada aos avisos globais ou individuais destinados a ele.

## Implantação

O Worker está em `stats-worker/worker.js`, com o D1 e o serviço de autenticação declarados em `stats-worker/wrangler.toml`. O workflow `.github/workflows/deploy-salta-stats.yml` implanta o Worker ao receber alterações em `stats-worker/**` na branch `main` ou por execução manual.

Para habilitar o deploy automático, configure estes *repository secrets* em **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: token restrito às permissões necessárias para implantar Workers na conta correta.
- `CLOUDFLARE_ACCOUNT_ID`: ID dessa conta Cloudflare.

Depois, execute **Actions → Deploy SALTA Stats Worker → Run workflow** e confirme que a execução terminou com sucesso. Não coloque credenciais no código, em commits ou em mensagens. Salvar alterações no GitHub sem esses secrets não comprova a implantação do Worker.

O workflow deste repositório cobre o Worker. A publicação das páginas estáticas depende da configuração de GitHub Pages do repositório; este checkout não contém workflow de deploy de Pages.
