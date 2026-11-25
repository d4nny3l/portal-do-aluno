import {processCapture, processManual} from './processor.mjs';

self.onmessage = ({data: message}) => {
  const {id, op, payload} = message || {};
  try {
    if (op !== 'process' && op !== 'manual') throw new Error('Operação de digitalização inválida.');
    const result = op === 'manual' ? processManual(payload) : processCapture(payload);
    const transfer = [...new Set([
      ...(result.document ? [result.document.data.buffer] : []), result.optical.pixels.buffer, result.sourceOptical.gray.buffer,
    ])];
    self.postMessage({id, token: result.token, result}, transfer);
  } catch (error) {
    self.postMessage({id, token: payload?.token, error: {code: 'PROCESSING_FAILED', message: error?.message || 'Falha ao processar a fotografia.'}});
  }
};
