// Scancat vision: Copyright (c) 2026 Nipun Batra, MIT.
// License: laboratorio/salta-omr-scan-safe-02/LICENSE-SCANCAT-MIT.txt.
// SALTA's frozen document enhancement is independent of optical reading.
import * as V from '../../../laboratorio/salta-omr-scan-safe-02/js/vision.js';
import {enhanceDocument} from '../../../laboratorio/salta-omr-scan-safe-02/js/document-enhance.mjs';
import {detectFiducials, warpFromFiducials} from '../omr/normalize.mjs';
import {readRaster} from '../omr/reader.mjs';

export const MAX_SIDE = 2600;
const TOKEN_FIELDS = ['captureId', 'sessionId', 'templateId', 'templateRevision', 'contentHash', 'page'];
export function sameCaptureToken(a, b) {
  return !!a && !!b && TOKEN_FIELDS.every(key => a[key] === b[key]);
}
export function validateCaptureContext({template, manifest, page, token}) {
  if (!template || !manifest || manifest.templateId !== template.templateId ||
      manifest.revision !== template.revision || typeof manifest.contentHash !== 'string' || !manifest.contentHash)
    throw new TypeError('Selecione o manifesto exato.');
  if (!Number.isSafeInteger(page) || page < 1 || page > template.pageCount ||
      !manifest.pages?.some(item => item.page === page))
    throw new RangeError('Confirme a página impressa.');
  if (!Number.isSafeInteger(token?.captureId) || token.captureId < 1 ||
      !Number.isSafeInteger(token?.sessionId) || token.sessionId < 0 ||
      token.templateId !== template.templateId || token.templateRevision !== template.revision ||
      token.contentHash !== manifest.contentHash || token.page !== page)
    throw new TypeError('Contexto da captura incompatível com o modelo confirmado.');
}

function gray8(rgba, w, h) {
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4)
    gray[i] = Math.round(.299 * rgba[j] + .587 * rgba[j + 1] + .114 * rgba[j + 2]);
  return gray;
}
function paperCorners(points, w, h) {
  if (!Array.isArray(points) || points.length !== 4 || points.some(p =>
    !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) ||
    p[0] < 0 || p[1] < 0 || p[0] > w || p[1] > h))
    throw new TypeError('Contorno do papel inválido.');
  const turns = points.map((p, i) => {
    const q = points[(i + 1) % 4], r = points[(i + 2) % 4];
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
  });
  if (!turns.every(turn => turn > 0)) throw new TypeError('Contorno do papel inválido.');
  return points;
}

export function validateSourceOptical(source) {
  if (!(source?.gray instanceof Uint8Array) || !Number.isSafeInteger(source.width) ||
      !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1 ||
      !Number.isSafeInteger(source.width * source.height) || source.gray.length !== source.width * source.height)
    throw new TypeError('Raster óptico geométrico inválido.');
}
const failResult = (result, code, message, start, now) => ({...result, error: {code, message}, metrics: {readCalls: 0, durationMs: now() - start}});
function alignAndRead(payload, sourceOptical, markers, result, {warp, read, now}, start) {
  const {template, manifest, page, showCode = true} = payload;
  const outputWidth = manifest.mode === 'embedded' ? Math.min(1400, Math.floor(2200 * manifest.paper.widthMm / manifest.paper.heightMm)) : 1400;
  let aligned;
  try {
    aligned = warp(sourceOptical.gray, sourceOptical.width, sourceOptical.height, markers, {outputWidth, manifest});
  } catch (error) {
    return failResult(result, 'FIDUCIALS_INVALID', error.message || 'Enquadramento dos marcadores inválido.', start, now);
  }
  const reading = read(template, aligned.pixels, aligned.width, aligned.height, {page, showCode, manifest});
  if (reading.contentHash !== manifest.contentHash || reading.templateId !== template.templateId ||
      reading.templateRevision !== template.revision || reading.page !== page || reading.pageCount !== template.pageCount)
    throw new Error('Resultado não corresponde ao modelo confirmado.');
  return {...result, optical: aligned, reading, metrics: {readCalls: 1, durationMs: now() - start}};
}

