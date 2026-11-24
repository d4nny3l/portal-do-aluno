// Real SALTA-generated cards in synthetic photos, with unchanged detector/reader.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
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
const oldSource=execFileSync('git',['show','65ca8f4286b6fbbe663e9451ed5978eea4ccb50b:corretor/v2/omr/camera.mjs']);
const {captureQuality:oldQuality}=await import('data:text/javascript;base64,'+oldSource.toString('base64'));
const report=[];
const failures=[];
const dump=()=>writeFile(out+'/report.json',JSON.stringify({synthetic:true,physicalDevices:false,report,failures},null,2));
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

 if(name==='a4-v2'){
  await writeFile(out+'/a4-v2-manifest.json',buildManifestJson(template,{manifest}));
  for(const [kind,width,blur] of [['near-blurred',780,12],['ideal',740,0]]){
   const pixels=await scene(width,blur);
   await sharp(pixels,{raw:{width:W,height:H,channels:1}}).png().toFile(out+'/'+kind+'.png');
  }
 }
 // Fixed distances: test actual generated cards on the exact same pixels in A/B.
 // 470 px represents a distant sheet. The other distances are predeclared;
 // failing detail at 470 must stay blocked, not be treated as an accepted read.
 const widths=embedded?[470,520,550,600,680]:[470,520,600,680];
 let accepted=0,acceptedAlternative=0;
 for(const width of widths){
  const photo=await scene(width);
  const height=Math.round(width*h/w);
  const markers=manifest.technicalRegions?.fiducials??[{x:8,y:8},{x:202,y:8},{x:202,y:289},{x:8,y:289}];
  const expected=markers.map(m=>({x:Math.floor((W-width)/2)+m.x*width/w,y:Math.floor((H-height)/2)+m.y*height/h}));
  const small=await sharp(photo,{raw:{width:W,height:H,channels:1}}).resize(W/2,H/2).greyscale().raw().toBuffer();
  const wideW=Math.round(W*1100/H);
  const wideGray=await sharp(photo,{raw:{width:W,height:H,channels:1}}).resize(wideW,1100).greyscale().raw().toBuffer();
  const preview={gray:small,width:W/2,height:H/2},full={gray:photo,width:W,height:H},wide={gray:wideGray,width:wideW,height:1100};
  const legacyDetection=detectFiducials(small,preview.width,preview.height);
  const options={manifest};
  const d=detectFiducials(small,preview.width,preview.height,options),f=detectFiducials(photo,W,H,options),dWide=detectFiducials(wide.gray,wide.width,wide.height,options);
  const prior=oldQuality(preview,legacyDetection,preview),q=captureQuality(preview,d,preview,{captureSize:full}),final=captureQuality(full,f,full);
  const alternativeWide=captureQuality(wide,dWide,wide,{captureSize:full});
  const maxError=(det,frame)=>det.found&&det.corners.length===4?Math.max(...det.corners.map((p,i)=>Math.hypot(p.x*W/frame.width-expected[i].x,p.y*H/frame.height-expected[i].y))):null;
  const entry={name,width,expected,legacy:prior,legacyCorners:legacyDetection.corners,legacyErrorPx:maxError(legacyDetection,preview),preview:q,final,preview1100:alternativeWide,previewErrorPx:maxError(d,preview),finalErrorPx:maxError(f,full),preview1100ErrorPx:maxError(dWide,wide),previewConfidence:d.confidence,finalConfidence:f.confidence,previewCorners:d.corners,finalCorners:f.corners};
  report.push(entry);
  if(width===470){
   await sharp(small,{raw:{width:W/2,height:H/2,channels:1}}).png().toFile(out+'/'+name+'-preview.png');
   await sharp(photo,{raw:{width:W,height:H,channels:1}}).png().toFile(out+'/'+name+'-capture.png');
  }
  const candidate=q.ok&&final.ok;
  if(candidate){
   try{
    const projected=mapFramePoints(d.corners,preview,full);
    assert.ok(f.corners.every((p,i)=>Math.hypot(p.x-projected[i].x,p.y-projected[i].y)<=Math.hypot(W,H)*.012),name+' final geometry');
    const tolerance=Math.max(7,width*.02);
    assert.ok(entry.previewErrorPx<=tolerance&&entry.finalErrorPx<=tolerance,name+' actual marker correspondence');
    const n=warpFromFiducials(photo,W,H,f.corners,{outputWidth:1400,manifest:embedded?manifest:null});
    const read=readRaster(template,n.pixels,n.width,n.height,{manifest,showCode});
    if(showCode){
     entry.identity=read.identity;
     assert.equal(read.identity?.state,'read',name+' seven-digit identity');
     assert.equal(read.identity?.code,code,name+' seven-digit code');
    }
    entry.observations=read.observations.map(x=>({number:x.number,state:x.state,answer:x.answer}));
    assert.equal(read.observations[0].answer,'C',name+' strong mark');
    assert.notEqual(read.observations[1].state,'read',name+' double must not become a definite answer');
    assert.ok(read.observations.slice(2).every(x=>x.state==='blank'),name+' blank cards');
    accepted++;
    if(!prior.ok&&q.area<.18)acceptedAlternative++;
    entry.result='accepted-and-verified';
    if(accepted===1&&width!==470)await sharp(photo,{raw:{width:W,height:H,channels:1}}).png().toFile(out+'/'+name+'-accepted.png');
   }catch(e){entry.result='unsafe-or-incomplete';entry.error=e.message;failures.push(name+'/'+width+': '+e.message)}
  }else entry.result='blocked-by-quality';
  console.log('CAM-FOCUS-RASTER',name,width,entry.result,JSON.stringify({area:q.area,prior:prior.ok,preview:q.ok,final:final.ok,preview1100:alternativeWide.ok,edge:q.effectiveEdge,marker:q.markerPixels,errors:[entry.previewErrorPx,entry.finalErrorPx,entry.preview1100ErrorPx],reason:q.ok?final.message:q.message,readError:entry.error}));
  await dump();
 }
 if(!accepted)failures.push(name+': no eligible and verified source at any predefined distance');
 if(['a4-v1','a4-v2'].includes(name)&&!acceptedAlternative)failures.push(name+': no proven sharp alternative below 18%');
}
await dump();
assert.deepEqual(failures,[],'No accepted frame may misread or use the wrong fiducials, and each format must have a verified usable distance');
