import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntegratedPlan,scoreIntegratedPlan,scoreProvisionalPlan,scoreIntegratedPages,
 integratedScoreHtml,POINT_SCALE} from '../../assessments/block-scoring.mjs';
import {scorePlanPreview} from '../score-preview.mjs';
import {createTemplate} from '../../omr/template.mjs';
import {createCardManifest} from '../../omr/render.mjs';

function fixture(scoreDecimals=2){
 const sections=[{sectionId:'first',label:'Primeiro',type:'A-E',items:[2,7,13].map((number,i)=>
  ({questionId:'a'+i,number,type:'A-E'}))},
 {sectionId:'second',label:'Segundo',type:'C-E',items:[21,29,38,51].map((number,i)=>
  ({questionId:'b'+i,number,type:'C-E'}))}];
 const template=createTemplate(sections,{identityMode:'seven-digit-code'});
 const manifest=createCardManifest(template);
 const answers=Object.fromEntries(sections.flatMap(s=>s.items).map(q=>[q.questionId,q.type==='C-E'?'C':'A']));
 const plan=createIntegratedPlan({metadata:{title:'Sintética',subject:'Teste',kind:'Prova'},
  sections,values:{first:'1.2345',second:'8.7655'},answers,model:manifest,scoreDecimals});
 const observations=plan.blocks.flatMap(b=>b.questions.map(q=>({questionId:q.questionId,
  number:q.number,page:1,state:'read',answer:q.correct})));
 observations[1]={...observations[1],state:'blank',answer:null};
 observations[2]={...observations[2],state:'double',answer:null};
 observations[5]={...observations[5],state:'reviewed',reviewed:true,answer:'E'};
 observations[6]={...observations[6],answer:'E'};
 const context={manifest,template,identityState:'review',identityMode:'seven-digit-code',pageCount:1,
  captureId:'capture-1',sessionId:'session-1',page:1};
 return {plan,observations,context};
}
const clone=value=>structuredClone(value);
const noScore=score=>{
 assert.equal(score.complete,false);assert.equal(score.calculable,false);
 assert.equal(score.bindingAllowed,false);assert.equal(score.publicationAllowed,false);
 assert.equal(Object.hasOwn(score,'total'),false);
};

