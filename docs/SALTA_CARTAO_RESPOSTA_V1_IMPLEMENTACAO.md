# Cartão-resposta SALTA V1 — implementação e validação

Data: 14/11/2026. Base: PR #31, `e376c820ec74d824ad7a366137342df2efd24ae6`.
Escopo autorizado: código em branch/PR draft para revisão. Sem merge ou deploy.

## Diagnóstico técnico anterior à alteração

- `layout.mjs` é a fonte de coordenadas em milímetros. A4: 210 × 297; bolhas: 4,5 mm; fiduciais quadrados: 5,5 mm, centros a 8 mm dos cantos. A grade nominal começa em x=161,3, caixas em y=29, bolhas de y=37,5 a 84,3; raio 2,25. Questões com código começam em y=94.
- `render.mjs` posicionava metadados nas colunas x=14/78/142, sem reservar a grade direita; título podia ficar à esquerda com logo. Seções tinham somente linha e não repetiam título em coluna de continuação. Rodapé era texto SVG visível.
- `template.mjs` adapta o manifesto para o leitor. `reader.mjs` amostra o centro das bolhas do modelo ativo; não lê o rodapé nem descobre automaticamente a revisão da folha. `normalize.mjs` usa os quatro fiduciais. Nenhum desses quatro arquivos foi alterado.
- `export.mjs` compartilha o SVG na impressão, PNG/JPG e lotes; JSON/histórico guarda o manifesto. A impressão física perde atributos SVG; eles não são um identificador óptico autossuficiente.
- Riscos previstos: texto/borda invadir grade; títulos de continuação atravessarem bolhas; aumento de tinta criar falsos positivos; impressão mudar escala; modelo ativo não corresponder ao cartão. A abordagem conserva coordenadas, rejeita texto sem espaço e mede leitura de rasters sintéticos.

## Resultado por requisito

| Requisito | Implementação / estado |
|---|---|
| CV-01 | Texto MODELO/REV/hash removido na origem do SVG. Metadados continuam nos atributos/JSON. `artworkVersion=salta-card-artwork-v1` identifica apresentação, separada da geometria. |
| CV-02 | Título principal e instituição centralizados na largura da folha, com reserva simétrica para logos. Cada título de seção centralizado na própria moldura. |
| CV-03 | Quebra de linha dentro de regiões delimitadas, sem `textLength` no cabeçalho. Metadados à esquerda da área óptica. Texto que não cabe produz erro explicável; não é espremido ou cortado silenciosamente pelo renderizador. |
| CV-04 | Moldura fechada por seção/coluna; CDU engloba suas linhas. IDs e numeração não são duplicados. Continuação mantém o mesmo título e ID lógico. |
| CV-05 | Separação institucional/metadados/estudante, filetes pretos e hierarquia. Sem copiar ativos da referência. |
| CV-06 | Contorno de letras aumentado de 0,12 para 0,16 mm; não foi adotado preto sólido. Dígitos ampliados para 1,85 mm, preservando círculos e centros. A legibilidade em papel permanece pendente. |
| CV-07 | Data ISO válida aparece como dd/mm/aaaa. Datas impossíveis bloqueiam renderização; ISO continua no manifesto. |
| CV-08 | Logos configurados são preservados e dimensionados proporcionalmente dentro da região segura. Títulos longos quebram ou são rejeitados. Nenhuma mudança de posição óptica para acomodar cabeçalho. |
| CV-09 | Limpeza e três destinos do Corretor mantidos. Atualização de cache limitada a render/export/artwork. Autenticação e câmera não foram modificadas. |

Pedido adicional durante a execução: molduras internas de seções com cantos arredondados de **1 mm**. Fiduciais e caixas ópticas continuam quadrados. A borda externa mantém o contrato anterior.

O modelo Compacto mantém tipografia e colunas de metadados próprias. Os modelos com logo respeitam os arquivos configurados; nenhuma imagem válida é removida para abrir espaço. Arquivos remotos de logo continuam proibidos.

## Paginação: falha encontrada na inspeção real

O documento tinha um script depois da última seção. A regra `.print-page:last-child` não alcançava a última folha e o Chrome exibiu duas páginas, sendo a segunda vazia. A regra passou a `.print-page:last-of-type`. Após atualização, a mesma impressão mostrou e salvou **uma página A4** no Chrome. O teste de lote exige a regra correta, além da quantidade de seções.

## Matriz executada e capacidade

