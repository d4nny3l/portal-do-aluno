/* SALTA OMR Capture Lab — experimento isolado, sem escrita remota e sem persistência.
   Lê SOMENTE o modelo geométrico confirmado; fotografia de um cartão não identifica
   avaliação, revisão ou gabarito. Scanner original foi congelado nesta pasta.
*/
import {createPrivateAssessmentClient} from '../../corretor/v2/assessments/private-client.mjs';
import {planFromPrivateRecord} from '../../corretor/v2/assessments/private-contract-adapter.mjs';
import {enrichCatalogRows,assessmentLabel} from '../../plataforma/catalogo-avaliacoes.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {detectFiducials,warpFromFiducials} from '../../corretor/v2/omr/normalize.mjs';
import {readRaster,READER_VERSION} from '../../corretor/v2/omr/reader.mjs';
import {scoreIntegratedPlan} from '../../corretor/v2/assessments/block-scoring.mjs';
import {reconcile} from './js/safe-scan.mjs';

const GATEWAY = 'https://salta-stats.dannyel-moises.workers.dev/assessments/v1';
const $ = id => document.getElementById(id);
const modelStatus=$('omrModelStatus'),readStatus=$('omrReadStatus');
const client=createPrivateAssessmentClient({enabled:true,baseUrl:GATEWAY});
let session=null,grants=[],rows=[],scope=null,revisionChoices=[];
let selected=null,latestPage=null,readGeneration=0,libraryGeneration=0,busy=false;
const state={lastResult:null,modelOrigin:null};

