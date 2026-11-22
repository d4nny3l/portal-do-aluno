// Adapter between the local-only score plan and the private v2 definition.
// No transport, storage, optical recognition or student data in this module.
import {importCardManifest} from '../omr/manifest.mjs';
import {PLAN_SCHEMA,assertPlanBinding} from './block-scoring.mjs';
import {validateScoreDisplay} from './score-format.mjs';

export const PRIVATE_DEFINITION_SCHEMA='salta-assessment-definition-v2';
const fail=message=>{throw new TypeError(message)};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const whole=value=>typeof value==='string'&&/^[1-9][0-9]{0,7}$/.test(value);
const freeze=o=>Object.freeze(o);
const canonicalManifest=manifest=>{
 const {template,manifest:exact}=importCardManifest(manifest);
 if(template.mode!=='full-page'||template.questions.some(q=>!['A-D','A-E','C-E'].includes(q.type)))fail('Modelo óptico completo não suportado.');
 return {template,manifest:exact};
};
export function definitionFromLocalPlan(plan,sourceManifest){
 if(plan?.schema!==PLAN_SCHEMA)fail('Planejamento transitório incompatível.');
 const display={score:plan.display,...(Object.hasOwn(plan,'scoreDecimals')?{scoreDecimals:plan.scoreDecimals}:{})};
 validateScoreDisplay(display);
 const {template,manifest}=canonicalManifest(sourceManifest);
 assertPlanBinding(plan,manifest,template);
 const byId=new Map(template.questions.map(q=>[q.questionId,q])),seen=new Set(),answerIds=new Set();
 let total=0n;
 const blocks=plan.blocks.map(block=>{
  if(typeof block.sectionId!=='string'||!block.sectionId)fail('Bloco sem ID estável.');
  if(!whole(block.valueUnits))fail('Valor do bloco incompatível com escala 1/10000.');
  total+=BigInt(block.valueUnits);
  const questionIds=block.questions.map(q=>{
   const original=byId.get(q.questionId);
   if(!original||original.sectionId!==block.sectionId||original.number!==q.number||original.type!==q.type||seen.has(q.questionId))
    fail('Questões do plano não correspondem ao manifesto exato.');
   if(!original.choices.includes(q.correct))fail('Gabarito fora do formato óptico.');
   seen.add(q.questionId);answerIds.add(q.questionId);return q.questionId;
  });
  if(!questionIds.length)fail('Bloco sem questões.');
  return {blockId:block.sectionId,label:block.label,valueUnits:block.valueUnits,questionIds};
 });
 if(seen.size!==byId.size||answerIds.size!==byId.size||total>100000000n||total.toString()!==plan.totalUnits)
  fail('Cobertura ou valor total incompatível com o manifesto.');
 const byQuestion=new Map(plan.blocks.flatMap(b=>b.questions.map(q=>[q.questionId,q.correct])));
 // Backend expects complete answer map, ordered by the exact manifest.
 const answers=template.questions.map(q=>({questionId:q.questionId,correct:byQuestion.get(q.questionId)}));
 return {schemaVersion:PRIVATE_DEFINITION_SCHEMA,title:plan.metadata.title,subject:plan.metadata.subject,
  kind:plan.metadata.kind,date:plan.metadata.date||'',manifest,blocks,answers,display};
}
export function planFromPrivateRecord(record){
 if(!record||!Number.isSafeInteger(record.revision)||record.revision<1||!record.definition||
    record.definition.schemaVersion!==PRIVATE_DEFINITION_SCHEMA)fail('Revisão privada inválida.');
 const definition=record.definition,{template,manifest}=canonicalManifest(definition.manifest);
 if(record.manifestHash!==manifest.contentHash||record.scoreScale!==10000)fail('Hash ou escala da revisão não conferem.');
 validateScoreDisplay(definition.display);
 const byId=new Map(template.questions.map(q=>[q.questionId,q])),key=new Map(),seen=new Set();
 if(!Array.isArray(definition.answers)||definition.answers.length!==byId.size)fail('Gabarito privado incompleto.');
 for(const item of definition.answers){
  const q=byId.get(item?.questionId);
  if(!q||key.has(q.questionId)||!q.choices.includes(item.correct))fail('Gabarito privado incompatível.');
  key.set(q.questionId,item.correct);
 }
 if(!Array.isArray(definition.blocks)||!definition.blocks.length||definition.blocks.length>32)fail('Blocos privados inválidos.');
 let total=0n;const blockIds=new Set();
 const blocks=definition.blocks.map(block=>{
  if(!block||blockIds.has(block.blockId)||!whole(block.valueUnits)||!Array.isArray(block.questionIds)||!block.questionIds.length)
   fail('Bloco ou valor privado inválido.');
  blockIds.add(block.blockId);total+=BigInt(block.valueUnits);
  const questions=block.questionIds.map(id=>{
   const q=byId.get(id);
   if(!q||q.sectionId!==block.blockId||seen.has(id))fail('Bloco privado não cobre exatamente o manifesto.');
   seen.add(id);
   return freeze({questionId:id,number:q.number,type:q.type,correct:key.get(id)});
  });
  return freeze({sectionId:block.blockId,label:block.label,valueUnits:block.valueUnits,questions:freeze(questions)});
 });
 if(total>100000000n||total.toString()!==record.totalUnits||seen.size!==byId.size)
  fail('Total ou cobertura da revisão privada divergente.');
 const plan=freeze({schema:PLAN_SCHEMA,revision:record.revision,
  metadata:freeze({title:definition.title,subject:definition.subject,kind:definition.kind,
    className:'',date:definition.date}),model:freeze({templateId:manifest.templateId,
    revision:manifest.revision,contentHash:manifest.contentHash}),totalUnits:total.toString(),
  display:definition.display.score,...(Object.hasOwn(definition.display,'scoreDecimals')?{scoreDecimals:definition.display.scoreDecimals}:{}),blocks:freeze(blocks)});
 assertPlanBinding(plan,manifest,template);
 return freeze({plan,manifest,template});
}
export function pinnedSelection(snapshot,expected={}){
 const {selectionId,record}=snapshot||{};
 if(typeof selectionId!=='string'||!isUUID(selectionId)||!record||!isUUID(record.id)||record.status!=='issued')
  fail('Somente uma seleção privada emitida e verificada pode iniciar a correção.');
 if(expected.selectionId&&selectionId!==expected.selectionId)fail('ID de seleção divergente.');
 if(expected.assessmentId&&record.id!==expected.assessmentId)fail('Avaliação selecionada divergente.');
 if(expected.revision&&record.revision!==expected.revision)fail('Revisão selecionada divergente.');
 if(expected.manifestHash&&record.manifestHash!==expected.manifestHash)fail('Hash do modelo divergente.');
 const built=planFromPrivateRecord(record);
 return freeze({selectionId,assessmentId:record.id,revision:record.revision,manifestHash:record.manifestHash,
  plan:built.plan,manifest:built.manifest,template:built.template,
  scope:freeze({institutionId:record.institutionId,classId:record.classId,periodId:record.periodId})});
}
export const isUUID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
