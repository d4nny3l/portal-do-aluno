import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreInputUnits,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {formatScore} from '../../corretor/v2/assessments/score-format.mjs';
// Native Function-based regression harness executes the page's production handler
// outside its ESM module; expose only the exact pure scoring helpers in this test worker.
Object.assign(globalThis,{scoreInputUnits,POINT_SCALE,formatScore});

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
function production(name){
 const line=script.split('\n').filter(x=>x.startsWith('function '+name+'('));
 assert.equal(line.length,1,'production handler '+name);return line[0];
}
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.hidden=false;this.value='';
  this.className='';this.textContent='';this.innerHTML='';
  this.classList={remove:()=>{},add:()=>{}};
 }
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(k,v){this.attrs[k]=v}
 removeAttribute(k){delete this.attrs[k]}
}
function fixture(){
 const fields={
  answers:new Node('div'),status:new Node('p'),scanScore:new Node('div'),cameraGrade:new Node('div'),photoGrade:new Node('div'),cameraProgress:new Node('div'),cameraLiveBadge:new Node('span'),
  scanMaxScore:{value:'10'},canvas:new Node('canvas'),manualAlign:new Node('button'),manualHelp:new Node('p')
 };
 const $=id=>{assert.ok(fields[id],id);return fields[id]};
 const template={pageCount:1,questions:['q1','q2','q3'].map(questionId=>({questionId,choices:['A','B','C','D']}))};
 let key=new Map([['q1','A'],['q2','A'],['q3','A']]),valid=true;
 const build=new Function('$','document','template','parseKey','renderHistory','toPageRaster','updateCaptureComparison','paintGray','setScanMessage',
  'let activeObservations=[],activeHistoryEntry=null,rawRaster=null,normalizedRaster=null,manualMode=false,manualPoints=[];'+
  ['showCameraGrade','markLastReadingPending','calculateScore','renderAnswers','prepareImage'].map(production).join(';')+
  ';return {render:renderAnswers,normalize:prepareImage,score:calculateScore,observations:()=>activeObservations}');
 const editor=build($,{createElement:tag=>new Node(tag)},template,
  ()=>valid?{valid:true,answers:key}:{valid:false,error:'Gabarito incompleto'},
  ()=>{},()=>{throw Error('Nenhum marcador localizado')},()=>{},()=>{},()=>{});
 const observations=(answers=['A','B','C'])=>answers.map((answer,index)=>({
  questionId:'q'+(index+1),number:index+1,state:'read',recognition:'strong',answer,marks:[answer]
 }));
 const page=answers=>({identity:{state:'read',code:'0001123'},observations:observations(answers)});
 return {fields,editor,page,setKey:next=>{key=new Map(next)},setValid:next=>{valid=next},
  row:i=>fields.answers.children[i].children[1]};
}

test('P1-01: failed recapture keeps old score identified through max, key and manual override',()=>{
 const h=fixture(),{fields,editor}=h;
 editor.render(h.page());
 assert.match(fields.scanScore.innerHTML,/Nota final 3,33 \/ 10,00/);
 assert.equal(fields.cameraGrade.textContent,'Nota 3,33');
 assert.equal(fields.scanScore.dataset.stale,'false');

 const invalid=editor.normalize(new Uint8Array(9).fill(245),3,3,{source:'import'});
 assert.equal(invalid,null,'no fiducials, new reading never happened');
 assert.equal(fields.scanScore.dataset.stale,'true');
 assert.match(fields.scanScore.innerHTML,/Última leitura bem-sucedida/);

 fields.scanMaxScore.value='20';editor.score();
 assert.match(fields.scanScore.innerHTML,/Última leitura bem-sucedida/);
 assert.match(fields.scanScore.innerHTML,/Nota da última leitura 6,67 \/ 20,00/);
 assert.doesNotMatch(fields.scanScore.innerHTML,/Nota final/);
 assert.equal(fields.scanScore.dataset.stale,'true');

 h.setKey([['q1','A'],['q2','B'],['q3','A']]);editor.score();
 assert.match(fields.scanScore.innerHTML,/Última leitura bem-sucedida/);
 assert.match(fields.scanScore.innerHTML,/Nota da última leitura 13,33 \/ 20,00/);
 assert.doesNotMatch(fields.scanScore.innerHTML,/Nota final/);

 h.row(2).value='A';h.row(2).onchange();
 assert.match(fields.scanScore.innerHTML,/Nota da última leitura 20,00 \/ 20,00/);
 assert.match(fields.scanScore.innerHTML,/Última leitura bem-sucedida/);
 assert.equal(fields.scanScore.dataset.stale,'true');

 h.setValid(false);editor.score();
 assert.match(fields.scanScore.innerHTML,/Última leitura bem-sucedida/);
 assert.match(fields.scanScore.innerHTML,/Gabarito necessário/);
 assert.doesNotMatch(fields.scanScore.innerHTML,/Nota final/);
 h.setValid(true);editor.score();
 assert.match(fields.scanScore.innerHTML,/Nota da última leitura 20,00 \/ 20,00/);
 assert.equal(fields.scanScore.dataset.stale,'true');

 editor.render(h.page(['B','B','C']));
 assert.equal(fields.scanScore.dataset.stale,'false','only a processed new card clears stale');
 assert.equal(fields.cameraGrade.textContent,'Nota 6,67');
 assert.doesNotMatch(fields.scanScore.innerHTML,/Última leitura bem-sucedida/);
 assert.match(fields.scanScore.innerHTML,/Nota final 6,67 \/ 20,00/);
});

test('P1-01: a failed camera normalization cannot relabel a previous grade as current',()=>{
 const h=fixture(),{fields,editor}=h;
 editor.render(h.page());
 assert.match(fields.scanScore.innerHTML,/Nota final/);
 assert.equal(editor.normalize(new Uint8Array(9),3,3,{automatic:true,source:'camera'}),null);
 fields.scanMaxScore.value='12';editor.score();
 assert.equal(fields.scanScore.dataset.stale,'true');
 assert.equal(fields.cameraGrade.hidden,true);
 assert.match(fields.scanScore.innerHTML,/Última leitura bem-sucedida/);
 assert.match(fields.scanScore.innerHTML,/Nota da última leitura/);
 assert.doesNotMatch(fields.scanScore.innerHTML,/Nota final/);
});
