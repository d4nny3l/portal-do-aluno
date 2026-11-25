import {ASSESSMENT_LIFECYCLE_VERSION} from '../corretor/v2/assessments/lifecycle.mjs';
import {confirmAssessmentDeletion} from './avaliacao-excluir-dialog.mjs';
// SALTA: one library inside "Criar avaliação". Uses the original audited private
// client/controller. No second login, endpoint, storage or optical renderer.
import {createPrivateAssessmentClient} from '../corretor/v2/assessments/private-client.mjs';
import {createPrivateLibraryController} from '../corretor/v2/assessments/private-library.mjs';
import {createIntegratedPlan,applyKeyPaste,draftSummary,formatExact,scoreInputUnits,units,POINT_SCALE,keyTextForPlan} from '../corretor/v2/assessments/block-scoring.mjs';
import {definitionFromLocalPlan,planFromPrivateRecord} from '../corretor/v2/assessments/private-contract-adapter.mjs';
import {importCardManifest} from '../corretor/v2/omr/manifest.mjs';
import {DEFAULT_CARD_HEADER} from '../corretor/v2/omr/render.mjs';
import {EDITOR_SNAPSHOT_CAPABILITY,HEADER_VISIBILITY_KEYS,createEditorSnapshot,editorFromSnapshot} from '../corretor/v2/assessments/editor-snapshot.mjs';
import {QUESTION_TYPES} from '../corretor/v2/omr/assessment.mjs';
import {assessmentLabel,enrichCatalogRows} from './catalogo-avaliacoes.mjs';
export {assessmentLabel} from './catalogo-avaliacoes.mjs';
import {SCORE_FORMAT_VERSION,DEFAULT_SCORE_DECIMALS,scoreDecimals as assertScoreDecimals,formatScore} from '../corretor/v2/assessments/score-format.mjs';

// Same authorized namespace as the original private client; server Auth and grants
// remain the security boundary. No worker flags, tokens, credentials or secrets here.
export const LIBRARY_GATEWAY='https://salta-stats.dannyel-moises.workers.dev/assessments/v1';
const unsupported='Este cartão não pode ser salvo na biblioteca. Use questões A–D, A–E ou C–E.';
const embeddedUnavailable='Não é possível salvar este quadro na biblioteca agora. Você ainda pode baixá-lo.';
export const EMBEDDED_LIBRARY_VERSION='salta-embedded-library-v1';
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
export const validScorePrecision=(value,places=DEFAULT_SCORE_DECIMALS)=>{
 const input=String(value??'').trim();
 if(!/^\d+(?:[.,]\d{1,4})?$/.test(input))return false;
 const fractional=input.split(/[.,]/)[1]||'';
 return !/[1-9]/.test(fractional.slice(assertScoreDecimals(places)));
};
const partialScoreInput=(value,places)=>{
 if(!/^\d*(?:[.,]\d{0,4})?$/.test(value))return false;
 const fractional=value.split(/[.,]/)[1]||'';
 return !/[1-9]/.test(fractional.slice(places));
};
const scoreForInput=units=>formatExact(BigInt(units),POINT_SCALE,4).replace(',','.')
 .replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
const scoreForDraftInput=(value,precision)=>{
 try{return formatScore(BigInt(units(value)),POINT_SCALE,precision)}catch{return String(value??'')}
};

