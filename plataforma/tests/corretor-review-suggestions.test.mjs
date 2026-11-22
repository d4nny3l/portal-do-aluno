import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreInputUnits,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {formatScore} from '../../corretor/v2/assessments/score-format.mjs';
// Native Function-based regression harness executes the page's production handler
// outside its ESM module; expose only the exact pure scoring helpers in this test worker.
Object.assign(globalThis,{scoreInputUnits,POINT_SCALE,formatScore});

// Execute the production renderAnswers, calculateScore and select.onchange.
const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
function source(name){
 const match=script.match(new RegExp('function '+name+'\\([^\\n]+'));
 assert.ok(match,'missing production handler '+name);
 return match[0];
}
class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.hidden=false;this.value='';this.className='';
  this.classList={remove:token=>{this.className=this.className.split(/\s+/).filter(x=>x!==token).join(' ')}};
 }
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes]}
 setAttribute(k,v){this.attrs[k]=v}
 removeAttribute(k){delete this.attrs[k]}
}
function setup(){
 const fields={answers:new Element('div'),status:new Element('p'),scanScore:new Element('div'),scanMaxScore:{value:'10'}};
 const $=id=>{assert.ok(fields[id],'missing #'+id);return fields[id]};
 const template={pageCount:1,questions:[
  {questionId:'q1',choices:['A','B','C','D']},
  {questionId:'q2',choices:['A','B','C','D','E']},
  {questionId:'q3',choices:['A','B','C','D']},
  {questionId:'q4',choices:['C','E']},
  {questionId:'q5',choices:['A','B','C','D','E']}
 ]};
 const answers=new Map([['q1','A'],['q2','C'],['q3','D'],['q4','E'],['q5','B']]);
 const make=new Function('$','document','template','parseKey','renderHistory','activeHistoryEntry',
  'let activeObservations=[];'+source('calculateScore')+';'+source('renderAnswers')+';return {render:renderAnswers,state:()=>activeObservations}');
 const editor=make($,{createElement:tag=>new Element(tag)},template,()=>({valid:true,answers}),()=>{throw Error('No history without review')},null);
 const row=index=>{const item=fields.answers.children[index];return {item,label:item.children[0],select:item.children[1],hint:item.children[2]}};
 return {fields,editor,row};
}
const observations=[
 {number:1,questionId:'q1',state:'read',answer:'A',marks:['A']},
 {number:2,questionId:'q2',state:'review',answer:'E',marks:['E']},
 {number:3,questionId:'q3',state:'double',answer:null,marks:['D','B','invalid']},
 {number:4,questionId:'q4',state:'blank',answer:null,marks:[]},
 {number:5,questionId:'q5',state:'review',answer:null,marks:[]},
];
test('A-02: real DOM handlers display neutral, accessible single/multiple suspicions without preselection',()=>{
 const {fields,editor,row}=setup();editor.render({observations});
 assert.equal(fields.answers.children.length,5);
 assert.equal(row(0).select.value,'A');assert.equal(row(0).hint,undefined);
 assert.equal(row(1).select.value,'');assert.equal(editor.state()[1].answer,null);
 assert.equal(row(1).hint.textContent,'Possível marcação: E. Confira na imagem.');
 assert.equal(row(1).hint.attrs.role,'note');
 assert.equal(row(1).select.attrs['aria-describedby'],row(1).hint.id);
 assert.equal(row(2).hint.textContent,'Possíveis marcações: B e D. Confira na imagem.');
 assert.equal(row(2).select.value,'__blank__');
 assert.equal(row(3).hint,undefined);assert.equal(row(4).hint,undefined);
 assert.equal(fields.scanScore.dataset.review,'true');
 assert.match(fields.scanScore.innerHTML,/Leitura inconclusiva: 2 questão/);
 assert.doesNotMatch(fields.answers.children.flatMap(x=>x.children.map(y=>y.textContent||'')).join(' '),/contentHash|hash|\bv2\b/i);
});
test('A-02: teacher can override while blank and double count as zero without mandatory confirmation',()=>{
 const {fields,editor,row}=setup();editor.render({observations});
 row(1).select.value='Z';row(1).select.onchange();
 assert.equal(editor.state()[1].reviewed,false);
 row(1).select.value='C';row(1).select.onchange();
 assert.equal(editor.state()[1].answer,'C');assert.equal(row(1).hint.hidden,true);
 assert.equal(row(1).select.attrs['aria-describedby'],undefined);
 assert.match(fields.scanScore.innerHTML,/Leitura inconclusiva: 1 questão/);
 row(2).select.value='B';row(2).select.onchange();
 assert.equal(editor.state()[2].answer,'B');assert.equal(fields.scanScore.dataset.review,'true');
 row(3).select.value='__blank__';row(3).select.onchange();
 assert.equal(editor.state()[3].answer,null);assert.equal(editor.state()[3].reviewed,true);
 assert.equal(fields.scanScore.dataset.review,'true');
 row(4).select.value='B';row(4).select.onchange();
 assert.equal(fields.scanScore.dataset.review,'false');
 assert.match(fields.scanScore.innerHTML,/Nota final/);
 assert.match(fields.status.textContent,/Nenhuma nota foi registrada no Diário/);
 assert.ok(editor.state().every(o=>o.reviewed));
 editor.render({observations});
 assert.equal(fields.scanScore.dataset.review,'true');
 assert.equal(editor.state()[1].answer,null);
});


