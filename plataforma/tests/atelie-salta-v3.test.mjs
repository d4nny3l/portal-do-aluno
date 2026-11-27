import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('../atelie-salta-v2-'+name,import.meta.url),'utf8');
const fixtures=file('fixtures.mjs'),matrix=file('matrix.mjs');
const ctx={window:{},Date};
vm.runInNewContext(fixtures,ctx,{timeout:1000});
vm.runInNewContext(file('grade-mask.mjs'),ctx,{timeout:1000});
vm.runInNewContext(matrix,ctx,{timeout:1000});
const F=ctx.window.SALTA_ATELIE_02;
const host=()=>({innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}});
const att=()=>F.mountMatrix(host(),'attendance'),checks=()=>F.mountMatrix(host(),'checks');
const grade=()=>F.mountMatrix(host(),'grades');
test('DESIGN-03: presença é P→F→P, vazio vira P; estado especial não cicla',()=>{
 const m=att();assert.equal(m.state.attendance.students[0].states[0],'P');
 m.assignCommon(0,0);assert.equal(m.state.attendance.students[0].states[0],'F');assert.equal(m.state.popup,null);
 m.assignCommon(0,0);assert.equal(m.state.attendance.students[0].states[0],'P');
 m.state.attendance.students[0].states[0]='—';m.assignCommon(0,0);assert.equal(m.state.attendance.students[0].states[0],'P');
 m.state.attendance.students[0].states[0]='FJ';m.state.attendance.students[0].reasons[0]='Motivo sintético';
 m.assignCommon(0,0);assert.equal(m.state.attendance.students[0].states[0],'FJ');assert.equal(m.state.attendance.students[0].reasons[0],'Motivo sintético');
 m.dispose();
});
test('DESIGN-03: confirmação coletiva é explícita, só a aula editada perde confirmação',()=>{
 const m=att();m.state.attendance.confirmed=[true,true];
 m.assignCommon(1,0);assert.equal(m.state.attendance.confirmed[0],false);assert.equal(m.state.attendance.confirmed[1],true);
 m.state.attendance.confirmed=[true,true];
 const changed=m.bulk('attendance',0,'F');assert.equal(changed.total,30);assert.equal(changed.changed,29);
 assert.equal(m.state.attendance.confirmed[0],false);assert.equal(m.state.attendance.confirmed[1],true);
 assert.equal(m.state.attendance.students[1].states[1],'P');
 m.state.attendance.confirmed[1]=true;
 const same=m.bulk('attendance',1,'P');assert.equal(same.changed,0);assert.equal(m.state.attendance.confirmed[1],true);
 m.dispose();
});
test('DESIGN-03: exceções em lote são protegidas, com justificativas e totais consistentes',()=>{
 const m=att();const a=m.state.attendance;
 a.students[0].states[0]='FJ';a.students[0].reasons[0]='Consulta fictícia';
 a.students[1].states[0]='FA';a.students[1].reasons[0]='Justificativa fictícia';
 const f=m.bulk('attendance',0,'F');
 assert.deepEqual(JSON.parse(JSON.stringify(f)),{changed:28,preserved:2,unchanged:0,total:30});
 assert.equal(a.students[0].states[0],'FJ');assert.equal(a.students[0].reasons[0],'Consulta fictícia');
 assert.equal(a.students[1].states[0],'FA');assert.equal(a.students[1].reasons[0],'Justificativa fictícia');
 m.assignCommon(2,0);assert.equal(a.students[2].states[0],'P');
 const preserved=a.students[2].states[0];m.bulk('attendance',1,'F');assert.equal(a.students[2].states[0],preserved);
 m.dispose();
});
test('DESIGN-03: visto —→✓→×→✓ no mesmo local e estados especiais preservados',()=>{
 const m=checks();const v=m.state.checks.states;
 assert.equal(v[0][3],'—');
 for(const next of ['✓','×','✓']){m.assignCommon(0,3);assert.equal(v[0][3],next);assert.equal(m.state.popup,null);}
 const untouched=v[1][3];assert.equal(v[1][3],untouched);
 for(const special of ['◷','FJ','FA','Isento']){v[0][4]=special;m.assignCommon(0,4);assert.equal(v[0][4],special);}
 m.dispose();
});
test('DESIGN-03: lote de vistos exige coluna explícita, preserva exceções e outras atividades',()=>{
 const m=checks(),v=m.state.checks.states,copy=v.map(row=>[...row]);
 assert.equal(m.state.selectedActivity,null);assert.equal(m.bulk('checks',0,'✓'),null);
 m.selectActivity(3);assert.equal(m.state.selectedActivity,3);assert.deepEqual(JSON.parse(JSON.stringify(v)),JSON.parse(JSON.stringify(copy)));
 const done=m.bulk('checks',3,'✓');assert.equal(done.total,30);assert.ok(done.preserved>0);
 for(let i=0;i<30;i++){for(let j=0;j<8;j++){if(j!==3)assert.equal(v[i][j],copy[i][j]);}}
 m.assignCommon(0,3);const individual=v[0][3];m.selectActivity(5);m.bulk('checks',5,'×');assert.equal(v[0][3],individual);
 assert.ok(m.state.feedback.includes('30 estudantes'));
 m.dispose();
});
test('DESIGN-03: pesquisa não afeta escopo total e modelos separados não se contaminam',()=>{
 const a=att(),b=att(),c=checks();
 a.state.query='Estudante 07';const result=a.bulk('attendance',0,'F');
 assert.equal(result.total,30);assert.equal(result.changed,30);
 assert.equal(b.state.attendance.students[0].states[0],'P');
 c.state.query='Estudante 07';c.selectActivity(3);const r=c.bulk('checks',3,'×');
 assert.equal(r.total,30);
 a.dispose();b.dispose();c.dispose();
});
test('DESIGN-03: notas seguem editor anterior; 22 composições e 68 símbolos preservados',()=>{
 const g=grade();assert.equal(g.state.kind,'grades');assert.equal(g.state.grades.length,30);g.dispose();
 assert.equal(F.choices.length,22);assert.equal(F.students.length,30);
 assert.match(matrix,/data-f2-cell/);
 assert.match(matrix,/data-f2-activity-select/);
 assert.match(matrix,/matrix-att-all-p/);
 assert.match(matrix,/matrix-check-all-done/);
 assert.match(matrix,/data-f2-counts/);
 assert.match(matrix,/data-f2-check-counts/);
 assert.match(matrix,/Estado especial \/ limpar célula selecionada/);
 assert.doesNotMatch(matrix,/fetch\s*\(|localStorage|sessionStorage/);
 const html=readFileSync(new URL('../atelie-salta.html',import.meta.url),'utf8');
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\.\/atelie-salta-v2-favicon-c\.svg"/);
 const svg=file('favicon-c.svg');
 assert.match(svg,/#17324D/);assert.match(svg,/#166AA6/);
 const icons=file('icons.svg');assert.equal((icons.match(/<symbol id="v2-/g)||[]).length,68);
});
