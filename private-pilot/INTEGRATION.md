# Candidato único — catálogo #72 e gateway #73

Base #68: `d453e1da14147990a8ba837a39f38975bbdff627`.
Catálogo #72: `466a6780b29fe462cbf645ca6262b265a4c0c135` (nove commits).
Gateway #73: `06e876b6674b11a46caa177d45f9986986bcf06f` (um commit).
Os dois HEADs são ancestrais do candidato; nenhum cherry-pick, squash ou mudança nas branches originais. O PR de integração permanece em rascunho, sem autorização de publicação.

## Diferenças necessárias

- Sobre #72: acrescenta o conjunto completo do gateway #73 e seus testes/preparação offline. Os arquivos funcionais e o contrato do catálogo permanecem idênticos ao HEAD auditado. Uma linha no teste existente escolhe o menor ID aleatório, em vez do primeiro criado, garantindo sua presença na primeira página consultada. A suíte conjunta reproduziu a falha anterior (`undefined !== 2`), quando esse registro estava nas páginas seguintes; nenhum comportamento de produção foi alterado.
- Sobre #73: incorpora o conjunto completo do catálogo; troca a referência auditada do backend para #72; permite seus filtros completos de instituição/turma/período, junto ao cursor, na allowlist do gateway. Nenhuma outra rota/controle é ampliada.
- Integridade/CI: arquivos autorizados do catálogo precisam coincidir byte a byte com #72, aceitando somente aquela substituição exata no teste; qualquer delta fora deles, de `private-pilot/` e da CI própria é recusado. Testes exigem ancestralidade dos dois HEADs e recusam alteração acadêmica/Auth/OMR, migração nova e workflow de deploy. CI própria faz checkout do HEAD exato, testa as duas funcionalidades juntas e gera artefatos desativados com hashes.
- Stats continua importado do Git em `f4dce82716faa06720068f3228a6f890fd0f928f`, com blob/hash fixados. Não se utiliza o Stats atual do checkout e não se incorpora D-04 ao bundle. Fonte acadêmica antiga não é corrigida ou homologada nesta entrega.

## Evidências conjuntas

Suítes existentes de catálogo 0/1/10/11/20/31, avanço/retorno, filtros, permissões, histórico/cifra e estados de erro continuam intactas. Integração real local usa Auth/SessionStore, três Workers, limitadores e D1 temporário; salva duas avaliações de 60 questões com gabaritos A/B distintos e lista/abre pelo cliente/controlador #72 através do gateway. Verifica outra conta, outro escopo autorizado vazio, período negado, recuperação em segunda sessão/reinício, revisão anterior imutável, concorrência, revogação e reenvio após perda de resposta. Nenhum dado real ou serviço remoto é usado.

## Checklist curto — execução futura exige autorização específica

1. Aprovar HEAD/CI e parecer independente do Auditor; reconferir Stats ativo e configuração efetiva. Preservar flags falsas até completar os gates do [README](README.md).
2. Autorizar Worker privado sem workers.dev/previews/rotas públicas, D1 exclusivo vazio e limites próprios; aprovar capacidade. Gerar somente configurações fechadas com IDs conferidos. Não usar workflow histórico ou entrypoint Stats da main.
3. Autorizar migração exclusiva já existente, chaves de servidor com backup/restauração testados e principal/grants aprovados. Sem senha/frase adicional ao professor. Não reutilizar bancos ou chaves acadêmicas.
4. Autorizar deploy isolado com flags falsas; conferir bloqueio direto ao backend, ausência de D-04 e preservação das rotas antigas. Só então autorizar flags e UI do piloto separadamente.
5. Pela sessão SALTA autorizada, criar **Avaliação A** e **Avaliação B**, ambas com 60 questões, dois blocos (6 + 4 pontos), títulos distintos e gabaritos diferentes. Confirmar recibos, listar/abrir ambas sem trocar o registro ativo inadvertidamente; respostas não aparecem na listagem nem no SVG público.
6. Emitir A/revisão 1 e B/revisão 1, selecionar explicitamente o lote, gerar A4 e conferir cada avaliação/revisão. Atualizar A para revisão 2 e comprovar que A/revisão 1 e B permanecem íntegros. Reabrir em Safari/iPhone e segundo dispositivo; conferir recuperação, histórico e isolamento. Fazer ensaio físico sintético A4/60 e medir CPU/D1/limites reais.

Em falha, fechar flags/UI e preservar D1/chaves/revisões/recibos. Eventual rollback do Stats usa a versão produtiva anterior aprovada; nunca o Stats da main. O procedimento completo anterior permanece no README. Preparação/CI não equivalem a deploy ou homologação operacional.
