// This test runs only in the pinned #88 temporary composition, never on production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAssessmentLibrary} from '../../plataforma/avaliacoes-biblioteca.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest,DEFAULT_CARD_HEADER} from '../../corretor/v2/omr/render.mjs';
import {harness} from './helpers.mjs';
class SurfaceNode{
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.attrs={};this.dataset={};this.style={}}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=[...items];this.value=''}setAttribute(k,v){this.attrs[k]=v}addEventListener(e,h){this.handlers[e]=h}get options(){return this.children.filter(x=>x.tag==='option')}
}
const settle=async condition=>{for(let i=0;i<200;i++){if(condition())return;await new Promise(r=>setTimeout(r,5))}assert.ok(condition(),'UI did not settle')};
for(const places of [0,1,2])test(`#88 real UI + candidate Auth/D1: authenticated capability, save, reopen, selection and copy format ${places}`,async()=>{
 const h=await harness({lifecycle:true});try{
  for(const [actor,status]of [[null,401],['unknown',403]]){const r=await h.request('/session',{actor});assert.equal(r.status,status);assert.equal((await r.json()).scoreFormatVersion,undefined)}
  const sections=[{sectionId:'block-1',label:'Bloco sintético',order:0,count:2,type:'A-E',items:[1,2].map(n=>({questionId:'question-'+n,originalOrder:n,number:n,type:'A-E'}))}];
  const header={...DEFAULT_CARD_HEADER,title:'Avaliação sintética',institution:'Escola sintética',subject:'Matemática',className:'Turma sintética',teacher:'Docente sintético',date:'2026-11-21',visible:{...DEFAULT_CARD_HEADER.visible},customFields:[],logoWidthMm:22,secondaryLogoWidthMm:22,logoAspect:1,secondaryLogoAspect:1};
  const template=createTemplate(sections,{layoutVersion:'v2',revision:8,title:header.title,schoolName:header.institution,identityMode:'seven-digit-code',mode:'full-page',metadata:{...header,visibleFields:header.visible}}),manifest=createCardManifest(template,header,{sectionFrameStyle:'content'});
  let editor={version:1,sections,header,layoutRevision:8,nextQuestionNumber:3,nextSectionOrder:1,fields:{assessmentTitle:header.title,assessmentKind:'Prova objetiva',assessmentSubject:header.subject,assessmentClass:header.className,assessmentDate:header.date,identityMode:'seven-digit-code',columnCount:'auto',cardMode:'full-page',embeddedWidth:'100',embeddedHeight:'180',type:'A-E',count:'2',sectionLabel:''},showInstructions:false},selected=null;
  const host=new SurfaceNode('section'),panel=new SurfaceNode('section'),formatField=new SurfaceNode('label'),format=new SurfaceNode('select');
  const doc={getElementById:id=>({savedAssessments:host,criar:panel,scoreFormatField:formatField,scoreFormatSelect:format}[id]||null),createElement:t=>new SurfaceNode(t)};
  const fetchFn=(url,init={})=>{const u=new URL(url);return h.request(u.pathname.slice('/assessments/v1'.length)+u.search,{method:init.method||'GET',...(init.body?{data:JSON.parse(init.body)}:{})})};
  const ui=mountAssessmentLibrary({document:doc,window:{confirm:()=>true},host,fetchFn,getSections:()=>sections,getMetadata:()=>({title:header.title,subject:header.subject,kind:'Prova objetiva',className:header.className,date:header.date}),getModel:()=>manifest,prepareModel:()=>true,snapshotEditor:()=>editor,restoreEditor:e=>{editor=e},applyExactModel:()=>{},nominalFields:()=>({}),newEditor:()=>{},activateSelection:s=>{selected=s},clearSelection:()=>{selected=null}});
  await settle(()=>ui.controller.view().scope&&formatField.hidden===false);
  assert.equal(ui.controller.view().session.scoreFormatVersion,'salta-score-format-v1');assert.equal(format.disabled,false);
  format.value=String(places);format.onchange({stopPropagation(){}});
  const top=host.children[0],scoring=host.children[1],actions=top.children[2],button=label=>actions.children.find(x=>x.textContent===label);
  scoring.children[2].children[0].value='1 A\n2 B';await scoring.children[3].handlers.click();
  await button('Salvar avaliação').handlers.click();const saved=ui.controller.view().record;
  assert.ok(saved?.id);assert.equal(saved.definition.display.scoreDecimals,places);assert.equal(saved.totalUnits,'100000');
  const persisted=(await(await h.request('/assessments/'+saved.id)).json()).record;assert.deepEqual(persisted.definition,saved.definition);
  assert.equal(button('Usar na correção'),undefined);assert.equal(selected?.assessmentId,saved.id);assert.equal(selected.plan.scoreDecimals,places);assert.equal(selected.manifestHash,manifest.contentHash);
  await button('Abrir avaliação').handlers.click();assert.equal(selected?.assessmentId,saved.id);assert.equal(selected.revision,saved.revision);
  await button('Duplicar avaliação').handlers.click();const copy=ui.controller.view().record;assert.notEqual(copy.id,saved.id);assert.equal(copy.definition.display.scoreDecimals,places);assert.equal(selected,null,'draft copy does not carry the original key');
  assert.equal((await(await h.request('/assessments/'+saved.id+'/revisions/1')).json()).record.definition.display.scoreDecimals,places);
 }finally{h.close()}
});
