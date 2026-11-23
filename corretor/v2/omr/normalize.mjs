import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./template.mjs?v=20261114v2final";

export const NORMALIZER_VERSION = "salta-omr-normalizer-v1";

function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 100;
  for (let i = 0; i < 256; i++) {
    backgroundWeight += histogram[i];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += i * histogram[i];
    const meanBackground = backgroundSum / backgroundWeight;
    const meanForeground = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = i;
    }
  }
  return Math.max(65, Math.min(180, threshold + 18));
}

function downsample(gray, width, height, maxDimension = 1100) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));
  const data = new Uint8Array(sampleWidth * sampleHeight);
  const histogram = new Uint32Array(256);
  for (let y = 0; y < sampleHeight; y++) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < sampleWidth; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) / scale));
      const value = gray[sy * width + sx];
      data[y * sampleWidth + x] = value;
      histogram[value]++;
    }
  }
  return { data, width: sampleWidth, height: sampleHeight, scale, threshold: otsuThreshold(histogram, data.length), histogram };
}

function components(image) {
  const { data, width, height, scale, threshold } = image;
  const total = width * height;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(Math.min(total, 1_000_000));
  const found = [];
  const minArea = Math.max(12, total * 0.000025);
  const maxArea = total * 0.008;
  for (let index = 0; index < total; index++) {
    if (seen[index] || data[index] > threshold) continue;
    let top = 0;
    let count = 0;
    stack[top++] = index;
    seen[index] = 1;
    let minX = width, minY = height, maxX = 0, maxY = 0, sx = 0, sy = 0;
    while (top) {
      const current = stack[--top];
      const x = current % width;
      const y = Math.floor(current / width);
      count++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (!seen[next] && data[next] <= threshold) {
            seen[next] = 1;
            if (top < stack.length) stack[top++] = next;
          }
        }
      }
      if (count > maxArea) break;
    }
    if (count < minArea || count > maxArea) continue;
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspect = boxWidth / boxHeight;
    const fill = count / (boxWidth * boxHeight);
    if (boxWidth < 4 || boxHeight < 4 || aspect < 0.45 || aspect > 2.25 || fill < 0.56) continue;
    found.push({
      x: sx / count / scale,
      y: sy / count / scale,
      width: boxWidth / scale,
      height: boxHeight / scale,
      fill,
      aspect,
      area: count / scale ** 2,
      quality: Math.min(1, fill / 0.9) * Math.exp(-Math.abs(Math.log(aspect / 1.414)) * 0.2),
    });
  }
  // Dense printed text can outscore a real corner marker. Keep a bounded
  // spatial sample as well as the strongest components, without changing the
  // darkness/area thresholds or the four-marker transformation.
  const selected = new Set(found.sort((a, b) => b.quality - a.quality).slice(0, 16));
  for (const [x, y] of [[0, 0], [width / scale, 0], [width / scale, height / scale], [0, height / scale]]) {
    const nearest = [...found].sort((a, b) => ((a.x - x) * scale / width) ** 2 + ((a.y - y) * scale / height) ** 2
      - (((b.x - x) * scale / width) ** 2 + ((b.y - y) * scale / height) ** 2));
    nearest.slice(0, 4).forEach(point => selected.add(point));
  }
  return [...selected];
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function orderedQuad(points) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  const ring = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const variants = [];
  // Image coordinates increase downwards. Keep clockwise winding: the reverse
  // ring has the same edge scores but reflects the normalized page.
  for (const direction of [ring]) {
    for (let offset = 0; offset < 4; offset++) {
      const ordered = Array.from({ length: 4 }, (_, index) => direction[(index + offset) % 4]);
      const horizontal = (distance(ordered[0], ordered[1]) + distance(ordered[2], ordered[3])) / 2;
      const vertical = (distance(ordered[1], ordered[2]) + distance(ordered[3], ordered[0])) / 2;
      const ratio = horizontal / vertical;
      const ratioError = Math.abs(Math.log(ratio / (PAGE_WIDTH_MM / PAGE_HEIGHT_MM)));
      const oppositeError = Math.abs(Math.log(distance(ordered[0], ordered[1]) / distance(ordered[2], ordered[3])))
        + Math.abs(Math.log(distance(ordered[1], ordered[2]) / distance(ordered[3], ordered[0])));
      variants.push({ ordered, ratioError, oppositeError });
    }
  }
  variants.sort((a, b) => {
    const delta = a.ratioError + a.oppositeError * 0.35 - (b.ratioError + b.oppositeError * 0.35);
    // Opposite starts are geometrically equivalent. Floating point noise must
    // not choose a 180° flip between adjacent frames. Prefer the upper start.
    return Math.abs(delta) > 1e-9 ? delta : a.ordered[0].y - b.ordered[0].y || a.ordered[0].x - b.ordered[0].x;
  });
  return variants[0];
}

