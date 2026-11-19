import test from 'node:test';
import assert from 'node:assert/strict';
import {installPrivateAssessmentUI} from '../../corretor/v2/assessments/private-ui.mjs';
const scope={institutionId:'school-a',classId:'class-a',periodId:'2026'};
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
class Element{
 constructor(tag='div'){this.tag=tag;this.attrs={};this.children=[];this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};}
 setAttribute(k,v){this.attrs[k]=v}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children;this.value=''}
 get options(){return this.children.filter(x=>x.tag==='option')}
}
function fixture(n){
 const host=new Element('section'),rows=Array.from({length:n},(_,i)=>({
  id:uid(i+1),title:'Avaliação '+(i+1),revision:1,state:'active',...scope}));
 const log=[];let failure=null,auth=true;
 const client={
  enabled:true,classifyError:e=>e.status===401?'session':e.status===429?'rate-limited':e.code==='network'?'failed':'unavailable',
  session:async()=>({authenticated:true,principalId:'teacher-a',epoch:1}),
  grants:async()=>[scope],
  async list(after,selectedScope){
   log.push({after,scope:selectedScope});
   if(failure){const next=failure;failure=null;if(next==='network')throw Object.assign(Error('Conexão interrompida'),{code:'network'});throw Object.assign(Error(next===429?'Limite de solicitações; tente novamente.':'Sessão SALTA expirada.'),{status:next})}
   const start=after?rows.findIndex(row=>row.id===after)+1:0;
   const page=rows.slice(start,start+10);
   return {assessments:page,nextCursor:rows.length>start+10?page.at(-1).id:null};
  },
  async open(id){const row=rows.find(x=>x.id===id);return {id,revision:1,status:'issued',archived:false,manifestHash:'hash-'+id,
    definition:{title:row.title},...scope}}
 };
 const ui=installPrivateAssessmentUI({document:{getElementById:id=>id==='privateAssessmentsHost'?host:null,createElement:tag=>new Element(tag)},
  client,getDraft:()=>({plan:{},manifest:{}})});
 return {ui,host,log,rows,fail:v=>{failure=v}};
}
async function connect(f){
 await f.ui.controls.connect.onclick();
 f.ui.controls.scope.value='0';
 await f.ui.controls.chooseScope.onclick();
}
test('UI catalog 0/1/10/11/20/31: max ten options, next and previous restore every page',async()=>{
 for(const n of [0,1,10,11,20,31]){
  const f=fixture(n);await connect(f);
  const {ui}=f,seen=new Set();let pages=0;
  do{
   const view=ui.controller.view();
   const candidates=ui.controls.catalog.options.slice(1);
   assert.equal(candidates.length,Math.min(10,Math.max(0,n-pages*10)));
   assert.ok(candidates.length<=10);
   for(const item of candidates){assert.ok(!seen.has(item.value),'duplicate candidate');seen.add(item.value)}
   assert.match(ui.controls.pageLabel.textContent,new RegExp('Página '+(pages+1)));
   assert.equal(ui.controls.previous.disabled,pages===0);
   pages++;
   if(!view.nextCursor)break;
   assert.equal(ui.controls.more.disabled,false);
   await ui.controls.more.onclick();
  }while(pages<10);
  assert.equal(seen.size,n);
  assert.equal(pages,Math.max(1,Math.ceil(n/10)));
  assert.equal(ui.controls.more.disabled,true);
  while(ui.controller.view().pageIndex>0)await ui.controls.previous.onclick();
  assert.equal(ui.controller.view().pageIndex,0);
  assert.equal(ui.controls.catalog.options.length,Math.min(n,10)+1);
  assert.equal(f.log.filter(x=>x.after===null).length,2===pages?2:1+(pages>1?1:0));
 }
});
test('navigation shows active revision separately without adding an eleventh catalog option',async()=>{
 const f=fixture(11);await connect(f);
 const ui=f.ui,id=f.rows[0].id;
 ui.controls.catalog.value=id;ui.controls.catalog.onchange();
 await ui.controls.chooseAssessment.onclick();
 assert.equal(ui.controller.view().record.id,id);
 assert.match(ui.controls.activeLabel.textContent,/Registro aberto/);
 await ui.controls.more.onclick();
 assert.equal(ui.controller.view().pageIndex,1);
 assert.equal(ui.controls.catalog.options.length,2,'only one result and placeholder');
 assert.equal(ui.controls.catalog.value,'');
 assert.match(ui.controls.activeLabel.textContent,new RegExp(id));
 assert.equal(ui.controls.saveDraft.disabled,false,'explicit active record remains visible apart from page');
});
test('429/network leave page stable for manual retry; 401 invalidates credentials and allows reconnect',async()=>{
 const f=fixture(11);await connect(f);const ui=f.ui;
 f.fail(429);await ui.controls.more.onclick();
 assert.equal(ui.controller.view().pageIndex,0);
 assert.equal(ui.controller.view().phase,'rate-limited');
 assert.equal(ui.controls.more.disabled,false);
 f.fail('network');await ui.controls.more.onclick();
 assert.equal(ui.controller.view().pageIndex,0);
 assert.equal(ui.controller.view().phase,'failed');
 assert.equal(ui.controls.more.disabled,false);
 await ui.controls.more.onclick();
 assert.equal(ui.controller.view().pageIndex,1);
 f.fail(401);await ui.controls.fetchLibrary.onclick();
 assert.equal(ui.controller.view().phase,'session');
 assert.equal(ui.controller.view().session,null);
 assert.equal(ui.controller.view().scope,null);
 assert.equal(ui.controls.more.disabled,true);
 assert.equal(ui.controls.fetchLibrary.disabled,true);
 await ui.controls.connect.onclick();ui.controls.scope.value='0';await ui.controls.chooseScope.onclick();
 assert.equal(ui.controller.view().pageIndex,0);
 assert.equal(ui.controller.view().rows.length,10);
});
