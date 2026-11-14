import { createAssessmentDefinition, QUESTION_TYPES } from './assessment.mjs?v=20261114v2final';
import { INITIAL_GEOMETRY } from './layout-v1.mjs?v=20261114v2final';
import { wrapText, textWidth, brazilianDate } from './artwork.mjs?v=20261114v1';
export const V2_SCHEMA='salta-layout-manifest-v2';
const frozen=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const hash=value=>{let h=0xcbf29ce484222325n;for(const c of JSON.stringify(value)){h^=BigInt(c.charCodeAt(0));h=BigInt.asUintN(64,h*0x100000001b3n);}return h.toString(16).padStart(16,'0');};
const overlap=(a,b)=>a.x<b.x+b.width-1e-6&&a.x+a.width>b.x+1e-6&&a.y<b.y+b.height-1e-6&&a.y+a.height>b.y+1e-6;
const image=value=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{1,2800000}$/i.test(value||'')?value:'';
function lines(text,width,size){return String(text||'').replace(/\r\n?/g,'\n').split('\n').flatMap(line=>line?wrapText(line,width,size):['']);}
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');

function administrativeCells(h, student, width) {
 const visible = key => (h.visible || h.visibleFields)?.[key] ?? ['teacher', 'className', 'date'].includes(key);
 const fields = [
  {id:'PROFESSOR', key:'teacher', label:'PROF.', value:h.teacher},
  {id:'TURMA', key:'className', label:'TURMA', value:h.className || student?.className},
  {id:'DATA', key:'date', label:'DATA', value:visible('date') ? brazilianDate(h.date || '') : ''},
  {id:'SERIE', key:'grade', label:'ANO/SÉRIE', value:h.grade},
  {id:'ANO', key:'schoolYear', label:'ANO LETIVO', value:h.schoolYear},
 ].filter(field => visible(field.key));
 const aliases = new Map([['prof.', 'teacher'], ['professor', 'teacher'], ['docente', 'teacher'], ['turma', 'className'], ['data', 'date'], ['ano/serie', 'grade'], ['serie', 'grade'], ['ano letivo', 'schoolYear']]);
 for (const [index, field] of (h.customFields || []).entries()) {
  if (field.visible === false || !String(field.label || '').trim() || !String(field.value || '').trim()) continue;
  const key = aliases.get(normalized(field.label)) || normalized(field.label);
  const previous = fields.find(item => item.key === key);
  if (previous) {
   if (normalized(previous.value) === normalized(field.value)) continue;
   throw new RangeError(`O campo ${field.label} está repetido com valores diferentes. Revise os campos administrativos.`);
  }
  fields.push({id:`CUSTOM-${index}`, key, label:String(field.label).trim(), value:field.value});
 }
 if (!fields.length) return [];
 const size = 2.6, padding = 4;
 // Reserve enough physical width for at most two lines, without shrinking type.
 for (const field of fields) {
  field.value = String(field.value || '').trim();
  field.text = `${field.label}: ${field.value}`.trimEnd();
  let low = Math.max(...field.text.split(/\s+/).map(word => textWidth(word, size))) + padding;
  let high = textWidth(field.text, size) + padding;
  for (let i = 0; i < 32; i++) {
   const mid = (low + high) / 2;
   if (lines(field.text, mid - padding, size).length <= 2) high = mid; else low = mid;
  }
  field.width = Math.max(14, high + .001);
 }
 const minimum = fields.reduce((sum, field) => sum + field.width, 0);
 if (minimum > width) throw new RangeError('Os campos administrativos não cabem em uma faixa legível. Oculte campos opcionais ou encurte os valores; nenhuma fonte foi reduzida e nenhum texto foi cortado.');
 const weights = fields.map(field => Math.max(1, Math.sqrt(textWidth(field.text, size))));
 const totalWeight = weights.reduce((a, b) => a + b, 0);
 fields.forEach((field, i) => field.width += (width - minimum) * weights[i] / totalWeight);
 return fields;
}
function headerPlan(d,bounds){
 // The immutable manifest must never freeze the editor's mutable field list.
 const h=structuredClone({...d.metadata,institution:d.schoolName||d.metadata.institution||'',title:d.title||'CARTÃO DE RESPOSTAS'});
 const texts=[],rules=[],logos=[];let y=bounds.y;
 const frame={x:bounds.x,y,width:bounds.width,height:0,role:'header'};
 const text=(id,value,x,top,width,size,center=false,weight=400)=>{const ls=lines(value,width,size);const height=ls.length*size*1.3;ls.forEach((value,i)=>texts.push({id,text:value,x:center?x+width/2:x,y:top+size+i*size*1.3,size,weight,anchor:center?'middle':'start',box:{x,y:top,width,height}}));return height;};
 const logoSpecs=[['logo','logoAspect','logoWidthMm'],['secondaryLogo','secondaryLogoAspect','secondaryLogoWidthMm']];
 const specs=logoSpecs.map(([key,aspectKey,widthKey],i)=>{
  const href=image(h[key]);if(h[key]&&!href)throw new TypeError('Use um logotipo local PNG, JPG ou WebP válido.');
  const aspect=h[aspectKey] == null ? 1 : Number(h[aspectKey]);
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError('A proporção do logotipo precisa ser válida.');
  const requested=Math.min(26,Math.max(14,Number(h[widthKey])||22));
  const height=Math.min(22,requested/aspect),width=height*aspect;
  return{href,width,height,side:i};
 }).filter(l=>l.href);
 const reserve=specs.length?Math.max(...specs.map(l=>l.width))+5:0;
 const institution = (h.visible || h.visibleFields)?.institution === false ? '' : h.institution;
 if(institution.trim()||specs.length){
  const top=y+2,tw=bounds.width-6-reserve*2;
  const th=institution.trim()?text('institution',institution,bounds.x+3+reserve,top,tw,3,true,700):0;
  const height=Math.max(th,...specs.map(l=>l.height),0)+4;
  for (const t of texts.filter(t=>t.id==='institution')) {const offset=(height-4-th)/2;t.y+=offset;t.box.y+=offset;}
  for(const l of specs)logos.push({...l,x:l.side?bounds.x+bounds.width-3-l.width:bounds.x+3,y:top+(height-4-l.height)/2});
  y+=height;rules.push({x1:bounds.x,y1:y,x2:bounds.x+bounds.width,y2:y});
 }
 y+=2;y+=text('title','CARTÃO DE RESPOSTAS',bounds.x+3,y,bounds.width-6,4.4,true,700);
 const subtitle=[h.title==='CARTÃO DE RESPOSTAS'?'':h.title,(h.visible || h.visibleFields)?.subject !== false && h.subject&&!normalized(h.title).includes(normalized(h.subject))?h.subject:''].filter(Boolean).join(' · ');
 if(subtitle){y+=.6;y+=text('subtitle',subtitle,bounds.x+3,y,bounds.width-6,3,true,600);}
 y+=2;
 const cells = administrativeCells(h, d.identity.student, bounds.width);
 let adminBand = null;
 if (cells.length) {
  // A blank global class may be supplied later by a nominal print batch.
  // Keep its two-line capacity without changing the manifest per student.
  const nominalClassLines = cells.some(cell=>cell.id==='TURMA') && !h.className ? 2 : 1;
  const height = Math.max(nominalClassLines,...cells.map(cell => lines(cell.text, cell.width - 4, 2.6).length)) * 3.38 + 4;
  adminBand = {x:bounds.x, y, width:bounds.width, height, cells:[]};
  rules.push({x1:bounds.x,y1:y,x2:bounds.x+bounds.width,y2:y});
  let x = bounds.x;
  for (const cell of cells) {
   if (x > bounds.x) rules.push({x1:x,y1:y,x2:x,y2:y+height});
   text(cell.id, cell.text, x+2, y+2, cell.width-4, 2.6);
   adminBand.cells.push({...cell,x,y,height});
   x += cell.width;
  }
  for (const t of texts.filter(t => cells.some(cell => cell.id === t.id))) t.box.height = height-4;
  y += height;
 }
 frame.height=y-frame.y;return{frame,texts,rules,logos,adminBand,header:h,end:y};
}
function runs(d){const source=d.layoutQuestions||d.questions;const result=[];for(const q of source){let last=result.at(-1);if(!last||last.sectionId!==q.sectionId||last.type!==q.type){last={sectionId:q.sectionId,type:q.type,label:d.sections[q.sectionIndex].label,questions:[]};result.push(last);}last.questions.push(q);}return result;}
function pack(groups,cols,width,start,cap,rowPitch,reserved=0){
 const out=[];let col=0,y=0;const state=new Map();
 for(const run of groups){let offset=0;while(offset<run.questions.length){
  if(col>=cols)return null;
  const limit=col===cols-1?cap-reserved:cap;
  const label=run.label+(offset?' (cont.)':'');
  const titleLines=lines(label,width-4,2.6);const heading=titleLines.length*3.38+3;
  const qheight=run.type==='CDU'?64:rowPitch;
  const gap=y?3:0;
  // Keep short pedagogical groups intact when they fit a fresh column,
  // rather than create a one-question continuation just to balance heights.
  const entire=heading+(run.questions.length-offset)*qheight+1.5;
  if(offset===0&&run.questions.length<=5&&y&&entire<=limit&&entire>limit-y-gap){col++;y=0;continue;}
  const count=Math.min(run.questions.length-offset,Math.floor((limit-y-gap-heading-1.5+1e-6)/qheight));
  if(count<1){col++;y=0;continue;}
  y+=gap;const fragment={sectionId:run.sectionId,label,titleLines,type:run.type,columnIndex:col,offset,y:start+y,width,height:heading+count*qheight+1.5,heading,questions:run.questions.slice(offset,offset+count),rowPitch:qheight};
  out.push(fragment);y+=fragment.height;offset+=count;state.set(col,y);
  if(offset<run.questions.length){col++;y=0;}
 }}
 return{fragments:out,heights:Array.from({length:cols},(_,i)=>state.get(i)||0),height:Math.max(0,...state.values())};
}
function compose(d,size,bounds,start,end){
 const groups=runs(d),coded=d.identity.mode==='seven-digit-code',codeWidth=41.7,codeHeight=67;
 const preferred=Math.min(5,d.questionCount,Math.max(1,Math.ceil(Math.sqrt(d.questionCount/6))));
 const candidates=[];
 for(const [step,pitch]of[6.2,5.6,5.2,4.85].entries())for(let cols=1;cols<=Math.min(5,d.questionCount);cols++){
  if(d.columnCount&&cols!==d.columnCount)continue;
  const width=(bounds.width-3*(cols-1))/cols;
  if(width<33.7)continue;
  for(const position of coded?['below','column']:['none']){
   if(position==='column'&&width<codeWidth)continue;
   const available=end-start-(position==='below'?codeHeight+4:0);
   const reserved=position==='column'?codeHeight+4:0;
   if(available<8||!pack(groups,cols,width,start,available,pitch,reserved))continue;
   let lo=0,hi=available;for(let iteration=0;iteration<25;iteration++){const mid=(lo+hi)/2;if(pack(groups,cols,width,start,mid,pitch,reserved))hi=mid;else lo=mid;}
   const packed=pack(groups,cols,width,start,hi+.0001,pitch,reserved);if(!packed)continue;
   const codeFrame=coded?{x:position==='below'?bounds.x+(bounds.width-codeWidth)/2:bounds.x+(cols-1)*(width+3)+(width-codeWidth)/2,y:position==='below'?start+packed.height+4:start+packed.heights[cols-1]+4,width:codeWidth,height:codeHeight,role:'code'}:null;
   if(codeFrame&&codeFrame.y+codeFrame.height>end+1e-5)continue;
   candidates.push({...packed,cols,width,pitch,codeFrame,position,cost:step*10000+Math.abs(cols-preferred)*100+(position==='column'?20:0)+packed.height/100});
  }
 }
 return candidates.sort((a,b)=>a.cost-b.cost)[0];
}
export function composeV2(input,options={}){
 try{
 const d=input?.schemaVersion==='salta-assessment-definition-v1'?input:createAssessmentDefinition(input,options);
 const embedded=d.mode==='embedded',size=embedded?{kind:'embedded',widthMm:d.embeddedSize?.widthMm,heightMm:d.embeddedSize?.heightMm}:{kind:'A4',widthMm:210,heightMm:297};
 if(!Number.isFinite(size.widthMm)||!Number.isFinite(size.heightMm)||size.widthMm<60||size.widthMm>210||size.heightMm<80||size.heightMm>297)throw new RangeError('O cartão incorporado precisa ter largura de 60 a 210 mm e altura de 80 a 297 mm.');
 if(d.identity.mode==='qr')throw new RangeError('QR indisponível: selecione identificação manual, código de sete dígitos ou nenhuma.');
 if(options.geometry?.bubbleDiameterMm&&options.geometry.bubbleDiameterMm!==4.5)throw new RangeError('O diâmetro protegido das bolhas é 4,5 mm.');
 const inset=embedded?12:14,bounds={x:inset,y:inset,width:size.widthMm-2*inset,height:size.heightMm-2*inset};
 const header=headerPlan(d,bounds);let start=header.end+3;
 const name=d.identity.mode!=='none'&&d.identity.showName!==false;
 const nameFrame=name?{x:bounds.x,y:start,width:bounds.width,height:12,role:'name'}:null;if(name)start+=15;
 let instructions=null;
 if(d.metadata.showInstructions){const value=d.metadata.instructions||'Preencha uma alternativa por questão. Use caneta azul ou preta e evite rasuras.';const ls=lines(value,bounds.width-6,2.5);instructions={x:bounds.x,y:start,width:bounds.width,height:ls.length*3.25+4,lines:ls,role:'instructions'};start+=instructions.height+3;}
 const end=size.heightMm-inset;
 const selected=compose(d,size,bounds,start,end);if(!selected)throw new RangeError(`As ${d.questionCount} questões não cabem em A4 com o cabeçalho e identificação escolhidos. Reduza textos, seções ou quantidade; as bolhas não foram reduzidas.`);
 const questions=[],sections=[];
 for(const f of selected.fragments){
  const x=bounds.x+f.columnIndex*(selected.width+3);const frame={sectionId:f.sectionId,label:f.label,x,y:f.y,width:f.width,height:f.height,columnIndex:f.columnIndex,titleLines:f.titleLines,type:f.type,role:'section'};sections.push(frame);
  for(const [i,q]of f.questions.entries()){
   const y=f.y+f.heading+i*f.rowPitch;const base=x+(f.width-33.7)/2;const bubbles=[],boxes=[];
   if(q.type==='CDU'){
    for(let p=0;p<3;p++){const cx=base+9.1+p*5.2;boxes.push({place:['C','D','U'][p],x:cx-2.1,y:y+5.2,width:4.2,height:4.2,centerX:cx});for(let digit=0;digit<10;digit++)bubbles.push({bubbleId:`${q.questionId}:${p}:${digit}`,place:['C','D','U'][p],digit,x:cx,y:y+12.2+digit*5.1,radiusMm:2.25});}
   }else q.choices.forEach((choice,index)=>bubbles.push({bubbleId:`${q.questionId}:${choice}`,choice,x:base+9.1+index*5.2,y:y+f.rowPitch/2,radiusMm:2.25}));
   questions.push({...q,x:base,y,width:33.7,height:f.rowPitch,bubbles,responseBoxes:boxes,columnIndex:f.columnIndex});
  }
 }
 const identityBubbles=[],columns=[];const student=d.identity.student;
 if(selected.codeFrame){const f=selected.codeFrame;for(let index=0;index<7;index++){const centerX=f.x+5.25+index*5.2;columns.push({index,centerX,box:{x:centerX-2.1,y:f.y+6,width:4.2,height:4.2,centerX},printedDigit:student?.code?.[index]||''});for(let digit=0;digit<10;digit++)identityBubbles.push({bubbleId:`identity:${index}:${digit}`,column:index+1,digit,x:centerX,y:f.y+15.5+digit*5.2,radiusMm:2.25,filled:student?.code?.[index]===String(digit)});}}
 const border={x:embedded?3:12,y:embedded?3:12,width:size.widthMm-(embedded?6:24),height:size.heightMm-(embedded?6:24),strokeMm:.25};
 const fiducials=[[8,8],[size.widthMm-8,8],[size.widthMm-8,size.heightMm-8],[8,size.heightMm-8]].map(([x,y],i)=>({x,y,sizeMm:5.5,markerId:['fiducial-tl','fiducial-tr','fiducial-br','fiducial-bl'][i]}));
 const m={headerRevision:'salta-v2-header-1',schemaVersion:V2_SCHEMA,templateId:d.templateId,revision:d.revision,version:`salta-omr-layout-v2-r${d.revision}`,layoutVersion:'v2',artworkVersion:'salta-card-artwork-v2',mode:d.mode,paper:size,identity:{mode:d.identity.mode,showName:name,showClass:false},identityCode:{mode:d.identity.mode,student,columns},identityBubbles,header:header.header,panels:{header,name:nameFrame,instructions,code:selected.codeFrame},technicalRegions:{border,fiducials,identityGrid:selected.codeFrame,qr:null},geometry:{...INITIAL_GEOMETRY,objectiveRowPitchMm:selected.pitch},safeBoundsMm:bounds,contentBoundsMm:{...bounds,y:start,height:end-start},columns:Array.from({length:selected.cols},(_,i)=>({x:bounds.x+i*(selected.width+3),width:selected.width,height:selected.heights[i]})),columnWidthMm:selected.width,sections,questions,questionCount:d.questionCount,pages:[{page:1,widthMm:size.widthMm,heightMm:size.heightMm}]};
 const withoutIdentity=JSON.parse(JSON.stringify(m));delete withoutIdentity.identityCode.student;withoutIdentity.identityCode.columns.forEach(c=>c.printedDigit='');withoutIdentity.identityBubbles.forEach(b=>b.filled=false);
 m.contentHash=hash(withoutIdentity);return{manifest:frozen(m),validation:validateV2(m)};
 }catch(error){return{manifest:null,validation:{valid:false,errors:[error.message],warnings:[]}};}
}
export function validateV2(m){
 const errors=[];if(!m||m.schemaVersion!==V2_SCHEMA)return{valid:false,errors:['Manifesto V2 inválido.'],warnings:[]};
 const boxes=[m.panels.header.frame,m.panels.name,m.panels.instructions,m.panels.code,...m.sections].filter(Boolean);
 for(const box of boxes){if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.x<m.safeBoundsMm.x-.001||box.y<m.safeBoundsMm.y-.001||box.x+box.width>m.paper.widthMm-m.safeBoundsMm.x+.001||box.y+box.height>m.paper.heightMm-m.safeBoundsMm.y+.001)errors.push('Uma moldura excede a área imprimível.');}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlap(boxes[i],boxes[j]))errors.push('Sobreposição entre molduras.');
 if(new Set(m.questions.map(q=>q.questionId)).size!==m.questionCount||m.questions.length!==m.questionCount)errors.push('Questões repetidas ou ausentes.');
 const circles=[...m.identityBubbles,...m.questions.flatMap(q=>q.bubbles)];
 for(const b of circles)if(b.radiusMm!==2.25||!Number.isFinite(b.x)||!Number.isFinite(b.y)||b.x-b.radiusMm<m.safeBoundsMm.x||b.y-b.radiusMm<m.safeBoundsMm.y||b.x+b.radiusMm>m.safeBoundsMm.x+m.safeBoundsMm.width||b.y+b.radiusMm>m.safeBoundsMm.y+m.safeBoundsMm.height)errors.push('Bolha inválida ou fora da área segura.');
 for(const q of m.questions){const f=m.sections.find(f=>f.sectionId===q.sectionId&&f.columnIndex===q.columnIndex&&q.y>=f.y&&q.y<f.y+f.height);if(!f||q.bubbles.some(b=>b.x-b.radiusMm<=f.x||b.x+b.radiusMm>=f.x+f.width||b.y-b.radiusMm<=f.y||b.y+b.radiusMm>=f.y+f.height))errors.push('Uma questão saiu da própria moldura.');}
 for(const b of m.identityBubbles){const f=m.panels.code;if(!f||b.x-b.radiusMm<=f.x||b.x+b.radiusMm>=f.x+f.width||b.y-b.radiusMm<=f.y||b.y+b.radiusMm>=f.y+f.height)errors.push('O código saiu da própria moldura.');}
 for(const t of m.panels.header.texts){if(![t.x,t.y,t.size].every(Number.isFinite)||t.box.x<m.panels.header.frame.x||t.box.x+t.box.width>m.panels.header.frame.x+m.panels.header.frame.width+.001||t.y-t.size<m.panels.header.frame.y-.001||t.y+t.size*.25>m.panels.header.end+.001)errors.push('Texto de cabeçalho fora da moldura.');}
 for (const logo of m.panels.header.logos) {
  const f=m.panels.header.frame;
  if (![logo.x,logo.y,logo.width,logo.height].every(Number.isFinite)||logo.width<=0||logo.height<=0||logo.width>26.001||logo.height>22.001||logo.x<f.x||logo.y<f.y||logo.x+logo.width>f.x+f.width+.001||logo.y+logo.height>f.y+f.height+.001) errors.push('Logotipo fora dos limites do cabeçalho.');
  if (m.panels.header.texts.some(t=>overlap(logo,t.box))) errors.push('Sobreposição entre logotipo e texto institucional.');
 }
 for(const marker of m.technicalRegions.fiducials)if(marker.sizeMm!==5.5||![8,m.paper.widthMm-8].includes(marker.x)||![8,m.paper.heightMm-8].includes(marker.y))errors.push('Contrato de marcadores divergente.');
 for(let i=0;i<circles.length;i++)for(let j=i+1;j<circles.length;j++)if(Math.hypot(circles[i].x-circles[j].x,circles[i].y-circles[j].y)<4.85-1e-6)errors.push('Colisão entre bolhas.');
 if(m.identity.mode==='seven-digit-code'&&(m.identityBubbles.length!==70||m.identityCode.columns.length!==7))errors.push('Código de sete dígitos incompleto.');
 return{valid:!errors.length,errors,warnings:['Impressão e fotografia físicas ainda não homologadas.']};
}
