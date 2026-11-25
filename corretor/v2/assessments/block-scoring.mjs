// Integrated assessment preview: exact scoring only. No persistence or optical changes.
import {QUESTION_TYPES,MAX_QUESTIONS} from '../omr/assessment.mjs';
import {scoreDecimals as validScoreDecimals,formatScore,assertScoreInputUnits} from './score-format.mjs';
export {formatExact} from './score-format.mjs';
export const PLAN_SCHEMA='salta-integrated-plan-local-v1';
export const POINT_SCALE=10000n;
export const DISPLAY_MODES=Object.freeze(['final','blocks','both']);
const fail=message=>{throw new TypeError(message)};
const entries=value=>value instanceof Map?Object.fromEntries(value):value&&typeof value==='object'&&!Array.isArray(value)?value:{};
export function units(value){
 const text=String(value??'').trim().replace(',','.');
 if(!/^(0|[1-9]\d{0,3})(\.\d{1,4})?$/.test(text))fail('Informe valor positivo até 9999,9999 com no máximo quatro casas decimais.');
 const [integer,decimal='']=text.split('.');
 const n=BigInt(integer)*POINT_SCALE+BigInt((decimal+'0000').slice(0,4));
 if(n<=0n)fail('O valor de cada bloco deve ser maior que zero.');
 return n.toString();
}
export function scoreInputUnits(value,places=2){
 return assertScoreInputUnits(units(value),places);
}
const textField=(v,name,max=160)=>{
 if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/.test(v))fail('Revise '+name+'.');
 return v.trim();
};
export function normalizeBlocks(sections){
 if(!Array.isArray(sections)||sections.length<1||sections.length>32)fail('Informe entre 1 e 32 blocos.');
 const ids=new Set(),numbered=new Set(),blockIds=new Set();
 const blocks=sections.map((section,index)=>{
  const id=textField(section?.sectionId,'o ID do bloco',80);
  if(blockIds.has(id))fail('Blocos com IDs repetidos.');blockIds.add(id);
  const items=Array.isArray(section.items)?section.items:section.questions;
  if(!Array.isArray(items)||!items.length)fail('Bloco sem questões.');
  const questions=items.map(item=>{
   if(!item||typeof item.questionId!=='string'||!item.questionId.trim()||ids.has(item.questionId))fail('ID de questão ausente ou duplicado.');
   if(!Number.isInteger(item.number)||item.number<1||numbered.has(item.number))fail('Número de questão ausente ou duplicado.');
   if(!Object.hasOwn(QUESTION_TYPES,item.type)||item.type==='CDU')fail('O formato da questão '+item.number+' não possui leitura óptica homologada.');
   ids.add(item.questionId);numbered.add(item.number);
   return Object.freeze({questionId:item.questionId,number:item.number,type:item.type,choices:QUESTION_TYPES[item.type]});
  });
  return Object.freeze({sectionId:id,label:textField(section.label||'Bloco '+(index+1),'o nome do bloco',64),questions:Object.freeze(questions)});
 });
 if(ids.size>MAX_QUESTIONS)fail('O limite é '+MAX_QUESTIONS+' questões.');
 return Object.freeze(blocks);
}
export function applyKeyPaste(raw,sections,current={}){
 const questions=normalizeBlocks(sections).flatMap(s=>s.questions).sort((a,b)=>a.number-b.number);
 const input=String(raw??'').trim();
 if(!input)fail('Cole alternativas na ordem ou linhas numeradas como 1 A.');
 const result={...entries(current)},lines=input.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const numbered=lines.every(line=>/^\d{1,3}\s*[:.)-]?\s*[A-E]$/i.test(line));
 let pairs;
 if(numbered)pairs=lines.map(line=>{const m=line.match(/^(\d{1,3})\s*[:.)-]?\s*([A-E])$/i);return [Number(m[1]),m[2].toUpperCase()]});
 else{
  if(lines.some(s=>/^\d/.test(s)))fail('Use uma resposta por linha no formato 1 A.');
  const answers=input.toUpperCase().split(/[\s,;|/]+/).filter(Boolean);
  if(answers.length!==questions.length||answers.some(a=>!/^[A-E]$/.test(a)))fail('A sequência exige '+questions.length+' respostas.');
  pairs=questions.map((q,i)=>[q.number,answers[i]]);
 }
 const found=new Map(questions.map(q=>[q.number,q])),seen=new Set();
 for(const [number,choice]of pairs){
  const question=found.get(number);
  if(!question)fail('A questão '+number+' não pertence à avaliação.');
  if(seen.has(number))fail('Questão '+number+' repetida.');seen.add(number);
  if(!question.choices.includes(choice))fail('Alternativa '+choice+' inválida na questão '+number+' ('+question.type+').');
  result[question.questionId]=choice;
 }
 return Object.freeze(result);
}
export function draftSummary({sections,values={},answers={},scoreDecimals}){
 const blocks=normalizeBlocks(sections),amounts=entries(values),keys=entries(answers);
 let total=0n;
 const lines=blocks.map(b=>{
  let value=null,error=null;
  try{value=BigInt(units(amounts[b.sectionId]));total+=value}catch(e){error=e.message}
  return {id:b.sectionId,label:b.label,count:b.questions.length,filled:b.questions.filter(q=>q.choices.includes(keys[q.questionId])).length,
   amount:value===null?'—':formatScore(value,POINT_SCALE,scoreDecimals),error};
 });
 return {blocks:lines,total:formatScore(total,POINT_SCALE,scoreDecimals),missing:lines.reduce((n,b)=>n+b.count-b.filled,0),invalidAmounts:lines.filter(b=>b.error).length};
}
export function createIntegratedPlan({metadata,sections,values,answers,display='both',model,revision=1,scoreDecimals}){
 const blocks=normalizeBlocks(sections),amounts=entries(values),key=entries(answers);
 if(!DISPLAY_MODES.includes(display))fail('Exibição inválida.');
 if(scoreDecimals!==undefined)validScoreDecimals(scoreDecimals);
 if(!Number.isSafeInteger(revision)||revision<1)fail('Revisão inválida.');
 if(!model||typeof model.contentHash!=='string'||!model.contentHash||typeof model.templateId!=='string'||!Number.isInteger(model.revision))fail('Gere o modelo exato antes da seleção.');
 let total=0n;
 const weighted=blocks.map(block=>{
  const value=BigInt(units(amounts[block.sectionId]));total+=value;
  const questions=block.questions.map(q=>{
   if(!q.choices.includes(key[q.questionId]))fail('Gabarito ausente ou incompatível na questão '+q.number+' ('+q.type+').');
   return Object.freeze({questionId:q.questionId,number:q.number,type:q.type,correct:key[q.questionId]});
  });
  return Object.freeze({sectionId:block.sectionId,label:block.label,valueUnits:value.toString(),questions:Object.freeze(questions)});
 });
 if(total>100000000n)fail('Valor total acima de 10.000 pontos.');
 return Object.freeze({schema:PLAN_SCHEMA,revision,
  metadata:Object.freeze({title:textField(metadata?.title,'o título'),subject:textField(metadata?.subject,'o componente',120),
   kind:textField(metadata?.kind,'o tipo',80),className:String(metadata?.className||'').slice(0,120),date:String(metadata?.date||'')}),
  model:Object.freeze({templateId:model.templateId,revision:model.revision,contentHash:model.contentHash}),
  totalUnits:total.toString(),display,...(scoreDecimals===undefined?{}:{scoreDecimals}),blocks:Object.freeze(weighted)});
}
export function assertPlanBinding(plan,manifest,template){
 if(!plan||plan.schema!==PLAN_SCHEMA)fail('Selecione uma avaliação da sessão.');
 if(!manifest||manifest.contentHash!==plan.model.contentHash||manifest.templateId!==plan.model.templateId||manifest.revision!==plan.model.revision)fail('Modelo do cartão incompatível. Reabra a avaliação selecionada e seu modelo exato.');
 if(template?.questionCount!==plan.blocks.reduce((n,b)=>n+b.questions.length,0))fail('Quantidade de questões incompatível com o plano.');
 return true;
}
const gcd=(a,b)=>{while(b){[a,b]=[b,a%b]}return a||1n};
const add=(a,b)=>{const n=a.n*b.d+b.n*a.d,d=a.d*b.d,g=gcd(n,d);return {n:n/g,d:d/g}};
export function scoreIntegratedPlan(plan,observations,{manifest,template,identityState='disabled',identityMode='seven-digit-code',pageCount=1}={}){
 assertPlanBinding(plan,manifest,template);
 if(identityMode==='seven-digit-code'&&identityState!=='read')return {complete:false,reason:'Identificação de sete dígitos inconclusiva.'};
 if(pageCount!==1)return {complete:false,reason:'Aguarde todas as páginas para calcular nota final.'};
 return calculatePlanScore(plan,observations);
}
// Shared exact arithmetic. Only the guarded public entry points may call this.
function calculatePlanScore(plan,observations){
 const expected=plan.blocks.flatMap(b=>b.questions);
 if(!Array.isArray(observations)||observations.length!==expected.length)return {complete:false,reason:'Questões não correspondem à avaliação.'};
 const provided=new Map();
 for(const o of observations){
  if(!o||provided.has(o.questionId))return {complete:false,reason:'Questões duplicadas.'};
  provided.set(o.questionId,o);
 }
 let sum={n:0n,d:1n},correctAll=0,blanks=0,doubles=0;
 const blocks=[];
 for(const block of plan.blocks){
  let correct=0;
  for(const q of block.questions){
   const o=provided.get(q.questionId);
   if(!o||o.number!==q.number)return {complete:false,reason:'Número ou ID de questão incompatível.'};
   if(!['read','blank','double','reviewed'].includes(o.state)||o.reviewed===false)return {complete:false,reason:'Questão '+q.number+' inconclusiva.'};
   if((o.state==='blank'||o.state==='double')&&o.answer!=null)return {complete:false,reason:'Estado óptico incompatível na questão '+q.number+'.'};
   if(o.answer!=null&&!QUESTION_TYPES[q.type].includes(o.answer))return {complete:false,reason:'Alternativa inválida na questão '+q.number+'.'};
   if(o.state==='blank')blanks++;
   if(o.state==='double')doubles++;
   if(o.answer===q.correct)correct++;
  }
  const n=BigInt(block.valueUnits)*BigInt(correct),d=POINT_SCALE*BigInt(block.questions.length);
  sum=add(sum,{n,d});correctAll+=correct;
  blocks.push(Object.freeze({id:block.sectionId,label:block.label,correct,count:block.questions.length,
   earned:formatScore(n,d,plan.scoreDecimals),maximum:formatScore(BigInt(block.valueUnits),POINT_SCALE,plan.scoreDecimals)}));
 }
 return Object.freeze({complete:true,total:formatScore(sum.n,sum.d,plan.scoreDecimals),maximum:formatScore(BigInt(plan.totalUnits),POINT_SCALE,plan.scoreDecimals),
  correct:correctAll,blank:blanks,double:doubles,count:expected.length,display:plan.display,blocks:Object.freeze(blocks)});
}
// This result can only be displayed locally. It is never an academic completion
// and cannot be handed to integratedScoreHtml or an identity binding operation.
export function scoreProvisionalPlan(plan,observations,{manifest,template,identityState,identityMode,pageCount}={}){
 assertPlanBinding(plan,manifest,template);
 const pending=reason=>Object.freeze({complete:false,provisional:true,calculable:false,
  bindingAllowed:false,publicationAllowed:false,scope:'local-capture',reason});
 if(template.templateId!==manifest.templateId||template.revision!==manifest.revision)
  return pending('Template incompatível com o modelo exato.');
 if(identityState!=='review'||identityMode!=='seven-digit-code'||
   template?.identity?.mode!=='seven-digit-code'||manifest?.identity?.mode!=='seven-digit-code')
  return pending('A prévia exige identificação de sete dígitos realmente pendente.');
 if(pageCount!==1||template.pageCount!==1||!Array.isArray(manifest.pages)||
   manifest.pages.length!==1||manifest.pages[0]?.page!==1)
  return pending('Aguarde todas as páginas; a prévia local não agrega capturas.');
 const invalid=previewPlanError(plan);
 if(invalid)return pending(invalid);
 // A read observation without an alternative is missing, rather than a blank.
 if(Array.isArray(observations)&&observations.some(o=>o?.state==='read'&&o.answer==null))
  return pending('Resposta lida sem alternativa.');
 if(Array.isArray(observations)&&observations.some(o=>o?.page!==1))
  return pending('Questão sem a página explícita da captura.');
 if(Array.isArray(observations)&&observations.some(o=>o?.state==='read'&&o.recognition==='partial'))
  return pending('Reconhecimento parcial exige revisão com identificação pendente.');
 const score=calculatePlanScore(plan,observations);
 if(!score.complete)return pending(score.reason);
 return Object.freeze({...score,complete:false,provisional:true,calculable:true,
  bindingAllowed:false,publicationAllowed:false,identityState:'review',scope:'local-capture'});
}
function previewPlanError(plan){
 // Historical four-decimal weights remain intact; validate without rescaling.
 let total=0n;
 normalizeBlocks(plan.blocks);
 validScoreDecimals(plan.scoreDecimals);
 if(!DISPLAY_MODES.includes(plan.display))return 'Exibição inválida.';
 for(const block of plan.blocks){
  if(typeof block.valueUnits!=='string'||!/^[1-9]\d{0,7}$/.test(block.valueUnits))
   return 'Valor de bloco inválido.';
  total+=BigInt(block.valueUnits);
  for(const q of block.questions){
   if(!QUESTION_TYPES[q.type].includes(q.correct))return 'Gabarito ausente ou incompatível na questão '+q.number+'.';
  }
 }
 if(total>100000000n||total.toString()!==plan.totalUnits)return 'Valor total incompatível com os blocos.';
 return null;
}
const captureToken=value=>Number.isSafeInteger(value)&&value>0||
 typeof value==='string'&&value.trim().length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);
