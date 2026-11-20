# Serviço de avaliações — candidato P0

Backend separado, desabilitado por padrão e **sem configuração de deploy, banco remoto, login de teste ou provisionamento público**. Esta implementação local não habilita o banco no Corretor publicado. O laboratório, seus cofres e seu contrato permanecem intactos.

Leia [diagnóstico](../docs/avaliacoes/DIAGNOSTICO_E_ARQUITETURA.md), [contrato do Executor](../docs/avaliacoes/CONTRATO_EXECUTOR.md) e [plano operacional](../docs/avaliacoes/MIGRACAO_TESTES_E_RISCOS.md).

Dependências de teste já fixadas no lockfile do laboratório:

```sh
npm ci --prefix assessments-lab --ignore-scripts --no-audit --no-fund
node --test assessments-service/tests/*.test.mjs
node --test assessments-service/tests/d1-auth.integration.mjs
```

O primeiro teste usa SQLite temporário e o leitor de sessão Auth original com armazenamento em memória. O segundo executa o mesmo Auth Worker, Durable Object e D1 no workerd real, somente em loopback e com sessões sintéticas criadas pelo binding privilegiado **do teste**. Nenhum bypass/identidade sintética é compilado no backend. Nenhuma credencial de teste substitui o login real na implantação.

Bindings futuros: `AUTH` privado para o emissor existente e `ASSESSMENTS_DB` para um D1 exclusivo aprovado. Variáveis de servidor: `ENABLE_ASSESSMENTS` precisa ser literalmente `true`; `PORTAL_ORIGIN` exata; `ASSESSMENT_ACTIVE_KEY_VERSION` inteiro positivo. `ASSESSMENT_KEYRING` deve ser um segredo JSON de versões para chaves aleatórias de 32 bytes em base64url, nunca arquivo versionado ou variável exposta ao cliente. Só a versão ativa é usada para novas revisões; versões anteriores são necessárias à leitura e aos recibos de reenvio antigos.

O schema não contém contas reais, grants ou valores de chave. Os IDs sintéticos aparecem exclusivamente no diretório de testes. A migração aditiva deve ser experimentada primeiro em D1 local; **não executar remotamente sem autorização**. Não há script npm que publique ou migre este serviço.
