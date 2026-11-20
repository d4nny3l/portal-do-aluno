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
 nominalFields=()=>({}),newEditor,activateSelection,clearSelection
}){
 if(!host)throw new Error('A biblioteca deve ficar na aba Criar avaliação.');
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:LIBRARY_GATEWAY,fetchFn});
 const get=id=>document.getElementById(id);
 let values={},answers={},savedManifest=null,savedSignature=null,ready=false,activeSelection=false;
 const editorSignature=()=>JSON.stringify(snapshotEditor());
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
 const aux=el(document,'div','',{class:'omr-actions library-aux'});
 const btn=(label,callback)=>{
  const item=el(document,'button',label,{type:'button'});
  item.addEventListener('click',async()=>{
   if(item.disabled)return;
   item.disabled=true;
   try{await callback();render()}catch(e){status.textContent=e?.message||'Operação não concluída.';status.dataset.state='error';render({preserveError:true})}
   finally{item.disabled=false;render({preserveError:status.dataset.state==='error'})}
  });
  return item;
 };
 const resetScores=()=>{values={};answers={};savedManifest=null;savedSignature=null;clearSelection();activeSelection=false};
 const getDraft=()=>{
  if(!prepareModel())throw new Error('Não foi possível montar o cartão. Revise a composição.');
  const m=getModel(),editor=snapshotEditor();
  const payload=createLibraryPlan({
   sections:getSections(),metadata:getMetadata(),values,answers,
   manifest:savedManifest&&savedSignature===editorSignature()?savedManifest:m,
   editor,nominalFields:nominalFields()
  });
  return {plan:payload.plan,manifest:payload.manifest};
 };
 function applyRecord(record){
  const restored=editorFromPrivateRecord(record,snapshotEditor());
  restoreEditor(restored.editor);
  values=Object.fromEntries(restored.plan.blocks.map(b=>[b.sectionId,formatExact(BigInt(b.valueUnits),POINT_SCALE,4).replace(',','.')]));
  answers=Object.fromEntries(restored.plan.blocks.flatMap(b=>b.questions.map(q=>[q.questionId,q.correct])));
  // The exact immutable manifest is selected; editing creates another revision.
  savedManifest=restored.manifest;
  savedSignature=editorSignature();
  clearSelection();activeSelection=false;
  renderScoring();
 }
 const controller=createPrivateLibraryController({
  client,getDraft,applyRecord,
  onSelection:selection=>{activeSelection=Boolean(selection);if(selection)activateSelection(selection);else clearSelection()},
  confirmBatch:details=>window.confirm('Confirma a avaliação “'+details.title+'”, versão '+details.revision+
   ', para corrigir este lote? Cartões visualmente iguais podem ter gabaritos diferentes.')
 });
 const connect=btn('Conectar',async()=>{await connectAndList()});
 const create=btn('Nova avaliação',async()=>{if(!ready)throw Error('Sua biblioteca não está conectada.');controller.newDraft();resetScores();newEditor();renderScoring()});
 const save=btn('Salvar avaliação',async()=>{
  if(!ready)throw Error('Conecte sua biblioteca antes de salvar.');
  await controller.save('issued');
  savedManifest=controller.view().record.definition.manifest;
  savedSignature=editorSignature();
  await controller.list();
  await controller.history(controller.view().record.id);
  status.textContent='Avaliação salva e recuperada do servidor. Para corrigir, confirme a versão desejada.';
 });
 const open=btn('Abrir avaliação',async()=>{
  if(!catalog.value)throw Error('Escolha uma avaliação.');
  await controller.open(catalog.value,revisions.value?Number(revisions.value):null);
  await controller.history(catalog.value);
  status.textContent='Avaliação e gabarito recuperados. Você pode continuar editando.';
 });
 const duplicate=btn('Duplicar avaliação',async()=>{
  if(controller.view().record?.id!==catalog.value)throw Error('Abra a avaliação antes de duplicar.');
  await controller.duplicate();
  await controller.list();
  status.textContent='Cópia criada como avaliação independente.';
 });
 const selectForCorrection=btn('Usar na correção',async()=>{
  if(controller.view().record?.id!==catalog.value)throw Error('Abra a avaliação e confirme a versão antes de corrigir.');
  await controller.selectIssued();
  status.textContent='Gabarito e modelo fixados. Abra Corrigir cartões para ler o lote confirmado.';
 });
 const prev=btn('Anterior',()=>controller.previousPage());
 const next=btn('Próxima',()=>controller.nextPage());
 const refresh=btn('Atualizar',()=>controller.list());
 const retry=btn('Conferir salvamento',()=>controller.retry());
 const apply=btn('Aplicar gabarito',()=>{
  answers={...applyKeyPaste(paste.value,getSections(),answers)};
  paste.value='';
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
 scope.onchange=async()=>{try{
  const chosen=controller.view().grants[Number(scope.value)];
  if(!chosen)throw Error('Selecione a turma.');
  resetScores();controller.useScope(chosen);await controller.list();render();
 }catch(error){status.textContent=error.message;status.dataset.state='error'}};
 catalog.onchange=()=>{controller.invalidateOpenedRecord();render()};
 revisions.onchange=()=>{controller.invalidateOpenedRecord({keepRevisions:true});render()};
 const fillOptions=(node,items)=>{
  const old=node.value;
  node.replaceChildren(...items.map(({value,label})=>option(document,value,label)));
  if(items.some(x=>x.value===old))node.value=old;
 };
 function renderScoring(){
  const sections=getSections();
  const existing=new Set(sections.flatMap(s=>s.items.map(q=>q.questionId)));
  for(const id of Object.keys(answers))if(!existing.has(id))delete answers[id];
  scoreBox.replaceChildren();choicesBox.replaceChildren();
  for(const section of sections){
   const val=el(document,'input','',{type:'text',placeholder:'Ex.: 10',value:values[section.sectionId]??(sections.length===1?'10':'')});
   if(values[section.sectionId]===undefined&&sections.length===1)values[section.sectionId]='10';
   val.oninput=()=>{values[section.sectionId]=val.value;if(activeSelection){activeSelection=false;clearSelection();}updateSummary()};
   scoreBox.append(field(document,section.label+' · '+section.items.length+' questão(ões)',val));
  }
  for(const q of sections.flatMap(s=>s.items)){
   const select=el(document,'select','',{'aria-label':'Gabarito da questão '+q.number});
   select.append(option(document,'','—'));
   for(const c of QUESTION_TYPES[q.type]||[])select.append(option(document,c,c));
   select.value=answers[q.questionId]||'';
   select.onchange=()=>{if(select.value)answers[q.questionId]=select.value;else delete answers[q.questionId];if(activeSelection){activeSelection=false;clearSelection();}updateSummary()};
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
  const grantItems=s.grants.map((g,i)=>({value:String(i),label:g.classId+' · '+g.periodId}));
  fillOptions(scope,grantItems);
  const grantIdx=s.grants.findIndex(g=>scopeEquals(g,s.scope));
  if(grantIdx>=0)scope.value=String(grantIdx);
  scopeWrap.hidden=s.grants.length<=1;
  const rows=s.rows.map(x=>({value:x.id,label:x.title+' · '+x.state}));
  fillOptions(catalog,[{value:'',label:'Selecione uma avaliação'},...rows]);
  if(current&&rows.some(x=>x.value===current.id))catalog.value=current.id;
  fillOptions(revisions,[{value:'',label:'Atual'},...s.revisions.map(x=>({value:String(x.revision),label:'Versão '+x.revision}))]);
  const opened=Boolean(current&&s.editorMode==='opened');
  create.disabled=!ready||Boolean(s.pending);
  save.disabled=!ready||(!opened&&s.editorMode!=='new')||Boolean(s.pending);
  open.disabled=!ready||!catalog.value||Boolean(s.pending);
  duplicate.disabled=!ready||!opened||current.id!==catalog.value||Boolean(s.pending);
  selectForCorrection.disabled=!ready||!opened||current.status!=='issued'||current.id!==catalog.value||Boolean(s.pending);
  refresh.disabled=!ready||Boolean(s.pending);
  prev.disabled=!ready||!s.hasPrevious||Boolean(s.pending);
  next.disabled=!ready||!s.nextCursor||Boolean(s.pending);
  retry.disabled=!s.pending;
  connect.hidden=ready;
  if(!preserveError){
   status.dataset.state=s.phase;
   status.textContent=!s.session?'Biblioteca indisponível. Faça login na SALTA e tente conectar.':
    !s.scope?'Selecione uma turma para acessar suas avaliações.':
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
  if(activeSelection){activeSelection=false;clearSelection()}
  savedManifest=null;savedSignature=null;
  renderScoring();
 }
 renderScoring();
 render();
 void connectAndList().catch(()=>{ready=false;render()});
 return Object.freeze({controller,client,onEditorChanged,renderScoring,getDraft,render});
}
