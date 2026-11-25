/* SALTA OMR Camera Framing — independent, pure geometry.
   The same source rectangle feeds live preview, detection and capture.
   No lens selection, focus control or hidden optical scaling.
*/
const finitePositive = n => Number.isFinite(n) && n > 0;

export function cameraRegion(sourceWidth, sourceHeight, viewWidth, viewHeight, mode = 'fill') {
  if (![sourceWidth, sourceHeight, viewWidth, viewHeight].every(finitePositive)) {
    throw new RangeError('Dimensões inválidas para enquadramento da câmera.');
  }
  if (mode !== 'fill' && mode !== 'fit') throw new TypeError('Modo de enquadramento inválido.');
  const sourceRatio = sourceWidth / sourceHeight;
  const viewRatio = viewWidth / viewHeight;
  if (mode === 'fit') {
    const scale = Math.min(viewWidth / sourceWidth, viewHeight / sourceHeight);
    const displayWidth = sourceWidth * scale, displayHeight = sourceHeight * scale;
    return Object.freeze({
      sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight,
      dx: (viewWidth - displayWidth) / 2, dy: (viewHeight - displayHeight) / 2,
      dw: displayWidth, dh: displayHeight, sourceWidth, sourceHeight,
      mode
    });
  }
  let sw = sourceWidth, sh = sourceHeight;
  if (sourceRatio > viewRatio) sw = sourceHeight * viewRatio;
  else if (sourceRatio < viewRatio) sh = sourceWidth / viewRatio;
  return Object.freeze({
    sx: (sourceWidth - sw) / 2, sy: (sourceHeight - sh) / 2, sw, sh,
    dx: 0, dy: 0, dw: viewWidth, dh: viewHeight,
    sourceWidth, sourceHeight, mode
  });
}

export function cameraStageAspect(sourceWidth, sourceHeight, {
  portrait = false,
  viewWidth = 390,
  windowHeight = 844,
  mode = 'fill'
} = {}) {
  if (![sourceWidth, sourceHeight].every(finitePositive)) return 3 / 4;
  const nativeRatio = sourceWidth / sourceHeight;
  if (!portrait || mode === 'fit') return nativeRatio;
  // Portrait canvas at least 3:4, unless the source itself is portrait.
  // Retain native portrait FOV where possible, while respecting screen height.
  const preferred = nativeRatio > 1 ? 3 / 4 : nativeRatio;
  const heightLimit = Math.max(360, windowHeight * 0.78);
  return Math.max(preferred, viewWidth / heightLimit);
}
