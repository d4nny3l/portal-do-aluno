(function registerMatrix(){
 'use strict';
 const F=window.SALTA_ATELIE_02;if(!F)throw Error('Missing fixtures');
 const {students,esc,btn,makeAttendance,makeChecks,sampleGrades,referenceToday,dmy}=F;
 const defs={
  attendance:{name:'Chamada',columns:['Aula 1 · 07:30','Aula 2 · 08:20'],group:['Presenças do dia',2]},
  grades:{name:'Notas',columns:['Avaliação A','Avaliação B','Recuperação','Resultado'],group:['Originais',2,'Recuperação e resultado',2]},
  checks:{name:'Vistos',columns:['Frações','Expressões','Geometria','Revisão','Estatística','Problemas','Leitura','Recuperação'],group:['Atividades da turma',8]}
 };
 function mountMatrix(host,kind,{compact=false,onSignal=()=>{}}={}){
  if(!host||!defs[kind])return null;
  const base=defs[kind],attendance=makeAttendance(),checks=makeChecks(),grades=sampleGrades.map(g=>({id:g.id,original:[...g.original],recovery:g.recovery,partial:g.partial}));
  const state={kind,attendance,checks,grades,active:null,popup:null,tab:'matrix',date:referenceToday,feedback:'Nenhum dado real foi modificado.',query:'',mode:compact?'short':'full',confirmedSaves:0};
  const maxes=[10,8,10,null],weights=['Peso visual 2','Peso visual 3','Recuperação','Sem fórmula'];
  const columnCount=kind==='attendance'?2:kind==='grades'?4:8;
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
   return `<div class="f2-sheet-scroller" tabindex="0" role="region" aria-label="${base.name}, 30 estudantes fictícios; deslize a planilha" data-f2-scroll><table class="f2-sheet" aria-label="${base.name} ilustrativa com 30 estudantes"><colgroup><col style="width:151px">${Array.from({length:columnCount},()=>'<col style="width:119px">').join('')}</colgroup><thead><tr class="f2-sheet-group"><th scope="col" class="f2-student-header f2-sticky" rowspan="2">Estudante</th>${kind==='grades'?'<th scope="colgroup" colspan="2">Avaliações originais</th><th scope="colgroup" colspan="2">Recuperação / resultado</th>':`<th scope="colgroup" colspan="${columnCount}">${kind==='attendance'?'Duas aulas independentes':'Atividades fictícias'}</th>`}</tr><tr class="f2-sheet-subgroup">${base.columns.map((label,j)=>`<th scope="col" data-f2-col="${j}" class="${state.active?.j===j?'f2-active-col':''}">${esc(label)}${kind==='grades'?`<small>${maxes[j]===null?'Sem cálculo':'Máx. '+maxes[j]} · ${weights[j]}</small>`:''}</th>`).join('')}</tr></thead><tbody>${allowed.map(({s,i})=>`<tr data-f2-row="${i}" class="${state.active?.i===i?'f2-active-row':''}"><th class="f2-sticky f2-student-cell" scope="row" data-f2-rowheader="${i}">${s.name}</th>${Array.from({length:columnCount},(_,j)=>`<td data-f2-col="${j}" class="${state.active?.j===j?'f2-active-col':''} ${state.active?.i===i&&state.active?.j===j?'f2-active-cell':''}"><button type="button" class="f2-cell" data-f2-cell="${i}:${j}" aria-label="${s.name}, ${base.columns[j]}: ${meaning(code(i,j),i,j)}" ${kind==='grades'&&j===3?'disabled title="Resultado depende da regra acadêmica oficial"':''}>${output(i,j)}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function popupHTML(){
   if(!state.popup)return '';
   const {i,j}=state.popup,previous=code(i,j),s=students[i],label=base.columns[j];
   let controls='';
   if(kind==='attendance'){
    controls=`<fieldset class="f2-choice-list"><legend>Marcação da mesma célula</legend>${['P','F','FJ','FA','—'].map(v=>`<label><input type="radio" name="f2-att-state" value="${v}" ${v===previous?'checked':''}><span>${v} · ${meaning(v,i,j)}</span></label>`).join('')}</fieldset><label class="f2-field">Motivo ilustrativo para FJ/FA <input class="f2-input" name="f2-reason" maxlength="90" placeholder="Opcional, sem regra legal"></label>`;
   }else if(kind==='checks'){
    controls=`<fieldset class="f2-choice-list"><legend>Estado do mesmo visto</legend>${['✓','×','◷','—','FJ','FA','Isento'].map(v=>`<label><input type="radio" name="f2-check-state" value="${v}" ${v===previous?'checked':''}><span>${v} · ${meaning(v,i,j)}</span></label>`).join('')}</fieldset><label class="f2-field">Observação ilustrativa <input class="f2-input" name="f2-reason" maxlength="90" placeholder="Opcional"></label>`;
   }else{
    controls=`<label class="f2-field">Valor da amostra <input class="f2-input" name="f2-grade-value" inputmode="decimal" autocomplete="off" value="${esc(previous)}" aria-describedby="f2-grade-max" placeholder="Vazio = não lançado"></label><small id="f2-grade-max">Máximo sintético desta coluna: ${maxes[j]}. Zero é lançamento, vazio é ausência; parcial é um estado distinto.</small><label class="f2-inline-check"><input type="checkbox" name="f2-partial" ${grades[i].partial&&j===0?'checked':''}> Marcador parcial (somente coluna A)</label>`;
   }
   return `<div class="f2-inline-dialog" role="dialog" aria-label="Editar ${base.name} da mesma célula" aria-modal="false"><h4>${base.name}: ${s.name}</h4><p>${esc(label)} · valor anterior: ${esc(previous||'—')}</p>${controls}<p class="f2-inline-error" data-f2-error role="alert"></p><div class="f2-actions">${btn('Cancelar','matrix-cancel')}${btn('Aplicar ao rascunho local','matrix-apply','f2-primary')}</div></div>`;
  }
  function history(){
   const sample=['P','F','FJ','FA','—'];
   return `<div class="f2-surface"><h4>Histórico de exemplo · sem dados oficiais</h4><p>Estados independentes por aula e data, incluindo ausência de lançamento.</p><div class="f2-history-grid">${students.slice(0,12).map((s,i)=>`<div><strong>${s.name}</strong><span>${sample[i%5]}</span><span>${sample[(i+2)%5]}</span></div>`).join('')}</div><div class="f2-inline-status">P: presente · F: falta · FJ: justificação fictícia · FA: abono fictício · —: sem registro</div></div>`;
  }
  function render({focus=null}={}){
   const counts=['P','F','FJ','FA','—'].map(x=>attendance.students.filter(s=>s.states[attendance.lesson]===x).length);
   const header=kind==='attendance'?`<div class="f2-matrix-heading"><strong>Escola Exemplo A · Turma A · Matemática · ${dmy(state.date)}</strong><span class="f2-chip">Aula ${attendance.lesson+1} · ${attendance.lesson?'08:20–09:10':'07:30–08:20'}</span><span class="f2-chip">${attendance.confirmed[attendance.lesson]?'Confirmação local simulada':'Rascunho não gravado'}</span></div><div class="f2-actions">${btn('Aula 1','matrix-lesson-0',attendance.lesson===0?'f2-selected':'')}${btn('Aula 2','matrix-lesson-1',attendance.lesson===1?'f2-selected':'')}${btn('Chamada do dia','matrix-tab-matrix',attendance.tab==='today'?'f2-selected':'')}${btn('Histórico','matrix-tab-history',attendance.tab==='history'?'f2-selected':'')}${btn('Confirmar rascunho (simulação)','matrix-confirm','f2-primary')}</div><p class="f2-inline-status" data-f2-counts>P ${counts[0]} · F ${counts[1]} · FJ ${counts[2]} · FA ${counts[3]} · — ${counts[4]} (aula ${attendance.lesson+1}; derivados da amostra)</p>`:
   kind==='grades'?`<div class="f2-matrix-heading"><strong>Escola Exemplo A · Turma A · Matemática · 2º bimestre</strong><span class="f2-chip">Avaliações originais e recuperação em grupos separados</span></div><p class="f2-inline-status">0 = lançado · — = não lançado · * = parcial · resultado sem motor de cálculo.</p>`:
   `<div class="f2-matrix-heading"><strong>Escola Exemplo A · Turma A · Vistos por atividade</strong><span class="f2-chip">Mesma célula · estados distintos</span></div><div class="f2-actions">${btn('Planilha','matrix-tab-matrix',checks.mode==='matrix'?'f2-selected':'')}${btn('Registro individual','matrix-tab-single',checks.mode==='single'?'f2-selected':'')}</div><p class="f2-inline-status">✓ visto · × sem visto · ◷ pendente · — não lançado · FJ/FA/Isento: exceções, sem denominador inventado.</p>`;
   const single=`<div class="f2-fields"><label class="f2-field">Estudante<select class="f2-select" id="f2-single-student">${students.map(s=>`<option value="${s.id-1}">${s.name}</option>`).join('')}</select></label><label class="f2-field">Atividade<select class="f2-select" id="f2-single-activity">${checks.activities.map((c,j)=>`<option value="${j}">${c}</option>`).join('')}</select></label></div>${btn('Editar registro individual','matrix-single-edit','f2-primary')}`;
   const contents=kind==='attendance'&&attendance.tab==='history'?history():kind==='checks'&&checks.mode==='single'?single:renderTable();
   host.innerHTML=`<div class="f2-matrix" data-f2-matrix="${kind}">${header}<div class="f2-matrix-tools"><label class="f2-field">Pesquisar estudante<input type="search" class="f2-input" data-f2-search placeholder="Estudante 07" value="${esc(state.query)}"></label>${btn('Reiniciar amostra','matrix-reset')}</div>${contents}${popupHTML()}<p class="f2-inline-status" data-f2-matrix-feedback role="status" aria-live="polite">${esc(state.feedback)}</p></div>`;
   if(focus){const node=host.querySelector(`[data-f2-cell="${focus.i}:${focus.j}"]`);node?.focus({preventScroll:true});}
  }
  function openCell(i,j){
   if(i<0||i>=30||j<0||j>=columnCount||(kind==='grades'&&j===3))return;
   state.active={i,j};state.popup={i,j};state.feedback=`Editando ${students[i].name}: ${base.columns[j]} (amostra local).`;render();
   host.querySelector('.f2-inline-dialog input:not([disabled])')?.focus({preventScroll:true});
  }
  function apply(){
   const {i,j}=state.popup||{};if(i===undefined)return;
   const error=host.querySelector('[data-f2-error]');const val=name=>host.querySelector(`[name="${name}"]:checked`)?.value;
   if(kind==='attendance'){
    const selected=val('f2-att-state');if(!selected)return;
    attendance.students[i].states[j]=selected;
    attendance.students[i].reasons[j]=host.querySelector('[name="f2-reason"]')?.value.trim()||'';
    attendance.confirmed[j]=false;
   }else if(kind==='checks'){
    checks.states[i][j]=val('f2-check-state')||'—';
   }else{
    const raw=host.querySelector('[name="f2-grade-value"]')?.value.trim()||'',parsed=Number(raw.replace(',','.'));
    if(raw&&!/^\d+(?:[,.]\d{1,2})?$/.test(raw)){error.textContent='Digite um número válido de exemplo, com até duas casas decimais.';return;}
    if(raw&&(!Number.isFinite(parsed)||parsed>maxes[j])){error.textContent=`Valor acima do máximo sintético ${maxes[j]}. Não ajustado automaticamente.`;return;}
    if(j<2)grades[i].original[j]=raw?parsed.toFixed(1).replace('.',','):'';
    else grades[i].recovery=raw?parsed.toFixed(1).replace('.',','):'';
    if(j===0)grades[i].partial=!!host.querySelector('[name="f2-partial"]')?.checked;
   }
   state.popup=null;state.active={i,j};state.feedback=`Alteração local aplicada a ${students[i].name}, coluna ${base.columns[j]}. Não houve salvamento remoto.`;render({focus:{i,j}});
  }
  const onClick=e=>{
   const b=e.target.closest('button');if(!b||!host.contains(b))return;
   if(b.dataset.f2Cell){const [i,j]=b.dataset.f2Cell.split(':').map(Number);openCell(i,j);return;}
   const a=b.dataset.f2Action;
   if(a==='matrix-apply'){apply();return}
   if(a==='matrix-cancel'){state.popup=null;state.feedback='Edição cancelada: nenhuma célula modificada.';render();return}
   if(a==='matrix-reset'){const fresh=makeAttendance(),c=makeChecks();attendance.students=fresh.students;attendance.confirmed=[false,false];checks.states=c.states;for(let i=0;i<30;i++){grades[i]={...sampleGrades[i],original:[...sampleGrades[i].original]};}state.popup=null;state.active=null;state.feedback='Amostra restaurada.';render();return}
   if(a==='matrix-tab-history'||a==='matrix-tab-matrix'){if(kind==='attendance')attendance.tab=a==='matrix-tab-history'?'history':'today';else checks.mode='matrix';state.popup=null;render();return}
   if(a==='matrix-tab-single'){checks.mode='single';state.popup=null;render();return}
   if(a==='matrix-single-edit'){openCell(Number(host.querySelector('#f2-single-student').value),Number(host.querySelector('#f2-single-activity').value));return}
   if(a==='matrix-lesson-0'||a==='matrix-lesson-1'){attendance.lesson=a==='matrix-lesson-1'?1:0;state.popup=null;render();return}
   if(a==='matrix-confirm'){attendance.confirmed[attendance.lesson]=true;state.popup=null;state.feedback=`Aula ${attendance.lesson+1}: confirmação apenas no estado sintético desta página. Sem servidor ou recibo.`;render();return}
  };
  const onInput=e=>{if(e.target.matches('[data-f2-search]')){const pos=e.target.selectionStart;state.query=e.target.value;render();const input=host.querySelector('[data-f2-search]');input?.focus({preventScroll:true});if(typeof pos==='number')input?.setSelectionRange(pos,pos);}};
  const onKey=e=>{
   const b=e.target.closest('[data-f2-cell]');if(!b||!host.contains(b))return;
   const [i,j]=b.dataset.f2Cell.split(':').map(Number),moves={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
   if(e.key in moves){e.preventDefault();const [di,dj]=moves[e.key];const ni=Math.max(0,Math.min(29,i+di)),nj=Math.max(0,Math.min(columnCount-1,j+dj));state.active={i:ni,j:nj};state.popup=null;render({focus:{i:ni,j:nj}});}
   if(e.key==='Escape'&&state.popup){e.preventDefault();state.popup=null;render({focus:{i,j}});}
  };
  host.addEventListener('click',onClick);host.addEventListener('input',onInput);host.addEventListener('keydown',onKey);
  render();
  return {state,render,openCell,dispose:()=>{host.removeEventListener('click',onClick);host.removeEventListener('input',onInput);host.removeEventListener('keydown',onKey)}};
 }
 Object.assign(F,{mountMatrix});
})();
