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
export const assessmentLabel=row=>[row?.title,row?.subject??row?.definition?.subject,
 row?.className??row?.definition?.manifest?.header?.className]
 .map(value=>typeof value==='string'?value.trim():'').filter(Boolean).join(' - ');
export const validScorePrecision=value=>/^\d+(?:[.,]\d{1,2})?$/.test(String(value||'').trim());
const scoreForInput=units=>formatExact(BigInt(units),POINT_SCALE,4).replace(',','.')
 .replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');

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
 let allRows=[],selectedCatalogId='',metadataById=new Map();
 let catalogLoadSequence=0,catalogLoading=false,catalogError=false;
 let authorizedContext='',manualRetryNeeded=false,privateEditorLoaded=false;
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
 const btn=(label,callback,icon='action')=>{
  const item=el(document,'button',label,{type:'button'});
  item.setAttribute('data-action-icon',icon);
  // Official Lucide save.svg paths. Native button text remains visible and accessible.
  if(icon==='save')item.innerHTML='<svg class="salta-lucide-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Salvar avaliação';
  item.addEventListener('click',async()=>{
   if(item.disabled||operationBusy)return;
   operationBusy=true;item.disabled=true;
   try{
    const pendingTask=callback();
    render(); // Lock other library controls but leave the editor editable.
    await pendingTask;
    render();
   }catch(e){
    // Keep the original pending request visible until it can be reconciled.
    // Never retry synchronously here: its requestId/CAS must remain inspectable.
    status.textContent=e?.message||'Operação não concluída.';
    status.dataset.state='error';render({preserveError:true});
    scheduleRecovery();
   }finally{operationBusy=false;item.disabled=false;render({preserveError:status.dataset.state==='error'})}
  });
  return item;
 };
 const resetScores=()=>{values={};answers={};savedManifest=null;savedSignature=null;clearSelection();activeSelection=false};
 function wipePrivateUi(){
  // No catalog/metadata/answer key may survive revocation or a new principal.
  catalogLoadSequence++;catalogLoading=false;catalogError=false;
  allRows=[];metadataById.clear();selectedCatalogId='';
  const hadPrivateEditor=privateEditorLoaded;privateEditorLoaded=false;
  resetScores();pendingSave=null;selectionAttempt=null;openAttempt=null;
  unsaved=false;confirmedEarlierSave=false;selectionNeedsConfirmation=false;
  manualRetryNeeded=false;scheduledRequestId=null;editVersion++;
  // A manually composed card is not an assessment from the private library.
  if(hadPrivateEditor)newEditor();
  renderScoring();scope.replaceChildren();catalog.replaceChildren();
 }
 const contextKey=()=>{
  const s=controller.view();
  if(!s.session?.principalId||!s.scope)return '';
  return JSON.stringify([s.session.principalId,s.session.epoch,
   s.scope.institutionId,s.scope.classId,s.scope.periodId]);
 };
 function syncPrivateContext(){
  const next=contextKey();
  if(authorizedContext&&next!==authorizedContext)wipePrivateUi();
  authorizedContext=next;
 }
 const getDraft=()=>{
  // The default new-draft scope may be saved without clicking "Nova avaliação".
  // Once prepared for private persistence, its editor must be scrubbed on 401/403.
  privateEditorLoaded=true;
  if(Object.values(values).some(value=>!validScorePrecision(value)))throw new Error('A pontuação de cada bloco deve ter no máximo duas casas decimais.');
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
  privateEditorLoaded=true; // Also covers partially restored private editor on failure.
  const restored=editorFromPrivateRecord(record,snapshotEditor());
  restoreEditor(restored.editor);
  values=Object.fromEntries(restored.plan.blocks.map(b=>[b.sectionId,scoreForInput(b.valueUnits)]));
  answers=Object.fromEntries(restored.plan.blocks.flatMap(b=>b.questions.map(q=>[q.questionId,q.correct])));
  // The exact immutable manifest is selected; editing creates another revision.
  savedManifest=restored.manifest;
  metadataById.set(record.id,{subject:record.definition.subject||'',className:String(record.definition.manifest?.header?.className||'')});
  selectedCatalogId=record.id;
  savedSignature=editorSignature();
  // Clear the previous correction binding *before* installing this private
  // assessment model; clearing afterward would erase the just-opened model.
  clearSelection();activeSelection=false;
  applyExactModel({manifest:restored.manifest,title:record.definition.title,revision:record.revision});
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
  onStatus:()=>{
   syncPrivateContext();
   // Controller clears session/grants/selection before signalling 401/403.
   if(!contextKey())render();
  },
  confirmBatch:details=>window.confirm('Confirma a avaliação “'+details.title+
   '” para corrigir este lote? Confira o cartão físico: modelos visualmente iguais podem ter gabaritos diferentes.')
 });
 const connect=btn('Conectar',async()=>{await connectAndList()},'connect');
 const create=btn('Nova avaliação',async()=>{if(!ready)throw Error('Sua biblioteca não está conectada.');controller.newDraft();privateEditorLoaded=true;resetScores();newEditor();editVersion++;unsaved=false;confirmedEarlierSave=false;selectionNeedsConfirmation=false;selectedCatalogId='';renderScoring()},'new');
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
   selectedCatalogId=result.record.id;
   metadataById.set(result.record.id,{subject:result.record.definition.subject||'',
    className:String(result.record.definition.manifest?.header?.className||'')});
   await loadCatalog();
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
 },'save');
 const openSelected=async id=>{
  if(!id)throw Error('Escolha uma avaliação.');
  openAttempt=editSnapshot();
  try{
   const record=await controller.open(id,null);
   if(record&&openAttempt.editVersion===editVersion)await controller.history(id);
   if(record)selectedCatalogId=id;
   return record;
  }finally{openAttempt=null;}
 };
 const open=btn('Abrir avaliação',()=>openSelected(catalog.value),'open');
 const duplicate=btn('Duplicar avaliação',async()=>{
  if(controller.view().record?.id!==catalog.value)throw Error('Abra a avaliação antes de duplicar.');
  const result=await controller.duplicate();
  if(result?.record){
   selectedCatalogId=result.record.id;
   metadataById.set(result.record.id,{subject:result.record.definition.subject||'',
    className:String(result.record.definition.manifest?.header?.className||'')});
  }
  await loadCatalog();
  status.textContent='Cópia criada como avaliação independente.';
 },'duplicate');
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
  if(controller.view().record?.id!==catalog.value)throw Error('Selecione a avaliação e confira os dados antes de corrigir.');
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
 },'correct');
 const prev=btn('Anterior',()=>controller.previousPage(),'previous');
 const next=btn('Próxima',()=>controller.nextPage(),'next');
 const refresh=btn('Atualizar',()=>loadCatalog(),'refresh');
 let scheduledRequestId=null,autoAttemptedRequestId=null,onlineAttemptedRequestId=null;
 function scheduleRecovery(){
  const pending=controller.view().pending;
  if(!pending||!contextKey()||autoAttemptedRequestId===pending.requestId||
     scheduledRequestId===pending.requestId)return;
  const requestId=pending.requestId,origin=contextKey();
  autoAttemptedRequestId=requestId;
  if(!window.setTimeout){manualRetryNeeded=true;render();return;}
  scheduledRequestId=requestId;
  window.setTimeout(()=>{
   scheduledRequestId=null;
   if(controller.view().pending?.requestId!==requestId||contextKey()!==origin||
      onlineAttemptedRequestId===requestId)return;
   if(operationBusy||window.navigator?.onLine===false){
    manualRetryNeeded=true;render();return;
   }
   operationBusy=true;
   void recoverPending().catch(()=>{
    if(controller.view().pending?.requestId===requestId&&contextKey()===origin){
     manualRetryNeeded=true;
     status.textContent='Não foi possível confirmar a operação. Use Tentar novamente.';
     status.dataset.state='error';
    }
   }).finally(()=>{operationBusy=false;render({preserveError:status.dataset.state==='error'})});
  },2500);
 }
 async function recoverPending(){
  const pending=controller.view().pending;
  if(!pending||!contextKey())return null;
  // Original requestId, body, scope and CAS remain inside the audited controller.
  const result=await controller.retry();
  if(!result)return null;
  if(pending.method==='PUT'&&pendingSave?.requestId===pending.requestId)
   await reconcileSaved(result,pendingSave);
  else if(pending.method==='POST'&&pending.path==='/selections'){
   resolveStaleSelection();
   if(!controller.view().pending)selectionAttempt=null;
  }
  if(!controller.view().pending)manualRetryNeeded=false;
  return result;
 }
 const retry=btn('Conferir salvamento',recoverPending,'recover');
 const manualRetry=btn('Tentar novamente',async()=>{
  const pending=controller.view().pending;
  if(!pending||!contextKey())return;
  try{
   const result=await recoverPending();
   if(!result&&controller.view().pending?.requestId===pending.requestId)
    throw Error('A operação ainda não foi confirmada.');
  }catch(error){
   manualRetryNeeded=Boolean(controller.view().pending&&contextKey());
   throw error;
  }
 },'recover');
 const apply=btn('Aplicar gabarito',()=>{
  answers={...applyKeyPaste(paste.value,getSections(),answers)};
  markEdited();paste.value='';
  renderScoring();
  status.textContent='Gabarito preenchido. Confira as alternativas.';
 },'key');
 const top=el(document,'div','',{class:'library-toolbar'});
 const choose=el(document,'div','',{class:'library-selectors'});
 const versionLabel=field(document,'Versão',revisions);
 versionLabel.hidden=true;
 const scopeWrap=field(document,'Turma e período',scope);
 const catalogWrap=field(document,'Avaliação',catalog);
 choose.append(scopeWrap,catalogWrap,versionLabel);
 actions.append(create,save,open,duplicate,selectForCorrection);
 const deletion=el(document,'button','Excluir avaliação',{type:'button'});
 deletion.setAttribute('data-action-icon','delete');
 deletion.hidden=true;deletion.disabled=true;actions.append(deletion);
 open.hidden=true;refresh.hidden=true;prev.hidden=true;next.hidden=true;retry.hidden=true;
 manualRetry.hidden=true;
 aux.append(connect,refresh,prev,next,retry,manualRetry);
 top.append(title,choose,actions,aux,status,summary);
 const scoring=el(document,'details','',{class:'library-answers'});
 const scoringTitle=el(document,'summary','Gabarito e valor dos blocos');
 const pasteLabel=field(document,'Colar alternativas na ordem das questões ou numeradas',paste);
 scoring.append(scoringTitle,scoreBox,pasteLabel,apply,choicesBox);
 host.replaceChildren(top,scoring);
 host.hidden=false;
 scope.onchange=async()=>{
  if(operationBusy||controller.view().pending)return;
  if(unsaved&&!window.confirm('Há alterações não salvas. Deseja descartá-las ao trocar de turma?')){render();return;}
  operationBusy=true;
  try{
   const chosen=controller.view().grants[Number(scope.value)];
   if(!chosen)throw Error('Selecione a turma.');
   resetScores();controller.useScope(chosen);newEditor();editVersion++;allRows=[];selectedCatalogId='';unsaved=false;
   await loadCatalog();
  }catch(error){status.textContent=error.message;status.dataset.state='error'}
  finally{operationBusy=false;render({preserveError:status.dataset.state==='error'})}
 };
 catalog.onchange=async()=>{
  if(operationBusy||controller.view().pending)return;
  const id=catalog.value;
  if(id===selectedCatalogId)return;
  if(unsaved&&!window.confirm('Há alterações não salvas. Deseja descartá-las e carregar outra avaliação?')){
   catalog.value=selectedCatalogId;render();return;
  }
  operationBusy=true;
  try{
   if(!id){controller.invalidateOpenedRecord();selectedCatalogId='';return;}
   selectedCatalogId=id;
   await openSelected(id);
  }catch(error){status.textContent=error.message;status.dataset.state='error'}
  finally{operationBusy=false;render({preserveError:status.dataset.state==='error'})}
 };
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
   const val=el(document,'input','',{type:'text',placeholder:'Ex.: 10,00',value:values[section.sectionId]??(sections.length===1?'10':'')});
   val.setAttribute('inputmode','decimal');
   if(values[section.sectionId]===undefined&&sections.length===1)values[section.sectionId]='10';
   val.oninput=()=>{
    const input=String(val.value);
    if(input&&!/^\d*(?:[.,]\d{0,2})?$/.test(input)){
     val.value=values[section.sectionId]??'';
     status.textContent='Use no máximo duas casas decimais na pontuação.';
     status.dataset.state='error';return;
    }
    values[section.sectionId]=input;markEdited();updateSummary();
   };
   scoreBox.append(field(document,section.label+' · '+section.items.length+' questão(ões) · até 2 decimais',val));
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
  syncPrivateContext();
  const s=controller.view(),current=s.record;
  ready=Boolean(s.session&&s.scope);
  if(!ready&&(allRows.length||metadataById.size||selectedCatalogId))wipePrivateUi();
  const grantItems=s.grants.map((g,i)=>({value:String(i),label:'Turma autorizada '+(i+1)}));
  fillOptions(scope,grantItems);
  const grantIdx=s.grants.findIndex(g=>scopeEquals(g,s.scope));
  if(grantIdx>=0)scope.value=String(grantIdx);
  scopeWrap.hidden=s.grants.length<=1;
  const rows=(catalogLoading||catalogError?[]:(allRows.length?allRows:s.rows)).map(x=>({value:x.id,label:assessmentLabel({...x,...metadataById.get(x.id)})||'Avaliação sem título'}));
  fillOptions(catalog,[{value:'',label:catalogLoading?'Carregando avaliações…':catalogError?'Atualize para tentar novamente':'Selecione uma avaliação'},...rows]);
  if(current&&rows.some(x=>x.value===current.id))selectedCatalogId=current.id;
  catalog.value=rows.some(x=>x.value===selectedCatalogId)?selectedCatalogId:'';
  fillOptions(revisions,[{value:'',label:'Atual'},...s.revisions.map(x=>({value:String(x.revision),label:'Versão '+x.revision}))]);
  const opened=Boolean(current&&s.editorMode==='opened');
  scope.disabled=operationBusy||Boolean(s.pending);
  catalog.disabled=operationBusy||catalogLoading||catalogError||Boolean(s.pending);
  revisions.disabled=operationBusy||Boolean(s.pending);
  create.disabled=operationBusy||!ready||Boolean(s.pending);
  save.disabled=operationBusy||!ready||(!opened&&s.editorMode!=='new')||Boolean(s.pending);
  open.disabled=operationBusy||!ready||!catalog.value||Boolean(s.pending);
  duplicate.disabled=operationBusy||!ready||!opened||current.id!==catalog.value||Boolean(s.pending);
  selectForCorrection.disabled=operationBusy||unsaved||!ready||!opened||current.status!=='issued'||current.id!==catalog.value||Boolean(s.pending);
  refresh.hidden=!catalogError;
  refresh.disabled=operationBusy||!ready||catalogLoading||Boolean(s.pending);
  prev.disabled=operationBusy||!ready||!s.hasPrevious||Boolean(s.pending);
  next.disabled=operationBusy||!ready||!s.nextCursor||Boolean(s.pending);
  retry.disabled=operationBusy||!s.pending;
  manualRetry.hidden=!(ready&&s.pending&&manualRetryNeeded);
  manualRetry.disabled=operationBusy||!ready||!s.pending;
  connect.hidden=ready;
  if(!preserveError){
   status.dataset.state=s.phase;
   status.textContent=!s.session?'Não foi possível conectar a biblioteca. Se já entrou na SALTA, tente novamente.':
    !s.scope?'Selecione uma turma para acessar suas avaliações.':
    s.pending&&manualRetryNeeded?'A operação não foi confirmada. Use Tentar novamente quando houver conexão.':
  s.pending?'A operação está sendo verificada. Alterações posteriores ainda não foram salvas.':
    confirmedEarlierSave?'A avaliação enviada foi salva e conferida; suas alterações posteriores ainda não foram salvas.':
    selectionNeedsConfirmation?'A avaliação mudou durante a seleção. Salve as alterações e confirme novamente para corrigir.':
    unsaved?'Há alterações nesta avaliação que ainda não foram salvas.':
    s.phase==='saved'?'Avaliação salva e conferida no servidor.':
    s.phase==='selected'?'Avaliação confirmada para correção.':
    catalogLoading?'Carregando as avaliações e seus dados…':
    catalogError?'Não foi possível completar o catálogo. Use Atualizar.':
    s.phase==='loading'?'Carregando suas avaliações…':
    s.phase==='unavailable'?'Biblioteca indisponível no momento.':
    opened?'Avaliação aberta para edição.':
    'Escolha uma avaliação ou crie uma nova.';
  }
  updateSummary();
 }
 async function loadCatalog(){
  const scopeKey=contextKey(),generation=controller.view().generation,sequence=++catalogLoadSequence;
  if(!scopeKey)return [];
  const current=()=>sequence===catalogLoadSequence&&scopeKey===contextKey()&&
   generation===controller.view().generation;
  catalogLoading=true;catalogError=false;allRows=[];metadataById.clear();render();
  try{
   const first=await controller.list();
   if(!first||!current())return [];
   const rows=[...first];
   let pages=0;
   while(controller.view().nextCursor){
    if(++pages>500)throw new Error('O catálogo excedeu o limite de páginas.');
    const page=await controller.nextPage();
    if(!page||!current())return [];
    rows.push(...page);
   }
   // v2 list may omit subject/readable class. Query verified details without
   // opening any editor. Cache only title/subject/className within this context.
   if(rows.length>200)throw new Error('Catálogo acima de 200 avaliações: é necessário ampliar a consulta antes de apresentar todos os detalhes.');
   let next=0;
   const workers=Array.from({length:Math.min(3,rows.length)},async()=>{
    while(current()){
     const row=rows[next++];
     if(!row)return;
     if(typeof row.subject==='string'&&row.subject.trim()&&
        typeof row.className==='string'&&row.className.trim())continue;
     const record=await client.open(row.id,row.revision??null);
     if(!current())return;
     if(record.id!==row.id||record.revision!==row.revision||
        !scopeEquals(record,controller.view().scope))
      throw new Error('Metadados da avaliação não correspondem ao catálogo autorizado.');
     metadataById.set(row.id,{title:record.definition.title,
      subject:record.definition.subject||'',
      className:String(record.definition.manifest?.header?.className||'')});
    }
   });
   await Promise.all(workers);
   if(!current())return [];
   allRows=rows;catalogLoading=false;render();return rows;
  }catch(error){
   if(!current())return [];
   catalogError=true;catalogLoading=false;allRows=[];metadataById.clear();
   if(error?.status===401||error?.status===403){
    // initialize() resets the previous identity, scope and private UI before I/O.
    void controller.initialize().catch(()=>{});
   }
   render({preserveError:true});
   throw error;
  }finally{
   if(current()){catalogLoading=false;render({preserveError:catalogError})}
  }
 }
 async function connectAndList(){
  await controller.initialize();
  const grants=controller.view().grants;
  if(grants.length===1){controller.useScope(grants[0]);await loadCatalog()}
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
  render({preserveError:true}); // Refresh disabled actions without losing the edit warning.
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
 window.addEventListener?.('online',()=>{
  const pending=controller.view().pending;
  if(!pending||!contextKey()||operationBusy||
     onlineAttemptedRequestId===pending.requestId)return;
  onlineAttemptedRequestId=pending.requestId;
  operationBusy=true;
  void recoverPending().catch(()=>{
   if(controller.view().pending?.requestId===pending.requestId&&contextKey()){
    manualRetryNeeded=true;
    status.textContent='Não foi possível confirmar a operação. Use Tentar novamente.';
    status.dataset.state='error';
   }
  }).finally(()=>{operationBusy=false;render({preserveError:status.dataset.state==='error'})});
 });
 renderScoring();
 render();
 void connectAndList().catch(()=>{ready=false;render()});
 return Object.freeze({controller,client,onEditorChanged,renderScoring,getDraft,render});
}