| Cenário | Evidência / resultado |
|---|---|
| A-D, A-E, C-E × 10/20/50/100/150 | 15 composições; coordenadas ópticas e hashes comparados com baseline. Renderização a 300 DPI, branco e marca C lidos; quatro fiduciais detectados. |
| PNG/JPG A-E 20/50/100 | Dimensões 2480 × 3508; densidade 300 DPI; JPEG vazio não criou marca no teste automatizado. |
| CDU 10 | Geração válida; moldura única abrangendo as duas linhas de questões. Leitor CDU continua indisponível e rejeita explicitamente. |
| CDU 20/50/100/150 com código | Rejeitado por capacidade A4; sem diminuir bolhas ou gerar segunda folha. Não é promessa de 150 CDU. |
| Mistos A-D/A-E/C-E/CDU | Testes estruturais existentes e novos de região, ID e numeração; composição densa inviável continua rejeitada. |
| Sem código / nominal / lote | Testes de dimensões, impressão por identidade fictícia e ausência de dados nominais no JSON reutilizável. |
| Um/dois logos / títulos longos | Testes de centralização/reserva e falha explícita. Dimensões calculadas; sem alegação de papel homologado. |
| Incorporado manual 100 × 180 | Dimensão preservada e molduras presentes. Textos que não cabem no cabeçalho reduzido bloqueiam exportação. |
| Desktop | Chrome local, 1470 px; geração, modal e navegação; título em x=105 com ancoragem central. |
| Mobile | Chrome em viewport **medido** 390 × 844; geração e troca para Corrigir; largura do documento 390, sem overflow horizontal. Não é aparelho físico. |
| PDF Chrome | Salvamento pela interface de impressão de documento HTTP sintético produzido por `buildPrintDocument`; uma página, A4, texto e letras preservados. |
| Impressora / fotografia / câmera real | NÃO EXECUTADO. Gate obrigatório antes de homologar produção. |

A aba temporária `blob:` de impressão não pôde ser inspecionada pela política de URLs do navegador conectado. Foi usado um documento HTTP local sintético gerado diretamente pelo mesmo exportador, sem ler a aba bloqueada. O código de abertura de janela da aplicação não foi alterado. A interface local usou sessão **simulada**, com conexões externas bloqueadas no servidor de teste; isso não é teste da autenticação real.

## Densidade óptica e regressão

Ensaio a 300 DPI, A-E 20, amostragem do leitor intacta (limiar de tinta 155): contorno anterior máximo ~36,07; novo ~47,79; variante sólida ~83,72. Nenhuma dessas variantes gerou marca falsa nesse raster; **isso não prova segurança do sólido em fotos**. Mantido o contorno por reduzir a mudança e a tinta. Marca preenchida C foi lida, dupla C/D sinalizada. Sem alterar limiares.

São 61 testes integrados de Corretor, plataforma e Worker, além do script de rasterização com Sharp 0.35.5. A CI executa o script e publica apenas evidência sintética SVG/PNG/JPG/JSON. A fixture `artwork-v0-optical.json` conserva 15 hashes/digests extraídos do render anterior em e376c82; não foi produzida a partir da implementação nova.

## Compatibilidade e rastreabilidade sem rodapé

Não mudaram `layout.mjs`, `template.mjs`, `reader.mjs` ou `normalize.mjs`. Centros, diâmetros, fiduciais e IDs são iguais aos da base para as 15 composições arquivadas. Cartões anteriormente emitidos com o **mesmo modelo ativo** continuam usando as mesmas coordenadas. Não se promete reconhecer qualquer cartão histórico desconhecido.

O manifesto/JSON e o histórico continuam úteis para registrar a versão, mas o leitor atual **não importa automaticamente um JSON histórico nem detecta a versão a partir de foto**. O operador precisa manter o modelo correto configurado na sessão. Remover o rodapé não retirou uma entrada do algoritmo; ainda assim, seleção explícita/importação de modelos e identificação óptica de versão são evoluções futuras. Não foi criado QR ou marca nova para fingir essa capacidade. Não lançar notas acadêmicas com versão incerta.

## Arquivos e reversão

- `artwork.mjs`: apresentação delimitada, data e molduras derivadas das posições existentes.
- `render.mjs`: desenha essa apresentação; mantém círculos e fiduciais.
- `export.mjs`: cache do renderer e regra da última página.
- `plataforma/corretor-v2.html`: apenas versões dos imports render/export.
- Testes e script raster/CI; relatório técnico.

Reversão futura: reverter o commit de apresentação em branch/PR, sem migração de banco. Não há schema, Worker ou registro a reverter. Não reverter a limpeza de interface anterior do PR #31 inadvertidamente.

## Checklist físico pendente

- [ ] Imprimir sintéticos 20/50 em A4, escala 100%, sem ajustar à página.
- [ ] Conferir 4,5 mm de bolha, 5,5 mm dos marcadores e tamanho A4.
- [ ] Marcar com caneta preta/azul; vazio, rasura, marca fraca e dupla.
- [ ] Fotografar em dois celulares e duas iluminações, com perspectiva/rotação.
- [ ] Conferir código, respostas e falsos positivos contra corpus rotulado.
- [ ] Comparar com a versão anterior e definir limite aceitável antes de aprovar.
- [ ] Aprovar separadamente merge e deploy. Nenhuma autorização inferida deste checklist.
