// Run with SALTA_SHARP_MODULE pointing at a pinned sharp installation.
// No camera, browser, account, academic records or remote API are involved.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createTemplate } from '../corretor/v2/omr/template.mjs';
import { renderTemplateSvg, createCardManifest, DEFAULT_CARD_HEADER } from '../corretor/v2/omr/render.mjs';
import { readRaster } from '../corretor/v2/omr/reader.mjs';
import { detectFiducials } from '../corretor/v2/omr/normalize.mjs';
const { default: sharp } = await import(process.env.SALTA_SHARP_MODULE ? pathToFileURL(process.env.SALTA_SHARP_MODULE).href : 'sharp');
const output = process.env.SALTA_EVIDENCE_DIR || 'tmp/card-artwork-evidence';
await mkdir(output, { recursive: true });
const header = { ...DEFAULT_CARD_HEADER, institution: 'ESCOLA SINTÉTICA SALTA', title: 'AVALIAÇÃO DE MATEMÁTICA', className: '1º SEMESTRE EJA — TURMA FICTÍCIA', date: '2026-12-01', visible: { ...DEFAULT_CARD_HEADER.visible, className: true, date: true } };
const width = Math.round(210 / 25.4 * 300), height = Math.round(297 / 25.4 * 300);
const raster = svg => sharp(Buffer.from(svg), { density: 96 }).resize({ width, height, fit: 'fill' }).flatten({ background: '#fff' });
const results = [];
for (const type of ['A-D', 'A-E', 'C-E']) for (const count of [10, 20, 50, 100, 150]) {
  const template = createTemplate([{ type, count, label: 'Matemática' }]);
  const manifest = createCardManifest(template, header);
  const svg = renderTemplateSvg(template, { header, manifest });
  const pixels = await raster(svg).greyscale().raw().toBuffer();
  const blank = readRaster(template, pixels, width, height, {manifest});
  assert.ok(blank.observations.every(item => item.state === 'blank'), `${type}/${count}: false mark`);
  assert.equal(detectFiducials(pixels, width, height).found, true, `${type}/${count}: lost fiducials`);
  const selected = svg.replace(/<circle class="omr-answer-bubble"[^>]+>/g, tag => tag.includes('data-question="1"') && tag.includes('data-choice="C"') ? tag.replace('fill="#fff"', 'fill="#000"') : tag);
  const marked = readRaster(template, await raster(selected).greyscale().raw().toBuffer(), width, height, {manifest});
  assert.equal(marked.observations[0].answer, 'C');
  results.push({ type, count, width, height, falseMarks: 0, selected: 'C', fiducials: true });
  if (type === 'A-E' && [20, 50, 100].includes(count)) {
    const prefix = `${output}/A-E-${count}`;
    await writeFile(`${prefix}.svg`, svg);
    await writeFile(`${prefix}.manifest.json`, JSON.stringify(createCardManifest(template, header), null, 2));
    await raster(svg).png().withMetadata({ density: 300 }).toFile(`${prefix}.png`);
    await raster(svg).jpeg({ quality: 95 }).withMetadata({ density: 300 }).toFile(`${prefix}.jpg`);
    const jpeg = await sharp(`${prefix}.jpg`).greyscale().raw().toBuffer();
    assert.ok(readRaster(template, jpeg, width, height, {manifest}).observations.every(item => item.state === 'blank'), 'JPEG introduced a mark');
  }
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length} rendered cards at 300 DPI: blank/marked/fiducials OK; PNG/JPG 20/50/100 OK.`);

// Header variants use an original synthetic emblem, never a school's logo.
const logo = `data:image/png;base64,${(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect x="4" y="4" width="72" height="72" rx="12" fill="none" stroke="black" stroke-width="4"/><path d="M55 22H32L25 31L53 48L45 58H22" fill="none" stroke="black" stroke-width="7"/></svg>')).png().toBuffer()).toString('base64')}`;
const variants = [
  { name: 'um-logo', options: {}, sections: [{type:'A-E',count:20,label:'Matemática'}], header: {...header, layout:'logo-left',logo} },
  { name: 'dois-logos', options: {}, sections: [{type:'A-E',count:20,label:'Matemática'}], header: {...header, layout:'dual-logo',logo,secondaryLogo:logo} },
  { name: 'compacto', options: {}, sections: [{type:'A-D',count:20,label:'Matemática'}], header: {...header,layout:'compact'} },
  { name: 'misto-desigual', options: {}, sections: [{type:'A-D',count:7,label:'Álgebra'},{type:'C-E',count:3,label:'Lógica'},{type:'A-E',count:19,label:'Geometria'}], header },
  { name: 'misto-cdu', options: {}, sections: [{type:'A-E',count:20,label:'Objetivas'},{type:'CDU',count:2,label:'Numéricas'}], header },
  { name: 'incorporado', options: {mode:'embedded',embeddedSize:{widthMm:100,heightMm:180},identityMode:'manual'}, sections:[{type:'A-D',count:10,label:'Matemática'}], header: DEFAULT_CARD_HEADER },
];
for (const variant of variants) {
  const template=createTemplate(variant.sections,variant.options);
  const svg=renderTemplateSvg(template,{header:variant.header});
  const manifest=createCardManifest(template,variant.header);
  await writeFile(`${output}/${variant.name}.svg`,svg);
  if (manifest.mode==='embedded') continue; // Normalizer is A4-only; do not pretend embedded scanning works.
  const pixels=await raster(svg).greyscale().raw().toBuffer();
  const detection=detectFiducials(pixels,width,height);
  assert.equal(detection.found,true,`${variant.name}: fiducials`);
  for(const [index,[x,y]] of [[8,8],[202,8],[202,289],[8,289]].entries()) {
    assert.ok(Math.abs(detection.corners[index].x-x/210*width)<3,`${variant.name}: marker x`);
    assert.ok(Math.abs(detection.corners[index].y-y/297*height)<3,`${variant.name}: marker y`);
  }
  if(!variant.sections.some(section=>section.type==='CDU')) assert.ok(readRaster(template,pixels,width,height,{manifest}).observations.every(item=>item.state==='blank'));
  await raster(svg).png().withMetadata({density:300}).toFile(`${output}/${variant.name}.png`);
}
console.log('Single/dual synthetic logos, compact header, mixed CDU and embedded SVG OK.');

const coverage=[];
for(const identityMode of ['manual','none','seven-digit-code'])for(const institution of ['', 'ESCOLA FICTÍCIA SALTA', 'SECRETARIA SINTÉTICA\nESCOLA FICTÍCIA SALTA'])for(const showInstructions of [false,true]){
 const t=createTemplate([{type:'A-E',count:20,label:'Matemática'}],{identityMode});const h={...header,institution,showInstructions};const m=createCardManifest(t,h);const svg=renderTemplateSvg(t,{manifest:m});
 const pixels=await raster(svg).greyscale().raw().toBuffer();const result=readRaster(t,pixels,width,height,{manifest:m});assert.ok(result.observations.every(o=>o.state==='blank'));assert.equal(result.identity.code,null);
 coverage.push({identityMode,institutionLines:institution?institution.split('\n').length:0,showInstructions,blank:true,hash:m.contentHash});
}
const nominal=createTemplate([{type:'A-E',count:20,label:'Matemática'}],{student:{name:'Pessoa Fictícia de Nome Extenso para Teste',className:'Turma Fictícia',code:'0001200'}});
const nominalManifest=createCardManifest(nominal,header),nominalSvg=renderTemplateSvg(nominal,{manifest:nominalManifest});
const nominalRaster=await raster(nominalSvg).greyscale().raw().toBuffer();assert.equal(readRaster(nominal,nominalRaster,width,height,{manifest:nominalManifest}).identity.code,'0001200');
for(const [variant,color,expected]of [['double','#000','double'],['weak','#b4b4b4','blank']]){
 const markedSvg=nominalSvg.replace(/<circle class="omr-answer-bubble"[^>]+>/g,tag=>tag.includes('data-question="1"')&&(tag.includes('data-choice="C"')||(variant==='double'&&tag.includes('data-choice="D"')))?tag.replace('fill="#fff"',`fill="${color}"`):tag);
 const pixels=await raster(markedSvg).greyscale().raw().toBuffer();const result=readRaster(nominal,pixels,width,height,{manifest:nominalManifest});assert.equal(result.observations[0].state,expected);assert.equal(result.needsReview,true);
 coverage.push({variant,state:result.observations[0].state,needsReview:result.needsReview});
 await raster(markedSvg).png().withMetadata({density:300}).toFile(`${output}/${variant}.png`);
}
await writeFile(`${output}/coverage-v2.json`,JSON.stringify(coverage,null,2));
console.log('18 identity/institution/instructions combinations + nominal code 0001200 + double/weak review OK.');
