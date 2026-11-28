# DESIGN-SALTA-06 — transferência oficial, etapa A
Issue #155 / ordem #7238902251; base `470865018b46335e3e5838f1312cc2d8f0490fcc`; ata #143 #7227089982. Ateliê congelado. Não publicar.
## Inventário e cobertura A–F
Classificação inicial por árvore e destinos confirmados no código da entrada/professor; atividade autenticada não presumida. Inventário automatizado em inventory.json: recursos HTML, hrefs, sinais de DOM dinâmico, auth, impressão e consumidores CSS por nome; dependências carregadas dinamicamente e status real das rotas protegidas exigem verificação nas fases seguintes.
| HTML | Classe / composição | Fase |
|---|---|---|
| plataforma/index.html | Entrada oficial 15.1 B | A |
| plataforma/professor.html | Login e painel oficiais 15.2 B / 15.3 A | A |
| index.html | Portal aluno 15.15 B | B |
| preview-aluno.html | Prévia/teste candidato 15.15 B | B |
| plataforma/mensagens.html | Avisos 15.18 B | B |
| plataforma/diario-teste.html | Diário destino existente 15.4–15.11 | C |
| plataforma/fechamento-bimestre.html | Fechamento destino existente 15.4/15.19 | C |
| plataforma/estatistica.html | Relatórios destino existente 15.14 B | D |
| plataforma/estatistica-individual.html | Relatórios candidato 15.14 B | D |
| plataforma/estatistica-turma.html | Relatórios candidato 15.14 B | D |
| plataforma/estatistica-acessos.html | Relatórios candidato 15.14 B | D |
| plataforma/eleicoes.html | Evento candidato 15.16 C | D |
| plataforma/festival-consciencia-negra.html | Evento candidato 15.16 C | D |
| plataforma/festival-consciencia-negra-admin.html | Evento destino existente 15.16 C | D |
| mostra-cultural.html | Evento público/admin destino existente 15.16 C | D |
| solucionador.html | Utilitário existente 15.22 B | D |
| plataforma/piloto-avaliacoes.html | Piloto protegido candidato 15.12/15.13 | E |
| plataforma/corretor-v2.html | Corretor protegido 15.12/15.13 | E |
| corretor/index.html | Legado/protegido | E |
| corretor/folha-resposta.html | Impressão protegida | E |
| corretor/legado-eja.html | Legado/protegido | E |
| laboratorio/salta-omr-capture-lab/index.html | Laboratório protegido | fora |
| laboratorio/salta-omr-scan-safe-02/index.html | Laboratório protegido | fora |
| laboratorio/salta-scan/index.html | Laboratório protegido | fora |
| plataforma/atelie-salta.html | Referência congelada 22 composições | fora |
F: revisão transversal das lacunas; 15.17 CONNECT e módulos inexistentes não implementados.
## CSS base (15)
- salta-theme.css e plataforma/professor-theme.css: compartilhados, intocados, consumidores identificados no inventário.
- plataforma/atelie-salta-v2.css e plataforma/atelie-salta-v2-fidelity.css: Ateliê.
- plataforma/avaliacao-excluir-dialog.css, plataforma/avaliacoes-biblioteca.css, plataforma/corretor-v2.css, plataforma/piloto-avaliacoes.css: avaliações/OMR protegidos.
- laboratorio/salta-omr-capture-lab/css/{omr-lab,salta-scan,style}.css; laboratorio/salta-omr-scan-safe-02/css/{omr-lab,salta-scan,style}.css; laboratorio/salta-scan/css/{salta-scan,style}.css: protegidos. (Contagem conferida automaticamente; lista inclui todos os nomes observados, sem modificar nenhum.)
## Matriz decisão → recurso → rota → evidência
| Decisão | Implementação | Rota | Evidência prevista |
|---|---|---|---|
| Paleta, Inter local, grade só fundo, raios 14/11 | foundation.css opt-in .salta6; fonte e licenças copiadas | A | screenshots + contratos |
| 15.1 B | duas entradas e duas ferramentas com links reais | plataforma/index.html | quatro hrefs / entrada |
| 15.2 B | cartão login, campos, status e erro reais | professor.html | script auth idêntico + login sintético |
| 15.3 A | sete atalhos reais primeiro, menu existente | professor.html | dashboard / menu / logout |
| 15.21 A | sprite aprovado, ícones livres nos cartões; shell mantém ícones legados até revisão transversal | A | assets byte a byte |
| Favicon C | blob idêntico à referência; URLs antigas mantidas | raiz | teste bytes |
| 14 C | grid adaptável, menu móvel existente | A | seis viewports, reflow estreito |
| Foco, estados, reduced motion | CSS opt-in | A | teclado / contraste a auditar |
| Proteções | diff allowlist, scripts e CSS compartilhado intactos | todas demais | guard; regressões gerais |
## Limites e rollback
Sem dados reais, autenticação produtiva ou deploy. O harness intercepta rede externa, não certifica Turnstile físico, Safari físico, zoom nativo 200%, contraste completo por ferramenta ou região óptica renderizada. O inventário não certifica atividade real de páginas não carregadas. Preservar #141 e relatar CI separadamente. Reverter o commit/PR desta fase em caso de problema (inclui favicon e recursos locais); nenhuma migração ou serviço afetado. Auditoria independente e GO explícito antes de merge.
