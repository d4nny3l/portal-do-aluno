(function registerControls(){
 'use strict';
 const F=window.SALTA_ATELIE_02; if(!F)throw Error('Missing DESIGN-SALTA-02 fixtures');
 const {esc,btn,icon,referenceToday,dmy,mountPicker}=F;
 const host=document.getElementById('v2-component-playground');
 const colors=document.getElementById('v2-colors');
 const faviconOptions=[
  ['O','Original protegido','../favicon.svg'],
  ['A','Marinho / S branco','./atelie-salta-v2-favicon-a.svg'],
  ['B','Azul / S branco','./atelie-salta-v2-favicon-b.svg'],
  ['C','Degradê / S branco','./atelie-salta-v2-favicon-c.svg'],
  ['D','Branco / S marinho','./atelie-salta-v2-favicon-d.svg']
 ];
 function faviconGallery(){
  if(!colors)return;
  const node=document.createElement('section');node.className='f2-app f2-surface';node.id='f2-favicon-gallery';node.setAttribute('aria-label','Alternativas de favicon ainda não aprovadas');
  node.innerHTML=`<h3>Favicon · 4 alternativas para aprovação</h3><p>O símbolo oficial S e o favicon de produção não são alterados. Escolha somente nesta prévia. Compare legibilidade nos tamanhos 16/32/48/64 px e abas claras/escuras.</p><div class="f2-favicon-grid">${faviconOptions.map(([id,title,src])=>`<label class="f2-favicon-option"><span><input type="radio" name="f2-favicon" value="${id}" ${id==='O'?'checked':''}> <strong>${id==='O'?'Original':`Alternativa ${id}`}</strong> · ${title}</span><div class="f2-favicon-size">${[16,32,48,64].map(n=>`<div><img src="${src}" width="${n}" height="${n}" alt="${title} em ${n} pixels"><small style="display:block;font-size:10px">${n}px</small></div>`).join('')}</div><div class="f2-browser-bars"><div class="f2-browser-bar"><img src="${src}" width="16" height="16" alt=""> SALTA · Aba clara</div><div class="f2-browser-bar f2-dark"><img src="${src}" width="16" height="16" alt=""> SALTA · Aba escura</div></div><div class="f2-variant-large"><img src="${src}" width="74" height="74" alt="${title} ampliado"></div></label>`).join('')}</div><div id="f2-favicon-choice" class="f2-page-feedback" role="status" aria-live="polite">Original somente para comparação. Alternativas A/B/C/D aguardam escolha do proprietário.</div>`;
  colors.appendChild(node);
  node.addEventListener('change',e=>{if(e.target.name==='f2-favicon'){const choice=faviconOptions.find(x=>x[0]===e.target.value);node.querySelector('#f2-favicon-choice').textContent=choice[0]==='O'?'Original protegido selecionado para comparação; nenhuma mudança oficial.':`Alternativa ${choice[0]} selecionada localmente: ${choice[1]}. Ainda não aprovada nem publicada.`;}});
 }
 if(host){
  const state={selectedFile:null,fileError:'',uploaded:false,date:referenceToday,from:'2026-11-23',until:'2026-11-29',pickerTarget:null,picker:null,menu:false,tab:'Dados',page:1,modal:false,feedback:'Escolha um controle. Nenhum dado é transmitido.',checked:false};
  const build=()=>{
   host.innerHTML=`<div class="f2-app" id="f2-control-app">
    <div class="f2-screen-header"><h3>Componentes homologáveis · estados reais da prévia</h3><span class="f2-chip">Sem gravação / sem rede</span></div>
    <div class="f2-grid">
      <section class="f2-widget"><h3>Checkbox quadrado</h3><div class="f2-controls-block"><div class="f2-control-demo"><label><input type="checkbox" id="f2-checkbox" checked> Marcado</label><label><input type="checkbox" id="f2-checkbox-unchecked"> Desmarcado</label></div><div class="f2-control-demo"><label><input type="checkbox" id="f2-checkbox-indeterminate"> Indeterminado</label><label><input type="checkbox" id="f2-checkbox-disabled" disabled> Indisponível</label></div></div><p id="f2-checkbox-value" role="status">Marcado · indeterminado demonstrado em controle nativo.</p></section>
      <section class="f2-widget"><h3>Rádio · escolha única</h3><fieldset class="f2-choice-list"><legend>Opções de teste</legend><label><input type="radio" name="f2-radio-demo" value="A" checked> Opção A</label><label><input type="radio" name="f2-radio-demo" value="B"> Opção B</label><label><input type="radio" name="f2-radio-demo" value="C" disabled> Opção C indisponível</label></fieldset><p id="f2-radio-value" role="status">Opção A selecionada.</p></section>
      <section class="f2-widget"><h3>Switch de trilho</h3><div class="f2-control-demo"><label><input type="checkbox" id="v2-switch" role="switch" aria-checked="false"> <span id="v2-switch-label">Desativado</span></label><label><input type="checkbox" id="f2-switch-disabled" role="switch" disabled> Indisponível</label></div><p>O indicador desliza, o texto e o atributo de acessibilidade mudam juntos.</p></section>
      <section class="f2-widget"><h3>Upload local demonstrativo</h3><label for="f2-upload" class="f2-upload-zone" id="f2-upload-zone" tabindex="0">${icon('file-input')}<span>Escolher ou arrastar arquivo de teste</span><small>O conteúdo nunca é lido, armazenado ou enviado.</small></label><input type="file" id="f2-upload" class="f2-input" aria-describedby="f2-upload-status"><div id="f2-upload-file"></div><p id="f2-upload-status" role="status">Nenhum arquivo selecionado.</p><div class="f2-actions">${btn('Remover','upload-remove')}${btn('Trocar','upload-change')}${btn('Cancelar seleção','upload-cancel')}${btn('Simular erro de formato','upload-error')}</div></section>
      <section class="f2-widget"><h3>Date picker completo</h3><div class="f2-fields"><label class="f2-field">Data escolhida <output id="f2-date-value">${dmy(state.date)}</output>${btn('Escolher data','picker-open')}</label><label class="f2-field">Hora 24h<input type="time" id="f2-time" class="f2-input" value="13:30"></label><label class="f2-field">Mês/ano<input type="month" id="f2-month" class="f2-input" value="2026-11"></label><label class="f2-field">Início do intervalo<output id="f2-interval-from">${dmy(state.from)}</output>${btn('Escolher início','picker-from')}</label><label class="f2-field">Fim do intervalo<output id="f2-interval-until">${dmy(state.until)}</output>${btn('Escolher fim','picker-until')}</label></div><p id="f2-interval-status" role="status">Período de exemplo: ${dmy(state.from)}–${dmy(state.until)}.</p><div id="f2-picker-slot" hidden></div></section>
      <section class="f2-widget"><h3>Estados de salvamento ilustrativos</h3><label class="f2-field">Ciclo de exemplo<select id="v2-state-choice" class="f2-select"><option value="draft">Rascunho</option><option value="saving">Salvando</option><option value="local">Salvo localmente</option><option value="pending">Pendente de sincronização</option><option value="server">Servidor confirmou (SIMULAÇÃO)</option><option value="conflict">Conflito</option><option value="error">Erro</option><option value="offline">Sem conexão</option><option value="external">CONNECT indisponível</option></select></label><div class="f2-page-feedback" id="v2-state-render" role="status">Rascunho · nenhum dado persistido.</div></section>
      <section class="f2-widget"><h3>Menu, tooltip e filtros</h3><div class="f2-actions">${btn('Abrir menu','menu-toggle')}${btn('Aplicar filtro local','filter-toggle')}<span class="f2-tooltip">${btn('Ajuda por foco','tooltip')}<small role="tooltip">Use o teclado ou toque. Este texto explica a ação sem enviar dados.</small></span></div><div class="f2-menu" id="f2-menu" hidden><button type="button" data-f2-action="menu-copy">Duplicar exemplo</button><button type="button" data-f2-action="menu-archive">Arquivar exemplo</button><hr><button type="button" data-f2-action="menu-delete" style="color:#9B3232">Excluir exemplo (sem efeito real)</button></div><p id="f2-menu-status">Menu fechado.</p><div class="f2-segment" role="group" aria-label="Abas demonstrativas">${['Dados','Opções','Histórico'].map(n=>`<button type="button" data-f2-component-tab="${n}" aria-pressed="${state.tab===n}">${n}</button>`).join('')}</div><p id="f2-tab-output">Aba Dados · exemplo.</p><details><summary>Accordion acessível</summary><p>Detalhes abertos localmente. Use Espaço ou Enter no resumo.</p></details><div class="f2-actions">${[1,2,3].map(n=>btn(String(n),'page-'+n,n===1?'f2-selected':'')).join('')}<span id="f2-page-value">Página fictícia 1 de 3</span></div></section>
      <section class="f2-widget"><h3>Popups e feedback</h3><div class="f2-actions"><button type="button" class="f2-btn f2-primary" data-f2-action="confirm">Confirmação</button>${btn('Editar','modal-edit')}${btn('Ficha extensa','modal-details')}${btn('Mostrar toast','toast-open')}${btn('Simular carregamento','loading-toggle')}</div><div id="f2-toast-slot" role="status" aria-live="polite"></div><div id="f2-loading-slot"></div></section>
    </div><p class="f2-page-feedback" id="f2-control-feedback" role="status" aria-live="polite">${state.feedback}</p>
    <div class="f2-overlay" id="v2-modal-overlay" hidden aria-hidden="true"><div class="f2-dialog" id="f2-control-dialog" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="f2-dialog-title" data-kind="confirm"><h3 id="f2-dialog-title">Confirmação de exemplo</h3><p id="f2-dialog-text">Nenhum dado da SALTA será alterado.</p><hr><div class="f2-actions">${btn('Cancelar','modal-cancel')}${btn('Confirmar simulação','modal-affirm','f2-primary')}</div></div></div>
    </div>`;
   host.querySelector('#f2-checkbox-indeterminate').indeterminate=true;
  };
  build();
  const root=host.querySelector('#f2-control-app'),$=id=>root.querySelector('#'+id);
  const show=(msg)=>{state.feedback=msg;$('f2-control-feedback').textContent=msg;};
  const setUpload=(file,error='')=>{
   state.selectedFile=file;state.fileError=error;
   $('f2-upload-zone').classList.toggle('f2-upload-error',!!error);
   $('f2-upload-file').innerHTML=file?`<div class="f2-upload-file"><span>${icon('file-check')} ${esc(file.name)} · ${(file.size/1024).toFixed(1)} kB (nome/tamanho apenas)</span>${btn('Remover','upload-remove')}</div>`:'';
   $('f2-upload-status').textContent=error|| (file?'Arquivo de teste selecionado; não foi aberto nem transmitido.':'Nenhum arquivo selecionado.');
  };
  const stateInfo={
   draft:'Rascunho · nenhuma confirmação.',
   saving:'Salvando (simulação) · nenhuma requisição.',
   local:'Salvo localmente (simulação) · não confirmado no servidor.',
   pending:'Pendente de sincronização (simulação).',
   server:'Confirmação de servidor (APENAS EXEMPLO) · nenhum recibo real.',
   conflict:'Conflito de versões fictício · comparar antes de substituir.',
   error:'Erro de gravação fictício · rascunho preservado.',
   offline:'Sem conexão (simulada) · não enviado.',
   external:'CONNECT indisponível · nenhuma integração.'
  };
  let previousFocus=null,disposePicker=null;
  const closeModal=()=>{const overlay=$('v2-modal-overlay');overlay.hidden=true;overlay.setAttribute('aria-hidden','true');previousFocus?.focus?.({preventScroll:true});};
  const openModal=(kind,trigger)=>{
   const overlay=$('v2-modal-overlay'),dialog=$('f2-control-dialog');previousFocus=trigger;dialog.dataset.kind=kind;dialog.dataset.size=kind==='confirm'?'small':kind==='details'?'large':'normal';
   $('f2-dialog-title').textContent=kind==='edit'?'Edição demonstrativa':kind==='details'?'Ficha extensa do exemplo':'Confirmar exemplo';
   $('f2-dialog-text').textContent=kind==='details'?'Ficha sintética de grande largura, sem consulta a estudantes.':kind==='edit'?'Painel inferior em telas pequenas; nenhuma edição produtiva.':'Confirme para experimentar somente a resposta visual.';
   overlay.hidden=false;overlay.setAttribute('aria-hidden','false');dialog.focus();
  };
  function openPicker(target){
   disposePicker?.dispose?.();
   state.pickerTarget=target;
   const start=target==='from'?state.from:target==='until'?state.until:state.date;
   const slot=$('f2-picker-slot');slot.hidden=false;
   disposePicker=mountPicker(slot,{value:start,range:{from:state.from,until:state.until},onConfirm:next=>{
    if(target==='from')state.from=next;
    else if(target==='until')state.until=next;
    else state.date=next;
    $('f2-date-value').textContent=state.date?dmy(state.date):'Sem data';
    $('f2-interval-from').textContent=state.from?dmy(state.from):'Sem data';
    $('f2-interval-until').textContent=state.until?dmy(state.until):'Sem data';
    $('f2-interval-status').textContent=state.from&&state.until&&state.from>state.until?'Intervalo inválido (início depois do fim). Rever seleção.':'Intervalo sintético: '+(state.from?dmy(state.from):'—')+' a '+(state.until?dmy(state.until):'—');
    disposePicker?.dispose?.();slot.hidden=true;show('Data confirmada somente na prévia.');
   },onCancel:()=>{disposePicker?.dispose?.();slot.hidden=true;show('Date picker cancelado; valor anterior preservado.');},onClear:()=>{}});
  }
  root.addEventListener('change',e=>{
   const t=e.target;
   if(t.id==='v2-switch'){t.setAttribute('aria-checked',String(t.checked));$('v2-switch-label').textContent=t.checked?'Ativado':'Desativado';}
   if(t.name==='f2-radio-demo')$('f2-radio-value').textContent='Opção '+t.value+' selecionada (exclusiva).';
   if(t.id==='f2-checkbox'||t.id==='f2-checkbox-indeterminate'||t.id==='f2-checkbox-unchecked')$('f2-checkbox-value').textContent=t.id==='f2-checkbox-indeterminate'?'Indeterminado convertido em '+(t.checked?'marcado.':'desmarcado.'):'Controle alterado: '+(t.checked?'marcado':'desmarcado')+'.';
   if(t.id==='f2-upload'){setUpload(t.files?.[0]||null);t.value='';}
   if(t.id==='v2-state-choice')$('v2-state-render').textContent=stateInfo[t.value];
   if(t.id==='f2-time')show('Horário de exemplo: '+t.value+'. Formato 24h.');
   if(t.id==='f2-month')show('Mês/ano de exemplo: '+t.value+'.');
  });
  root.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||!root.contains(b))return;const type=b.dataset.f2Action||b.dataset.v2Action;
   if(b.dataset.f2ComponentTab){state.tab=b.dataset.f2ComponentTab;root.querySelectorAll('[data-f2-component-tab]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));$('f2-tab-output').textContent='Aba '+state.tab+' · conteúdo de exemplo selecionado.';return;}
   if(type==='picker-open'||type==='picker-from'||type==='picker-until'){openPicker(type==='picker-from'?'from':type==='picker-until'?'until':'date');return;}
   if(type==='upload-remove'||type==='upload-cancel'){setUpload(null);$('f2-upload').value='';return;}
   if(type==='upload-change'){$('f2-upload').click();return;}
   if(type==='upload-error'){setUpload(state.selectedFile,'Exemplo de erro: formato não aceito. Selecione outro arquivo.');return;}
   if(type==='menu-toggle'){$('f2-menu').hidden=!$('f2-menu').hidden;$('f2-menu-status').textContent=$('f2-menu').hidden?'Menu fechado.':'Menu aberto, opções reais apenas na prévia.';return;}
   if(type?.startsWith('menu-')){$('f2-menu').hidden=true;$('f2-menu-status').textContent='Opção '+b.textContent.trim()+' escolhida na demonstração; nenhuma informação modificada.';return;}
   if(type==='filter-toggle'){const now=b.getAttribute('aria-pressed')==='true';b.setAttribute('aria-pressed',String(!now));$('f2-menu-status').textContent=!now?'Filtro visual ativo, resultados sintéticos restritos.':'Filtro visual removido.';return;}
   if(type?.startsWith('page-')){state.page=Number(type.slice(-1));root.querySelectorAll('[data-f2-action^="page-"]').forEach(n=>n.classList.toggle('f2-selected',n===b));$('f2-page-value').textContent='Página fictícia '+state.page+' de 3';return;}
   if(type==='confirm'||type==='modal-edit'||type==='modal-details'){openModal(type==='confirm'?'confirm':type==='modal-edit'?'edit':'details',b);return;}
   if(type==='modal-cancel'){closeModal();return;}
   if(type==='modal-affirm'){closeModal();$('f2-toast-slot').innerHTML='<div class="f2-toast">✓ Confirmação ilustrativa concluída. Nada foi salvo.</div>';return;}
   if(type==='toast-open'){$('f2-toast-slot').innerHTML='<div class="f2-toast">ⓘ Toast branco com símbolo e faixa lateral. Exemplo local.</div>';return;}
   if(type==='loading-toggle'){$('f2-loading-slot').innerHTML='<div class="f2-page-feedback" role="status">◷ Estado de carregamento sintético · sem percentual inventado.</div>';return;}
  });
  $('f2-upload-zone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('f2-upload').click();}});
  for(const type of ['dragenter','dragover'])$('f2-upload-zone').addEventListener(type,e=>{e.preventDefault();$('f2-upload-zone').classList.add('f2-drag-over');});
  $('f2-upload-zone').addEventListener('dragleave',e=>{e.preventDefault();$('f2-upload-zone').classList.remove('f2-drag-over')});
  $('f2-upload-zone').addEventListener('drop',e=>{e.preventDefault();$('f2-upload-zone').classList.remove('f2-drag-over');setUpload(e.dataTransfer?.files?.[0]||null);});
  root.addEventListener('keydown',e=>{
   if($('v2-modal-overlay').hidden)return;
   if(e.key==='Escape'){e.preventDefault();closeModal();return;}
   if(e.key!=='Tab')return;
   const f=[...$('f2-control-dialog').querySelectorAll('button:not([disabled]),input:not([disabled])')];
   if(!f.length)return;const first=f[0],last=f[f.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
 }
 faviconGallery();
})();
