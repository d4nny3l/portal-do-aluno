# Biblioteca privada — candidata #118

Fonte mínima reutilizada do #90 (`72695b469d7e9b3140371a196ce235918b3df307`), com duas alterações funcionais de backend: permitir quadros incorporados V2 objetivos e anunciar `embeddedLibraryVersion=salta-embedded-library-v1`. Os 14 módulos compartilhados são os já publicados na main `81dfa2a6`, sem edição. Criptografia e SQL histórico permanecem idênticos à origem.

Contrato, comandos locais, publicação em etapas e reversão compatível: [BIBLIOTECA_QUADROS_118.md](../docs/avaliacoes/BIBLIOTECA_QUADROS_118.md).

O build em `dist/` não publica nada, não contém configuração de recursos e não lê credenciais. Testes usam somente fixtures sintéticas e bancos temporários em loopback. A migração 0001 acompanha a contraprova local, sem autorização de execução remota. As flags ativas de produção não são alteradas nem confundidas com o padrão fechado da candidata.
