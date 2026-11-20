// P0-08B-03: standalone synthetic-only Pages shell. Original audited library is imported,
 // never copied or reimplemented here. No keys, session IDs or records in browser storage.
import {createPrivateAssessmentClient} from '../corretor/v2/assessments/private-client.mjs';
import {installPrivateAssessmentUI} from '../corretor/v2/assessments/private-ui.mjs';
import {createIntegratedPlan,applyKeyPaste,keyTextForPlan} from '../corretor/v2/assessments/block-scoring.mjs';
import {planFromPrivateRecord} from '../corretor/v2/assessments/private-contract-adapter.mjs';
import {createTemplate} from '../corretor/v2/omr/template.mjs';
import {createCardManifest,renderTemplateSvg} from '../corretor/v2/omr/render.mjs';

export const AUTH_SESSION_URL='https://salta-stats.dannyel-moises.workers.dev/auth/session';
export const PRIVATE_GATEWAY_URL='https://salta-stats.dannyel-moises.workers.dev/assessments/v1';
const letters='ABCDE';
const options={identityMode:'seven-digit-code',mode:'full-page',layoutVersion:'v2',revision:8};

export function syntheticSections(){
 return [0,1].map(index=>({
  sectionId:'salta-pilot-block-'+(index+1),
  label:'Bloco '+(index+1),
  type:'A-E',
  items:Array.from({length:30},(_,offset)=>({
   questionId:'salta-pilot-q-'+String(index*30+offset+1).padStart(3,'0'),
   number:index*30+offset+1,
   type:'A-E'
  }))
 }));
}

export function createPilotModel(){
 const sections=syntheticSections();
 const template=createTemplate(sections,options);
 const manifest=createCardManifest(template);
 if(template.questionCount!==60||manifest.questionCount!==60||
    manifest.schemaVersion!=='salta-layout-manifest-v2'||
    manifest.paper?.kind!=='A4'||manifest.paper?.widthMm!==210||manifest.paper?.heightMm!==297)
  throw new Error('Modelo A4 V2 de 60 questões indisponível neste checkout.');
 return {sections,template,manifest};
}

export function preparePilotDraft({title,subject='Matemática',kind='Prova',date='',rawKey,display='both'}){
 const {sections,template,manifest}=createPilotModel();
 const answers=applyKeyPaste(rawKey,sections);
 const plan=createIntegratedPlan({metadata:{title,subject,kind,date},
  sections,values:{'salta-pilot-block-1':'6','salta-pilot-block-2':'4'},
  answers,display,model:manifest,revision:1});
 if(plan.blocks.length!==2||plan.blocks[0].questions.length!==30||
    plan.blocks[1].questions.length!==30||plan.totalUnits!=='100000')
  throw new Error('Plano de homologação incompatível: exigidos 30+30 itens e 6+4 pontos.');
 return {plan,manifest,template};
}

export async function verifyPortalSession(fetchFn=fetch){
 try{
  const response=await fetchFn(AUTH_SESSION_URL,{
   method:'GET',credentials:'include',cache:'no-store',redirect:'error',
   headers:{Accept:'application/json'}
  });
  if(!response.ok)return false;
  const data=await response.json();
  return data?.ok===true&&data.authenticated===true&&
   typeof data.user==='string'&&data.user.trim().length>0&&data.user.length<=120;
 }catch{return false}
}

