import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=(name)=>readFileSync(new URL('../atelie-salta-v2-'+name,import.meta.url),'utf8');
const html=readFileSync(new URL('../atelie-salta.html',import.meta.url),'utf8');
const fixture=read('fixtures.mjs'),calendar=read('calendar.mjs'),matrix=read('matrix.mjs'),controls=read('controls.mjs'),compositions=read('compositions.mjs'),css=read('fidelity.css');
const sandbox={window:{},Date};vm.runInNewContext(fixture,sandbox,{timeout:1500});const F=sandbox.window.SALTA_ATELIE_02;
const expected=['B','B','A','B','B','B','B','C','C','C','C','B','B','B','B','C','B','B','B','B','A','B'];
test('22 decisões A/B/C têm ordem original e todas as composições possuem renderização própria',()=>{
 assert.equal(F.choices.length,22);
 assert.equal(new Set(F.choices.map(c=>c.id)).size,22);
 assert.deepEqual(Array.from(F.choices,c=>c.option),expected);
 assert.equal(F.students.length,30);
 for(let i=0;i<22;i++){assert.equal(F.choices[i].id,'15.'+(i+1));const kind=F.choices[i].kind;assert.match(compositions,new RegExp('\\b'+kind+':\\(\\)=>'));}
 assert.match(compositions,/f2-home-shortcuts/);
 assert.ok(compositions.indexOf('f2-home-shortcuts')<compositions.indexOf("Turmas fictícias"));
});
test('Calendário real: meses, fevereiro bissexto e alinhamento segunda–domingo',()=>{
 assert.equal(F.daysOfMonth(2024,1),29);
 assert.equal(F.daysOfMonth(2025,1),28);
 assert.equal(F.daysOfMonth(2026,10),30);
 assert.equal(F.daysOfMonth(2026,11),31);
 const november=F.monthDays(2026,10);
 assert.ok(november.length===35||november.length===42);
 assert.equal(november[0].key,'2026-10-26');
 assert.equal(november.find(x=>x.key==='2026-11-01').weekday,6);
 assert.equal(november.filter(x=>x.inMonth).length,30);
 assert.equal(F.startMonday('2026-11-27'),'2026-11-23');
 assert.equal(F.addDays('2026-11-27',3),'2026-11-30');
 assert.ok(F.lessons('2026-11-27').length>0);
 assert.equal(F.lessons('2026-11-28').length,0);
 for(const id of ['cal-prev','cal-next','cal-today','picker-confirm','picker-cancel','picker-clear','picker-today','picker-next','picker-prev'])assert.ok(calendar.includes(id),id);
 assert.match(calendar,/f2-week-agenda/);
 assert.match(calendar,/f2-day-timeline/);
});
test('Matrizes mostram 30 estudantes, duas aulas e estados editáveis sem regra acadêmica',()=>{
 for(const word of ['f2-sheet-group','f2-sheet-subgroup','f2-student-header','f2-sticky','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','matrix-cancel','matrix-apply','matrix-confirm','matrix-lesson-0','matrix-lesson-1','FJ','FA','Isento','◷','—','maxes','f2-active-cell'])assert.ok(matrix.includes(word),'missing '+word);
 assert.match(matrix,/maxes\[j\]/);
 assert.match(matrix,/parsed>maxes\[j\]/);
 assert.match(matrix,/grades\[i\]\.partial/);
 assert.match(matrix,/attendance\.confirmed\[attendance\.lesson\]=true/);
 assert.match(matrix,/checks\.states\[i\]\[j\]=/);
 assert.match(matrix,/return \{state,render,openCell,dispose:/);
});
test('Componentes com comportamento: checkbox indeterminado, rádio, switch, upload sem bytes, picker e modais',()=>{
 for(const term of ['f2-checkbox-indeterminate','indeterminate=true','f2-checkbox-disabled','f2-radio-demo','f2-switch-disabled','v2-switch-label','aria-checked','f2-upload-zone','dragover','drop','upload-remove','upload-change','upload-cancel','upload-error','mountPicker','picker-from','picker-until','v2-modal-overlay','Escape','aria-modal','f2-tooltip','f2-menu','f2-segment'])assert.ok(controls.includes(term),'missing '+term);
 assert.doesNotMatch(controls,/FileReader|arrayBuffer\(|readAs|fetch\s*\(|localStorage|sessionStorage|XMLHttpRequest/);
});
test('Quatro variantes SVG locais e favicon oficial não substituído',()=>{
 for(const letter of ['a','b','c','d']){
  const icon=read('favicon-'+letter+'.svg');
  assert.match(icon,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(icon,/<text/);
  assert.match(icon,/>S<\/text>/);
  assert.doesNotMatch(icon,/<script|onload=|foreignObject/);
  assert.match(controls,new RegExp("atelie-salta-v2-favicon-"+letter+"\\.svg"));
 }
 assert.match(controls,/\.\.\/favicon\.svg/);
 assert.match(controls,/16,32,48,64/);
 assert.match(controls,/Ainda não aprovada nem publicada/);
});
test('Escopo apenas Ateliê: seis abas, assets locais, ícones aprovados intactos',()=>{
 assert.equal((html.match(/<button[^>]*role="tab"/g)||[]).length,6);
 assert.equal((html.match(/<section[^>]*role="tabpanel"/g)||[]).length,6);
 for(const name of ['fixtures','calendar','matrix','controls','compositions'])assert.match(html,new RegExp('atelie-salta-v2-'+name+'\\.mjs'));
 assert.match(html,/atelie-salta-v2-fidelity\.css/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/f2-sheet-subgroup th/);
 assert.match(css,/height:27px/);
 assert.match(css,/f2-active-row/);
 assert.match(css,/f2-active-col/);
 assert.match(css,/f2-entry-shell/);
 assert.match(css,/f2-favicon-grid/);
 assert.match(css,/grid-template-columns:240px/);
 assert.match(css,/grid-template-columns:64px/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(compositions,/DEMONSTRAÇÃO FICTÍCIA/);
 assert.match(compositions,/Nenhum vínculo institucional ou integração é realizado/);
 assert.match(compositions,/não abre câmera, Magic Scan/);
});
test('Ações das 22 composições: não usar botões genéricos como substitutos de comportamento',()=>{
 const actions=['login-submit','plan-review','plan-use-','notice-new','notice-','connect-compare','connect-resolve','secondary-picker','record-add','open-favicons','open-symbols','f2-doc','f2-gen','f2-context','f2-school','f2-class','f2-project','f2-connect','f2-tab-type','f2-notice-filter'];
 for(const action of actions)assert.ok(compositions.includes(action),'missing '+action);
 for(const prohibited of ['fetch(','localStorage','sessionStorage','getUserMedia','WebSocket','indexedDB','navigator.serviceWorker'])assert.ok(![fixture,calendar,matrix,controls,compositions].some(x=>x.includes(prohibited)),prohibited);
});
