// Real browser + synthetic MediaStream. Never opens hardware or contacts SALTA services.
// SALTA_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node <this file>
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium, webkit, devices} = await import(process.env.SALTA_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = process.env.SALTA_CAMERA_OUT || '/tmp/salta-camera-presentation';
await mkdir(out, {recursive:true});
const origin = 'https://camera.test';
const lab = '/laboratorio/salta-omr-capture-lab/';
const report = {physicalDevice:false, syntheticStream:true, profiles:[]};
for (const profile of [
  {name:'iphone-webkit-edge', engine:webkit, options:devices['iPhone 13'], mode:'edge'},
  {name:'iphone-webkit-primary', engine:webkit, options:devices['iPhone 13'], mode:'primary'},
  {name:'desktop-chromium-edge', engine:chromium, options:{viewport:{width:1280,height:900}}, mode:'edge'},
]) {
  const browser = await profile.engine.launch({headless:true});
  const context = await browser.newContext({...profile.options, serviceWorkers:'block'});
  const result = {name:profile.name, samples:[], failures:[], errors:[]};
  report.profiles.push(result);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const local = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!local.startsWith(root)) return route.abort();
    try {
      const body = await readFile(local.endsWith('/') ? local+'index.html' : local);
      const contentType = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(local)] || 'application/octet-stream';
      await route.fulfill({body,contentType});
    } catch { await route.fulfill({status:404,body:'Missing test asset'}); }
  });
  await context.addInitScript(() => {
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const ctx=canvas.getContext('2d');
    let track, paper=false, blank=false;
    const fixture={canvas,opens:0,stops:0,constraints:0,events:[],streams:[]};
    function draw(){
      const w=canvas.width,h=canvas.height;
      ctx.fillStyle='#303030';ctx.fillRect(0,0,w,h);
      if(paper){ctx.fillStyle='#eee';ctx.fillRect(w*.23,h*.12,w*.54,h*.76);}
      else if(!blank) {
        ctx.strokeStyle='#aaa';ctx.lineWidth=3;
        for(let x=0;x<w;x+=w/8){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
        for(let y=0;y<h;y+=h/8){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
        ctx.fillStyle='#f0a040';ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.19,0,Math.PI*2);ctx.fill();
        for(const [x,y,c] of [[.05,.05,'#f00'],[.95,.05,'#0f0'],[.95,.95,'#00f'],[.05,.95,'#ff0']]){
          ctx.fillStyle=c;ctx.fillRect(w*x-7,h*y-7,14,14);
        }
      }
      track?.requestFrame?.();
    }
    fixture.resize=(w,h)=>{canvas.width=w;canvas.height=h;draw();};
    fixture.paper=value=>{paper=value;draw();};
    fixture.blank=()=>{paper=false;blank=true;draw();};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
      async getUserMedia(){
        fixture.opens++;
        if(!canvas.isConnected){canvas.style.cssText='position:fixed;left:0;bottom:0;width:1px;height:1px';document.body.append(canvas);}
        draw();const stream=canvas.captureStream(15);track=stream.getVideoTracks()[0];
        const stop=track.stop.bind(track);
        Object.defineProperties(track,{
          getCapabilities:{value:()=>({})},
          getSettings:{value:()=>({width:canvas.width,height:canvas.height,facingMode:'environment'})},
          applyConstraints:{value:async()=>{fixture.constraints++;}},
          stop:{value:()=>{fixture.stops++;stop();}}
        });
        fixture.streams.push(stream);return stream;
      }
    }});
    setInterval(draw,60);
    document.addEventListener('DOMContentLoaded',()=>{
      for(const e of ['loadedmetadata','resize','play','pause','emptied'])document.getElementById('video').addEventListener(e,()=>{
        const v=document.getElementById('video');fixture.events.push({event:e,width:v.videoWidth,height:v.videoHeight});
      });
    });
    window.__cameraFixture=fixture;
  });
  const page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(e.message));
  const check=(condition,message)=>{if(!condition)result.failures.push(message);};
  async function sample(label){
    const s=await page.evaluate(label=>{
      const v=document.getElementById('video'),p=document.getElementById('viewport'),o=document.getElementById('overlay');
      const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const cs=getComputedStyle(v),b=box(v),f=window.__cameraFixture;
      const scale=Math.min(b.width/v.videoWidth,b.height/v.videoHeight);
      return {label,intrinsic:{width:v.videoWidth,height:v.videoHeight},video:b,viewport:box(p),overlay:box(o),
        settings:v.srcObject?.getVideoTracks()[0]?.getSettings(),fit:cs.objectFit,position:cs.objectPosition,
        renderedImage:{width:v.videoWidth*scale,height:v.videoHeight*scale},opens:f.opens,stops:f.stops,
        sameElement:v===window.__initialVideo,sameStream:v.srcObject===window.__initialStream,
        dimensionsLabel:document.getElementById('res').textContent};
    },label);
    result.samples.push(s);
    const ratio=s.intrinsic.width/s.intrinsic.height;
    check(Math.abs(s.video.width/s.video.height/ratio-1)<.01,`${label}: video box aspect differs from intrinsic`);
    check(Math.abs(s.renderedImage.width-s.video.width)<2 && Math.abs(s.renderedImage.height-s.video.height)<2,`${label}: image shrank inside stale viewport`);
    check(Math.abs(s.overlay.width-s.video.width)<1 && Math.abs(s.overlay.height-s.video.height)<1 && Math.abs(s.overlay.x-s.video.x)<1 && Math.abs(s.overlay.y-s.video.y)<1,`${label}: overlay and video differ`);
    check(s.sameElement&&s.sameStream,`${label}: presentation replaced video or stream`);
    check(s.dimensionsLabel.startsWith(s.intrinsic.width+'×'+s.intrinsic.height),`${label}: resolution label is stale`);
    await page.screenshot({path:path.join(out,profile.name+'-'+label+'.png'),fullPage:false});
    return s;
  }
  try {
    await page.goto(origin+lab+'index.html?engine='+profile.mode+(profile.mode==='primary'?'&cameraDebug=1':''));
    await page.waitForFunction(()=>window.__saltaScan);
    await page.evaluate(()=>{window.__saltaScan.S.sound=false;window.__saltaScan.S.auto=false;});
    await page.locator('#start').dispatchEvent('click');
    await page.waitForFunction(()=>window.__saltaScan.S.running&&document.getElementById('video').readyState>=2);
    await page.evaluate(()=>{window.__initialVideo=document.getElementById('video');window.__initialStream=window.__initialVideo.srcObject;});
    await sample('initial');
    await page.evaluate(()=>{
      const s=window.__saltaScan.S;
      s.det.smooth=[[10,10],[300,10],[300,180],[10,180]];s.det.stable=9;s.det.armed=false;s.det.lost=0;
      // Pause optical work to prove presentation handles resize independently.
      s.editing=true;
      s.cardFlow.phase='locked';s.cardFlow.readDone=false;s.cardFlow.reference={valid:true,mean:0,bright:0};
      window.__originalGate=s.cardFlow;
    });
    for(const [width,height] of [[720,1280],[1440,1920],[1920,1440],[640,480],[1280,720]]){
      await page.evaluate(([w,h])=>window.__cameraFixture.resize(w,h),[width,height]);
      await page.waitForFunction(([w,h])=>{const v=document.getElementById('video');return v.videoWidth===w&&v.videoHeight===h;},[width,height]);
      await page.waitForTimeout(180);
      await sample(width+'x'+height);
      check(await page.evaluate(()=>{
        const s=window.__saltaScan.S;return s.det.smooth===null&&s.det.stable===0&&!s.det.armed&&s.cardFlow===window.__originalGate;
      }),'dimension change clears old coordinates without rearming/replacing capture gate');
    }
    await page.evaluate(()=>{window.__saltaScan.S.editing=null;});
    // Controls, tray population and Worker processing must not resize the video.
    const before=await sample('before-capture');
    for(let i=0;i<2;i++){
      const capture=page.evaluate(async()=>{
        const p=await window.__saltaScan.capture('manual');
        if(!p)return null;
        const image=await createImageBitmap(p.frame);const size={width:image.width,height:image.height};
        const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
        const ctx=c.getContext('2d');ctx.drawImage(image,0,0);image.close();
        const colors=[[.05,.05],[.95,.05],[.95,.95],[.05,.95]].map(([x,y])=>Array.from(ctx.getImageData(Math.round(x*c.width),Math.round(y*c.height),1,1).data).slice(0,3));
        return {fw:p.fw,fh:p.fh,size,colors};
      });
      await page.waitForTimeout(20);await sample('processing-'+i);
      const frame=await capture;
      check(frame?.fw===1280&&frame?.fh===720&&frame.size.width===1280&&frame.size.height===720,'capture keeps whole native frame');
      check(frame?.colors.every((rgb,i)=>rgb.reduce((delta,v,j)=>delta+Math.abs(v-[[255,0,0],[0,255,0],[0,0,255],[255,255,0]][i][j]),0)<80),'all four source edge markers survive JPEG capture without crop');
      const after=await sample('capture-'+i);
      check(Math.abs(before.video.width-after.video.width)<1&&Math.abs(before.video.height-after.video.height)<1,'capture resized video');
    }
    for(const viewport of [{width:844,height:390},{width:390,height:680},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      await page.evaluate(()=>{window.dispatchEvent(new Event('orientationchange'));window.visualViewport?.dispatchEvent(new Event('resize'));});
      await page.waitForTimeout(180);await sample('window-'+viewport.width+'x'+viewport.height);
    }
    await page.evaluate(()=>{document.getElementById('video').pause();document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(200);
    check(await page.evaluate(()=>!document.getElementById('video').paused),'visible return resumes paused playback');
    await sample('visible-return');
    check(await page.evaluate(()=>window.__cameraFixture.opens===1&&window.__cameraFixture.constraints===0),'resize/recovery must not negotiate camera');
    await page.locator('#closeCamera').dispatchEvent('click');
    check(await page.evaluate(()=>!window.__saltaScan.S.running&&!document.getElementById('video').srcObject&&window.__cameraFixture.stops===1),'close releases stream');
    check(await page.evaluate(()=>document.querySelector('#scanner .stage').getBoundingClientRect().height===0),'closed stage stays hidden');
    await page.evaluate(()=>window.__saltaScan.startCamera());
    await page.waitForFunction(()=>document.getElementById('video').readyState>=2);
    check(await page.evaluate(()=>window.__cameraFixture.opens===2),'reopen requests one new stream');
    await page.evaluate(()=>{window.__initialStream=document.getElementById('video').srcObject;});
    // Exercise the real detector, ten-frame policy, Worker and read-finished bridge.
    await page.evaluate(()=>{const s=window.__saltaScan.S;s.auto=true;window.__cameraFixture.resize(720,960);window.__cameraFixture.paper(true);});
    const pagesBefore=await page.evaluate(()=>window.__saltaScan.S.pages.length);
    await page.waitForFunction(n=>window.__saltaScan.S.pages.length===n+1,pagesBefore,{timeout:20000});
    await sample('automatic-capture');
    await page.waitForTimeout(1000);
    check(await page.evaluate(n=>window.__saltaScan.S.pages.length===n+1,pagesBefore),'one automatic capture per sheet');
    await page.evaluate(()=>window.__cameraFixture.blank());
    await page.waitForFunction(()=>window.__saltaScan.S.cardFlow.phase==='vacant',undefined,{timeout:10000});
    await page.evaluate(()=>window.__cameraFixture.paper(true));
    await page.waitForFunction(n=>window.__saltaScan.S.pages.length===n+2,pagesBefore,{timeout:20000});
    result.automaticCaptures=2;
    await sample('next-sheet');
    await page.evaluate(()=>window.__saltaScan.stopCameraView());
  } catch(error){result.failures.push(error.stack||String(error));}
  finally {
    result.events=await page.evaluate(()=>window.__cameraFixture?.events).catch(()=>[]);
    result.diagnostics=await page.evaluate(()=>window.__saltaScan?.cameraPresentation?.events).catch(()=>[]);
    check(result.errors.length===0,'page errors: '+result.errors.join('; '));
    await context.close();await browser.close();
    console.log(profile.name+': '+(result.failures.length?'FAIL '+result.failures.join('; '):'PASS'));
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
}
assert.equal(report.profiles.flatMap(p=>p.failures).length,0,'See '+path.join(out,'report.json'));
