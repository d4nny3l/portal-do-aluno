(function registerCalendar(){
 'use strict';
 const F=window.SALTA_ATELIE_02;
 if(!F)throw Error('Atelie fixture module must load first');
 const {splitISO,iso,monthDays,months,weekday,addDays,startMonday,lessons,dayCount,dmy,referenceToday,esc,icon,btn}=F;
 const monthLabel=(y,m)=>months[m].slice(0,1).toUpperCase()+months[m].slice(1)+' '+y;
 const shiftMonth=(date,delta)=>{const x=splitISO(date),n=new Date(x.y,x.m+delta,1),day=Math.min(x.d,new Date(n.getFullYear(),n.getMonth()+1,0).getDate());return iso(n.getFullYear(),n.getMonth(),day)};
 function dayCard(key,{compact=false}={}){
  const dayLessons=lessons(key);
  if(!dayLessons.length)return `<p class="f2-empty-mini">Sem aulas fictícias neste período.</p>`;
  return `<div class="f2-agenda-list">${dayLessons.map((lesson,i)=>`<article class="f2-agenda-card" data-next="${i===0}" data-day="${key}"><div class="f2-agenda-hour">${lesson.start}–${lesson.end}</div><div><strong>${lesson.subject} · ${lesson.className}</strong><small>${lesson.institution}</small>${!compact?`<p>${lesson.content} · ${lesson.status}</p>`:''}</div>${compact?'':btn('Acessar exemplo','lesson-open')}</article>`).join('')}</div>`;
 }
 function monthGrid(date,{picker=false,choice=null,range=null}={}){
  const x=splitISO(date),grid=monthDays(x.y,x.m);
  return `<div class="f2-calendar-grid ${picker?'f2-picker-grid':''}" role="grid" aria-label="Calendário de ${monthLabel(x.y,x.m)}">${weekday.map(w=>`<span class="f2-weekday" role="columnheader">${w}</span>`).join('')}${grid.map(cell=>{
   const selected=cell.key===(choice||date),isReference=cell.key===referenceToday;
   const insideRange=!!(range?.from&&range?.until&&cell.key>range.from&&cell.key<range.until);
   const boundary=!!(range?.from===cell.key||range?.until===cell.key);
   const amount=dayCount(cell.key);
   return `<button type="button" class="f2-day ${cell.inMonth?'':'f2-outside'} ${insideRange?'f2-range-middle':''} ${boundary?'f2-range-edge':''}" role="gridcell" data-date="${cell.key}" ${picker?`data-f2-picker-date="${cell.key}"`:`data-f2-cal-date="${cell.key}"`} aria-selected="${selected}" aria-label="${dmy(cell.key)}${amount?' · '+amount+' aulas fictícias':''}${isReference?' · dia de referência':''}" title="${dmy(cell.key)}"><strong>${cell.day}</strong>${picker?'':`<small>${cell.inMonth?`${amount} ${amount===1?'aula':'aulas'}`:''}</small>${amount&&cell.inMonth?'<i aria-hidden="true"></i>':''}`}${isReference?'<span class="f2-today-dot" aria-hidden="true"></span>':''}</button>`;
  }).join('')}</div>`;
 }
 function mountCalendar(host,{date=referenceToday,view='month',onAction=null}={}){
  if(!host)return ()=>{};
  const state={date,view};
  const render=()=>{
   const x=splitISO(state.date);
   const period=state.view==='month'?monthLabel(x.y,x.m):state.view==='week'?dmy(startMonday(state.date))+' – '+dmy(addDays(startMonday(state.date),6)):dmy(state.date);
   let body='';
   if(state.view==='month'){
    body=`<div class="f2-month-agenda"><div>${monthGrid(state.date)}</div><aside class="f2-agenda-pane"><h4>Aulas · ${dmy(state.date)}</h4>${dayCard(state.date)}</aside></div>`;
   }else if(state.view==='week'){
    const first=startMonday(state.date);
    body=`<div class="f2-week-agenda">${weekday.map((w,i)=>{const key=addDays(first,i);return `<section class="f2-week-column"><button type="button" class="f2-week-date" data-f2-cal-date="${key}" aria-pressed="${key===state.date}">${w} · ${dmy(key)}</button>${dayCard(key,{compact:true})}</section>`}).join('')}</div>`;
   }else{
    const list=lessons(state.date);
    const bands=[['Manhã',list.filter(l=>+l.start.slice(0,2)<12)],['Tarde',list.filter(l=>+l.start.slice(0,2)>=12&&+l.start.slice(0,2)<18)],['Noite',list.filter(l=>+l.start.slice(0,2)>=18)]];
    body=`<div class="f2-day-timeline">${bands.map(([label,items])=>`<section class="f2-day-band"><h4>${label}</h4>${items.length?`<div class="f2-agenda-list">${items.map((lesson,i)=>`<article class="f2-agenda-card" data-next="${i===0}"><div class="f2-agenda-hour">${lesson.start}–${lesson.end}</div><div><strong>${lesson.institution} · ${lesson.className}</strong><small>${lesson.subject} · ${lesson.content}</small><p>Situação: ${lesson.status}</p></div>${btn('Acessar exemplo','lesson-open')}</article>`).join('')}</div>`:'<p class="f2-empty-mini">Sem aulas de exemplo.</p>'}</section>`).join('')}</div>`;
   }
   host.innerHTML=`<div class="f2-calendar" data-view="${state.view}"><header class="f2-calendar-top"><div><strong>${period}</strong><small>Data de referência fictícia: 27/11/2026</small></div><div class="f2-cal-arrows">${btn('‹','cal-prev')}${btn('Hoje de referência','cal-today')}${btn('›','cal-next')}</div></header><div class="f2-segment" role="group" aria-label="Visão do calendário">${[['month','Mensal'],['week','Semanal'],['day','Diária']].map(([value,label])=>`<button type="button" data-f2-cal-view="${value}" aria-pressed="${state.view===value}">${label}</button>`).join('')}</div>${body}<p class="f2-context-note" role="status" aria-live="polite">${dmy(state.date)} selecionado · ${dayCount(state.date)} aulas de exemplo</p></div>`;
  };
  const onClick=e=>{
   const button=e.target.closest('button');if(!button||!host.contains(button))return;
   const type=button.dataset.f2Action;
   if(button.dataset.f2CalView){state.view=button.dataset.f2CalView;render();return}
   if(button.dataset.f2CalDate){state.date=button.dataset.f2CalDate;render();return}
   if(type==='cal-today'){state.date=referenceToday;render();return}
   if(type==='cal-prev'||type==='cal-next'){
    const step=type==='cal-next'?1:-1;
    state.date=state.view==='month'?shiftMonth(state.date,step):addDays(state.date,state.view==='week'?7*step:step);
    render();return;
   }
   if(type==='lesson-open'&&onAction)onAction('Aula fictícia selecionada em '+dmy(state.date));
  };
  host.addEventListener('click',onClick);
  render();
  return {state,render,dispose:()=>host.removeEventListener('click',onClick)};
 }
 function mountPicker(host,{value=null,onConfirm=()=>{},onCancel=()=>{},onClear=()=>{},start=referenceToday,range=null}={}){
  if(!host)return;
  const state={value,selected:value,view:value||start,opened:true};
  const render=()=>{
   const x=splitISO(state.view);
   host.innerHTML=`<div class="f2-picker" role="group" aria-label="Seletor de data demonstrativo"><header class="f2-picker-header"><strong>${monthLabel(x.y,x.m)}</strong><div>${btn('‹','picker-prev')}${btn('›','picker-next')}</div></header><label class="f2-year-field">Ano <input type="number" min="1900" max="2100" step="1" class="f2-input" data-f2-picker-year value="${x.y}" aria-label="Ano do calendário"></label>${monthGrid(state.view,{picker:true,choice:state.selected,range})}<p class="f2-context-note">Selecionado: ${state.selected?dmy(state.selected):'nenhuma data'} · referência 27/11/2026</p><div class="f2-picker-actions">${btn('Limpar','picker-clear')}${btn('Hoje de referência','picker-today')}${btn('Cancelar','picker-cancel')}${btn('Confirmar','picker-confirm','f2-primary')}</div></div>`;
  };
  const onChange=e=>{if(e.target.matches('[data-f2-picker-year]')){const year=Number(e.target.value);if(Number.isInteger(year)&&year>=1900&&year<=2100){const x=splitISO(state.view);state.view=iso(year,x.m,Math.min(x.d,new Date(year,x.m+1,0).getDate()));render();}}};
  const onClick=e=>{
   const b=e.target.closest('button');if(!b||!host.contains(b))return;
   if(b.dataset.f2PickerDate){state.selected=b.dataset.f2PickerDate;state.view=state.selected;render();return;}
   const type=b.dataset.f2Action;
   if(type==='picker-prev'||type==='picker-next'){state.view=shiftMonth(state.view,type==='picker-next'?1:-1);render();}
   if(type==='picker-today'){state.selected=referenceToday;state.view=referenceToday;render();}
   if(type==='picker-clear'){state.selected=null;render();onClear(null);}
   if(type==='picker-cancel'){onCancel(state.value);}
   if(type==='picker-confirm'){state.value=state.selected;onConfirm(state.selected);}
  };
  host.addEventListener('click',onClick);
  host.addEventListener('change',onChange);
  render();
  return {state,render,dispose:()=>{host.removeEventListener('click',onClick);host.removeEventListener('change',onChange)}};
 }
 Object.assign(F,{mountCalendar,mountPicker,shiftMonth,monthGrid,dayCard});
})();