function quadArea(points) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function embeddedGeometry(manifest){
 if(!manifest||manifest.mode!=='embedded')return null;
 const paper=manifest.paper,markers=manifest.technicalRegions?.fiducials;
 if(manifest.schemaVersion!=='salta-layout-manifest-v2'||!paper||
   !Number.isFinite(paper.widthMm)||!Number.isFinite(paper.heightMm)||
   paper.widthMm<60||paper.widthMm>210||paper.heightMm<80||paper.heightMm>297||
   !Array.isArray(markers)||markers.length!==4)throw new TypeError('Manifesto de quadro incorporado inválido.');
 const order=['fiducial-tl','fiducial-tr','fiducial-br','fiducial-bl'];
 const points=order.map(id=>markers.find(m=>m.markerId===id));
 if(points.some(p=>!p||p.sizeMm!==5.5||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
   p.x<=0||p.y<=0||p.x>=paper.widthMm||p.y>=paper.heightMm)||
   points[1].x-points[0].x<25||points[3].y-points[0].y<30||
   Math.abs(points[0].y-points[1].y)>.01||Math.abs(points[2].y-points[3].y)>.01||
   Math.abs(points[0].x-points[3].x)>.01||Math.abs(points[1].x-points[2].x)>.01)
  throw new TypeError('Os quatro marcadores do manifesto são incompatíveis.');
 return{widthMm:paper.widthMm,heightMm:paper.heightMm,points,spanX:points[1].x-points[0].x,
  spanY:points[3].y-points[0].y,markerSize:5.5,minArea:.025,embedded:true};
}
function chooseQuad(candidates, width, height, geometry = null) {
  const spanX=geometry?.spanX??194,spanY=geometry?.spanY??281,markerMm=geometry?.markerSize??5.5;
  let best = null;
  const n = candidates.length;
  for (let a = 0; a < n - 3; a++) for (let b = a + 1; b < n - 2; b++) {
    for (let c = b + 1; c < n - 1; c++) for (let d = c + 1; d < n; d++) {
      const points = [candidates[a], candidates[b], candidates[c], candidates[d]];
      const order = orderedQuad(points);
      const turns = order.ordered.map((p, i) => {
        const q = order.ordered[(i + 1) % 4], r = order.ordered[(i + 2) % 4];
        return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
      });
      if (turns.some(turn => turn <= 0)) continue;
      const areaRatio = quadArea(order.ordered) / (width * height);
      if (areaRatio < (geometry?.minArea??0.08) || areaRatio > 0.99) continue;
      if (order.ratioError > 0.85 || order.oppositeError > 1.15) continue;
      const markerQuality = points.reduce((sum, point) => sum + point.quality, 0) / 4;
      // All supported page markers are solid 5.5 mm squares. A text glyph or
      // filled answer may have a similar bounding box but not the physical area
      // implied by the adjacent 194 × 281 mm marker-center spans.
      const sizeError = order.ordered.reduce((sum, p, i) => {
        const previous = order.ordered[(i + 3) % 4], next = order.ordered[(i + 1) % 4];
        const localArea = Math.abs((previous.x-p.x)*(next.y-p.y)-(previous.y-p.y)*(next.x-p.x));
        const expectedArea = localArea * markerMm ** 2 / (spanX * spanY);
        return sum + Math.abs(Math.log(p.area / expectedArea));
      }, 0) / 4;
      const geometricScore = markerQuality - order.ratioError * 0.28 - order.oppositeError * 0.12 + Math.min(areaRatio, 0.72) * 0.08;
      const score = geometricScore - sizeError * 0.3;
      if (!best || score > best.score) best = { corners: order.ordered, score, confidence: Math.max(0, Math.min(1, geometricScore)), areaRatio, sizeError };
    }
  }
  // Evaluate physical consistency ONCE for the winning quadruple, rather than
  // adding work to every combination in the O(n^4) search. Only the low-light
  // retry uses this result; the original detector's behavior is unchanged.
  if (best) {
    const deviations = best.corners.map((p, i) => {
      const previous = best.corners[(i + 3) % 4], next = best.corners[(i + 1) % 4];
      const localArea = Math.abs((previous.x-p.x)*(next.y-p.y)-(previous.y-p.y)*(next.x-p.x));
      const expectedArea = localArea * markerMm ** 2 / (spanX * spanY);
      const size = Math.abs(Math.log(p.area / expectedArea));
      // Marker dimensions are 5.5 mm in BOTH axes. At even corners the
      // next edge is horizontal; at odd corners it is vertical.
      const horizontal = distance(p, i % 2 ? previous : next) / spanX;
      const vertical = distance(p, i % 2 ? next : previous) / spanY;
      const shape = Math.abs(Math.log(p.aspect / (horizontal / vertical)));
      return { size, shape };
    });
    const shapeError = deviations.reduce((sum, part) => sum + part.shape, 0) / 4;
    // 1.4x mean area ≈ 18% linear scaling; permit one local marker to vary
    // up to 1.7x area and generous perspective-induced aspect deformation.
    // These bounds are exercised against scaled/perspective synthetic cards.
    best.physicalFit = best.sizeError <= Math.log(1.4)
      && deviations.every(part => part.size <= Math.log(1.7))
      && shapeError <= Math.log(1.45)
      && deviations.every(part => part.shape <= Math.log(1.8));
  }
  return geometry?.embedded&&!best?.physicalFit?null:best;
}

