(function atelierV2(){
 'use strict';
 // DESIGN-SALTA-01: todo dado é sintético, nenhuma chamada de rede, nenhum estado persistente.
 const $=id=>document.getElementById(id);
 const sprite='./atelie-salta-v2-icons.svg';
 const icon=name=>`<svg class="v2-glyph" aria-hidden="true" viewBox="0 0 24 24"><use href="${sprite}#v2-${name}"></use></svg>`;
 const groups=[
 ['Módulos',[['Início','house'],['Diário','book-open'],['Calendário','calendar-days'],['Corretor','scan-line'],['Gerador','file-plus'],['Estatísticas','chart-no-axes-column'],['Portal do Aluno','graduation-cap'],['Projetos','folder-open'],['CONNECT','arrow-left-right'],['Avisos','megaphone'],['Relatórios','files'],['Configurações','settings']]],
 ['Pedagógicos',[['Instituições','school'],['Turmas','users'],['Estudante','user-round'],['Frequência','clipboard-check'],['Notas','calculator'],['Recuperação','rotate-ccw'],['Vistos','list-checks'],['Planejamento','notebook-pen'],['Sequências','layers'],['Habilidades','target'],['Avaliações','clipboard-list'],['Gabarito','file-check'],['Avaliadores','user-check'],['Observações','message-square-text']]],
 ['Ações',[['Adicionar','plus'],['Editar','pencil'],['Visualizar','eye'],['Excluir','trash-2'],['Duplicar','copy'],['Salvar','save'],['Pesquisar','search'],['Filtrar','list-filter'],['Arquivar','archive'],['Histórico','history'],['Restaurar','archive-restore'],['Importar','file-input'],['Exportar','file-output'],['Baixar','download'],['Enviar','send'],['Imprimir','printer'],['Compartilhar','share-2'],['Anexar','paperclip']]],
 ['Estados',[['Sucesso','check-circle'],['Erro','circle-x'],['Atenção','triangle-alert'],['Informação','info'],['Pendente','clock'],['Sincronização','refresh-cw'],['Salvo no servidor','cloud-check'],['Sem conexão','wifi-off'],['Privado','lock'],['Segurança','shield-check'],['Autenticação','key-round'],['Conflito','git-compare-arrows']]],
 ['Navegação',[['Menu','menu'],['Mais opções','ellipsis-vertical'],['Fechar','x'],['Anterior','chevron-left'],['Próximo','chevron-right'],['Expandir','chevron-down'],['Recolher','chevron-up'],['Tela cheia','maximize'],['Notificações','bell'],['Ajuda','circle-help'],['Acessibilidade','accessibility'],['Sair','log-out']]]
 ];
 const total=groups.reduce((n,g)=>n+g[1].length,0);
 if(total!==68||new Set(groups.flatMap(g=>g[1].map(x=>x[1]))).size!==68)throw Error('Catálogo de 68 símbolos incompleto');
 const decisions=[
 ['15.1','B','Entrada do portal','Entrada','entry','index.html · plataforma/index.html'],
 ['15.2','B','Login institucional','Entrada','login','plataforma/index.html · plataforma/professor.html (candidato)'],
 ['15.3','A','Professor — central de ferramentas','Professor','home','plataforma/professor.html'],
 ['15.4','B','Diário pedagógico integrado','Diário','diary','plataforma/diario-teste.html'],
 ['15.5','B','Grupos institucionais','Professor','institutions','plataforma/professor.html'],
 ['15.6','B','Ficha acadêmica do estudante','Diário','record','plataforma/diario-teste.html'],
 ['15.7','B','Calendário e agenda','Diário','calendar','plataforma/diario-teste.html'],
 ['15.8','C','Chamada diária e histórico','Diário','attendance','plataforma/diario-teste.html'],
 ['15.9','C','Notas e recuperação','Diário','grades','plataforma/diario-teste.html'],
 ['15.10','C','Vistos por atividade','Diário','checks','plataforma/diario-teste.html'],
 ['15.11','C','Biblioteca e planejamento','Diário','planning','plataforma/diario-teste.html · biblioteca candidata'],
 ['15.12','B','Corretor — gerenciamento','Avaliações','scanner','plataforma/corretor-v2.html · PROTEGIDO'],
 ['15.13','B','Gerador de cartões','Avaliações','generator','plataforma/corretor-v2.html · PROTEGIDO'],
 ['15.14','B','Estatísticas equilibradas','Outros','stats','plataforma/estatistica*.html'],
 ['15.15','B','Portal do Aluno','Outros','student','preview-aluno.html · index.html'],
 ['15.16','C','Projetos por situação','Outros','projects','mostra-cultural.html · festival* (candidatos)'],
 ['15.17','B','CONNECT por sistema','Outros','connect','Planejado; integração real NÃO implementada'],
 ['15.18','B','Central de avisos','Outros','notices','plataforma/mensagens.html'],
 ['15.19','B','Documentos por categoria','Outros','docs','Relatórios/impressão · candidato'],
 ['15.20','B','Configurações por finalidade','Sistema','settings','plataforma/professor.html (candidato)'],
 ['15.21','A','Biblioteca de ícones livres','Sistema','symbols','Ateliê · biblioteca de 68 símbolos'],
 ['15.22','B','Componentes secundários','Sistema','secondary','Elementos transversais · conceitual']
 ].map(([id,choice,title,group,kind,route])=>({id,choice,title,group,kind,route}));
 if(decisions.length!==22)throw Error('22 composições obrigatórias');
 const feedback=(text)=>{const node=$('v2-feedback');if(node)node.textContent=text};
 const mark=(name,label)=>`${icon(name)}<span>${label}</span>`;
 const status=(name,title,copy,tone='info')=>`<div class="v2-state" data-tone="${tone}">${icon(name)}<div><strong>${title}</strong><small>${copy}</small></div></div>`;
 const sampleBtn=(text,kind='v2-default',action='demo',glyph=null)=>`<button type="button" class="${kind}" data-v2-action="${action}">${glyph?icon(glyph):''}${text}</button>`;
 const field=(label,id,placeholder)=>`<label class="v2-field"><span>${label}</span><input class="v2-input" id="${id}" type="text" placeholder="${placeholder}" maxlength="50"></label>`;
 const readOnlyTable=(type='grades')=>{
  const head=type==='attendance'?['Estudante','Seg · 02/11','Qua · 04/11','Sex · 06/11']:type==='checks'?['Estudante','Atividade 1','Atividade 2','Atividade 3']:['Estudante','Avaliação 1','Avaliação 2','Recuperação'];
  const rows=type==='attendance'?[
   ['Estudante A','P · Presente','F · Falta','P · Presente'],
   ['Estudante B','FJ · Justificada','P · Presente','— · Sem registro'],
   ['Estudante C','FA · Abono','P · Presente','F · Falta']
  ]:type==='checks'?[
   ['Estudante A','✓ · Visto','× · Sem visto','◷ · Pendente'],
   ['Estudante B','— · Sem registro','✓ · Visto','✓ · Visto'],
   ['Estudante C','✓ · Visto','✓* · Parcial','◷ · Pendente']
  ]:[
   ['Estudante A','0,0 · Lançado','8,0','— · Pendente'],
   ['Estudante B','— · Não lançado','7,5','9,0'],
   ['Estudante C','6,0* · Parcial','8,0','— · Pendente']
  ];
  return `<div class="v2-table-scroll" tabindex="0" aria-label="Planilha de ${type==='attendance'?'frequência':type==='checks'?'vistos':'notas'}, exemplo fictício. Deslize horizontalmente se necessário"><table class="v2-table"><thead><tr>${head.map((h,i)=>`<th scope="col" ${i===0?'class="v2-sticky-col"':''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>`<${i===0?'th scope="row"':'td'} ${i===0?'class="v2-sticky-col"':''} tabindex="0">${cell}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div><p class="v2-small">Amostra estática. “0”, “—”, “*” e registros confirmados têm significados diferentes; nenhuma fórmula foi executada.</p>`;
 };
 const cards=(items)=>`<div class="v2-lesson-cards">${items.map(([title,small,desc,isNext])=>`<article class="v2-lesson" ${isNext?'data-next="true"':''}><strong>${title}</strong><small>${small}</small><p>${desc}</p></article>`).join('')}</div>`;
 const kpis=(rows)=>`<div class="v2-kpis">${rows.map(([title,value])=>`<div class="v2-kpi"><small>${title}</small><strong>${value}</strong></div>`).join('')}</div>`;
 function sampleBody(kind){
  const inner=(title,subtitle,html)=>`<div class="v2-shell-content"><h3>${title}</h3><p>${subtitle}</p>${html}</div>`;
  const meta=`<div class="v2-metadata"><span class="v2-chip">${icon('lock')} Dados fictícios</span><span>Sem autenticação, persistência ou rede</span></div>`;
  switch(kind){
  case 'entry':return inner('Seu espaço de aprendizagem','Acesso visual aos ambientes, sem funcionamento de login.',`<div class="v2-grid"><div class="v2-panel">${icon('graduation-cap')}<h3>Área do Aluno</h3><p>Consulte seus dados quando autorizado.</p>${sampleBtn('Explorar exemplo','v2-btn v2-btn-primary','intro','chevron-right')}</div><div class="v2-panel">${icon('book-open')}<h3>Área do Professor</h3><p>Organização da rotina pedagógica.</p>${sampleBtn('Visualizar exemplo','v2-btn','intro','chevron-right')}</div></div>${meta}`);
  case 'login':return inner('Acesso institucional','Formulário visual; autenticação real não simulada.',`<div class="v2-panel" style="max-width:400px">${field('Identificação','v2-login-user','Exemplo: usuário institucional')}<label class="v2-field" style="margin-top:12px"><span>Senha ilustrativa</span><input type="password" class="v2-input" id="v2-login-pass" autocomplete="off" placeholder="Não insira senha real"></label><div class="v2-demo-toolbar">${sampleBtn('Simular validação','v2-btn v2-btn-primary','fake-login','lock')}</div><p class="v2-small">Não digite credenciais reais. Nenhum dado é transmitido.</p></div>`);
  case 'home':return inner('Central de ferramentas','Agenda secundária e acesso contextual às tarefas.',`${kpis([['Turmas (exemplo)','04'],['Pendências fictícias','03'],['Aulas ilustrativas','06']])}${cards([['Diário de classe','Acesso contextual','Planejamento e registro ilustrativos',true],['Avaliações','Ferramenta acadêmica','Gerenciamento de atividades',false]])}<p class="v2-small">Agenda do dia apresentada abaixo, sem inferir tarefas reais.</p>${cards([['08:00 · Matemática','Turma Exemplo A','Próxima aula · fictícia',true]])}`);
  case 'diary':return inner('Diário integrado','Turma e instituição aparecem como contexto, não como nova regra.',`<div class="v2-chip">Escola Exemplo · Turma A · Matemática · 2º bimestre</div>${cards([['Aula 01 · 08:00','Segunda-feira','Conteúdo: frações · situação: rascunho',true],['Aula 02 · 09:00','Segunda-feira','Conteúdo: geometria · situação: exemplo',false]])}<div class="v2-demo-toolbar">${sampleBtn('Aula','v2-btn is-active','context')}${sampleBtn('Notas','v2-btn','context')}${sampleBtn('Acompanhamento','v2-btn','context')}</div>`);
  case 'institutions':return inner('Grupos institucionais','Sem favoritos inventados; acesso contextual por vínculo autorizado.',cards([['Escola Exemplo A','Instituição fictícia','2 turmas para demonstrar cartões',true],['Escola Exemplo B','Instituição fictícia','2 turmas para demonstrar a navegação',false]]));
  case 'record':return inner('Ficha acadêmica · Estudante A','Identificação sintética; notas e vistos separados por abas.',`${kpis([['Notas lançadas (amostra)','2'],['Frequências registradas','3'],['Pendências (amostra)','1']])}<div class="v2-demo-toolbar">${sampleBtn('Notas','v2-btn is-active','context')}${sampleBtn('Frequência','v2-btn','context')}${sampleBtn('Vistos','v2-btn','context')}</div>${readOnlyTable('grades')}`);
  case 'calendar':{
   const blocks=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];let cells=blocks.map(x=>`<div><strong>${x}</strong></div>`).join('');
   cells+=Array.from({length:28},(_,i)=>`<div ${i===11?'data-today="true"':''}>${i+1}${i===11?'<br><small>2 aulas</small>':''}</div>`).join('');
   return inner('Calendário integrado à agenda','Mensal informativo, semanal cronológico e diário por turno.',`<div class="v2-panel"><strong>Novembro · amostra fictícia</strong><div class="v2-calendar" style="margin-top:12px">${cells}</div></div><div class="v2-timeline"><div>08:00<br>Matemática</div><div>09:00<br>Geometria</div><div>13:00<br>Revisão</div></div>${cards([['Manhã','08:00 · Escola Exemplo','Próxima aula destacada',true],['Tarde','13:00 · Escola Exemplo','Aula de exemplo',false],['Noite','19:00 · Escola Exemplo','Aula de exemplo',false]])}`);
  }
  case 'attendance':return inner('Chamada diária e histórico','Rascunho não equivale a presença confirmada.',`${status('clock','Rascunho de chamada','Nenhuma gravação foi efetuada.','warning')}${readOnlyTable('attendance')}${sampleBtn('Simular revisão','v2-btn v2-btn-primary','attendance','clipboard-check')}`);
  case 'grades':return inner('Notas e recuperação','Planilha horizontal com estudante fixo; nenhuma fórmula aplicada.',`${readOnlyTable('grades')}${status('info','Distinções preservadas','Zero é nota lançada; traço significa ausência. Asterisco indica parcial.','info')}`);
  case 'checks':return inner('Vistos por atividade','Visão matricial e contexto por atividade, com exceções na célula.',`${readOnlyTable('checks')}${sampleBtn('Visualizar atividade','v2-btn','checks','list-checks')}`);
  case 'planning':return inner('Planejamento pedagógico','Biblioteca, sequência e editor ilustrativos; nenhuma integração ao CIAP.',`${cards([['Sequência A','3 etapas de exemplo','Organização por temas sem gravação',true],['Plano de aula','Modelo sintético','Habilidades a conferir pelo professor',false]])}<div class="v2-fields">${field('Título do plano','v2-plan-name','Plano fictício')}<label class="v2-field"><span>Situação</span><select class="v2-select"><option>Rascunho</option><option>Em revisão</option></select></label></div><div class="v2-demo-toolbar">${sampleBtn('Prévia de planejamento','v2-btn v2-btn-primary','planning','notebook-pen')}</div>`);
  case 'scanner':return inner('Corretor · central de gerenciamento','Prévia visual sem câmera, Magic Scan, overlay ou motor OMR.',`${cards([['Avaliação Exemplo A','Turma fictícia','Modelo selecionado, conferir lote físico',true],['Avaliação Exemplo B','Turma fictícia','Registro demonstrativo',false]])}${status('info','Área óptica protegida','A interface de captura não é recriada e nenhuma fotografia é processada.','info')}<div class="v2-demo-toolbar">${sampleBtn('Consultar visual de avaliação','v2-btn','scanner','scan-line')}</div>`);
  case 'generator':return inner('Gerador de cartão','Configuração e prévia simultâneas: cartão óptico REAL fora do Ateliê.',`<div class="v2-grid"><div class="v2-panel"><h3>Configuração</h3>${field('Título','v2-gen-title','Avaliação ilustrativa')}<label class="v2-field" style="margin-top:12px"><span>Formato</span><select class="v2-select"><option>A–D</option><option>A–E</option></select></label></div><div class="v2-panel"><h3>Prévia não óptica</h3><div class="v2-paper"><h4>EXEMPLO VISUAL</h4><p class="v2-small">Sem bolhas, marcadores, coordenadas ou folha imprimível. A geometria real permanece protegida.</p><hr><p class="v2-small">Cabeçalho · Turma · Situação</p></div></div></div>`);
  case 'stats':return inner('Estatísticas','Indicadores, gráfico e tabela equilibrados, valores 100% ilustrativos.',`${kpis([['Amostra fictícia','30'],['Registros simulados','18'],['Pendências de exemplo','12']])}<div class="v2-panel"><h3>Distribuição de exemplo</h3><div class="v2-chart" aria-label="Gráfico de barras ilustrativo; valores não reais"><div style="height:34%"></div><div style="height:77%"></div><div style="height:52%"></div><div style="height:92%"></div></div><p class="v2-small">Barras ilustrativas, sem dados ou cálculos acadêmicos.</p></div>${readOnlyTable('grades')}`);
  case 'student':return inner('Portal do Aluno','Apresentação clara, sem expor informações privadas.',`${status('lock','Dados protegidos','Esta é uma ficha fictícia, sem consulta ao portal real.','info')}${cards([['Minhas atividades','Amostra local','Informações aparecem após autorização',true],['Avisos','Amostra local','Mensagens de demonstração',false]])}`);
  case 'projects':return inner('Projetos por situação','Três colunas aprovadas: planejamento, execução, conclusão.',`<div class="v2-columns"><div class="v2-column"><strong>Planejamento</strong><p>Projeto Exemplo A</p><span class="v2-chip">A preparar</span></div><div class="v2-column"><strong>Execução</strong><p>Projeto Exemplo B</p><span class="v2-chip">Em andamento</span></div><div class="v2-column"><strong>Conclusão</strong><p>Projeto Exemplo C</p><span class="v2-chip">Encerrado (amostra)</span></div></div>`);
  case 'connect':return inner('CONNECT · sistemas externos','Conexões meramente visuais, sem login ou tráfego externo.',`${cards([['Sistema de exemplo','Não conectado','Vínculo institucional NÃO implementado',true],['Outra integração','Indisponível','Histórico de comunicação ilustrativo',false]])}${status('wifi-off','Integração externa indisponível','Uma demonstração não representa conexão real.','warning')}`);
  case 'notices':return inner('Central de avisos','Mensagens com leitura e resolução distintas.',`${status('info','Novo aviso ilustrativo','Lido não significa resolvido.','info')}${status('clock','Pendente por categoria','Ação ainda não executada.','warning')}${sampleBtn('Marcar exemplo como lido','v2-btn','notice','bell')}`);
  case 'docs':return inner('Documentos por categoria','Prévia branca, sem quadriculado; impressão protegida do OMR fora desta tela.',`<div class="v2-grid"><div class="v2-panel">${icon('files')}<strong> Relatórios</strong><p>Categoria ilustrativa</p>${sampleBtn('Prévia local','v2-btn','docs','eye')}</div><div class="v2-panel"><h3>Prévia branca</h3><div class="v2-paper"><h4>DOCUMENTO DE EXEMPLO</h4><hr><p class="v2-small">Texto fictício. Sem registros, impressão, exportação ou folha óptica.</p></div></div></div>`);
  case 'settings':return inner('Configurações por finalidade','Seções descritivas; não lê nem altera preferências do usuário.',`<div class="v2-grid">${['Aparência','Acessibilidade','Comunicação','Privacidade'].map(s=>`<div class="v2-panel"><h3>${s}</h3><p>Exemplo de organização e densidade.</p></div>`).join('')}</div>`);
  case 'symbols':return inner('Ícones livres · alternativa A','Primeira alternativa aprovada, traço de referência de 1,5px.',`<div class="v2-icon-list">${groups[0][1].slice(0,6).map(([title,name])=>`<div class="v2-icon-item">${icon(name)}<strong>${title}</strong><small>${name}</small></div>`).join('')}</div><p class="v2-small">O catálogo principal contém exatamente 68 símbolos; todos com fundo transparente, legenda textual e toque no contêiner, não no desenho.</p>`);
  case 'secondary':return inner('Secundários premium discretos','Perfil, estados, loaders, vazios, restrições e PWA apenas quando suportada.',`<div class="v2-states">${status('user-round','Perfil de exemplo','Conta sintética, sem editar dados.','neutral')}${status('clock','Carregando','Nenhuma requisição em andamento.','info')}${status('lock','Acesso restrito','Autorização real permanece no servidor.','warning')}${status('info','Página não encontrada','Prévia 404 sem redirecionar.','neutral')}</div><div class="v2-demo-toolbar">${sampleBtn('Abrir data ilustrativa','v2-btn','date','calendar-days')}${sampleBtn('Simular modal','v2-btn','modal','maximize')}</div>`);
  default:return inner('Composição demonstrativa','Dados sintéticos, sem efeito sobre a plataforma.',meta);
  }
 }
 function preview(c){
  const menu=['Início','Diário','Calendário','Avaliações','Estatísticas','Avisos'];
  const active=['entry','login','home','institutions'].includes(c.kind)?'Início':
   ['diary','record','attendance','grades','checks','planning'].includes(c.kind)?'Diário':
   c.kind==='calendar'?'Calendário':
   ['scanner','generator'].includes(c.kind)?'Avaliações':
   c.kind==='stats'?'Estatísticas':'Avisos';
  return `<div class="v2-showcase is-entering"><div class="v2-preview-hint">DEMONSTRAÇÃO FICTÍCIA · COMPOSIÇÃO ${c.id} · ${c.choice} · Nenhuma funcionalidade implantada</div><div class="v2-shell"><aside class="v2-shell-side" aria-label="Navegação ilustrativa"><div class="v2-shell-logo"><b>S</b> SALTA</div><div class="v2-shell-menu">${menu.map((m,i)=>`<span ${m===active?'aria-current="page"':''}>${icon(['house','book-open','calendar-days','clipboard-list','chart-no-axes-column','megaphone'][i])}${m}</span>`).join('')}</div></aside><div class="v2-shell-main"><div class="v2-shell-top"><strong>${c.title}</strong><span>Ateliê V2 · prévia</span></div>${sampleBody(c.kind)}</div></div></div>`;
 }
 let chosen=decisions[0];
 function renderScreens(){
  const host=$('v2-screen-library');if(!host)return;
  host.innerHTML=`<div class="v2-section"><div class="v2-preview-controls"><label class="v2-field" for="v2-screen-choice"><span>Escolha uma das 22 composições aprovadas</span><select class="v2-select" id="v2-screen-choice">${decisions.map(c=>`<option value="${c.id}" ${c.id===chosen.id?'selected':''}>${c.id} · ${c.choice} · ${c.title}</option>`).join('')}</select></label><span class="v2-chip">${decisions.length}/22 decisões aprovadas</span></div><p class="v2-small">A, B e C são escolhas do proprietário, não notas nem disponibilidade. Toda interação é isolada e sintética. Use a seleção ou os atalhos de categoria.</p><div id="v2-preview-nav" class="v2-preview-nav" role="group" aria-label="Grupos de composições aprovadas">${[...new Set(decisions.map(c=>c.group))].map(group=>`<button type="button" data-v2-group="${group}" aria-pressed="${chosen.group===group}">${group}</button>`).join('')}</div><div class="v2-preview-title"><h3 class="v2-heading" id="v2-screen-title">${chosen.id} · ${chosen.title}</h3><span class="v2-chip">Alternativa ${chosen.choice} aprovada</span></div><p class="v2-small">Rota real ou candidata mapeada: ${chosen.route}. Não afirma disponibilidade produtiva.</p><div class="v2-preview" id="v2-screen-render">${preview(chosen)}</div><p class="v2-inline-status" id="v2-feedback" role="status" aria-live="polite">Prévia local ${chosen.id}. Sem dados reais.</p></div>`;
  $('v2-screen-choice').addEventListener('change',e=>{chosen=decisions.find(d=>d.id===e.target.value)||decisions[0];renderScreens()});
  host.querySelectorAll('[data-v2-group]').forEach(button=>button.addEventListener('click',()=>{
   chosen=decisions.find(d=>d.group===button.dataset.v2Group)||chosen;renderScreens();$('v2-screen-choice').focus();
  }));
 }
 function renderIcons(){
  const host=$('v2-icon-library');if(!host)return;
  host.innerHTML=`<div class="v2-section"><p class="v2-note">Decisão vinculante 15.21 A: ícones livres, sem círculos ou blocos decorativos; primeiro desenho aprovado para cada significado. Cada botão é uma escolha de inspeção, não de substituição.</p><div class="v2-icon-controls"><label for="v2-icon-search">Pesquisar significado ou identificador</label><input class="v2-input" id="v2-icon-search" type="search" placeholder="Ex.: frequência, download, bell" autocomplete="off"><label for="v2-icon-size">Tamanho</label><select id="v2-icon-size" class="v2-select" aria-label="Tamanho demonstrativo"><option>14</option><option>16</option><option selected>20</option><option>24</option><option>32</option><option>48</option></select></div><p class="v2-small">${total} símbolos aprovados · 12 módulos · 14 pedagógicos · 18 ações · 12 estados · 12 navegação · SVG local Lucide (ISC)</p><div id="v2-icon-groups" class="v2-icon-groups"></div><p id="v2-icon-selected" class="v2-symbol-selected" role="status" aria-live="polite">Escolha um símbolo para conferir nome, identificador, família e tamanho.</p></div>`;
  const draw=()=>{
   const term=$('v2-icon-search').value.trim().toLocaleLowerCase('pt-BR'),size=Number($('v2-icon-size').value);
   const root=$('v2-icon-groups');root.replaceChildren();
   let count=0;
   for(const [name,entries] of groups){
    const matches=entries.filter(([title,id])=>(title+' '+id).toLocaleLowerCase('pt-BR').includes(term));
    if(!matches.length)continue;count+=matches.length;
    const section=document.createElement('section');section.className='v2-icon-group';
    section.innerHTML=`<h3>${name} · ${matches.length}</h3><div class="v2-icon-list">${matches.map(([label,id])=>`<button type="button" class="v2-icon-item" aria-pressed="false" data-v2-icon="${id}" data-v2-label="${label}" data-v2-group-label="${name}" aria-label="Inspecionar ícone ${label}">${icon(id)}<strong>${label}</strong><small>${id}</small></button>`).join('')}</div>`;
    root.appendChild(section);
   }
   root.querySelectorAll('.v2-glyph').forEach(svg=>{svg.style.width=size+'px';svg.style.height=size+'px'});
   root.querySelectorAll('[data-v2-icon]').forEach(button=>button.addEventListener('click',()=>{
    root.querySelectorAll('[data-v2-icon]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    const display=$('v2-icon-selected');display.replaceChildren();
    display.append('Aprovado · '+button.dataset.v2Label+' · '+button.dataset.v2Icon+' · '+button.dataset.v2GroupLabel+' · '+size+'px. Primeira alternativa escolhida. ');
    const link=document.createElement('code');link.textContent='#v2-'+button.dataset.v2Icon;display.append(link);
   }));
   if(!count)root.innerHTML='<p class="v2-note" role="status">Nenhum símbolo corresponde à pesquisa. O catálogo completo continua disponível ao limpar o campo.</p>';
  };
  $('v2-icon-search').addEventListener('input',draw);
  $('v2-icon-size').addEventListener('change',draw);
  draw();
 }
 const colors=[
 ['Azul profundo','#17324D','Identidade, cabeçalho, texto'],
 ['Azul de interação','#166AA6','Ação, foco, seleção'],
 ['Âmbar pontual','#E7AA45','Destaque, texto escuro'],
 ['Branco gelo','#F5F8FB','Fundo da tela'],
 ['Prata','#BBC7D2','Apoio, não texto sobre branco'],
 ['Branco','#FFFFFF','Cartões sem quadriculado'],
 ['Sucesso','#287A53','Texto + ícone'],
 ['Informação','#166AA6','Texto + ícone'],
 ['Atenção','#946515','Texto + ícone'],
 ['Erro','#B34444','Texto + ícone'],
 ['Neutro','#516579','Texto + ícone']
 ];
 const hexLum=hex=>{const ch=hex.slice(1).match(/.{2}/g).map(v=>parseInt(v,16)/255);return ch.reduce((n,v,i)=>n+(v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4))*[.2126,.7152,.0722][i],0)};
 const ratio=(a,b)=>{const l=[hexLum(a),hexLum(b)].sort((x,y)=>y-x);return (l[0]+.05)/(l[1]+.05)};
 function renderDesign(){
  const host=$('v2-colors');if(!host)return;
  host.innerHTML=`<div class="v2-section"><hr class="v2-divider"><span class="v2-eyebrow">Decisões 1–7 · tokens</span><h3 class="v2-heading">Identidade aprovada, sem reinterpretar a marca</h3><div class="v2-tokens">${colors.map(([name,value,usage])=>`<div class="v2-token"><div class="v2-sample" style="background:${value}"></div><strong>${name}</strong><code>${value}</code><p class="v2-small">${usage}</p></div>`).join('')}</div><div class="v2-panel"><h3>Contraste AA medido</h3><div class="v2-states">${[['Texto profundo / branco','#17324D','#FFFFFF'],['Ação azul / branco','#166AA6','#FFFFFF'],['Texto sobre âmbar','#17324D','#E7AA45'],['Erro / branco','#B34444','#FFFFFF'],['Atenção / branco','#946515','#FFFFFF']].map(([name,a,b])=>{const r=ratio(a,b);return status(r>=4.5?'check-circle':'triangle-alert',name,`${r.toFixed(2).replace('.',',')}:1 · ${r>=4.5?'AA textual aprovado':'AA textual NÃO atingido'}`,r>=4.5?'success':'warning')}).join('')}</div></div><div class="v2-panel"><h3>Marca e favicon oficiais</h3><div class="v2-demo-toolbar"><img src="../favicon.svg" alt="Favicon S SALTA existente" width="48" height="48"><span><strong>S SALTA</strong><br><small>Favicon original do repositório. O quadriculado pertence apenas ao fundo da experiência; os componentes usam superfícies lisas.</small></span></div></div><div class="v2-grid"><div class="v2-panel"><h3>Tipografia</h3><p style="font-size:28px;font-weight:800;line-height:1.15">Inter variável local</p><p>Hierarquia de títulos, corpo e rótulos; fonte WOFF2 local e fallback de sistema, sem CDN.</p></div><div class="v2-panel"><h3>Geometria</h3><p>Cartões 14px · botões 11px · borda #D1DBE5 · sombra discreta · alvos gerais 44–48px.</p>${sampleBtn('Exemplo de ação','v2-btn v2-btn-primary','design','check-circle')}</div><div class="v2-panel"><h3>Rolagem e densidade</h3><p>Tabelas 27px de referência, leitura sem perder estudante. Scrollbar de referência 7–8px; rolagem móvel nativa.</p></div></div></div>`;
 }
 function renderComponents(){
  const host=$('v2-component-playground');if(!host)return;
  host.innerHTML=`<div class="v2-section"><hr class="v2-divider"><span class="v2-eyebrow">Decisões 9–14 · componentes</span><h3 class="v2-heading">Controles, estados e popups no mesmo laboratório</h3><p class="v2-description">Todos os exemplos são locais. “Servidor confirmado” é somente um estado fictício selecionável, nunca recibo de uma operação.</p><div class="v2-grid"><div class="v2-panel"><h3>Campos, busca e validação</h3><div class="v2-fields">${field('Pesquisar','v2-sample-search','Buscar exemplo')}<label class="v2-field"><span>Turma demonstrativa</span><select class="v2-select"><option>Selecione</option><option>Turma A (fictícia)</option></select></label><label class="v2-field"><span>Período</span><input class="v2-input" type="month" aria-label="Mês ilustrativo"></label><label class="v2-field"><span>Hora 24 h</span><input class="v2-input" type="time" aria-label="Hora ilustrativa"></label><label class="v2-field"><span>Intervalo · início</span><input class="v2-input" type="date" aria-label="Data inicial ilustrativa"></label><label class="v2-field"><span>Intervalo · fim</span><input class="v2-input" type="date" aria-label="Data final ilustrativa"></label><label class="v2-field"><span>Texto livre</span><textarea class="v2-textarea" placeholder="Texto fictício"></textarea></label></div><p class="v2-small">Seletores nativos de calendário/hora; futuro date picker específico somente quando suportado.</p></div><div class="v2-panel"><h3>Checkbox, rádio, switch e upload</h3><div class="v2-fields"><label class="v2-field"><span><input type="checkbox" id="v2-sample-check"> Selecionar exemplo</span></label><label class="v2-field"><span><input type="radio" name="v2-radio" checked> Opção A</span><span><input type="radio" name="v2-radio"> Opção B</span></label><label class="v2-field"><span><input type="checkbox" role="switch" id="v2-switch" aria-label="Ativar opção visual" aria-checked="false"> Switch: <span id="v2-switch-label">Desligado</span></span></label></div><label class="v2-file-area" for="v2-fake-upload">${icon('file-input')} Escolha apenas um arquivo de teste</label><input id="v2-fake-upload" class="v2-input" type="file" accept="text/plain,.txt" aria-describedby="v2-file-feedback"><p class="v2-small" id="v2-file-feedback">Nenhum arquivo será lido ou enviado; somente o nome será exibido.</p></div></div><div class="v2-panel"><h3>Estados do ciclo de dados — distintos</h3><div class="v2-icon-controls"><label for="v2-state-choice">Escolha um estado sintético</label><select class="v2-select" id="v2-state-choice"><option value="draft">Rascunho</option><option value="saving">Salvando</option><option value="local">Salvo localmente</option><option value="pending">Pendente de sincronização</option><option value="server">Servidor confirmou (exemplo)</option><option value="conflict">Conflito</option><option value="error">Falha</option><option value="offline">Sem conexão</option><option value="external">Integração externa indisponível</option></select></div><div id="v2-state-render" aria-live="polite"></div></div><div class="v2-panel"><h3>Componentes de ação</h3><div class="v2-demo-toolbar">${sampleBtn('Abrir confirmação','v2-btn v2-btn-primary','confirm','check-circle')}${sampleBtn('Edição em modal','v2-btn','edit','pencil')}${sampleBtn('Ficha extensa','v2-btn','details','files')}${sampleBtn('Mostrar toast','v2-btn','toast','info')}${sampleBtn('Data ilustrativa','v2-btn','date','calendar-days')}</div><details><summary>Accordion · mais detalhes (teclado e clique)</summary><p class="v2-small">Conteúdo ilustrativo em um elemento nativo de divulgação; não há consulta remota.</p></details><div class="v2-demo-toolbar"><span class="v2-chip" title="Tooltip: somente um exemplo. Use foco para alcançar os controles.">Tooltip demonstrativo</span><span class="v2-chip">${icon('chevron-right')} Página 1 de 3 · exemplo</span>${sampleBtn('2','v2-btn','pagination')}${sampleBtn('3','v2-btn','pagination')}</div><div id="v2-toast-target" aria-live="polite"></div></div><div class="v2-panel"><h3>Planilhas e distinções acadêmicas (visuais)</h3>${readOnlyTable('grades')}<div class="v2-demo-toolbar">${sampleBtn('Simular filtro','v2-btn','filter','list-filter')}${sampleBtn('Menu contextual','v2-btn','menu','ellipsis-vertical')}</div></div><div class="v2-panel"><h3>Offline e pendências</h3><div class="v2-states">${status('wifi-off','Sem conexão','A consulta externa ficaria indisponível.','warning')}${status('cloud-check','Confirmação de servidor','Exemplo ilustrativo; sem recibo.','success')}${status('git-compare-arrows','Conflito','Comparar versões e confirmar destino.','error')}${status('lock','Acesso protegido','Sem autorizações simuladas.','neutral')}${status('clock','Notificação lida','Ainda não foi resolvida.','info')}${status('info','Estado vazio','Nenhum dado de demonstração disponível.','neutral')}</div></div></div></div><div class="v2-modal-overlay" id="v2-modal-overlay" hidden aria-hidden="true"><div class="v2-modal" id="v2-modal" role="dialog" aria-modal="true" aria-labelledby="v2-modal-title" tabindex="-1"><h2 id="v2-modal-title">Confirmação ilustrativa</h2><p id="v2-modal-copy">Nenhuma informação será alterada.</p><div class="v2-modal-actions"><button type="button" class="v2-btn" id="v2-modal-cancel">Cancelar</button><button type="button" class="v2-btn v2-btn-primary" id="v2-modal-affirm">Simular retorno</button></div></div></div>`;
  const states={
   draft:['pencil','Rascunho','Edição local não confirmada.','neutral'],
   saving:['refresh-cw','Salvando · simulação','Aguardando resposta ilustrativa, sem transmissão.','info'],
   local:['save','Salvo localmente · exemplo','Não equivale à confirmação do servidor.','warning'],
   pending:['clock','Pendente · exemplo','Sincronização aguardando ação/conexão.','warning'],
   server:['cloud-check','Servidor confirmou · exemplo sintético','Nenhum recibo real foi criado.','success'],
   conflict:['git-compare-arrows','Conflito · exemplo','Comparação necessária; não sobrescrever silenciosamente.','error'],
   error:['circle-x','Falha · exemplo','Tentar novamente somente após revisar contexto.','error'],
   offline:['wifi-off','Sem conexão · exemplo','Ainda não sincronizado.','warning'],
   external:['arrow-left-right','Integração externa indisponível','CONNECT não foi acionado.','warning']
  };
  const renderState=()=>{const [glyph,title,description,tone]=states[$('v2-state-choice').value];$('v2-state-render').innerHTML=status(glyph,title,description,tone)};
  $('v2-state-choice').addEventListener('change',renderState);renderState();
  $('v2-switch').addEventListener('change',e=>{e.target.setAttribute('aria-checked',String(e.target.checked));$('v2-switch-label').textContent=e.target.checked?'Ligado':'Desligado'});
  $('v2-fake-upload').addEventListener('change',e=>{$('v2-file-feedback').textContent=e.target.files?.length?`Selecionado: ${e.target.files[0].name} · nada foi lido ou enviado.`:'Nenhum arquivo escolhido.';e.target.value=''});
  let previousFocus=null;
  const overlay=$('v2-modal-overlay'),modal=$('v2-modal');
  function closeModal(){
   overlay.hidden=true;overlay.setAttribute('aria-hidden','true');
   if(previousFocus?.isConnected)previousFocus.focus();
  }
  $('v2-modal-cancel').addEventListener('click',closeModal);
  $('v2-modal-affirm').addEventListener('click',()=>{closeModal();$('v2-toast-target').innerHTML=`<div class="v2-demo-toast" role="status">✓ Simulação concluída. Nenhum dado foi enviado ou salvo.</div>`});
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});
  overlay.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();closeModal();return}
   if(e.key!=='Tab')return;
   const f=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
   if(!f.length)return;
   const first=f[0],last=f[f.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
  window.__v2Modal={open:(kind,trigger)=>{
    previousFocus=trigger||document.activeElement;
    const title={confirm:'Confirmar ação ilustrativa',edit:'Editar exemplo',details:'Ficha extensa',date:'Selecionar data'}[kind]||'Exemplo';
    $('v2-modal-title').textContent=title;
    $('v2-modal-copy').textContent=kind==='date'?'A data escolhida é somente uma prévia. Nenhum calendário real é modificado.':kind==='edit'?'Painel fictício. Nenhum registro é gravado.':kind==='details'?'Ficha extensa ilustrativa e responsiva; nenhum estudante real.':'Esta ação apenas demonstra feedback visual; não altera dados.';
    modal.dataset.size=kind==='details'?'large':kind==='confirm'?'short':'normal';
    overlay.dataset.kind=kind;overlay.hidden=false;overlay.setAttribute('aria-hidden','false');modal.focus();
  }};
 }
 function renderMotion(){
  const host=$('v2-motion-tokens');if(!host)return;
  host.innerHTML=`<div class="v2-section"><hr class="v2-divider"><span class="v2-eyebrow">Decisão 12 · movimento adaptativo C</span><h3 class="v2-heading">Tempos aprovados e regras</h3><div class="v2-tokens">${[['Páginas','200ms · fade + 7px'],['Popup entrada','200ms · scale .96→1'],['Popup saída','150ms · referência'],['Botão','120–150ms · press .97'],['Card','180ms · lift 3px'],['Menu','220ms abrir / 150ms fechar'],['Calendário','200/180/150ms mês/semana/dia'],['Célula','80–100ms · foco imediato'],['Confirmação','300ms · check'],['Carregamento','Skeleton + spinner; progresso somente real']].map(([name,detail])=>`<div class="v2-token"><strong>${name}</strong><p class="v2-small">${detail}</p></div>`).join('')}</div><p class="v2-note">Nenhum efeito atrasa salvar, câmera, correção ou publicação. Com <code>prefers-reduced-motion: reduce</code> as animações novas cessam; a celebração de aprovação existente não foi alterada.</p></div>`;
 }
 const inventory={
  'Entrada e portal (produção/candidato)': ['index.html','preview-aluno.html','plataforma/index.html','plataforma/professor.html','plataforma/fechamento-bimestre.html'],
  'Diário, gestão e comunicação (produção/candidato)': ['plataforma/diario-teste.html','plataforma/mensagens.html','plataforma/estatistica.html','plataforma/estatistica-individual.html','plataforma/estatistica-turma.html','plataforma/estatistica-acessos.html','plataforma/eleicoes.html'],
  'Projetos, eventos e utilitários (produção/candidato)': ['mostra-cultural.html','solucionador.html','plataforma/festival-consciencia-negra.html','plataforma/festival-consciencia-negra-admin.html','plataforma/piloto-avaliacoes.html'],
  'Corretor e legado — protegido/não modificar':['plataforma/corretor-v2.html','corretor/index.html','corretor/folha-resposta.html','corretor/legado-eja.html'],
  'Laboratórios separados — não padronizar':['laboratorio/salta-omr-capture-lab/index.html','laboratorio/salta-omr-scan-safe-02/index.html','laboratorio/salta-scan/index.html'],
  'Ateliê — único alvo desta missão':['plataforma/atelie-salta.html'],
  'Estilos partilhados e de módulos — não modificar':['salta-theme.css','plataforma/professor-theme.css','plataforma/corretor-v2.css','plataforma/avaliacoes-biblioteca.css','plataforma/piloto-avaliacoes.css','plataforma/avaliacao-excluir-dialog.css','laboratorio/**/css/*.css'],
  'Componentes transversais observáveis por arquivos':['admin-shell, menu, cartões e atalhos','biblioteca/catálogo de avaliações','diálogo de exclusão','tabelas, filtros, estados e indicadores','frequência e notas, agenda/planejamento','date/time picker e inputs nativos','PDFs, documentos e impressão','modais nativos e personalizados','legado e rotas de protótipo']
 };
 function renderInventory(){
  const host=$('v2-inventory-container');if(!host)return;
  host.innerHTML=`<div class="v2-section"><hr class="v2-divider"><span class="v2-eyebrow">Cobertura da main · inventário estático</span><h3 class="v2-heading">Mapa das interfaces e componentes</h3><p class="v2-description">Base: main b8968b70b7ee…; 468 entradas de árvore Git sem truncamento, 25 arquivos HTML, 14 CSS. Categorias por caminho e trechos consultados: a classificação não comprova publicação, autenticação nem comportamento. Nenhuma tela desta lista foi modificada.</p><div class="v2-inventory">${Object.entries(inventory).map(([title,items])=>`<details><summary>${title} · ${items.length}</summary><ul>${items.map(item=>`<li><code>${item}</code></li>`).join('')}</ul></details>`).join('')}</div><p class="v2-note" data-tone="warning">Lacunas para auditoria futura: verificar rotas efetivamente ativas, estados JS montados dinamicamente, autorização, componentes de data/hora e vínculos entre módulos. D01–D36 permanecem funcionais e protegidos; este inventário não presume homologação.</p></div>`;
 }
 document.body.classList.add('v2-ready');
 renderDesign();renderIcons();renderComponents();renderScreens();renderMotion();renderInventory();
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-v2-action]');if(!button)return;
  const action=button.dataset.v2Action;
  if(['confirm','edit','details','date','modal'].includes(action)){window.__v2Modal?.open(action==='modal'?'confirm':action,button);return;}
  if(action==='toast'){$('v2-toast-target').innerHTML=`<div class="v2-demo-toast" role="status">ⓘ Exemplo de toast branco. Nada foi salvo.</div>`;return;}
  if(action==='fake-login'){const input=$('v2-login-user');if(input&&input.value){input.value='';}feedback('Autenticação não realizada. Este é apenas um exemplo visual.');return;}
  if(action==='pagination'){feedback('Paginação fictícia acionada; não há consulta de dados.');return;}
  if(action==='filter'||action==='menu'){feedback('Menu ou filtro ilustrativo, sem alteração da tabela.');return;}
  feedback('Demonstração “'+(button.textContent||'ação').trim()+'” acionada. Nenhum dado real foi lido, enviado ou salvo.');
 });
})();
