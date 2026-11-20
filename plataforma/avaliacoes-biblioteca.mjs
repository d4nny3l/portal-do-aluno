// SALTA: one library inside "Criar avaliação". Uses the original audited private
// client/controller. No second login, endpoint, storage or optical renderer.
import {createPrivateAssessmentClient} from '../corretor/v2/assessments/private-client.mjs';
import {createPrivateLibraryController} from '../corretor/v2/assessments/private-library.mjs';
import {createIntegratedPlan,applyKeyPaste,draftSummary,formatExact,POINT_SCALE,keyTextForPlan} from '../corretor/v2/assessments/block-scoring.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord} from '../corretor/v2/assessments/private-contract-adapter.mjs';
import {importCardManifest} from '../corretor/v2/omr/manifest.mjs';
import {QUESTION_TYPES} from '../corretor/v2/omr/assessment.mjs';

// Same authorized namespace as the original private client; server Auth and grants
// remain the security boundary. No worker flags, tokens, credentials or secrets here.
export const LIBRARY_GATEWAY='https://salta-stats.dannyel-moises.workers.dev/assessments/v1';
const unsupported='A biblioteca salva apenas cartão A4 completo com questões A–D, A–E ou C–E. Este modelo permanece disponível no Corretor, mas não pode ser salvo na biblioteca atual.';
const copy=value=>structuredClone(value);
const el=(doc,tag,label='',attrs={})=>{
 const node=doc.createElement(tag);
 if(label)node.textContent=label;
 for(const [k,v] of Object.entries(attrs)){
  if(['value','type','placeholder'].includes(k))node[k]=v;
  else node.setAttribute(k,v);
 }
 return node;
};
const option=(doc,value,label)=>el(doc,'option',label,{value});
const field=(doc,title,control)=>{const node=el(doc,'label',title);node.append(control);return node};
const scopeEquals=(a,b)=>['institutionId','classId','periodId'].every(k=>a?.[k]===b?.[k]);

export function assertLibraryModel({manifest,editor,nominalFields={}}){
 if(!manifest)throw new Error('Gere primeiro um cartão válido.');
 const {template}=importCardManifest(manifest);
 if(template.mode!=='full-page'||template.questions.some(q=>!['A-D','A-E','C-E'].includes(q.type)))
  throw new Error(unsupported);
 if(Object.values(nominalFields).some(x=>String(x||'').trim()))
  throw new Error('Limpe nome, turma nominal e código individual do estudante antes de salvar um modelo reutilizável.');
 if(manifest.identityCode?.student&&Object.values(manifest.identityCode.student).some(Boolean))
  throw new Error('Não salve dados nominais de estudantes dentro do modelo reutilizável.');
 const h=manifest.header||{};
 if(h.className!==String(editor?.fields?.assessmentClass||'').trim())
  throw new Error('Turma do editor e cabeçalho do cartão estão diferentes; confira os dados antes de salvar.');
 if(h.title!==editor?.header?.title)
  throw new Error('O título do cabeçalho mudou. Atualize a prévia antes de salvar.');
 return {template,manifest};
}

export function editorFromPrivateRecord(record,previousEditor){
 const {plan,manifest,template}=planFromPrivateRecord(record);
 const {header={}}=manifest;
 const editor=copy(previousEditor);
 if(editor?.version!==1||!editor.fields)throw new Error('Editor incompatível com esta avaliação.');
 editor.sections=plan.blocks.map((block,index)=>({
  sectionId:block.sectionId,label:block.label,order:index,
  type:block.questions[0].type,count:block.questions.length,
  items:block.questions.map(q=>({questionId:q.questionId,number:q.number,type:q.type,originalOrder:q.number}))
 }));
 const visible={...editor.header?.visible,...header.visible,...header.visibleFields};
 editor.header={...editor.header,...copy(header),visible,customFields:copy(header.customFields||[])};
 editor.layoutRevision=manifest.revision;
 editor.nextSectionOrder=editor.sections.length;
 editor.nextQuestionNumber=1+Math.max(0,...template.questions.map(q=>{
  const match=/^question-(\d+)$/.exec(q.questionId);return match?Number(match[1]):q.number;
 }));
 editor.fields={
  ...editor.fields,
  assessmentTitle:record.definition.title,
  assessmentKind:record.definition.kind,
  assessmentSubject:record.definition.subject,
  assessmentClass:String(header.className||''),
  assessmentDate:record.definition.date,
  identityMode:manifest.identity.mode,
  cardMode:'full-page',
  columnCount:String(manifest.columns?.length||'auto'),
  type:template.questions[0]?.type||'A-E',
  count:String(editor.sections[0]?.items.length||20)
 };
 editor.showInstructions=Boolean(header.showInstructions);
 return {editor,plan,manifest,template};
}

