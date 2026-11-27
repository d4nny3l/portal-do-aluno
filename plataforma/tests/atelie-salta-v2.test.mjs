import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=(file,binary=false)=>readFileSync(new URL('../'+file,import.meta.url),binary?undefined:'utf8');
const html=read('atelie-salta.html'),css=read('atelie-salta-v2.css'),source=read('atelie-salta-v2.mjs');
const sprite=read('atelie-salta-v2-icons.svg'),inventory=read('atelie-salta-v2-inventario.md');
const lucideLicense=read('atelie-salta-v2-ICONS-LICENSE.txt'),fontLicense=read('atelie-salta-v2-font-OFL.txt');
const font=read('atelie-salta-v2-InterVariable.woff2',true);
const groupExpr=source.match(/const groups=(\[[\s\S]*?\]);\s*const total=/)?.[1];
const groups=groupExpr?vm.runInNewContext('('+groupExpr+')'):null;
const all=groups?.flatMap(g=>g[1].map(([label,slug])=>({category:g[0],label,slug})))||[];
const decisions=[...source.matchAll(/\['(15\.\d+)','([ABC])','([^']+)','([^']+)','([^']+)','([^']+)'\]/g)].map(x=>({id:x[1],choice:x[2],title:x[3],group:x[4],kind:x[5],candidate:x[6]}));

test('Ateliê V2 é extensão do laboratório existente, com seis abas originais preservadas',()=>{
 assert.equal((html.match(/<button[^>]*role="tab"/g)||[]).length,6);
 assert.equal((html.match(/<section[^>]*role="tabpanel"/g)||[]).length,6);
 for(const id of ['cores','simbolos','botoes','componentes','telas','movimentos']){
  assert.match(html,new RegExp('id="tab-'+id+'"[^>]+aria-controls="painel-'+id+'"'));
  assert.match(html,new RegExp('id="painel-'+id+'"[^>]+aria-labelledby="tab-'+id+'"'));
 }
 for(const id of ['v2-colors','v2-icon-library','v2-component-playground','v2-screen-library','v2-inventory-container','v2-motion-tokens'])assert.equal(html.split('id="'+id+'"').length,2,id);
 assert.match(html,/<link rel="icon" href="\.\.\/favicon\.svg">/);
 assert.match(html,/<link rel="stylesheet" href="\.\/atelie-salta-v2\.css">/);
 assert.match(html,/<script type="module" src="\.\/atelie-salta-v2\.mjs"><\/script>/);
 assert.doesNotMatch(html,/<iframe\b|(?:https?:)?\/\/.*(?:\.js|\.css|\.woff2)/);
});

