import {structuralChange} from "./safe-scan.mjs";
export function createCardFlow(){return {phase:"ready",readDone:true,reference:null,absentSince:null,absentFrames:0,cardId:null};}
export function cardCaptured(g,{scene=null,cardId=null}={}){Object.assign(g,{phase:"locked",readDone:false,reference:scene,absentSince:null,absentFrames:0,cardId});}
export function cardReadFinished(g,id){if(g.cardId!==id||g.phase==="ready")return false;g.readDone=true;return true;}
export function cardNotDetected(g,{now=0,scene=null}={}){
 if(g.phase!=="locked")return g.phase==="vacant";
 if(!structuralChange(g.reference,scene)){g.absentSince=null;g.absentFrames=0;return false;}
 if(g.absentSince===null)g.absentSince=now;
 g.absentFrames++;
 if(g.absentFrames>=4&&now-g.absentSince>=650){g.phase="vacant";return true;}return false;
}
export function cardDetected(g){if(g.phase==="locked"){g.absentSince=null;g.absentFrames=0;return false;}
 if(g.phase==="vacant"&&g.readDone){g.phase="ready";g.absentSince=null;g.absentFrames=0;}
 return g.phase==="ready"&&g.readDone;}