test('provisional arithmetic is identical to official blocks and exact weighted total at 0/1/2 decimals',()=>{
 assert.equal(POINT_SCALE,10000n);
 for(const [places,total]of [[0,'5'],[1,'4,8'],[2,'4,79']]){
  const {plan,observations,context}=fixture(places),before=JSON.stringify({plan,observations,context});
  const official=scoreIntegratedPlan(plan,observations,{...context,identityState:'read'});
  const local=scoreProvisionalPlan(plan,observations,context);
  assert.equal(local.total,total);
  for(const key of ['total','maximum','correct','blank','double','count','display','blocks'])
   assert.deepEqual(local[key],official[key]);
  assert.equal(local.complete,false);assert.equal(local.provisional,true);assert.equal(local.calculable,true);
  assert.equal(local.bindingAllowed,false);assert.equal(local.publicationAllowed,false);
  assert.equal(local.scope,'local-capture');assert.equal(local.identityState,'review');
  assert.equal(JSON.stringify({plan,observations,context}),before);
  assert.equal(scoreIntegratedPlan(plan,observations,context).complete,false,'official identity guard remains intact');
  assert.throws(()=>integratedScoreHtml(local),/não concluída/);
 }
});
test('all correct and zero retain official formatting without losing historic four-decimal weights',()=>{
 for(const places of [0,1,2]){
  const {plan,observations,context}=fixture(places);
  for(const correct of [true,false]){
   const marks=observations.map(o=>({...o,state:'reviewed',answer:correct?(o.questionId.startsWith('a')?'A':'C'):null,reviewed:true}));
   const official=scoreIntegratedPlan(plan,marks,{...context,identityState:'read'});
   assert.equal(scoreProvisionalPlan(plan,marks,context).total,official.total);
   assert.equal(official.total,correct?['10','10,0','10,00'][places]:['0','0,0','0,00'][places]);
  }
 }
});
test('actual pending identity is required; disabled, fake modes and read identities cannot become provisional',()=>{
 const {plan,observations,context}=fixture();
 for(const identityState of [undefined,'disabled','read','pending',false,null])
  noScore(scoreProvisionalPlan(plan,observations,{...context,identityState}));
 for(const identityMode of [undefined,'none','manual',false])
  noScore(scoreProvisionalPlan(plan,observations,{...context,identityMode}));
 for(const field of ['manifest','template']){
  const changed=clone(context);changed[field].identity.mode='none';
  noScore(scoreProvisionalPlan(plan,observations,changed));
 }
});
test('capture scope is explicit, immutable, and carries no student identity',()=>{
 const {plan,observations,context}=fixture();
 const local=scorePlanPreview(plan,observations,{...context,studentCode:'0000123'});
 assert.equal(local.capture.captureId,'capture-1');assert.equal(local.capture.sessionId,'session-1');
 assert.equal(local.capture.contentHash,context.manifest.contentHash);
 assert.equal(local.capture.revision,context.manifest.revision);assert.equal(local.capture.page,1);
 assert.equal(JSON.stringify(local).includes('0000123'),false);
 assert.ok(Object.isFrozen(local));assert.ok(Object.isFrozen(local.capture));assert.ok(Object.isFrozen(local.blocks));
 for(const invalid of [undefined,'',0,false,'bad\nvalue']){
  assert.throws(()=>scorePlanPreview(plan,observations,{...context,captureId:invalid}),/sessão e a captura/);
  assert.throws(()=>scorePlanPreview(plan,observations,{...context,sessionId:invalid}),/sessão e a captura/);
 }
});
test('missing, ambiguous, incompatible and duplicate observations never yield a numeric preview',()=>{
 const {plan,observations,context}=fixture();
 const variants=[observations.slice(1),[...observations.slice(1),observations[1]]];
 for(const patch of [{state:'review',answer:null},{state:'read',reviewed:false},{state:'read',answer:null},
  {state:'blank',answer:'A'},{state:'double',answer:'A'},{answer:'Z'},{number:3},{questionId:'unknown'}]){
  const marks=clone(observations);Object.assign(marks[0],patch);variants.push(marks);
 }
 for(const patch of [{page:undefined},{page:2},{recognition:'partial'}]){
  const marks=clone(observations);Object.assign(marks[0],patch);variants.push(marks);
 }
 for(const marks of variants)noScore(scorePlanPreview(plan,marks,context));
});
test('missing key and invalid weights are blocked before provisional arithmetic',()=>{
 const {plan,observations,context}=fixture();
 for(const patch of [p=>{delete p.blocks[0].questions[0].correct},p=>{p.blocks[0].valueUnits='0'},
  p=>{p.blocks[0].valueUnits='1.5'},p=>{p.blocks[0].valueUnits='-1'},p=>{p.totalUnits='1'}]){
  const modified=clone(plan);patch(modified);noScore(scoreProvisionalPlan(modified,observations,context));
 }
});
test('wrong binding/hash/revision/count are rejected, without making official identity valid',()=>{
 const {plan,observations,context}=fixture();
 for(const patch of [{contentHash:'wrong'},{templateId:'wrong'},{revision:999}])
  assert.throws(()=>scoreProvisionalPlan(plan,observations,{...context,manifest:{...context.manifest,...patch}}),/incompatível/);
 assert.throws(()=>scoreProvisionalPlan(plan,observations,{...context,template:{...context.template,questionCount:1}}),/incompatível/);
 noScore(scoreProvisionalPlan(plan,observations,{...context,template:{...context.template,templateId:'wrong'}}));
});
test('single-capture preview rejects multiple pages, missing page and forged one-page options',()=>{
 const {plan,observations,context}=fixture();
 for(const page of [undefined,0,2])noScore(scorePlanPreview(plan,observations,{...context,page}));
 for(const pageCount of [undefined,0,2])noScore(scoreProvisionalPlan(plan,observations,{...context,pageCount}));
 noScore(scoreProvisionalPlan(plan,observations,{...context,template:{...context.template,pageCount:2}}));
 noScore(scoreProvisionalPlan(plan,observations,{...context,manifest:{...context.manifest,pages:[{page:1},{page:2}]}}));
 assert.equal(scoreIntegratedPlan(plan,observations,{...context,identityState:'read',pageCount:2}).complete,false);
});

