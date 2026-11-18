import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createIntegratedPlan,scoreIntegratedPlan,assertPlanBinding,integratedScoreHtml} from '../../corretor/v2/assessments/block-scoring.mjs';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
function production(prefix){const lines=html.split('\n').filter(x=>x.startsWith(prefix));assert.equal(lines.length,1,prefix);return lines[0]}
const code=[production('function calculateIntegratedScore('),production('function calculateScore('),
 production('function renderHistory('),production('function renderAnswers('),production('function readNormalized('),
 production('function markLastReadingPending(')].join('\n');
class Element{
 constructor(tag){this.tag=tag;this.dataset={};this.hidden=false;this.children=[];this.attrs={};this.value='';this.textContent='';this.innerHTML='';this.disabled=false;this.className='';
  this.classList={remove:()=>{},add:()=>{},toggle:()=>{}}}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes]}
 setAttribute(k,v){this.attrs[k]=v}
 removeAttribute(k){delete this.attrs[k]}
}
const model={templateId:'omr-a4',revision:8,contentHash:'synthetic-hash-v2'};
const sections=[
 {sectionId:'s1',label:'Bloco 1',items:[{questionId:'q1',number:1,type:'A-D'},{questionId:'q2',number:2,type:'A-D'}]},
 {sectionId:'s2',label:'Bloco 2',items:[{questionId:'q3',number:3,type:'C-E'}]}
];
function harness(display='both'){
 const plan=createIntegratedPlan({metadata:{title:'Avaliação sintética',subject:'Matemática',kind:'Prova objetiva'},sections,
  values:{s1:'4',s2:'3'},answers:{q1:'A',q2:'A',q3:'C'},display,model});
 const template={pageCount:1,questionCount:3,identity:{mode:'seven-digit-code'},questions:[
  {questionId:'q1',number:1,type:'A-D',choices:['A','B','C','D']},
  {questionId:'q2',number:2,type:'A-D',choices:['A','B','C','D']},
  {questionId:'q3',number:3,type:'C-E',choices:['C','E']}
 ]};
 const elements=new Map(),messages=[],reads=[];
 const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
 $('scanMaxScore').value='7';
 const state={
  $,document:{createElement:tag=>new Element(tag)},template,activeManifest:{...model},sessionAssessmentPlan:plan,
  normalizedRaster:{pixels:new Uint8Array(100),width:10,height:10},headerState:{showStudentCode:true},
  currentPage:1,activeObservations:[],activeHistoryEntry:null,scanHistory:[],replaceLastCapture:false,assessmentBank:null,
  ensureScanTemplate(){},readRaster(t,p,w,h,options){reads.push({t,options});return {
   page:1,pageCount:1,identity:{state:'read',code:'0001123'},
   observations:[
    {questionId:'q1',number:1,state:'read',answer:'A',marks:['A'],recognition:'partial'},
    {questionId:'q2',number:2,state:'read',answer:'B',marks:['B'],recognition:'strong'},
    {questionId:'q3',number:3,state:'read',answer:'C',marks:['C'],recognition:'strong'}
   ]}},
  setScanMessage(message){messages.push(message)},
  scoreIntegratedPlan,assertPlanBinding,integratedScoreHtml
 };
 vm.createContext(state);vm.runInContext(code,state,{timeout:2500});
 return {state,$,reads,messages,plan};
}
test('actual render/read handlers compute 5/7 by blocks and manual override recomputes 7/7',()=>{
 const h=harness();
 const result=h.state.readNormalized({automatic:true});
 assert.equal(result.observations.length,3);
 assert.equal(h.reads.length,1);
 assert.equal(h.$('scanScore').dataset.review,'false');
 assert.match(h.$('scanScore').innerHTML,/Nota final 5,00 \/ 7,00/);
 assert.match(h.$('scanScore').innerHTML,/Bloco 1/);
 assert.match(h.$('scanScore').innerHTML,/2,00 \/ 4,00/);
 assert.match(h.$('scanScore').innerHTML,/3,00 \/ 3,00/);
 const row=h.$('answers').children[1],select=row.children[1];
 select.value='A';select.onchange();
 assert.equal(h.state.activeObservations[1].answer,'A');
 assert.match(h.$('scanScore').innerHTML,/Nota final 7,00 \/ 7,00/);
 assert.match(h.$('scanScore').innerHTML,/4,00 \/ 4,00/);
});
test('display blocks only suppresses final label but keeps block weights and classification',()=>{
 const h=harness('blocks');h.state.readNormalized();
 const htmlGrade=h.$('scanScore').innerHTML;
 assert.doesNotMatch(htmlGrade,/Nota final/);
 assert.match(htmlGrade,/Bloco 1/);
 assert.match(htmlGrade,/Bloco 2/);
 assert.match(htmlGrade,/Nota não registrada no Diário/);
});
test('mismatched linked manifest blocks reading before OMR can classify or calculate score',()=>{
 const h=harness();
 h.state.activeManifest={...model,contentHash:'different-card'};
 assert.equal(h.state.readNormalized({automatic:true}),null);
 assert.equal(h.reads.length,0);
 assert.match(h.$('status').textContent,/incompatível/);
});
test('unreadable mandatory code and incomplete optical classification never become final grade',()=>{
 const h=harness();h.state.readNormalized();
 h.$('scanScore').dataset.identity='review';h.state.calculateScore();
 assert.equal(h.$('scanScore').dataset.review,'true');
 assert.doesNotMatch(h.$('scanScore').innerHTML,/Nota final/);
 h.$('scanScore').dataset.identity='read';
 h.state.activeObservations[1].state='review';h.state.activeObservations[1].reviewed=false;
 h.state.calculateScore();assert.equal(h.$('scanScore').dataset.review,'true');
 assert.match(h.$('scanScore').innerHTML,/inconclusiva/);
});
test('failed attempt keeps prior integrated score provenance even after recalculation',()=>{
 const h=harness();h.state.readNormalized();
 h.state.markLastReadingPending();
 h.state.calculateScore();
 assert.equal(h.$('scanScore').dataset.stale,'true');
 assert.match(h.$('scanScore').innerHTML,/Última leitura bem-sucedida/);
 assert.match(h.$('scanScore').innerHTML,/Nota da última leitura 5,00/);
 assert.doesNotMatch(h.$('scanScore').innerHTML,/Nota final/);
});

test('private issued selection provenance is fixed on a successful in-memory correction and mismatched context is blocked',()=>{
 const h=harness();
 h.state.sessionAssessmentSelection=Object.freeze({
  selectionId:'123e4567-e89b-42d3-a456-426614174000',
  assessmentId:'123e4567-e89b-42d3-a456-426614174001',
  revision:7,manifestHash:model.contentHash,plan:h.plan
 });
 const result=h.state.readNormalized({automatic:true});
 assert.equal(result?.observations.length,3);
 assert.equal(h.state.scanHistory.length,1);
 const entry=h.state.scanHistory[0];
 assert.equal(entry.selectionId,h.state.sessionAssessmentSelection.selectionId);
 assert.equal(entry.assessmentId,h.state.sessionAssessmentSelection.assessmentId);
 assert.equal(entry.revision,7);
 assert.equal(entry.manifestHash,model.contentHash);
 assert.match(h.$('scanScore').innerHTML,/Nota final 5,00/);
 h.state.activeManifest={...model,contentHash:'foreign-model'};
 assert.equal(h.state.readNormalized({automatic:true}),null);
 assert.equal(h.state.scanHistory.length,1,'mismatch cannot append a correction under a stale selection');
 assert.equal(entry.revision,7,'previous correction provenance cannot be rewritten');
});
