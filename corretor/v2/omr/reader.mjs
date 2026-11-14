import { layoutTemplate } from "./template.mjs?v=20261114v2h1";

export const READER_VERSION = "salta-omr-reader-v5";

// Reads a normalized, aligned grayscale raster (0=black, 255=white).
// The explicitly selected manifest supplies coordinates; uncertain marks need review.
export function readRaster(template, pixels, width, height, { darkThreshold = 100, ambiguityGap = 18, page = 1, showCode = true, manifest = null } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !pixels || pixels.length !== width * height) {
    throw new TypeError("Raster inválido.");
  }
  if (!Number.isFinite(darkThreshold) || darkThreshold < 0 || darkThreshold > 255 || !Number.isFinite(ambiguityGap) || ambiguityGap < 0) {
    throw new TypeError("Parâmetros de leitura inválidos.");
  }
  if (template?.mode === "embedded") throw new TypeError("A leitura de quadros incorporados exige enquadramento próprio e ainda não está disponível. Use um cartão A4 independente para corrigir.");
  const layout = layoutTemplate(template, { width, height, page, showCode, manifest });
  const samples = [];
  for (const cell of layout.cells) {
    const scores = cell.bubbles.map(bubble => {
      let ink = 0;
      let n = 0;
      const radius = Math.max(1, Math.round(cell.bubbleRadius * 0.42));
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          const px = Math.round(bubble.x) + x;
          const py = Math.round(bubble.y) + y;
          if (px >= 0 && py >= 0 && px < width && py < height) {
            ink += 255 - pixels[py * width + px];
            n++;
          }
        }
      }
      return { choice: bubble.choice, score: ink / Math.max(1, n) };
    }).sort((a, b) => b.score - a.score);
    const selected = scores[0];
    const next = scores[1];
    const marked = selected.score >= 255 - darkThreshold;
    const double = marked && next.score >= 255 - darkThreshold;
    const state = double ? "double" : !marked ? "blank" : selected.score - next.score < ambiguityGap ? "review" : "read";
    samples.push(Object.freeze({
      questionId: `q${cell.number}`,
      number: cell.number,
      page,
      marks: Object.freeze(scores.filter(score => score.score >= 255 - darkThreshold).map(score => score.choice)),
      answer: state === "read" ? selected.choice : null,
      confidence: Math.max(0, Math.min(1, (selected.score - (next?.score || 0)) / 255)),
      state,
    }));
  }
  const identity = readIdentity(layout, pixels, width, height, darkThreshold);
  return Object.freeze({
    readerVersion: READER_VERSION,
    templateId: template.templateId,
    templateRevision: template.revision,
    templateVersion: template.version,
    page,
    pageCount: template.pageCount,
    identity,
    layoutVersion: layout.manifest.layoutVersion || "v1",
    contentHash: layout.manifest.contentHash,
    observations: Object.freeze(samples),
    needsReview: identity.state === "review" || samples.some(observation => observation.state !== "read"),
  });
}

function readIdentity(layout, pixels, width, height, threshold) {
  if (!layout.codeGrid.length) return Object.freeze({ state: 'disabled', code: null });
  const columns=[];
  for(let column=1;column<=7;column++){
    const marks=[];
    for(const bubble of layout.codeGrid.filter(b=>b.column===column)){
      let ink=0,n=0;const radius=Math.max(1,Math.round(bubble.radius*.42));
      for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
        const px=Math.round(bubble.x)+x,py=Math.round(bubble.y)+y;
        if(px>=0&&py>=0&&px<width&&py<height){ink+=255-pixels[py*width+px];n++;}
      }
      if(ink/Math.max(1,n)>=255-threshold)marks.push(bubble.digit);
    }
    columns.push({column,marks});
  }
  const complete=columns.every(c=>c.marks.length===1);
  return Object.freeze({state:complete?'read':'review',code:complete?columns.map(c=>c.marks[0]).join(''):null,columns:Object.freeze(columns)});
}