export function detectFiducials(gray, width, height, {manifest = null} = {}) {
  const geometry=embeddedGeometry(manifest);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || !gray || gray.length !== width * height) {
    throw new TypeError("Imagem inválida para localizar os marcadores.");
  }
  const sample = downsample(gray, width, height);
  let found = components(sample);
  let quad = chooseQuad(found, width, height, geometry);
  let lightingFallback = false;
  // Only retry marker DISCOVERY after the existing geometric search fails.
  // The legacy Otsu threshold has a floor of 65; this can classify a dark
  // gray sheet as ink and merge all four markers into the background.
  // This retry is intentionally limited to very dark images and does not
  // modify pixels used for normalization, bubble reading or student codes.
  if ((!quad || quad.confidence < 0.62) && sample.threshold >= 65) {
    let seen = 0, paper = 255;
    const target = Math.ceil(sample.data.length * .9);
    for (let value = 0; value < 256; value++) {
      seen += sample.histogram[value];
      if (seen >= target) { paper = value; break; }
    }
    if (paper <= 110) {
      const threshold = Math.max(12, Math.min(sample.threshold - 9, Math.floor(paper * .7)));
      if (threshold < sample.threshold - 8) {
        const retryFound = components({ ...sample, threshold });
        const retryQuad = chooseQuad(retryFound, width, height, geometry);
        // A weaker segmentation must pass a stronger geometric gate.
        if (retryQuad && retryQuad.confidence >= .75 && retryQuad.physicalFit) {
          quad = retryQuad;
          found = retryFound;
          lightingFallback = true;
        }
      }
    }
  }
  if (!quad || quad.confidence < 0.62) return Object.freeze({ found: false, confidence: quad?.confidence || 0, corners: [], candidateCount: found.length });
  return Object.freeze({
    found: true,
    confidence: quad.confidence,
    areaRatio: quad.areaRatio,
    corners: Object.freeze(quad.corners.map(point => Object.freeze({ x: point.x, y: point.y }))),
    candidateCount: found.length,
    lightingFallback,
  });
}

function solve(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  const size = values.length;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-10) throw new Error("Os quatro marcadores estão muito próximos ou desalinhados.");
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j <= size; j++) rows[column][j] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j <= size; j++) rows[row][j] -= factor * rows[column][j];
    }
  }
  return rows.map(row => row[size]);
}

