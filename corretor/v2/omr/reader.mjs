import { layoutTemplate } from "./template.mjs?v=20261109d";

export const READER_VERSION = "salta-omr-reader-v2";

// Reads a normalized, aligned grayscale raster (0=black, 255=white). The v2
// template changes the mark coordinates; uncertain marks are never final.
export function readRaster(template, pixels, width, height, { darkThreshold = 100, ambiguityGap = 18, page = 1, showCode = true } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !pixels || pixels.length !== width * height) {
    throw new TypeError("Raster inválido.");
  }
  if (!Number.isFinite(darkThreshold) || darkThreshold < 0 || darkThreshold > 255 || !Number.isFinite(ambiguityGap) || ambiguityGap < 0) {
    throw new TypeError("Parâmetros de leitura inválidos.");
  }
  const layout = layoutTemplate(template, { width, height, page, showCode });
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
  return Object.freeze({
    readerVersion: READER_VERSION,
    templateId: template.templateId,
    templateRevision: template.revision,
    templateVersion: template.version,
    page,
    pageCount: template.pageCount,
    observations: Object.freeze(samples),
    needsReview: samples.some(observation => observation.state !== "read"),
  });
}
