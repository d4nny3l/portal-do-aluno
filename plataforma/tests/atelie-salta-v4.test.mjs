import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../atelie-salta-v2-'+name,import.meta.url),'utf8');
const ctx={window:{},Date};for(const name of ['fixtures.mjs','grade-mask.mjs','matrix.mjs'])vm.runInNewContext(read(name),ctx,{timeout:1500});
const F=ctx.window.SALTA_ATELIE_02,M=F.gradeMask;
const stub=()=>({innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}});
const success=(op,input,p,max,expected)=>{const got=M[op](input,p,max);assert.equal(got.ok,true,input);assert.equal(got.text,expected,input)};
const failure=(op,input,p,max)=>{const got=M[op](input,p,max);assert.equal(got.ok,false,input)};
test('DESIGN-04: uma casa decimal: 10→1,0; 25→2,5; 100→10,0 e limites',()=>{
 for(const [digits,value] of [['1','0,1'],['10','1,0'],['25','2,5'],['100','10,0'],['0','0,0'],['','']])success('manual',digits,1,10,value);
 for(const digits of ['101','1000','1001','10000'])failure('manual',digits,1,10);
});
test('DESIGN-04: duas casas decimais: 10→0,10; 245→2,45; 1000→10,00',()=>{
 for(const [digits,value] of [['1','0,01'],['10','0,10'],['245','2,45'],['1000','10,00'],['0','0,00'],['','']])success('manual',digits,2,10,value);
 for(const digits of ['1001','10000','999999'])failure('manual',digits,2,10);
});
test('DESIGN-04: zero casas decimais e máximo específico de cada avaliação',()=>{
 success('manual','10',0,10,'10');failure('manual','11',0,10);
 success('manual','20',1,2,'2,0');failure('manual','21',1,2);
 success('manual','80',1,8,'8,0');failure('manual','81',1,8);
 success('manual','800',2,8,'8,00');failure('manual','801',2,8);
});
test('DESIGN-04: colagem decimal explícita mantém semântica, inteiro colado NÃO sofre máscara',()=>{
 success('external','2,45',2,10,'2,45');
 success('external','2.45',2,10,'2,45');
 success('external','10',2,10,'10,00');
 success('external','2,4',2,10,'2,40');
 success('external','0',1,10,'0,0');
 success('external','',1,10,'');
 for(const raw of ['12','12,2222','2,345','10,01','-1','1e2','1,2,3','1..2','1,','abc','1\t2','1\n2',' 2,45'])failure('external',raw,2,10);
 failure('external','2,45',1,10);failure('external','10,1',1,10);failure('external','2',0,1);
});
test('DESIGN-04: rejeição integral sem truncamento/arredondamento/clamp; inteiro exato',()=>{
 const past=M.manual('1000',2,10);const rejected=M.manual('1001',2,10);
 assert.equal(past.text,'10,00');assert.equal(rejected.ok,false);
 assert.equal(M.external('2,345',2,10).ok,false);
 assert.equal(M.external('10,01',2,10).ok,false);
 assert.equal(M.external('9,999',2,10).ok,false);
 assert.equal(M.config(2,10).limit,1000n);
 assert.equal(M.config(1,8).limit,80n);
});
test('DESIGN-04: precisão 0/1/2 válida, configuração inconsistente é bloqueada',()=>{
 for(const p of [0,1,2])assert.equal(M.validPrecision(p),true);
 for(const p of [-1,3,1.5,NaN,'2'])assert.equal(M.validPrecision(p),false);
 for(const max of [-1,11,2.5,NaN])failure('manual','10',2,max);
});
test('DESIGN-04: 0 lançado distinto de vazio, preexistente preservado e resultado não editável',()=>{
 const g=F.mountMatrix(stub(),'grades');
 const before=g.state.grades.map(x=>({id:x.id,original:[...x.original],recovery:x.recovery,partial:x.partial}));
 assert.equal(g.state.grades[0].original[0],'0');
 assert.equal(g.state.grades[1].original[1],'');
 assert.equal(g.state.precision,1);
 g.state.precision=2;
 assert.deepEqual(g.state.grades.map(x=>({id:x.id,original:[...x.original],recovery:x.recovery,partial:x.partial})),before);
 assert.equal(read('matrix.mjs').includes('j>=3'),true);
 assert.ok(read('matrix.mjs').includes('Não calculado'));
 assert.doesNotMatch(read('matrix.mjs'),/f2-grade-value|f2-grade-max|parsed>maxes\[j\]/);
 g.dispose();
});
test('DESIGN-04: proteção da chamada, vistos, favicon C, 22 composições e 68 ícones',()=>{
 const att=F.mountMatrix(stub(),'attendance'),checks=F.mountMatrix(stub(),'checks');
 att.assignCommon(0,0);assert.equal(att.state.attendance.students[0].states[0],'F');
 assert.equal(att.bulk('attendance',0,'P').total,30);
 checks.selectActivity(3);assert.equal(checks.bulk('checks',3,'✓').total,30);
 assert.equal(F.choices.length,22);assert.equal(F.students.length,30);
 assert.equal((read('icons.svg').match(/<symbol id="v2-/g)||[]).length,68);
 const html=readFileSync(new URL('../atelie-salta.html',import.meta.url),'utf8');
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\.\/atelie-salta-v2-favicon-c\.svg"/);
 assert.ok(html.indexOf('atelie-salta-v2-grade-mask.mjs')<html.indexOf('atelie-salta-v2-matrix.mjs'));
 att.dispose();checks.dispose();
});
