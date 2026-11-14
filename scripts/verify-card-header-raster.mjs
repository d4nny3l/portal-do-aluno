// Original, synthetic emblems only. No accounts, browser or academic records.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createTemplate} from '../corretor/v2/omr/template.mjs';
import {createCardManifest,renderTemplateSvg,DEFAULT_CARD_HEADER} from '../corretor/v2/omr/render.mjs';
import {readRaster} from '../corretor/v2/omr/reader.mjs';
import {detectFiducials} from '../corretor/v2/omr/normalize.mjs';
const {default:sharp}=await import(process.env.SALTA_SHARP_MODULE?pathToFileURL(process.env.SALTA_SHARP_MODULE).href:'sharp');
const out=process.env.SALTA_HEADER_EVIDENCE_DIR||'tmp/card-artwork-evidence/header';await mkdir(out,{recursive:true});
const template=createTemplate([{type:'A-E',count:20,label:'Matemática'}]);
const base={...DEFAULT_CARD_HEADER,institution:'SECRETARIA SINTÉTICA\nESCOLA FICTÍCIA SALTA',teacher:'Docente Fictício',className:'2ª A',date:'2026-12-01',grade:'2ª série',schoolYear:'2026',customFields:[{label:'Sala',value:'201'},{label:'Turno',value:'Manhã'}],visible:{...DEFAULT_CARD_HEADER.visible,grade:true,schoolYear:true}};
const images={};
for(const [name,w,h] of [['quadrado',120,120],['vertical',60,240],['horizontal',240,60]]){
 const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="${w*.1}" y="${h*.1}" width="${w*.8}" height="${h*.35}" rx="${Math.min(w,h)*.04}" fill="#d2d2d2" opacity=".6"/><rect x="${w*.1}" y="${h*.55}" width="${w*.8}" height="${h*.35}" fill="#909090"/><path d="M${w*.15},${h*.5}L${w*.5},${h*.2}L${w*.85},${h*.5}L${w*.5},${h*.8}Z" stroke="#303030" stroke-width="${Math.min(w,h)*.015}" fill="none"/></svg>`;
 const png=await sharp(Buffer.from(source)).png().toBuffer();await writeFile(`${out}/original-${name}.png`,png);
 images[name]={data:`data:image/png;base64,${png.toString('base64')}`,aspect:w/h};
}
const results=[];const W=2480,H=3508;
for(const [name,left,right] of [['quadrado','quadrado',null],['vertical','vertical',null],['horizontal','horizontal',null],['dois-logos','vertical','horizontal']]){
 const h={...base,logo:images[left].data,logoAspect:images[left].aspect,...(right?{secondaryLogo:images[right].data,secondaryLogoAspect:images[right].aspect}:{})};
 const m=createCardManifest(template,h),svg=renderTemplateSvg(template,{manifest:m});
 const png=await sharp(Buffer.from(svg),{density:96}).resize(W,H).flatten({background:'#fff'}).png().withMetadata({density:300}).toBuffer();
 await writeFile(`${out}/${name}.svg`,svg);await writeFile(`${out}/${name}.png`,png);await writeFile(`${out}/${name}.json`,JSON.stringify(m,null,2));
 const gray=await sharp(png).greyscale().raw().toBuffer();
 const sample=(l,x,y)=>gray[Math.round((l.y+l.height*y)/297*H)*W+Math.round((l.x+l.width*x)/210*W)];
 const samples=m.panels.header.logos.map(l=>({transparent:sample(l,.03,.03),light:sample(l,.25,.25),medium:sample(l,.25,.75)}));
 for(const s of samples){assert.ok(s.transparent>=250,`${name}: transparent background darkened`);assert.ok(Math.abs(s.light-228)<=4,`${name}: light/alpha detail lost: ${s.light}`);assert.ok(Math.abs(s.medium-144)<=4,`${name}: intermediate detail lost: ${s.medium}`);}
 assert.ok(readRaster(template,gray,W,H,{manifest:m}).observations.every(o=>o.state==='blank'),`${name}: blank card false mark`);
 const markers=detectFiducials(gray,W,H);assert.equal(markers.found,true);
 const marked=svg.replace(/<circle class="omr-answer-bubble"[^>]+>/g,tag=>tag.includes('data-question="1"')&&tag.includes('data-choice="C"')?tag.replace('fill="#fff"','fill="#000"'):tag);
 const dark=await sharp(Buffer.from(marked),{density:96}).resize(W,H).flatten({background:'#fff'}).greyscale().raw().toBuffer();
 assert.equal(readRaster(template,dark,W,H,{manifest:m}).observations[0].answer,'C');
 results.push({name,samples,bandFields:m.panels.header.adminBand.cells.length,headerBottom:m.panels.header.end,bodyTop:m.contentBoundsMm.y,falseMarks:0,filled:'C',fiducials:4});
}
await writeFile(`${out}/header-results.json`,JSON.stringify(results,null,2));
console.log('Header raster: square/vertical/horizontal/dual; alpha, soft gray, seven fields, blank/filled and fiducials OK.');
