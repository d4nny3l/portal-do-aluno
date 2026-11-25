// Camera policy transplanted from the frozen Scan Safe 02. No optical decisions.
// Scancat vision: Copyright (c) 2026 Nipun Batra, MIT.
// See laboratorio/salta-omr-scan-safe-02/LICENSE-SCANCAT-MIT.txt.
import {experimentalPaperDetector} from '../../../laboratorio/salta-omr-scan-safe-02/js/experimental-detector.mjs';
import {createCameraPresentation} from '../../../laboratorio/salta-omr-scan-safe-02/js/camera-presentation.mjs';
import {fullPaperVisible,addPaperMargin} from '../../../laboratorio/salta-omr-scan-safe-02/js/paper-geometry.js';
import {frameFresh,sceneSignature} from '../../../laboratorio/salta-omr-scan-safe-02/js/safe-scan.mjs';
import {createCardFlow,cardCaptured,cardReadFinished,cardNotDetected,cardDetected} from '../../../laboratorio/salta-omr-scan-safe-02/js/card-flow-safe.mjs';

export const CAMERA_POLICY=Object.freeze({STEADY_FRAMES:10,DET_W:384,LOOP_MS:66,MIN_SCORE:.22,SMOOTH:.45,MAX_SIDE:2600});
export const isWebKit=ua=>/iPhone|iPad|iPod/i.test(ua)||(/AppleWebKit/i.test(ua)&&!/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|SamsungBrowser/i.test(ua));
export const cameraConstraints=ua=>({video:{facingMode:'environment',width:{ideal:isWebKit(ua)?1920:3840},height:{ideal:isWebKit(ua)?1080:2160}},audio:false});

/** Pure frame state: no elapsed-time-only rearm, and no reset on transient loss. */
export function createPaperTracker(){
 let flow=createCardFlow(),smooth=null,stable=0,misses=99,sequence=0;
 function resetGeometry({preserveReference=false}={}){smooth=null;stable=0;misses=99;flow.absentSince=null;flow.absentFrames=0;
  // Old orientation/picker pixels cannot prove withdrawal in the new geometry.
  if(flow.phase==='locked'&&!preserveReference)flow.reference=null;
 }
 return {
  resetGeometry,finish:id=>cardReadFinished(flow,id),
  snapshot:()=>({phase:flow.phase,readDone:flow.readDone,cardId:flow.cardId,stable,misses}),
  observe(q,w,h,scene,now){
   const paper=!!(q&&q.score>=CAMERA_POLICY.MIN_SCORE&&q.corners?.length===4);
   if(flow.phase==='locked'&&flow.reference===null){
    if(paper&&fullPaperVisible(q.corners,w,h))flow.reference=scene;
    return {corners:null,stable:0,phase:'locked',message:flow.reference?'Retire a folha para continuar.':'Mostre uma folha inteira e retire-a para retomar com segurança.'};
   }
   if(!paper||!fullPaperVisible(q.corners,w,h)){
    misses++;if(misses>3){smooth=null;stable=0;}
    if(paper)cardDetected(flow);else cardNotDetected(flow,{now,scene});
    return {corners:misses>3?null:smooth,stable,phase:flow.phase,
     message:paper?'Mostre a folha inteira, com os quatro cantos visíveis.':flow.phase==='locked'?'Cartão capturado. Retire a folha para continuar.':'Procurando a folha inteira…'};
   }
   const prior=flow.phase;
   if(!cardDetected(flow))return {corners:smooth,stable:0,phase:flow.phase,message:flow.readDone?'Cartão lido. Troque a folha para continuar.':'Lendo as respostas…'};
   if(prior==='vacant'){smooth=null;stable=0;}
   misses=0;
   if(!smooth){smooth=q.corners.map(p=>[...p]);stable=0;}
   else{
    const shift=Math.max(...q.corners.map((p,i)=>Math.hypot(p[0]-smooth[i][0],p[1]-smooth[i][1])));
    smooth=smooth.map((p,i)=>p.map((n,j)=>n+(q.corners[i][j]-n)*CAMERA_POLICY.SMOOTH));
    stable=shift<.02*w?stable+1:0;
   }
   const result={corners:smooth.map(p=>[...p]),stable,phase:flow.phase,message:'Mantenha a folha estável…'};
   if(stable>=CAMERA_POLICY.STEADY_FRAMES){
    const id=++sequence;cardCaptured(flow,{scene,cardId:id});stable=0;
    result.captureId=id;result.message='Capturando cartão…';result.phase='locked';
   }
   return result;
  },
 };
}

