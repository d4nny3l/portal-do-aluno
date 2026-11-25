import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {processCapture, processManual, MAX_SIDE} from '../scan-safe/processor.mjs';
import {createScanWorker} from '../scan-safe/worker-client.mjs';
import {createTemplate, layoutTemplate} from '../omr/template.mjs';
import {readRaster} from '../omr/reader.mjs';

function payload(captureId = 1, sessionId = 1) {
  const template = createTemplate([{type: 'A-E', count: 10}], {identityMode: 'manual'});
  const manifest = layoutTemplate(template, {width: 420, height: 594}).manifest;
  const w = 20, h = 30;
  return {data: new Uint8ClampedArray(w * h * 4).fill(245), w, h, template, manifest, page: 1, showCode: false,
    token: {captureId, sessionId, templateId: template.templateId, templateRevision: template.revision, contentHash: manifest.contentHash, page: 1}};
}
function fixture(overrides = {}) {
  const calls = [];
  const points = [{x: 1, y: 1}, {x: 18, y: 1}, {x: 18, y: 28}, {x: 1, y: 28}];
  const input = payload();
  const opticalRGBA = new Uint8ClampedArray(input.w * input.h * 4).fill(90);
  const aligned = {pixels: new Uint8Array(1400 * 2).fill(80), width: 1400, height: 2};
  const reading = {templateId: input.template.templateId, templateRevision: input.template.revision,
    contentHash: input.manifest.contentHash, page: 1, pageCount: input.template.pageCount,
    identity: {state: 'review'}, observations: []};
  const deps = {
    vision: {
      frameCorners: (w, h) => { calls.push(['frame', w, h]); return [[0, 0], [w, 0], [w, h], [0, h]]; },
      outputSize: (corners, maxSide) => { calls.push(['size', maxSide, corners]); return {w: input.w, h: input.h}; },
      warp: (data, w, h, corners, ow, oh) => { calls.push(['perspective', data, corners, ow, oh]); return new Uint8ClampedArray(data); },
      enhance: (data, w, h, mode) => { calls.push(['enhance', mode]); return opticalRGBA; },
      rotate: (data, w, h, rot) => { calls.push(['rotate', rot]); return {data: new Uint8ClampedArray(data), w, h}; },
    },
    documentEnhance: (data, w, h, mode) => { calls.push(['document', mode]); return new Uint8ClampedArray(w * h * 4).fill(250); },
    detect: (gray, w, h, options) => { calls.push(['detect', gray, options]); assert.ok(gray.every(v => v === 90)); return {found: true, confidence: .7, corners: points}; },
    warp: (gray, w, h, corners, options) => { calls.push(['align', gray, corners, options]); return aligned; },
    read: (template, pixels, w, h, options) => { calls.push(['read', pixels, options]); return reading; },
    now: () => 1,
    ...overrides,
  };
  return {input, deps, calls, reading, aligned, points};
}

test('one native capture yields separate document and optical products and exactly one unchanged-reader invocation', () => {
  const f = fixture();
  const result = processCapture(f.input, f.deps);
  assert.equal(f.calls.filter(c => c[0] === 'read').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'perspective').length, 1);
  assert.equal(result.metrics.readCalls, 1);
  assert.equal(result.reading, f.reading);
  assert.equal(result.optical, f.aligned);
  assert.deepEqual(result.token, f.input.token);
  assert.equal(f.calls.find(c => c[0] === 'size')[1], MAX_SIDE);
  assert.deepEqual(f.calls.filter(c => ['enhance', 'document', 'rotate'].includes(c[0])).map(c => c.slice(0, 2)),
    [['enhance', 'gray'], ['rotate', 0], ['document', 'color'], ['rotate', 0]]);
  assert.notEqual(result.document.data.buffer, result.optical.pixels.buffer);
  assert.notEqual(result.document.data.buffer, result.sourceOptical.gray.buffer);
  assert.notEqual(result.optical.pixels.buffer, result.sourceOptical.gray.buffer);
  assert.equal(f.calls.find(c => c[0] === 'read')[1], f.aligned.pixels);
  assert.equal(f.calls.find(c => c[0] === 'read')[2].manifest, f.input.manifest);
  assert.deepEqual(f.calls.find(c => c[0] === 'align')[3], {outputWidth: 1400, manifest: f.input.manifest});
  assert.equal(result.reading.identity.state, 'review');
});

