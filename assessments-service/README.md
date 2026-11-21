# Serviço privado mínimo candidato

P1-85-B: somente três arquivos de serviço do contrato #86, helper puro compartilhado e treze dependências já existentes. Runtime byte a byte aprovado na origem; integração/build/CI desta candidata ainda exigem auditoria independente.

Matriz, comandos locais, flags efetivas e plano de integração/rollback em [P1_85_B_BACKEND.md](../docs/avaliacoes/P1_85_B_BACKEND.md).

O build em `dist/` não publica nada, não contém configuração de recursos e não lê credenciais. Testes usam somente fixtures sintéticas e bancos temporários em loopback. A migração 0001 acompanha a contraprova local, sem autorização de execução remota. As flags ativas de produção não são alteradas nem confundidas com o padrão fechado da candidata.
