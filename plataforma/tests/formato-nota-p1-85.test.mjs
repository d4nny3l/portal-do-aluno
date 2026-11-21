import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatScore,formatExact,scoreDecimals,SCORE_FORMAT_VERSION} from '../../corretor/v2/assessments/score-format.mjs';
import {createIntegratedPlan,scoreIntegratedPlan,scoreInputUnits,draftSummary,POINT_SCALE} from '../../corretor/v2/assessments/block-scoring.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';

const section={sectionId:'section-1',label:'Objetivas',type:'A-E',count:3,items:[1,2,3].map(n=>({questionId:'question-'+n,number:n,type:'A-E'}))};
const sections=[section];
const template=createTemplate(sections,{layoutVersion:'v2',revision:8,title:'Avaliação sintética',
  schoolName:'Escola sintética',identityMode:'seven-digit-code'});
const manifest=createCardManifest(template);
const answers=Object.fromEntries(section.items.map(q=>[q.questionId,'A']));
const metadata={title:'Avaliação sintética',subject:'Matemática',kind:'Prova objetiva'};
const planFor=scoreDecimals=>createIntegratedPlan({metadata,sections,values:{'section-1':'10'},answers,
  scoreDecimals,model:manifest,display:'both'});
const observations=section.items.map((q,i)=>({questionId:q.questionId,number:q.number,state:'read',answer:i?'B':'A'}));

test('score format v1: 0/1/2, zeros, half up, fractions and legacy exact units',()=>{
 assert.equal(SCORE_FORMAT_VERSION,'salta-score-format-v1');
 for(const p of [0,1,2])assert.equal(scoreDecimals(p),p);
 for(const [p,value] of [[0,'8'],[1,'8,0'],[2,'8,00']])
  assert.equal(formatScore(80000n,POINT_SCALE,p),value);
 for(const [p,value] of [[0,'2'],[1,'1,5'],[2,'1,50']])
  assert.equal(formatScore(15000n,POINT_SCALE,p),value);
 assert.equal(formatScore(1n,3n,2),'0,33');
 assert.equal(formatScore(2n,3n,2),'0,67');
 assert.equal(formatScore(1n,8n,2),'0,13');
 assert.equal(formatExact(12345n,POINT_SCALE,4),'1,2345');
 assert.equal(formatScore(12345n,POINT_SCALE,2),'1,23');
 assert.equal(formatExact(12345n,POINT_SCALE,4),'1,2345','presentation cannot mutate source');
 for(const p of [-1,3,'2',null,1.5])assert.throws(()=>scoreDecimals(p),/Formato/);
});
test('new/edited amount validation rejects loss of precision but permits trailing zeros',()=>{
 assert.equal(scoreInputUnits('1,2000',1),'12000');
 assert.equal(scoreInputUnits('1,0000',0),'10000');
 assert.equal(scoreInputUnits('1.23',2),'12300');
 assert.throws(()=>scoreInputUnits('1,21',1),/incompatível/);
 assert.throws(()=>scoreInputUnits('1,2345',2),/incompatível/);
 assert.throws(()=>scoreInputUnits('1,5',0),/incompatível/);
 assert.throws(()=>scoreInputUnits('-1,0',1),/positivo/);
});
test('exact rational correction uses plan-pinned display preference without changing marks',()=>{
 for(const [p,grade,max] of [[0,'3','10'],[1,'3,3','10,0'],[2,'3,33','10,00']]){
  const plan=planFor(p),before=JSON.stringify(manifest);
  const scored=scoreIntegratedPlan(plan,observations,{manifest,template,identityState:'read'});
  assert.equal(scored.total,grade);
  assert.equal(scored.maximum,max);
  assert.equal(scored.blocks[0].earned,grade);
  assert.equal(scored.blocks[0].maximum,max);
  assert.equal(scored.correct,1);
  assert.equal(JSON.stringify(manifest),before,'score format must not change OMR manifest');
 }
});
test('draft summary totals are exact before formatting; legacy defaults to two places',()=>{
 const original=[{...section,sectionId:'section-1'},{...section,sectionId:'section-2',items:section.items.map(q=>({...q,questionId:q.questionId+'b',number:q.number+3}))}];
 const values={'section-1':'6,4','section-2':'3,6'};
 const summary=draftSummary({sections:original,values,answers:{},scoreDecimals:0});
 assert.equal(summary.total,'10');
 assert.deepEqual(summary.blocks.map(x=>x.amount),['6','4']);
 assert.equal(draftSummary({sections:original,values,answers:{}}).total,'10,00');
});
test('one selector only in Criar → Questões e organização; no precision copy elsewhere',()=>{
 const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
 const start=html.indexOf('<legend>Questões e organização</legend>');
 const end=html.indexOf('id="sectionManager"',start);
 assert.ok(start>0&&end>start);
 const item=html.slice(start,end);
 assert.match(item,/id="scoreFormatField" hidden/);
 assert.match(item,/id="scoreFormatSelect" disabled/);
 assert.deepEqual([...item.matchAll(/<option value="([012])"(?: selected)?>(10(?:,0{1,2})?)<\/option>/g)].map(m=>[m[1],m[2]]),
  [['0','10'],['1','10,0'],['2','10,00']]);
 assert.equal((html.match(/id="scoreFormatSelect"/g)||[]).length,1);
 assert.doesNotMatch(html.slice(html.indexOf('id="corrigir"'),html.indexOf('<script>',html.indexOf('id="corrigir"'))),/scoreFormatSelect/);
 const library=readFileSync(new URL('../avaliacoes-biblioteca.mjs',import.meta.url),'utf8');
 assert.match(library,/scoreFormatVersion===SCORE_FORMAT_VERSION/);
 assert.match(library,/restoredUnits\.has\(id\)/);
 assert.match(library,/editedAmountIds\.has\(id\)/);
 assert.match(library,/scoreInputUnits\(value,selectedScoreDecimals\)/);
 assert.doesNotMatch(library,/localStorage|sessionStorage|indexedDB|document\.cookie/);
 assert.match(html,/formatScore\(maxUnits\*BigInt\(correct\),POINT_SCALE\*BigInt\(template\.questions\.length\)\)/);
 assert.doesNotMatch(html,/const grade=\([^\n]*\)\.toFixed/);
});

test('private reader shows per-block notes, pinned scanMaxScore and session history',()=>{
 const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
 const privateReader=html.slice(html.indexOf('calculateScore=function(){'),html.indexOf('function renderHistory(){'));
 assert.match(privateReader,/scoreIntegratedPlan\(privateSelection\.plan,activeObservations/);
 assert.match(privateReader,/const details=document\.createElement\('dl'\)/);
 assert.match(privateReader,/name\.textContent=block\.label;grade\.textContent=block\.earned\+' \/ '\+block\.maximum/);
 assert.match(privateReader,/activeHistoryEntry\.grade=result\.total/);
 assert.match(html,/\$\('scanMaxScore'\)\.type='text'/);
 assert.match(html,/\$\('scanMaxScore'\)\.type='number'/);
 assert.match(html,/formatScore\(BigInt\(selection\.plan\.totalUnits\),POINT_SCALE,selection\.plan\.scoreDecimals\)/);
});
