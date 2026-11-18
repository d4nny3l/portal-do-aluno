# Contrato para SALTA EXECUTOR — avaliações privadas v1

Estado: contrato do backend candidato, não API disponível na produção. Requer gates operacionais do diagnóstico. Nenhuma alteração óptica ou de nota acadêmica está incluída.

## Transporte, identidade e autorização

Frontend no Pages → `https://salta-stats.dannyel-moises.workers.dev/assessments/v1/*` (rota **proposta**) → service binding privado → backend → binding AUTH `/session` + D1 exclusivo.

O navegador usa `credentials: include`, `cache: no-store`, `redirect: error`; não lê nem envia manualmente tokens/cookies. Toda chamada exige Origin exata da configuração. O gateway futuro deve tratar preflight CORS e devolver ACAO exato, credentials true, Vary Origin e no-store; não usar `*`. Esta branch **não implementa o gateway**, não altera CORS/autenticação oficiais nem suas configurações. `OPTIONS` não chega ao domínio antes de passar pelo gateway.

Backend aceita somente a identidade retornada pelo binding AUTH, depois resolve `issuer=salta-auth, auth_user` para `av_principals.id`. Papel teacher, enabled, prazo e época são controlados no banco. Não aceitar `teacherId`, `ownerId`, role, instituição ou grants como prova de autorização. Cookies legados só são aceitos na medida em que o Auth já os reconhece. Nenhum bearer/fixture/Access abre um caminho alternativo neste serviço.

Toda operação exige principal ativo. Para cada objeto verificar proprietário **e** grant exato instituição/turma/período. Bibliotecas de proprietários alheios retornam 404; escopo não concedido, 403. Um usuário autenticado sem cadastro docente ativo recebe 403; estudante/cliente sem sessão docente, 401. Não existe cadastro automático a partir do primeiro acesso.

## Definição persistida

`salta-assessment-definition-v2` tem exatamente:

| Campo | Contrato |
|---|---|
| schemaVersion | literal acima |
| title / subject / kind | texto obrigatório, limites 160/120/80 |
| date | ISO yyyy-mm-dd válido ou vazio no rascunho; obrigatório para emitir |
| manifest | snapshot JSON exato V1 ou V2 geométrico, A4 completo, itens A–D/A–E/C–E |
| blocks | lista não vazia de `{blockId,label,valueUnits,questionIds}` |
| answers | uma entrada `{questionId,correct}` para cada questão do manifesto |
| display | `{score: "final" | "blocks" | "both"}` |

IDs de questão vêm do manifesto, nunca de posição em array. Cada questão pertence a exatamente um bloco; não pode faltar, aparecer duas vezes ou apontar para outra prova/seção. Não admitir pesos individuais. `blockId` é o sectionId exato do manifesto, estável e independente de título/posição; máximo 32 blocos, rótulo até 64 caracteres. `valueUnits` é **string decimal inteira positiva**, até `"99999999"` por bloco, com **scoreScale=10000**: 6,5 pontos = `"65000"`. Não aceitar float, notação científica, zero ou BigInt JSON. Total é a soma exata calculada pelo servidor, devolvida como string; máximo `"100000000"` (10.000 pontos). Não aceitar máximo informado separadamente. Limites/precisão acompanham o candidato do Executor no PR #63; não constituem alteração em critérios do Diário.

Questões do bloco têm a fração exata `valueUnits / quantidadeDeQuestoes`; não arredondar o valor unitário antes da soma. O Executor deve manter numerador/denominador ou cálculo racional e apresentar sua proposta de arredondamento à homologação pedagógica. Esta missão guarda o plano, **não calcula nem publica notas**. Não ligar automaticamente essa definição ao `calculateScore()` legado, que usa valor global uniforme.

Opções visuais, cabeçalho, identificação e geometria estão no manifesto exato. Não refazer o manifesto ao abrir uma revisão, não acrescentar o gabarito ao manifesto e não regenerar históricos para caber no contrato novo. Modelo reutilizável não aceita dados nominais preenchidos; estes devem ser aplicados localmente à impressão nominal, com o controle de privacidade existente. Logos do V2 devem ser imagens incorporadas PNG/JPEG/WebP, sem referência externa.

## Endpoints

Prefixo comum `/assessments/v1`. Todos são privados e respondem JSON com no-store. IDs de avaliação, operação e seleção são UUID v4. IDs de escopo/principal são opacos aprovados no servidor (2–64 caracteres ASCII alfanuméricos, ponto, hífen ou sublinhado; início alfanumérico).

