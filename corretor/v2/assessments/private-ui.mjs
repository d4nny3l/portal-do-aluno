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
 const button=(label,action)=>{
  const b=make('button',label,{type:'button'});
  b.onclick=async()=>{b.disabled=true;try{await action();render()}catch(error){status.textContent=error.message||'Operação não confirmada.';status.dataset.state='error'}finally{b.disabled=false}};
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
  const grant=controller.view().grants[Number(scope.value)];
  if(!grant)throw new Error('Selecione uma instituição, turma e período autorizado.');
  controller.useScope(grant);await controller.list();
 });
 const fetchLibrary=button('Atualizar biblioteca',()=>controller.list());
 const more=button('Mais resultados',()=>controller.list({more:true}));
 const chooseAssessment=button('Abrir avaliação/revisão',async()=>{
  const id=catalog.value,revision=revisions.value?Number(revisions.value):null;
  if(!id)throw new Error('Escolha uma avaliação da biblioteca.');
  await controller.open(id,revision);
 });
 const history=button('Consultar revisões',async()=>{
  if(!catalog.value)throw new Error('Escolha uma avaliação.');
  await controller.history(catalog.value);
 });
 const newDraft=button('Novo rascunho',async()=>controller.newDraft());
 const saveDraft=button('Salvar rascunho privado',()=>controller.save('draft'));
 const issue=button('Emitir nova revisão',()=>controller.save('issued'));
 const retry=button('Reenviar mesma operação',()=>controller.retry());
 const duplicate=button('Duplicar revisão',()=>controller.duplicate());
 const archive=button('Arquivar avaliação',()=>controller.archive());
 const select=button('Confirmar lote e selecionar revisão emitida',()=>controller.selectIssued());
 const resume=button('Retomar seleção pelo ID',()=>controller.resumeSelection(selectionId.value.trim()));
 const selectLabel=make('p','A câmera não identifica automaticamente avaliações com cartões de geometria igual.');
 controls.append(connect,label('Turma e período',scope),chooseScope,label('Avaliação',catalog),fetchLibrary,more,
  label('Revisão',revisions),history,chooseAssessment,newDraft,saveDraft,issue,retry,
  duplicate,archive,select,label('Seleção confirmada',selectionId),resume);
 host.replaceChildren(make('h3','Biblioteca privada · configuração autorizada'),selectLabel,controls,status);
 host.hidden=false;
 function render(){
  const s=controller.view();
  const prev=catalog.value;
  clearOptions(catalog,[{value:'',label:'Selecione uma avaliação'},...s.rows.map(x=>({
   value:x.id,label:x.title+' · rev. '+x.revision+' · '+x.state
  }))]);
  if([...catalog.options].some(x=>x.value===prev))catalog.value=prev;
  const prevRev=revisions.value;
  clearOptions(revisions,[{value:'',label:'Revisão atual'},...s.revisions.map(x=>({
   value:String(x.revision),label:'Rev. '+x.revision+' · '+x.status
  }))]);
  if([...revisions.options].some(x=>x.value===prevRev))revisions.value=prevRev;
  retry.disabled=!s.pending;
  more.disabled=!s.nextCursor;
  status.textContent=s.message;
  status.dataset.state=s.phase;
 }
 render();
 return Object.freeze({enabled:true,controller,render,controls:{scope,catalog,revisions,selectionId,connect,chooseScope,fetchLibrary,more,chooseAssessment,history,
  newDraft,saveDraft,issue,retry,duplicate,archive,select,resume}});
}
