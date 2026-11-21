import test from 'node:test';
import assert from 'node:assert/strict';
import {applyKeyPaste,createIntegratedPlan,scoreIntegratedPlan,assertPlanBinding,integratedScoreHtml,
 draftSummary,formatExact,keyTextForPlan,units,normalizeBlocks} from '../assessments/block-scoring.mjs';

const model={templateId:'omr-a4',revision:8,contentHash:'hash-v2-model'};
const section=(id,count,type='A-E',from=1)=>({
 sectionId:id,label:'Bloco '+id,items:Array.from({length:count},(_,i)=>({questionId:id+'-q'+i,number:from+i,type}))
});
const sections=[section('a',8),section('b',4,'C-E',9)];
const all=sections.flatMap(b=>b.items);
const answers=Object.fromEntries(all.map(q=>[q.questionId,q.type==='C-E'?'C':'A']));
const values={a:'4',b:'2,5000'};
const metadata={title:'Prova sintética',subject:'Matemática',kind:'Prova objetiva',className:'Turma sintética',date:'2026-11-18'};
const make=(overrides={})=>createIntegratedPlan({metadata,sections,values,answers,model,...overrides});
const context=(plan,overrides={})=>({manifest:{...model},template:{questionCount:plan.blocks.flatMap(x=>x.questions).length},identityState:'read',identityMode:'seven-digit-code',pageCount:1,...overrides});
const read=(sectionList=sections,select=()=>true)=>sectionList.flatMap(b=>b.items.map(q=>({
 questionId:q.questionId,number:q.number,state:'read',reviewed:true,answer:select(q)?answers[q.questionId]:(q.type==='C-E'?'E':'B')
})));

