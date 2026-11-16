import {AssessmentRepository} from './repository.mjs';
import {makeBundle,bundleKeyText} from './domain.mjs';
import {QUESTION_TYPES} from '../omr/assessment.mjs';
export async function installAssessmentBank(adapter){
 const protectedHost=location.origin==='https://salta-assessments-homologacao.dannyel-moises.workers.dev';
 if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&!protectedHost)return null;
 const $=id=>document.getElementById(id),repo=new AssessmentRepository(),keyById=new Map();
 let saved=null,reading=null,draftId=crypto.randomUUID(),busy=false,loading=false,pendingSelection=false,readingBlocked=false;
 const status=(message,state)=>{$('bankStatus').textContent=message;$('bankStatus').dataset.state=state};
 const snapshot=()=>JSON.stringify(adapter.editor());
 let savedSnapshot='';
 const stateLabel={draft:'rascunho',issued:'emitida',archived:'arquivada'};
 const dirty=()=>!saved||savedSnapshot!==snapshot()||saved.answerKey.questions.some(q=>keyById.get(q.questionId)!==q.correct)||Number($('bankMaxScore').value)!==saved.maxScore||$('bankState').value!==saved.state;
 const refreshQuestions=()=>{
  const questions=adapter.questions();
  const fragment=document.createDocumentFragment();
  for(const question of questions){
   const label=document.createElement('label'),select=document.createElement('select');label.textContent=`Questão ${question.number} · ${question.type}`;
   const empty=document.createElement('option');empty.value='';empty.textContent='Selecione…';select.append(empty);
   for(const choice of QUESTION_TYPES[question.type]||[]){const option=document.createElement('option');option.value=choice;option.textContent=choice;select.append(option)}
   select.id='official-'+question.questionId;select.disabled=question.type==='CDU';select.value=keyById.get(question.questionId)||'';
   select.onchange=()=>{keyById.set(question.questionId,select.value);status('Rascunho com alterações não salvas.','dirty');adapter.lockExports()};label.append(select);fragment.append(label);
  }
  $('officialAnswerKey').replaceChildren(fragment);
 };
 const useForReading=bundle=>{reading=bundle;adapter.clearReview();adapter.applyModel(bundle);$('answerKey').value=bundleKeyText(bundle);$('answerKey').readOnly=true;$('scanMaxScore').value=bundle.maxScore;$('scanMaxScore').readOnly=true;$('assessmentReadingStatus').textContent=`${bundle.title} · revisão ${bundle.revision} · gabarito vinculado ao cartão salvo`};
 const catalog=async(selectedId=null)=>{
  const rows=await repo.list(),opened=await Promise.all(rows.map(row=>repo.load(row.id,row.revision)));
  for(const id of ['bankCatalog','readingAssessment']){
   const select=$(id);select.replaceChildren(new Option('Selecione uma avaliação…',''));
   for(const bundle of opened){const scope=repo.classes.find(c=>c.classId===bundle.classId&&c.periodId===bundle.periodId);select.append(new Option(`${bundle.title} · ${scope?.label||'turma autorizada'} · ${bundle.date||'sem data'} · revisão ${bundle.revision} · ${stateLabel[bundle.state]}`,bundle.id))}
   if(selectedId)select.value=selectedId;
  }
 };
 const open=async(id,revision=null)=>{
  if(busy)return;busy=true;pendingSelection=true;readingBlocked=true;$('read').disabled=true;adapter.clearReview();$('assessmentReadingStatus').textContent='Recuperando avaliação, gabarito e modelo…';status('Recuperando avaliação…','loading');
  try{
   const bundle=await repo.load(id,revision);loading=true;saved=bundle;draftId=bundle.id;keyById.clear();for(const q of bundle.answerKey.questions)keyById.set(q.questionId,q.correct);
   adapter.restore(bundle.editor);$('bankClass').value=bundle.classId;$('bankMaxScore').value=bundle.maxScore;$('bankState').value=bundle.state;$('bankRevision').value=bundle.revision;
   refreshQuestions();savedSnapshot=snapshot();pendingSelection=false;readingBlocked=false;$('bankCatalog').value=bundle.id;$('readingAssessment').value=bundle.id;$('bankClass').disabled=true;$('saveAssessment').disabled=bundle.state==='archived';useForReading(bundle);status(`Revisão ${bundle.revision} recuperada do servidor. ${bundle.state==='archived'?'Avaliação arquivada.':''}`,'loaded');
  }catch(error){status(error.message,'error');adapter.lockExports()}finally{busy=false;loading=false;$('read').disabled=false}
 };
 const save=async()=>{
  if(busy||pendingSelection)return;busy=true;$('saveAssessment').disabled=true;status('Salvando no banco de homologação…','saving');adapter.lockExports();
  try{
   const captured=adapter.capture(),classGrant=repo.classes.find(c=>c.classId===$('bankClass').value);adapter.lockExports();if(!classGrant)throw Error('Selecione uma turma autorizada.');
   const editorState=JSON.stringify(captured.editor),keyText=adapter.questions().map(q=>`${q.number} ${keyById.get(q.questionId)||''}`).join('\n');
   if(!$('bankMaxScore').value.trim())throw Error('Informe o valor máximo; zero é um valor válido.');
   const bundle=makeBundle({id:draftId,revision:(saved?.revision||0)+1,ownerId:repo.session.principalId,classId:classGrant.classId,periodId:classGrant.periodId,
    title:captured.editor.fields.assessmentTitle,subject:captured.editor.fields.assessmentSubject,kind:captured.editor.fields.assessmentKind,date:captured.editor.fields.assessmentDate,maxScore:Number($('bankMaxScore').value),state:$('bankState').value,manifest:captured.manifest,editor:captured.editor,keyText});
   const confirmed=await repo.save(bundle);saved=confirmed;savedSnapshot=editorState;$('bankRevision').value=confirmed.revision;$('bankClass').disabled=true;
   useForReading(confirmed);
   let listUnavailable=false;try{await catalog(confirmed.id)}catch{listUnavailable=true}
   if(dirty())status(`Revisão ${confirmed.revision} salva; existem alterações posteriores não salvas.`,'dirty');
   else status(`Salvo · revisão ${confirmed.revision} confirmada pelo servidor.${listUnavailable?' A lista não foi atualizada; tente reabri-la depois.':''}`,'saved');
  }catch(error){status(error.message,error.code===409?'conflict':'error');adapter.lockExports()}finally{busy=false;$('saveAssessment').disabled=saved?.state==='archived'||pendingSelection}
 };
 $('assessmentBank').hidden=false;$('assessmentReaderBank').hidden=false;adapter.lockExports();for(const id of ['saveAssessment','loadAssessment','newAssessment','correctAssessment','generate'])$(id).disabled=true;
 let initialized=false;
 while(!initialized){try{
  await repo.initialize();$('bankClass').replaceChildren(...repo.classes.map(c=>new Option(c.label,c.classId)));await catalog();for(const id of ['saveAssessment','loadAssessment','newAssessment','correctAssessment','generate'])$(id).disabled=false;status(`${protectedHost?'Homologação protegida':'Homologação local'} · somente dados sintéticos. Rascunho ainda não salvo.`,'draft');initialized=true;
 }catch(error){
  status(error.message,'error');
  const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';$('bankStatus').after(retry);
  const renew=document.createElement('a');renew.textContent='Renovar sessão protegida';renew.href='/';renew.target='_blank';renew.rel='noopener';if(protectedHost)retry.after(renew);
  await new Promise(resolve=>{retry.onclick=resolve});retry.remove();renew.remove();status('Retomando a conexão…','loading');
 }}
 $('saveAssessment').onclick=save;$('loadAssessment').onclick=()=>open($('bankCatalog').value,$('bankRevision').value?Number($('bankRevision').value):null);
 $('bankCatalog').onchange=()=>{$('bankRevision').value='';pendingSelection=true;$('saveAssessment').disabled=true;adapter.lockExports();status('Seleção alterada. Reabra a avaliação para recuperar seu conteúdo.','loading')};
 $('readingAssessment').onchange=async()=>{if($('readingAssessment').value)await open($('readingAssessment').value)};
 $('correctAssessment').onclick=()=>{if(!saved||dirty()){status('Salve e recupere a revisão antes de corrigir.','dirty');return}useForReading(saved);adapter.showReading()};
 $('newAssessment').onclick=()=>{saved=null;reading=null;pendingSelection=false;readingBlocked=false;$('saveAssessment').disabled=false;$('bankClass').disabled=false;draftId=crypto.randomUUID();keyById.clear();savedSnapshot='';$('bankCatalog').value='';$('bankRevision').value='';$('bankState').value='draft';$('answerKey').readOnly=false;$('scanMaxScore').readOnly=false;$('answerKey').value='';adapter.clearReview();refreshQuestions();status('Novo rascunho. Edite os dados e o gabarito antes de salvar.','draft');adapter.lockExports()};
 for(const id of ['bankClass','bankMaxScore','bankState'])$(id).onchange=()=>{status('Rascunho com alterações não salvas.','dirty');adapter.lockExports()};
 $('criar').addEventListener('input',event=>{if(!loading&&!['studentCode','studentName','studentClass'].includes(event.target.id)){status('Rascunho com alterações não salvas.','dirty');adapter.lockExports()}});
 refreshQuestions();
 return {
  refreshQuestions,
  canExport(manifest){return !pendingSelection&&!busy&&saved&&!dirty()&&saved.state!=='archived'&&manifest?.contentHash===saved.optical.contentHash},
  canGenerate(){if(pendingSelection||!saved||dirty()||saved.state==='archived'){status('Salve ou recupere uma revisão válida antes de gerar o cartão vinculado.','dirty');return false}return true},
  assertCurrentModel(manifest){if(readingBlocked)throw Error('Recuperação incompleta. Reabra a avaliação antes de ler.');if(reading&&manifest?.contentHash!==reading.optical.contentHash)throw Error('O modelo ativo mudou. Recupere a avaliação correta antes de ler.');},
  clearReading(){reading=null;readingBlocked=false;$('answerKey').readOnly=false;$('scanMaxScore').readOnly=false;$('answerKey').value='';$('assessmentReadingStatus').textContent='Modelo histórico manual, sem gabarito cadastrado selecionado.'},
  generated(manifest){if(saved&&manifest.contentHash!==saved.optical.contentHash)throw Error('O cartão mudou desde a revisão salva. Salve uma nova revisão.');}
 };
}
