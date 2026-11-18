// Private library state machine. Only constructed in explicitly enabled local harnesses.
// The published Corretor keeps this feature disabled, with no API origin or route.
export function createPrivateLibraryController({
 client,getDraft,applyRecord=()=>{},onSelection=()=>{},onStatus=()=>{},confirmBatch=()=>false
}){
 if(!client||typeof getDraft!=='function')throw new TypeError('Cliente e editor necessários.');
 const s={phase:'unavailable',message:'Biblioteca privada indisponível; nenhuma gravação foi realizada.',
  session:null,grants:[],scope:null,rows:[],nextCursor:null,record:null,revisions:[],selection:null,pending:null,
  generation:0};
 const signal=(phase,message)=>{s.phase=phase;s.message=message;onStatus({phase,message})};
 const check=error=>{
  const state=client.classifyError(error);
  if(state==='session'||state==='forbidden'){s.generation++;s.selection=null;onSelection(null);}
  signal(state,error?.message||'Não foi possível confirmar esta operação.');throw error;
 };
 const scopeEquals=(a,b)=>['institutionId','classId','periodId'].every(k=>a?.[k]===b?.[k]);
 const secure=()=>{if(!client.enabled||!s.session||!s.scope)throw new Error('Biblioteca privada indisponível ou sem escopo autorizado.');};
 const resetContext=()=>{
  s.generation++;s.rows=[];s.nextCursor=null;s.record=null;s.revisions=[];
  s.selection=null;onSelection(null);
 };
 const fresh=(generation)=>s.generation===generation;
 async function initialize(){
  if(!client.enabled){signal('unavailable','Biblioteca privada desativada. Não é possível salvar no servidor.');return false;}
  const g=++s.generation;signal('loading','Verificando sessão e concessões autorizadas…');
  try{
   const session=await client.session(),grants=await client.grants();
   if(!fresh(g))return false;
   s.session=session;s.grants=grants;
   signal('draft',grants.length?'Escolha instituição, turma e período autorizado.':'Nenhuma turma autorizada para avaliações.');
   return true;
  }catch(error){check(error)}
 }
 function useScope(scope){
  if(!s.session||!s.grants.some(grant=>scopeEquals(grant,scope)))throw new Error('Escopo não concedido pela sessão SALTA.');
  resetContext();s.scope={institutionId:scope.institutionId,classId:scope.classId,periodId:scope.periodId};
  signal('draft','Contexto autorizado selecionado. Nenhuma avaliação foi criada ao abrir a biblioteca.');
 }
 async function list({more=false}={}){
  secure();const g=s.generation;signal('loading','Consultando biblioteca privada…');
  try{
   const data=await client.list(more?s.nextCursor:null);
   if(!fresh(g))return null;
   s.rows=more?s.rows.concat(data.assessments):data.assessments;
   s.nextCursor=data.nextCursor;
   signal('draft','Biblioteca consultada. Nenhuma avaliação foi alterada.');
   return s.rows;
  }catch(error){check(error)}
 }
 async function open(assessmentId,revision=null){
  secure();const g=++s.generation;s.selection=null;onSelection(null);
  signal('loading','Recuperando revisão privada autorizada…');
  try{
   const record=await client.open(assessmentId,revision);
   if(!fresh(g))return null;
   if(!scopeEquals(record,s.scope))throw new Error('A revisão pertence a outro contexto autorizado.');
   s.record=record;applyRecord(record);
   signal('loaded','Revisão '+record.revision+' recuperada. Abrir não gravou conteúdo.');
   return record;
  }catch(error){check(error)}
 }
 async function history(assessmentId=s.record?.id){
  secure();const g=s.generation;
  try{
   const revisions=await client.history(assessmentId);
   if(!fresh(g))return null;s.revisions=revisions;
   signal('loaded','Histórico carregado, sem modificar revisões antigas.');
   return revisions;
  }catch(error){check(error)}
 }
 function newDraft(){secure();resetContext();signal('draft','Rascunho não salvo. Confirme o contexto antes de registrar.')}
 async function runPending(operation,verify,onSuccess){
  const g=s.generation;s.pending={operation,verify,onSuccess};
  signal('saving','Enviando operação; aguardando recibo e consulta de confirmação…');
  try{
   const result=await verify(operation);
   s.pending=null;
   if(!fresh(g)){signal('draft','Operação confirmada no contexto anterior; reabra a avaliação correspondente.');return result}
   onSuccess(result);
   return result;
  }catch(error){check(error)}
 }
 async function save(status='draft'){
  secure();
  if(s.pending)throw new Error('Há operação sem confirmação. Reenvie a mesma ou descarte conscientemente.');
  if(!['draft','issued'].includes(status))throw new Error('Estado inválido.');
  const editor=getDraft();
  const current=s.record;
  const op=client.prepareSave({plan:editor.plan,manifest:editor.manifest,scope:{...s.scope},
   assessmentId:current?.id||null,expectedRevision:current?.revision||0,status});
  return runPending(op,op0=>client.saveAndVerify(op0),res=>{
   s.record=res.record;signal('saved','Salvo · revisão '+res.record.revision+' confirmada pelo recibo e consulta do servidor.');
  });
 }
 async function retry(){
  if(!s.pending)throw new Error('Não há operação pendente a reenviar.');
  const {operation,verify,onSuccess}=s.pending;
  // The original requestId, complete body, scope and CAS are preserved exactly.
  return runPending(operation,verify,onSuccess);
 }
 function abandonPending(){
  if(!s.pending)return false;
  s.pending=null;signal('draft','Operação local abandonada; o servidor pode ter concluído a gravação. Consulte a biblioteca antes de continuar.');
  return true;
 }
 async function duplicate(sourceRevision=s.record?.revision){
  secure();if(!s.record)throw new Error('Abra uma avaliação para duplicar.');
  if(s.pending)throw new Error('Existe operação pendente.');
  const op=client.prepareDuplicate(s.record.id,sourceRevision);
  return runPending(op,op0=>client.duplicateAndVerify(op0),res=>{
   s.record=res.record;applyRecord(res.record);
   signal('saved','Cópia privada confirmada com novo ID e revisão 1 em rascunho.');
  });
 }
 async function archive(){
  secure();if(!s.record)throw new Error('Abra uma avaliação para arquivar.');
  if(s.pending)throw new Error('Existe operação pendente.');
  const op=client.prepareArchive(s.record.id,s.record.revision);
  return runPending(op,op0=>client.archiveAndVerify(op0),res=>{
   s.record=res.record;signal('saved','Arquivamento confirmado por recibo e consulta ao servidor.');
  });
 }
 async function selectIssued(){
  secure();
  if(!s.record||s.record.status!=='issued'||s.record.archived)throw new Error('Selecione uma revisão emitida e ativa.');
  if(s.pending)throw new Error('Existe operação pendente.');
  const record=s.record;
  // Two physically identical forms can carry different answer keys.
  const confirmed=await confirmBatch({title:record.definition.title,assessmentId:record.id,
   revision:record.revision,manifestHash:record.manifestHash,
   warning:'Confirme a avaliação e revisão do lote físico. A câmera não distingue provas de mesma geometria.'});
  if(!confirmed)throw new Error('Lote não confirmado pelo professor. Nenhuma seleção foi criada.');
  const op=client.prepareSelection(record.id,record.revision);
  return runPending(op,op0=>client.selectAndVerify(op0),res=>{
   s.selection=res.selection;onSelection(res.selection);
   signal('selected','Revisão emitida '+res.selection.revision+' fixada na sessão de correção '+res.selection.selectionId+'.');
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
  }catch(error){check(error)}
 }
 return {initialize,useScope,list,open,history,newDraft,save,retry,abandonPending,duplicate,archive,
  selectIssued,resumeSelection,
  view:()=>({phase:s.phase,message:s.message,session:s.session,grants:s.grants,scope:s.scope,rows:s.rows,
   nextCursor:s.nextCursor,record:s.record,revisions:s.revisions,selection:s.selection,
   pending:s.pending&&{method:s.pending.operation.method,path:s.pending.operation.path,
     requestId:s.pending.operation.payload.requestId}})};
}