| Método/caminho | Operação e resposta |
|---|---|
| GET `/session` | `{authenticated,principalId,epoch,cryptoModel:"server-managed"}`; sem segredo |
| GET `/grants` | escopos ativos aprovados, sem alunos |
| GET `/assessments?after=UUID` | biblioteca privada, 20 registros/página em ordem de ID, `nextCursor`; metadados/título/total, sem gabarito |
| PUT `/assessments/{id}` | criar revisão completa ou adicionar nova por CAS |
| GET `/assessments/{id}` | revisão atual autorizada |
| GET `/assessments/{id}/revisions` | lista de revisões, estado/hash/data; sem gabarito |
| GET `/assessments/{id}/revisions/{n}` | revisão histórica imutável, definição privada e plano de pontuação |
| POST `/assessments/{id}/duplicate` | copiar revisão explícita para novo ID, revisão 1 em rascunho, mesmo proprietário/escopo |
| POST `/assessments/{id}/archive` | arquivar raiz por CAS, sem apagar ou reescrever revisões |
| GET `/assessments/{id}/revisions/{n}/print` | revisão emitida: `{schemaVersion,assessmentId,revision,manifestHash,svg}`, sem respostas/valores/JSON privado |
| POST `/selections` | fixar revisão emitida antes da sessão de correção |
| GET `/selections/{id}` | retomar seleção imutável e recuperar definição exata autorizada |

PUT exige exatamente `{requestId,expectedRevision,institutionId,classId,periodId,status,definition}`. `status` é draft/issued; `expectedRevision=0` cria, n acrescenta n+1. Nunca PUT parcial, upsert sem condição ou edição de revisão antiga. O proprietário é sempre resolvido no servidor. Escopo da raiz é imutável. O status de uma revisão é imutável; emitir um rascunho cria uma nova revisão. Não inferir emissão a partir de impressão ou abertura.

Sucesso novo: HTTP 201 e `{ok:true,id,revision,manifestHash}`. Arquivamento recebe `{requestId,expectedRevision}`, responde 200 `{ok:true,id,revision,archived:true}`. Duplicação recebe `{requestId,newId,sourceRevision}` e responde como criação; a origem pode ser histórica/arquivada ainda autorizada, sem compartilhar biblioteca ou escopo.

Seleção recebe `{requestId,selectionId,assessmentId,revision}`. Responde 201 `{ok:true,id,revision,selectionId,manifestHash}`. Só revisões issued de raiz ativa permitem novas seleções. Depois de selecionada, uma revisão continua a mesma se surgir n+1 ou se a raiz for arquivada. Revogação do principal/grant bloqueia retomada. A seleção não contém aluno, imagem, respostas de estudante ou nota acadêmica e não grava Diário.

Respostas de detalhe contêm `record={id,ownerId,institutionId,classId,periodId,revision,status,manifestHash,keyVersion,definition,totalUnits,scoreScale,archived}`. `keyVersion` é identificador de versão, não chave. Não persistir esses payloads privados em cache compartilhado, telemetria, logs de erro ou exportação pública. Nunca incluir answers no SVG/PNG/JPG/PDF, QR, nome de arquivo, URL ou manifesto imprimível.

O endpoint print retorna SVG pronto pelo renderizador homologado e um vínculo **sem gabarito**. O SVG recebe somente dois atributos não visuais na raiz (`data-assessment-id`, `data-assessment-revision`); teste confirma que todo o desenho é idêntico ao SVG original. Não alterar o manifesto histórico para gravar essa associação. Para exportação PNG/JPG/PDF, usar esse mesmo SVG e dimensões A4, sem alterar coordenadas, e preservar obrigatoriamente o binding no pacote/registro de exportação. A rasterização pode descartar metadados SVG: uma imagem avulsa sem binding não deve ser tratada como prova identificada. O Executor precisa implementar esse transporte e bloquear correção sem seleção explícita. Não desenhar QR ou outro marcador novo. A folha/fotografia **não identifica automaticamente** prova/revisão: duas avaliações podem ter geometria e hash iguais. O professor seleciona avaliação/revisão uma vez e confere o lote físico. A seleção fixa o gabarito; o hash só verifica o modelo geométrico.

## Concorrência, erros e confirmação

