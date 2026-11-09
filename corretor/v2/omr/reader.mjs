import { layoutTemplate } from "./template.mjs";

export const READER_VERSION="salta-omr-reader-v1";
// Reads a normalized, aligned grayscale raster (0=black, 255=white). Fiducial
// detection/deskew remains an adapter boundary; uncertain marks are never final.
export function readRaster(template, pixels, width, height, { darkThreshold=100, ambiguityGap=18 }={}) {
  if(!pixels||pixels.length!==width*height)throw new TypeError("Raster inválido.");
  const layout=layoutTemplate(template,{width,height}),samples=[];
  for(const cell of layout.cells){const scores=cell.bubbles.map(b=>{let ink=0,n=0;for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){const px=Math.round(b.x)+x,py=Math.round(b.y)+y;if(px>=0&&py>=0&&px<width&&py<height){ink+=255-pixels[py*width+px];n++}}return {choice:b.choice,score:ink/Math.max(1,n)}}).sort((a,b)=>b.score-a.score);const selected=scores[0],next=scores[1];const marked=selected.score>=255-darkThreshold;const double=marked&&next.score>=255-darkThreshold;const state=double?"double":!marked?"blank":selected.score-next.score<ambiguityGap?"review":"read";samples.push(Object.freeze({questionId:`q${cell.number}`,number:cell.number,marks:Object.freeze(scores.filter(s=>s.score>=255-darkThreshold).map(s=>s.choice)),answer:state==="read"?selected.choice:null,confidence:Math.max(0,Math.min(1,(selected.score-(next?.score||0))/255)),state}));}
  return Object.freeze({readerVersion:READER_VERSION,templateId:template.templateId,templateRevision:template.revision,observations:Object.freeze(samples),needsReview:samples.some(x=>x.state!=="read")});
}