export function createLibraryPlan({metadata,sections,values,answers,manifest,editor,nominalFields}){
 assertLibraryModel({manifest,editor,nominalFields});
 const plan=createIntegratedPlan({metadata,sections,values,answers,model:manifest,display:'both'});
 // Verify strict v2 allowlist before transmitting, never silently drop fields.
 const definition=definitionFromLocalPlan(plan,manifest);
 if(definition.manifest.contentHash!==manifest.contentHash)
  throw new Error('O modelo óptico foi alterado durante a preparação.');
 return {plan,manifest,definition};
}

export function mountAssessmentLibrary({
 document,window,fetchFn=fetch,host=document.getElementById('savedAssessments'),
 getSections,getMetadata,getModel,prepareModel,snapshotEditor,restoreEditor,
 nominalFields=()=>({}),newEditor,applyExactModel=()=>{},activateSelection,clearSelection
}){
 if(!host)throw new Error('A biblioteca deve ficar na aba Criar avaliação.');
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:LIBRARY_GATEWAY,fetchFn});
 const get=id=>document.getElementById(id);
 let values={},answers={},savedManifest=null,savedSignature=null,ready=false,activeSelection=false,lastScoringSections='';
 // UI edit clock is separate from controller operation generation. Never
 // invalidate that generation during PUT: the original requestId must survive.
 let editVersion=0,unsaved=false,confirmedEarlierSave=false,pendingSave=null,selectionAttempt=null,openAttempt=null,selectionNeedsConfirmation=false;
 const markEdited=()=>{
  editVersion++;unsaved=true;savedManifest=null;savedSignature=null;
  if(selectionAttempt)selectionNeedsConfirmation=true;
  if(activeSelection){activeSelection=false;clearSelection();}
 };
 // Snapshot both the real section model and all editable academic inputs.
 // Button-driven section changes do not necessarily emit input/change events.
 const editorSignature=()=>JSON.stringify({
  editor:snapshotEditor(),sections:getSections(),metadata:getMetadata(),values,answers
 });
 const editSnapshot=()=>({editVersion,signature:editorSignature()});
 const sameEdit=attempt=>Boolean(attempt&&attempt.editVersion===editVersion&&attempt.signature===editorSignature());
 const flagUnnoticedEdit=attempt=>{
  if(attempt&&attempt.editVersion===editVersion&&attempt.signature!==editorSignature())markEdited();
 };
 const status=el(document,'p','Conectando à sua conta SALTA…',{role:'status','aria-live':'polite'});
 const title=el(document,'h3','Minhas avaliações');
 const scopeLabel=el(document,'span','Turma e período');
 const scope=el(document,'select','',{'aria-label':'Turma autorizada'});
 const catalog=el(document,'select','',{'aria-label':'Minhas avaliações'});
 const revisions=el(document,'select','',{'aria-label':'Versão da avaliação'});
 const summary=el(document,'p','',{'aria-live':'polite'});
 const scoreBox=el(document,'div','',{class:'library-scoring'});
 const choicesBox=el(document,'div','',{class:'library-choices'});
 const paste=el(document,'textarea','',{placeholder:'1 A\n2 C\n3 D',rows:'4',spellcheck:'false'});
 const actions=el(document,'div','',{class:'omr-actions library-actions'});
 let operationBusy=false;
 const aux=el(document,'div','',{class:'omr-actions library-aux'});
 const btn=(label,callback)=>{
  const item=el(document,'button',label,{type:'button'});
  item.addEventListener('click',async()=>{
   if(item.disabled||operationBusy)return;
   operationBusy=true;item.disabled=true;
   try{
    const pendingTask=callback();
    render(); // Lock other library controls but leave the editor editable.
    await pendingTask;
    render();
   }catch(e){status.textContent=e?.message||'Operação não concluída.';status.dataset.state='error';render({preserveError:true})}
   finally{operationBusy=false;item.disabled=false;render({preserveError:status.dataset.state==='error'})}
  });
  return item;
 };
 const resetScores=()=>{values={};answers={};savedManifest=null;savedSignature=null;clearSelection();activeSelection=false};
 const getDraft=()=>{
  const unchanged=Boolean(savedManifest&&savedSignature===editorSignature());
  if(!unchanged&&!prepareModel())throw new Error('Não foi possível montar o cartão. Revise a composição.');
  const m=unchanged?savedManifest:getModel(),editor=snapshotEditor();
  const payload=createLibraryPlan({
   sections:getSections(),metadata:getMetadata(),values,answers,
   manifest:m,
   editor,nominalFields:nominalFields()
  });
  return {plan:payload.plan,manifest:payload.manifest};
 };
 function applyRecord(record){
  if(openAttempt&&!sameEdit(openAttempt)){
   flagUnnoticedEdit(openAttempt);
   throw new Error('A avaliação foi editada durante a abertura. Suas alterações foram preservadas; abra novamente se desejar.');
  }
  const restored=editorFromPrivateRecord(record,snapshotEditor());
  restoreEditor(restored.editor);
  values=Object.fromEntries(restored.plan.blocks.map(b=>[b.sectionId,formatExact(BigInt(b.valueUnits),POINT_SCALE,4).replace(',','.')]));
  answers=Object.fromEntries(restored.plan.blocks.flatMap(b=>b.questions.map(q=>[q.questionId,q.correct])));
  // The exact immutable manifest is selected; editing creates another revision.
  savedManifest=restored.manifest;
  savedSignature=editorSignature();
  applyExactModel({manifest:restored.manifest,title:record.definition.title,revision:record.revision});
  clearSelection();activeSelection=false;
  unsaved=false;confirmedEarlierSave=false;selectionNeedsConfirmation=false;
  renderScoring();
 }
 const controller=createPrivateLibraryController({
  client,getDraft,applyRecord,
  onSelection:selection=>{
   if(!selection){activeSelection=false;clearSelection();return;}
   if(!sameEdit(selectionAttempt)){
    flagUnnoticedEdit(selectionAttempt);
    activeSelection=false;selectionNeedsConfirmation=true;clearSelection();return;
   }
   activeSelection=true;activateSelection(selection);
  },
  confirmBatch:details=>window.confirm('Confirma a avaliação “'+details.title+'”, versão '+details.revision+
   ', para corrigir este lote? Cartões visualmente iguais podem ter gabaritos diferentes.')
 });
 const connect=btn('Conectar',async()=>{await connectAndList()});
 const create=btn('Nova avaliação',async()=>{if(!ready)throw Error('Sua biblioteca não está conectada.');controller.newDraft();resetScores();newEditor();editVersion++;unsaved=false;confirmedEarlierSave=false;selectionNeedsConfirmation=false;renderScoring()});
 const reconcileSaved=async(result,attempt)=>{
  if(!result?.record)return false;
  // A verified immutable revision is real, even if the teacher subsequently
  // changed the editor. Preserve this result and its original requestId.
  pendingSave=null;
  const sync=()=>{
   if(sameEdit(attempt)){
    unsaved=false;confirmedEarlierSave=false;selectionNeedsConfirmation=false;
    savedManifest=result.record.definition.manifest;
    savedSignature=editorSignature();
   }else{
    flagUnnoticedEdit(attempt);
    unsaved=true;confirmedEarlierSave=true;savedManifest=null;savedSignature=null;
   }
  };
  sync();
  try{
   await controller.list();
   await controller.history(result.record.id);
  }catch{
   // Catalog refresh is secondary; the verified receipt + GET are definitive.
  }
  sync();return true;
 };
 const save=btn('Salvar avaliação',async()=>{
  if(!ready)throw Error('Conecte sua biblioteca antes de salvar.');
  if(activeSelection){clearSelection();activeSelection=false;}
  // getDraft() may normalize the model synchronously; capture after the
  // request payload is frozen, before the first possible user edit.
  const saving=controller.save('issued');
  const attempt=editSnapshot();
  const pending=controller.view().pending;
  if(pending?.requestId)pendingSave={...attempt,requestId:pending.requestId};
  const result=await saving;
  if(result)await reconcileSaved(result,attempt);
 });
 const open=btn('Abrir avaliação',async()=>{
  if(!catalog.value)throw Error('Escolha uma avaliação.');
  const id=catalog.value;
  openAttempt=editSnapshot();
  try{
   const record=await controller.open(id,revisions.value?Number(revisions.value):null);
   if(record&&sameEdit(openAttempt))await controller.history(id);
  }finally{openAttempt=null;}
 });
 const duplicate=btn('Duplicar avaliação',async()=>{
  if(controller.view().record?.id!==catalog.value)throw Error('Abra a avaliação antes de duplicar.');
  await controller.duplicate();
  await controller.list();
  status.textContent='Cópia criada como avaliação independente.';
 });
 const resolveStaleSelection=()=>{
  if(selectionAttempt&&!sameEdit(selectionAttempt)){
   flagUnnoticedEdit(selectionAttempt);
   selectionNeedsConfirmation=true;
   // An old selection may be registered server-side, but is not activated in
   // the Corretor. Keep the opened record so the later local edits can still
   // become the next revision without losing their writable context.
   activeSelection=false;clearSelection();
   return true;
  }
  return false;
 };
 const selectForCorrection=btn('Usar na correção',async()=>{
  if(controller.view().record?.id!==catalog.value)throw Error('Abra a avaliação e confirme a versão antes de corrigir.');
  // Even an unreported structural mutation must not reuse a saved key.
  if(savedSignature&&savedSignature!==editorSignature())markEdited();
  if(unsaved||!savedSignature)throw Error('Salve suas alterações antes de selecionar uma avaliação para correção.');
  selectionNeedsConfirmation=false;
  selectionAttempt=editSnapshot();
  try{
   const result=await controller.selectIssued();
   if(result)resolveStaleSelection();
  }finally{
   if(!controller.view().pending)selectionAttempt=null;
  }
 });
 const prev=btn('Anterior',()=>controller.previousPage());
 const next=btn('Próxima',()=>controller.nextPage());
 const refresh=btn('Atualizar',()=>controller.list());
 const retry=btn('Conferir salvamento',async()=>{
  const pending=controller.view().pending;
  if(!pending)throw Error('Não existe operação pendente.');
  // The original controller resends the frozen requestId/body/expectedRevision.
  const result=await controller.retry();
  if(!result)return;
  if(pending.method==='PUT'&&pendingSave?.requestId===pending.requestId)
   await reconcileSaved(result,pendingSave);
  else if(pending.method==='POST'&&pending.path==='/selections'){
   resolveStaleSelection();
   if(!controller.view().pending)selectionAttempt=null;
  }
 });
 const apply=btn('Aplicar gabarito',()=>{
  answers={...applyKeyPaste(paste.value,getSections(),answers)};
  markEdited();paste.value='';
  renderScoring();
  status.textContent='Gabarito preenchido. Confira as alternativas.';
 });
 const top=el(document,'div','',{class:'library-toolbar'});
 const choose=el(document,'div','',{class:'library-selectors'});
 const versionLabel=field(document,'Versão',revisions);
 const scopeWrap=field(document,'Turma e período',scope);
 const catalogWrap=field(document,'Avaliação',catalog);
 choose.append(scopeWrap,catalogWrap,versionLabel);
 actions.append(create,save,open,duplicate,selectForCorrection);
 aux.append(connect,refresh,prev,next,retry);
 top.append(title,choose,actions,aux,status,summary);
 const scoring=el(document,'details','',{class:'library-answers'});
 const scoringTitle=el(document,'summary','Gabarito e valor dos blocos');
 const pasteLabel=field(document,'Colar alternativas na ordem das questões ou numeradas',paste);
 scoring.append(scoringTitle,scoreBox,pasteLabel,apply,choicesBox);
 host.replaceChildren(top,scoring);
 host.hidden=false;
 scope.onchange=async()=>{if(operationBusy||controller.view().pending)return;try{
  const chosen=controller.view().grants[Number(scope.value)];
  if(!chosen)throw Error('Selecione a turma.');
  resetScores();controller.useScope(chosen);await controller.list();render();
 }catch(error){status.textContent=error.message;status.dataset.state='error'}};
 catalog.onchange=()=>{if(operationBusy||controller.view().pending)return;controller.invalidateOpenedRecord();render()};
 revisions.onchange=()=>{if(operationBusy||controller.view().pending)return;controller.invalidateOpenedRecord({keepRevisions:true});render()};
 const fillOptions=(node,items)=>{
  const old=node.value;
  node.replaceChildren(...items.map(({value,label})=>option(document,value,label)));
  if(items.some(x=>x.value===old))node.value=old;
 };
 function renderScoring(){
  const sections=getSections();
  lastScoringSections=JSON.stringify(sections.map(s=>({id:s.sectionId,items:s.items.map(q=>({id:q.questionId,n:q.number,t:q.type})),label:s.label})));
  const existing=new Set(sections.flatMap(s=>s.items.map(q=>q.questionId)));
  for(const id of Object.keys(answers))if(!existing.has(id))delete answers[id];
  scoreBox.replaceChildren();choicesBox.replaceChildren();
  for(const section of sections){
   const val=el(document,'input','',{type:'text',placeholder:'Ex.: 10',value:values[section.sectionId]??(sections.length===1?'10':'')});
   if(values[section.sectionId]===undefined&&sections.length===1)values[section.sectionId]='10';
   val.oninput=()=>{values[section.sectionId]=val.value;markEdited();updateSummary()};
   scoreBox.append(field(document,section.label+' · '+section.items.length+' questão(ões)',val));
  }
  for(const q of sections.flatMap(s=>s.items)){
   const select=el(document,'select','',{'aria-label':'Gabarito da questão '+q.number});
   select.append(option(document,'','—'));
   for(const c of QUESTION_TYPES[q.type]||[])select.append(option(document,c,c));
   select.value=answers[q.questionId]||'';
   select.onchange=()=>{if(select.value)answers[q.questionId]=select.value;else delete answers[q.questionId];markEdited();updateSummary()};
   choicesBox.append(field(document,'Questão '+q.number+' · '+q.type,select));
  }
  updateSummary();
 }
 function updateSummary(){
  try{
   const s=draftSummary({sections:getSections(),values,answers});
   summary.textContent=s.total+' pontos · '+s.missing+' alternativa(s) a preencher'+
    (s.invalidAmounts?' · confira o valor dos blocos':'');
  }catch{summary.textContent='Adicione questões e informe os valores e gabaritos.'}
 }
 function render({preserveError=false}={}){
  const s=controller.view(),current=s.record;
  ready=Boolean(s.session&&s.scope);
  const grantItems=s.grants.map((g,i)=>({value:String(i),label:'Turma autorizada '+(i+1)}));
  fillOptions(scope,grantItems);
  const grantIdx=s.grants.findIndex(g=>scopeEquals(g,s.scope));
  if(grantIdx>=0)scope.value=String(grantIdx);
  scopeWrap.hidden=s.grants.length<=1;
  const rows=s.rows.map(x=>({value:x.id,label:x.title+' · '+x.state}));
  fillOptions(catalog,[{value:'',label:'Selecione uma avaliação'},...rows]);
  if(current&&rows.some(x=>x.value===current.id))catalog.value=current.id;
  fillOptions(revisions,[{value:'',label:'Atual'},...s.revisions.map(x=>({value:String(x.revision),label:'Versão '+x.revision}))]);
  const opened=Boolean(current&&s.editorMode==='opened');
  scope.disabled=operationBusy||Boolean(s.pending);
  catalog.disabled=operationBusy||Boolean(s.pending);
  revisions.disabled=operationBusy||Boolean(s.pending);
  create.disabled=operationBusy||!ready||Boolean(s.pending);
  save.disabled=operationBusy||!ready||(!opened&&s.editorMode!=='new')||Boolean(s.pending);
  open.disabled=operationBusy||!ready||!catalog.value||Boolean(s.pending);
  duplicate.disabled=operationBusy||!ready||!opened||current.id!==catalog.value||Boolean(s.pending);
  selectForCorrection.disabled=operationBusy||unsaved||!ready||!opened||current.status!=='issued'||current.id!==catalog.value||Boolean(s.pending);
  refresh.disabled=operationBusy||!ready||Boolean(s.pending);
  prev.disabled=operationBusy||!ready||!s.hasPrevious||Boolean(s.pending);
  next.disabled=operationBusy||!ready||!s.nextCursor||Boolean(s.pending);
  retry.disabled=operationBusy||!s.pending;
  connect.hidden=ready;
  if(!preserveError){
   status.dataset.state=s.phase;
   status.textContent=!s.session?'Não foi possível conectar a biblioteca. Se já entrou na SALTA, tente novamente.':
    !s.scope?'Selecione uma turma para acessar suas avaliações.':
    s.pending?'Operação anterior sem confirmação final. Confira o salvamento antes de iniciar outra.':
    confirmedEarlierSave?'A versão enviada foi salva e conferida; suas alterações posteriores ainda não foram salvas.':
    selectionNeedsConfirmation?'A avaliação mudou durante a seleção. Reabra a versão e confirme novamente para corrigir.':
    unsaved?'Há alterações nesta avaliação que ainda não foram salvas.':
    s.phase==='saved'?'Avaliação salva e conferida no servidor.':
    s.phase==='selected'?'Avaliação confirmada para correção.':
    s.phase==='loading'?'Carregando suas avaliações…':
    s.phase==='unavailable'?'Biblioteca indisponível no momento.':
    opened?'Avaliação aberta · versão '+current.revision+'.':
    'Escolha uma avaliação ou crie uma nova.';
  }
  updateSummary();
 }
 async function connectAndList(){
  await controller.initialize();
  const grants=controller.view().grants;
  if(grants.length===1){controller.useScope(grants[0]);await controller.list()}
  render();
 }
 function onEditorChanged(){
  markEdited();
  const sections=getSections();
  const signature=JSON.stringify(sections.map(s=>({id:s.sectionId,items:s.items.map(q=>({id:q.questionId,n:q.number,t:q.type})),label:s.label})));
  if(signature!==lastScoringSections)renderScoring();else updateSummary();
  status.dataset.state='draft';
  status.textContent=controller.view().pending?
   'A operação anterior continua pendente; alterações recentes ainda não foram salvas.':
   'Alterações ainda não salvas nesta avaliação.';
 }
 // Capture the editor state before native onclick handlers mutate sections.
 // Inspect after the click dispatch, including Add/Remove/Move/Restore.
 // Do not intercept library actions, and do not change Corrigir cartões DOM.
 const createPanel=get('criar');
 createPanel?.addEventListener('click',event=>{
  if(event.target?.closest?.('#savedAssessments'))return;
  const before=editorSignature(),version=editVersion;
  queueMicrotask(()=>{
   if(version===editVersion&&before!==editorSignature())onEditorChanged();
  });
 },true);
 renderScoring();
 render();
 void connectAndList().catch(()=>{ready=false;render()});
 return Object.freeze({controller,client,onEditorChanged,renderScoring,getDraft,render});
}
