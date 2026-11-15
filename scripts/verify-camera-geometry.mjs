// Synthetic camera projections only. The radial coefficient below belongs to the
// generated fixture; it is NEVER exported to a camera or used as a device profile.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {calibrationSvg,calibrationMetrics} from '../corretor/v2/omr/camera-calibration.mjs';
import {warpFromFiducials,detectFiducials,normalizeCard} from '../corretor/v2/omr/normalize.mjs';
import {readRaster} from '../corretor/v2/omr/reader.mjs';
import {captureQuality,mapFramePoints} from '../corretor/v2/omr/camera.mjs';
import {createTemplate} from '../corretor/v2/omr/template.mjs';
import {renderTemplateSvg,createCardManifest} from '../corretor/v2/omr/render.mjs';
const {default:sharp}=await import(process.env.SALTA_SHARP_MODULE?pathToFileURL(process.env.SALTA_SHARP_MODULE).href:'sharp');
const out=process.env.SALTA_CAMERA_EVIDENCE_DIR||'tmp/camera-evidence';await mkdir(out,{recursive:true});
const W=630,H=891,pw=900,ph=1000,svg=calibrationSvg();
await writeFile(`${out}/calibration.svg`,svg);
const target=await sharp(Buffer.from(svg)).resize(W,H).flatten({background:'#fff'}).greyscale().raw().toBuffer();
await sharp(target,{raw:{width:W,height:H,channels:1}}).png().toFile(`${out}/reference.png`);
const project=(x,y)=>{const d=.0002*x+.0001*y+1;return {x:(.78*x+.12*y+140)/d,y:(.02*x+.85*y+130)/d}};
const distort=(p,k)=>{const x=(p.x-pw/2)/pw,y=(p.y-ph/2)/pw,f=1+k*(x*x+y*y);return {x:pw/2+x*pw*f,y:ph/2+y*pw*f}};
const bilinear=(image,width,height,x,y)=>{if(x<0||y<0||x>=width-1||y>=height-1)return 245;const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;return Math.round((image[iy*width+ix]*(1-dx)+image[iy*width+ix+1]*dx)*(1-dy)+(image[(iy+1)*width+ix]*(1-dx)+image[(iy+1)*width+ix+1]*dx)*dy)};
function photograph(target,k=0,scale=1){
 const pixels=new Uint8Array(pw*scale*ph*scale).fill(245);
 for(let vy=0;vy<ph*scale;vy++)for(let ux=0;ux<pw*scale;ux++){
  const u=ux/scale,v=vy/scale;let px=u,py=v;
  for(let n=0;n<12&&k;n++){const d=distort({x:px,y:py},k);px+=u-d.x;py+=v-d.y;}
  const a=.78-.0002*px,b=.12-.0001*px,c=px-140,d=.02-.0002*py,e=.85-.0001*py,f=py-130,det=a*e-b*d;
  pixels[vy*pw*scale+ux]=bilinear(target,W*scale,H*scale,(c*e-b*f)/det*scale,(a*f-c*d)/det*scale);
 }
 return pixels;
}
const results=[];
for(const [name,k] of [['perspective',0],['radial-synthetic',.45]]){
 const pixels=photograph(target,k);
 const corners=[[8,8],[202,8],[202,289],[8,289]].map(([x,y])=>distort(project(x*3,y*3),k));
 const normalized=warpFromFiducials(pixels,pw,ph,corners,{outputWidth:W});
 const metrics=calibrationMetrics(normalized.pixels,normalized.width,normalized.height);
 const automatic=normalizeCard(pixels,pw,ph,{outputWidth:1400});
 const autoMetrics=calibrationMetrics(automatic.pixels,automatic.width,automatic.height);
 if(!k){assert.ok(autoMetrics.maxCurvatureMm<.3);assert.ok(autoMetrics.maxOffsetMm<.5);}
 results.push({name,fixtureRadialCoefficient:k,metrics,automaticMetrics:autoMetrics,source:[pw,ph],normalized:[normalized.width,normalized.height]});
 await sharp(pixels,{raw:{width:pw,height:ph,channels:1}}).png().toFile(`${out}/${name}-original.png`);
 await sharp(normalized.pixels,{raw:{width:W,height:H,channels:1}}).png().toFile(`${out}/${name}-normalized.png`);
 assert.equal(normalized.height,H);assert.equal(metrics.lensCorrection,false);
}
assert.ok(results[0].metrics.maxCurvatureMm<.25,'perspective must straighten the grid');
assert.ok(results[0].metrics.maxOffsetMm<.4,'perspective must restore grid positions');
assert.ok(results[1].metrics.maxCurvatureMm>results[0].metrics.maxCurvatureMm+.25,'radial fixture must remain visibly curved after homography');
// Valid low-ink and dense cards must remain eligible under the camera quality gate.
const quality=[];
for(const version of ['v1','v2'])for(const count of [10,20,50,100,150]){
 const template=createTemplate([{type:'A-E',count,label:'Sintético'}],{layoutVersion:version});
 const gray=await sharp(Buffer.from(renderTemplateSvg(template))).resize(636,900).flatten({background:'#fff'}).greyscale().raw().toBuffer();
 const frame={gray,width:636,height:900},detection=detectFiducials(gray,636,900),result=captureQuality(frame,detection,frame);
 quality.push({version,count,...result});assert.equal(result.ok,true,`${version}/${count}: ${result.message}`);
 const manifest=createCardManifest(template);
 const marked=renderTemplateSvg(template,{manifest}).replace(/<circle class="omr-answer-bubble"[^>]+>/g,tag=>tag.includes('data-question="1"')&&tag.includes('data-choice="C"')?tag.replace('fill="#fff"','fill="#000"'):tag);
 const raster=await sharp(Buffer.from(marked)).resize(W*2,H*2).flatten({background:'#fff'}).greyscale().raw().toBuffer();
 const photo=await sharp(photograph(raster,0,2),{raw:{width:pw*2,height:ph*2,channels:1}}).resize(1620,1800).greyscale().raw().toBuffer();
 const previewGray=await sharp(photo,{raw:{width:1620,height:1800,channels:1}}).resize(810,900).greyscale().raw().toBuffer();
 const detected=detectFiducials(previewGray,810,900);assert.equal(detected.found,true);
 const normalized=warpFromFiducials(photo,1620,1800,mapFramePoints(detected.corners,{width:810,height:900},{width:1620,height:1800}),{outputWidth:1400});
 const read=readRaster(template,normalized.pixels,normalized.width,normalized.height,{manifest});
 assert.equal(read.observations[0].answer,'C',`${version}/${count}: normalized answer changed`);
 assert.ok(read.observations.slice(1).every(o=>o.state==='blank'),`${version}/${count}: false mark after perspective`);
 quality.at(-1).normalizedAnswer='C';
}
await writeFile(`${out}/results.json`,JSON.stringify({projections:results,quality},null,2));
await writeFile(`${out}/comparison.html`,`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SALTA — evidências sintéticas da câmera</title><style>body{font:16px system-ui;max-width:1100px;margin:auto;padding:20px}section{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{max-width:100%;height:auto;border:1px solid #bbb}pre{white-space:pre-wrap}@media(max-width:600px){section{grid-template-columns:1fr}}</style><h1>Câmera OMR: perspectiva e lente</h1><p>Somente dados sintéticos. Homografia existente, sem correção óptica. Calibração física do iPhone 17 Pro/Safari pendente.</p>${results.map(r=>`<h2>${r.name}</h2><section><figure><figcaption>Original sintética — quadro inteiro</figcaption><img src="${r.name}-original.png"></figure><figure><figcaption>Normalizada por quatro marcadores</figcaption><img src="${r.name}-normalized.png"></figure></section><p>Curvatura residual: ${r.metrics.maxCurvatureMm.toFixed(3)} mm; posição: ${r.metrics.maxOffsetMm.toFixed(3)} mm.</p>`).join('')}`);
console.log(JSON.stringify({projections:results.map(r=>({name:r.name,curvatureMm:r.metrics.maxCurvatureMm,offsetMm:r.metrics.maxOffsetMm})),validCards:quality.length}));
