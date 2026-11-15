import {importCardManifest} from '../omr/manifest.mjs';
import {parseAnswerKey} from '../omr/answer-key.mjs';
export const BUNDLE_SCHEMA='salta-assessment-bundle-v1';
export const STATES=Object.freeze(['draft','issued','archived']);
const fail=message=>{throw new TypeError(message)};
const text=(value,max,label,required=true)=>{
 if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/u.test(value)||(required&&!value.trim()))fail(`Revise ${label}.`);
 return value.trim();
};
export function makeBundle({id,revision,ownerId,classId,periodId,title,subject,kind,date,maxScore,state='draft',manifest,editor,keyText}){
 const {template}=importCardManifest(manifest);
 if(template.mode!=='full-page'||template.questions.some(q=>!['A-D','A-E','C-E'].includes(q.type)))fail('O banco aceita cartões A4 objetivos A–D, A–E ou C–E nesta fase.');
 const parsed=parseAnswerKey(keyText,template.questions);if(!parsed.valid)fail(parsed.error);
 if(!STATES.includes(state)||!Number.isSafeInteger(revision)||revision<1||!Number.isFinite(maxScore)||maxScore<0)fail('Estado, revisão ou valor máximo inválido.');
 if(state==='issued'&&!date)fail('Informe a data da aplicação para emitir uma revisão.');
 const dateValue=date?Date.parse(date+'T12:00:00Z'):null;
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(dateValue)||new Date(dateValue).toISOString().slice(0,10)!==date))fail('Data inválida.');
 const bundle={schema:BUNDLE_SCHEMA,id,revision,ownerId,classId,periodId,title:text(title,160,'o título'),subject:text(subject,120,'o componente'),kind:text(kind,80,'o tipo'),date:date||'',maxScore,state,editor:structuredClone(editor),manifest:structuredClone(manifest),
  answerKey:{assessmentId:id,revision,status:state,updatedAt:new Date().toISOString(),questions:template.questions.map(q=>({questionId:q.questionId,number:q.number,type:q.type,correct:parsed.answers.get(q.questionId),weight:1}))},
  optical:{assessmentId:id,assessmentRevision:revision,modelId:manifest.templateId,modelRevision:manifest.revision,contentHash:manifest.contentHash}};
 return validateBundle(bundle,{id,revision,ownerId,classId,periodId,state,manifestHash:manifest.contentHash});
}
export function validateBundle(b,record){
 if(!b||b.schema!==BUNDLE_SCHEMA||!STATES.includes(b.state)||!Number.isFinite(b.maxScore)||b.maxScore<0)fail('Definição de avaliação inválida.');
 for(const key of ['id','revision','ownerId','classId','periodId','state'])if(b[key]!==record[key])fail('A avaliação recuperada não corresponde à revisão autorizada.');
 const {template}=importCardManifest(b.manifest);
 if(template.mode!=='full-page')fail('Quadros incorporados não estão habilitados no banco.');
 if(b.optical?.assessmentId!==b.id||b.optical?.assessmentRevision!==b.revision||b.optical?.contentHash!==record.manifestHash||b.manifest.contentHash!==record.manifestHash||b.optical?.modelId!==b.manifest.templateId||b.optical?.modelRevision!==b.manifest.revision)fail('O modelo óptico não corresponde à avaliação.');
 if(b.answerKey?.assessmentId!==b.id||b.answerKey.revision!==b.revision||b.answerKey.status!==b.state||!Array.isArray(b.answerKey.questions)||b.answerKey.questions.length!==template.questions.length)fail('O gabarito não corresponde à avaliação.');
 const byId=new Map(b.answerKey.questions.map(q=>[q.questionId,q]));if(byId.size!==template.questionCount)fail('IDs de gabarito repetidos.');
 for(const question of template.questions){const entry=byId.get(question.questionId);if(!entry||entry.number!==question.number||entry.type!==question.type||entry.weight!==1||!question.choices.includes(entry.correct)||question.type==='CDU')fail('Gabarito incompatível com as questões do modelo.');}
 text(b.title,160,'o título');text(b.subject,120,'o componente');text(b.kind,80,'o tipo');
 return b;
}
export const bundleKeyText=b=>b.answerKey.questions.map(q=>`${q.number} ${q.correct}`).join('\n');
export const cryptoContext=record=>({tenantId:'salta-assessments-lab',scopeId:record.classId+'.'+record.periodId,objectId:record.id,type:'assessment.bundle.v1',keyVersion:1,revision:record.revision});
