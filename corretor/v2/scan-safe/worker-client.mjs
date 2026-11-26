import {sameCaptureToken, validateCaptureContext, validateSourceOptical} from './processor.mjs';

const scanError = (code, message) => Object.assign(new Error(message), {code});

/** Owns at most one job. Input RGBA/manual gray ownership transfers to Worker.
 * cancel/error/timeout terminate the Worker, releasing its intermediate rasters.
 * Callers retain only the latest returned document/sourceOptical/aligned raster.
 */
export function createScanWorker({
  WorkerClass = globalThis.Worker, workerUrl = new URL('./worker.mjs', import.meta.url), timeoutMs = 30000,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Tempo de processamento inválido.');
  let worker = null, pending = null, sequence = 0, disposed = false, lastCaptureId = 0, lastSessionId = -1;
  function stop() {
    const old = worker;
    worker = null;
    if (old) { old.onmessage = null; old.onerror = null; old.onmessageerror = null; old.terminate(); }
  }
  function rejectPending(error) {
    const job = pending;
    pending = null;
    if (job) { clearTimeout(job.timer); job.reject(error); }
  }
  function reset(error) { stop(); rejectPending(error); }
  function ensureWorker() {
    if (worker) return worker;
    if (typeof WorkerClass !== 'function') throw scanError('WORKER_UNAVAILABLE', 'Este navegador não oferece processamento seguro de fotografias.');
    const current = new WorkerClass(workerUrl, {type: 'module'});
    worker = current;
    current.onmessage = ({data: message}) => {
      const job = pending;
      if (worker !== current || !job || message?.id !== job.id || !sameCaptureToken(message.token, job.token)) return;
      if (message.error) {
        reset(scanError(message.error.code || 'PROCESSING_FAILED', message.error.message || 'Falha ao processar a fotografia.'));
        return;
      }
      if (!sameCaptureToken(message.result?.token, job.token)) return;
      pending = null;
      clearTimeout(job.timer);
      job.resolve(message.result);
    };
    current.onerror = () => { if (worker === current) reset(scanError('WORKER_ERROR', 'Falha no processamento. Capture a folha novamente.')); };
    current.onmessageerror = () => { if (worker === current) reset(scanError('WORKER_MESSAGE_ERROR', 'Não foi possível receber a fotografia processada.')); };
    return current;
  }
  function dispatch(payload, op) {
    try {
      if (disposed) throw scanError('DISPOSED', 'Processamento encerrado.');
      validateCaptureContext(payload);
      if (op === 'manual') validateSourceOptical(payload.sourceOptical);
      else if (!(payload.data instanceof Uint8ClampedArray) || payload.data.byteLength === 0)
        throw new TypeError('Fotografia RGBA inválida.');
      const token = {...payload.token};
      if (token.captureId <= lastCaptureId || token.sessionId < lastSessionId)
        throw scanError('STALE_CAPTURE', 'A captura já foi substituída.');
      lastCaptureId = token.captureId;
      lastSessionId = token.sessionId;
      if (pending) reset(scanError('CANCELLED', 'Captura substituída por uma fotografia mais recente.'));
      const current = ensureWorker();
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending?.id === id) reset(scanError('TIMEOUT', 'A digitalização demorou demais. Capture a folha novamente.'));
        }, timeoutMs);
        pending = {id, token, timer, resolve, reject};
        try {
          const input = op === 'manual' ? payload.sourceOptical.gray : payload.data;
          current.postMessage({id, op, payload: {...payload, token}}, [input.buffer]);
        }
        catch { reset(scanError('WORKER_MESSAGE_ERROR', 'Não foi possível enviar a fotografia para processamento.')); }
      });
    } catch (error) { return Promise.reject(error); }
  }
  return {
    process(payload) { return dispatch(payload, 'process'); },
    processManual(payload) { return dispatch(payload, 'manual'); },
    cancel() { reset(scanError('CANCELLED', 'Digitalização cancelada.')); },
    dispose() { disposed = true; reset(scanError('DISPOSED', 'Processamento encerrado.')); },
  };
}
