// Local capture display only: no persistence, identity assignment or aggregation.
import {scoreProvisionalPlan} from '../assessments/block-scoring.mjs';
export {scoreIntegratedPages} from '../assessments/block-scoring.mjs';

const captureToken=value=>Number.isSafeInteger(value)&&value>0||
 typeof value==='string'&&value.trim().length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);

export function scorePlanPreview(plan,observations,context={}){
 const {captureId,sessionId,page,manifest}=context;
 if(!captureToken(captureId)||!captureToken(sessionId))
  throw new TypeError('Informe a sessão e a captura atuais para a prévia local.');
 const capture=Object.freeze({captureId,sessionId,page,templateId:manifest?.templateId,
  revision:manifest?.revision,contentHash:manifest?.contentHash});
 if(page!==1)return Object.freeze({scope:'local-capture',capture,complete:false,
  provisional:true,calculable:false,bindingAllowed:false,publicationAllowed:false,
  reason:'Página ausente ou incompatível; a prévia local não agrega capturas.'});
 return Object.freeze({...scoreProvisionalPlan(plan,observations,context),scope:'local-capture',capture});
}
