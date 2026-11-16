# D-04 — diagnóstico e proposta de contrato para aprovação

Data: 16/11/2026. Base main `3c9a8286150d5430a7447bdfa25a874edf7fcaf2`, confirmada pelo conector GitHub. Blob do Worker: `3cb6e181d000f86a664edeefe9fad3aae0df51fe`.

## Estado

Documento da proposta submetida antes da implementação. Em resposta à pergunta sobre confirmação/lote completo, versões, tabela local de recibos e mapa institucional confiável, o proprietário autorizou: “eu autorizo a publicacao no main meu chapa”. A proposta foi implementada e testada localmente; a integração à main está autorizada. Isso não autoriza migração remota nem publicação do Worker oficial. O resultado e os limites atuais estão em [SALTA_DIARIO_D04_IMPLEMENTACAO.md](SALTA_DIARIO_D04_IMPLEMENTACAO.md). As seções de proposta abaixo preservam o raciocínio da decisão; não descrevem implantação produtiva concluída.

## Causa-raiz

1. `POST /diario/frequencia/ocorrencias` insere a sessão com `.run()` e, depois, outro lote insere todos os estudantes ativos com `present=1`. A operação inteira não é uma única transação.
2. A primeira marcação em `toggleAttendance` chama `ensureOccurrence`, recarrega e retorna antes de aplicar a falta escolhida. Uma escolha individual causa 30 presenças no cenário sintético.
3. `POST /diario/frequencia` (rota diária legada) repete a semeadura de presenças. Corrigir só a interface deixaria as duas rotas vulneráveis.
4. PUT aceita atualizações sem versão/snapshot prévio. Duas janelas podem sobrescrever escolhas sem detectar conflito. As sessões de aula têm chave única por turno/dia/aula/data, sem turma/período nessa restrição; o lookup precisa validar o contexto completo antes de retornar/reutilizar uma sessão.
5. Não há instituição ou proprietário em `salta_diario_classes`. O gate atual do Stats Worker valida apenas `authenticated:true`; o Auth Worker é de conta docente única e retorna `user`. Não se pode prometer isolamento multi-institucional por um campo enviado pelo navegador.
6. `ensureDiarioSchema` inicializa tabelas e defaults antes das rotas do Diário. Uma consulta autenticada à API não é um meio seguro de inspeção remota sem efeitos colaterais. A verificação de produção usará somente o painel/control plane de implantação, nunca os endpoints acadêmicos ou o D1 Studio.

Reprodução: turma sintética de 30, intenção de faltas4/12/27, POST sem lista confirmada: HTTP201 e30P/0F. Evidência local em `outputs/diario-d04/BASELINE.json` (pasta externa ao worktree).

## Proposta mínima de segurança

Manter URLs, tabelas acadêmicas e dados anteriores. Rascunho somente na memória, sem POST ao abrir/alternar/cancelar. Nova lista começa em P sugerido e todos os cliques só alteram rascunho. Chamada existente é copiada exatamente, sem preencher ausências de registro como presença.

Uma única ação **Confirmar chamada** envia o lote completo e explícito:

```json
{
  "confirm": true,
  "request_id": "UUID novo por confirmação, mantido nos retries",
  "institution_id": "contexto confirmado pelo servidor, não autoridade do cliente",
  "class_id": 1,
  "period": 4,
  "shift_id": 1,
  "weekday": 1,
  "lesson_number": 1,
  "attendance_date": "2026-11-09",
  "expected_version": 0,
  "expected_snapshot": "hash do estado lido, inclusive chamada histórica",
  "registros": [{"student_id":1,"present":true}]
}
```

`registros` deve conter cada estudante esperado exatamente uma vez, com booleano estrito; o exemplo é abreviado e não é um lote aceito para30 estudantes. Validar contexto, turma, bimestre/datas, horário, sessão e pertencimento de todos os IDs. O servidor decide a instituição por vínculo confiável, nunca aceita header/body como concessão de acesso.

### Parte incompatível — aprovada pelo proprietário

- POST/PUT sem confirmação/lote completo/precondição deixam de escrever e retornam erro explícito (`428`, atualizar/revisar). Clientes antigos passam a falhar de forma segura; manter sua escrita automática contraria o critério D-04.
- Edição exige a versão e o snapshot que o professor revisou; conflito retorna409 e não reenvia automaticamente por cima da chamada atual.
- Interface nova deve detectar suporte ao contrato e falhar sem escrita contra Worker antigo. Publicação futura coordenada do Worker e frontend, sem tráfego dividido entre implementações de escrita antiga e nova.

### Persistência e migração proposta

A opção de menor alteração de esquema é comparação por snapshot e chave natural da ocorrência. Ela impede duplicação imediata, mas **não** oferece recibo durável de um request id após edições posteriores ou resposta perdida seguida de outra edição. Não será apresentada como idempotência durável.

Para atender a idempotência e concorrência fortes, propõe-se **uma tabela aditiva de confirmações/recibos**, sem ALTER, DELETE ou reescrita das quatro tabelas acadêmicas existentes. Chave única de request por instituição e de versão por contexto de ocorrência; hash do payload, versão anterior, sessão e recibo. Sessão+lote+versão+recibo no mesmo `D1Database.batch`, que é transacional. Erro ou conflito desfaz o lote inteiro. Mesmo request/payload retorna recibo original; request reaproveitado com payload diferente retorna409. Não executar inicialização/migração ao abrir rascunho.

A tabela aditiva é compatível com os dados existentes, mas sua necessidade deve ser aprovada junto ao contrato. Chamada histórica começa na versão0 com snapshot exato, sem reinicialização dos registros; primeira edição explícita adota o controle de versão atomicamente. SQL/fixtures seriam aplicados somente ao D1 local isolado nesta missão.

### Isolamento institucional

Não inventar vínculo ausente no banco ou inferi-lo da rede DF/GO, nome da turma ou campo do cliente. Proposta sem alteração da autenticação: mapa de contexto institucional mantido no servidor por turma, validado para a conta docente única existente; a ausência/ambiguidade do mapa bloqueia a nova gravação. Na homologação usar apenas dois contextos sintéticos. Esse mapa não adiciona login, conta, credencial, concessão remota ou criptografia.

Se a implantação real exigir múltiplos docentes/instituições com autorização por vínculo persistido, isso requer desenho separado de autorização e eventual esquema — interromper essa parte, pois a missão proíbe alterar autenticação. Não declarar essa abrangência homologada com um simples mapa de IDs.

## Plano de testes submetido na proposta

D1/workerd local com namespace e arquivo isolados:30 estudantes/3F; abrir/cancelar/abandonar sem writes; lote exato; replay com resposta perdida; mesmo request alterado; dupla confirmação simultânea; rollback entre sessão e registros; erro de rede/DB; edição histórica preservada; edição obsoleta recusada; isolamento de instituições/turmas/aulas/períodos; troca de contexto durante awaits e resposta antiga descartada. Suite atual do Diário e regressões completas. Nenhum estudante ou dado remoto será usado.

## Rollback e homologação

Sem deploy de Worker ou migração remota autorizado. Para homologação futura: aplicar tabela aditiva no ambiente isolado, conferir bindings e mapa de instituição, passar casos e CI no SHA exato; somente o proprietário autoriza publicação. Rollback não pode reativar o POST antigo que semeia presenças: manter escrita bloqueada até o cliente/Worker correto voltar. Manter tabela de recibos e dados confirmados; não apagar histórico nem reconstituir presenças. D-01/02/03/05, notas, fórmulas e autenticação ficam fora do escopo.

Referência de atomicidade: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