function metadata(video,timeout=4500){
 if(video.videoWidth>0&&video.videoHeight>0)return Promise.resolve(true);
 return new Promise(resolve=>{
  let timer;const events=['loadedmetadata','loadeddata','resize','canplay'];
  const finish=ok=>{clearTimeout(timer);events.forEach(e=>video.removeEventListener(e,check));resolve(ok);};
  const check=()=>{if(video.videoWidth>0&&video.videoHeight>0)finish(true);};
  events.forEach(e=>video.addEventListener(e,check));timer=setTimeout(()=>finish(false),timeout);check();
 });
}
async function continuousFocus(track,webkit){
 if(webkit||typeof track?.getCapabilities!=='function'||typeof track?.applyConstraints!=='function')return;
 try{if(track.getCapabilities().focusMode?.includes('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]});}catch{/* Optional native focus cannot invalidate a usable stream. */}
}

export function createSafeCamera({video,preview,onCapture,onStatus=()=>{},onContour=()=>{},onState=()=>{},suspended=()=>false,
 window:win=window,document:doc=document,mediaDevices=navigator.mediaDevices,userAgent=navigator.userAgent}){
 let stream=null,opening=false,epoch=0,loopId=0,lastTick=0,busy=false,presentation=null;
 let decodedFrames=0,decodedHandle=null;
 let tracker=createPaperTracker(),clock={time:null,at:null};
 const scratch=doc.createElement('canvas'),full=doc.createElement('canvas');
 const ctx=scratch.getContext('2d',{willReadFrequently:true}),fullCtx=full.getContext('2d',{willReadFrequently:true});
 function state(){let torch=false;try{torch=!!stream?.getVideoTracks()[0]?.getCapabilities?.().torch;}catch{}
  onState({stream,opening,torch});
 }
 function stop(){
  epoch++;opening=false;win.cancelAnimationFrame(loopId);loopId=0;presentation?.stop();presentation=null;
  if(decodedHandle!==null)video.cancelVideoFrameCallback?.(decodedHandle);decodedHandle=null;decodedFrames=0;
  stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;
  scratch.width=scratch.height=full.width=full.height=0;tracker=createPaperTracker();clock={time:null,at:null};busy=false;
  onContour(null);state();
 }
 function loop(ts){
  if(!stream)return;loopId=win.requestAnimationFrame(loop);
  if(ts-lastTick<CAMERA_POLICY.LOOP_MS||doc.hidden||busy||suspended())return;lastTick=ts;
  const live=video.readyState>=2&&video.videoWidth>0&&!video.paused&&!stream.getVideoTracks()[0]?.muted;
  // currentTime advancing alone does not prove a newly decoded frame.
  const decoded=typeof video.requestVideoFrameCallback==='function'?decodedFrames:
   video.getVideoPlaybackQuality?.().totalVideoFrames??video.webkitDecodedFrameCount;
  if(!Number.isFinite(decoded)){tracker.resetGeometry();onStatus('Não foi possível confirmar novos quadros. Importe uma fotografia.');return;}
  const fresh=frameFresh(clock,decoded,ts,live&&decoded>0);
  if(fresh.reset){tracker.resetGeometry({preserveReference:true});onContour(null);}
  if(!fresh.fresh)return;
  presentation.sync('detection-frame');
  const vw=video.videoWidth,vh=video.videoHeight,w=CAMERA_POLICY.DET_W,h=Math.max(8,Math.round(vh*w/vw));
  if(scratch.width!==w||scratch.height!==h){scratch.width=w;scratch.height=h;}
  try{
   ctx.drawImage(video,0,0,w,h);const image=ctx.getImageData(0,0,w,h);
   const q=experimentalPaperDetector(image.data,w,h,{mode:'edge',misses:tracker.snapshot().misses});
   const observation=tracker.observe(q,w,h,sceneSignature(image.data,w,h),ts);
   onContour(observation.corners,w,h);onStatus(observation.message,observation);
   if(!observation.captureId)return;
   const request=epoch,id=observation.captureId;
   if(video.videoWidth!==vw||video.videoHeight!==vh){tracker.finish(id);tracker.resetGeometry();onStatus('A orientação mudou. Retire a folha e reenquadre.');return;}
   busy=true;full.width=vw;full.height=vh;fullCtx.drawImage(video,0,0,vw,vh);
   if(video.videoWidth!==vw||video.videoHeight!==vh)throw Error('A orientação mudou durante a fotografia. Retire a folha e reenquadre.');
   const photo=fullCtx.getImageData(0,0,vw,vh);
   const corners=addPaperMargin(observation.corners.map(([x,y])=>[x*vw/w,y*vh/h]),vw,vh);
   Promise.resolve(onCapture({data:photo.data,w:vw,h:vh,corners})).catch(error=>{
    if(epoch===request)onStatus(error.message||'Falha na captura. Retire a folha e tente novamente.');
   }).finally(()=>{if(epoch===request){tracker.finish(id);busy=false;full.width=full.height=0;}});
  }catch(error){
   // Failure after locking a capture must not leave readDone=false forever.
   // It also must not turn failure into permission to capture the same paper.
   if(busy){tracker.finish(tracker.snapshot().cardId);busy=false;}
   tracker.resetGeometry({preserveReference:video.videoWidth===vw&&video.videoHeight===vh});onStatus(error.message||'Quadro indisponível. Aguarde o vídeo.');
  }
 }
 async function start(){
  if(stream||opening)return;const request=++epoch;opening=true;state();
  let acquired;
  try{
   if(!mediaDevices?.getUserMedia)throw Error('A câmera exige HTTPS ou localhost e permissão do navegador.');
   try{acquired=await mediaDevices.getUserMedia(cameraConstraints(userAgent));}
   catch(error){
    if(request!==epoch)return;
    if(!['OverconstrainedError','NotFoundError','NotReadableError','AbortError'].includes(error.name))throw error;
    acquired=await mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
   }
   if(request!==epoch){acquired.getTracks().forEach(t=>t.stop());return;}
   stream=acquired;video.muted=true;video.playsInline=true;video.srcObject=stream;
   presentation=createCameraPresentation({video,preview:isWebKit(userAgent)?preview:null,window:win,document:doc,
    onDimensionsChanged:()=>{tracker.resetGeometry();clock={time:null,at:null};onContour(null);}});
   presentation.start(stream);try{video.play()?.catch(()=>{});}catch{}
   let ready=await metadata(video);
   if(!ready&&request===epoch){video.srcObject=null;video.srcObject=stream;video.play()?.catch(()=>{});ready=await metadata(video,3000);}
   if(request!==epoch)return;
   if(!ready)throw Error('A câmera foi autorizada, mas o vídeo não iniciou. Feche e abra novamente.');
   if(typeof video.requestVideoFrameCallback==='function'){
    const decoded=()=>{if(request!==epoch)return;decodedFrames++;decodedHandle=video.requestVideoFrameCallback(decoded);};
    decodedHandle=video.requestVideoFrameCallback(decoded);
   }
   const track=stream.getVideoTracks()[0];
   track.addEventListener('ended',()=>{if(epoch===request)stop();},{once:true});
   void continuousFocus(track,isWebKit(userAgent));
   opening=false;state();lastTick=0;loopId=win.requestAnimationFrame(loop);
  }catch(error){if(request===epoch){stop();onStatus(error.name==='NotAllowedError'?'Permita a câmera no navegador ou importe uma fotografia.':error.message);}}
 }
 return {start,stop,get active(){return !!stream||opening;},snapshot:()=>presentation?.snapshot()??null,
  async torch(enabled){const track=stream?.getVideoTracks()[0];
   try{if(!track?.getCapabilities?.().torch)return false;await track.applyConstraints({advanced:[{torch:!!enabled}]});return track===stream?.getVideoTracks()[0];}catch{return false;}}
 };
}
