// UI controller for local-only integrated assessment drafts.
// It does not persist or invoke the protected assessment repository.
import {QUESTION_TYPES} from '../omr/assessment.mjs';
import {applyKeyPaste,createIntegratedPlan,draftSummary,keyTextForPlan,formatExact,POINT_SCALE} from './block-scoring.mjs';

export function installIntegratedDraftPlanner({document,getSections,getMetadata,getModel,prepareModel,snapshotEditor,restoreEditor,activate,deactivate,openCorrection,bankActive}){
 const $=id=>document.getElementById(id);
 const state={values:{},answers:{},display:'both',records:[],nextId:0,currentId:null,active:null,signature:null,restoring:false};
 const status=(message,kind='info')=>{$('integratedStatus').textContent=message;$('integratedStatus').dataset.state=kind};
 const editorSignature=()=>JSON.stringify({sections:getSections(),metadata:getMetadata(),modelHash:getModel()?.contentHash||null,values:state.values,answers:state.answers,display:state.display});
 function invalidate(){
  if(!state.active)return;
  state.active=null;state.signature=null;deactivate();
  $('integratedReadingStatus').textContent='Nenhuma avaliação integrada selecionada nesta sessão.';
 }
 function notifyChanged(){
  if(state.restoring)return;
  if(state.active&&state.signature!==editorSignature())invalidate();
  showSummary();
 }
 const elem=(tag,attrs={},label='')=>{
  const node=document.createElement(tag);
  for(const [name,value]of Object.entries(attrs)){
   if(name==='className'||name==='value'||name==='type'||name==='inputMode'||name==='placeholder'||name==='maxLength')node[name]=value;
   else node.setAttribute(name,String(value));
  }
  if(label)node.textContent=label;
  return node;
 };
 const option=(value,label)=>elem('option',{value},label);
 function currentMeta(){return getMetadata()}
 function compile({revision=1}={}){
  if(bankActive())throw Error('Banco autenticado de homologação ativo. Use somente revisões confirmadas pelo servidor.');
  if(!prepareModel())throw Error('Gere uma prévia válida do cartão antes de vincular a avaliação.');
  const model=getModel();
  return createIntegratedPlan({metadata:currentMeta(),sections:getSections(),values:state.values,answers:state.answers,display:state.display,model,revision});
 }
 function showSummary(){
  if(!getSections().length){$('integratedTotal').textContent='Valor total dos blocos: —';$('integratedKeyCount').textContent='Gabarito pendente';status('Adicione um bloco para começar a avaliação.','draft');return}
  try{
   const sum=draftSummary({sections:getSections(),values:state.values,answers:state.answers});
   $('integratedTotal').textContent='Valor total dos blocos: '+sum.total+' ponto(s)';
   $('integratedKeyCount').textContent=(sum.blocks.reduce((n,b)=>n+b.filled,0))+' de '+sum.blocks.reduce((n,b)=>n+b.count,0)+' respostas informadas';
   if(sum.invalidAmounts||sum.missing)status('Preencha o valor de cada bloco e o gabarito completo antes de selecionar para correção.','draft');
   else if(state.active)status('Avaliação selecionada nesta sessão. A nota por bloco será aplicada à leitura.','ready');
   else status('Configuração completa nesta aba. Selecione para corrigir ou registre uma versão temporária.','ready');
  }catch(error){$('integratedTotal').textContent='Valor total dos blocos: —';$('integratedKeyCount').textContent='Gabarito pendente';status(error.message,'error');}
 }
 function refresh(){
  if(state.restoring)return;
  if(state.active&&state.signature!==editorSignature())invalidate();
  const valuesHost=$('integratedBlockValues'),keyHost=$('integratedVisualKey');
  valuesHost.replaceChildren();keyHost.replaceChildren();
  const sections=getSections();
  try{
   for(const section of sections){
    const row=elem('label',{className:'integrated-value-row'}),title=elem('span',{},section.label+' · '+section.items.length+' questões');
    const input=elem('input',{type:'text',inputMode:'decimal',value:state.values[section.sectionId]??'',placeholder:'Valor, ex.: 4'});
    input.setAttribute('aria-label','Valor do bloco '+section.label);
    input.oninput=()=>{state.values[section.sectionId]=input.value;notifyChanged()};
    row.append(title,input);valuesHost.append(row);
    for(const question of section.items){
     const label=elem('label',{className:'integrated-key-item'}),caption=elem('span',{},'Questão '+question.number+' · '+question.type);
     const select=elem('select');
     select.setAttribute('aria-label','Gabarito da questão '+question.number);
     select.append(option('','Selecione…'));
     for(const choice of QUESTION_TYPES[question.type]||[])select.append(option(choice,choice));
     select.value=(QUESTION_TYPES[question.type]||[]).includes(state.answers[question.questionId])?state.answers[question.questionId]:'';
     select.onchange=()=>{if(select.value)state.answers[question.questionId]=select.value;else delete state.answers[question.questionId];notifyChanged()};
     label.append(caption,select);keyHost.append(label);
    }
   }
  }catch(error){status(error.message,'error');}
  showSummary();
 }
 function chosenRecord(){
  const key=$('integratedLocalLibrary').value;
  const record=state.records.find(item=>item.id+'@'+item.revision===key);
  if(!record)throw Error('Escolha uma versão disponível nesta aba.');
  return record;
 }
 function refreshLibrary(){
  const filter=$('integratedSearch').value.trim().toLocaleLowerCase('pt-BR');
  const select=$('integratedLocalLibrary'),before=select.value;
  select.replaceChildren(option('','Escolha uma versão…'));
  for(const record of state.records){
   if(!record.plan.metadata.title.toLocaleLowerCase('pt-BR').includes(filter))continue;
   select.append(option(record.id+'@'+record.revision,record.plan.metadata.title+' · rev. local '+record.revision+' · '+record.plan.metadata.subject));
  }
  if([...select.options].some(x=>x.value===before))select.value=before;
 }
 function remember(){
  try{
   const id=state.currentId||'aba-'+(++state.nextId);
   const revision=1+Math.max(0,...state.records.filter(x=>x.id===id).map(x=>x.revision));
   const plan=compile({revision});
   const editor=structuredClone(snapshotEditor());
   state.records.push({id,revision,plan,editor,values:{...state.values},answers:{...state.answers},display:state.display});
   state.currentId=id;
   refreshLibrary();$('integratedLocalLibrary').value=id+'@'+revision;
   status('Revisão local '+revision+' registrada apenas nesta aba. Nenhum dado foi salvo em servidor.','ready');
  }catch(error){status(error.message,'error');}
 }
 function openRecord({duplicate=false}={}){
  try{
   if(bankActive())throw Error('A biblioteca temporária não substitui as revisões autenticadas do Banco.');
   const record=chosenRecord();invalidate();state.restoring=true;
   try{
    restoreEditor(structuredClone(record.editor));
    state.values={...record.values};state.answers={...record.answers};state.display=record.display;
    $('integratedDisplay').value=state.display;
    state.currentId=duplicate?null:record.id;
   }finally{state.restoring=false}
   refresh();
   status(duplicate?'Cópia temporária aberta. Edite e registre uma versão nesta aba.':'Revisão '+record.revision+' aberta para edição nesta aba.','ready');
  }catch(error){state.restoring=false;status(error.message,'error');}
 }
 function selectForCorrection(){
  try{
   const revision=state.currentId?1+Math.max(0,...state.records.filter(x=>x.id===state.currentId).map(x=>x.revision)):1;
   const plan=compile({revision});
   activate(plan,keyTextForPlan(plan));
   state.active=plan;state.signature=editorSignature();
   $('integratedReadingStatus').textContent=plan.metadata.title+' · revisão local '+plan.revision+' · '+plan.blocks.length+' blocos · modelo vinculado nesta aba. A câmera não identifica automaticamente a avaliação.';
   status('Avaliação selecionada nesta sessão. Não houve gravação em servidor.','ready');
   openCorrection();
  }catch(error){status(error.message,'error');}
 }
 $('integratedPasteApply').onclick=()=>{
  try{
   state.answers={...applyKeyPaste($('integratedPaste').value,getSections(),state.answers)};
   $('integratedPaste').value='';notifyChanged();refresh();
   status('Gabarito atualizado. Confira as alternativas antes de selecionar.','ready');
  }catch(error){status(error.message,'error');}
 };
 $('integratedDisplay').onchange=()=>{state.display=$('integratedDisplay').value;notifyChanged()};
 $('integratedUse').onclick=selectForCorrection;
 $('integratedRemember').onclick=remember;
 $('integratedOpen').onclick=()=>openRecord();
 $('integratedDuplicate').onclick=()=>openRecord({duplicate:true});
 $('integratedSearch').oninput=refreshLibrary;
 $('integratedNew').onclick=()=>{
  invalidate();state.currentId=null;state.values={};state.answers={};state.display='both';
  $('integratedDisplay').value='both';refresh();
  status('Novo planejamento temporário. Os blocos existentes continuam no editor; edite-os antes de registrar.','draft');
 };
 refreshLibrary();refresh();
 return {refresh,notifyChanged,active:()=>state.active,sessionRecords:()=>state.records.map(x=>({id:x.id,revision:x.revision,title:x.plan.metadata.title}))};
}