function status(target,message,kind='info'){
 target.textContent=message;
 target.dataset.kind=kind;
}
function options(select,items,placeholder='Selecione…'){
 select.replaceChildren(new Option(placeholder,''));
 for(const item of items)select.add(new Option(item.label,String(item.value)));
}
function privacyReset(reason='Seleção anterior descartada.'){
 readGeneration++;
 selected=null;state.lastResult=null;state.modelOrigin=null;
 $('omrPageNumber').disabled=true;$('omrPageNumber').replaceChildren();

 $('omrPinned').hidden=true;
 $('omrSummary').hidden=true;$('omrDiff').hidden=true;
 $('omrReread').disabled=true;
 if(reason)status(modelStatus,reason,'warn');
}
function reportError(error,target=modelStatus){
 if(error?.status===401||error?.status===403){
  privacyReset('');
  session=null;grants=[];scope=null;rows=[];
  $('omrPrivateControls').hidden=true;
  $('omrConnect').hidden=false;
  status(target,'Sessão ou permissão indisponível. Entre na SALTA e conecte a biblioteca novamente.','error');
  return;
 }
 status(target,error?.message||'Não foi possível concluir esta operação.','error');
}
function normalizeText(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function isMathBlock(row){
 const title=normalizeText(row.title),subject=normalizeText(row.subject);
 return (subject.includes('matematica')||title.includes('matematica')) &&
   (title.includes('bloco')||normalizeText(row.kind).includes('bloco'));
}
function isMath(row){
 return normalizeText(row.subject).includes('matematica')||
   normalizeText(row.title).includes('matematica');
}
function scopeLabel(grant){
 const name=[grant.institutionName||grant.schoolName,grant.className,grant.periodName].filter(Boolean).join(' · ');
 return name || [grant.institutionId,grant.classId,grant.periodId].join(' · ');
}
function checkSameScope(record){
 if(!scope || !['institutionId','classId','periodId'].every(k=>record?.[k]===scope[k]))
  throw new Error('Avaliação de turma/período diferente do contexto selecionado.');
}
async function connectLibrary(){
 const generation=++libraryGeneration;
 if(busy)return;
 busy=true;$('omrConnect').disabled=true;
 try{
  status(modelStatus,'Verificando a sessão do professor…');
  session=await client.session();
  grants=await client.grants();
  if(generation!==libraryGeneration)return;
  if(!grants.length)throw new Error('Sua sessão não possui turmas autorizadas para consultar avaliações.');
  $('omrPrivateControls').hidden=false;
  $('omrConnect').hidden=true;
  options($('omrScope'),grants.map((g,i)=>({value:i,label:scopeLabel(g)})),'Escolha uma turma e período');
  if(grants.length===1){
   $('omrScope').value='0';
   scope=grants[0];
   status(modelStatus,'Sessão confirmada. Buscando avaliações da turma…','ok');
  }else status(modelStatus,'Sessão confirmada. Selecione a turma e o período da prova.','ok');
 }catch(error){reportError(error)}
 finally{$('omrConnect').disabled=false;busy=false}
 if(scope && generation===libraryGeneration)await loadCatalog();
}
async function loadCatalog(){
 if(!scope)return status(modelStatus,'Escolha uma turma e período antes de carregar a biblioteca.','warn');
 const generation=++libraryGeneration;
 privacyReset('');
 $('omrAssessment').disabled=true;$('omrRevision').disabled=true;$('omrBind').disabled=true;
 options($('omrAssessment'),[],'Carregando avaliações…');
 options($('omrRevision'),[],'Selecione a avaliação primeiro');
 status(modelStatus,'Consultando catálogo autorizado e verificando os modelos…');
 try{
  const found=[];let cursor=null,pages=0;
  do{
   const listing=await client.list(cursor,scope);
   if(generation!==libraryGeneration)return;
   found.push(...listing.assessments);
   cursor=listing.nextCursor||null;
   if(++pages>20||found.length>200)throw new Error('Catálogo grande demais para este laboratório. Use a página principal da SALTA.');
  }while(cursor);
  // Mesmo enriquecimento de metadados já utilizado pela biblioteca oficial.
  rows=await enrichCatalogRows(found,{
   open:(id,revision)=>client.open(id,revision),
   isCurrent:()=>generation===libraryGeneration,
   cache:new Map(),concurrency:2,
   onDenied:()=>privacyReset('')
  });
  if(generation!==libraryGeneration||!rows)return;
  rows.sort((a,b)=>{
   const score=x=>isMathBlock(x)?2:isMath(x)?1:0;
   return score(b)-score(a) || (b.revision||0)-(a.revision||0);
  });
  options($('omrAssessment'),rows.map(x=>({
   value:x.id,
   label:(isMathBlock(x)?'★ ':'')+(assessmentLabel(x)||x.title||'Avaliação')+
     ' · rev. '+x.revision
  })),'Escolha a prova impressa');
  $('omrAssessment').disabled=!rows.length;
  const matches=rows.filter(isMathBlock).length;
  status(modelStatus,!rows.length?'Nenhuma avaliação encontrada nesta turma. Use o manifesto JSON ou escolha outra turma.':
   matches?'Encontrada'+(matches===1?'':'s')+' '+matches+' avaliação(ões) com Bloco e Matemática. Confira e escolha a prova correspondente ao papel.':
   'Nenhuma prova nomeada Bloco de Matemática neste contexto. Confira o título das avaliações ou importe o manifesto exato.',
   rows.length?'ok':'warn');
  const preferred=rows.filter(isMathBlock);
  if(preferred.length===1 || rows.length===1){
   $('omrAssessment').value=(preferred[0]||rows[0]).id;
   await loadRevisions();
  }
 }catch(error){if(generation===libraryGeneration)reportError(error)}
}
async function loadRevisions(){
 const id=$('omrAssessment').value;
 revisionChoices=[];
 $('omrBind').disabled=true;
 privacyReset('');
 options($('omrRevision'),[],'Consultando revisões…');
 if(!id)return;
 const generation=++libraryGeneration;
 status(modelStatus,'Consultando revisões da avaliação selecionada…');
 try{
  const history=await client.history(id);
  if(generation!==libraryGeneration)return;
  // Para evitar duplicidade, a revisão tem que ser emitida e corresponder ao cartão.
  revisionChoices=history.filter(row=>row?.status==='issued'&&Number.isSafeInteger(row.revision)&&row.revision>0)
    .sort((a,b)=>b.revision-a.revision);
  options($('omrRevision'),revisionChoices.map(v=>({value:v.revision,label:'Revisão '+v.revision+' · emitida'})),
    revisionChoices.length?'Escolha a revisão da folha':'Sem revisão emitida');
  $('omrRevision').disabled=!revisionChoices.length;
  $('omrBind').disabled=!revisionChoices.length;
  if(revisionChoices.length===1)$('omrRevision').value=String(revisionChoices[0].revision);
  status(modelStatus,revisionChoices.length?
   'Revisões emitidas disponíveis. Confirme qual revisão foi impressa.':
   'Esta avaliação não possui revisão emitida. Não é seguro associá-la a um cartão físico.',revisionChoices.length?'ok':'warn');
 }catch(error){if(generation===libraryGeneration)reportError(error)}
}
async function bindAssessment(){
 const id=$('omrAssessment').value,rev=Number($('omrRevision').value);
 if(!scope||!id||!revisionChoices.some(x=>x.revision===rev))
  return status(modelStatus,'Escolha uma avaliação e sua revisão emitida.','warn');
 const generation=++libraryGeneration;
 $('omrBind').disabled=true;
 try{
  status(modelStatus,'Validando manifesto, gabarito, blocos e revisão…');
  const record=await client.open(id,rev);
  if(generation!==libraryGeneration)return;
  checkSameScope(record);
  if(record.status!=='issued'||record.archived)throw new Error('A revisão não está emitida e ativa.');
  const {plan,manifest,template}=planFromPrivateRecord(record);
  if(manifest.contentHash!==record.manifestHash||plan.model.contentHash!==manifest.contentHash)
   throw new Error('O manifesto não corresponde à revisão privada.');
  const consent=window.confirm('EXPERIMENTO — SEM PUBLICAR NOTAS\n\n'+
   record.definition.title+'\nRevisão '+rev+'\n'+template.questionCount+' questões / '+plan.blocks.length+
   ' blocos.\n\nConfirma que este é o modelo impresso no cartão que será fotografado?');
  if(!consent)return status(modelStatus,'Seleção cancelada. Confira o cartão e a revisão.','warn');
  privacyReset('');
  selected=Object.freeze({template,manifest,plan,recordId:id,revision:rev,mode:'private'});
  state.modelOrigin='private';
  setPinned();
  status(modelStatus,'Modelo e gabarito validados para análise SOMENTE nesta aba. Nenhuma seleção ou nota foi enviada ao servidor.','ok');
  if(latestPage)await analyze(latestPage);
 }catch(error){if(generation===libraryGeneration)reportError(error)}
 finally{if(generation===libraryGeneration)$('omrBind').disabled=false}
}
async function bindLocalManifest(file){
 if(!file)return;
 try{
  if(file.size>2000000)throw new Error('O manifesto JSON deve ter até 2 MB.');
  const data=JSON.parse(await file.text());
  const {template,manifest}=importCardManifest(data);
  privacyReset('');
  selected=Object.freeze({template,manifest,plan:null,mode:'file',revision:template.revision});
  state.modelOrigin='file';
  setPinned();
  status(modelStatus,'Manifesto válido carregado. Sem gabarito privado: somente alternativas e estados ópticos.','ok');
  if(latestPage)await analyze(latestPage);
 }catch(error){reportError(error)}
 finally{$('omrManifest').value=''}
}
function setPinned(){
 const node=$('omrPinned'),s=selected;if(!s){node.hidden=true;return;}
 node.replaceChildren();
 const title=document.createElement('strong');
 title.textContent=s.mode==='private'?s.plan.metadata.title:(s.manifest.header?.title||'Manifesto importado');
 const details=document.createElement('div');
 details.textContent=s.template.questionCount+' questões · '+s.manifest.sections.length+' bloco(s) · '+
   (s.manifest.mode==='embedded'?'quadro incorporado':'folha inteira')+' · revisão '+s.revision+
   ' · modelo '+String(s.manifest.contentHash||'').slice(0,16);
 node.append(title,details);node.hidden=false;
 const select=$('omrPageNumber');options(select,Array.from({length:s.template.pageCount},(_,i)=>({label:'Página '+(i+1),value:i+1})),'Confirme a página');select.disabled=false;select.value=s.template.pageCount===1?'1':'';
 $('omrReread').disabled=!latestPage;
}
function toGray(data){
 const n=data.length/4,g=new Uint8Array(n);
 for(let i=0,j=0;i<n;i++,j+=4)
  g[i]=Math.round(.299*data[j]+.587*data[j+1]+.114*data[j+2]);
 return g;
}
async function rasterFromBlob(blob,maxSide=1850){
 const image=await createImageBitmap(blob);
 try{
  const scale=Math.min(1,maxSide/Math.max(image.width,image.height));
  const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Canvas não disponível para leitura.');
  ctx.drawImage(image,0,0,width,height);
  const rgba=ctx.getImageData(0,0,width,height);
  return {gray:toGray(rgba.data),width,height};
 }finally{image.close?.()}
}
function candidateRead(raster,s,pageNumber){
 const {template,manifest}=s;
 const detection=detectFiducials(raster.gray,raster.width,raster.height,{manifest});
 if(!detection.found||detection.confidence<.7)throw new Error('Marcadores insuficientes ('+
   (detection.confidence||0).toFixed(2)+'). Enquadre toda a folha com seus quatro marcadores.');
 const embedded=manifest.mode==='embedded';
 const outputWidth=embedded?Math.min(1400,Math.floor(2200*manifest.paper.widthMm/manifest.paper.heightMm)):1400;
 const aligned=warpFromFiducials(raster.gray,raster.width,raster.height,detection.corners,{outputWidth,manifest});
 const reading=readRaster(template,aligned.pixels,aligned.width,aligned.height,{
  page:pageNumber,showCode:template.identity.mode==='seven-digit-code',manifest
 });
 if(reading.contentHash!==manifest.contentHash||reading.templateId!==template.templateId)
  throw new Error('O leitor retornou modelo geométrico diferente do selecionado.');
 const stats={read:0,blank:0,double:0,review:0};
 for(const o of reading.observations){if(o.state in stats)stats[o.state]++;}
 const score=null; // diagnostics never produce a grade
 return {ok:true,stats,reading,detectionConfidence:detection.confidence,
   normalizedWidth:aligned.width,normalizedHeight:aligned.height,score,
   outputDetail:Math.min(raster.width,raster.height)};
}
function failed(error){return {ok:false,error:error?.message||String(error)}}
function announceReadFinished(page){
 if(page?.id!=null)window.dispatchEvent(new CustomEvent("salta-omr:read-finished",{
  detail:{pageId:page.id}
 }));
}
async function analyze(page){
 if(!selected||!page)return;
 const request=++readGeneration;
 const model=selected;
 state.lastResult=null;
 status(readStatus,'Analisando página em dois caminhos ópticos…');
 $('omrSummary').hidden=true;$('omrDiff').hidden=true;$('omrReread').disabled=true;
 let baseline,scanner;
 try{
  const pageNumber=Number($('omrPageNumber').value);
  if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>model.template.pageCount)throw new Error('Confirme a página impressa antes de ler.');
  // No JPEG or Magic Scan pixels enter the optical reader.
  if(!page.optical)throw new Error('Raster óptico não disponível. Capture novamente.');
  try{baseline=candidateRead(page.optical.source,model,pageNumber)}catch(error){baseline=failed(error)}
  try{scanner=candidateRead(page.optical.rectified,model,pageNumber)}catch(error){scanner=failed(error)}
  if(request!==readGeneration||model!==selected)return;
  const safe=reconcile(baseline,scanner);
  let score=null;
  if(safe.complete&&model.plan&&model.template.pageCount===1){
   try{score=scoreIntegratedPlan(model.plan,safe.reading.observations,{manifest:model.manifest,template:model.template,identityState:safe.reading.identity.state,identityMode:model.template.identity.mode,pageCount:1});}
   catch(error){score={complete:false,reason:error?.message||'Pontuação inconclusiva.'};}
  }
  state.lastResult={baseline,scanner,safe,score};
  renderResult(model,baseline,scanner);
  addCell($('omrSummary'),'p',safe.complete?(score?.complete?'Nota local consensual: '+score.total+' / '+score.maximum:model.template.pageCount>1?'Página lida; nota multipágina não calculada neste laboratório.':'Leitura consensual; sem nota definitiva.'):'SEM NOTA: '+safe.reason,'omr-legend');
  const count=[baseline,scanner].filter(x=>x.ok).length;
  status(readStatus,count===2&&!safe.complete?'Divergência ou identificação pendente. Nenhuma nota emitida.':count===2?
   'Comparação concluída. Divergências são sinalizadas; não significam, isoladamente, que uma leitura é correta.':
   count===1?'Um caminho conseguiu ler a folha; outro falhou. Confira a imagem e os marcadores.':
   'Nenhum dos dois caminhos localizou os marcadores. Use uma fotografia mais nítida, com toda a folha visível.',
   count===2&&safe.complete?'ok':'warn');
 }catch(error){if(request===readGeneration)status(readStatus,error?.message||'Falha ao analisar a captura.','error')}
 finally{
  if(request===readGeneration)$('omrReread').disabled=false;
  announceReadFinished(page);
 }
}
function addCell(parent,tag,txt,className){
 const el=document.createElement(tag);el.textContent=txt;
 if(className)el.className=className;
 parent.appendChild(el);return el;
}
function renderResult(model,a,b){
 const wrap=$('omrSummary');wrap.replaceChildren();
 for(const [label,r] of [['Fotografia original',a],['Scanner óptico (sem Magic Scan)',b]]){
  const card=document.createElement('div');card.className='omr-result-card';
  if(!r.ok){
   card.dataset.failed='true';
   addCell(card,'strong',label);
   addCell(card,'div','Não reconheceu','omr-number');
   addCell(card,'small',r.error);
  }else{
   addCell(card,'strong',label);
   addCell(card,'div',r.stats.read+' / '+model.template.questionCount+' lidas','omr-number');
   addCell(card,'small','Em revisão: '+r.stats.review+' · Em branco: '+r.stats.blank+' · Duplas: '+r.stats.double);
   addCell(card,'small','Marcadores: '+Math.round(r.detectionConfidence*100)+'% · '+r.normalizedWidth+' px');
   addCell(card,'small',r.reading.identity.state==='read'?'Identificação lida':'Identificação: '+r.reading.identity.state);
   addCell(card,'small','Diagnóstico óptico — não representa nota definitiva.');
  }
  wrap.append(card);
 }
 wrap.hidden=false;
 const diff=$('omrDiff');diff.replaceChildren();
 if(!a.ok&&!b.ok){diff.hidden=true;return;}
 addCell(diff,'h4','Alternativas e divergências');
 addCell(diff,'p','Resultados do leitor oficial '+READER_VERSION+'. Não há publicação de notas nem escolha automática entre os caminhos.');
 const scroll=document.createElement('div');scroll.className='omr-diff-scroll';
 const table=document.createElement('table'),thead=document.createElement('thead'),head=document.createElement('tr');
 for(const label of ['Questão','Foto original','Scanner'])addCell(head,'th',label);
 thead.append(head);table.append(thead);
 const tbody=document.createElement('tbody');
 const first=new Map((a.ok?a.reading.observations:[]).map(o=>[o.questionId,o]));
 const second=new Map((b.ok?b.reading.observations:[]).map(o=>[o.questionId,o]));
 let discrepancies=0;
 for(const q of model.template.questions){
  const oa=first.get(q.questionId),ob=second.get(q.questionId);
  const display=o=>!o?'—':o.state==='read'?o.answer+(o.recognition==='partial'?' *':''):
     o.state==='blank'?'Em branco':o.state==='double'?'Dupla':'Revisar';
  const labelA=display(oa),labelB=display(ob),row=document.createElement('tr');
  if(oa&&ob&&labelA!==labelB){row.dataset.diff='true';discrepancies++}
  if(oa?.state==='review'||ob?.state==='review')row.dataset.review='true';
  addCell(row,'td',String(q.number));addCell(row,'td',labelA);addCell(row,'td',labelB);
  tbody.appendChild(row);
 }
 table.append(tbody);scroll.appendChild(table);diff.append(scroll);
 addCell(diff,'p','* Marcação parcial reconhecida · '+discrepancies+' diferença(s) entre classificações. Compare os casos com a folha física.','omr-legend');
 diff.hidden=false;
}
function onPage(event){
 const page=event?.detail?.page;if(!page)return;
 latestPage=page;
 const count=window.__saltaScan?.S?.pages?.length||0;
 $('omrCaptureCount').textContent=count+' página(s) na sessão';
 $('omrReread').disabled=!selected;
 if(!selected){
  status(readStatus,'Página '+count+' recebida. Conecte a avaliação e confirme o modelo para iniciar a leitura.','warn');
  announceReadFinished(page);
 }else void analyze(page);
}
function bootstrap(){
 $('omrConnect').addEventListener('click',()=>void connectLibrary());
 $('omrScope').addEventListener('change',()=>{
  const idx=$('omrScope').value;
  scope=idx===''?null:grants[Number(idx)]||null;
  rows=[];privacyReset('');
  if(scope)void loadCatalog();
 });
 $('omrList').addEventListener('click',()=>void loadCatalog());
 $('omrAssessment').addEventListener('change',()=>void loadRevisions());
 $('omrBind').addEventListener('click',()=>void bindAssessment());
 $('omrReread').addEventListener('click',()=>void analyze(latestPage));
 $('omrPageNumber').addEventListener('change',()=>{readGeneration++;state.lastResult=null;$('omrSummary').hidden=true;$('omrDiff').hidden=true;$('omrReread').disabled=!latestPage;});
 window.addEventListener('salta-omr:optical-invalidated',e=>{if(latestPage?.id===e.detail?.pageId){readGeneration++;state.lastResult=null;$('omrSummary').hidden=true;$('omrDiff').hidden=true;$('omrReread').disabled=true;status(readStatus,'Geometria visual editada. Capture novamente para uma leitura óptica verificável.','warn');}});
 window.addEventListener('salta-omr:discard',e=>{if(latestPage?.id===e.detail?.pageId){readGeneration++;latestPage=null;state.lastResult=null;$('omrSummary').hidden=true;$('omrDiff').hidden=true;$('omrReread').disabled=true;}});
 $('omrManifest').addEventListener('change',event=>{
  const file=event.target.files?.[0];
  if(file)void bindLocalManifest(file);
 });
 window.addEventListener('salta-omr:page',onPage);
 window.addEventListener('pagehide',()=>{
  libraryGeneration++;readGeneration++;selected=null;latestPage=null;rows=[];grants=[];session=null;
 
 });
 options($('omrAssessment'),[],'Conecte a biblioteca');
 options($('omrRevision'),[],'Escolha a avaliação');
}
bootstrap();