export function assertLibraryModel({manifest,editor,nominalFields={}}){
 if(!manifest)throw new Error('Gere primeiro um cartão válido.');
 const {template}=importCardManifest(manifest);
 if(!['full-page','embedded'].includes(template.mode)||
    (template.mode==='embedded'&&manifest.schemaVersion!=='salta-layout-manifest-v2')||
    template.questions.some(q=>!['A-D','A-E','C-E'].includes(q.type)))
  throw new Error(unsupported);
 if(editor?.fields?.cardMode!==template.mode||
    (template.mode==='embedded'&&
     (Number(editor.fields.embeddedWidth)!==manifest.paper.widthMm||Number(editor.fields.embeddedHeight)!==manifest.paper.heightMm)))
  throw new Error('O formato físico do editor e o manifesto estão diferentes. Atualize a prévia antes de salvar.');
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

export function editorFromPrivateRecord(record){
 const {plan,manifest,template}=planFromPrivateRecord(record);
 if(record.definition.editorSnapshot){
  return {editor:editorFromSnapshot(record.definition.editorSnapshot,manifest),plan,manifest,template,legacy:false};
 }
 // V2 has no editable preferences. Reconstruct only immutable manifest values;
 // never inherit booleans, logos or text from another opened evaluation.
 const h=manifest.header||{},defaults=DEFAULT_CARD_HEADER;
 const visible=Object.fromEntries(HEADER_VISIBILITY_KEYS.map(k=>[k,h.visible?.[k]??h.visibleFields?.[k]??defaults.visible[k]??false]));
 const header={...defaults,layout:h.layout??defaults.layout,institution:h.institution??'',teacher:h.teacher??'',
  subject:h.subject??record.definition.subject,className:h.className??'',grade:h.grade??'',
  date:h.date??record.definition.date,schoolYear:h.schoolYear??'',title:h.title??record.definition.title,
  instructions:h.instructions??'',logo:h.logo??'',secondaryLogo:h.secondaryLogo??'',
  showStudentCode:manifest.identity.mode==='seven-digit-code',
  showInstructions:Boolean(h.showInstructions),visible,customFields:copy(h.customFields||[]),
  logoWidthMm:h.logoWidthMm??22,secondaryLogoWidthMm:h.secondaryLogoWidthMm??22,
  logoAspect:h.logoAspect??1,secondaryLogoAspect:h.secondaryLogoAspect??1};
 const sections=plan.blocks.map((block,index)=>({
  sectionId:block.sectionId,label:block.label,order:index,
  type:block.questions[0].type,count:block.questions.length,
  items:block.questions.map(q=>({questionId:q.questionId,number:q.number,type:q.type,
   originalOrder:Number((/^question-(\d+)$/.exec(q.questionId)||[])[1])||q.number}))
 }));
 const maxSection=Math.max(0,...sections.map(section=>Number((/^section-(\d+)$/.exec(section.sectionId)||[])[1])||0));
 const maxQuestion=Math.max(0,...sections.flatMap(section=>section.items.map(q=>Math.max(q.originalOrder,Number((/^question-(\d+)$/.exec(q.questionId)||[])[1])||0))));
 const fields={assessmentTitle:record.definition.title,assessmentKind:record.definition.kind,
  assessmentSubject:record.definition.subject,assessmentClass:String(h.className||''),
  assessmentDate:record.definition.date,identityMode:manifest.identity.mode,
  cardMode:manifest.mode,embeddedWidth:String(manifest.mode==='embedded'?manifest.paper.widthMm:100),
  embeddedHeight:String(manifest.mode==='embedded'?manifest.paper.heightMm:180),
  columnCount:'auto',type:template.questions[0]?.type||'A-E',
  count:String(sections[0]?.items.length||20),sectionLabel:''};
 return {editor:{version:1,sections,header,layoutRevision:manifest.revision,
  nextSectionOrder:Math.max(maxSection,sections.length),nextQuestionNumber:maxQuestion+1,
  fields,showInstructions:Boolean(h.showInstructions)},plan,manifest,template,legacy:true};
}
export function createLibraryPlan({metadata,sections,values,answers,manifest,editor,nominalFields,scoreDecimals}){
 assertLibraryModel({manifest,editor,nominalFields});
 const plan=createIntegratedPlan({metadata,sections,values,answers,model:manifest,display:'both',scoreDecimals});
 // Verify strict v2 allowlist before transmitting, never silently drop fields.
 const editorSnapshot=createEditorSnapshot(editor,manifest);
 const definition=definitionFromLocalPlan(plan,manifest,editorSnapshot);
 if(definition.manifest.contentHash!==manifest.contentHash)
  throw new Error('O modelo óptico foi alterado durante a preparação.');
 return {plan,manifest,definition,editorSnapshot};
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
 let selectedScoreDecimals=DEFAULT_SCORE_DECIMALS,scoreFormatExplicit=false;
 const restoredUnits=new Map(),editedAmountIds=new Set();
 const scoreFormatField=get('scoreFormatField'),scoreFormatSelect=get('scoreFormatSelect');
 const hasLifecycle=()=>controller.view().session?.assessmentLifecycleVersion===ASSESSMENT_LIFECYCLE_VERSION;
 const hasScoreFormat=()=>controller.view().session?.scoreFormatVersion===SCORE_FORMAT_VERSION;
 const hasEmbeddedLibrary=()=>controller.view().session?.embeddedLibraryVersion===EMBEDDED_LIBRARY_VERSION;
 const hasEditorSnapshot=()=>controller.view().session?.editorSnapshotVersion===EDITOR_SNAPSHOT_CAPABILITY;
 const snapshotUnavailable='Não foi possível salvar todas as configurações. Nada foi salvo.';
 const embeddedEditor=()=>snapshotEditor()?.fields?.cardMode==='embedded';
 function syncScoreFormatUi(){
  const enabled=Boolean(ready&&hasScoreFormat());
  if(scoreFormatField){scoreFormatField.hidden=!enabled;scoreFormatField.style.display=enabled?'':'none';}
  if(scoreFormatSelect){scoreFormatSelect.disabled=!enabled;scoreFormatSelect.value=String(selectedScoreDecimals);}
 }
 function resetScoreFormat(){
  selectedScoreDecimals=DEFAULT_SCORE_DECIMALS;scoreFormatExplicit=false;
  restoredUnits.clear();editedAmountIds.clear();syncScoreFormatUi();
 }
 let allRows=[],selectedCatalogId='',metadataById=new Map();
 const catalogCache=new Map();
 let catalogGeneration=0,catalogBusy=false,catalogReady=false,catalogLoadError=false;
 let catalogErrorContext='',catalogErrorGeneration=-1;
 let authorizedContext='',manualRetryNeeded=false,privateEditorLoaded=false,legacyEditorActive=false;
 // UI edit clock is separate from controller operation generation. Never
 // invalidate that generation during PUT: the original requestId must survive.
 let editVersion=0,unsaved=false,confirmedEarlierSave=false,pendingSave=null,selectionAttempt=null,openAttempt=null;
 const markEdited=()=>{
  deletionConfirmed=false;editVersion++;unsaved=true;savedManifest=null;savedSignature=null;
  if(activeSelection)controller.discardSelection();
 };
 // Snapshot both the real section model and all editable academic inputs.
 // Button-driven section changes do not necessarily emit input/change events.
 const editorSignature=()=>JSON.stringify({
  editor:snapshotEditor(),sections:getSections(),metadata:getMetadata(),values,answers,selectedScoreDecimals,scoreFormatExplicit
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
 let operationBusy=false,deletionConfirmed=false,deletionFocusPending=false;
 const aux=el(document,'div','',{class:'omr-actions library-aux'});
 const btn=(label,callback,icon='action')=>{
  const item=el(document,'button',label,{type:'button'});
  item.setAttribute('data-action-icon',icon);
  item.addEventListener('click',async()=>{
   if(item.disabled||operationBusy)return;
   operationBusy=true;item.disabled=true;
   try{
    const pendingTask=callback();
    render(); // Lock other library controls but leave the editor editable.
    await pendingTask;
    render();
   }catch(e){
    if([404,409,410].includes(e?.status)&&controller.view().editorMode==='blocked'){
     wipePrivateUi();newEditor();renderScoring();
     if(contextKey())try{await loadCatalog()}catch{}
    }
    // Keep the original pending request visible until it can be reconciled.
    // Never retry synchronously here: its requestId/CAS must remain inspectable.
    status.textContent=e?.message||'Operação não concluída.';
    status.dataset.state='error';render({preserveError:true});
    scheduleRecovery();
   }finally{operationBusy=false;item.disabled=false;render({preserveError:status.dataset.state==='error'})}
  });
  return item;
 };
 const resetScores=()=>{deletionConfirmed=false;values={};answers={};savedManifest=null;savedSignature=null;resetScoreFormat();clearSelection();activeSelection=false};
 function wipePrivateUi(){
  // No catalog/metadata/answer key may survive revocation or a new principal.
  catalogGeneration++;catalogBusy=false;catalogReady=false;catalogLoadError=false;
  catalogErrorContext='';catalogErrorGeneration=-1;
  catalogCache.clear();allRows=[];metadataById.clear();selectedCatalogId='';
  const hadPrivateEditor=privateEditorLoaded;privateEditorLoaded=false;legacyEditorActive=false;
  resetScores();pendingSave=null;selectionAttempt=null;openAttempt=null;
  unsaved=false;confirmedEarlierSave=false;
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
  if(!hasEditorSnapshot())throw new Error(snapshotUnavailable);
  if(embeddedEditor()&&!hasEmbeddedLibrary())throw new Error(embeddedUnavailable);
  if(scoreFormatExplicit&&!hasScoreFormat())
    throw new Error('Não foi possível salvar o formato da nota. Nada foi salvo.');
   const currentSections=getSections();
   for(const section of currentSections){
    const id=section.sectionId;
    const value=values[id]??(currentSections.length===1?'10':'');
    if(!restoredUnits.has(id)||editedAmountIds.has(id))scoreInputUnits(value,selectedScoreDecimals);
   }
  const unchanged=Boolean(savedManifest&&savedSignature===editorSignature());
  if(!unchanged&&!prepareModel())throw new Error('Não foi possível montar o cartão. Revise a composição.');
  const m=unchanged?savedManifest:getModel(),editor=snapshotEditor();
  if(m?.mode==='embedded'&&!hasEmbeddedLibrary())throw new Error(embeddedUnavailable);
  const payload=createLibraryPlan({
   sections:getSections(),metadata:getMetadata(),values,answers,
   manifest:m,
   editor,nominalFields:nominalFields(),
    scoreDecimals:hasScoreFormat()&&scoreFormatExplicit?selectedScoreDecimals:undefined
  });
  return {plan:payload.plan,manifest:payload.manifest,editorSnapshot:payload.editorSnapshot};
 };
 function rememberRecordMetadata(record){
  const meta={title:record.definition.title,subject:record.definition.subject||'',
   className:String(record.definition.manifest?.header?.className||'')};
  metadataById.set(record.id,{subject:meta.subject,className:meta.className});
  catalogCache.set(record.id+'@'+record.revision,meta);
 }
 function applyRecord(record){
  if(openAttempt&&!sameEdit(openAttempt)){
   flagUnnoticedEdit(openAttempt);
   throw new Error('A avaliação foi editada durante a abertura. Suas alterações foram preservadas; abra novamente se desejar.');
  }
  privateEditorLoaded=true; // Also covers partially restored private editor on failure.
  const restored=editorFromPrivateRecord(record);legacyEditorActive=restored.legacy;
  if(restored.manifest.mode==='embedded'&&!hasEmbeddedLibrary())throw new Error(embeddedUnavailable);
   if(Object.hasOwn(restored.plan,'scoreDecimals')&&!hasScoreFormat())
    throw new Error('Não foi possível recuperar o formato da nota desta avaliação. Confira antes de continuar.');
   resetScoreFormat();
   scoreFormatExplicit=Object.hasOwn(restored.plan,'scoreDecimals');
   selectedScoreDecimals=assertScoreDecimals(restored.plan.scoreDecimals);
  restoreEditor(restored.editor);
  values=Object.fromEntries(restored.plan.blocks.map(b=>[b.sectionId,scoreForInput(b.valueUnits)]));
   for(const block of restored.plan.blocks)restoredUnits.set(block.sectionId,block.valueUnits);
   syncScoreFormatUi();
  answers=Object.fromEntries(restored.plan.blocks.flatMap(b=>b.questions.map(q=>[q.questionId,q.correct])));
  // The exact immutable manifest is selected; editing creates another revision.
  savedManifest=restored.manifest;
  rememberRecordMetadata(record);
  selectedCatalogId=record.id;
  savedSignature=editorSignature();
  // Clear the previous correction binding *before* installing this private
  // assessment model; clearing afterward would erase the just-opened model.
  clearSelection();activeSelection=false;
  applyExactModel({manifest:restored.manifest,title:record.definition.title,revision:record.revision});
  unsaved=false;confirmedEarlierSave=false;
  renderScoring();

 }
 const controller=createPrivateLibraryController({
  client,getDraft,applyRecord,
  onSelection:selection=>{
   if(!selection){activeSelection=false;clearSelection();return;}
   if(!sameEdit(selectionAttempt)){
    flagUnnoticedEdit(selectionAttempt);
    controller.discardSelection();return;
   }
   if(selection.manifest.mode==='embedded'&&!hasEmbeddedLibrary()){
    activeSelection=false;clearSelection();throw new Error(embeddedUnavailable);
   }
   activeSelection=true;activateSelection(selection);
  },
  onStatus:()=>{
   syncPrivateContext();
   // Controller clears session/grants/selection before signalling 401/403.
   if(!contextKey())render();
  },
  // Explicit catalog choice or verified save authorizes the existing selection
  // protocol; the server receipt and immutable record verification remain mandatory.
  confirmBatch:()=>true
 });
 const connect=btn('Conectar',async()=>{await connectAndList()},'connect');
 const create=btn('Nova avaliação',async()=>{if(!ready)throw Error('Sua biblioteca não está conectada.');controller.newDraft();privateEditorLoaded=true;resetScores();newEditor();legacyEditorActive=false;editVersion++;unsaved=false;confirmedEarlierSave=false;selectedCatalogId='';renderScoring()},'new');
 const reconcileSaved=async(result,attempt)=>{
  if(!result?.record)return false;
  // A verified immutable revision is real, even if the teacher subsequently
  // changed the editor. Preserve this result and its original requestId.
  pendingSave=null;
  const sync=()=>{
   if(sameEdit(attempt)){
    unsaved=false;confirmedEarlierSave=false;
    savedManifest=result.record.definition.manifest;
    restoredUnits.clear();editedAmountIds.clear();
    for(const block of result.record.definition.blocks)restoredUnits.set(block.blockId,block.valueUnits);
    savedSignature=editorSignature();
    renderScoring();
   }else{
    flagUnnoticedEdit(attempt);
    unsaved=true;confirmedEarlierSave=true;savedManifest=null;savedSignature=null;
   }
  };
  sync();
  try{
   selectedCatalogId=result.record.id;
   rememberRecordMetadata(result.record);
   if(hasLifecycle())broadcastChange(result.record.id);
   catalogCache.clear();
   await loadCatalog();

  }catch{
   // Catalog refresh is secondary; the verified receipt + GET are definitive.
  }
  if(controller.view().record!==result.record||!contextKey())return false;
  sync();
  if(!unsaved){
   applyExactModel({manifest:result.record.definition.manifest,title:result.record.definition.title,revision:result.record.revision});
   await bindConfirmedRecord(result.record);
  }
  return true;
 };
 const save=btn('Salvar avaliação',async()=>{
  if(!ready)throw Error('Conecte sua biblioteca antes de salvar.');
  if(activeSelection)controller.discardSelection();
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

   if(record){selectedCatalogId=id;await bindConfirmedRecord(record);}
   return record;
  }finally{openAttempt=null;}
 };
 const open=btn('Abrir avaliação',()=>openSelected(catalog.value),'open');
 const duplicate=btn('Duplicar avaliação',async()=>{
  if(controller.view().record?.id!==catalog.value)throw Error('Abra a avaliação antes de duplicar.');
  controller.discardSelection();
  const result=await controller.duplicate();
  if(result?.record){
   selectedCatalogId=result.record.id;
   rememberRecordMetadata(result.record);
  }
  await loadCatalog();
  status.textContent='Cópia criada como avaliação independente.';
 },'duplicate');
 const resolveStaleSelection=()=>{
  if(selectionAttempt&&!sameEdit(selectionAttempt)){
   flagUnnoticedEdit(selectionAttempt);
   // An old selection may be registered server-side, but is not activated in
   // the Corretor. Keep the opened record so the later local edits can still
   // become the next revision without losing their writable context.
   controller.discardSelection();
   return true;
  }
  return false;
 };
 // Bind only the current issued, verified revision, never a draft or an
 // editor changed while the server was confirming a different snapshot.
 async function bindConfirmedRecord(record){
  if(savedSignature&&savedSignature!==editorSignature())markEdited();
  if(!record||record!==controller.view().record||record.status!=='issued'||record.archived||
     !hasLifecycle()||unsaved||!savedSignature)return false;
  selectionAttempt=editSnapshot();
  try{
   const result=await controller.selectIssued();
   if(result)resolveStaleSelection();
   return activeSelection;
  }finally{
   if(!controller.view().pending)selectionAttempt=null;
  }
 }
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
  else if(pending.path.endsWith('/delete'))await reconcileDeleted(result);
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
 actions.append(create,save,open,duplicate);
 const deletion=btn('Excluir avaliação',async()=>{
  const record=controller.view().record;
  if(!hasLifecycle()||!record||record.id!==catalog.value)throw Error('Reabra a avaliação antes de excluir.');
  const context=contextKey(),generation=controller.view().generation;
  const confirmed=await confirmAssessmentDeletion({document,title:record.definition.title,opener:deletion});
  if(!confirmed)return;
  if(contextKey()!==context||controller.view().generation!==generation||controller.view().record!==record)throw Error('O contexto mudou. Reabra antes de excluir.');
  controller.discardSelection();
  const result=await controller.erase();
  if(result)await reconcileDeleted(result);
 },'delete');
 actions.append(deletion);
 async function reconcileDeleted(result){
  broadcastChange(result.receipt.id);
  wipePrivateUi();newEditor();renderScoring();deletionFocusPending=contextKey();
  await loadCatalog();deletionConfirmed=true;
  status.textContent='Avaliação excluída permanentemente.';status.dataset.state='deleted';
 }
 function broadcastChange(id){channel?.postMessage({id,context:contextKey()});}
 const channel=typeof window.BroadcastChannel==='function'?new window.BroadcastChannel('salta-assessment-lifecycle-v1'):null;
 channel?.addEventListener('message',event=>{
  const change=event.data,current=controller.view().record;
  if(typeof change?.id!=='string'||change.context!==contextKey())return;
  if(current?.id===change.id){controller.invalidateOpenedRecord();wipePrivateUi();newEditor();renderScoring();}
  catalogCache.clear();metadataById.delete(change.id);
  if(!operationBusy&&!controller.view().pending)void loadCatalog().catch(()=>{});
 });
 async function verifyOpened(){
  const current=controller.view().record,context=contextKey(),generation=controller.view().generation;
  if(!hasLifecycle()||!current)return true;
  if(operationBusy||controller.view().pending)return false;
  try{const latest=await client.open(current.id);
   if(contextKey()!==context||controller.view().generation!==generation)return false;
   if(latest.revision===current.revision&&latest.manifestHash===current.manifestHash)return true;
   throw Error('A avaliação foi substituída. Reabra a avaliação.');
  }catch(error){
   if(contextKey()===context&&controller.view().generation===generation){
    controller.invalidateOpenedRecord();wipePrivateUi();newEditor();renderScoring();
    status.textContent=error.message;status.dataset.state='error';render({preserveError:true});
   }return false;
  }
 }
 // Validate controlled exports against current server state before the existing
 // renderer/print handlers run. Their optical/PDF implementation stays untouched.
 let approvedExport=null;
 document.addEventListener?.('click',event=>{
  const target=event.target?.closest?.('button');
  if(!target||!['generate','printCard','download','downloadJson','downloadPng','downloadJpg','printBatch'].includes(target.id)||!hasLifecycle()||!controller.view().record)return;
  if(approvedExport===target){approvedExport=null;return;}
  event.preventDefault();event.stopImmediatePropagation();
  void verifyOpened().then(valid=>{if(valid){approvedExport=target;target.click();approvedExport=null;}});
 },true);
 window.addEventListener?.('focus',()=>{void verifyOpened()});
 document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')void verifyOpened()});
 open.hidden=true;refresh.hidden=true;prev.hidden=true;next.hidden=true;retry.hidden=true;
 manualRetry.hidden=true;
 aux.append(connect,refresh,prev,next,retry,manualRetry);
 top.append(title,choose,actions,aux,status,summary);
 if(scoreFormatSelect)scoreFormatSelect.onchange=event=>{
   event?.stopPropagation?.();
   if(!ready||!hasScoreFormat()){syncScoreFormatUi();return;}
   const next=assertScoreDecimals(Number(scoreFormatSelect.value));
   if(next===selectedScoreDecimals&&scoreFormatExplicit)return;
   selectedScoreDecimals=next;scoreFormatExplicit=true;
   markEdited();renderScoring();render();
  };
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
   resetScores();controller.useScope(chosen);newEditor();legacyEditorActive=false;editVersion++;allRows=[];selectedCatalogId='';unsaved=false;
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
   if(!id){controller.invalidateOpenedRecord();selectedCatalogId='';resetScores();newEditor();legacyEditorActive=false;renderScoring();return;}
   deletionConfirmed=false;selectedCatalogId=id;
   const opening=openSelected(id);render();await opening;
  }catch(error){status.textContent=error.message;status.dataset.state='error';scheduleRecovery()}
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
   const id=section.sectionId;
    const shown=restoredUnits.has(id)&&!editedAmountIds.has(id)?
     formatScore(BigInt(restoredUnits.get(id)),POINT_SCALE,selectedScoreDecimals):
     editedAmountIds.has(id)?(values[id]??''):
     values[id]!==undefined?scoreForDraftInput(values[id],selectedScoreDecimals):
      (sections.length===1?formatScore(10n,1n,selectedScoreDecimals):'');
    const val=el(document,'input','',{type:'text',placeholder:formatScore(10n,1n,selectedScoreDecimals),value:shown});
   val.setAttribute('inputmode','decimal');
   if(values[id]===undefined&&sections.length===1)values[id]='10';
   val.oninput=()=>{
    const input=String(val.value);
    if(input&&!partialScoreInput(input,selectedScoreDecimals)){
     val.value=restoredUnits.has(id)&&!editedAmountIds.has(id)?
      formatScore(BigInt(restoredUnits.get(id)),POINT_SCALE,selectedScoreDecimals):(values[id]??'');
     status.textContent='Valor incompatível com o formato da nota.';
     status.dataset.state='error';return;
    }
    values[id]=input;editedAmountIds.add(id);markEdited();updateSummary();
   };
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
   const sections=getSections();
   const s=draftSummary({sections,values,answers,scoreDecimals:selectedScoreDecimals});
   const invalidFormat=sections.some(section=>{
    const id=section.sectionId,value=values[id]??(sections.length===1?'10':'');
    if(restoredUnits.has(id)&&!editedAmountIds.has(id))return false;
    try{scoreInputUnits(value,selectedScoreDecimals);return false}catch{return true}
   });
   summary.textContent=s.total+' pontos · '+s.missing+' alternativa(s) a preencher'+
    (s.invalidAmounts||invalidFormat?' · confira o valor dos blocos':'');
  }catch{summary.textContent='Adicione questões e informe os valores e gabaritos.'}
 }
 function render({preserveError=false}={}){
  syncPrivateContext();
  const s=controller.view(),current=s.record;
  if(catalogLoadError&&(catalogErrorContext!==contextKey()||catalogErrorGeneration!==s.generation)){
   catalogLoadError=false;catalogErrorContext='';catalogErrorGeneration=-1;
  }
  ready=Boolean(s.session&&s.scope);
  syncScoreFormatUi();
  if(!ready&&(allRows.length||metadataById.size||selectedCatalogId||catalogBusy||catalogReady||catalogLoadError||catalogCache.size))wipePrivateUi();
  const grantItems=s.grants.map((g,i)=>({value:String(i),label:'Turma autorizada '+(i+1)}));
  fillOptions(scope,grantItems);
  const grantIdx=s.grants.findIndex(g=>scopeEquals(g,s.scope));
  if(grantIdx>=0)scope.value=String(grantIdx);
  scopeWrap.hidden=s.grants.length<=1;
  const rows=(catalogReady?allRows:[]).map(x=>({value:x.id,label:assessmentLabel({...x,...metadataById.get(x.id)})||'Avaliação sem título'}));
  fillOptions(catalog,[{value:'',label:catalogBusy?'Carregando avaliações…':'Selecione uma avaliação'},...rows]);
  if(current&&rows.some(x=>x.value===current.id))selectedCatalogId=current.id;
  catalog.value=rows.some(x=>x.value===selectedCatalogId)?selectedCatalogId:'';
  fillOptions(revisions,[{value:'',label:'Atual'},...s.revisions.map(x=>({value:String(x.revision),label:'Versão '+x.revision}))]);
  const opened=Boolean(current&&s.editorMode==='opened');
  scope.disabled=operationBusy||Boolean(s.pending);
  catalog.disabled=operationBusy||catalogBusy||!catalogReady||Boolean(s.pending);
  revisions.disabled=operationBusy||Boolean(s.pending);
  create.disabled=operationBusy||!ready||Boolean(s.pending);
  const embeddedBlocked=embeddedEditor()&&!hasEmbeddedLibrary();
  save.disabled=operationBusy||!ready||(opened&&!hasLifecycle())||embeddedBlocked||!hasEditorSnapshot()||(!opened&&s.editorMode!=='new')||Boolean(s.pending);
  deletion.disabled=operationBusy||!hasLifecycle()||!opened||current?.id!==catalog.value||Boolean(s.pending);
  open.disabled=operationBusy||!ready||!catalog.value||Boolean(s.pending);
  duplicate.disabled=operationBusy||!ready||!opened||current.id!==catalog.value||Boolean(s.pending);
  refresh.textContent=catalogLoadError?'Tentar novamente':'Atualizar';
  refresh.hidden=!(ready&&catalogLoadError&&!catalogBusy&&!operationBusy&&!s.pending);
  refresh.disabled=operationBusy||!ready||!catalogLoadError||catalogBusy||Boolean(s.pending);
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
  s.pending?'Conferindo a operação. Alterações recentes não salvas.':
    deletionConfirmed?'Avaliação excluída permanentemente.':
    confirmedEarlierSave?'Alterações não salvas.':
    unsaved?'Alterações não salvas.':
    s.phase==='deleted'?'Avaliação excluída permanentemente.':
    s.phase==='saved'?'Salvo.':
    s.phase==='selected'?'Pronto para corrigir.':
    catalogBusy?'Carregando avaliações…':
    catalogLoadError?'Não foi possível carregar suas avaliações. Tente novamente.':
    s.phase==='loading'?'Carregando suas avaliações…':
    s.phase==='unavailable'?'Biblioteca indisponível no momento.':
    opened?'':
    '';
  }
  if(ready&&catalogLoadError&&!catalogBusy&&!s.pending){
   status.dataset.state='error';
   status.textContent='Não foi possível carregar suas avaliações. Tente novamente.';
  }
  if(ready&&legacyEditorActive&&opened&&!unsaved&&!s.pending&&!catalogLoadError){status.dataset.state='legacy';status.textContent='Alguns campos não foram recuperados. Confira os dados antes de editar.';}
  if(ready&&opened&&!hasLifecycle()&&!s.pending){status.dataset.state='unsupported';status.textContent='Este servidor ainda não confirma a substituição definitiva. Nada foi salvo.';}
  if(ready&&!hasEditorSnapshot()&&!s.pending&&!catalogLoadError){status.dataset.state='unsupported';status.textContent=snapshotUnavailable;}
  if(ready&&embeddedBlocked&&!s.pending&&!catalogLoadError){
   status.dataset.state='unsupported';status.textContent=embeddedUnavailable;
  }
  updateSummary();
  if(deletionFocusPending&&deletionFocusPending!==contextKey())deletionFocusPending=false;
  if(deletionFocusPending&&!operationBusy&&!create.disabled){
   deletionFocusPending=false;create.focus?.();
  }
 }
 async function loadCatalog(){
  const context=contextKey(),generation=++catalogGeneration,
   controllerGeneration=controller.view().generation;
  if(!context){catalogLoadError=false;catalogErrorContext='';catalogErrorGeneration=-1;return [];}
  catalogBusy=true;catalogReady=false;catalogLoadError=false;allRows=[];
   catalogErrorContext='';catalogErrorGeneration=-1;
  render(); // Never display title-only or half-enriched private options as ready.
  const isCurrent=()=>generation===catalogGeneration&&contextKey()===context&&
   controller.view().generation===controllerGeneration;
  try{
   const first=await controller.list();
   if(!first||!isCurrent())return [];
   const rows=[...first];let pages=0;
   if(rows.length>200)throw new Error('Catálogo acima de 200 avaliações: consulta completa não disponível.');
   while(controller.view().nextCursor){
    if(++pages>500)throw new Error('O catálogo é muito grande para esta consulta. Nenhum registro foi alterado.');
    const page=await controller.nextPage();
    if(!page||!isCurrent())return [];
    rows.push(...page);
    if(rows.length>200)throw new Error('Catálogo acima de 200 avaliações: consulta completa não disponível.');
   }
   const enriched=await enrichCatalogRows(rows,{
    open:(id,revision)=>client.open(id,revision),isCurrent,cache:catalogCache,concurrency:2,
    // Controller.initialize() drops the previous teacher synchronously.
    onDenied:()=>{void controller.initialize().catch(()=>{});}
   });
   if(!enriched||!isCurrent())return [];
   allRows=enriched;catalogReady=true;catalogLoadError=false;
   catalogErrorContext='';catalogErrorGeneration=-1;
   return enriched;
  }catch(error){
   if(isCurrent()){
    allRows=[];catalogReady=false;
    catalogLoadError=Boolean(error?.retryable===true||error?.status===503||error?.status===429);
    catalogErrorContext=catalogLoadError?context:'';
    catalogErrorGeneration=catalogLoadError?controllerGeneration:-1;
    status.dataset.state='error';
    status.textContent=catalogLoadError?'Não foi possível carregar suas avaliações. Tente novamente.':
     error?.message||'Não foi possível completar o catálogo.';
   }
   throw error;
  }finally{
   if(isCurrent()){
    catalogBusy=false;render({preserveError:catalogLoadError});
   }else if(generation===catalogGeneration&&contextKey()===context){
    // Controller generation may change in the same authorized scope
    // (new draft/open/invalidation). A late GET must neither publish old
    // labels nor leave the selector indefinitely marked as loading.
    catalogGeneration++;catalogBusy=false;catalogReady=false;catalogLoadError=false;allRows=[];
     catalogErrorContext='';catalogErrorGeneration=-1;
    render();
   }
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
   'Operação em andamento. Alterações não salvas.':
   'Alterações não salvas.';
  render({preserveError:true}); // Refresh disabled actions without losing the edit warning.
 }
 // Capture the editor state before native onclick handlers mutate sections.
 // Inspect after the click dispatch, including Add/Remove/Move/Restore.
 // Do not intercept library actions, and do not change Corrigir cartões DOM.
 const createPanel=get('criar');
 for(const kind of ['input','change'])createPanel?.addEventListener(kind,event=>{
  if(event.target?.closest?.('#savedAssessments'))return;
  queueMicrotask(()=>{
   if((savedSignature&&savedSignature!==editorSignature())||(!savedSignature&&!unsaved))onEditorChanged();
  });
 },true);
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
 void connectAndList().catch(error=>{status.textContent=error?.message||'Não foi possível preparar o catálogo.';status.dataset.state='error';render({preserveError:true})});
 return Object.freeze({controller,client,onEditorChanged,renderScoring,getDraft,render,loadCatalog,verifyOpened,verifySelection:async()=>{try{return await controller.verifySelection()}catch(error){wipePrivateUi();newEditor();renderScoring();status.textContent=error.message;status.dataset.state='error';render({preserveError:true});throw error}},requiresSelectionValidation:()=>hasLifecycle()});
}