function multiFixture(){
 const {plan,observations,context}=fixture();
 const pages=[{page:1,questionIds:observations.slice(0,3).map(o=>o.questionId)},
  {page:2,questionIds:observations.slice(3).map(o=>o.questionId)}];
 const manifest={...context.manifest,pages},template={...context.template,pageCount:2};
 const readings=pages.map(({page,questionIds})=>({captureId:'capture-'+page,sessionId:'same-session',
  templateId:manifest.templateId,templateRevision:manifest.revision,contentHash:manifest.contentHash,page,pageCount:2,
  identity:{state:'read',code:'0000123'},observations:observations.filter(o=>questionIds.includes(o.questionId)).map(o=>({...o,page}))}));
 return {plan,observations,context,manifest,template,readings};
}
test('explicit complete page partition shares official arithmetic and preserves seven-digit leading zeros',()=>{
 const {plan,observations,context,manifest,template,readings}=multiFixture();
 const before=JSON.stringify({manifest,template,readings});
 const result=scoreIntegratedPages(plan,[...readings].reverse(),{manifest,template});
 const official=scoreIntegratedPlan(plan,observations,{...context,identityState:'read'});
 for(const key of ['total','maximum','blocks','count','correct','blank','double'])assert.deepEqual(result[key],official[key]);
 assert.equal(result.complete,true);assert.equal(result.identityCode,'0000123');
 assert.equal(result.bindingAllowed,true);assert.equal(result.publicationAllowed,false);
 assert.equal(JSON.stringify({manifest,template,readings}),before);
 assert.equal(scoreIntegratedPlan(plan,observations,{manifest,template,identityState:'read',pageCount:2}).complete,false);
});
test('multipage never joins pending/different students, duplicate pages, duplicate captures or stale bindings',()=>{
 const base=multiFixture();
 for(const patch of [r=>{r[1].identity.state='review'},r=>{r[1].identity.code='0000124'},
  r=>{r[1].identity.code=123},r=>{r[1].identity.code='123'},r=>{r[1].captureId=r[0].captureId},
  r=>{r[1].page=1},r=>{delete r[1].page},r=>{r[1].contentHash='wrong'},r=>{r[1].templateId='wrong'},
  r=>{r[1].templateRevision=99},r=>{r[1].pageCount=1},r=>{r[1].sessionId='other'},
  r=>{r[1].observations.pop()},r=>{r[1].observations[0].page=1},
  r=>{r[1].observations[0].questionId=r[0].observations[0].questionId},
  r=>{r[1].observations[0].state='review'},r=>{r[1].observations[0].answer=null}]){
  const readings=clone(base.readings);patch(readings);
  noScore(scoreIntegratedPages(base.plan,readings,base));
 }
 noScore(scoreIntegratedPages(base.plan,base.readings.slice(1),base));
});
test('multipage requires explicit full partition and numeric identity, never inferred manual/none models',()=>{
 const base=multiFixture();
 for(const patch of [m=>{delete m.pages[0].questionIds},m=>{m.pages[1].page=1},
  m=>{m.pages[0].questionIds.pop()},m=>{m.pages[0].questionIds.push(m.pages[1].questionIds[0])},
  m=>{m.identity.mode='manual'},m=>{m.identity.mode='none'}]){
  const manifest=clone(base.manifest);patch(manifest);
  noScore(scoreIntegratedPages(base.plan,base.readings,{...base,manifest}));
 }
 const original=fixture();
 noScore(scoreIntegratedPages(original.plan,[],original.context));
});
