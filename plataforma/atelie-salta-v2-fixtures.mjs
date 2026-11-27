(function initFixtures(){
  'use strict';
  // DESIGN-SALTA-02: exemplos imutáveis sem dados reais, sem persistência nem rede.
  const referenceToday='2026-11-27';
  const students=Array.from({length:30},(_,i)=>({id:i+1,name:'Estudante '+String(i+1).padStart(2,'0')}));
  const choices=[
   ['15.1','B','Entrada do portal','entry'],['15.2','B','Login institucional','login'],
   ['15.3','A','Central do professor','home'],['15.4','B','Diário integrado','diary'],
   ['15.5','B','Instituições e turmas','institutions'],['15.6','B','Ficha acadêmica','record'],
   ['15.7','B','Calendário e agenda','calendar'],['15.8','C','Chamada e histórico','attendance'],
   ['15.9','C','Notas e recuperação','grades'],['15.10','C','Vistos por atividade','checks'],
   ['15.11','C','Planejamento','planning'],['15.12','B','Central do Corretor','scanner'],
   ['15.13','B','Gerador de cartões','generator'],['15.14','B','Estatísticas','stats'],
   ['15.15','B','Portal do Aluno','student'],['15.16','C','Projetos','projects'],
   ['15.17','B','CONNECT','connect'],['15.18','B','Avisos','notices'],
   ['15.19','B','Documentos','docs'],['15.20','B','Configurações','settings'],
   ['15.21','A','Ícones livres','symbols'],['15.22','B','Componentes secundários','secondary']
  ].map(([id,option,title,kind])=>({id,option,title,kind}));
  const sections=[['Rotina','15.3','15.4','15.5','15.6'],['Planejamento','15.7','15.8','15.9','15.10','15.11'],['Avaliações','15.12','15.13','15.14'],['Portal e sistema','15.1','15.2','15.15','15.16','15.17','15.18','15.19','15.20','15.21','15.22']];
  const icon=name=>`<svg class="v2-glyph" aria-hidden="true" viewBox="0 0 24 24"><use href="./atelie-salta-v2-icons.svg#v2-${name}"></use></svg>`;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const btn=(label,action,extra='')=>`<button type="button" class="f2-btn ${extra}" data-f2-action="${action}">${label}</button>`;
  const iso=(y,m,d)=>[y,String(m+1).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
  const splitISO=value=>{const match=/^(\d{4})-(\d\d)-(\d\d)$/.exec(value||'');if(!match)return null;const y=+match[1],m=+match[2]-1,d=+match[3],date=new Date(y,m,d);return date.getFullYear()===y&&date.getMonth()===m&&date.getDate()===d?{y,m,d,date}:null};
  const daysOfMonth=(y,m)=>new Date(y,m+1,0).getDate();
  const mondayIndex=date=>(date.getDay()+6)%7;
  const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const weekday=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const dmy=value=>{const x=splitISO(value);return x?String(x.d).padStart(2,'0')+'/'+String(x.m+1).padStart(2,'0')+'/'+x.y:'—'};
  const addDays=(value,days)=>{const p=splitISO(value);if(!p)return value;const d=new Date(p.y,p.m,p.d+days);return iso(d.getFullYear(),d.getMonth(),d.getDate())};
  const startMonday=value=>{const p=splitISO(value);return addDays(value,-mondayIndex(p.date))};
  const monthDays=(year,month)=>{const leading=mondayIndex(new Date(year,month,1)),days=daysOfMonth(year,month),len=Math.ceil((leading+days)/7)*7;return Array.from({length:len},(_,n)=>{const date=new Date(year,month,n-leading+1);return {key:iso(date.getFullYear(),date.getMonth(),date.getDate()),inMonth:date.getMonth()===month,day:date.getDate(),weekday:mondayIndex(date)};});};
  function lessons(value){
   const p=splitISO(value);if(!p)return [];
   const day=p.date.getDay();if(day===0||day===6)return [];
   const items=[
    {start:'07:30',end:'08:20',institution:'Escola Exemplo A',className:'Turma A',subject:'Matemática',content:'Frações e representação',status:'Rascunho'},
    {start:'13:10',end:'14:00',institution:'Escola Exemplo B',className:'Turma B',subject:'Matemática',content:'Geometria plana',status:'Planejada'},
    {start:'19:00',end:'19:50',institution:'Escola Exemplo A',className:'Turma C',subject:'Matemática EJA',content:'Estatística aplicada',status:'Exemplo'}
   ];
   return day===2?[items[0],items[2]]:day===4?[items[1],items[2]]:items;
  }
  const dayCount=value=>lessons(value).length;
  const sampleGrades=students.map((st,i)=>({id:st.id,original:[i===0?'0':String((5+(i%5)).toFixed(1)),i===1?'':String((4+(i%6)).toFixed(1))],recovery:i%4===0?'':String((6+i%4).toFixed(1)),partial:i%7===0}));
  const makeAttendance=()=>({lesson:0,tab:'today',draft:true,confirmed:[false,false],students:students.map((s,i)=>({id:s.id,states:[i%8===0?'F':'P',i%7===0?'F':'P'],reasons:['','']})),selected:null});
  const attendanceCodes=['P','F','FJ','FA','—'],seenCodes=['✓','×','◷','—','FJ','FA','Isento'];
  const makeChecks=()=>({activities:['Frações','Expressões','Geometria','Revisão','Estatística','Problemas','Leitura','Recuperação'],states:students.map((s,i)=>Array.from({length:8},(_,j)=>(i+j)%5===0?'◷':(i+j)%4===0?'×':(i+j)%3===0?'—':'✓')),selected:null,mode:'matrix'});
  window.SALTA_ATELIE_02={referenceToday,students,choices,sections,icon,esc,btn,iso,splitISO,daysOfMonth,mondayIndex,months,weekday,dmy,addDays,startMonday,monthDays,lessons,dayCount,sampleGrades,makeAttendance,attendanceCodes,seenCodes,makeChecks};
})();
