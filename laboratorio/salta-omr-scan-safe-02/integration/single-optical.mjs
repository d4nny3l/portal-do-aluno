// Experimental integration adapter. Not connected to the official UI.
// One rectified optical raster, one invocation of the unchanged official reader.
// No grading, persistence, student assignment, visual enhancement or fallback here.
import {detectFiducials,warpFromFiducials} from '../../../corretor/v2/omr/normalize.mjs';
import {readRaster} from '../../../corretor/v2/omr/reader.mjs';
export function readSingleOptical({optical,template,manifest,page,showCode=true},{detect,warp,read}={detect:detectFiducials,warp:warpFromFiducials,read:readRaster}){
 const raster=optical?.rectified;
 if(!raster||!Number.isSafeInteger(raster.width)||!Number.isSafeInteger(raster.height)||raster.width<1||raster.height<1||!(raster.gray instanceof Uint8Array)||raster.gray.length!==raster.width*raster.height)throw new TypeError("Raster óptico retificado inválido.");
 if(!template||!manifest||manifest.templateId!==template.templateId||manifest.revision!==template.revision||!manifest.contentHash)throw new TypeError("Selecione o manifesto exato.");
 if(!Number.isInteger(page)||page<1||page>template.pageCount)throw new RangeError("Confirme a página impressa.");
 const detection=detect(raster.gray,raster.width,raster.height,{manifest});
 if(!detection?.found||!Number.isFinite(detection.confidence)||detection.confidence<.7||detection.corners?.length!==4)throw new Error("Marcadores insuficientes. Reenquadre a folha.");
 const outputWidth=manifest.mode==="embedded"?Math.min(1400,Math.floor(2200*manifest.paper.widthMm/manifest.paper.heightMm)):1400;
 const aligned=warp(raster.gray,raster.width,raster.height,detection.corners,{outputWidth,manifest});
 const reading=read(template,aligned.pixels,aligned.width,aligned.height,{page,showCode,manifest});
 if(reading.contentHash!==manifest.contentHash||reading.templateId!==template.templateId||reading.templateRevision!==template.revision||reading.page!==page||reading.pageCount!==template.pageCount)throw new Error("Resultado não corresponde ao modelo confirmado.");
 return {reading,aligned,identityPending:reading.identity.state==="review",requiresOpticalReview:reading.observations.some(o=>o.state==="review")};
}
