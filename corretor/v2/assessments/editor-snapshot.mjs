// Reusable editor preferences only. No transport, browser storage or OMR recomposition.
export const EDITOR_SNAPSHOT_VERSION='salta-editor-snapshot-v1';
export const EDITOR_SNAPSHOT_CAPABILITY='salta-editor-snapshot-v1';
export const SNAPSHOT_DEFINITION_SCHEMA='salta-assessment-definition-v3';
export const EDITOR_FIELD_IDS=Object.freeze(['assessmentTitle','assessmentSubject','assessmentClass','assessmentDate','assessmentKind','identityMode','columnCount','cardMode','embeddedWidth','embeddedHeight','type','count','sectionLabel']);
export const HEADER_VISIBILITY_KEYS=Object.freeze(['institution','teacher','subject','className','grade','date','schoolYear','title','studentName']);
const headerTextLimits={institution:600,teacher:512,subject:256,className:256,grade:128,date:10,schoolYear:96,title:320,instructions:2000};
const headerKeys=[...Object.keys(headerTextLimits),'layout','logo','secondaryLogo','showStudentCode','visible','customFields','showInstructions','logoWidthMm','secondaryLogoWidthMm','logoAspect','secondaryLogoAspect'];
const fail=()=>{throw new TypeError('Snapshot do editor inválido ou incompatível com a avaliação.');};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail();};
const str=(v,max,multiline=false)=>{if(typeof v!=='string'||v.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u:/[\u0000-\u001f\u007f]/u).test(v))fail();};
const integer=(v,min,max=1_000_000)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail();};
const bool=v=>{if(typeof v!=='boolean')fail();};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clean=(v,max=Infinity)=>v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
const multiline=v=>v.replace(/\r\n?/g,'\n').trim();
const ref=key=>'manifest.header.'+key;
const logoKeys=['logo','secondaryLogo'];

// The only canonicalization is projecting editor-only keys and replacing large
// image bytes by logical references to the SAME immutable manifest.
export function createEditorSnapshot(editor,manifest){
 if(editor?.version!==1)fail();
 const header=Object.fromEntries(headerKeys.map(k=>[k,structuredClone(editor.header?.[k])]));
 for(const k of logoKeys){
  const value=editor.header?.[k];
  if(typeof value!=='string'||value!==(manifest.header?.[k]||''))fail();
  header[k]=value?ref(k):'';
 }
 const snapshot={schemaVersion:EDITOR_SNAPSHOT_VERSION,version:1,sections:structuredClone(editor.sections),header,
  layoutRevision:editor.layoutRevision,nextQuestionNumber:editor.nextQuestionNumber,nextSectionOrder:editor.nextSectionOrder,
  fields:structuredClone(editor.fields),showInstructions:editor.showInstructions};
 validateEditorSnapshot(snapshot,{manifest});return snapshot;
}

