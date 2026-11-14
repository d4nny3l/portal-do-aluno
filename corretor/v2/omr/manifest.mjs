import { createTemplate } from './template.mjs?v=20261114v2';
import { validateLayoutManifest } from './layout.mjs?v=20261114v2';
// Explicit model selection, never automatic discovery from a photograph.
export function importCardManifest(value){
 const m=typeof value==='string'?JSON.parse(value):value;const manifest=m?.manifest||m;
 if(!manifest||!['salta-layout-manifest-v1','salta-layout-manifest-v2'].includes(manifest.schemaVersion)||!Number.isInteger(manifest.questionCount)||manifest.questionCount<1||manifest.questionCount>150||!Array.isArray(manifest.questions)||manifest.questions.length!==manifest.questionCount||manifest.questions.some(q=>!Array.isArray(q.bubbles)||q.bubbles.length>30)||!Array.isArray(manifest.identityBubbles)||manifest.identityBubbles.length>70)throw new TypeError('Arquivo de modelo inválido ou fora dos limites.');
 const check=validateLayoutManifest(manifest);if(!check.valid)throw new TypeError(check.errors.join(' '));
 const groups=[];for(const q of manifest.questions){let g=groups.at(-1);if(!g||g.sectionId!==q.sectionId){g={sectionId:q.sectionId,label:manifest.sections.find(s=>s.sectionId===q.sectionId)?.label||'Seção',type:q.type,items:[]};groups.push(g);}g.items.push({questionId:q.questionId,number:q.number,type:q.type});}
 const template=createTemplate(groups,{templateId:manifest.templateId,revision:manifest.revision,layoutVersion:manifest.schemaVersion.endsWith('v1')?'v1':'v2',title:manifest.header.title,schoolName:manifest.header.schoolName||manifest.header.institution,identityMode:manifest.identity.mode,showName:manifest.identity.showName,mode:manifest.mode,embeddedSize:manifest.mode==='embedded'?{widthMm:manifest.paper.widthMm,heightMm:manifest.paper.heightMm}:null,metadata:manifest.header});
 // Detached JSON clone: neither UI edits nor a new layout rewrite this snapshot.
 return{template,manifest:JSON.parse(JSON.stringify(manifest))};
}
