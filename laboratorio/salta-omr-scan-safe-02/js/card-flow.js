/* SALTA OMR Capture Lab — guardião de cartões (fluxo contínuo).
 * Cada folha gera UMA captura. Quedas temporárias do detector não rearmam.
 * Só uma mudança real de cena sem folha libera a próxima captura;
 * leitura OMR anterior precisa ter terminado, sem exigir botão do professor.
 */
export function cameraScene(rgba,w,h){
  if(!rgba||rgba.length!==w*h*4||w<16||h<16)
    return {mean:0,bright:0,valid:false};
  const stepX=Math.max(1,Math.floor(w/32)),stepY=Math.max(1,Math.floor(h/40));
  let n=0,sum=0,high=0;
  for(let y=Math.floor(stepY/2);y<h;y+=stepY){
    for(let x=Math.floor(stepX/2);x<w;x+=stepX){
      const i=(y*w+x)*4;
      const l=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)/256;
      sum+=l;high+=l>150?1:0;n++;
    }
  }
  return {mean:sum/n,bright:high/n,valid:true};
}
export function changedScene(a,b){
  if(!a?.valid||!b?.valid)return false;
  return Math.abs(a.mean-b.mean)>=20||
    Math.abs(a.bright-b.bright)>=.24;
}
export function createCardFlow(){
  return {phase:"ready",readDone:true,reference:null,absentSince:0,
    absentFrames:0,cardId:null,lastCaptureAt:0,clearEvidence:false};
}
export function cardCaptured(gate,{scene=null,cardId=null,now=0}={}){
  gate.phase="locked";
  gate.readDone=false;
  gate.reference=scene;
  gate.absentSince=0;
  gate.absentFrames=0;
  gate.cardId=cardId;
  gate.lastCaptureAt=now;
  gate.clearEvidence=false;
}
export function cardReadFinished(gate,cardId){
  if(gate.cardId!==cardId||gate.phase==="ready")return false;
  gate.readDone=true;
  return true;
}
export function cardNotDetected(gate,{now=0,scene=null}={}){
  if(gate.phase!=="locked")return gate.phase==="vacant";
  if(!gate.absentSince)gate.absentSince=now;
  gate.absentFrames++;
  const ms=now-gate.absentSince;
  const clear=changedScene(gate.reference,scene);
  if(clear)gate.clearEvidence=true;
  // A câmera pode perder foco por vários quadros: AUSÊNCIA e mudança visual
  // precisam coincidir. Não há cooldown de relógio depois da nova folha.
  if(gate.absentFrames>=4&&
     ((ms>=550&&gate.clearEvidence)||
      (ms>=1400&&clear))){
    gate.phase="vacant";
    return true;
  }
  return false;
}
export function cardDetected(gate){
  if(gate.phase==="locked"){
    gate.absentSince=0;gate.absentFrames=0;gate.clearEvidence=false;
    return false;
  }
  if(gate.phase==="vacant" && gate.readDone){
    gate.phase="ready";
    gate.absentSince=0;gate.absentFrames=0;gate.clearEvidence=false;
  }
  return gate.phase==="ready"&&gate.readDone;
}
