/**
 * SALTA OMR parallel research only.
 * Default edge-first, optional ?engine=primary for exact baseline comparison.
 * No camera, zoom, flash, OMR, timing, DOM or UI changes.
 */
import {detectDocument} from "./vision.js";
import {detectPaperCandidate} from "../candidates/edge-first-01.mjs";

export function experimentalPaperDetector(rgba,w,h,{
  mode="edge",misses=0,fullResolution=false,
  baseline=detectDocument,edge=detectPaperCandidate
}={}){
  if(mode==="primary")return baseline(rgba,w,h);
  if(mode!=="edge")throw new TypeError("Motor de pesquisa desconhecido");
  // One economical attempt on each frame, plus sparse original-size retry
  // only after repeated misses. Never run two heavy detectors continuously.
  const retry=fullResolution || (misses>=6 && misses % 9 === 6);
  const candidate=edge(rgba,w,h,{targetWidth:224,allowFullResolution:retry});
  if(!candidate?.found)return null;
  return {
    corners:candidate.corners,
    score:candidate.score,
    support:candidate.support ?? 0,
    areaFrac:candidate.areaFrac ?? null,
    method:"edge-first-01",
    detectorSource:candidate.source,
    evidence:candidate.evidence,
  };
}
