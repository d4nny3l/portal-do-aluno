// PR #38: real editor handlers + encrypted repository revisions in isolated D1.
// No students, accounts, remote services, grades or production database are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,ALICE,CLASS_A} from './helpers.mjs';
import {AssessmentRepository} from '../../corretor/v2/assessments/repository.mjs';
import {makeBundle,bundleKeyText} from '../../corretor/v2/assessments/domain.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
import {importCardManifest} from '../../corretor/v2/omr/manifest.mjs';
import {parseAnswerKey} from '../../corretor/v2/omr/answer-key.mjs';

const html=readFileSync(new URL('../../plataforma/corretor-v2.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const handler=id=>script.split('\n').find(line=>line.startsWith(`$('${id}').onclick=`)).slice(`$('${id}').onclick=`.length).replace(/;$/,'');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={}}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=items}
 setAttribute(key,value){this.attrs[key]=value}
}
const descendants=e=>[e,...e.children.flatMap(descendants)];

function editorFixture(){
 const sections=[],host=new Element('div');
 const fields={sectionManager:host,count:{value:'20'},type:{value:'A-E'},sectionLabel:{value:''},buildStatus:{textContent:''}};
 const $=id=>fields[id];
 const original=script.match(/function originalQuestionOrder\(question\)[^\n]+/)[0],renumber=script.match(/function renumberEditableQuestions\(\)[^\n]+/)[0];
 const draw=script.slice(script.indexOf('function drawSections()'),script.indexOf("$('add').onclick="));
 const init=new Function('sections','$','document','build','syncConditionalFields','layoutRevision','assessmentBank','nextQuestionNumber','nextSectionOrder',original+';'+renumber+';'+draw+';return {drawSections,add:'+handler('add')+',next:()=>nextQuestionNumber}');
 const editor=init(sections,$,{createElement:tag=>new Element(tag)},()=>{},()=>{},8,null,1,0);
 const remove=index=>{const button=descendants(host).find(e=>e.attrs['aria-label']==='Remover seção '+index);assert.ok(button,'remove section '+index);button.onclick()};
 return {...editor,sections,fields,remove};
}

function provisionalScore(bundle){
 const template=importCardManifest(bundle.manifest).template;
 const fields={answerKey:{value:bundleKeyText(bundle)},scanMaxScore:{value:'10'},scanScore:{hidden:true,dataset:{},innerHTML:''}};
 const answers=new Map(bundle.answerKey.questions.map(q=>[q.questionId,q.correct]));
 const observations=template.questions.map((q,index)=>({
  questionId:q.questionId,
  number:q.number,
  answer:index%2===0?answers.get(q.questionId):q.choices.find(choice=>choice!==answers.get(q.questionId)),
  reviewed:true,
  state:'read'
 }));
 const calculate=script.match(/function calculateScore\(\)[^\n]+/)[0];
 const fn=new Function('$','activeObservations','parseKey','template','activeHistoryEntry','renderHistory',calculate+';return calculateScore;')(
  id=>fields[id],observations,()=>parseAnswerKey(fields.answerKey.value,template.questions),template,null,()=>{}
 );
 fn();
 assert.equal(fields.scanScore.hidden,false);
 assert.equal(fields.scanScore.dataset.review,'false');
 assert.match(fields.scanScore.innerHTML,/Nota provisória 5,00 \/ 10,00/);
 assert.match(fields.scanScore.innerHTML,new RegExp('\\b'+(observations.length/2)+' acerto\\(s\\) em '+observations.length+' questão'));
 return fields.scanScore.innerHTML;
}

test('PR38: save, remove, renumber, append, save another revision and reopen both keyed answer maps',async t=>{
 const h=harness();t.after(()=>h.db.close());
 const cookie=await h.login('teacher-one');
 const keys=new Map(),keyStore={getKey:async id=>keys.get(id)||null,saveScopeKey:async(id,key)=>keys.set(id,key)};
 const fetchApi=(path,options)=>h.request(path,{method:options.method,cookie,...(options.body?{data:JSON.parse(options.body)}:{})});
 const repo=await new AssessmentRepository({fetchApi,keyStore}).initialize();
 const id=crypto.randomUUID(),editor=editorFixture(),answerById=new Map();
 editor.add();editor.add();
 assert.equal(editor.sections.length,2);
 const initial=editor.sections.flatMap(s=>s.items);
 assert.deepEqual(initial.map(q=>q.number),Array.from({length:40},(_,i)=>i+1));
 initial.forEach((q,index)=>answerById.set(q.questionId,['A','B','C','D','E'][index%5]));
 const capture=revision=>{
  const template=createTemplate(editor.sections,{revision:7+revision,identityMode:'none'});
  const manifest=createCardManifest(template,null,{sectionFrameStyle:'content'});
  const keyText=template.questions.map(q=>`${q.number} ${answerById.get(q.questionId)||''}`).join('\n');
  return makeBundle({id,revision,ownerId:ALICE,classId:CLASS_A,periodId:'p2026-4',title:'Avaliação PR38 fictícia',subject:'Matemática',kind:'Prova',maxScore:10,state:'draft',
   manifest,editor:{version:1,sections:structuredClone(editor.sections),nextQuestionNumber:editor.next()},keyText});
 };
 const first=await repo.save(capture(1));
 assert.equal(first.revision,1);
 const original=structuredClone(first);
 // Remove the first 20 questions through the actual UI event handler.
 editor.remove(1);
 assert.deepEqual(editor.sections.flatMap(s=>s.items.map(q=>q.number)),Array.from({length:20},(_,i)=>i+1));
 const surviving=editor.sections.flatMap(s=>s.items.map(q=>q.questionId));
 assert.deepEqual(surviving,initial.slice(20).map(q=>q.questionId));
 editor.fields.count.value='10';
 editor.add();
 const all=editor.sections.flatMap(s=>s.items);
 assert.deepEqual(all.map(q=>q.number),Array.from({length:30},(_,i)=>i+1));
 const newItems=all.slice(20);
 assert.ok(newItems.every(q=>!initial.some(old=>old.questionId===q.questionId)),'never reuse removed IDs');
 newItems.forEach((q,index)=>answerById.set(q.questionId,['E','D','C','B','A'][index%5]));
 const second=await repo.save(capture(2));
 assert.equal(second.revision,2);
 assert.notEqual(first.optical.contentHash,second.optical.contentHash);
 assert.deepEqual(second.answerKey.questions.map(q=>q.questionId),all.map(q=>q.questionId));
 for(const q of second.answerKey.questions)assert.equal(q.correct,answerById.get(q.questionId));

 // New repository instance: read the encrypted historical revision and the new one.
 const reopened=await new AssessmentRepository({fetchApi,keyStore}).initialize();
 const old=await reopened.load(id,1),current=await reopened.load(id,2);
 assert.deepEqual(old,original,'original immutable historical revision');
 assert.deepEqual(old.answerKey.questions.map(q=>q.number),Array.from({length:40},(_,i)=>i+1));
 assert.deepEqual(current.answerKey.questions.map(q=>q.number),Array.from({length:30},(_,i)=>i+1));
 assert.deepEqual(current.answerKey.questions.map(q=>[q.questionId,q.correct]),second.answerKey.questions.map(q=>[q.questionId,q.correct]));
 for(const q of old.answerKey.questions)assert.equal(q.correct,answerById.get(q.questionId));
 provisionalScore(old);
 provisionalScore(current);
 assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_revisions').get().n,2);
});
