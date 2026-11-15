import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortStudentRoster,selectStudentPages} from '../../corretor/v2/omr/export.mjs';
import {createTemplate,layoutTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const handler=id=>script.split('\n').find(line=>line.startsWith(`$('${id}').onclick=`)).slice(`$('${id}').onclick=`.length).replace(/;$/,'');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.hidden=false;}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(k,v){this.attrs[k]=v}
 focus(){this.focused=true}
}
const descendants=node=>[node,...node.children.flatMap(descendants)];

test('visual flow: two independent native disclosures, all header controls inline and old controls absent',()=>{
 for(const [id,title] of [['identitySettings','Identificação e apresentação'],['headerSettings','Personalizar cabeçalho']]){
  const opening=html.match(new RegExp(`<details id="${id}"[^>]*>`))[0];assert.match(opening,/omr-group omr-advanced/);assert.doesNotMatch(opening,/\bopen\b/);
  assert.ok(html.includes(`${opening}<summary>${title}</summary>`));
 }
 assert.ok(html.indexOf('id="headerSettings"')>html.indexOf('id="identitySettings"'));
 for(const id of ['headerPreview','headerLogo','headerLogo2','logoWidth','logoWidth2'])assert.ok(html.includes(`id="${id}"`));
 for(const id of ['headerDialog','openHeader','closeHeader','layoutVersion','scanLayoutVersion','headerLayout','cduPosition','layoutHistory','saveLayoutVersion','downloadLayoutVersion','recompose','addCustomField','customFields','header-tab-title','header-tab-fields'])assert.ok(!html.includes(`id="${id}"`),id);
 assert.doesNotMatch(html,/<dialog|showModal\(|\.close\(\)|QR nominal — indisponível|Histórico provisório/);
 assert.match(html,/<p class="status" id="cameraGuideStatus"[^>]*><\/p>/);
 assert.ok(html.indexOf('id="buildStatus"')<html.indexOf('id="criar"'));
});

test('visual flow: literal DOM references exist, V2 generation fixed, history writes removed and JSON import retained',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const [,id]of script.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(id),`Missing #${id}`);
 assert.match(script,/layoutVersion:'v2'/);assert.doesNotMatch(script,/saveLayoutVersion|listLayoutVersions|getLayoutVersion|localStorage|removeItem|clear\(/);
 assert.match(script,/importCardManifest\(await file\.text\(\)\)/);assert.match(script,/template=imported\.template;activeManifest=imported\.manifest/);
 assert.match(script,/buildManifestJson\(template,\{header:headerState,manifest:activeManifest\}\)/);
});

test('ordering: section/question moves and restore preserve numbers and independent options',()=>{
 const sections=[{order:0,label:'Alpha',items:[{number:1,type:'A-E'},{number:2,type:'A-E'}]},{order:1,label:'Beta',items:[{number:3,type:'A-D'}]}];
 const host=new Element('div');let builds=0;
 const draw=script.slice(script.indexOf('function drawSections()'),script.indexOf("$('add').onclick="));
 const $=id=>{assert.equal(id,'sectionManager');return host};
 const init=new Function('sections','$','document','build','syncConditionalFields','layoutRevision',`${draw};return drawSections`);
 const drawSections=init(sections,$,{createElement:tag=>new Element(tag)},()=>{builds++},()=>{},8);drawSections();
 const click=label=>{const button=descendants(host).find(n=>n.attrs['aria-label']===label);assert.ok(button,label);button.onclick()};
 click('Mover seção 1 para baixo');assert.deepEqual(sections.map(s=>s.label),['Beta','Alpha']);
 click('Mover seção 2 para cima');assert.deepEqual(sections.map(s=>s.label),['Alpha','Beta']);
 click('Mover questão 1 para baixo');assert.deepEqual(sections[0].items.map(q=>q.number),[2,1]);
 click('Mover questão 1 para cima');assert.deepEqual(sections[0].items.map(q=>q.number),[1,2]);
 click('Mover questão 2 para cima');assert.deepEqual(sections[0].items.map(q=>q.number),[2,1]);
 const restore=handler('restoreArrangement').split(";$('generate')")[0];
 const run=new Function('sections','$','drawSections','build','layoutRevision',`return ${restore}`)(sections,()=>{throw Error('Restore touched unrelated control')},drawSections,()=>{builds++},8);
 run();assert.deepEqual(sections.map(s=>s.label),['Alpha','Beta']);assert.deepEqual(sections[0].items.map(q=>q.number),[1,2]);assert.equal(builds,6);
});

test('printing: batch sorting/page selection works; single card ignores unrelated batch settings',()=>{
 const fields={studentCodeBatch:{value:'Pessoa Z; A; 0000003\nPessoa A; A; 0000001\nPessoa M; A; 0000002'},batchOrder:{value:'name-asc'},batchPages:{value:'2'},buildStatus:{textContent:''}};
 const calls=[];const printBatch=new Function('$','template','activeManifest','openPrintDocument','sortStudentRoster','selectStudentPages',`return ${handler('printBatch')}`)(id=>fields[id],{identity:{mode:'seven-digit-code'}},{},rows=>calls.push(rows),sortStudentRoster,selectStudentPages);
 printBatch();assert.equal(fields.buildStatus.textContent,'');assert.deepEqual(calls[0].map(s=>s.code),['0000002']);
 fields.batchPages.value='99';printBatch();assert.equal(calls.length,1);assert.match(fields.buildStatus.textContent,/seleção precisa estar/);
 const printOne=new Function('$','openPrintDocument',`return ${handler('printCard')}`)(()=>{throw Error('Single print accessed batch option')},()=>calls.push('one'));
 printOne();assert.equal(calls.at(-1),'one');
});