test('failed/weak fiducials keep last-photo manual raster with zero reader calls, no fallback', () => {
  for (const detection of [{found: false}, {found: true, confidence: .699, corners: [{}, {}, {}, {}]}]) {
    const f = fixture({detect: () => detection});
    const result = processCapture(f.input, f.deps);
    assert.equal(result.error.code, 'FIDUCIALS_NOT_FOUND');
    assert.equal(result.reading, null);
    assert.equal(result.metrics.readCalls, 0);
    assert.equal(result.optical.pixels, result.sourceOptical.gray);
    assert.equal(f.calls.filter(c => c[0] === 'read').length, 0);
    assert.equal(f.calls.filter(c => c[0] === 'align').length, 0);
    assert.ok(result.document.data.length > 0);
  }
});

test('manual fiducials refer to geometric optical raster; invalid manual points never trigger a read', () => {
  const f = fixture({detect: () => assert.fail('Manual points must not run auto detection')});
  const result = processCapture({...f.input, manualFiducials: f.points}, f.deps);
  assert.equal(result.metrics.readCalls, 1);
  assert.equal(f.calls.find(c => c[0] === 'align')[2], f.points);
  const failed = processCapture({...f.input, manualFiducials: []}, {...f.deps, warp: () => {throw new Error('Pontos inválidos');}});
  assert.equal(failed.error.code, 'FIDUCIALS_INVALID');
  assert.equal(failed.metrics.readCalls, 0);
});

test('explicit manual operation reuses gray unchanged for exactly one read and no enhancement', () => {
  const f = fixture();
  const sourceOptical = {gray: new Uint8Array(f.input.w * f.input.h).fill(90), width: f.input.w, height: f.input.h};
  const before = sourceOptical.gray.slice();
  const input = {...f.input, data: undefined, sourceOptical, manualFiducials: f.points,
    token: {...f.input.token, captureId: 2}};
  const result = processManual(input, f.deps);
  assert.equal(result.metrics.readCalls, 1);
  assert.deepEqual(f.calls.map(c => c[0]), ['align', 'read']);
  assert.equal(result.document, undefined);
  assert.equal(result.sourceOptical, sourceOptical);
  assert.deepEqual(sourceOptical.gray, before);
  assert.equal(f.calls[0][1], sourceOptical.gray);
  assert.equal(f.calls[0][2], f.points);
  assert.equal(result.reading, f.reading);
  assert.equal(result.token.captureId, 2);
  assert.notEqual(result.optical.pixels.buffer, sourceOptical.gray.buffer);
  assert.throws(() => processManual({...input, token: {...input.token, page: 2}}, f.deps), /Contexto/);
  assert.throws(() => processManual({...input, sourceOptical: {...sourceOptical, width: 21}}, f.deps), /Raster/);
  assert.equal(f.calls.filter(c => c[0] === 'read').length, 1);
});

test('context mismatch is rejected before processing; returned reader context must be exact', () => {
  const f = fixture();
  for (const change of [
    {page: 2}, {token: {...f.input.token, contentHash: 'wrong'}},
    {manifest: {...f.input.manifest, revision: 123}}, {data: new Uint8Array(2400)},
    {corners: [[0, 0], [1, 1], [0, 1], [1, 0]]},
  ]) assert.throws(() => processCapture({...f.input, ...change}, f.deps));
  assert.equal(f.calls.length, 0);
  for (const [key, value] of [['contentHash', 'wrong'], ['page', 2], ['pageCount', 2], ['templateRevision', 123], ['templateId', 'wrong']]) {
    let reads = 0;
    assert.throws(() => processCapture(f.input, {...f.deps, read: () => { reads++; return {...f.reading, [key]: value}; }}), /modelo confirmado/);
    assert.equal(reads, 1);
  }
});

test('embedded output width follows frozen single-optical dimensions', () => {
  const f = fixture();
  const embedded = {...f.input.manifest, mode: 'embedded', paper: {widthMm: 112, heightMm: 260}};
  processCapture({...f.input, manifest: embedded}, f.deps);
  assert.equal(f.calls.find(c => c[0] === 'align')[3].outputWidth, Math.min(1400, Math.floor(2200 * 112 / 260)));
});

