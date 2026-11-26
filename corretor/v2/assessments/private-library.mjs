import {ASSESSMENT_LIFECYCLE_VERSION} from './lifecycle.mjs';
// Private library state machine. Only constructed in explicitly enabled local harnesses.
// The published Corretor keeps this feature disabled, with no API origin or route.
export function createPrivateLibraryController({
 client,getDraft,applyRecord=()=>{},onSelection=()=>{},onStatus=()=>{},confirmBatch=()=>false
}){
 if(!client||typeof getDraft!=='function')throw new TypeError('Cliente e editor necessários.');
 const s={phase:'unavailable',message:'Biblioteca privada indisponível; nenhuma gravação foi realizada.',
  session:null,grants:[],scope:null,rows:[],nextCursor:null,pageIndex:0,pageCursors:[null],catalogRequest:0,record:null,revisions:[],selection:null,pending:null,
  // 'new' requires an explicit new-draft/context choice; a failed open stays blocked.
  editorMode:'blocked',
  generation:0};
 const signal=(phase,message)=>{s.phase=phase;s.message=message;onStatus({phase,message})};
 const check=error=>{
  const state=client.classifyError(error);
  if(state==='session'||state==='forbidden'){
   // A revoked/expired session cannot retain writable records or a private catalog.
   resetContext();s.session=null;s.grants=[];s.scope=null;s.pending=null;
  }
  signal(state,error?.message||'Não foi possível confirmar esta operação.');throw error;
 };
 const scopeEquals=(a,b)=>['institutionId','classId','periodId'].every(k=>a?.[k]===b?.[k]);
 const secure=()=>{if(!client.enabled||!s.session||!s.scope)throw new Error('Biblioteca privada indisponível ou sem escopo autorizado.');};
 const resetContext=()=>{
  s.generation++;s.catalogRequest++;s.rows=[];s.nextCursor=null;s.pageIndex=0;s.pageCursors=[null];s.record=null;s.revisions=[];s.editorMode='blocked';
  s.selection=null;onSelection(null);
 };
 const fresh=(generation)=>s.generation===generation;
 const identity=()=>({generation:s.generation,principalId:s.session?.principalId,epoch:s.session?.epoch,
  scope:s.scope&&{...s.scope},recordId:s.record?.id??null,revision:s.record?.revision??null,
  manifestHash:s.record?.manifestHash??null});
 const sameIdentity=expected=>fresh(expected.generation)&&
  expected.principalId===s.session?.principalId&&expected.epoch===s.session?.epoch&&
  scopeEquals(expected.scope,s.scope)&&expected.recordId===(s.record?.id??null)&&
  expected.revision===(s.record?.revision??null)&&expected.manifestHash===(s.record?.manifestHash??null);
 // A different assessment in the catalog is NOT the active writable record.
 function invalidateOpenedRecord({keepRevisions=false}={}){
  s.generation++;s.record=null;if(!keepRevisions)s.revisions=[];s.editorMode='blocked';
  s.selection=null;onSelection(null);
  signal('draft','Seleção alterada. Abra e confira a avaliação antes de salvar, emitir, duplicar, arquivar ou corrigir.');
 }
 async function initialize(){
  // A reauthentication attempt cannot keep the previous teacher's writable
  // records, scope or idempotent request alive while the new identity is unknown.
  // This is also necessary if the new session/grants call later fails.
  resetContext();
  s.session=null;s.grants=[];s.scope=null;s.pending=null;
  const g=s.generation;
  if(!client.enabled){signal('unavailable','Biblioteca privada desativada. Não é possível salvar no servidor.');return false;}
  signal('loading','Verificando sessão e concessões autorizadas…');
  try{
   const session=await client.session();
   if(!fresh(g))return false;
   const grants=await client.grants();
   if(!fresh(g))return false;
   s.session=session;s.grants=grants;
   signal('draft',grants.length?'Escolha instituição, turma e período autorizado.':'Nenhuma turma autorizada para avaliações.');
   return true;
  }catch(error){if(!fresh(g))return false;check(error)}
 }
 function useScope(scope){
  if(!s.session||!s.grants.some(grant=>scopeEquals(grant,scope)))throw new Error('Escopo não concedido pela sessão SALTA.');
  resetContext();s.scope={institutionId:scope.institutionId,classId:scope.classId,periodId:scope.periodId};
  s.editorMode='new';
  signal('draft','Contexto autorizado selecionado. Novo rascunho ainda não salvo.');
 }
 async function loadPage(index,after,{refresh=false}={}){
  secure();
  if(s.pending)throw new Error('Conclua ou confira a gravação pendente antes de navegar.');
  const g=s.generation,seq=++s.catalogRequest,selectedScope={...s.scope};
  const current=()=>fresh(g)&&seq===s.catalogRequest;
  signal('loading','Consultando página '+(index+1)+' da biblioteca privada…');
  try{
   const data=await client.list(after,selectedScope);
   if(!current())return null;
   if(!Array.isArray(data?.assessments)||data.assessments.length>10)
    throw new Error('O servidor retornou uma página inválida de avaliações.');
   if(data.assessments.some(row=>!scopeEquals(row,selectedScope)))
    throw new Error('Catálogo incompatível com a turma selecionada.');
   if(data.nextCursor!=null&&(!data.assessments.length||data.nextCursor!==data.assessments.at(-1).id))
    throw new Error('Cursor de catálogo inválido.');
   s.rows=data.assessments;s.nextCursor=data.nextCursor??null;
   s.pageIndex=index;
   if(refresh)s.pageCursors=[null];
   s.pageCursors[index]=after;
   s.pageCursors.length=index+1;
   signal('draft',s.rows.length?
    'Página '+(index+1)+' carregada · '+s.rows.length+' avaliação(ões), sem gabaritos na listagem.':
    'Nenhuma avaliação nesta turma.');
   return s.rows;
  }catch(error){if(!current())return null;check(error)}
 }
 async function list({more=false}={}){
  if(more)return nextPage(); // Compatibility: "Mais resultados" now advances one page.
  return loadPage(0,null,{refresh:true});
 }
 async function nextPage(){
  secure();if(!s.nextCursor)return s.rows;
  return loadPage(s.pageIndex+1,s.nextCursor);
 }
 async function previousPage(){
  secure();if(s.pageIndex===0)return s.rows;
  return loadPage(s.pageIndex-1,s.pageCursors[s.pageIndex-1]??null);
 }
 async function open(assessmentId,revision=null){
  secure();
  // Clear the old writable target BEFORE the GET, even if the new GET fails.
  invalidateOpenedRecord();
  const g=s.generation;
  signal('loading','Recuperando revisão privada autorizada…');
  try{
   const record=await client.open(assessmentId,revision);
   if(!fresh(g))return null;
   if(!scopeEquals(record,s.scope))throw new Error('A revisão pertence a outro contexto autorizado.');
   // A failed editor restore must not leave a writable record behind.
   applyRecord(record);
   if(!fresh(g))return null;
   s.record=record;s.editorMode='opened';
   signal('loaded','Revisão '+record.revision+' recuperada. Abrir não gravou conteúdo.');
   return record;
  }catch(error){if(!fresh(g))return null;check(error)}
 }
 async function history(assessmentId=s.record?.id){
  secure();const g=s.generation;
  try{
   const revisions=await client.history(assessmentId);
   if(!fresh(g))return null;s.revisions=revisions;
   signal('loaded','Histórico carregado, sem modificar revisões antigas.');
   return revisions;
  }catch(error){if(!fresh(g))return null;check(error)}
 }
 function newDraft(){secure();resetContext();s.editorMode='new';signal('draft','Novo rascunho não salvo. Confirme o contexto antes de registrar.')}
 async function runPending(operation,verify,onSuccess){
  const g=s.generation;
  const old=s.pending;
  const context=old?.operation===operation?old.context:identity();
  if(!sameIdentity(context))
   throw new Error('Operação pendente pertence a outra avaliação, sessão ou turma. Reabra o contexto de origem.');
  const pending={operation,verify,onSuccess,context};
  s.pending=pending;
  signal('saving','Enviando operação; aguardando recibo e consulta de confirmação…');
  try{
   const result=await verify(operation);
   if(s.pending===pending)s.pending=null;
   if(!sameIdentity(context))return null; // A later context owns the UI; never overwrite it.
   onSuccess(result);
   return result;
  }catch(error){if(!sameIdentity(context))return null;
   if([404,409,410].includes(error?.status)&&!error.retryable){s.pending=null;invalidateOpenedRecord();}
   check(error)}
 }
 async function save(status='draft'){
  secure();
  if(s.pending)throw new Error('Há operação sem confirmação. Reenvie a mesma ou descarte conscientemente.');
  if(!['draft','issued'].includes(status))throw new Error('Estado inválido.');
  if(s.editorMode!=='new'&&s.editorMode!=='opened')
   throw new Error('Nenhuma avaliação ativa. Reabra a avaliação desejada ou escolha Novo rascunho antes de gravar.');
  if(s.editorMode==='opened'&&!s.record)throw new Error('A avaliação ativa não foi confirmada.');
  if(s.record&&s.session.assessmentLifecycleVersion!==ASSESSMENT_LIFECYCLE_VERSION)throw new Error('Este servidor ainda não confirma a substituição definitiva. Nada foi salvo.');
  const editor=getDraft();
  const current=s.record;
  const op=client.prepareSave({plan:editor.plan,manifest:editor.manifest,editorSnapshot:editor.editorSnapshot,scope:{...s.scope},
   assessmentId:current?.id||null,expectedRevision:current?.revision||0,status,lifecycleVersion:s.session.assessmentLifecycleVersion===ASSESSMENT_LIFECYCLE_VERSION?ASSESSMENT_LIFECYCLE_VERSION:null});
  return runPending(op,op0=>client.saveAndVerify(op0),res=>{
   if(s.selection){s.selection=null;onSelection(null);}s.record=res.record;s.editorMode='opened';signal('saved','Salvo · revisão '+res.record.revision+' confirmada pelo recibo e consulta do servidor.');
  });
 }
 async function retry(){
  if(!s.pending)throw new Error('Não há operação pendente a reenviar.');
  const {operation,verify,onSuccess,context}=s.pending;
  if(!sameIdentity(context))throw new Error('Não reenvie operação da avaliação ou sessão anterior. Reabra o contexto de origem.');
  // The original requestId, complete body, scope and CAS are preserved exactly.
  return runPending(operation,verify,onSuccess);
 }
 function abandonPending(){
  if(!s.pending)return false;
  s.pending=null;signal('draft','Operação local abandonada; o servidor pode ter concluído a gravação. Consulte a biblioteca antes de continuar.');
  return true;
 }
 async function duplicate(sourceRevision=s.record?.revision){
  secure();if(s.editorMode!=='opened'||!s.record)throw new Error('Abra uma avaliação para duplicar.');
  if(s.pending)throw new Error('Existe operação pendente.');
  const op=client.prepareDuplicate(s.record.id,sourceRevision);
  return runPending(op,op0=>client.duplicateAndVerify(op0),res=>{
   applyRecord(res.record);s.record=res.record;s.editorMode='opened';
   signal('saved','Cópia privada confirmada com novo ID e revisão 1 em rascunho.');
  });
 }
 async function erase(){
  secure();if(s.session.assessmentLifecycleVersion!==ASSESSMENT_LIFECYCLE_VERSION)throw new Error('Exclusão indisponível neste servidor.');
  if(s.editorMode!=='opened'||!s.record||s.pending)throw new Error('Reabra a avaliação e conclua operações pendentes antes de excluir.');
  const op=client.prepareDelete(s.record.id,s.record.revision);
  return runPending(op,op0=>client.deleteAndVerify(op0),()=>{
   s.record=null;s.selection=null;s.revisions=[];s.editorMode='blocked';onSelection(null);
   signal('deleted','Avaliação excluída permanentemente.');
  });
 }
 // Invalidate a correction key without discarding the opened editor or pending CAS.
 function discardSelection(){s.selection=null;onSelection(null)}
 // Confirmed authorization loss, including a changed principal/epoch in the background.
 function revokeAuthorization(){resetContext();s.session=null;s.grants=[];s.scope=null;s.pending=null;signal('session','Sessão ou concessão alterada. Entre novamente pela SALTA.');}
 let selectionVerification=null;
 function verifySelection(){
  secure();const selected=s.selection,context=identity();if(!selected)throw new Error('Selecione novamente a avaliação para corrigir.');
  if(selectionVerification?.selected===selected)return selectionVerification.promise;
  const pending={selected,promise:null};selectionVerification=pending;
  pending.promise=(async()=>{try{
   const verified=await client.resumeSelection(selected.selectionId,{assessmentId:selected.assessmentId,revision:selected.revision,manifestHash:selected.manifestHash});
   if(!sameIdentity(context)||s.selection!==selected)return false;
   return verified.selectionId===selected.selectionId;
  }catch(error){if(sameIdentity(context)){invalidateOpenedRecord();check(error)}return false;}finally{if(selectionVerification===pending)selectionVerification=null;}})();
  return pending.promise;
 }
 async function archive(){
  secure();if(s.editorMode!=='opened'||!s.record)throw new Error('Abra uma avaliação para arquivar.');
  if(s.pending)throw new Error('Existe operação pendente.');
  const op=client.prepareArchive(s.record.id,s.record.revision);
  return runPending(op,op0=>client.archiveAndVerify(op0),res=>{
   s.record=res.record;signal('saved','Arquivamento confirmado por recibo e consulta ao servidor.');
  });
 }
 async function selectIssued(){
  secure();
  if(s.editorMode!=='opened'||!s.record||s.record.status!=='issued'||s.record.archived)
   throw new Error('Abra uma revisão emitida e ativa antes de selecionar para correção.');
  if(s.pending)throw new Error('Existe operação pendente.');
  const record=s.record,context=identity(); // Capture before the asynchronous teacher confirmation.
  // Two physically identical forms can carry different answer keys.
  const confirmed=await confirmBatch({title:record.definition.title,assessmentId:record.id,
   revision:record.revision,manifestHash:record.manifestHash,
   warning:'Confirme a avaliação e revisão do lote físico. A câmera não distingue provas de mesma geometria.'});
  if(!sameIdentity(context)||s.editorMode!=='opened')return null;
  if(!confirmed)throw new Error('Lote não confirmado pelo professor. Nenhuma seleção foi criada.');
  const op=client.prepareSelection(record.id,record.revision);
  return runPending(op,op0=>client.selectAndVerify(op0),res=>{
   if(!sameIdentity(context)||s.editorMode!=='opened')return;
   const selection=res?.selection;
   if(!selection||selection.selectionId!==op.payload.selectionId||
      selection.assessmentId!==context.recordId||selection.revision!==context.revision||
      selection.manifestHash!==context.manifestHash||!scopeEquals(selection.scope,context.scope))
    throw new Error('Seleção retornada não corresponde à avaliação, revisão, manifesto ou turma confirmados.');
   s.selection=selection;onSelection(selection);
   signal('selected','Revisão emitida '+selection.revision+' fixada na sessão de correção '+selection.selectionId+'.');
  });
 }
 async function resumeSelection(selectionId){
  secure();const g=++s.generation;s.selection=null;onSelection(null);
  signal('loading','Retomando seleção privada, sem reinterpretar revisão antiga…');
  try{
   const selection=await client.resumeSelection(selectionId);
   if(!fresh(g))return null;
   if(!scopeEquals(selection.scope,s.scope))throw new Error('Seleção de outro contexto.');
   s.selection=selection;onSelection(selection);
   signal('selected','Seleção '+selection.selectionId+' recuperada; revisão '+selection.revision+' imutável.');
   return selection;
  }catch(error){if(!fresh(g))return null;check(error)}
 }
 return {initialize,useScope,list,nextPage,previousPage,open,history,newDraft,invalidateOpenedRecord,save,retry,abandonPending,duplicate,archive,erase,verifySelection,
  selectIssued,resumeSelection,discardSelection,revokeAuthorization,
  view:()=>({phase:s.phase,message:s.message,session:s.session,grants:s.grants,scope:s.scope,rows:s.rows,
   nextCursor:s.nextCursor,pageIndex:s.pageIndex,pageSize:10,hasPrevious:s.pageIndex>0,record:s.record,editorMode:s.editorMode,generation:s.generation,revisions:s.revisions,selection:s.selection,
   pending:s.pending&&{method:s.pending.operation.method,path:s.pending.operation.path,
     requestId:s.pending.operation.payload.requestId}})};
}
