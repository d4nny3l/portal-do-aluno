import test from 'node:test';import assert from 'node:assert/strict';
import {harness,packet,definition as legacyDefinition} from './helpers.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest,DEFAULT_CARD_HEADER} from '../../corretor/v2/omr/render.mjs';
import {validateDefinition} from '../definition.mjs';
import {createEditorSnapshot,editorFromSnapshot,EDITOR_SNAPSHOT_CAPABILITY,SNAPSHOT_DEFINITION_SCHEMA} from '../../corretor/v2/assessments/editor-snapshot.mjs';
export function snapshotFixture({mode='full-page',width=120,height=180,type='A-E',opposite=false,logos=false}={}){
 const fields={assessmentTitle:'Avaliação sintética',assessmentSubject:'Ciências',assessmentClass:'Turma sintética',assessmentDate:'2026-11-24',assessmentKind:'Prova objetiva',identityMode:'none',columnCount:'auto',cardMode:mode,embeddedWidth:String(width),embeddedHeight:String(height),type:opposite?'CDU':type,count:opposite?'':'3',sectionLabel:opposite?'Próximo bloco':''};
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const header={...DEFAULT_CARD_HEADER,title:fields.assessmentTitle,institution:'ESCOLA SINTÉTICA\nINSTITUIÇÃO',subject:fields.assessmentSubject,className:fields.assessmentClass,date:fields.assessmentDate,teacher:'Docente sintético',grade:'Ano sintético',schoolYear:'2026',logo:logos?image:'',secondaryLogo:logos?image:'',logoWidthMm:opposite?30:14,secondaryLogoWidthMm:opposite?14:30,logoAspect:opposite?0.5:2,secondaryLogoAspect:opposite?2:0.5,showStudentCode:false,showInstructions:opposite,visible:Object.fromEntries(Object.keys(DEFAULT_CARD_HEADER.visible).map(k=>[k,opposite])),customFields:[]};
 const sections=[{sectionId:'section-1',label:'Bloco sintético',order:0,type,count:3,items:Array.from({length:3},(_,i)=>({questionId:'question-'+(i+1),originalOrder:i+1,number:i+1,type}))}];
 const template=createTemplate(sections,{templateId:'synthetic-snapshot',revision:9,title:header.title,schoolName:header.institution,identityMode:fields.identityMode,mode,embeddedSize:mode==='embedded'?{widthMm:width,heightMm:height}:null,metadata:{...header,kind:fields.assessmentKind,visibleFields:header.visible}});
 const manifest=JSON.parse(JSON.stringify(createCardManifest(template,header,{sectionFrameStyle:'content'})));
 const editor={version:1,sections,header,layoutRevision:9,nextQuestionNumber:4,nextSectionOrder:1,fields,showInstructions:opposite};
 const definition={schemaVersion:SNAPSHOT_DEFINITION_SCHEMA,title:fields.assessmentTitle,subject:fields.assessmentSubject,kind:fields.assessmentKind,date:fields.assessmentDate,manifest,blocks:[{blockId:'section-1',label:sections[0].label,valueUnits:'100000',questionIds:sections[0].items.map(q=>q.questionId)}],answers:template.questions.map(q=>({questionId:q.questionId,correct:q.choices[0]})),display:{score:'both',scoreDecimals:opposite?0:2},editorSnapshot:createEditorSnapshot(editor,manifest)};
 return {definition,editor};
}
test('versioned snapshot round-trip, exact geometry, dual logos and three embedded dimensions',()=>{
 for(const opts of [{logos:true},{opposite:true},{mode:'embedded',width:100,height:160,type:'A-D'},{mode:'embedded',width:120,height:180},{mode:'embedded',width:180,height:240,type:'C-E'}]){
  const {definition:d,editor}=snapshotFixture(opts),manifest=structuredClone(d.manifest);
  assert.deepEqual(validateDefinition(d).definition,d);assert.deepEqual(editorFromSnapshot(d.editorSnapshot,d.manifest),editor);assert.deepEqual(d.manifest,manifest);
  if(opts.logos){assert.equal(d.editorSnapshot.header.logo,'manifest.header.logo');assert.equal(d.editorSnapshot.header.secondaryLogo,'manifest.header.secondaryLogo');assert.ok(!JSON.stringify(d.editorSnapshot).includes('data:image/'));}
 }
});
test('strict schema rejects sensitive extras, unknown versions, oversized and contradictory editor state',()=>{
 const mutations=[d=>d.editorSnapshot.schemaVersion='future',d=>delete d.editorSnapshot,d=>d.editorSnapshot.fields.studentName='forbidden',d=>d.editorSnapshot.fields.token='forbidden',d=>d.editorSnapshot.header.students=[],d=>d.editorSnapshot.header.logo='https://external.invalid/logo.png',d=>d.editorSnapshot.header.logo='data:image/png;base64,AA==',d=>d.editorSnapshot.fields.cardMode='embedded',d=>d.editorSnapshot.fields.identityMode='manual',d=>d.editorSnapshot.fields.columnCount='5',d=>d.editorSnapshot.fields.assessmentTitle='Another',d=>d.editorSnapshot.layoutRevision++,d=>d.editorSnapshot.showInstructions=true,d=>d.editorSnapshot.header.visible.subject=true,d=>d.editorSnapshot.sections[0].items[0].number=10,d=>d.editorSnapshot.sections[0].items[0].questionId='unknown',d=>d.editorSnapshot.sections[0].items[0].originalOrder=4,d=>d.editorSnapshot.sections[0].items.reverse(),d=>d.editorSnapshot.sections[0].order=1,d=>d.editorSnapshot.sections[0].label='Wrong',d=>d.editorSnapshot.sections[0].items[0].student={},d=>d.editorSnapshot.fields.sectionLabel='x'.repeat(49),d=>d.editorSnapshot.header.institution='x'.repeat(128001),d=>d.editorSnapshot.fields.assessmentDate='2026-02-30',d=>d.schemaVersion='salta-assessment-definition-v2'];
 for(const mutate of mutations){const {definition:d}=snapshotFixture();mutate(d);assert.throws(()=>validateDefinition(d),undefined,mutate.toString());}
 const d=snapshotFixture({mode:'embedded'}).definition;d.editorSnapshot.fields.embeddedWidth='121';assert.throws(()=>validateDefinition(d));
});
test('HTTP save/GET, replay, isolated owners, duplicates, selections and immutable editor revisions',async t=>{
 const h=await harness();t.after(h.close);const id=crypto.randomUUID(),a=snapshotFixture({logos:true}).definition,b=snapshotFixture({opposite:true}).definition,p=packet(0,{definition:a});
 assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:p})).status,201);
 const get=async rev=>(await(await h.request('/assessments/'+id+'/revisions/'+rev)).json()).record;
 assert.deepEqual((await get(1)).definition,a);assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:p})).status,200);assert.equal((await h.request('/assessments/'+id,{actor:'b'})).status,404);
 assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:packet(1,{definition:b})})).status,201);assert.deepEqual((await get(1)).definition,a);assert.deepEqual((await get(2)).definition,b);
 const duplicate=crypto.randomUUID();assert.equal((await h.request('/assessments/'+id+'/duplicate',{method:'POST',data:{requestId:crypto.randomUUID(),newId:duplicate,sourceRevision:1}})).status,201);assert.deepEqual((await(await h.request('/assessments/'+duplicate)).json()).record.definition,a);
 const selected=crypto.randomUUID();assert.equal((await h.request('/selections',{method:'POST',data:{requestId:crypto.randomUUID(),selectionId:selected,assessmentId:id,revision:1}})).status,201);assert.deepEqual((await(await h.request('/selections/'+selected)).json()).record.definition,a);
 const print=await(await h.request('/assessments/'+id+'/revisions/1/print')).json();assert.ok(!JSON.stringify(print).includes('editorSnapshot'));assert.ok(!JSON.stringify(print).includes('valueUnits'));
 const encrypted=h.db.sqlite.prepare('SELECT encrypted_json FROM av_revisions LIMIT 1').get().encrypted_json;assert.ok(!encrypted.includes('editorSnapshot'));assert.ok(!encrypted.includes('Docente sintético'));assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) AS n FROM av_revisions').get().n,3);
});
test('capability authenticates teacher, historical v2 A4 V1/V2 still reads without rewrite, body size enforced',async t=>{
 const h=await harness();t.after(h.close);assert.equal((await(await h.request('/session')).json()).editorSnapshotVersion,EDITOR_SNAPSHOT_CAPABILITY);
 for(const actor of ['', 'unknown'])assert.equal((await(await h.request('/session',{actor})).json()).editorSnapshotVersion,undefined);
 for(const legacy of [false,true]){const old=legacyDefinition({legacy}),id=crypto.randomUUID();assert.equal((await h.request('/assessments/'+id,{method:'PUT',data:packet(0,{definition:old})})).status,201);assert.deepEqual((await(await h.request('/assessments/'+id)).json()).record.definition,old);}
 const huge=packet(0,{definition:snapshotFixture().definition});huge.definition.editorSnapshot.header.institution='x'.repeat(1_000_001);assert.equal((await h.request('/assessments/'+crypto.randomUUID(),{method:'PUT',data:huge})).status,413);
});
