// Real SALTA-generated cards in synthetic photos, with unchanged detector/reader.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createTemplate} from '../corretor/v2/omr/template.mjs';
import {createCardManifest,renderTemplateSvg} from '../corretor/v2/omr/render.mjs';
import {detectFiducials,warpFromFiducials} from '../corretor/v2/omr/normalize.mjs';
import {readRaster} from '../corretor/v2/omr/reader.mjs';
import {captureQuality,mapFramePoints} from '../corretor/v2/omr/camera.mjs';
import {buildManifestJson} from '../corretor/v2/omr/export.mjs';
const {default:sharp}=await import(process.env.SALTA_SHARP_MODULE?pathToFileURL(process.env.SALTA_SHARP_MODULE).href:'sharp');
const out='tmp/camera-focus-evidence';await mkdir(out,{recursive:true});
const W=1200,H=1800,code='0123456';
const cases=[['a4-v1',210,297,'v1'],['a4-v2',210,297,'v2'],['embedded-100x160',100,160,'v2'],['embedded-120x180',120,180,'v2'],['embedded-180x240',180,240,'v2'],['a4-v2-code',210,297,'v2',60,true],['embedded-180x240-code',180,240,'v2',10,true]];
const report=[];
for(const [name,w,h,version,count=10,showCode=false] of cases){
 const embedded=name.startsWith('embedded');
 const template=createTemplate([{type:'A-E',count,label:'Sintético'}],{layoutVersion:version,identityMode:showCode?'seven-digit-code':'none',...(embedded?{mode:'embedded',embeddedSize:{widthMm:w,heightMm:h}}:{})});
 const manifest=createCardManifest(template);
 const svg=renderTemplateSvg(template,{manifest}).replace(/<circle class="omr-answer-bubble"[^>]+>/g,tag=>{
   const q=tag.match(/data-question="(\d+)"/)?.[1],choice=tag.match(/data-choice="([^"]+)"/)?.[1];
   return q==='1'&&choice==='C'||q==='2'&&['A','E'].includes(choice)?tag.replace('fill="#fff"','fill="#000"'):tag;
 }).replace(/<circle class="omr-identity-bubble"[^>]+>/g,tag=>{
   const column=Number(tag.match(/data-column="(\d+)"/)?.[1]),digit=tag.match(/data-digit="(\d+)"/)?.[1];
   return showCode&&code[column-1]===digit?tag.replace('fill="#fff"','fill="#000"'):tag;
 });
 async function scene(width,blur=0){
  const height=Math.round(width*h/w);
  const card=await sharp(Buffer.from(svg)).resize(width,height,{fit:'fill'}).flatten({background:'#fff'}).png().toBuffer();
  const base=await sharp({create:{width:W,height:H,channels:3,background:'#c8c8c8'}}).composite([{input:card,left:Math.floor((W-width)/2),top:Math.floor((H-height)/2)}]).png().toBuffer();
  let image=sharp(base).greyscale();
  if(blur)image=image.blur(blur);
  return image.raw().toBuffer();
 }
 const photo=await scene(470);
 if(name==='a4-v2'){
  await writeFile(out+'/a4-v2-manifest.json',buildManifestJson(template,{manifest}));
  for(const [kind,width,blur] of [['near-blurred',780,12],['ideal',740,0]]){
   const pixels=await scene(width,blur);
   await sharp(pixels,{raw:{width:W,height:H,channels:1}}).png().toFile(out+'/'+kind+'.png');
  }
 }
 const small=await sharp(photo,{raw:{width:W,height:H,channels:1}}).resize(W/2,H/2).greyscale().raw().toBuffer();
 const preview={gray:small,width:W/2,height:H/2},full={gray:photo,width:W,height:H};
 const d=detectFiducials(small,preview.width,preview.height),f=detectFiducials(photo,W,H);
 const q=captureQuality(preview,d,preview,{captureSize:full}),final=captureQuality(full,f,full);
 const entry={name,preview:q,final,previewConfidence:d.confidence,finalConfidence:f.confidence};
 report.push(entry);
 await sharp(small,{raw:{width:W/2,height:H/2,channels:1}}).png().toFile(out+'/'+name+'-preview.png');
 await sharp(photo,{raw:{width:W,height:H,channels:1}}).png().toFile(out+'/'+name+'-capture.png');
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
 assert.ok(d.found&&f.found,name+' four actual fiducials');
 assert.ok(q.area<.18&&q.area>=.08,name+' old area gate');
 assert.equal(q.ok,true,name+' preview '+JSON.stringify(q));
 assert.equal(final.ok,true,name+' final '+JSON.stringify(final));
 const projected=mapFramePoints(d.corners,preview,full);
 assert.ok(f.corners.every((p,i)=>Math.hypot(p.x-projected[i].x,p.y-projected[i].y)<=Math.hypot(W,H)*.012),name+' final geometry');
 const n=warpFromFiducials(photo,W,H,f.corners,{outputWidth:1400,manifest:embedded?manifest:null});
 const read=readRaster(template,n.pixels,n.width,n.height,{manifest,showCode});
 if(showCode){entry.identity=read.identity;assert.equal(read.identity?.state,'read',name+' seven-digit identity');assert.equal(read.identity?.code,code,name+' seven-digit code');}
 entry.observations=read.observations.map(x=>({number:x.number,state:x.state,answer:x.answer}));
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
 assert.equal(read.observations[0].answer,'C',name+' strong mark');
 assert.notEqual(read.observations[1].state,'read',name+' double must not become a definite answer');
 assert.ok(read.observations.slice(2).every(x=>x.state==='blank'),name+' blank cards');
 console.log('CAM-FOCUS-RASTER PASS',name,'area',q.area.toFixed(3),'edge',Math.round(q.effectiveEdge),'marker',final.markerPixels);
}