function homography(source, target) {
  const matrix = [];
  const values = [];
  source.forEach((point, index) => {
    const { x, y } = point;
    const { x: u, y: v } = target[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  });
  return solve(matrix, values);
}

export function warpFromFiducials(gray, width, height, corners, { outputWidth = 1200, manifest = null } = {}) {
  const geometry=embeddedGeometry(manifest),paperW=geometry?.widthMm??PAGE_WIDTH_MM,paperH=geometry?.heightMm??PAGE_HEIGHT_MM;
  if (!Array.isArray(corners) || corners.length !== 4 || !Number.isInteger(outputWidth) || outputWidth < 300 || outputWidth > 2400) {
    throw new TypeError("Informe os quatro marcadores na ordem superior esquerda, superior direita, inferior direita e inferior esquerda.");
  }
  if (gray?.length !== width * height || corners.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.y < 0 || point.x >= width || point.y >= height)) {
    throw new TypeError("Os pontos de enquadramento precisam estar dentro da imagem.");
  }
  const edgeLengths = corners.map((point, index) => distance(point, corners[(index + 1) % 4]));
  const signedTurns = corners.map((point, index) => {
    const next = corners[(index + 1) % 4], after = corners[(index + 2) % 4];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  if (signedTurns.every(turn => turn < 0)) {
    throw new Error("Os marcadores estão em ordem invertida. Use superior esquerdo, superior direito, inferior direito e inferior esquerdo.");
  }
  if (edgeLengths.some(length => length < Math.min(width, height) * 0.08) || signedTurns.some(turn => Math.abs(turn) < width * height * 0.0002) || !signedTurns.every(turn => Math.sign(turn) === Math.sign(signedTurns[0]))) {
    throw new Error("Os quatro pontos não formam um enquadramento válido. Marque os centros dos marcadores na ordem indicada.");
  }
  const outputHeight = Math.round(outputWidth * paperH / paperW);
  const target = geometry?geometry.points.map(p=>({x:outputWidth*p.x/paperW,y:outputHeight*p.y/paperH})):[
    { x: outputWidth * 8 / PAGE_WIDTH_MM, y: outputHeight * 8 / PAGE_HEIGHT_MM },
    { x: outputWidth * (PAGE_WIDTH_MM - 8) / PAGE_WIDTH_MM, y: outputHeight * 8 / PAGE_HEIGHT_MM },
    { x: outputWidth * (PAGE_WIDTH_MM - 8) / PAGE_WIDTH_MM, y: outputHeight * (PAGE_HEIGHT_MM - 8) / PAGE_HEIGHT_MM },
    { x: outputWidth * 8 / PAGE_WIDTH_MM, y: outputHeight * (PAGE_HEIGHT_MM - 8) / PAGE_HEIGHT_MM },
  ];
  const project = homography(target, corners);
  const output = new Uint8Array(outputWidth * outputHeight).fill(255);
  for (let y = 0; y < outputHeight; y++) for (let x = 0; x < outputWidth; x++) {
    const denominator = project[6] * x + project[7] * y + 1;
    if (Math.abs(denominator) < 1e-8) continue;
    const sx = (project[0] * x + project[1] * y + project[2]) / denominator;
    const sy = (project[3] * x + project[4] * y + project[5]) / denominator;
    if (sx < 0 || sy < 0 || sx >= width - 1 || sy >= height - 1) continue;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), dx = sx - x0, dy = sy - y0;
    const top = gray[y0 * width + x0] * (1 - dx) + gray[y0 * width + x0 + 1] * dx;
    const bottom = gray[(y0 + 1) * width + x0] * (1 - dx) + gray[(y0 + 1) * width + x0 + 1] * dx;
    output[y * outputWidth + x] = Math.round(top * (1 - dy) + bottom * dy);
  }
  return Object.freeze({ pixels: output, width: outputWidth, height: outputHeight, version: NORMALIZER_VERSION });
}

export function normalizeCard(gray, width, height, options = {}) {
  const detection = detectFiducials(gray, width, height, options);
  if (!detection.found || detection.confidence < (options.minConfidence ?? 0.62)) {
    throw new Error("Não foi possível ler o cartão. Enquadre a folha inteira, melhore a iluminação e tente novamente; se necessário, ajuste os quatro marcadores manualmente.");
  }
  const normalized = warpFromFiducials(gray, width, height, detection.corners, options);
  return Object.freeze({ ...normalized, confidence: detection.confidence, corners: detection.corners });
}