test('header title: both editors share a single value and rebuild the same header',()=>{
 const code=script.match(/function setAssessmentTitle\(value\)[^\n]+/)[0];
 const fields={assessmentTitle:{value:''},title:{value:''}};let builds=0;
 const actual=new Function('$','document','build','assessmentTitleValue','layoutRevision',`${code};return {set:setAssessmentTitle,get:()=>assessmentTitleValue}`)(id=>fields[id],{querySelector:()=>fields.title},()=>builds++,'',8);
 actual.set('Matemática');assert.equal(actual.get(),'Matemática');assert.equal(fields.assessmentTitle.value,'Matemática');assert.equal(fields.title.value,'Matemática');
 actual.set('Geometria');assert.equal(fields.assessmentTitle.value,'Geometria');actual.set('Geometria');assert.equal(builds,2);
 assert.doesNotMatch(html,/role="tablist"|data-header-tab|data-header-panel|Todos os campos administrativos visíveis compartilham uma faixa/);
 assert.match(script,/customFields:headerState.customFields/);
});

test('scan defaults: editing a default resets only its model/review; exact imported/generated models remain protected',()=>{
 const code=script.match(/function resetScanDefault\(\)[^\n]+/)[0];
 for(const exact of [false,true]){
  const fields={answers:new Element('div'),scanScore:{hidden:false},scanModelStatus:{textContent:''}};
  const actual=new Function('$','exactScanModel','template','activeManifest','activeObservations','activeHistoryEntry',`${code};return{run:resetScanDefault,state:()=>({template,activeManifest,activeObservations,activeHistoryEntry})}`)(id=>fields[id],exact,{old:true},{hash:'old'},[1],{old:true});
  actual.run();assert.equal(fields.scanScore.hidden,!exact);
  assert.equal(actual.state().template===null,!exact);assert.equal(actual.state().activeObservations.length,exact?1:0);
 }
});

test('header-only edits before adding blocks keep preview without an irrelevant missing-section error',()=>{
 const code=script.match(/function build\(\)[^\n]+/)[0];const fields={preview:new Element('div'),sectionText:{textContent:'old'},buildStatus:{textContent:'old'}};
 let previewUpdates=0,enabled;
 const actual=new Function('$','sections','updateHeaderPreview','setExportAvailability','syncScanInputs','renderPreviews','template','activeManifest','activeSvg','exactScanModel',`${code};return build`)(id=>fields[id],[],()=>previewUpdates++,value=>enabled=value,()=>{},()=>{throw Error('Unexpected generation without blocks')},null,null,'',true);
 assert.equal(actual(),false);assert.equal(previewUpdates,1);assert.equal(enabled,false);assert.equal(fields.buildStatus.textContent,'');
});

test('camera button: denied/unavailable access gives a usable message; closing does not request access again',async()=>{
 const source=handler('camera');let stopped=0,message='',requests=0;
 const getUserMedia=async options=>{requests++;assert.equal(options.audio,false);throw Object.assign(new Error('denied'),{name:'NotAllowedError'})};
 const bind=(navigator,stream)=>new Function('navigator','cameraStream','stopCamera','setScanMessage',`return ${source}`)(navigator,stream,()=>stopped++,(value)=>message=value);
 await bind({mediaDevices:{getUserMedia}},null)();assert.match(message,/Permita o acesso à câmera/);assert.equal(requests,1);
 await bind({},null)();assert.match(message,/não oferece acesso à câmera/);
 await bind({mediaDevices:{getUserMedia}},{open:true})();assert.equal(requests,1);assert.equal(stopped,2);
});

test('photo import: downscaling draws the whole photograph instead of cropping it in both decoding paths',async()=>{
 const source=script.match(/async function loadPhoto\(file\)[^\n]+/)[0];
 for(const useBitmap of [true,false]){
  let drawn,prepared,closed=0;const status={textContent:''};
  const bitmap={width:2480,height:3508,close(){closed++}};
  const canvas={width:0,height:0,getContext(){return {canvas:this,drawImage(...args){drawn=args},getImageData(){return {data:new Uint8ClampedArray(4)}}}}};
  class Image {naturalWidth=2480;naturalHeight=3508;decode(){return Promise.resolve()}}
  const actual=new Function('createImageBitmap','document','grayFromRgba','prepareImage','setScanMessage','$','Image','URL',`${source};return loadPhoto`)(useBitmap?async()=>bitmap:undefined,{createElement:()=>canvas},()=>new Uint8Array(1),(...args)=>prepared=args,()=>{},()=>status,Image,{createObjectURL:()=>'/synthetic',revokeObjectURL:()=>{}});
  await actual({type:'image/png',size:1024});assert.equal(status.textContent,'');
  assert.deepEqual(drawn.slice(1),[0,0,1273,1800]);assert.deepEqual(prepared.slice(1),[1273,1800]);assert.equal(canvas.width,1273);assert.equal(canvas.height,1800);assert.equal(closed,useBitmap?1:0);
 }
});

test('A-03: sparse numbering is accepted without changing or renumbering the manifest',()=>{
 const template=createTemplate([{type:'A-E',items:[{number:2,type:'A-E'},{number:7,type:'A-E'}]}]);
 const manifest=createCardManifest(template);
 const source=script.match(/function scanModelNotice\(model\)[^\n]+/)[0];
 const notice=new Function(`${source};return scanModelNotice`)();
 assert.equal(notice(manifest),'');
 assert.deepEqual(layoutTemplate(template,{width:840,height:1188,manifest}).cells.map(q=>q.number),[2,7]);
 assert.deepEqual(manifest.questions.map(q=>q.number),[2,7]);
});