test('P1 recognized partial enters final grade immediately and teacher can override it',()=>{
 const {fields,editor,row}=setup();
 const recognized=[
  {number:15,questionId:'q1',state:'read',answer:'A',marks:['A'],recognition:'partial'},
  {number:26,questionId:'q2',state:'read',answer:'C',marks:['C'],recognition:'strong'},
  {number:29,questionId:'q3',state:'read',answer:'D',marks:['D'],recognition:'strong'},
  {number:41,questionId:'q4',state:'read',answer:'E',marks:['E'],recognition:'partial'},
  {number:50,questionId:'q5',state:'read',answer:'B',marks:['B'],recognition:'strong'},
 ];
 editor.render({observations:recognized});
 assert.ok(editor.state().every(o=>o.reviewed),'read observations never need mandatory confirmation');
 assert.equal(row(0).select.value,'A');
 assert.match(row(0).label.textContent,/15 · A reconhecida · marcação parcial/);
 assert.match(row(0).hint.textContent,/Marcação parcial reconhecida automaticamente/);
 assert.equal(row(3).select.value,'E');
 assert.match(row(3).label.textContent,/41 · E reconhecida · marcação parcial/);
 assert.equal(fields.scanScore.dataset.review,'false');
 assert.match(fields.scanScore.innerHTML,/Nota final 10,00 \/ 10,00/);
 row(0).select.value='B';row(0).select.onchange();
 assert.equal(editor.state()[0].answer,'B','teacher override remains possible');
 assert.equal(row(0).hint.hidden,true);
 assert.equal(fields.scanScore.dataset.review,'false');
 assert.match(fields.scanScore.innerHTML,/Nota final 8,00 \/ 10,00/);
 assert.match(fields.status.textContent,/Nenhuma nota foi registrada no Diário/);
});


test('P1 final classification: blank and double automatically count as zero and wrong answer counts as zero',()=>{
 const {fields,editor,row}=setup();
 const obs=[
  {number:1,questionId:'q1',state:'read',answer:'A',recognition:'strong',marks:['A']},
  {number:2,questionId:'q2',state:'read',answer:'C',recognition:'partial',marks:['C']},
  {number:3,questionId:'q3',state:'double',answer:null,marks:['B','D']},
  {number:4,questionId:'q4',state:'blank',answer:null,marks:[]},
  {number:5,questionId:'q5',state:'read',answer:'A',recognition:'strong',marks:['A']},
 ];
 editor.render({identity:{state:'read',code:'0001123'},observations:obs});
 assert.ok(editor.state().every(o=>o.reviewed));
 assert.equal(row(2).select.value,'__blank__');
 assert.match(row(2).label.textContent,/Inválida — dupla marcação/);
 assert.match(row(3).label.textContent,/Sem resposta — inválida/);
 assert.equal(fields.scanScore.dataset.review,'false');
 assert.match(fields.scanScore.innerHTML,/Nota final 4,00 \/ 10,00/);
 row(2).select.value='D';row(2).select.onchange();
 assert.match(fields.scanScore.innerHTML,/Nota final 6,00 \/ 10,00/);
});

test('P1 code unreadable blocks final grade despite otherwise definitive strong answers',()=>{
 const {fields,editor}=setup();
 const obs=[
  {number:1,questionId:'q1',state:'read',answer:'A',marks:['A']},
  {number:2,questionId:'q2',state:'read',answer:'C',marks:['C']},
  {number:3,questionId:'q3',state:'blank',answer:null,marks:[]},
  {number:4,questionId:'q4',state:'double',answer:null,marks:['C','E']},
  {number:5,questionId:'q5',state:'read',answer:'B',marks:['B']},
 ];
 editor.render({identity:{state:'review',code:null},observations:obs});
 assert.equal(fields.scanScore.dataset.review,'true');
 assert.match(fields.scanScore.innerHTML,/Identificação inconclusiva/);
 assert.doesNotMatch(fields.scanScore.innerHTML,/Nota final/);
 editor.render({identity:{state:'read',code:'0001123'},observations:obs});
 assert.equal(fields.scanScore.dataset.review,'false');
 assert.match(fields.scanScore.innerHTML,/Nota final/);
});