test('Biblioteca: 68 símbolos exatos, cinco famílias e SVG Lucide sem ícone alternativo silencioso',()=>{
 assert.ok(groups,'data source');
 assert.deepEqual(Array.from(groups.map(g=>g[1].length)),[12,14,18,12,12]);
 assert.equal(all.length,68);
 assert.equal(new Set(all.map(x=>x.slug)).size,68);
 const ids=[...sprite.matchAll(/<symbol id="v2-([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,68);
 assert.equal(new Set(ids).size,68);
 assert.deepEqual([...ids].sort(),Array.from(all,x=>x.slug).sort());
 for(const symbol of all){assert.ok(symbol.label&&symbol.category);assert.match(source,new RegExp('data-v2-icon'));assert.ok(!/^\s+$/.test(symbol.label));}
 assert.match(sprite,/data-lucide-source="circle-check"/);
 assert.match(sprite,/id="v2-check-circle"/);
 assert.match(sprite,/id="v2-trash-2"/);
 assert.match(lucideLicense,/ISC License/);
 assert.match(lucideLicense,/Copyright \(c\) 2026 Lucide Icons/);
 assert.doesNotMatch(sprite,/<script|onload=|foreignObject|https?:/i);
});

test('22/22 composições A/B/C e preview específico por tipo ficam no próprio Ateliê',()=>{
 assert.equal(decisions.length,22);
 assert.equal(new Set(decisions.map(x=>x.id)).size,22);
 for(let i=1;i<=22;i++){
  const d=decisions.find(x=>x.id==='15.'+i);
  assert.ok(d,'missing composition 15.'+i);
  assert.match(source,new RegExp("case '"+d.kind+"'"));
 }
 const expected={1:'B',2:'B',3:'A',4:'B',5:'B',6:'B',7:'B',8:'C',9:'C',10:'C',11:'C',12:'B',13:'B',14:'B',15:'B',16:'C',17:'B',18:'B',19:'B',20:'B',21:'A',22:'B'};
 for(let i=1;i<=22;i++)assert.equal(decisions[i-1].choice,expected[i],'choice 15.'+i);
 assert.match(source,/Nenhuma funcionalidade implantada/);
 assert.match(source,/Não afirma disponibilidade produtiva/);
 assert.match(source,/document\.addEventListener\('click'/);
 assert.match(source,/preview\(chosen\)/);
});

test('Paleta, Inter local real OFL, fluxo responsivo e movimento reduzido',()=>{
 for(const color of ['#17324D','#166AA6','#E7AA45','#F5F8FB','#BBC7D2','#FFFFFF','#287A53','#EAF6EF','#946515','#FFF3DF','#B34444','#FBEDED','#516579','#EDF1F5'])assert.ok(css.includes(color),'missing '+color);
 assert.equal(font.subarray(0,4).toString(),'wOF2');
 assert.ok(font.length>100000);
 assert.match(fontLicense,/SIL OPEN FONT LICENSE/);
 assert.match(css,/@font-face/);
 assert.match(css,/atelie-salta-v2-InterVariable\.woff2/);
 assert.match(css,/font-display:swap/);
 for(const n of ['700','480','1000'])assert.ok(css.includes(n));
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/outline:3px solid/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/v2-sticky-col/);
 assert.match(css,/--v2-control-radius:11px/);
 assert.match(css,/--v2-radius:14px/);
 assert.match(css,/stroke-width:1\.5/);
 assert.match(css,/@media print/);
 assert.match(css, /\.v2-paper\{background:#fff/);
});

test('Estados operacionais não mentem: rascunho, offline, sincronização e confirmação sintética',()=>{
 for(const key of ['draft','saving','local','pending','server','conflict','error','offline','external'])assert.match(source,new RegExp(" "+key+":\\["));
 assert.match(source,/Nenhum recibo real foi criado/);
 assert.match(source,/Não equivale à confirmação do servidor/);
 assert.match(source,/não representa conexão real/);
 assert.match(source,/Lido não significa resolvido/);
 assert.match(source,/Nenhuma gravação foi efetuada/);
 assert.match(source,/“0”, “—”, “\*”/);
 assert.match(source,/P · Presente/);
 assert.match(source,/FJ · Justificada/);
 assert.match(source,/FA · Abono/);
 assert.match(source,/v2-modal-overlay/);
 assert.match(source,/e\.key==='Escape'/);
 assert.match(source,/e\.key!=='Tab'/);
});

test('Isolamento: nenhum cliente remoto, storage, credencial real, câmera ou OMR executável',()=>{
 for(const v of ['fetch(', 'XMLHttpRequest','localStorage','sessionStorage','getUserMedia','getTracks(','readRaster(','generatePdfBlob(','POST ','PUT ','indexedDB','new WebSocket','navigator.serviceWorker'])
  assert.ok(!source.includes(v),'unexpected operational identifier '+v);
 assert.doesNotMatch(source,/https?:\/\/[^\s'"]+/);
 assert.doesNotMatch(html,/<iframe/);
 assert.match(source,/nenhuma chamada de rede/);
 assert.match(source,/Sem bolhas, marcadores, coordenadas ou folha imprimível/);
 assert.match(source,/A geometria real permanece protegida/);
 assert.match(inventory,/468 entradas/);
 assert.match(inventory,/25 HTML/);
 assert.match(inventory,/14 CSS/);
 assert.match(inventory,/D01–D36/);
 assert.match(inventory,/NENHUM MODIFICADO/);
});