// Separate contract for an explicitly declared page partition. Current official
// one-page models cannot be turned into multi-page models by changing an option.
// Every multi-page manifest must declare pages[].questionIds before use here.
export function scoreIntegratedPages(plan,readings,{manifest,template}={}){
 assertPlanBinding(plan,manifest,template);
 const pending=reason=>Object.freeze({complete:false,provisional:false,calculable:false,
  bindingAllowed:false,publicationAllowed:false,reason});
 if(template.templateId!==manifest.templateId||template.revision!==manifest.revision)
  return pending('Template incompatível com o modelo exato.');
 if(template?.identity?.mode!=='seven-digit-code'||manifest?.identity?.mode!=='seven-digit-code')
  return pending('A reunião de páginas exige o mesmo código válido de sete dígitos.');
 const count=template.pageCount,pages=manifest.pages;
 if(!Number.isSafeInteger(count)||count<2||!Array.isArray(pages)||pages.length!==count)
  return pending('Modelo sem contrato explícito de múltiplas páginas.');
 const expected=new Set(plan.blocks.flatMap(b=>b.questions.map(q=>q.questionId)));
 const assigned=new Set(),pageMap=new Map();
 for(const p of pages){
  if(!Number.isInteger(p?.page)||p.page<1||p.page>count||pageMap.has(p.page)||
    !Array.isArray(p.questionIds)||!p.questionIds.length)return pending('Contrato de páginas incompleto ou duplicado.');
  const ids=new Set();
  for(const id of p.questionIds){
   if(!expected.has(id)||assigned.has(id))return pending('Questões duplicadas ou incompatíveis no contrato de páginas.');
   ids.add(id);assigned.add(id);
  }
  pageMap.set(p.page,ids);
 }
 if(assigned.size!==expected.size)return pending('Contrato de páginas não cobre a avaliação.');
 if(!Array.isArray(readings)||readings.length!==count)return pending('Aguarde o conjunto completo de páginas.');
 const captures=new Set(),seenPages=new Set(),observations=[];
 let identityCode,sessionId;
 for(const r of readings){
  if(!r||!captureToken(r.captureId)||!captureToken(r.sessionId)||captures.has(r.captureId))
   return pending('Captura ausente ou duplicada.');
  captures.add(r.captureId);
  if(sessionId===undefined)sessionId=r.sessionId;
  if(r.sessionId!==sessionId)return pending('Páginas pertencem a sessões diferentes.');
  if(r.templateId!==manifest.templateId||r.templateRevision!==manifest.revision||
    r.contentHash!==manifest.contentHash||r.pageCount!==count)return pending('Modelo ou revisão de página incompatível.');
  if(!pageMap.has(r.page)||seenPages.has(r.page))return pending('Página ausente, inválida ou duplicada.');
  seenPages.add(r.page);
  const code=r.identity?.code;
  if(r.identity?.state!=='read'||typeof code!=='string'||!/^\d{7}$/.test(code))
   return pending('Identificação de sete dígitos inconclusiva.');
  if(identityCode===undefined)identityCode=code;
  if(code!==identityCode)return pending('As páginas não têm o mesmo código do aluno.');
  const ids=pageMap.get(r.page),seenQuestions=new Set();
  if(!Array.isArray(r.observations)||r.observations.length!==ids.size)return pending('Página com questões faltantes.');
  for(const o of r.observations){
   if(!o||o.page!==r.page||!ids.has(o.questionId)||seenQuestions.has(o.questionId))
    return pending('Questão duplicada ou incompatível com a página.');
   if(o.state==='read'&&o.answer==null)return pending('Resposta lida sem alternativa.');
   seenQuestions.add(o.questionId);observations.push(o);
  }
 }
 const invalid=previewPlanError(plan);
 if(invalid)return pending(invalid);
 const score=calculatePlanScore(plan,observations);
 if(!score.complete)return pending(score.reason);
 return Object.freeze({...score,provisional:false,calculable:true,bindingAllowed:true,
  publicationAllowed:false,identityCode,pageCount:count});
}
export function keyTextForPlan(plan){
 return plan.blocks.flatMap(b=>b.questions).sort((a,b)=>a.number-b.number).map(q=>q.number+' '+q.correct).join('\n');
}
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&#39;'}[ch]));
export function integratedScoreHtml(score,{stale=false}={}){
 if(!score?.complete)fail('Nota não concluída.');
 let html=stale?'<span class="scan-last-reading">Última leitura bem-sucedida — nova leitura não concluída</span>':'';
 if(score.display!=='blocks')html+='<strong>'+(stale?'Nota da última leitura':'Nota final')+' '+score.total+' / '+score.maximum+'</strong>';
 if(score.display!=='final')html+='<div class="integrated-block-results" aria-label="Notas por bloco">'+
  score.blocks.map(b=>'<div><span>'+esc(b.label)+'</span><strong>'+b.earned+' / '+b.maximum+'</strong></div>').join('')+'</div>';
 html+='<span>'+score.correct+' acerto(s) em '+score.count+' questões; '+score.blank+' brancos, '+score.double+' duplas. Nota não registrada no Diário.</span>';
 return html;
}