test('real native RGBA and frozen optics preserve ten known A marks with one official read', () => {
  const input = payload(), w = 420, h = 594;
  const layout = layoutTemplate(input.template, {width: w, height: h, manifest: input.manifest});
  const gray = new Uint8Array(w * h).fill(255);
  for (const p of layout.fiducials)
    for (let y = Math.floor(p.y - p.size / 2); y <= Math.ceil(p.y + p.size / 2); y++)
      for (let x = Math.floor(p.x - p.size / 2); x <= Math.ceil(p.x + p.size / 2); x++) gray[y * w + x] = 0;
  for (const cell of layout.cells) {
    const b = cell.bubbles[0], r = cell.bubbleRadius;
    for (let y = Math.floor(b.y - r); y <= Math.ceil(b.y + r); y++)
      for (let x = Math.floor(b.x - r); x <= Math.ceil(b.x + r); x++)
        if ((x - b.x) ** 2 + (y - b.y) ** 2 <= r * r) gray[y * w + x] = 0;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < gray.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i];
    data[i * 4 + 3] = 255;
  }
  let readCalls = 0;
  const result = processCapture({...input, data, w, h}, {read: (...args) => {readCalls++; return readRaster(...args);}});
  assert.equal(readCalls, 1);
  assert.equal(result.metrics.readCalls, 1);
  assert.equal(result.error, undefined);
  assert.equal(result.reading.observations.length, 10);
  assert.ok(result.reading.observations.every(o => o.state === 'read' && o.answer === 'A'));
});

class FakeWorker {
  static instances = [];
  constructor(url, options) { this.url = url; this.options = options; this.terminated = false; FakeWorker.instances.push(this); }
  postMessage(message, transfer) { this.message = structuredClone(message, {transfer}); this.transferred = transfer; }
  terminate() { this.terminated = true; }
  respond(change = {}) {
    const {id, payload} = this.message;
    this.onmessage?.({data: {id, token: payload.token, result: {token: payload.token}, ...change}});
  }
}
const latest = () => FakeWorker.instances.at(-1);
test('client transfers RGBA input, validates token, accepts one matching response', async () => {
  const client = createScanWorker({WorkerClass: FakeWorker});
  const input = payload();
  const promise = client.process(input);
  const worker = latest();
  assert.equal(input.data.byteLength, 0);
  assert.equal(worker.message.payload.data.byteLength, 2400);
  assert.equal(worker.options.type, 'module');
  worker.respond();
  assert.deepEqual((await promise).token, input.token);
  await assert.rejects(client.process(payload(1)), {code: 'STALE_CAPTURE'});
  client.dispose();
  assert.equal(worker.terminated, true);
});

test('manual client transfers gray as a new operation and enforces capture/context monotonicity', async () => {
  const client = createScanWorker({WorkerClass: FakeWorker});
  const original = client.process(payload());
  latest().respond();
  await original;
  const base = payload(2), sourceOptical = {gray: new Uint8Array(600).fill(91), width: 20, height: 30};
  const {data, ...context} = base;
  const input = {...context, sourceOptical, manualFiducials: [{x: 1, y: 1}, {x: 18, y: 1}, {x: 18, y: 28}, {x: 1, y: 28}]};
  const manual = client.processManual(input);
  assert.equal(sourceOptical.gray.byteLength, 0);
  assert.equal(latest().message.op, 'manual');
  assert.equal(latest().message.payload.data, undefined);
  assert.ok(latest().message.payload.sourceOptical.gray.every(v => v === 91));
  latest().respond();
  assert.equal((await manual).token.captureId, 2);
  const freshSource = {gray: new Uint8Array(600), width: 20, height: 30};
  await assert.rejects(client.processManual({...input, sourceOptical: freshSource}), {code: 'STALE_CAPTURE'});
  await assert.rejects(client.processManual({...input, sourceOptical: freshSource, token: {...input.token, captureId: 3, contentHash: 'wrong'}}), /Contexto/);
  assert.equal(freshSource.gray.byteLength, 600);
  client.dispose();
});

test('client cancel/replacement discards obsolete responses and never resolves a different context', async () => {
  const client = createScanWorker({WorkerClass: FakeWorker});
  const first = client.process(payload());
  const rejected = assert.rejects(first, {code: 'CANCELLED'});
  const old = latest(), oldHandler = old.onmessage;
  const second = client.process(payload(2));
  const current = latest();
  await rejected;
  oldHandler({data: {id: old.message.id, token: old.message.payload.token, result: {token: old.message.payload.token}}});
  current.respond({token: {...current.message.payload.token, sessionId: 100}});
  current.respond({result: {token: {...current.message.payload.token, contentHash: 'wrong'}}});
  current.respond();
  assert.equal((await second).token.captureId, 2);
  const third = client.process(payload(3));
  const cancelled = assert.rejects(third, {code: 'CANCELLED'});
  client.cancel();
  await cancelled;
  assert.equal(current.terminated, true);
  client.dispose();
  await assert.rejects(client.process(payload(4)), {code: 'DISPOSED'});
});

