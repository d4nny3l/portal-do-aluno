// Offline only. Synthetic SVGs from the official renderer, never student images.
import {createTemplate,createLegacyTemplate} from '../../omr/template.mjs';
import {createCardManifest,renderTemplateSvg} from '../../omr/render.mjs';

export const SYNTHETIC_CODE='0001123';
export const CORPUS_VERSION='scan-safe-labelled-synthetic-v1';
const mark=(choice,ink=25,extra={})=>({choice,ink,...extra});
export const CASES=Object.freeze([
 {id:'moderate-A',tags:['A moderado'],marks:[mark('A',130)]},
 {id:'moderate-AB',tags:['A+B','dupla'],marks:[mark('A',65),mark('B',95)]},
 {id:'strong-black',tags:['preto'],marks:[mark('A')]},
 {id:'weak-A',tags:['fraca'],marks:[mark('A',170,{irregular:true})]},
 {id:'very-pale-A',tags:['fraca','abaixo do limiar'],marks:[mark('A',195)]},
 {id:'double-weak',tags:['fraca','dupla'],marks:[mark('A',135),mark('B',145)]},
 {id:'blank',tags:['branca'],marks:[]},
 {id:'erasure-AB',tags:['rasura','dupla'],marks:[mark('A',165,{irregular:true}),mark('B',40)],expectedReview:true},
 {id:'shadow-moderate',tags:['sombra','A moderado'],marks:[mark('A',130)],effect:'shadow'},
 {id:'shadow-blank',tags:['sombra','branca'],marks:[],effect:'shadow'},
 ...[110,130,150].map(ink=>({id:`shadow-AB-${ink}`,tags:['sombra','dupla'],marks:[mark('A',60),mark('B',ink)],effect:'shadow'})),
 {id:'reflection-A',tags:['reflexo'],marks:[mark('A',40)],effect:'reflection'},
 {id:'blue-offset',tags:['azul'],marks:[mark('C',[40,75,190],{dx:.35,dy:-.2})]},
 {id:'pencil',tags:['lápis','fraca'],marks:[mark('D',130,{irregular:true})]},
 {id:'CE-strong',tags:['C-E'],type:'C-E',marks:[mark('E',25)]},
 {id:'CE-double',tags:['C-E','dupla'],type:'C-E',marks:[mark('C',80),mark('E',110)]},
 {id:'AD-20',tags:['A-D','20'],type:'A-D',count:20,marks:[mark('D',30)]},
 {id:'AE-60',tags:['A-E','60'],count:60,marks:[mark('E',30)]},
 {id:'AE-100',tags:['A-E','100'],count:100,marks:[mark('B',30)]},
 {id:'CE-150',tags:['C-E','limite 150'],type:'C-E',count:150,marks:[mark('C',25)]},
 {id:'V1-A',tags:['V1'],version:'v1',marks:[mark('A',130)]},
 {id:'V1-AB',tags:['V1','dupla'],version:'v1',marks:[mark('A',65),mark('B',95)]},
 {id:'embedded-A',tags:['embedded','V2'],embedded:true,marks:[mark('A',130)]},
 {id:'embedded-AB',tags:['embedded','V2','dupla'],embedded:true,marks:[mark('A',65),mark('B',95)]},
 {id:'identity-pending',tags:['identificação ilegível','fraca'],identityPending:true,marks:[mark('A',130)]},
 ...[90,110,125,140,155,170,185].map(ink=>({id:`contrast-A-${ink}`,tags:['varredura de contraste'],marks:[mark('A',ink)]})),
 ...[110,130,150,170,185].map(ink=>({id:`contrast-AB-${ink}`,tags:['varredura de contraste','dupla'],marks:[mark('A',60),mark('B',ink)]})),
 ...[96,98,100,102,104,106,108].map(ink=>({id:`threshold-AB-${ink}`,tags:['fronteira de contraste','dupla'],marks:[mark('A',60),mark('B',ink)]})),
]);

export function modelFor(spec){
 const options={student:{code:SYNTHETIC_CODE},title:'ENSAIO SINTÉTICO',
  ...(spec.embedded?{mode:'embedded',embeddedSize:{widthMm:180,heightMm:240},columnCount:2}:{}),
 };
 const template=(spec.version==='v1'?createLegacyTemplate:createTemplate)([{type:spec.type||'A-E',count:spec.count||10,label:'SINTÉTICO'}],options);
 return {template,manifest:createCardManifest(template,null,{sectionFrameStyle:'content'})};
}

// Rounding is left to the SVG rasterizer, including outlines and printed letters.
export function svgFor(spec,model=modelFor(spec)){
 const {template,manifest}=model;
 let svg=renderTemplateSvg(template,{manifest});
 if(spec.identityPending)svg=svg.replace(/(<circle class="omr-identity-bubble"[^>]*fill=")#000("[^>]*>)/g,'$1#fff$2');
 const q=manifest.questions[0];
 const strokes=(spec.marks||[]).map(m=>{
  const b=q.bubbles.find(b=>b.choice===m.choice);
  if(!b)throw new Error(`Choice ${m.choice} absent from ${spec.id}`);
  const color=Array.isArray(m.ink)?`rgb(${m.ink.join(',')})`:`rgb(${m.ink},${m.ink},${m.ink})`;
  const x=b.x+(m.dx||0),y=b.y+(m.dy||0),r=b.radiusMm*.84;
  // Irregular fill has a real, labelled mark with an unfilled notch.
  return m.irregular?`<path d="M ${x-r} ${y} A ${r} ${r} 0 1 0 ${x} ${y-r} L ${x-.25} ${y-.25} Z" fill="${color}"/>`:
   `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
 }).join('');
 return svg.replace('</svg>',`${strokes}</svg>`);
}

export function truthFor(spec,model=modelFor(spec)){
 return model.template.questions.map((q,i)=>{
  const marks=i===0?(spec.marks||[]).map(m=>m.choice).sort():[];
  return {questionId:q.questionId,number:q.number,marks,
   state:marks.length===0?'blank':marks.length===1?'read':'double',
   answer:marks.length===1?marks[0]:null,requiresReview:i===0&&Boolean(spec.expectedReview)};
 });
}

export function applyEffect(rgba,width,height,spec,manifest){
 if(!spec.effect)return rgba;
 const out=new Uint8ClampedArray(rgba),b=manifest.questions[0].bubbles[0];
 const cx=b.x*width/manifest.paper.widthMm,cy=b.y*height/manifest.paper.heightMm;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  if(spec.effect==='shadow'){
   const factor=.52+.48*Math.min(1,Math.abs(x-cx)/(width*.42));
   for(let k=0;k<3;k++)out[i+k]=Math.round(out[i+k]*factor);
  }else if(spec.effect==='reflection'){
   const strength=.88*Math.exp(-((x-cx)**2+(y-cy)**2)/(2*(width*.018)**2));
   for(let k=0;k<3;k++)out[i+k]=Math.round(out[i+k]+(255-out[i+k])*strength);
  }
 }
 return out;
}
