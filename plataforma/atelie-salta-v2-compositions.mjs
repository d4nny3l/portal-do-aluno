(function registerCompositions(){
 'use strict';
 const F=window.SALTA_ATELIE_02;if(!F||!F.mountCalendar||!F.mountMatrix)throw Error('DESIGN-SALTA-02 modules out of order');
 const {choices,sections,students,icon,esc,btn,lessons,dmy,referenceToday,mountCalendar,mountMatrix}=F;
 const host=document.getElementById('v2-screen-library');if(!host)return;
 const store=new Map();
 let current=choices.find(c=>c.id==='15.7');
 const get=kind=>{
  if(!store.has(kind))store.set(kind,{
   tab:({record:'Notas',diary:'Aula',planning:'Biblioteca',connect:'Prévia',settings:'Aparência'})[kind]||'Visão geral',
   institution:'Escola Exemplo A',className:'Turma A',
   selected:0,filter:'Todos',noticeRead:new Set(),localNotices:[],planStage:1,connectCompared:false,connectDestination:null,connectResolved:false,recordNotes:[],
   documentType:'Relatório de turma',documentFormat:'Resumo',
   connect:'Sistema A',project:0,previewInfo:'',
   modalType:null, showPassword:false, prefs:{compact:false,notices:true,highContrast:false}, planTitle:'',planSeries:'9º ano',planDuration:'50',planSkills:'',planContent:'',planMethod:'',planAssessment:'',
   mockClass:'Matemática',gabarito:'A–D',questionCount:10,chart:'Desempenho',
   state:'Rascunho',view:'Notas'
  });
  return store.get(kind);
 };
 const piece=(title,sub='',body='')=>`<section class="f2-surface"><h3>${title}</h3>${sub?`<p>${sub}</p>`:''}${body}</section>`;
 const status=(title,description)=>`<div class="f2-page-feedback" role="status">${title} · ${description}</div>`;
 const actions=items=>`<div class="f2-actions">${items.map(([label,action,more])=>btn(label,action,more||'')).join('')}</div>`;
 const table=(columns,rows)=>`<div class="f2-sheet-scroller" role="region" tabindex="0" aria-label="Tabela de dados apenas fictícios"><table class="f2-sheet"><thead><tr class="f2-sheet-group">${columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 const tabs=(names,key,value)=>`<div class="f2-segment" role="group" aria-label="${esc(key)}">${names.map(name=>`<button type="button" data-f2-tab-type="${key}" data-f2-tab="${esc(name)}" aria-pressed="${name===value}">${esc(name)}</button>`).join('')}</div>`;
 const classes=[['Turma A','Matemática','Manhã'],['Turma B','Matemática','Tarde'],['Turma C','Matemática EJA','Noite']];
 const fakeNotice=[{title:'Reunião pedagógica',category:'Institucional',body:'Exemplo de comunicado interno'}, {title:'Revisão de atividade',category:'Pedagógico',body:'Exemplo para testar leitura'}];
 const plans=[{name:'Frações no cotidiano',series:'9º ano',duration:'50',skills:'Habilidade a conferir',content:'Representações',method:'Problema contextualizado',assessment:'Exercícios observáveis'}, {name:'Geometria e áreas',series:'8º ano',duration:'100',skills:'Descritores a conferir',content:'Áreas',method:'Modelos e discussão',assessment:'Atividade diagnóstica'}];
 const projects=[{name:'Mostra Cultural A',stage:'Planejamento',group:'Grupo A',evaluator:'Avaliador fictício A',criteria:'Criatividade · Clareza',result:'Não lançado',published:'Não'}, {name:'Feira de Ciências B',stage:'Execução',group:'Grupo B',evaluator:'Avaliador fictício B',criteria:'Organização · Comunicação',result:'Em revisão (exemplo)',published:'Não'}, {name:'Seminário C',stage:'Conclusão',group:'Grupo C',evaluator:'Avaliador fictício C',criteria:'Apresentação · Registro',result:'Concluído (fictício)',published:'Exemplo local'}];
 const iconTile=(name,glyph,id,description)=>`<button type="button" class="f2-shortcut" data-f2-go="${id}">${icon(glyph)}<strong>${name}</strong><small>${description||'Abrir demonstração'}</small></button>`;
 const entry=(login=false)=>`<div class="f2-entry"><div class="f2-brand"><span class="f2-mark">S</span><span>SALTA</span></div>${login?
  `<h3>Acesso institucional · demonstração</h3><p>Campo ilustrativo: não insira credenciais reais. Não há autenticação neste Ateliê.</p><div class="f2-surface" style="max-width:480px"><div class="f2-fields"><label class="f2-field">Identificação ilustrativa<input class="f2-input" id="f2-login-id" placeholder="Usuário de exemplo" autocomplete="off"></label><label class="f2-field">Senha de demonstração<input class="f2-input" id="f2-login-secret" type="${get('login').showPassword?'text':'password'}" autocomplete="off" placeholder="Não use senha real"></label></div>${actions([['Alternar visualização','login-show'],['Validar apenas o formulário','login-submit','f2-primary']])}<p class="f2-context-note">Estado: ${get('login').state}. Nenhuma autenticação é executada.</p></div>`:
  `<h3>Uma plataforma, dois espaços protegidos</h3><p>Entrada premium e direta. Escolha um destino apenas para visualizar a proposta de interface.</p><div class="f2-shortcuts">${iconTile('Área do professor','book-open','15.3','Gestão pedagógica')}${iconTile('Portal do aluno','graduation-cap','15.15','Informações próprias')}</div><div class="f2-surface"><p>Ambiente de demonstração. O login oficial permanece intacto.</p>${btn('Ver login ilustrativo','go-login')}</div>`
 }</div>`;
 const home=()=>`<h4>Ferramentas prioritárias</h4><div class="f2-shortcuts" id="f2-home-shortcuts">${iconTile('Diário','book-open','15.4')}${iconTile('Calendário','calendar-days','15.7')}${iconTile('Avaliações','clipboard-list','15.12')}${iconTile('Avisos','megaphone','15.18')}</div>${piece('Agenda secundária','Data de referência de exemplo: 27/11/2026.',`<div id="f2-home-agenda"></div>`)}<div class="f2-kpis">${[['Turmas fictícias','03'],['Avisos de exemplo','02'],['Dados reais','Nenhum']].map(([name,n])=>`<div class="f2-kpi"><small>${name}</small><strong>${n}</strong></div>`).join('')}</div>`;
 const context=(s)=>`<div class="f2-fields"><label class="f2-field">Instituição demonstrativa<select class="f2-select" data-f2-context="institution"><option ${s.institution==='Escola Exemplo A'?'selected':''}>Escola Exemplo A</option><option ${s.institution==='Escola Exemplo B'?'selected':''}>Escola Exemplo B</option></select></label><label class="f2-field">Turma<select class="f2-select" data-f2-context="className">${classes.map(([name])=>`<option ${s.className===name?'selected':''}>${name}</option>`).join('')}</select></label></div>`;
 const diary=s=>`${context(s)}${tabs(['Aula','Notas','Acompanhamento','Planejamento'],'diary',s.tab)}<div class="f2-surface">${s.tab==='Aula'?`${piece('Aula · rascunho revisável','Não grava frequência ao abrir.',actions([['Abrir calendário','go-calendar'],['Abrir chamada','go-attendance'],['Ver planejamento','go-planning']]))}`:s.tab==='Notas'?`<div id="f2-diary-grade-preview"></div>`:s.tab==='Acompanhamento'?`${piece('Acompanhamento', 'Estado fictício separado de notas e chamada.',actions([['Ver ficha acadêmica','go-record'],['Consultar vistos','go-checks']]))}`:`${piece('Planejamento de exemplo','Planejado e ministrado são estados distintos.',actions([['Abrir biblioteca','go-planning']]))}`}</div>`;
 const institutions=s=>`<div class="f2-grid">${['Escola Exemplo A','Escola Exemplo B'].map(name=>`<button class="f2-shortcut" type="button" data-f2-school="${name}" aria-pressed="${s.institution===name}">${icon('school')}<strong>${name}</strong><small>Instituição sintética</small></button>`).join('')}</div>${piece('Turmas do grupo selecionado',s.institution,`<div class="f2-shortcuts">${classes.map(([name,subject,turn])=>`<button type="button" class="f2-shortcut" data-f2-class="${name}" aria-pressed="${s.className===name}">${icon('users')}<strong>${name}</strong><small>${subject} · ${turn}</small></button>`).join('')}</div><p class="f2-context-note">Turma selecionada: ${s.className}; nenhuma vinculação real.</p>`)}`;
 const record=s=>{
  const labels=['Notas','Frequência','Vistos','Observações','Habilidades','Avisos','Cadastro'];
  const body={
   'Notas':`<div id="f2-record-matrix"></div>`,
   'Frequência':`<div id="f2-record-matrix"></div>`,
   'Vistos':`<div id="f2-record-matrix"></div>`,
   'Observações':piece('Observações ilustrativas','Sem registros sensíveis ou estudantes reais.',`<label class="f2-field">Anotação apenas sintética<textarea class="f2-textarea" id="f2-record-note" placeholder="Ex.: acompanhamento de aprendizagem"></textarea></label>${actions([['Adicionar observação local','record-add','f2-primary']])}<div class="f2-grid">${s.recordNotes.map((note,i)=>`<div class="f2-page-feedback">${i+1}. ${esc(note)}</div>`).join('')}</div>`),
   'Habilidades':piece('Habilidades e descritores','A associação curricular depende de referência validada.',table(['Habilidade','Situação'],[['A conferir','Não homologada'],['Objetivo de aula','Planejado']])),
   'Avisos':piece('Avisos da ficha', 'Não encaminhados ao estudante.',actions([['Ver central','go-notices']])),
   'Cadastro':piece('Cadastro fictício', 'Somente dados da amostra.',table(['Campo','Exemplo'],[['Código sintético','0000001'],['Turma',s.className],['Instituição',s.institution]]))
  }[s.tab]||'';
  return `${context(s)}<div class="f2-kpis">${[['Estudante','01'],['Vistos (amostra)','8'],['Notas','Sem cálculo']].map(([label,v])=>`<div class="f2-kpi"><small>${label}</small><strong>${v}</strong></div>`).join('')}</div>${tabs(labels,'record',s.tab)}${body}`;
 };
 const planning=function newPlanning(s){
 const stageNames=['Contexto','Exploração','Avaliação'];
 const stageDescription=['Definir objetivo e material da aula fictícia.','Organizar exploração e registros de exemplo.','Selecionar evidência observável a revisar com professor.'];
 const library=`<div class="f2-grid">${plans.map((p,i)=>piece(p.name,`${p.series} · ${p.duration} min`,btn('Usar no editor','plan-use-'+i))).join('')}</div>`;
 const seq=piece('Sequência de aprendizagem','Etapas planejadas não significam aulas ministradas.',
 `<div class="f2-shortcuts">${stageNames.map((n,i)=>`<button type="button" class="f2-shortcut" data-f2-plan-stage="${i+1}" aria-pressed="${s.planStage===i+1}">${icon('layers')}<strong>${i+1}. ${n}</strong><small>Etapa ${i+1}</small></button>`).join('')}</div><div class="f2-page-feedback" role="status">Etapa ${s.planStage} · ${stageDescription[s.planStage-1]}</div>`);
 const editor=`<div class="f2-fields">${[['Título','planTitle'],['Série/ano','planSeries'],['Duração (min)','planDuration'],['Habilidades (revisão humana)','planSkills'],['Conteúdos','planContent'],['Metodologia','planMethod'],['Avaliação','planAssessment']].map(([label,key])=>`<label class="f2-field">${label}<input class="f2-input" data-f2-plan="${key}" value="${esc(s[key])}" placeholder="${label}"></label>`).join('')}</div>${actions([['Revisar campos','plan-review','f2-primary'],['Limpar editor','plan-clear']])}<div class="f2-page-feedback" id="f2-plan-feedback">Rascunho de planejamento, sem gravação.</div>`;
 return `${tabs(['Biblioteca','Sequência','Editor'],'planning',s.tab)}${s.tab==='Biblioteca'?library:s.tab==='Sequência'?seq:editor}`;
};
  const scanner=function newScanner(s){
 const assessments=[{name:'Avaliação Exemplo A',status:'Rascunho'},{name:'Avaliação Exemplo B',status:'Revisão'}];
 const visible=assessments.map((item,i)=>({...item,i})).filter(item=>s.filter==='Todos'||item.status===s.filter);
 return piece('Central do Corretor · protegida','A demonstração não abre câmera, Magic Scan, leitura óptica nem overlay.',
 `<div class="f2-fields"><label class="f2-field">Filtrar avaliação sintética<select class="f2-select" data-f2-scan-filter>${['Todos','Rascunho','Revisão'].map(x=>`<option ${s.filter===x?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="f2-grid">${visible.map(item=>`<button type="button" class="f2-shortcut" data-f2-scan="${item.i}" aria-pressed="${s.selected===item.i}">${icon('clipboard-list')}<strong>${item.name}</strong><small>${item.status} · turma fictícia</small></button>`).join('')}</div><p class="f2-context-note">Selecionada: ${assessments[s.selected].name} · ${assessments[s.selected].status}. ${visible.length} avaliação(ões) no filtro. Nenhum dado OMR acessado.</p>`);
};
  const generator=s=>`<div class="f2-grid"><div class="f2-surface"><h3>Configuração</h3><div class="f2-fields"><label class="f2-field">Alternativas<select class="f2-select" data-f2-gen="gabarito">${['A–D','A–E'].map(v=>`<option ${s.gabarito===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="f2-field">Quantidade de questões<input class="f2-input" type="number" min="1" max="100" data-f2-gen="questionCount" value="${s.questionCount}"></label><label class="f2-field">Turma<select class="f2-select" data-f2-gen="className">${classes.map(x=>`<option ${s.className===x[0]?'selected':''}>${x[0]}</option>`).join('')}</select></label></div>${btn('Atualizar prévia não óptica','gen-preview','f2-primary')}</div><div class="f2-surface"><h3>Prévia ilustrativa NÃO óptica</h3><div class="f2-doc-preview" id="f2-gen-preview"><h4>AVALIAÇÃO · ${esc(s.className)}</h4><p>${s.questionCount} questões · ${esc(s.gabarito)}</p><hr><p>Sem bolhas, marcadores, posições geométricas, papel óptico ou PDF.</p></div></div></div>`;
 const stats=s=>{
  const values=s.chart==='Frequência'?[20,7,3]:[12,11,7],names=s.chart==='Frequência'?['Presentes','Faltas','Sem registro']:['Em revisão','Concluídas','Pendentes'];
  return `${tabs(['Desempenho','Frequência'],'chart',s.chart)}<div class="f2-kpis">${[['População sintética','30'],['Origem','Fixture local'],['Recorte','Turma A']].map(([n,v])=>`<div class="f2-kpi"><small>${n}</small><strong>${v}</strong></div>`).join('')}</div><div class="f2-chart" role="img" aria-label="Gráfico com ${names.map((n,i)=>n+' '+values[i]).join(', ')}">${values.map((v,i)=>`<div><b style="height:${v*6}px"></b><span>${names[i]}<br><strong>${v}</strong></span></div>`).join('')}</div>${table(['Indicador','Quantidade','Denominador'],names.map((n,i)=>[n,String(values[i]),'30 (ficção)']))}<p class="f2-context-note">Ilustração numérica; nenhuma fórmula de nota foi executada.</p>`;
 };
 const student=s=>`${piece('Resumo do estudante · acesso sintético','Demonstração de informação própria, não consulta ninguém.',`<div class="f2-kpis">${[['Turma','A'],['Avisos','02'],['Notas','A consultar']].map(([n,v])=>`<div class="f2-kpi"><small>${n}</small><strong>${v}</strong></div>`).join('')}</div>`)}<div class="f2-shortcuts">${iconTile('Minhas avaliações','clipboard-list','15.12')}${iconTile('Avisos','megaphone','15.18')}${iconTile('Meu calendário','calendar-days','15.7')}</div>`;
 const projectsView=s=>`<div class="f2-grid">${['Planejamento','Execução','Conclusão'].map(stage=>`<div class="f2-surface"><h3>${stage}</h3>${projects.filter(p=>p.stage===stage).map(p=>`<button class="f2-shortcut" type="button" data-f2-project="${projects.indexOf(p)}" aria-pressed="${s.project===projects.indexOf(p)}">${icon('folder-open')}<strong>${p.name}</strong><small>${p.group}</small></button>`).join('')}</div>`).join('')}</div>${piece('Ficha do projeto selecionado',projects[s.project].name,table(['Atributo','Exemplo'],[['Grupo',projects[s.project].group],['Avaliador',projects[s.project].evaluator],['Critérios',projects[s.project].criteria],['Resultado',projects[s.project].result],['Publicação',projects[s.project].published]]))}`;
 const connect=function newConnect(s){
 const systems=['Sistema A','Sistema B','Sistema C'];
 const tiles=piece('CONNECT por sistema','Nenhum vínculo institucional ou integração é realizado.',`<div class="f2-grid">${systems.map(n=>`<button type="button" class="f2-shortcut" data-f2-connect="${n}" aria-pressed="${s.connect===n}">${icon('arrow-left-right')}<strong>${n}</strong><small>Não conectado</small></button>`).join('')}</div>`);
 let body='';
 if(s.tab==='Conflitos'){
  body=`<div class="f2-grid">${piece('Versão de origem','Registro meramente ilustrativo.',table(['Campo','Valor'],[['Turma','Turma A'],['Aula','02/11 · fictícia'],['Status','Rascunho']]))}${piece('Versão de destino','Registro meramente ilustrativo.',table(['Campo','Valor'],[['Turma','Turma A'],['Aula','02/11 · fictícia'],['Status','Em revisão']]))}</div>${actions([['Comparar versões','connect-compare']])}${s.connectCompared?`<div class="f2-surface"><h4>Diferenças detectadas no exemplo</h4><p>Origem: rascunho; destino: em revisão. Nenhuma substituição foi executada.</p><div class="f2-choice-list"><label><input type="radio" name="f2-connect-dest" value="origem" ${s.connectDestination==='origem'?'checked':''}> Manter origem (ilustrativo)</label><label><input type="radio" name="f2-connect-dest" value="destino" ${s.connectDestination==='destino'?'checked':''}> Manter destino (ilustrativo)</label></div>${btn('Simular decisão local','connect-resolve','f2-primary')}<p class="f2-context-note" role="status">${s.connectResolved?`Escolha local: ${s.connectDestination==='origem'?'origem':'destino'}. Nenhum registro ou servidor alterado.`:'Destino ainda não confirmado.'}</p></div>`:''}`;
 }else if(s.tab==='Histórico'){
  body=table(['Data de exemplo','Situação','Efeito'],[['27/11/2026','Desconectado','Nenhum'],['26/11/2026','Sem envio','Nenhum']]);
 }else{
  body=`${status('Não conectado','Não é uma integração real.')}<div class="f2-surface"><h4>Prévia de mensagem</h4><p>${s.connect}: o vínculo externo exige autorização institucional. Esta amostra não transmite dados.</p></div>`;
 }
 return `${tiles}${tabs(['Prévia','Histórico','Conflitos'],'connect',s.tab)}${piece(s.connect+' · '+s.tab,'Apenas comparação visual local.',body)}`;
};
  const notices=s=>{
  const source=[...fakeNotice,...s.localNotices],visible=source.filter((n,i)=>s.filter==='Todos'||(s.filter==='Não lidos'&&!s.noticeRead.has(i))||(s.filter==='Lidos'&&s.noticeRead.has(i)));
  return `<div class="f2-fields"><label class="f2-field">Filtrar avisos<select class="f2-select" id="f2-notice-filter">${['Todos','Não lidos','Lidos'].map(n=>`<option ${s.filter===n?'selected':''}>${n}</option>`).join('')}</select></label></div><div class="f2-grid">${visible.map(n=>{const i=source.indexOf(n);return piece(n.title,`${n.category} · ${s.noticeRead.has(i)?'Lido, não resolvido':'Não lido'}`,`<p>${esc(n.body)}</p>${btn(s.noticeRead.has(i)?'Marcar como não lido':'Marcar como lido','notice-'+i)}`)}).join('')||status('Nenhum aviso','O filtro escolhido não possui correspondências.')}</div>${piece('Novo aviso local','Sem enviar para estudantes.',`<div class="f2-fields"><label class="f2-field">Título<input class="f2-input" id="f2-notice-title" maxlength="70" placeholder="Assunto de exemplo"></label><label class="f2-field">Texto<input class="f2-input" id="f2-notice-body" maxlength="130" placeholder="Mensagem de exemplo"></label></div>${btn('Adicionar aviso à demonstração','notice-new','f2-primary')}`)}`;
 };
 const docs=s=>`<div class="f2-grid">${piece('Categorias e formato','A prévia altera seu cabeçalho e informações em tempo real.',`<div class="f2-fields"><label class="f2-field">Categoria<select class="f2-select" data-f2-doc="documentType">${['Relatório de turma','Comunicado','Declaração'].map(v=>`<option ${s.documentType===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="f2-field">Formato<select class="f2-select" data-f2-doc="documentFormat">${['Resumo','Detalhado'].map(v=>`<option ${s.documentFormat===v?'selected':''}>${v}</option>`).join('')}</select></label></div>`)}${piece('Página branca · sem folha óptica','Somente documento comum.',`<div class="f2-doc-preview" id="f2-doc-preview"><h4>${esc(s.documentType.toUpperCase())}</h4><hr><p>${esc(s.documentFormat)} · Escola Exemplo · Turma A</p><p>Conteúdo ilustrativo. Sem nomes, assinatura, dados reais ou impressão óptica.</p></div>`)}</div>`;
 const settings=s=>`${tabs(['Aparência','Acessibilidade','Comunicação','Privacidade'],'settings',s.tab)}${piece(s.tab,'Mudanças afetam apenas a prévia da plataforma.',`<div class="f2-control-demo"><label><input type="checkbox" data-f2-setting="compact" ${s.prefs.compact?'checked':''}> Densidade de exemplo compacta</label><label><input type="checkbox" data-f2-setting="notices" ${s.prefs.notices?'checked':''}> Avisos ilustrativos visíveis</label><label><input type="checkbox" data-f2-setting="highContrast" ${s.prefs.highContrast?'checked':''}> Foco reforçado (prévia)</label></div><p class="f2-context-note">Compacto: ${s.prefs.compact?'sim':'não'} · Avisos: ${s.prefs.notices?'sim':'não'} · Foco: ${s.prefs.highContrast?'sim':'não'}</p>`)}`;
 const symbols=s=>`${piece('Biblioteca de 68 símbolos aprovados','A opção A permanece preservada; nenhum pictograma novo é adicionado.',`${actions([['Abrir catálogo completo','open-symbols','f2-primary'],['Comparar favicons','open-favicons']])}<p>Catálogo nas cinco famílias originais, busca, dimensões e rótulos acessíveis.</p>`)}`;
 const secondary=s=>`${piece('Componentes secundários','Acesso restrito, 404, estados e controles estão ilustrados com ações.',`<div class="f2-grid">${status('Perfil fictício','Não exibe dados reais')}${status('404','Rota de demonstração inexistente')}${status('Restrito','Autorizações não são simuladas')}</div>${actions([['Abrir date picker','secondary-picker'],['Abrir painel de componentes','open-components'],['Notificações','secondary-notifications']])}<div class="f2-page-feedback" id="f2-secondary-feedback">Nenhuma notificação foi aberta.</div><div id="f2-secondary-datepicker"></div><p class="f2-context-note">Rodapé discreto · Ateliê SALTA · Prévia local · PWA oficial não alterada.</p>`)}`;
 const bodyByKind=(kind,s)=>({
  entry:()=>entry(),
  login:()=>entry(true),
  home:()=>home(),
  diary:()=>diary(s),
  institutions:()=>institutions(s),
  record:()=>record(s),
  calendar:()=>`<div id="f2-calendar-slot"></div>`,
  attendance:()=>`<div id="f2-matrix-slot"></div>`,
  grades:()=>`<div id="f2-matrix-slot"></div>`,
  checks:()=>`<div id="f2-matrix-slot"></div>`,
  planning:()=>planning(s),
  scanner:()=>scanner(s),
  generator:()=>generator(s),
  stats:()=>stats(s),
  student:()=>student(s),
  projects:()=>projectsView(s),
  connect:()=>connect(s),
  notices:()=>notices(s),
  docs:()=>docs(s),
  settings:()=>settings(s),
  symbols:()=>symbols(s),
  secondary:()=>secondary(s)
 }[kind]||(()=>status('Lacuna','Sem demonstração homologada')))();
 const navigation=['15.3','15.4','15.7','15.9','15.10','15.18'].map(id=>choices.find(c=>c.id===id));
 function shell(c,content){
  const free=c.kind==='entry'||c.kind==='login';
  if(free)return `<div class="v2-shell f2-shell f2-entry-shell">${content}</div>`;
  return `<div class="v2-shell f2-shell"><nav class="f2-shell-nav" aria-label="Navegação ilustrativa SALTA"><div class="f2-shell-logo"><span class="f2-mark" style="width:31px;height:31px;font-size:20px">S</span><span class="f2-nav-label">SALTA</span></div>${navigation.map(n=>`<button type="button" data-f2-go="${n.id}" aria-current="${current.id===n.id?'page':'false'}">${icon(({home:'house',diary:'book-open',calendar:'calendar-days',grades:'calculator',checks:'list-checks',notices:'megaphone'})[n.kind]||'house')}<span class="f2-nav-label">${n.title}</span></button>`).join('')}</nav><div class="f2-shell-main"><header class="f2-shell-bar"><h3>${esc(c.title)}</h3><span>Ateliê · ${c.id} ${c.option}</span></header><div class="f2-shell-content">${content}</div></div></div>`;
 }
 function draw(){
  const c=current,s=get(c.kind),group=sections.find(arr=>arr.slice(1).includes(c.id))?.[0]||'Outros';
  host.innerHTML=`<section class="f2-app" id="f2-compositions"><header class="f2-screen-header"><h3>22 composições homologáveis · interação real da prévia</h3><span class="f2-chip">22/22 escolhas A/B/C · somente local</span></header><div class="f2-fields"><label class="f2-field" for="v2-screen-choice">Composição a experimentar<select id="v2-screen-choice" class="f2-select">${choices.map(o=>`<option value="${o.id}" ${o.id===c.id?'selected':''}>${o.id} · ${o.option} · ${o.title}</option>`).join('')}</select></label></div><div class="f2-quick-nav" role="group" aria-label="Acesso rápido às áreas prioritárias">${[['Calendário','15.7'],['Chamada','15.8'],['Notas','15.9'],['Vistos','15.10']].map(([label,id])=>btn(label,'goto-'+id,id===c.id?'f2-selected':'')).join('')}</div><div class="f2-quick-nav" role="group" aria-label="Categorias">${sections.map(arr=>btn(arr[0],'group-'+arr[1],arr[0]===group?'f2-selected':'f2-small')).join('')}</div><div class="f2-screen-header"><h3 id="v2-screen-title">${c.id} · ${esc(c.title)}</h3><span class="f2-chip">Alternativa ${c.option} aprovada</span></div><div class="v2-preview" id="v2-screen-render"><div class="v2-preview-hint">DEMONSTRAÇÃO FICTÍCIA · proposta visual, não tela oficial</div>${shell(c,bodyByKind(c.kind,s))}</div><p class="f2-page-feedback" id="v2-feedback" role="status" aria-live="polite">${esc(s.previewInfo||'Selecione e experimente. Não há conexão com serviços.')}</p></section>`;
  if(c.kind==='calendar')mountCalendar(host.querySelector('#f2-calendar-slot'),{onAction:msg=>{s.previewInfo=msg;feedback(msg)}});
  if(['attendance','grades','checks'].includes(c.kind))F.mountMatrix(host.querySelector('#f2-matrix-slot'),c.kind);
  if(c.kind==='home'){const agenda=host.querySelector('#f2-home-agenda');agenda.innerHTML=F.dayCard(referenceToday);}
  if(c.kind==='diary'&&s.tab==='Notas')F.mountMatrix(host.querySelector('#f2-diary-grade-preview'),'grades',{compact:true});
  if(c.kind==='record'&&['Notas','Frequência','Vistos'].includes(s.tab))F.mountMatrix(host.querySelector('#f2-record-matrix'),s.tab==='Notas'?'grades':s.tab==='Frequência'?'attendance':'checks',{compact:true});
 }
 const feedback=text=>{const e=host.querySelector('#v2-feedback');if(e)e.textContent=text;get(current.kind).previewInfo=text};
 function navigate(id){
  const next=choices.find(c=>c.id===id);if(!next)return;
  current=next;draw();host.querySelector('#v2-screen-choice')?.focus({preventScroll:true});
 }
 host.addEventListener('change',e=>{
  const t=e.target,s=get(current.kind);
  if(t.id==='v2-screen-choice'){navigate(t.value);return}
  if(t.dataset.f2Context){s[t.dataset.f2Context]=t.value;draw();return}
  if(t.dataset.f2Doc){s[t.dataset.f2Doc]=t.value;draw();return}
  if(t.dataset.f2Gen){s[t.dataset.f2Gen]=t.type==='number'?Math.max(1,Math.min(100,Number(t.value)||1)):t.value;draw();return}
  if(t.dataset.f2Setting){s.prefs[t.dataset.f2Setting]=t.checked;draw();return}
  if(t.dataset.f2Plan){s[t.dataset.f2Plan]=t.value;return}
  if(t.id==='f2-notice-filter'){s.filter=t.value;draw();return}
  if(t.dataset.f2ScanFilter){s.filter=t.value;s.selected=t.value==='Revisão'?1:0;draw();return}
  if(t.name==='f2-connect-dest'){s.connectDestination=t.value;s.connectResolved=false;draw();return;}
 });
 host.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!host.contains(b))return;const s=get(current.kind);
  if(b.dataset.f2Go){navigate(b.dataset.f2Go);return;}
  if(b.dataset.f2School){s.institution=b.dataset.f2School;draw();return;}
  if(b.dataset.f2Class){s.className=b.dataset.f2Class;draw();return;}
  if(b.dataset.f2PlanStage){s.planStage=Number(b.dataset.f2PlanStage);draw();return;}
  if(b.dataset.f2Project){s.project=Number(b.dataset.f2Project);draw();return;}
  if(b.dataset.f2Connect){s.connect=b.dataset.f2Connect;draw();return;}
  if(b.dataset.f2Scan){s.selected=Number(b.dataset.f2Scan);draw();return;}
  if(b.dataset.f2TabType){if(b.dataset.f2TabType==='chart')s.chart=b.dataset.f2Tab;else s.tab=b.dataset.f2Tab;draw();return;}
  const action=b.dataset.f2Action;if(!action)return;
  if(action.startsWith('goto-')){navigate(action.slice(5));return;}
  if(action.startsWith('group-')){navigate(action.slice(6));return;}
  if(action==='go-login'){navigate('15.2');return;}
  const mapped={'go-calendar':'15.7','go-attendance':'15.8','go-planning':'15.11','go-record':'15.6','go-checks':'15.10','go-notices':'15.18'};
  if(action in mapped){navigate(mapped[action]);return;}
  if(action==='login-show'){s.showPassword=!s.showPassword;const input=host.querySelector('#f2-login-secret');if(input)input.type=s.showPassword?'text':'password';feedback('Modo de exibição do campo alterado; não use senha real.');return;}
  if(action==='login-submit'){
   const identifier=host.querySelector('#f2-login-id')?.value.trim()||'';
   s.state=identifier?'Identificação fictícia digitada. Acesso NÃO executado.':'Identificação ilustrativa ausente.';
   feedback(s.state);return;
  }
  if(action==='record-add'){const note=host.querySelector('#f2-record-note')?.value.trim()||'';if(note.length<3){feedback('Informe ao menos três caracteres para a anotação fictícia.');return;}s.recordNotes.push(note);draw();feedback('Observação incluída somente na ficha sintética.');return;}
  if(action.startsWith('plan-use-')){const p=plans[Number(action.slice(-1))];Object.assign(s,{tab:'Editor',planTitle:p.name,planSeries:p.series,planDuration:p.duration,planSkills:p.skills,planContent:p.content,planMethod:p.method,planAssessment:p.assessment});draw();return;}
  if(action==='plan-clear'){Object.assign(s,{planTitle:'',planSkills:'',planContent:'',planMethod:'',planAssessment:''});draw();return;}
  if(action==='plan-review'){const empty=['planTitle','planSeries','planDuration','planSkills','planContent','planMethod','planAssessment'].filter(k=>!s[k]?.trim());host.querySelector('#f2-plan-feedback').textContent=empty.length?'Campos ausentes: '+empty.join(', ')+'. Revisão humana obrigatória.':'Prévia local completa; nenhum planejamento foi publicado ou enviado.';return;}
  if(action==='gen-preview'){const count=Number(s.questionCount);if(!Number.isInteger(count)||count<1||count>100){feedback('Quantidade de exemplo precisa estar entre 1 e 100.');return;}draw();feedback('Prévia não óptica atualizada para '+count+' questões.');return;}
  if(action.startsWith('notice-')&&action!=='notice-new'){const i=Number(action.slice(7));s.noticeRead.has(i)?s.noticeRead.delete(i):s.noticeRead.add(i);draw();return;}
  if(action==='notice-new'){const title=host.querySelector('#f2-notice-title')?.value.trim(),body=host.querySelector('#f2-notice-body')?.value.trim();if(!title||!body){feedback('Preencha título e texto fictícios.');return;}s.localNotices.push({title:esc(title),body:esc(body),category:'Rascunho local'});s.filter='Todos';draw();return;}
  if(action==='connect-compare'){s.connectCompared=true;s.connectResolved=false;draw();return;}
  if(action==='connect-resolve'){if(!s.connectDestination){feedback('Selecione origem ou destino fictício antes de decidir.');return;}s.connectResolved=true;draw();return;}
  if(action==='open-symbols'){document.getElementById('tab-simbolos')?.click();document.getElementById('v2-icon-search')?.focus();return;}
  if(action==='open-favicons'){document.getElementById('tab-cores')?.click();document.getElementById('f2-favicon-gallery')?.scrollIntoView({block:'start'});return;}
  if(action==='open-components'){document.getElementById('tab-componentes')?.click();return;}
  if(action==='secondary-notifications'){const output=host.querySelector('#f2-secondary-feedback');output.textContent=output.textContent.includes('Nenhuma')?'Notificações fictícias: 2 avisos, 1 não lido.':'Nenhuma notificação foi aberta.';return;}
  if(action==='secondary-picker'){
   F.mountPicker(host.querySelector('#f2-secondary-datepicker'),{value:referenceToday,onConfirm:date=>{feedback('Data sintética confirmada: '+(date?dmy(date):'vazia'));host.querySelector('#f2-secondary-datepicker').replaceChildren();},onCancel:()=>{host.querySelector('#f2-secondary-datepicker').replaceChildren();feedback('Seletor cancelado sem mudar estado.')}});
   return;
  }
 });
 draw();
 Object.assign(F,{navigatePreview:navigate});
})();
