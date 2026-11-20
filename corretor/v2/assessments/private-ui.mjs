// Private library UI. Only mounts when explicitly enabled in a separately
// authorized runtime with a verified gateway and server-enforced grants.
import {createPrivateLibraryController} from './private-library.mjs';

export function installPrivateAssessmentUI({document,client,getDraft,applyRecord,onSelection,bankActive=()=>false,confirmBatch=()=>false}){
 const host=document.getElementById('privateAssessmentsHost');
 if(!host)throw new Error('Área da biblioteca privada ausente.');
 if(!client.enabled||bankActive()){
  host.hidden=true;
  host.textContent='Biblioteca privada indisponível; nenhuma avaliação foi salva no servidor.';
  return Object.freeze({enabled:false});
 }
 const make=(tag,label='',attrs={})=>{
  const item=document.createElement(tag);
  if(label)item.textContent=label;
  for(const [name,value]of Object.entries(attrs)){
   if(name==='value'||name==='type'||name==='placeholder')item[name]=value;
   else item.setAttribute(name,String(value));
  }
  return item;
 };
 const status=make('p','Aguardando sessão SALTA verificada.',{role:'status','aria-live':'polite'});
 const scope=make('select','',{ 'aria-label':'Instituição, turma e período autorizados'});
 const catalog=make('select','',{'aria-label':'Avaliação privada'});
 const revisions=make('select','',{'aria-label':'Revisão da avaliação'});
 const selectionId=make('input','',{type:'text',placeholder:'UUID de seleção confirmada','aria-label':'ID da sessão de correção'});
 const pageLabel=make('p','Página 1 · nenhuma avaliação carregada.',{'aria-live':'polite'});
 const activeLabel=make('p','Nenhuma avaliação privada aberta.',{'aria-live':'polite'});
 const button=(label,action)=>{
  const b=make('button',label,{type:'button'});
  b.onclick=async()=>{
   if(b.disabled)return;
   b.disabled=true;
   let failure=null;
   try{await action()}catch(error){failure=error}
   finally{
    // Release the busy lock, then recompute permanent eligibility from the controller.
    b.disabled=false;
    render();
    if(failure&&controller.view().message!==failure.message){
     status.textContent=failure.message||'Operação não confirmada.';
     status.dataset.state='error';
    }
   }
  };
  return b;
 };
 const clearOptions=(node,items)=>{
  node.replaceChildren(...items.map(x=>make('option',x.label,{value:x.value})));
 };
 const label=(name,control)=>{const el=make('label',name);el.append(control);return el};
 const controls=make('div','',{class:'private-assessments-controls'});
 const controller=createPrivateLibraryController({client,getDraft,applyRecord,onSelection,confirmBatch,
  onStatus:({phase,message})=>{status.textContent=message;status.dataset.state=phase}});
 const connect=button('Conectar à sessão SALTA',async()=>{
  await controller.initialize();
  const s=controller.view();
  clearOptions(scope,[{value:'',label:'Selecione uma turma autorizada'},...s.grants.map((grant,i)=>({
   value:String(i),label:grant.institutionId+' / '+grant.classId+' / '+grant.periodId
  }))]);
 });
 const chooseScope=button('Abrir turma',async()=>{
  const grant=scope.value===''?null:controller.view().grants[Number(scope.value)];
  if(!grant)throw new Error('Selecione uma instituição, turma e período autorizado.');
  controller.useScope(grant);await controller.list();
 });
 const fetchLibrary=button('Atualizar biblioteca',()=>controller.list());
 const previous=button('Página anterior',()=>controller.previousPage());
 const more=button('Próxima página',()=>controller.nextPage());
 const chooseAssessment=button('Abrir avaliação/revisão',async()=>{
  const id=catalog.value,revision=revisions.value?Number(revisions.value):null;
  if(!id)throw new Error('Escolha uma avaliação da biblioteca.');
  await controller.open(id,revision);
 });
 const history=button('Consultar revisões',async()=>{
  if(!catalog.value)throw new Error('Escolha uma avaliação.');
  await controller.history(catalog.value);
 });
 const newDraft=button('Novo rascunho',async()=>{catalog.value='';revisions.value='';controller.newDraft()});
 const saveDraft=button('Salvar rascunho privado',()=>controller.save('draft'));
 const issue=button('Emitir nova revisão',()=>controller.save('issued'));
 const retry=button('Reenviar mesma operação',()=>controller.retry());
 const duplicate=button('Duplicar revisão',()=>controller.duplicate());
 const archive=button('Arquivar avaliação',()=>controller.archive());
 const select=button('Confirmar lote e selecionar revisão emitida',()=>controller.selectIssued());
 const resume=button('Retomar seleção pelo ID',()=>controller.resumeSelection(selectionId.value.trim()));
 // Changing a displayed candidate cannot leave the previously opened record writable.
 catalog.onchange=()=>{controller.invalidateOpenedRecord();render()};
 revisions.onchange=()=>{controller.invalidateOpenedRecord({keepRevisions:true});render()};
 scope.onchange=()=>{controller.invalidateOpenedRecord();render()};
 const selectLabel=make('p','A câmera não identifica automaticamente avaliações com cartões de geometria igual.');
 controls.append(connect,label('Turma e período',scope),chooseScope,label('Avaliação',catalog),pageLabel,previous,more,fetchLibrary,
  label('Revisão',revisions),history,chooseAssessment,activeLabel,newDraft,saveDraft,issue,retry,
  duplicate,archive,select,label('Seleção confirmada',selectionId),resume);
 host.replaceChildren(make('h3','Biblioteca privada · configuração autorizada'),selectLabel,controls,status);
 host.hidden=false;
 function render(){
  const s=controller.view(),prev=catalog.value,prevRev=revisions.value;
  const rows=s.rows.map(x=>({value:x.id,label:x.title+' · rev. '+x.revision+' · '+x.state}));
  // Only the ten actual page rows appear in the catalog. An opened record
  // outside this page is shown separately, never disguised as an 11th result.
  clearOptions(catalog,[{value:'',label:'Selecione uma avaliação'},...rows]);
  if(s.record&&s.editorMode==='opened'&&rows.some(x=>x.value===s.record.id))
   catalog.value=s.record.id;
  else if(rows.some(x=>x.value===prev))catalog.value=prev;
  pageLabel.textContent=s.rows.length?'Página '+(s.pageIndex+1)+' · '+s.rows.length+' avaliação(ões) nesta página':
   'Página '+(s.pageIndex+1)+' · nenhuma avaliação nesta turma';
  activeLabel.textContent=s.record&&s.editorMode==='opened'?
   'Registro aberto: '+(s.record.definition?.title||s.record.id)+' · revisão '+s.record.revision+' · ID '+s.record.id:
   'Nenhuma avaliação privada aberta para gravação.';
  clearOptions(revisions,[{value:'',label:'Revisão atual'},...s.revisions.map(x=>({
   value:String(x.revision),label:'Rev. '+x.revision+' · '+x.status
  }))]);
  if([...revisions.options].some(x=>x.value===prevRev))revisions.value=prevRev;
  const matchesOpened=s.editorMode==='opened'&&Boolean(s.record)&&
   (!catalog.value||s.record.id===catalog.value)&&
   (!revisions.value||Number(revisions.value)===s.record.revision);
  const newDraftReady=s.editorMode==='new'&&!s.record&&!catalog.value;
  const canWrite=Boolean(s.scope&&!s.pending&&(matchesOpened||newDraftReady));
  saveDraft.disabled=!canWrite;issue.disabled=!canWrite;
  duplicate.disabled=!matchesOpened||Boolean(s.pending);
  archive.disabled=!matchesOpened||Boolean(s.pending);
  select.disabled=!matchesOpened||Boolean(s.pending)||s.record.status!=='issued'||Boolean(s.record.archived);
  retry.disabled=!s.pending;
  previous.disabled=!s.scope||!s.hasPrevious||Boolean(s.pending);
  more.disabled=!s.scope||!s.nextCursor||Boolean(s.pending);
  fetchLibrary.disabled=!s.scope||Boolean(s.pending);
  chooseAssessment.disabled=!s.scope||!catalog.value||Boolean(s.pending);
  history.disabled=!s.scope||!catalog.value;
  chooseScope.disabled=!s.session;
  if(!s.session)clearOptions(scope,[{value:'',label:'Conecte-se novamente à SALTA'}]);
  status.textContent=s.message;
  status.dataset.state=s.phase;
 }
 render();
 return Object.freeze({enabled:true,controller,render,controls:{scope,catalog,revisions,selectionId,connect,chooseScope,fetchLibrary,more,chooseAssessment,history,
  newDraft,saveDraft,issue,retry,duplicate,archive,select,resume,previous,pageLabel,activeLabel}});
}
