import { createLayoutManifest, validateLayoutManifest, PAGE_WIDTH_MM, PAGE_HEIGHT_MM } from './layout.mjs?v=20261114v2final';
import { createTemplate } from './template.mjs?v=20261114v2final';
import { createCardManifest as legacyManifest, renderTemplateSvg as legacyRender, renderHeaderPreviewSvg as legacyHeader, DEFAULT_CARD_HEADER as LEGACY_HEADER } from './render-v1.mjs?v=20261114v2final';
import { wrapText, textWidth } from './artwork.mjs?v=20261114v1';
export { createAssessmentDefinition } from './assessment.mjs?v=20261114v2final';
export { createLayoutManifest };
export const DEFAULT_CARD_HEADER=Object.freeze({...LEGACY_HEADER,visible:Object.freeze({...LEGACY_HEADER.visible,teacher:true,className:true,date:true,subject:true}),showInstructions:false,instructions:'',customFields:Object.freeze([])});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=(x,y,value,size=3,weight=400,anchor='start')=>value?`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="#000">${esc(value)}</text>`:'';
const frame=(f,cls)=>`<rect class="${cls}" x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="1" ry="1" fill="none" stroke="#000" stroke-width="0.25"/>`;
// Presentation only: the manifest retains every reserved section, bubble and fiducial coordinate.
function sectionVisualFrame(f,questions){
 const rows=questions.filter(q=>q.sectionId===f.sectionId&&q.columnIndex===f.columnIndex&&q.y>=f.y&&q.y<f.y+f.height);
 if(!rows.length)return {...f,titleFont:2.6};
 let left=Infinity,right=-Infinity;
 for(const q of rows){
  const numberRight=q.x+5.8;
  left=Math.min(left,numberRight-textWidth(String(q.number).padStart(2,'0'),2.6));
  right=Math.max(right,numberRight);
  for(const b of q.bubbles){left=Math.min(left,b.x-b.radiusMm);right=Math.max(right,b.x+b.radiusMm);}
 }
 const padding=2.1,minimumWidth=right-left+padding*2,maxLines=f.titleLines.length+1;
 let width=Math.min(f.width,minimumWidth),titleLines=f.titleLines,titleFont=2.6;
 // Use the existing title space. Compact titles may wrap; do not push optical rows down.
 for(let candidate=width;candidate<=f.width+0.001;candidate=Math.min(f.width,candidate+0.5)){
  let fit=null;
  for(const [size,limit] of [[2.6,f.titleLines.length],[2.25,maxLines]]){
   try{const lines=wrapText(f.label,candidate-padding*2,size);if(lines.length<=limit){fit={lines,size};break;}}catch{}
  }
  if(fit){width=candidate;titleLines=fit.lines;titleFont=fit.size;break;}
  if(candidate===f.width){width=f.width;break;}
  if(candidate+0.5>f.width)candidate=f.width-0.5;
 }
 // A title too long for the compact treatment keeps the original safe line layout.
 if(!titleLines.every(line=>textWidth(line,titleFont)<=width-padding*2+0.001)){
  width=f.width;titleLines=f.titleLines;titleFont=2.6;
 }
 const leftLimit=Math.max(f.x,right+padding-width);
 const rightLimit=Math.min(f.x+f.width-width,left-padding);
 const preferred=(left+right-width)/2;
 const x=leftLimit<=rightLimit?Math.max(leftLimit,Math.min(rightLimit,preferred)):Math.max(f.x,Math.min(f.x+f.width-width,preferred));
 return {...f,x,width,titleLines,titleFont};
}
export function createCardManifest(template,header=null,options={}){
 if(template.layoutVersion==='v1'||template.version==='salta-omr-a4-v7')return legacyManifest(template,header||LEGACY_HEADER);
 if(header===DEFAULT_CARD_HEADER)header=null;
 const h={...DEFAULT_CARD_HEADER,...template.metadata,institution:template.schoolName,title:template.title,...(header||{}),visible:{...DEFAULT_CARD_HEADER.visible,...template.metadata?.visibleFields,...header?.visible}};
 const mode=template.identity.mode==='none'?'none':h.showStudentCode===false&&template.identity.mode==='seven-digit-code'?'manual':template.identity.mode;
 const source={...template,sectionFrameStyle:options.sectionFrameStyle,title:h.title||template.title,schoolName:h.institution||'',metadata:{...template.metadata,...h},identity:{...template.identity,mode,showName:mode!=='none'&&(h.visible?.studentName??template.identity.showName)}};
 return createLayoutManifest(source);
}
function drawQuestion(q){
 const parts=[];const cy=q.type==='CDU'?q.y+3.3:q.y+q.height/2;
 parts.push(text(q.x+5.8,cy+.85,String(q.number).padStart(2,'0'),2.6,600,'end'));
 for(const box of q.responseBoxes||[]){parts.push(text(box.centerX,box.y-.7,box.place,1.9,500,'middle'));parts.push(`<rect class="omr-cdu-response-box" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="1" ry="1" fill="#fff" stroke="#000" stroke-width="0.25"/>`);}
 for(const b of q.bubbles){parts.push(`<circle class="omr-answer-bubble" data-question-id="${esc(q.questionId)}" data-question="${q.number}" ${q.type==='CDU'?`data-place="${b.place}" data-digit="${b.digit}"`:`data-choice="${b.choice}"`} cx="${b.x}" cy="${b.y}" r="${b.radiusMm}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);parts.push(text(b.x,b.y+.72,q.type==='CDU'?String(b.digit):b.choice,q.type==='CDU'?1.85:2.2,500,'middle'));}
 return parts.join('');
}
export function renderTemplateSvg(template,{page=1,header=null,manifest:suppliedManifest=null,width=template?.widthMm??PAGE_WIDTH_MM,height=template?.heightMm??PAGE_HEIGHT_MM}={}){
 const m=suppliedManifest||createCardManifest(template,header);
 if(m.schemaVersion==='salta-layout-manifest-v1')return legacyRender(template,{page,header:header||LEGACY_HEADER,manifest:m,width,height});
 if(page!==1||width!==m.paper.widthMm||height!==m.paper.heightMm)throw new RangeError('A exportação deve preservar uma única folha e as dimensões do manifesto.');
 const validation=validateLayoutManifest(m);if(!validation.valid)throw new RangeError(validation.errors.join(' '));
 const b=m.technicalRegions.border;
 const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cartão de respostas" data-template-version="${esc(m.version)}" data-template-id="${esc(m.templateId)}" data-layout-hash="${m.contentHash}" data-artwork-version="salta-card-artwork-v2" data-page="1/1">`,`<rect width="${width}" height="${height}" fill="#fff"/>`,`<rect class="omr-card-border" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="#000" stroke-width="0.25"/>`];
 // Continuous luminance, sRGB and untouched alpha preserve subtle/logo details.
 parts.push('<defs><filter id="salta-monochrome" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter></defs>');
 const student=m.identityCode.student;
 const hp=m.panels.header;parts.push('<g class="card-header">',frame(hp.frame,'omr-header-frame'));
 for(const l of hp.logos)parts.push(`<image href="${esc(l.href)}" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" preserveAspectRatio="xMidYMid meet" filter="url(#salta-monochrome)"/>`);
 let nominalClassDrawn=false;
 for(const t of hp.texts){
 if(t.id==='TURMA'&&!m.header.className&&student?.className){if(nominalClassDrawn)continue;nominalClassDrawn=true;const ls=wrapText('TURMA: '+student.className,t.box.width,t.size);if(ls.length*t.size*1.3>t.box.height+.001)throw new RangeError('A turma nominal não cabe na célula do cabeçalho.');ls.forEach((line,i)=>parts.push(text(t.x,t.y+i*t.size*1.3,line,t.size,t.weight,t.anchor)));continue;}
 parts.push(`<g data-header-field="${esc(t.id)}">${text(t.x,t.y,t.text,t.size,t.weight,t.anchor)}</g>`);}
 for(const l of hp.rules)parts.push(`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#000" stroke-width="0.2"/>`);parts.push('</g>');
 if(m.panels.name){const f=m.panels.name;parts.push(frame(f,'omr-name-frame'),text(f.x+3,f.y+7,'NOME:',3,700));const value=student?.name;if(value){const ls=wrapText(value,f.width-22,3);if(ls.length>2)throw new RangeError('O nome nominal não cabe em duas linhas. Confira o cadastro antes de imprimir.');ls.forEach((line,i)=>parts.push(text(f.x+18,f.y+4.5+i*3.9,line,3)));}else parts.push(`<line x1="${f.x+18}" y1="${f.y+8}" x2="${f.x+f.width-3}" y2="${f.y+8}" stroke="#000" stroke-width="0.2"/>`);}
 if(m.panels.instructions){const f=m.panels.instructions;parts.push(frame(f,'omr-instructions-frame'));f.lines.forEach((line,i)=>parts.push(text(f.x+3,f.y+3.5+i*3.25,line,2.5)));}
 for(const f of m.sections){
  const visual=m.sectionFrameStyle==='content'?sectionVisualFrame(f,m.questions):{...f,titleFont:2.6};
  parts.push(`<g class="omr-section-frame" data-section-id="${esc(f.sectionId)}">`,frame(visual,'omr-section-border'));
  const pitch=visual.titleFont===2.6?3.38:2.35,heading=f.titleLines.length*3.38+3;
  const first=visual.titleFont===2.6?3.6:Math.max(2.5,(heading-pitch*(visual.titleLines.length-1))/2+.55);
  // Only printed titles lose the automatic suffix; preserve the manifest and optical layout.
  const continued=f.label.endsWith(' (cont.)')&&m.sections.some(previous=>previous.sectionId===f.sectionId&&previous.columnIndex<f.columnIndex);
  const printedLines=continued?visual.titleLines.map(line=>line.replace(/(?:^|\s)\(cont\.\)$/,'').trimEnd()).filter(Boolean):visual.titleLines;
  printedLines.forEach((line,i)=>parts.push(text(visual.x+visual.width/2,f.y+first+i*pitch,line,visual.titleFont,700,'middle')));
  parts.push('</g>');
 }
 for(const q of m.questions)parts.push(`<g class="omr-question" data-question-id="${esc(q.questionId)}" data-question="${q.number}" data-type="${q.type}">${drawQuestion(q)}</g>`);
 if(m.panels.code){const f=m.panels.code;parts.push(frame(f,'omr-code-frame'),text(f.x+f.width/2,f.y+4,'CÓDIGO DO ALUNO',2.2,700,'middle'));for(const c of m.identityCode.columns)parts.push(`<rect x="${c.box.x}" y="${c.box.y}" width="4.2" height="4.2" rx="1" ry="1" fill="#fff" stroke="#000" stroke-width="0.25"/>`,text(c.centerX,c.box.y+3.1,c.printedDigit,2.8,600,'middle'));for(const bubble of m.identityBubbles){parts.push(`<circle class="omr-identity-bubble" data-column="${bubble.column}" data-digit="${bubble.digit}" cx="${bubble.x}" cy="${bubble.y}" r="2.25" fill="${bubble.filled?'#000':'#fff'}" stroke="#000" stroke-width="0.25"/>`);if(!bubble.filled)parts.push(text(bubble.x,bubble.y+.65,String(bubble.digit),1.85,500,'middle'));}}
 for(const f of m.technicalRegions.fiducials)parts.push(`<rect class="omr-fiducial" data-marker="${f.markerId}" x="${f.x-f.sizeMm/2}" y="${f.y-f.sizeMm/2}" width="${f.sizeMm}" height="${f.sizeMm}" fill="#000"/>`);
 return parts.join('')+'</svg>';
}
export function renderHeaderPreviewSvg(header=DEFAULT_CARD_HEADER){
 const template=createTemplate([{type:'A-D',count:1,label:'Prévia'}],{identityMode:'none',title:header.title,schoolName:header.institution});
 const m=createCardManifest(template,{...header,visible:{...header.visible,studentName:false}});
 const h=m.panels.header.frame.y+m.panels.header.frame.height+2;
 return renderTemplateSvg(template,{header,manifest:m}).replace('height="297mm"',`height="${h}mm"`).replace('viewBox="0 0 210 297"',`viewBox="0 0 210 ${h}"`);
}
