import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installIntegratedDraftPlanner} from '../../corretor/v2/assessments/draft-planner.mjs';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../corretor-v2.css',import.meta.url),'utf8');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.value='';this.textContent='';
  this.dataset={};this.oninput=null;this.onchange=null;this.onclick=null;this.hidden=false;this.className='';}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes];this.value=''}
 setAttribute(name,value){this.attrs[name]=value}
 get options(){return this.children.filter(x=>x.tag==='option')}
}
function fixture({bank=false}={}){
 const ids=['integratedStatus','integratedTotal','integratedKeyCount','integratedBlockValues','integratedVisualKey',
  'integratedPasteApply','integratedPaste','integratedDisplay','integratedUse','integratedRemember','integratedOpen',
  'integratedDuplicate','integratedNew','integratedSearch','integratedLocalLibrary','integratedReadingStatus'];
 const fields=Object.fromEntries(ids.map(x=>[x,new Element(x)]));
 const document={getElementById:id=>{assert.ok(fields[id],'#'+id);return fields[id]},createElement:tag=>new Element(tag)};
 let sections=[
  {sectionId:'block-1',label:'Objetivas',items:[{questionId:'s1',number:1,type:'A-D'},{questionId:'s2',number:2,type:'A-D'}]},
  {sectionId:'block-2',label:'Certo e errado',items:[{questionId:'s3',number:3,type:'C-E'}]}
 ];
 let meta={title:'Avaliação sintética',subject:'Matemática',kind:'Prova objetiva',className:'Turma A',date:'2026-11-18'};
 const model={templateId:'omr-a4',revision:8,contentHash:'unique-layout-hash'};
 let selected=null,deactivated=0,opened=0,restored=0;
 const planner=installIntegratedDraftPlanner({
  document,getSections:()=>sections,getMetadata:()=>meta,getModel:()=>model,prepareModel:()=>true,
  snapshotEditor:()=>({sections:structuredClone(sections),metadata:{...meta}}),
  restoreEditor:s=>{sections=structuredClone(s.sections);meta={...s.metadata};restored++},
  activate:p=>{selected=p},deactivate:()=>{selected=null;deactivated++},openCorrection:()=>{opened++},
  bankActive:()=>bank
 });
 return {fields,planner,sections:()=>sections,selected:()=>selected,deactivated:()=>deactivated,opened:()=>opened,restored:()=>restored,
  setSections:newSections=>{sections=newSections;planner.refresh()},setMeta:value=>{meta={...meta,...value};planner.notifyChanged()},setModelHash:value=>{model.contentHash=value;planner.notifyChanged()}};
}
test('view uses real integrated plan controls, no fake persistence or answer key printed on card',()=>{
 for(const id of ['integratedBlockValues','integratedVisualKey','integratedPaste','integratedUse','integratedLocalLibrary','integratedRemember','integratedOpen','integratedDuplicate'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Apenas memória temporária/);
 assert.match(html,/sessionAssessmentPlan/);
 assert.match(html,/assertPlanBinding\(sessionAssessmentPlan,activeManifest,template\)/);
 assert.match(html,/function calculateIntegratedScore/);
 assert.match(html,/installIntegratedDraftPlanner/);
 assert.match(css,/integrated-visual-key/);
 assert.doesNotMatch(html,/id="integratedSave"|id="integratedPersist"/);
});
test('visual inputs and quick paste share the same key state; invalid paste stays unchanged',()=>{
 const {fields,planner}=fixture();
 const values=fields.integratedBlockValues.children;
 assert.equal(values.length,2);
 values[0].children[1].value='4';values[0].children[1].oninput();
 values[1].children[1].value='2';values[1].children[1].oninput();
 assert.match(fields.integratedTotal.textContent,/6,0000/);
 const keyRows=fields.integratedVisualKey.children;assert.equal(keyRows.length,3);
 keyRows[0].children[1].value='A';keyRows[0].children[1].onchange();
 fields.integratedPaste.value='2 C\n3 E';fields.integratedPasteApply.onclick();
 assert.match(fields.integratedKeyCount.textContent,/3 de 3/);
 assert.equal(fields.integratedVisualKey.children[0].children[1].value,'A');
 assert.equal(fields.integratedVisualKey.children[1].children[1].value,'C');
 assert.equal(fields.integratedVisualKey.children[2].children[1].value,'E');
 fields.integratedPaste.value='3 D';fields.integratedPasteApply.onclick();
 assert.match(fields.integratedStatus.textContent,/inválida/);
 assert.equal(fields.integratedVisualKey.children[2].children[1].value,'E');
});
test('single explicit selection binds model and scoring; changing key invalidates active selection',()=>{
 const h=fixture(),f=h.fields;
 f.integratedUse.onclick();
 assert.match(f.integratedStatus.textContent,/valor positivo/);
 const vals=f.integratedBlockValues.children;
 vals[0].children[1].value='4';vals[0].children[1].oninput();
 vals[1].children[1].value='2';vals[1].children[1].oninput();
 f.integratedPaste.value='A C E';f.integratedPasteApply.onclick();
 f.integratedUse.onclick();
 assert.equal(h.opened(),1);assert.equal(h.selected()?.blocks.length,2);
 assert.match(f.integratedReadingStatus.textContent,/A câmera não identifica automaticamente/);
 const visual=f.integratedVisualKey.children;
 visual[0].children[1].value='B';visual[0].children[1].onchange();
 assert.equal(h.selected(),null);
 assert.equal(h.deactivated(),1);
 assert.match(f.integratedReadingStatus.textContent,/Nenhuma avaliação integrada/);
});
test('session-only library records revisions, opens prior revisions and duplicates without server write',()=>{
 const h=fixture(),f=h.fields;
 for(const [i,v]of ['3','2'].entries()){const item=f.integratedBlockValues.children[i].children[1];item.value=v;item.oninput()}
 f.integratedPaste.value='A A C';f.integratedPasteApply.onclick();
 f.integratedRemember.onclick();
 assert.equal(h.planner.sessionRecords().length,1);
 assert.equal(h.planner.sessionRecords()[0].revision,1);
 f.integratedRemember.onclick();
 assert.equal(h.planner.sessionRecords()[1].revision,2);
 assert.equal(f.integratedLocalLibrary.options.length,3);
 f.integratedLocalLibrary.value='aba-1@1';f.integratedOpen.onclick();
 assert.equal(h.restored(),1);
 assert.match(f.integratedStatus.textContent,/aberta para edição/);
 f.integratedLocalLibrary.value='aba-1@2';f.integratedDuplicate.onclick();
 assert.equal(h.restored(),2);
 f.integratedRemember.onclick();
 assert.equal(h.planner.sessionRecords().length,3);
 assert.notEqual(h.planner.sessionRecords()[2].id,'aba-1');
 f.integratedSearch.value='nenhuma';f.integratedSearch.oninput();
 assert.equal(f.integratedLocalLibrary.options.length,1);
});
test('protected bank stays authoritative: local selection and temporary library cannot bypass authenticated revisions',()=>{
 const h=fixture({bank:true}),f=h.fields;
 for(const [i,v]of ['3','2'].entries()){const input=f.integratedBlockValues.children[i].children[1];input.value=v;input.oninput()}
 f.integratedPaste.value='A A C';f.integratedPasteApply.onclick();
 f.integratedUse.onclick();assert.equal(h.selected(),null);
 assert.match(f.integratedStatus.textContent,/Banco autenticado/);
 f.integratedRemember.onclick();assert.equal(h.planner.sessionRecords().length,0);
});

test('changing optical manifest hash invalidates a previously selected local plan',()=>{
 const h=fixture(),f=h.fields;
 for(const [i,v]of ['4','2'].entries()){
  const input=f.integratedBlockValues.children[i].children[1];input.value=v;input.oninput();
 }
 f.integratedPaste.value='A C E';f.integratedPasteApply.onclick();
 f.integratedUse.onclick();assert.ok(h.selected());
 h.setModelHash('modified-geometry-or-header-hash');
 assert.equal(h.selected(),null);
 assert.equal(h.deactivated(),1);
 assert.match(f.integratedReadingStatus.textContent,/Nenhuma avaliação integrada selecionada/);
});
test('initial empty editor presents an actionable draft rather than a false error or save',()=>{
 const h=fixture();h.setSections([]);
 assert.match(h.fields.integratedStatus.textContent,/Adicione um bloco/);
 assert.equal(h.fields.integratedStatus.dataset.state,'draft');
});
