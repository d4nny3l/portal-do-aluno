import { layoutTemplate } from "./template.mjs?v=20261115assess1";

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
    const analysis = analyzeQuestion(cell, pixels, width, height, darkThreshold, ambiguityGap);
    samples.push(Object.freeze({
      questionId: cell.questionId,
      number: cell.number,
      page,
      marks: Object.freeze(analysis.marks),
      answer: analysis.state === 'read' ? analysis.winner : null,
      confidence: analysis.confidence,
      state: analysis.state,
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

// The old core score is retained as the only route to an automatic answer.
// A displaced or irregular fill can only request human review; it cannot
// silently become an answer or override an existing double mark.
function inkAt(pixels, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return 255 - pixels[y * width + x];
}

function measureBubble(bubble, bubbleRadius, pixels, width, height, darkThreshold) {
  const cx = Math.round(bubble.x), cy = Math.round(bubble.y);
  const radius = Math.max(1, Math.round(bubbleRadius * .42));
  let coreSum = 0, coreCount = 0;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    const ink = inkAt(pixels, width, height, cx + x, cy + y);
    if (ink !== null) { coreSum += ink; coreCount++; }
  }
  const core = coreSum / Math.max(1, coreCount);
  // Offset windows are evidence for review only, never a stronger automatic
  // answer. They cover small residual alignment error and off-center strokes.
  const offset = Math.max(1, Math.round(bubbleRadius * .22));
  let shiftedCore = core;
  for (const [dx,dy] of [[-offset,0],[offset,0],[0,-offset],[0,offset]]) {
    let total=0,n=0;
    for (let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
      const ink=inkAt(pixels,width,height,cx+x+dx,cy+y+dy);
      if(ink!==null){total+=ink;n++;}
    }
    shiftedCore=Math.max(shiftedCore,total/Math.max(1,n));
  }
  const extendedRadius = Math.max(radius + 1, Math.round(bubbleRadius * .77));
  const darkLimit = Math.max(100, 255 - darkThreshold - 35);
  let regionSum = 0, regionCount = 0, darkCount = 0;
  for (let y = -extendedRadius; y <= extendedRadius; y++) for (let x = -extendedRadius; x <= extendedRadius; x++) {
    if (x * x + y * y > extendedRadius * extendedRadius) continue;
    const ink = inkAt(pixels, width, height, cx + x, cy + y);
    if (ink === null) continue;
    regionSum += ink;
    regionCount++;
    if (ink >= darkLimit) darkCount++;
  }
  return {
    choice: bubble.choice,
    score: core,
    shifted: shiftedCore,
    extended: regionSum / Math.max(1, regionCount),
    coverage: darkCount / Math.max(1, regionCount),
  };
}

function analyzeQuestion(cell, pixels, width, height, darkThreshold, ambiguityGap) {
  const scores = cell.bubbles.map(b => measureBubble(b, cell.bubbleRadius, pixels, width, height, darkThreshold))
    .sort((a, b) => b.score - a.score);
  const [first, second] = scores;
  const strongLimit = 255 - darkThreshold;
  // Use the best competing bubble as a local reference. This rejects uniform
  // shadows, printed letters and paper darkening, which affect all options.
  const candidate = (item) => item.score < strongLimit
    && item.shifted >= Math.max(94, strongLimit * .63)
    && item.extended >= 97
    && item.coverage >= .18
    && item.shifted - Math.min(...scores.filter(other => other !== item).map(other => other.shifted)) >= 27
    && item.extended - Math.min(...scores.filter(other => other !== item).map(other => other.extended)) >= 20;
  const strong = scores.filter(item => item.score >= strongLimit);
  const partial = scores.filter(candidate);
  // Both options on a two-choice card may have substantial partial coverage,
  // leaving no unmarked peer for relative comparison. Never silently call that
  // an empty or single-choice answer; request review without assigning a mark.
  const multipleWeak = scores.filter(item => item.score < strongLimit
    && item.score >= 110 && item.extended >= 126 && item.coverage >= .4);
  const marks = [...new Set([...strong, ...partial, ...(multipleWeak.length > 1 ? multipleWeak : [])].map(item => item.choice))];
  let state;
  if (strong.length > 1) state = 'double';
  else if (strong.length === 1 && partial.some(item => item !== strong[0])) state = 'review';
  else if (strong.length === 1) state = first.score - second.score < ambiguityGap ? 'review' : 'read';
  else if (partial.length > 0) state = partial.length > 1 ? 'double' : 'review';
  else if (multipleWeak.length > 1) state = 'review';
  else state = 'blank';
  return { scores, marks, state, winner: first.choice,
    confidence: Math.max(0, Math.min(1, (first.score - (second?.score || 0)) / 255)) };
}

/**
 * Diagnostic only: choice-level scores without name, code, school or answers.
 * Invoke solely with the exact user-selected manifest and aligned grayscale.
 * No diagnostic telemetry is stored or sent to the backend.
 */
export function diagnoseRaster(template, pixels, width, height, options = {}) {
  const { darkThreshold = 100, ambiguityGap = 18, page = 1, showCode = true, manifest = null } = options;
  // Preserve all public reader input/manifest validations.
  readRaster(template, pixels, width, height, options);
  const layout = layoutTemplate(template, { width, height, page, showCode, manifest });
  return Object.freeze(layout.cells.map(cell => {
    const result = analyzeQuestion(cell, pixels, width, height, darkThreshold, ambiguityGap);
    return Object.freeze({
      number: cell.number, questionId: cell.questionId, state: result.state,
      candidateMarks: Object.freeze([...result.marks]),
      choiceScores: Object.freeze(result.scores.map(score => Object.freeze({
        choice: score.choice, core: Math.round(score.score * 10) / 10,
        shifted: Math.round(score.shifted * 10) / 10,
        extended: Math.round(score.extended * 10) / 10,
        coverage: Math.round(score.coverage * 1000) / 1000,
      }))),
    });
  }));
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
