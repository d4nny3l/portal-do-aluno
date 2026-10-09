# Comunicação da SALTA

Esta implementação adiciona avisos e mensagens entre a Área do Aluno e a Área do Professor, sem substituir a página oficial do aluno. A nova interface do estudante continua disponível no laboratório:

- Prévia do aluno: https://d4nny3l.github.io/portal-do-aluno/preview-aluno.html
- Central do professor: https://d4nny3l.github.io/portal-do-aluno/plataforma/mensagens.html

## O que está incluído

- Avisos globais para todas as turmas.
- Avisos direcionados a uma turma.
- Avisos individuais por código do aluno.
- Caixa de entrada de mensagens enviadas pelos alunos.
- Respostas privadas do professor.
- Histórico das conversas.
- Limite de cinco mensagens enviadas por aluno por hora.
- Limites de tamanho para assunto e corpo das mensagens.
- Rotas administrativas protegidas pela sessão existente da Área do Professor.

As tabelas de comunicação são criadas automaticamente no D1 já vinculado ao Worker `salta-stats`, na primeira requisição de comunicação após a implantação.

## Ativar a API no Cloudflare

O código-fonte do Worker fica em `stats-worker/worker.js`. Salvar esse arquivo no GitHub não implanta automaticamente o backend até que os segredos do deploy estejam configurados.

1. No painel da Cloudflare, crie um API Token com permissões restritas para implantar Workers na conta correta. Consulte a documentação oficial: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
2. Abra o repositório no GitHub e vá a **Settings → Secrets and variables → Actions**.
3. Crie estes *repository secrets*:
   - `CLOUDFLARE_API_TOKEN`: token da Cloudflare.
   - `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare onde está o Worker `salta-stats`.
4. Abra **Actions → Deploy SALTA Stats Worker → Run workflow** para implantar a versão atual.
5. Confira se a execução terminou com sucesso. Depois, teste a comunicação usando a prévia do aluno e a central do professor.

O workflow também publicará automaticamente futuras alterações em `stats-worker/**` após os segredos serem configurados.

**Segurança:** não coloque o token no código, em commits, no arquivo `wrangler.toml) ou em mensagens de conversa. Guarde-o somente nos segredos do GitHub. Os avisos e mensagens usam o banco D1 existente; nenhuma planilha ou dado escolar é copiado para um novo banco.

## Rotas de comunicação

### Estudantes
- `GET /comms/student?codigo=...`: avisos e conversa do aluno.
- `POST /comms/student/message`: enviar uma mensagem ao professor.
- `POST /comms/student/read`: marcar mensagens do professor como lidas.

### Professor (sessão autenticada)
- `GET /comms/teacher/announcements`: consultar avisos publicados.
- `POST /comms/teacher/announcement`: publicar aviso global, por turma ou individual.
- `GET /comms/teacher/inbox`: consultar mensagens de alunos.
- `GET /comms/teacher/thread?codigo=...`: abrir uma conversa.
- `POST /comms/teacher/reply`: responder ao aluno.
- `POST /comms/teacher/read`: marcar mensagens do aluno como lidas.
