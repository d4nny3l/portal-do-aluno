import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installPrivateAssessmentUI} from '../../corretor/v2/assessments/private-ui.mjs';
const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
class Element{
 constructor(tag='div'){this.tag=tag;this.attrs={};this.children=[];this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};}
 setAttribute(k,v){this.attrs[k]=v}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children;this.value=''}
 get options(){return this.children.filter(x=>x.tag==='option')}
}
const uiDoc=()=>{const host=new Element('section');return {host,document:{
 getElementById:id=>{assert.equal(id,'privateAssessmentsHost');return host},
 createElement:tag=>new Element(tag)
}}};
test('disabled public HTML hides private library and hardcodes no gateway, keys or fake save button',()=>{
 assert.match(html,/const ENABLE_PRIVATE_ASSESSMENTS_UI=false;/);
 assert.match(html,/const AUTHORIZED_PRIVATE_GATEWAY=null;/);
 assert.match(html,/id="privateAssessmentsHost" hidden/);
 assert.match(html,/if\(ENABLE_PRIVATE_ASSESSMENTS_UI&&AUTHORIZED_PRIVATE_GATEWAY\)/);
 assert.doesNotMatch(html,/id="privateSaveAssessment"|data-private-save/);
 assert.doesNotMatch(html,/fetch\(['"]https:\/\/salta-stats.*\/assessments\/v1/);
 const {document,host}=uiDoc();let calls=0;
 const result=installPrivateAssessmentUI({document,client:{enabled:false,session:()=>{calls++}}});
 assert.equal(result.enabled,false);assert.equal(calls,0);assert.equal(host.hidden,true);
 assert.match(host.textContent,/indisponível/);
});
test('authenticated v1 legacy laboratory takes priority and private UI cannot mount over it',()=>{
 const {document,host}=uiDoc();
 const result=installPrivateAssessmentUI({document,client:{enabled:true},bankActive:()=>true});
 assert.equal(result.enabled,false);assert.equal(host.hidden,true);
});
test('enabled synthetic UI connects grants, filters library and reports server-confirmed states',async()=>{
 const {document,host}=uiDoc(),actions=[],scope={institutionId:'school',classId:'class1',periodId:'p1'};
 const draft={plan:{schema:'synthetic'},manifest:{contentHash:'synthetic'}};
 const result=installPrivateAssessmentUI({document,client:{
  enabled:true,classifyError:e=>e.status===503?'unavailable':'failed',
  session:async()=>({authenticated:true,principalId:'principal-a',epoch:1}),grants:async()=>[scope],
  list:async()=>({assessments:[{id:'record-id',title:'<script>alert(1)</script>',revision:1,state:'active',...scope}],nextCursor:null}),
  prepareSave:p=>({method:'PUT',path:'/assessments/new',payload:{requestId:'r1',...p}}),
  async saveAndVerify(op){actions.push(op);return {receipt:{ok:true,id:'new',revision:1},record:{
   id:'new',revision:1,status:'draft',manifestHash:'hash',definition:{title:'Prova sintética'},...scope}}},
 },getDraft:()=>draft,applyRecord:()=>{},onSelection:()=>{}});
 assert.equal(result.enabled,true);assert.equal(host.hidden,false);
 const ui=result.controls;
 await ui.connect.onclick();ui.scope.value='0';await ui.chooseScope.onclick();
 assert.equal(result.controller.view().rows.length,1);
 assert.equal(ui.catalog.options[1].textContent.includes('<script>'),true,'rendered as text not HTML');
 await ui.saveDraft.onclick();
 assert.equal(actions.length,1);
 assert.equal(result.controller.view().phase,'saved');
 assert.match(host.children.at(-1).textContent,/Salvo · revisão 1 confirmada/);
 assert.equal(ui.retry.disabled,true);
});
test('UI without a confirmed receipt must not show saved and keeps the same operation for retry',async()=>{
 const {document,host}=uiDoc(),scope={institutionId:'school',classId:'class1',periodId:'p1'};
 let attempt=0;const issued=[];
 const result=installPrivateAssessmentUI({document,client:{
  enabled:true,classifyError:()=> 'unavailable',
  session:async()=>({authenticated:true,principalId:'a',epoch:1}),grants:async()=>[scope],
  list:async()=>({assessments:[],nextCursor:null}),
  prepareSave:()=>({method:'PUT',path:'/assessments/x',payload:{requestId:'unchanged-request',expectedRevision:0,...scope}}),
  async saveAndVerify(op){issued.push(op);attempt++;
   if(attempt===1)throw Object.assign(Error('Servidor indisponível'),{status:503});
   return {receipt:{ok:true,id:'x',revision:1},record:{id:'x',revision:1,status:'draft',...scope}};
  }
 },getDraft:()=>({plan:{},manifest:{}})});
 await result.controls.connect.onclick();result.controls.scope.value='0';await result.controls.chooseScope.onclick();
 await result.controls.saveDraft.onclick();
 assert.equal(result.controller.view().phase,'unavailable');
 assert.doesNotMatch(host.children.at(-1).textContent,/Salvo ·/);
 result.render();
 assert.equal(result.controls.retry.disabled,false);
 await result.controls.retry.onclick();
 assert.equal(result.controller.view().phase,'saved');
 assert.equal(issued.length,2);
 assert.strictEqual(issued[0],issued[1],'retry passes the original object with same request ID/body');
});
