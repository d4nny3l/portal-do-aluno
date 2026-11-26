// Only metadata survives between cards. A capture is bound to one model/page/session.
export function createCaptureSession(){
 let sessionId=1,captureId=0,current=null;
 return {
  invalidate(){sessionId++;current=null;},
  cancelCurrent(){current=null;},
  begin(template,manifest,page){
   if(!template||manifest?.templateId!==template.templateId||manifest.revision!==template.revision||
    !Number.isSafeInteger(page)||page<1||page>template.pageCount)throw Error('Confirme o modelo e a página antes de capturar.');
   current=Object.freeze({sessionId,captureId:++captureId,templateId:template.templateId,
    templateRevision:template.revision,contentHash:manifest.contentHash,page});
   return current;
  },
  accepts(token){return current!==null&&Object.keys(current).every(key=>current[key]===token?.[key]);},
  get current(){return current;},
 };
}