test('8 questions worth 4 points use 0.5 per correct; wrong, blank and double zero',()=>{
 const plan=make();
 const observations=read();
 observations[0].answer='B';
 observations[1].state='blank';observations[1].answer=null;
 observations[2].state='double';observations[2].answer=null;
 const score=scoreIntegratedPlan(plan,observations,context(plan));
 assert.equal(score.complete,true);
 assert.deepEqual(score.blocks.map(b=>[b.correct,b.earned,b.maximum]),[[5,'2,50','4,00'],[4,'2,50','2,50']]);
 assert.equal(score.total,'5,00');assert.equal(score.maximum,'6,50');
 assert.equal(score.blank,1);assert.equal(score.double,1);assert.equal(score.correct,9);
 assert.match(integratedScoreHtml(score),/Nota final 5,00 \/ 6,50/);
});
test('fractional sums are exact: three 1-point blocks at 1/3 each yield 1.00, not 0.99',()=>{
 const thirds=[section('a',3,'A-D',1),section('b',3,'A-D',4),section('c',3,'A-D',7)];
 const key=Object.fromEntries(thirds.flatMap(b=>b.items.map(q=>[q.questionId,'A'])));
 const plan=make({sections:thirds,values:{a:'1',b:'1',c:'1'},answers:key});
 const observations=thirds.flatMap(b=>b.items.map((q,i)=>({questionId:q.questionId,number:q.number,state:'read',answer:i===0?'A':'B'})));
 const score=scoreIntegratedPlan(plan,observations,context(plan));
 assert.equal(score.total,'1,00');assert.deepEqual(score.blocks.map(x=>x.earned),['0,33','0,33','0,33']);
 assert.equal(formatExact(1n,6n),'0,17');
});
test('four-place decimal block values preserve numeric exactness and comma decimals',()=>{
 assert.equal(units('0,0001'),'1');assert.equal(units('12.3456'),'123456');
 assert.equal(formatExact(123456n,10000n,4),'12,3456');
 assert.equal(draftSummary({sections,values,answers}).total,'6,50');
 for(const v of ['0','-1','1.12345','1e3','NaN','10000'])assert.throws(()=>units(v));
});
test('visual key and numbered/sequence paste are a single question-ID state, with atomic rejection',()=>{
 const initial={'a-q0':'A'};
 const update=applyKeyPaste('2 B\n9 E',sections,initial);
 assert.deepEqual(update,{'a-q0':'A','a-q1':'B','b-q0':'E'});
 assert.deepEqual(initial,{'a-q0':'A'},'original state remains unchanged');
 const full=applyKeyPaste(Array.from({length:12},(_,i)=>i>=8?'C':'A').join(' '),sections,{});
 assert.equal(full['a-q0'],'A');assert.equal(full['b-q3'],'C');
 assert.throws(()=>applyKeyPaste('1 A\n1 B',sections,initial),/repetida/);
 assert.throws(()=>applyKeyPaste('9 D',sections,initial),/inválida/);
 assert.throws(()=>applyKeyPaste('13 A',sections,initial),/não pertence/);
 assert.throws(()=>applyKeyPaste('A B',sections,initial),/12 respostas/);
 assert.throws(()=>applyKeyPaste('1 A\n2 D\n3?',sections,initial),/Use uma resposta/);
});
test('incomplete, missing block values, incompatible type and unsupported CDU fail before selection',()=>{
 assert.throws(()=>make({answers:{...answers,'a-q0':''}}),/questão 1/);
 assert.throws(()=>make({values:{a:'4'}}),/valor positivo/);
 assert.throws(()=>make({values:{a:'0',b:'2'}}),/maior que zero/);
 assert.throws(()=>make({answers:{...answers,'b-q0':'A'}}),/questão 9/);
 assert.throws(()=>createIntegratedPlan({metadata,sections:[section('c',1,'CDU')],values:{c:'1'},answers:{'c-q0':'C'},model}),/não possui leitura óptica/);
 assert.throws(()=>normalizeBlocks([section('a',1,'A-D'),section('a',1,'A-D')]),/IDs repetidos/);
});
test('stable question IDs survive numbering changes and block reorder; paste respects current numbers',()=>{
 const reordered=[
 {sectionId:'b',label:'Segundo',items:[{questionId:'a-q1',number:7,type:'A-D'}]},
 {sectionId:'a',label:'Primeiro',items:[{questionId:'a-q0',number:2,type:'A-D'}]}
 ];
 const key=applyKeyPaste('2 B\n7 D',reordered,{});
 const plan=createIntegratedPlan({metadata,sections:reordered,values:{a:'3',b:'2'},answers:key,model});
 const o=[{questionId:'a-q1',number:7,state:'read',answer:'D'},{questionId:'a-q0',number:2,state:'read',answer:'B'}];
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).total,'5,00');
 assert.equal(keyTextForPlan(plan),'2 B\n7 D');
});
test('no definitive score for ambiguous image, unreadable identity, wrong page or wrong manifest',()=>{
 const plan=make(),o=read();
 o[0].state='review';o[0].answer=null;o[0].reviewed=false;
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).complete,false);
 o[0]={questionId:'a-q0',number:1,state:'read',answer:'A'};
 assert.match(scoreIntegratedPlan(plan,o,context(plan,{identityState:'review'})).reason,/Identificação/);
 assert.match(scoreIntegratedPlan(plan,o,context(plan,{pageCount:2})).reason,/páginas/);
 assert.throws(()=>assertPlanBinding(plan,{...model,contentHash:'another-model'},context(plan).template),/incompatível/);
 assert.throws(()=>scoreIntegratedPlan(plan,o,context(plan,{manifest:{...model,revision:9}})),/incompatível/);
});
test('white/duple question with claimed answer, duplication and invalid choice cannot be final',()=>{
 const plan=make(),o=read();
 o[0].state='double';
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).complete,false);
 o[0].answer=null;
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).complete,true);
 o[1].questionId='a-q0';
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).complete,false);
 o[1].questionId='a-q1';o[1].answer='X';
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).complete,false);
});
test('manual override recomputes without touching planned correct answers or any external service',()=>{
 const plan=make(),o=read();
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).total,'6,50');
 o[0].state='reviewed';o[0].answer='B';o[0].reviewed=true;
 assert.equal(scoreIntegratedPlan(plan,o,context(plan)).total,'6,00');
 assert.equal(plan.blocks[0].questions[0].correct,'A');
});
test('display modes show final only, blocks only, or both; labels escaped',()=>{
 for(const display of ['final','blocks','both']){
  const plan=make({display,sections:[{...sections[0],label:'<img src=x onerror=alert(1)>'},sections[1]]});
  const scored=scoreIntegratedPlan(plan,read(),context(plan)),html=integratedScoreHtml(scored);
  assert.equal(html.includes('Nota final'),display!=='blocks');
  assert.equal(html.includes('integrated-block-results'),display!=='final');
  assert.doesNotMatch(html,/<img /);
  if(display!=='final')assert.match(html,/&lt;img/);
 }
 const plan=make();
 assert.match(integratedScoreHtml(scoreIntegratedPlan(plan,read(),context(plan)),{stale:true}),/Última leitura bem-sucedida/);
 assert.doesNotMatch(integratedScoreHtml(scoreIntegratedPlan(plan,read(),context(plan)),{stale:true}),/Nota final/);
});