export async function mountPrivatePilot(document,{fetchFn=fetch,printFn=()=>window.print(),
 createObjectURL=blob=>URL.createObjectURL(blob),revokeObjectURL=url=>URL.revokeObjectURL(url)}={}){
 const el=id=>{const found=document.getElementById(id);if(!found)throw new Error('Campo ausente: '+id);return found};
 const gate=el('pilotGate'),app=el('pilotApp'),note=el('pilotStatus');
 app.hidden=true;el('privateAssessmentsHost').hidden=true;
 gate.textContent='Verificando sua sessão SALTA…';
 if(!await verifyPortalSession(fetchFn)){
  gate.textContent='Sessão SALTA não confirmada. Entre pela área do professor e volte a esta página.';
  return {enabled:false,reason:'session'};
 }
 gate.textContent='Sessão SALTA reconhecida. A biblioteca privada só funcionará quando o gateway autorizado estiver ativo.';
 const client=createPrivateAssessmentClient({enabled:true,baseUrl:PRIVATE_GATEWAY_URL,fetchFn});
 let selected=null,previewUrl=null;
 const image=el('pilotPrintPreview'),printButton=el('pilotPrint');
 const release=()=>{
  selected=null;printButton.disabled=true;image.removeAttribute('src');image.hidden=true;
  if(previewUrl){revokeObjectURL(previewUrl);previewUrl=null}
  el('pilotPrintLabel').textContent='Nenhuma avaliação/revisão selecionada para impressão.';
 };
 const getDraft=()=>preparePilotDraft({
  title:el('pilotTitle').value.trim(),subject:el('pilotSubject').value.trim(),
  kind:el('pilotKind').value.trim(),date:el('pilotDate').value,
  rawKey:el('pilotAnswers').value,display:'both'
 });
 const applyRecord=record=>{
  const {plan}=planFromPrivateRecord(record);
  el('pilotTitle').value=plan.metadata.title;
  el('pilotSubject').value=plan.metadata.subject;
  el('pilotKind').value=plan.metadata.kind;
  el('pilotDate').value=plan.metadata.date||'';
  // Visible only to the authorized teacher after an authenticated private read.
  // It lives in volatile textarea state and is never written to storage.
  el('pilotAnswers').value=keyTextForPlan(plan);
  note.textContent='Revisão '+record.revision+' recuperada para edição. Confira título, escopo e gabarito antes de salvar.';
 };
 const onSelection=selection=>{
  release();
  if(!selection)return;
  const svg=renderTemplateSvg(selection.template,{manifest:selection.manifest});
  if(!svg.startsWith('<svg ')||!svg.includes('width="210mm"')||!svg.includes('height="297mm"'))
   throw new Error('Prévia A4 do modelo selecionado não pôde ser validada.');
  // No answers or credentials in the public printable SVG.
  if(svg.includes('correctAnswer')||svg.includes('"correct"'))throw new Error('Prévia contém dados de gabarito.');
  const url=createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  selected={assessmentId:selection.assessmentId,revision:selection.revision,manifestHash:selection.manifestHash};
  previewUrl=url;
  image.hidden=false;image.src=url;
  el('pilotPrintLabel').textContent='Lote confirmado: avaliação '+selected.assessmentId+
   ' · revisão '+selected.revision+' · modelo '+selected.manifestHash+
   '. Confira o lote físico; o cartão não identifica automaticamente o gabarito.';
  image.onload=()=>{if(selected&&previewUrl===url)printButton.disabled=false};
  image.onerror=()=>{if(previewUrl===url){release();note.textContent='Não foi possível carregar a prévia A4. Não imprima.'}};
 };
 const ui=installPrivateAssessmentUI({
  document,client,getDraft,applyRecord,onSelection,
  bankActive:()=>false,
  confirmBatch:details=>window.confirm('CONFIRMAÇÃO DO LOTE SINTÉTICO\n'+details.title+
   '\nRevisão '+details.revision+'\nID '+details.assessmentId+
   '\nMesmo cartão pode ter gabarito diferente. Selecionar esta avaliação?')
 });
 printButton.disabled=true;
 printButton.addEventListener('click',()=>{
  if(!selected||!previewUrl||printButton.disabled)return;
  printFn();
 });
 el('pilotValidateDraft').addEventListener('click',()=>{
  try{
   const draft=getDraft(),n=draft.plan.blocks.reduce((a,b)=>a+b.questions.length,0);
   note.textContent='Planejamento sintético válido: '+n+' questões, blocos 6 + 4 = 10 pontos; hash do modelo '+
    draft.manifest.contentHash+'. Nenhuma gravação efetuada.';
  }catch(error){note.textContent=error?.message||'Revise o planejamento sintético.'}
 });
 el('pilotAnswers').addEventListener('input',()=>{note.textContent='Gabarito editado apenas nesta aba. Confirme antes de salvar ou emitir uma revisão.'});
 document.defaultView?.addEventListener('pagehide',release,{once:true});
 app.hidden=false;
 return {enabled:ui.enabled,ui,release,client};
}

// Entry point runs only when this dedicated page is actually loaded.
if(typeof document!=='undefined'&&document.getElementById('pilotGate')){
 mountPrivatePilot(document).catch(()=>{
  document.getElementById('pilotApp').hidden=true;
  document.getElementById('pilotGate').textContent=
   'Não foi possível preparar a homologação privada. Nenhuma operação foi confirmada.';
 });
}