/** Explicit new manual operation, using the last photo's pre-fiducial gray.
 * No native RGBA, detection or enhancement. Gray is returned unchanged so the
 * caller can keep adjusting the same last photo; document remains with caller.
 */
export function processManual(payload, {
  warp = warpFromFiducials, read = readRaster, now = () => performance.now(),
} = {}) {
  validateCaptureContext(payload);
  validateSourceOptical(payload.sourceOptical);
  const start = now();
  const sourceOptical = payload.sourceOptical;
  const result = {sourceOptical, optical: {pixels: sourceOptical.gray, width: sourceOptical.width, height: sourceOptical.height},
    reading: null, token: {...payload.token}, metrics: {readCalls: 0}};
  return alignAndRead(payload, sourceOptical, payload.manualFiducials, result, {warp, read, now}, start);
}

/** Native RGBA in; document RGBA and ONE aligned optical reading out.
 * sourceOptical is the pre-fiducial gray raster for manual points on the last
 * photo only. It costs one byte/pixel; no native/source RGBA survives this call.
 * On a geometric failure optical aliases sourceOptical (one transfer buffer).
 * Dependencies are explicit unit-test seams, never browser/global hooks.
 */
export function processCapture(payload, {
  vision = V, documentEnhance = enhanceDocument, detect = detectFiducials,
  warp = warpFromFiducials, read = readRaster, now = () => performance.now(),
} = {}) {
  validateCaptureContext(payload);
  const {data, w, h, manifest, manualFiducials} = payload;
  if (!(data instanceof Uint8ClampedArray) || !Number.isSafeInteger(w) || !Number.isSafeInteger(h) ||
      w < 1 || h < 1 || !Number.isSafeInteger(w * h * 4) || data.length !== w * h * 4)
    throw new TypeError('Fotografia RGBA inválida.');
  const token = {...payload.token};
  const start = now();
  const corners = paperCorners(payload.corners ?? vision.frameCorners(w, h), w, h);
  const size = vision.outputSize(corners, MAX_SIDE);
  const warped = vision.warp(data, w, h, corners, size.w, size.h);
  const opticalImage = vision.rotate(vision.enhance(warped, size.w, size.h, 'gray'), size.w, size.h, 0);
  const sourceOptical = {gray: gray8(opticalImage.data, opticalImage.w, opticalImage.h), width: opticalImage.w, height: opticalImage.h};
  // Document enhancement never feeds detection, alignment, or readRaster.
  const document = vision.rotate(documentEnhance(warped, size.w, size.h, 'color'), size.w, size.h, 0);
  const geometric = {pixels: sourceOptical.gray, width: sourceOptical.width, height: sourceOptical.height};
  const result = {document, sourceOptical, optical: geometric, reading: null, token, metrics: {readCalls: 0}};
  const fail = (code, message) => failResult(result, code, message, start, now);
  let markers;
  if (manualFiducials !== undefined) {
    markers = manualFiducials;
  } else {
    let detection;
    try {
      detection = detect(sourceOptical.gray, sourceOptical.width, sourceOptical.height, {manifest});
    } catch (error) {
      return fail('FIDUCIALS_NOT_FOUND', error.message || 'Não foi possível localizar os marcadores.');
    }
    if (!detection?.found || !Number.isFinite(detection.confidence) || detection.confidence < .7 || detection.corners?.length !== 4)
      return fail('FIDUCIALS_NOT_FOUND', 'Marcadores insuficientes. Reenquadre a folha ou ajuste os quatro marcadores.');
    markers = detection.corners;
  }
  return alignAndRead(payload, sourceOptical, markers, result, {warp, read, now}, start);
}