test('client timeout and Worker failures terminate buffers, then allow a fresh Worker', async () => {
  const client = createScanWorker({WorkerClass: FakeWorker, timeoutMs: 15});
  await assert.rejects(client.process(payload()), {code: 'TIMEOUT'});
  assert.equal(latest().terminated, true);
  for (const [captureId, failure, code] of [
    [2, w => w.onerror({message: 'private pixels must not enter errors'}), 'WORKER_ERROR'],
    [3, w => w.onmessageerror(), 'WORKER_MESSAGE_ERROR'],
    [4, w => w.respond({error: {code: 'PROCESSING_FAILED', message: 'Falha segura'}}), 'PROCESSING_FAILED'],
  ]) {
    const pending = client.process(payload(captureId));
    const rejection = assert.rejects(pending, {code});
    failure(latest());
    await rejection;
    assert.equal(latest().terminated, true);
  }
  const last = client.process(payload(5));
  latest().respond();
  await last;
  client.dispose();
});

test('client explicitly refuses unavailable Worker and never reads on main thread', async () => {
  const client = createScanWorker({WorkerClass: null});
  const input = payload();
  await assert.rejects(client.process(input), {code: 'WORKER_UNAVAILABLE'});
  assert.equal(input.data.byteLength, 2400);
  client.dispose();
  class ThrowWorker {constructor() {throw new Error('Worker creation blocked');}}
  await assert.rejects(createScanWorker({WorkerClass: ThrowWorker}).process(payload()), /creation blocked/);
});

test('module Worker transfers separate document/optical buffers from real frozen processing', async () => {
  const workerUrl = new URL('../scan-safe/worker.mjs', import.meta.url).href;
  const bridge = `import {parentPort} from 'node:worker_threads';
    globalThis.self = {postMessage: (message, transfer) => parentPort.postMessage(message, transfer)};
    await import(${JSON.stringify(workerUrl)});
    parentPort.on('message', message => self.onmessage({data: message}));`;
  const worker = new NodeWorker(new URL(`data:text/javascript,${encodeURIComponent(bridge)}`), {type: 'module'});
  try {
    const input = payload();
    const resultPromise = new Promise((resolve, reject) => {worker.once('message', resolve); worker.once('error', reject);});
    worker.postMessage({id: 1, op: 'process', payload: input}, [input.data.buffer]);
    assert.equal(input.data.byteLength, 0);
    const {result, error} = await resultPromise;
    assert.equal(error, undefined);
    assert.equal(result.error.code, 'FIDUCIALS_NOT_FOUND');
    assert.equal(result.metrics.readCalls, 0);
    assert.equal(result.reading, null);
    assert.ok(result.document.data instanceof Uint8ClampedArray);
    assert.ok(result.sourceOptical.gray instanceof Uint8Array);
    assert.equal(result.optical.pixels.buffer, result.sourceOptical.gray.buffer);
    assert.notEqual(result.document.data.buffer, result.sourceOptical.gray.buffer);
    assert.ok(Math.max(result.document.w, result.document.h) <= MAX_SIDE);
    const before = result.sourceOptical.gray.slice();
    const manualResponse = new Promise((resolve, reject) => {worker.once('message', resolve); worker.once('error', reject);});
    const {data, ...context} = input;
    worker.postMessage({id: 2, op: 'manual', payload: {...context, token: {...context.token, captureId: 2},
      sourceOptical: result.sourceOptical, manualFiducials: [{x: 1, y: 1}, {x: 18, y: 1}, {x: 18, y: 28}, {x: 1, y: 28}]}}, [result.sourceOptical.gray.buffer]);
    assert.equal(result.sourceOptical.gray.byteLength, 0);
    const manual = await manualResponse;
    assert.equal(manual.error, undefined);
    assert.equal(manual.result.error, undefined);
    assert.equal(manual.result.document, undefined);
    assert.equal(manual.result.metrics.readCalls, 1);
    assert.equal(manual.result.reading.contentHash, input.manifest.contentHash);
    assert.deepEqual(manual.result.sourceOptical.gray, before);
    assert.notEqual(manual.result.optical.pixels.buffer, manual.result.sourceOptical.gray.buffer);
  } finally { await worker.terminate(); }
});