`requestId` tem namespace por proprietário e é imutável. Guardar operação completa enquanto pendente, reenviar **o mesmo** UUID e corpo após falha de conexão/recibo perdido. Reenvio confirmado retorna 200 + `replayed:true`; corpo diferente com UUID reaproveitado retorna 409. Não gerar UUID novo a cada retry. Recibos são guardados atomicamente com a mudança; HMAC com chave separada por derivação evita deixar hash verificável de gabarito em claro no índice de idempotência.

CAS e autorização (enabled, época, prazo em tempo SQL) são conferidos dentro do batch D1. Uma corrida resulta em uma revisão vencedora e 409 na outra; falha intermediária desfaz raiz, revisão e recibo. Não tratar 409 como autorização para sobrescrever. Buscar revisão atual e oferecer conferência/duplicação consciente ao usuário.

| HTTP | Tratamento |
|---|---|
| 400 / 413 / 415 | contrato, tamanho (>1.000.000 bytes) ou tipo de conteúdo inválido |
| 401 | sessão ausente/expirada; retornar ao login SALTA existente |
| 403 | origem ou autorização ausente/revogada; não sugerir criar outro cofre |
| 404 | objeto/revisão/seleção inexistente ou alheia |
| 405 | método não permitido |
| 409 | conflito CAS, idempotência, emissão/arquivamento ou autorização alterada no batch |
| 503 | módulo desligado, Auth/D1/chave indisponível, ciphertext não autenticado ou gravação não confirmada |

Só mostrar Salvo após recibo válido e recuperação da revisão confirmada. Abrir, consultar, imprimir, cancelar e abandonar rascunho não criam avaliação. Na UI manter estados rascunho/salvando/falha/conflito/salvo. Troca de contexto invalida operações visuais pendentes usando geração/AbortController; resposta antiga não pode substituir nova seleção. Escrita já enviada conserva seu escopo/ID original e recibo, sem reaplicação na turma atual.

Não há transação distribuída entre logout no Auth e batch D1: uma requisição validada antes do logout pode terminar em andamento. Cada nova requisição revalida a sessão; revogação/época de principal ou grant no D1 é verificada dentro do batch. Não prometer cancelamento retroativo de uma resposta já autorizada.

## Limites de integração

Sem endpoint de alunos, notas, correção automática, publicação acadêmica, redefinição de cofre, compartilhamento ou administração pública de grants. Nenhuma chave de armazenamento no frontend. O repositório legado exige modos synthetic-only/protected-synthetic e deve ser preservado; o Executor criará adaptador explícito para este contrato, sem remover suas guardas para fazê-lo funcionar.

## Adaptação do PR #63

Referência de leitura: HEAD `cdfd2dbceade1bce012dd626e5cc18396fb0beed`, ainda separado da main desta preparação. Não importar esse PR ou modificar sua branch implicitamente. O schema transitório `salta-integrated-plan-local-v1` não é aceito diretamente como payload persistente.

| Origem do plano P1 | Definição persistente |
|---|---|
| metadata.title/subject/kind/date | campos de mesmo nome |
| manifesto exato selecionado pelo editor | manifest, sem regeneração ou respostas corretas |
| blocks[].sectionId | blocks[].blockId; deve corresponder ao sectionId do manifesto |
| blocks[].label/valueUnits | label/valueUnits sem conversão decimal: strings inteiras de 1/10000 |
| blocks[].questions[].questionId | questionIds do respectivo bloco |
| blocks[].questions[].correct | answers por questionId, uma entrada por questão |
| display | display.score |
| model.templateId/revision/contentHash | conferir contra manifest; nunca substituir a revisão da avaliação por essa revisão geométrica |

Revisões `aba-*` e contadores em memória não são IDs/revisões do servidor. Criar UUID de avaliação/operação e usar CAS com a revisão confirmada pelo backend. Para retomar a correção, reconstruir o plano racional a partir da revisão **selecionada**, preservando valores, gabarito e manifesto; conferir todos os IDs/números/tipos ao adaptar. A saída de `GET /selections/{id}` fixa esse vínculo, e uma nova revisão corrente não o altera. Guardar a referência em futuras propostas de correção, sem publicar no Diário nesta etapa.

O adaptador deve validar o snapshot inteiro antes de habilitar leitura; falhas de persistência ou sessão não podem promover silenciosamente um plano transitório a avaliação salva. A implementação da UI/adaptação e seu ensaio ponta a ponta ficam com o Executor, sujeitos a revisão própria. Os testes desta branch provam o serviço e o contrato da sessão, não a interface do PR #63.