export function validateEditorSnapshot(s,{manifest,template,definition}={}){
 exact(s,['schemaVersion','version','sections','header','layoutRevision','nextQuestionNumber','nextSectionOrder','fields','showInstructions']);
 if(s.schemaVersion!==EDITOR_SNAPSHOT_VERSION||s.version!==1||!manifest)fail();
 if(new TextEncoder().encode(JSON.stringify(s)).length>128_000)fail();
 exact(s.fields,EDITOR_FIELD_IDS);const f=s.fields,h=s.header,mh=manifest.header||{};
 for(const [k,v] of Object.entries(f))str(v,k==='sectionLabel'?48:k==='assessmentTitle'?320:k==='assessmentSubject'||k==='assessmentClass'?256:k==='assessmentKind'?80:32);
 if(!['full-page','embedded'].includes(f.cardMode)||f.cardMode!==manifest.mode||!['manual','none','seven-digit-code'].includes(f.identityMode)||f.identityMode!==manifest.identity.mode)fail();
 if(!['auto','1','2','3','4','5'].includes(f.columnCount)||!['A-D','A-E','C-E','CDU'].includes(f.type))fail();
 if(f.count!==''&&(!/^\d{1,3}$/.test(f.count)||Number(f.count)<1||Number(f.count)>150))fail();
 for(const [k,max] of [['embeddedWidth',210],['embeddedHeight',297]])if(f[k]!==''&&(!/^\d+(?:\.\d+)?$/.test(f[k])||Number(f[k])>max||Number(f[k])<=0))fail();
 if(f.cardMode==='embedded'&&(Number(f.embeddedWidth)!==manifest.paper.widthMm||Number(f.embeddedHeight)!==manifest.paper.heightMm))fail();
 if(f.columnCount!=='auto'&&Number(f.columnCount)!==manifest.columns.length)fail();
 if(f.assessmentDate!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(f.assessmentDate)||!Number.isFinite(Date.parse(f.assessmentDate+'T12:00:00Z'))||new Date(f.assessmentDate+'T12:00:00Z').toISOString().slice(0,10)!==f.assessmentDate))fail();
 if(definition&&['title','subject','kind','date'].some((k,i)=>definition[k]!==f[['assessmentTitle','assessmentSubject','assessmentKind','assessmentDate'][i]].trim()))fail();
 integer(s.layoutRevision,1);if(s.layoutRevision!==manifest.revision)fail();
 integer(s.nextQuestionNumber,1);integer(s.nextSectionOrder,0);bool(s.showInstructions);
 exact(h,headerKeys);
 for(const [k,max] of Object.entries(headerTextLimits))str(h[k],max,['institution','instructions'].includes(k));
 if(!['text','logo-left','dual-logo','compact'].includes(h.layout))fail();
 if(mh.layout!==undefined&&h.layout!==mh.layout)fail();
 for(const k of ['showStudentCode','showInstructions'])bool(h[k]);
 if(h.showStudentCode!==(f.identityMode==='seven-digit-code')||h.showInstructions!==s.showInstructions)fail();
 exact(h.visible,HEADER_VISIBILITY_KEYS);for(const v of Object.values(h.visible))bool(v);
 for(const k of HEADER_VISIBILITY_KEYS){const expected=mh.visible?.[k]??mh.visibleFields?.[k];if(expected!==undefined&&h.visible[k]!==expected)fail();}
 for(const k of ['logoWidthMm','secondaryLogoWidthMm'])if(typeof h[k]!=='number'||!Number.isFinite(h[k])||h[k]<14||h[k]>30)fail();
 for(const k of ['logoAspect','secondaryLogoAspect'])if(typeof h[k]!=='number'||!Number.isFinite(h[k])||h[k]<=0||h[k]>10000)fail();
 for(const k of ['logoWidthMm','secondaryLogoWidthMm','logoAspect','secondaryLogoAspect'])if(mh[k]!==undefined&&h[k]!==mh[k])fail();
 for(const k of logoKeys){
  if(!['',ref(k)].includes(h[k]))fail();
  if(Boolean(h[k])!==Boolean(mh[k]))fail();
  if(h[k]&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{1,2800000}$/i.test(mh[k]))fail();
 }
 if(!Array.isArray(h.customFields)||h.customFields.length>4)fail();
 for(const c of h.customFields){exact(c,['label','value','visible']);str(c.label,24);str(c.value,50);bool(c.visible);}
 const custom=h.customFields.filter(c=>c.label.trim()&&c.value.trim()).map(c=>({...c,label:c.label.trim(),value:c.value.trim()}));
 if(!same(custom,mh.customFields||[]))fail();
 const normalized={institution:multiline(h.institution),teacher:clean(h.teacher,256),subject:clean(h.subject,160),className:clean(h.className,128),grade:clean(h.grade,128),date:clean(h.date,96),schoolYear:clean(h.schoolYear,96),title:clean(h.title,160),instructions:multiline(h.instructions)};
 for(const [k,v] of Object.entries(normalized))if(mh[k]!==undefined&&v!==mh[k])fail();
 if(h.title!==(f.assessmentTitle.trim()||'CARTÃO DE RESPOSTAS')||h.subject!==f.assessmentSubject.trim()||h.className!==f.assessmentClass.trim()||h.date!==f.assessmentDate)fail();
 if(mh.showInstructions!==undefined&&mh.showInstructions!==s.showInstructions)fail();
 if(!Array.isArray(s.sections)||s.sections.length<1||s.sections.length>32)fail();
 const questions=manifest.questions,seen=new Set(),sectionIds=new Set(),orders=new Set(),originalOrders=new Set();let count=0;
 for(const [index,section] of s.sections.entries()){
  exact(section,['sectionId','label','order','type','count','items']);str(section.sectionId,48);str(section.label,64);integer(section.order,0);
  if(!section.sectionId||sectionIds.has(section.sectionId)||orders.has(section.order)||section.order>=s.nextSectionOrder)fail();
  sectionIds.add(section.sectionId);orders.add(section.order);
  const sectionOrdinal=/^section-(\d+)$/.exec(section.sectionId);
  if(sectionOrdinal&&Number(sectionOrdinal[1])>s.nextSectionOrder)fail();
  if(!['A-D','A-E','C-E'].includes(section.type)||!Array.isArray(section.items)||section.items.length<1||section.items.length>150)fail();
  integer(section.count,1,150);
  // count is the original creation control; deleting/reordering questions must
  // not silently rewrite it. Actual coverage is the immutable items array.
  const expected=questions.filter(q=>q.sectionId===section.sectionId);
  if(expected.length!==section.items.length)fail();
  if(template&&template.sections[index]?.sectionId!==section.sectionId)fail();
  const printedLabel=manifest.sections.find(x=>x.sectionId===section.sectionId)?.label;
  if(printedLabel!==undefined&&section.label.trim()!==printedLabel)fail();
  for(const [i,q] of section.items.entries()){
   exact(q,['questionId','originalOrder','number','type']);str(q.questionId,48);integer(q.originalOrder,1);integer(q.number,1,999);
   if(seen.has(q.questionId)||originalOrders.has(q.originalOrder)||!['A-D','A-E','C-E'].includes(q.type)||q.originalOrder>=s.nextQuestionNumber)fail();
   const eq=expected[i];if(q.questionId!==eq.questionId||q.number!==eq.number||q.type!==eq.type)fail();
   const questionOrdinal=/^question-(\d+)$/.exec(q.questionId);
   if(questionOrdinal&&Number(questionOrdinal[1])>=s.nextQuestionNumber)fail();
   seen.add(q.questionId);originalOrders.add(q.originalOrder);count++;
  }
  if(definition){const block=definition.blocks[index];if(block?.blockId!==section.sectionId||!same(block.questionIds,section.items.map(q=>q.questionId))||block.label!==section.label)fail();}
 }
 if(count!==questions.length||seen.size!==questions.length)fail();
 return structuredClone(s);
}

export function editorFromSnapshot(snapshot,manifest){
 validateEditorSnapshot(snapshot,{manifest});
 const {schemaVersion,...editor}=structuredClone(snapshot);
 for(const k of logoKeys)editor.header[k]=editor.header[k]?manifest.header[k]:'';
 return editor;
}
