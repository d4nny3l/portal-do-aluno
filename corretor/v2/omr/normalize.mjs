import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "./template.mjs?v=20261109o";

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
  return { data, width: sampleWidth, height: sampleHeight, scale, threshold: otsuThreshold(histogram, data.length) };
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
  return found.sort((a, b) => b.quality - a.quality).slice(0, 32);
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function orderedQuad(points) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  const ring = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const variants = [];
  for (const direction of [ring, [...ring].reverse()]) {
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
  variants.sort((a, b) => a.ratioError + a.oppositeError * 0.35 - (b.ratioError + b.oppositeError * 0.35));
  return variants[0];
}

function quadArea(points) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function chooseQuad(candidates, width, height) {
  let best = null;
  const n = candidates.length;
  for (let a = 0; a < n - 3; a++) for (let b = a + 1; b < n - 2; b++) {
    for (let c = b + 1; c < n - 1; c++) for (let d = c + 1; d < n; d++) {
      const points = [candidates[a], candidates[b], candidates[c], candidates[d]];
      const order = orderedQuad(points);
      const areaRatio = quadArea(order.ordered) / (width * height);
      if (areaRatio < 0.08 || areaRatio > 0.99) continue;
      if (order.ratioError > 0.85 || order.oppositeError > 1.15) continue;
      const markerQuality = points.reduce((sum, point) => sum + point.quality, 0) / 4;
      const score = markerQuality - order.ratioError * 0.28 - order.oppositeError * 0.12 + Math.min(areaRatio, 0.72) * 0.08;
      if (!best || score > best.score) best = { corners: order.ordered, score, confidence: Math.max(0, Math.min(1, score)), areaRatio };
    }
  }
  return best;
}

export function detectFiducials(gray, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || !gray || gray.length !== width * height) {
    throw new TypeError("Imagem inválida para localizar os marcadores.");
  }
  const sample = downsample(gray, width, height);
  const found = components(sample);
  const quad = chooseQuad(found, width, height);
  if (!quad || quad.confidence < 0.62) return Object.freeze({ found: false, confidence: quad?.confidence || 0, corners: [], candidateCount: found.length });
  return Object.freeze({
    found: true,
    confidence: quad.confidence,
    areaRatio: quad.areaRatio,
    corners: Object.freeze(quad.corners.map(point => Object.freeze({ x: point.x, y: point.y }))),
    candidateCount: found.length,
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

export function warpFromFiducials(gray, width, height, corners, { outputWidth = 1200 } = {}) {
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
  if (edgeLengths.some(length => length < Math.min(width, height) * 0.08) || signedTurns.some(turn => Math.abs(turn) < width * height * 0.0002) || !signedTurns.every(turn => Math.sign(turn) === Math.sign(signedTurns[0]))) {
    throw new Error("Os quatro pontos não formam um enquadramento válido. Marque os centros dos marcadores na ordem indicada.");
  }
  const outputHeight = Math.round(outputWidth * PAGE_HEIGHT_MM / PAGE_WIDTH_MM);
  const target = [
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
  const detection = detectFiducials(gray, width, height);
  if (!detection.found || detection.confidence < (options.minConfidence ?? 0.62)) {
    throw new Error("Não foi possível ler o cartão. Enquadre a folha inteira, melhore a iluminação e tente novamente; se necessário, ajuste os quatro marcadores manualmente.");
  }
  const normalized = warpFromFiducials(gray, width, height, detection.corners, options);
  return Object.freeze({ ...normalized, confidence: detection.confidence, corners: detection.corners });
}
