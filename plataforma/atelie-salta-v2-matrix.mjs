(function registerMatrix(){
 'use strict';
 const F=window.SALTA_ATELIE_02;if(!F)throw Error('Missing fixtures');
 const {students,esc,btn,icon,makeAttendance,makeChecks,sampleGrades,referenceToday,dmy}=F;
 const defs={
  attendance:{name:'Chamada',columns:['Aula 1 · 07:30','Aula 2 · 08:20'],group:['Presenças do dia',2]},
  grades:{name:'Notas',columns:['Avaliação A','Avaliação B','Recuperação','Resultado'],group:['Originais',2,'Recuperação e resultado',2]},
  checks:{name:'Vistos',columns:['Frações','Expressões','Geometria','Revisão','Estatística','Problemas','Leitura','Recuperação'],group:['Atividades da turma',8]}
 };
 function mountMatrix(host,kind,{compact=false,onSignal=()=>{},context={}}={}){
  if(!host||!defs[kind])return null;
  const base=defs[kind],attendance=makeAttendance(),checks=makeChecks(),grades=sampleGrades.map(g=>({id:g.id,original:[...g.original],recovery:g.recovery,partial:g.partial}));
  const state={kind,attendance,checks,grades,active:null,popup:null,selectedActivity:null,tab:'matrix',date:referenceToday,feedback:'Nenhum dado real foi modificado.',query:'',mode:compact?'short':'full',confirmedSaves:0};
  checks.reasons=students.map(()=>Array.from({length:checks.activities.length},()=>''));
  const schoolName=String(context.institution||'Escola Exemplo A').replace(/[<>]/g,'');
  const groupName=String(context.className||'Turma A').replace(/[<>]/g,'');
  const maxes=[10,8,10,null],weights=['Peso visual 2','Peso visual 3','Recuperação','Sem fórmula'];
  const columnCount=kind==='attendance'?2:kind==='grades'?4:8;
  const gradeMask=F.gradeMask;
  if(kind==='grades'&&!gradeMask)throw Error('Grade mask module must load before matrix');
  state.precision=1;state.gradeEdit=null;
 const special={attendance:new Set(['FJ','FA']),checks:new Set(['◷','FJ','FA','Isento'])};
 const isSpecial=(type,value)=>!!special[type]?.has(value);
 const nextCommon=(type,value)=>type==='attendance'?(value==='F'?'P':value==='—'?'P':'F'):(value==='—'?'✓':value==='✓'?'×':'✓');
 function applyBulk(type,rows,j,target){
  let changed=0,preserved=0,unchanged=0;
  for(const row of rows){
   const existing=type==='attendance'?row.states[j]:row[j];
   if(isSpecial(type,existing)){preserved++;continue;}
   if(existing===target){unchanged++;continue;}
   if(type==='attendance'){row.states[j]=target;row.reasons[j]='';}else row[j]=target;
   changed++;
  }
  return {changed,preserved,unchanged,total:rows.length};
 }
 Object.assign(F,{matrixTransitions:{isSpecial,nextCommon,applyBulk}});
  function code(i,j){
   if(kind==='attendance')return attendance.students[i].states[j];
   if(kind==='checks')return checks.states[i][j];
   const row=grades[i];return j===0?row.original[0]:j===1?row.original[1]:j===2?row.recovery:'—';
  }
  function meaning(value,i,j){
   if(kind==='attendance')return ({P:'Presente',F:'Falta',FJ:'Falta justificada (exemplo)',FA:'Abono (exemplo)','—':'Sem lançamento'})[value]||value;
   if(kind==='checks')return ({'✓':'Visto concluído','×':'Sem visto','◷':'Pendente','—':'Sem lançamento',FJ:'Justificativa','FA':'Abono',Isento:'Isento'})[value]||value;
   if(j===3)return 'Resultado não calculado';
   if(value===''||value==='—')return 'Não lançado';
   return value+(grades[i].partial&&j===0?' · parcial':' · lançado');
  }
  const output=(i,j)=>{
   const v=code(i,j);
   if(kind==='grades'&&j===3)return '<span class="f2-uncomputed">Não calculado</span>';
   if(kind==='grades')return v===''?'<span class="f2-empty-cell">—</span>':esc(v)+(grades[i].partial&&j===0?'*':'');
   return `<span class="f2-code" data-code="${esc(v)}">${esc(v)}</span>`;
  };
  function renderTable(){
 const allowed=students.map((s,i)=>({s,i})).filter(({s})=>s.name.toLocaleLowerCase('pt-BR').includes(state.query.toLocaleLowerCase('pt-BR')));
 return `<div class="f2-sheet-scroller" tabindex="0" role="region" aria-label="${base.name}, 30 estudantes fictícios; deslize a planilha" data-f2-scroll><table class="f2-sheet" aria-label="${base.name} ilustrativa com 30 estudantes"><colgroup><col style="width:151px">${Array.from({length:columnCount},()=>'<col style="width:119px">').join('')}</colgroup><thead><tr class="f2-sheet-group"><th scope="col" class="f2-student-header f2-sticky" rowspan="2">Estudante</th>${kind==='grades'?'<th scope="colgroup" colspan="2">Avaliações originais</th><th scope="colgroup" colspan="2">Recuperação / resultado</th>':`<th scope="colgroup" colspan="${columnCount}">${kind==='attendance'?'Duas aulas independentes':'Atividades fictícias'}</th>`}</tr><tr class="f2-sheet-subgroup">${base.columns.map((label,j)=>`<th scope="col" data-f2-col="${j}" class="${state.active?.j===j?'f2-active-col':''} ${kind==='checks'&&state.selectedActivity===j?'f2-bulk-column':''}">${kind==='grades'?`${esc(label)}<small>${maxes[j]===null?'Sem cálculo':'Máx. '+maxes[j]} · ${weights[j]}</small>`:`<div class="f2-head-stack">${kind==='attendance'?`<strong class="f2-head-name">${esc(label)}</strong><small class="f2-head-date">${dmy(state.date)}</small>`:`<button type="button" class="f2-activity-head" data-f2-activity="${j}" aria-pressed="${state.selectedActivity===j}" aria-label="Consultar contadores de ${esc(label)}">${esc(label)}</button>`}<div class="f2-head-quick" role="group" aria-label="Lançamento coletivo · ${esc(label)}">${[{value:'P',symbol:'check-circle',label:'Todos presentes',action:'matrix-att-all-p',short:'P'},{value:'F',symbol:'x',label:'Todos ausentes',action:'matrix-att-all-f',short:'F'}].filter(()=>kind==='attendance').concat([{value:'✓',symbol:'check-circle',label:'Todos fizeram',action:'matrix-check-all-done',short:'✓'},{value:'×',symbol:'x',label:'Todos não fizeram',action:'matrix-check-all-not',short:'×'}].filter(()=>kind==='checks')).map(a=>`<button type="button" class="f2-head-bulk" data-f2-action="${a.action}" data-f2-col-target="${j}" aria-label="${a.label} · ${esc(label)} · ${students.length} estudantes" title="${a.label} · ${esc(label)}"><span aria-hidden="true">${icon(a.symbol)}</span><span class="f2-head-short">${a.short}</span></button>`).join('')}</div></div>`}</th>`).join('')}</tr></thead><tbody>${allowed.map(({s,i})=>`<tr data-f2-row="${i}" class="${state.active?.i===i?'f2-active-row':''}"><th class="f2-sticky f2-student-cell" scope="row" data-f2-rowheader="${i}">${s.name}</th>${Array.from({length:columnCount},(_,j)=>`<td data-f2-col="${j}" class="${state.active?.j===j?'f2-active-col':''} ${state.active?.i===i&&state.active?.j===j?'f2-active-cell':''} ${kind==='checks'&&state.selectedActivity===j?'f2-bulk-column':''}"><button type="button" class="f2-cell" data-f2-cell="${i}:${j}" aria-label="${s.name}, ${base.columns[j]}: ${meaning(code(i,j),i,j)}" ${kind==='grades'&&j===3?'disabled title="Resultado depende da regra acadêmica oficial"':''}>${output(i,j)}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
  function popupHTML(){
   if(!state.popup||kind==='grades')return '';
   const {i,j}=state.popup,previous=code(i,j),s=students[i],label=base.columns[j];
   let controls='';
   if(kind==='attendance'){
    controls=`<fieldset class="f2-choice-list"><legend>Marcação da mesma célula</legend>${['P','F','FJ','FA','—'].map(v=>`<label><input type="radio" name="f2-att-state" value="${v}" ${v===previous?'checked':''}><span>${v} · ${meaning(v,i,j)}</span></label>`).join('')}</fieldset><label class="f2-field">Motivo ilustrativo para FJ/FA <input class="f2-input" name="f2-reason" maxlength="90" placeholder="Opcional, sem regra legal"></label>`;
   }else if(kind==='checks'){
    controls=`<fieldset class="f2-choice-list"><legend>Estado do mesmo visto</legend>${['✓','×','◷','—','FJ','FA','Isento'].map(v=>`<label><input type="radio" name="f2-check-state" value="${v}" ${v===previous?'checked':''}><span>${v} · ${meaning(v,i,j)}</span></label>`).join('')}</fieldset><label class="f2-field">Observação ilustrativa <input class="f2-input" name="f2-reason" maxlength="90" placeholder="Opcional"></label>`;

   }
   return `<div class="f2-inline-dialog" role="dialog" aria-label="Editar ${base.name} da mesma célula" aria-modal="false"><h4>${base.name}: ${s.name}</h4><p>${esc(label)} · valor anterior: ${esc(previous||'—')}</p>${controls}<p class="f2-inline-error" data-f2-error role="alert"></p><div class="f2-actions">${btn('Cancelar','matrix-cancel')}${btn('Aplicar ao rascunho local','matrix-apply','f2-primary')}</div></div>`;
  }
  function history(){
   const sample=['P','F','FJ','FA','—'];
   return `<div class="f2-surface"><h4>Histórico de exemplo · sem dados oficiais</h4><p>Estados independentes por aula e data, incluindo ausência de lançamento.</p><div class="f2-history-grid">${students.slice(0,12).map((s,i)=>`<div><strong>${s.name}</strong><span>${sample[i%5]}</span><span>${sample[(i+2)%5]}</span></div>`).join('')}</div><div class="f2-inline-status">P: presente · F: falta · FJ: justificação fictícia · FA: abono fictício · —: sem registro</div></div>`;
  }
  function render({focus=null}={}){
 const scrollBefore=host.querySelector('[data-f2-scroll]');
 const saved=scrollBefore?{left:scrollBefore.scrollLeft,top:scrollBefore.scrollTop}:null;
 const attCodes=['P','F','FJ','FA','—'];
 const counts=Object.fromEntries(attCodes.map(code=>[code,attendance.students.filter(s=>s.states[attendance.lesson]===code).length]));
 const targetJ=state.selectedActivity;
 const seen=targetJ===null?null:Object.fromEntries(['✓','×','◷','—','FJ','FA','Isento'].map(code=>[code,checks.states.filter(row=>row[targetJ]===code).length]));
 const attHeader=`<div class="f2-matrix-heading"><strong>${schoolName} · ${groupName} · Matemática · ${dmy(state.date)}</strong><span class="f2-chip" data-f2-lesson-label>Aula ${attendance.lesson+1} · ${attendance.lesson?'08:20–09:10':'07:30–08:20'}</span><span class="f2-chip" data-f2-confirmed>${attendance.confirmed[attendance.lesson]?'Confirmação local simulada':'Rascunho não gravado'}</span></div><div class="f2-actions">${btn('Aula 1','matrix-lesson-0',attendance.lesson===0?'f2-selected':'')}${btn('Aula 2','matrix-lesson-1',attendance.lesson===1?'f2-selected':'')}${btn('Chamada do dia','matrix-tab-matrix',attendance.tab==='today'?'f2-selected':'')}${btn('Histórico','matrix-tab-history',attendance.tab==='history'?'f2-selected':'')}${btn('Confirmar rascunho (simulação)','matrix-confirm','f2-primary')}</div><p class="f2-context-note">Lançamentos coletivos diretamente nos cabeçalhos das aulas: ícones P e F. Estados FJ/FA preservados; confirmação da aula permanece explícita.</p><p class="f2-inline-status" data-f2-counts>P ${counts.P} · F ${counts.F} · FJ ${counts.FJ} · FA ${counts.FA} · — ${counts['—']} (aula ${attendance.lesson+1}; derivados da amostra)</p>`;
 const gradeHeader=`<div class="f2-matrix-heading"><strong>${schoolName} · ${groupName} · Matemática · 2º bimestre</strong><span class="f2-chip">Avaliações originais e recuperação em grupos separados</span></div><div class="f2-grade-controls"><label class="f2-field">Casas decimais para digitação manual<select class="f2-select" data-f2-grade-precision>${[0,1,2].map(p=>`<option value="${p}" ${state.precision===p?'selected':''}>${p} ${p===1?'casa':'casas'}</option>`).join('')}</select></label><button type="button" class="f2-btn f2-small" data-f2-action="matrix-grade-partial" ${state.active?.j===0?'':'disabled'}>Alternar parcial da Avaliação A selecionada</button><small>Precisão muda só a entrada nova. Notas existentes preservadas. Máximos A=10 · B=8 · Recuperação=10; resultado não calculado.</small></div><p class="f2-inline-status">Digitação por dígitos com vírgula automática. Colagem mantém o número convencional. 0 ≠ vazio · * = parcial. Rascunho local; sem motor de cálculo.</p>`;
 const checkedHeader=`<div class="f2-matrix-heading"><strong>${schoolName} · ${groupName} · Vistos por atividade</strong><span class="f2-chip">Mesma célula · estados distintos</span></div><div class="f2-actions">${btn('Planilha','matrix-tab-matrix',checks.mode==='matrix'?'f2-selected':'')}${btn('Registro individual','matrix-tab-single',checks.mode==='single'?'f2-selected':'')}</div><p class="f2-context-note">Lançamentos diretos nos cabeçalhos: ✓ todos fizeram · × todos não fizeram. Turma inteira, mesmo com filtro; ◷/FJ/FA/Isento preservados.</p><p class="f2-inline-status" data-f2-check-counts>${seen?`Atividade ${esc(checks.activities[targetJ])} · ✓ ${seen['✓']} · × ${seen['×']} · — ${seen['—']} · ◷ ${seen['◷']} · FJ ${seen.FJ} · FA ${seen.FA} · Isento ${seen.Isento} (total 30)`:'Clique no nome ou nos ícones da atividade para consultar os contadores.'}</p><p class="f2-inline-status">✓ visto · × sem visto · ◷ pendente · — não lançado · FJ/FA/Isento: exceções, sem denominador inventado.</p>`;
 const single=`<div class="f2-fields"><label class="f2-field">Estudante<select class="f2-select" id="f2-single-student">${students.map(s=>`<option value="${s.id-1}">${s.name}</option>`).join('')}</select></label><label class="f2-field">Atividade<select class="f2-select" id="f2-single-activity">${checks.activities.map((name,j)=>`<option value="${j}">${esc(name)}</option>`).join('')}</select></label></div>${btn('Alternar visto individual','matrix-single-edit','f2-primary')}${btn('Estado especial / limpar registro','matrix-single-special')}`;
 const header=kind==='attendance'?attHeader:kind==='grades'?gradeHeader:checkedHeader;
 const contents=kind==='attendance'&&attendance.tab==='history'?history():kind==='checks'&&checks.mode==='single'?single:renderTable();
 const explicit=kind==='attendance'||kind==='checks'?`<div class="f2-actions f2-context-actions"><button type="button" class="f2-btn f2-small" data-f2-action="matrix-special" ${!state.active?'disabled':''}>Estado especial / limpar célula selecionada</button><small>Selecione a célula primeiro. Clique comum jamais sobrescreve uma exceção.</small></div>`:'';
 host.innerHTML=`<div class="f2-matrix" data-f2-matrix="${kind}">${header}<div class="f2-matrix-tools"><label class="f2-field">Pesquisar estudante<input type="search" class="f2-input" data-f2-search placeholder="Estudante 07" value="${esc(state.query)}"></label>${btn('Reiniciar amostra','matrix-reset')}</div>${contents}${explicit}${popupHTML()}<p class="f2-inline-status" data-f2-matrix-feedback role="status" aria-live="polite">${esc(state.feedback)}</p></div>`;
 const after=host.querySelector('[data-f2-scroll]');
 if(after&&saved){after.scrollLeft=saved.left;after.scrollTop=saved.top;}
 if(focus)host.querySelector(`[data-f2-cell="${focus.i}:${focus.j}"]`)?.focus({preventScroll:true});
}
  function countCodes(type,j){
 const values=type==='attendance'?attendance.students.map(s=>s.states[j]):checks.states.map(s=>s[j]);
 const codes=type==='attendance'?['P','F','FJ','FA','—']:['✓','×','◷','—','FJ','FA','Isento'];
 return Object.fromEntries(codes.map(value=>[value,values.filter(x=>x===value).length]));
}
  function updateSummary(){
 if(kind==='attendance'){
  const n=countCodes('attendance',attendance.lesson),line=host.querySelector('[data-f2-counts]');
  if(line)line.textContent=`P ${n.P} · F ${n.F} · FJ ${n.FJ} · FA ${n.FA} · — ${n['—']} (aula ${attendance.lesson+1}; derivados da amostra)`;
  const lessonLabel=host.querySelector('[data-f2-lesson-label]');if(lessonLabel)lessonLabel.textContent=`Aula ${attendance.lesson+1} · ${attendance.lesson?'08:20–09:10':'07:30–08:20'}`;
  host.querySelectorAll('[data-f2-action^="matrix-lesson-"]').forEach(b=>b.classList.toggle('f2-selected',b.dataset.f2Action===`matrix-lesson-${attendance.lesson}`));
  const chip=host.querySelector('[data-f2-confirmed]');
  if(chip)chip.textContent=attendance.confirmed[attendance.lesson]?'Confirmação local simulada':'Rascunho não gravado';
 }else if(kind==='checks'){
  const j=state.selectedActivity,n=j===null?null:countCodes('checks',j);
  const line=host.querySelector('[data-f2-check-counts]');
  if(line)line.textContent=n?`Atividade ${checks.activities[j]} · ✓ ${n['✓']} · × ${n['×']} · — ${n['—']} · ◷ ${n['◷']} · FJ ${n.FJ} · FA ${n.FA} · Isento ${n.Isento} (total 30)`:'Selecione uma atividade para consultar os contadores.';
  const chip=host.querySelector('[data-f2-bulk-target]');
  if(chip)chip.textContent=j===null?'Nenhuma atividade escolhida':'Atividade: '+checks.activities[j]+' · 30 estudantes';
  // Atalhos dos cabeçalhos sempre ativos: cada botão contém explicitamente a sua coluna.
  for(const button of host.querySelectorAll('[data-f2-activity]'))button.setAttribute('aria-pressed',String(Number(button.dataset.f2Activity)===j));
  for(const cell of host.querySelectorAll('.f2-sheet [data-f2-col]'))cell.classList.toggle('f2-bulk-column',j!==null&&Number(cell.dataset.f2Col)===j);
 }
 const feedback=host.querySelector('[data-f2-matrix-feedback]');if(feedback)feedback.textContent=state.feedback;
}
  function markActive(i,j,{focus=false}={}){
 state.active={i,j};
 const sheet=host.querySelector('.f2-sheet');
 if(sheet){
  for(const row of sheet.querySelectorAll('tbody [data-f2-row]'))row.classList.toggle('f2-active-row',Number(row.dataset.f2Row)===i);
  for(const el of sheet.querySelectorAll('[data-f2-col]')){
   el.classList.toggle('f2-active-col',Number(el.dataset.f2Col)===j);
   if(el.tagName==='TD')el.classList.toggle('f2-active-cell',!!el.querySelector(`[data-f2-cell="${i}:${j}"]`));
  }
 }
 const action=host.querySelector('[data-f2-action=matrix-special]');if(action)action.disabled=false;
 if(kind==='grades'){const partial=host.querySelector('[data-f2-action=matrix-grade-partial]');if(partial)partial.disabled=j!==0;}
 if(focus)host.querySelector(`[data-f2-cell="${i}:${j}"]`)?.focus({preventScroll:true});
}
  function paint(i,j){
 const button=host.querySelector(`[data-f2-cell="${i}:${j}"]`);
 if(!button)return;
 button.innerHTML=output(i,j);
 button.setAttribute('aria-label',`${students[i].name}, ${base.columns[j]}: ${meaning(code(i,j),i,j)}`);
}
  function assignCommon(i,j){
 if(i<0||i>=students.length||j<0||j>=columnCount)return;
 if(kind==='grades'){openGrade(i,j);return;}
 markActive(i,j);
 const before=code(i,j);
 if(isSpecial(kind,before)){
  state.feedback=`${students[i].name}: estado especial ${before} preservado. Para editar, use “Estado especial / limpar célula selecionada”.`;
  updateSummary();return;
 }
 const after=nextCommon(kind,before);
 if(kind==='attendance'){
  attendance.students[i].states[j]=after;
  attendance.students[i].reasons[j]='';
  attendance.confirmed[j]=false;
 }else{
  checks.states[i][j]=after;
  checks.reasons[i][j]='';
 }
 paint(i,j);
 state.feedback=`${students[i].name}, ${base.columns[j]}: ${before} → ${after}. Rascunho local; sem confirmação ou envio.`;
 updateSummary();
}
  function bulk(type,j,target){
 if(type==='checks'&&(!Number.isInteger(j)||j<0||j>=checks.activities.length))return null;
 if(type==='attendance'&&(!Number.isInteger(j)||j<0||j>=attendance.confirmed.length))return null;
 if(type==='checks')state.selectedActivity=j;
 if(type==='attendance')attendance.lesson=j;
 const rows=type==='attendance'?attendance.students:checks.states;
 const result=applyBulk(type,rows,j,target);
 if(type==='attendance'&&result.changed>0)attendance.confirmed[j]=false;
 for(let i=0;i<students.length;i++)paint(i,j);
 state.feedback=`${type==='attendance'?'Aula '+(j+1):'Atividade '+checks.activities[j]}: ${result.changed} alterados, ${result.preserved} exceções preservadas, ${result.unchanged} já estavam em ${target}. Turma inteira: ${result.total} estudantes, mesmo com pesquisa. Rascunho local.`;
 updateSummary();
 return result;
}
  function selectActivity(j){
 if(kind!=='checks'||(j!==null&&(!Number.isInteger(j)||j<0||j>=checks.activities.length)))return;
 state.selectedActivity=j;
 state.feedback=j===null?'Nenhuma atividade selecionada; nenhuma alteração aplicada.':`Atividade ${checks.activities[j]} selecionada para 30 estudantes. Nenhum lançamento automático.`;
 updateSummary();
}
  function openGrade(i,j){
 if(kind!=='grades'||j>=3||j<0||i<0||i>=students.length)return;
 if(state.gradeEdit)finishGrade(true);
 markActive(i,j);
 const button=host.querySelector(`[data-f2-cell="${i}:${j}"]`);
 if(!button)return;
 const original=code(i,j);
 const edit={i,j,original,text:original===''?'':String(original),digits:null,dirty:false,composing:false};
 state.gradeEdit=edit;
 const input=host.ownerDocument.createElement('input');
 input.type='text';input.className='f2-grade-edit';input.dataset.f2GradeInput=i+':'+j;
 input.inputMode='numeric';input.autocomplete='off';input.spellcheck=false;
 input.setAttribute('aria-label',`Editar nota de ${students[i].name}, ${base.columns[j]}; máximo ${maxes[j]}; ${state.precision} casas decimais. Enter confirma, Escape cancela.`);
 input.value=edit.text;
 button.replaceWith(input);
 input.focus({preventScroll:true});
 input.select();
}
  function editGradeDigits(insertion,operation){
 const edit=state.gradeEdit,input=host.querySelector('[data-f2-grade-input]');
 if(!edit||!input)return false;
 const p=state.precision,max=maxes[edit.j];
 const existing=edit.digits===null?gradeMask.previous(edit.text,p,max):{ok:true,digits:edit.digits};
 const start=input.selectionStart??0,end=input.selectionEnd??start;
 const all=start===0&&end===input.value.length;
 if(!existing.ok&&!all)return false;
 const raw=all?'':existing.digits,visual=gradeMask.manual(raw,p,max);
 if(!visual.ok)return false;
 const padding=Math.max(0,(visual.text.match(/[0-9]/g)||[]).length-raw.length);
 const countDigits=value=>(value.match(/[0-9]/g)||[]).length;
 const left=all?0:Math.max(0,Math.min(raw.length,countDigits(input.value.slice(0,start))-padding));
 const right=all?raw.length:Math.max(left,Math.min(raw.length,countDigits(input.value.slice(0,end))-padding));
 let candidate='';
 if(operation==='insert')candidate=raw.slice(0,left)+insertion+raw.slice(right);
 else if(operation==='backspace')candidate=left!==right?raw.slice(0,left)+raw.slice(right):raw.slice(0,Math.max(0,left-1))+raw.slice(right);
 else if(operation==='delete')candidate=left!==right?raw.slice(0,left)+raw.slice(right):raw.slice(0,left)+raw.slice(Math.min(raw.length,left+1));
 else candidate='';
 const next=gradeMask.manual(candidate,p,max);
 if(!next.ok)return false; // silencioso, inclusive seleção/cursor intactos
 edit.digits=next.digits;edit.text=next.text;edit.dirty=true;
 input.value=next.text;input.setSelectionRange(next.text.length,next.text.length);
 return true;
}
  function pasteGrade(clipboard){
 const edit=state.gradeEdit,input=host.querySelector('[data-f2-grade-input]');
 if(!edit||!input||typeof clipboard!=='string'||/[\t\r\n]/.test(clipboard))return false;
 const next=gradeMask.external(clipboard.trim(),state.precision,maxes[edit.j]);
 if(!next.ok)return false;
 edit.digits=next.digits;edit.text=next.text;edit.dirty=true;
 input.value=next.text;input.setSelectionRange(next.text.length,next.text.length);
 return true;
}
  function finishGrade(cancel=false){
 const edit=state.gradeEdit;if(!edit)return;
 const input=host.querySelector('[data-f2-grade-input]');
 if(!cancel&&edit.dirty){
  const check=gradeMask.external(edit.text,state.precision,maxes[edit.j]);
  if(check.ok){
   const value=check.text;
   if(edit.j<2)grades[edit.i].original[edit.j]=value;
   else grades[edit.i].recovery=value;
  }
 }
 state.gradeEdit=null;
 if(input){
  const b=host.ownerDocument.createElement('button');
  b.type='button';b.className='f2-cell';b.dataset.f2Cell=edit.i+':'+edit.j;
  b.setAttribute('aria-label',`${students[edit.i].name}, ${base.columns[edit.j]}: ${meaning(code(edit.i,edit.j),edit.i,edit.j)}`);
  b.innerHTML=output(edit.i,edit.j);
  input.replaceWith(b);
  b.focus({preventScroll:true});
 }
}
  function nextGradeCell(i,j,mode){
 const visible=students.map((s,n)=>({s,n})).filter(x=>x.s.name.toLocaleLowerCase('pt-BR').includes(state.query.toLocaleLowerCase('pt-BR'))).map(x=>x.n);
 if(!visible.length)return null;
 const pos=visible.indexOf(i);
 if(mode==='enter'){
  if(pos>=0&&pos<visible.length-1)return {i:visible[pos+1],j};
  return {i:visible[0],j:(j+1)%3};
 }
 if(mode==='tab'){
  if(j<2)return {i,j:j+1};
  return {i:visible[(pos+1+visible.length)%visible.length],j:0};
 }
 if(mode==='backtab'){
  if(j>0)return {i,j:j-1};
  return {i:visible[(pos-1+visible.length)%visible.length],j:2};
 }
 return null;
}
  function openCell(i,j){
   if(i<0||i>=30||j<0||j>=columnCount)return;
   if(kind==='grades'){openGrade(i,j);return;}
   state.active={i,j};state.popup={i,j};state.feedback=`Edição deliberada de estado especial: ${students[i].name} · ${base.columns[j]} (amostra local).`;render();
   host.querySelector('.f2-inline-dialog input:not([disabled])')?.focus({preventScroll:true});
  }
  function apply(){
   const {i,j}=state.popup||{};if(i===undefined)return;
   const error=host.querySelector('[data-f2-error]');const val=name=>host.querySelector(`[name="${name}"]:checked`)?.value;
   if(kind==='attendance'){
    const selected=val('f2-att-state');if(!selected)return;
    const reason=host.querySelector('[name="f2-reason"]')?.value.trim()||'';
    if((selected==='FJ'||selected==='FA')&&reason.length<3){error.textContent='Informe um motivo ilustrativo com ao menos três caracteres para FJ/FA; nenhuma regra legal foi inferida.';return;}
    const old=attendance.students[i].states[j],oldReason=attendance.students[i].reasons[j];
    attendance.students[i].states[j]=selected;
    attendance.students[i].reasons[j]=reason;
    if(old!==selected||oldReason!==reason)attendance.confirmed[j]=false;
   }else if(kind==='checks'){
    checks.states[i][j]=val('f2-check-state')||'—';
    checks.reasons[i][j]=host.querySelector('[name="f2-reason"]')?.value.trim()||'';

   }
   state.popup=null;state.active={i,j};state.feedback=`Alteração deliberada aplicada a ${students[i].name}, coluna ${base.columns[j]}. Não houve salvamento remoto.`;render({focus:{i,j}});updateSummary();
  }
  const onClick=e=>{
   const b=e.target.closest('button');if(!b||!host.contains(b))return;
   if(b.dataset.f2Activity!==undefined){selectActivity(Number(b.dataset.f2Activity));return;}
   if(b.dataset.f2Cell){const [i,j]=b.dataset.f2Cell.split(':').map(Number);assignCommon(i,j);return;}
   const a=b.dataset.f2Action;
   if(a==='matrix-att-all-p'||a==='matrix-att-all-f'){if(kind==='attendance'){const col=Number(b.dataset.f2ColTarget);bulk('attendance',col,a==='matrix-att-all-p'?'P':'F');}return;}
   if(a==='matrix-check-all-done'||a==='matrix-check-all-not'){if(kind==='checks'){const col=Number(b.dataset.f2ColTarget);bulk('checks',col,a==='matrix-check-all-done'?'✓':'×');}return;}
   if(a==='matrix-special'&&state.active){openCell(state.active.i,state.active.j);return;}
   if(a==='matrix-single-special'&&kind==='checks'){openCell(Number(host.querySelector('#f2-single-student').value),Number(host.querySelector('#f2-single-activity').value));return;}
   if(a==='matrix-grade-partial'&&kind==='grades'&&state.active?.j===0){const i=state.active.i;grades[i].partial=!grades[i].partial;paint(i,0);state.feedback='Marcador parcial alterado apenas no rascunho sintético.';updateSummary();return;}
   if(a==='matrix-apply'){apply();return}
   if(a==='matrix-cancel'){state.popup=null;state.feedback='Edição cancelada: nenhuma célula modificada.';render();return}
   if(a==='matrix-reset'){const fresh=makeAttendance(),c=makeChecks();attendance.students=fresh.students;attendance.confirmed=[false,false];checks.states=c.states;checks.reasons=students.map(()=>Array.from({length:checks.activities.length},()=>''));state.selectedActivity=null;for(let i=0;i<30;i++){grades[i]={...sampleGrades[i],original:[...sampleGrades[i].original]};}state.popup=null;state.active=null;state.feedback='Amostra restaurada.';render();return}
   if(a==='matrix-tab-history'||a==='matrix-tab-matrix'){if(kind==='attendance')attendance.tab=a==='matrix-tab-history'?'history':'today';else checks.mode='matrix';state.popup=null;render();return}
   if(a==='matrix-tab-single'){checks.mode='single';state.popup=null;render();return}
   if(a==='matrix-single-edit'){assignCommon(Number(host.querySelector('#f2-single-student').value),Number(host.querySelector('#f2-single-activity').value));return}
   if(a==='matrix-lesson-0'||a==='matrix-lesson-1'){attendance.lesson=a==='matrix-lesson-1'?1:0;state.popup=null;render();return}
   if(a==='matrix-confirm'){attendance.confirmed[attendance.lesson]=true;state.popup=null;state.feedback=`Aula ${attendance.lesson+1}: confirmação apenas no estado sintético desta página. Sem servidor ou recibo.`;render();return}
  };
  const onChange=e=>{if(kind==='grades'&&e.target.matches('[data-f2-grade-precision]')){if(state.gradeEdit)finishGrade(false);state.precision=Number(e.target.value);render();}};
  const onBeforeInput=e=>{
   if(kind!=='grades'||!e.target.matches('[data-f2-grade-input]'))return;
   if(e.cancelable)e.preventDefault();
   if(e.inputType==='insertText'&&/^[0-9]$/.test(e.data||'')){
    editGradeDigits(e.data,'insert'); // Uma única tecla numérica: máscara posicional.
   }else if(['insertText','insertCompositionText','insertReplacementText'].includes(e.inputType)){
    // Autofill, IME e inserções em bloco NÃO são teclas sucessivas: conservar significado convencional.
    pasteGrade(e.data||'');
   }else if(e.inputType==='deleteContentBackward'||e.inputType==='deleteByCut')editGradeDigits('','backspace');
   else if(e.inputType==='deleteContentForward')editGradeDigits('','delete');
  };
  const onPaste=e=>{
   if(kind!=='grades'||!e.target.matches('[data-f2-grade-input]'))return;
   e.preventDefault();pasteGrade(e.clipboardData?.getData('text/plain')||'');
  };
  const onFocusOut=e=>{if(kind==='grades'&&e.target.matches('[data-f2-grade-input]'))finishGrade(false);};
  const onInput=e=>{if(kind==='grades'&&e.target.matches('[data-f2-grade-input]')){
    const edit=state.gradeEdit;if(!edit)return;
    const input=e.target,oldStart=input.selectionStart??0,oldEnd=input.selectionEnd??0;
    if(input.value!==edit.text){
     const candidate=gradeMask.external(input.value,state.precision,maxes[edit.j]);
     if(candidate.ok){edit.text=candidate.text;edit.digits=candidate.digits;edit.dirty=true;input.value=candidate.text;}
     else{input.value=edit.text;input.setSelectionRange(Math.min(oldStart,input.value.length),Math.min(oldEnd,input.value.length));}
    }
    return;
  }
  if(e.target.matches('[data-f2-search]')){const pos=e.target.selectionStart;state.query=e.target.value;render();const input=host.querySelector('[data-f2-search]');input?.focus({preventScroll:true});if(typeof pos==='number')input?.setSelectionRange(pos,pos);}};
  const onKey=e=>{
   if(kind==='grades'&&e.target.matches('[data-f2-grade-input]')){
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(/^[0-9]$/.test(e.key)){e.preventDefault();editGradeDigits(e.key,'insert');return;}
    if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();editGradeDigits('',e.key==='Backspace'?'backspace':'delete');return;}
    if(e.key==='Escape'){e.preventDefault();const {i,j}=state.gradeEdit;finishGrade(true);host.querySelector(`[data-f2-cell="${i}:${j}"]`)?.focus({preventScroll:true});return;}
    if(e.key==='Enter'||e.key==='Tab'){
     e.preventDefault();const {i,j}=state.gradeEdit,next=nextGradeCell(i,j,e.key==='Enter'?'enter':e.shiftKey?'backtab':'tab');
     finishGrade(false);
     if(next)openGrade(next.i,next.j);
     return;
    }
    if(e.key.length===1){e.preventDefault();return;}
    return;
   }
   const b=e.target.closest('[data-f2-cell]');if(!b||!host.contains(b))return;
   const [i,j]=b.dataset.f2Cell.split(':').map(Number),moves={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
   if(e.key in moves){e.preventDefault();const [di,dj]=moves[e.key];const ni=Math.max(0,Math.min(29,i+di)),nj=Math.max(0,Math.min(columnCount-1,j+dj));state.popup=null;markActive(ni,nj,{focus:true});}
   if(e.key==='Escape'&&state.popup){e.preventDefault();state.popup=null;render({focus:{i,j}});}
  };
  host.addEventListener('click',onClick);host.addEventListener('change',onChange);host.addEventListener('beforeinput',onBeforeInput);host.addEventListener('paste',onPaste);host.addEventListener('input',onInput);host.addEventListener('keydown',onKey);host.addEventListener('focusout',onFocusOut);
  render();
  return {state,render,openCell,assignCommon,bulk,selectActivity,dispose:()=>{host.removeEventListener('click',onClick);host.removeEventListener('change',onChange);host.removeEventListener('beforeinput',onBeforeInput);host.removeEventListener('paste',onPaste);host.removeEventListener('input',onInput);host.removeEventListener('keydown',onKey);host.removeEventListener('focusout',onFocusOut)}};
 }
 Object.assign(F,{mountMatrix});
})();
