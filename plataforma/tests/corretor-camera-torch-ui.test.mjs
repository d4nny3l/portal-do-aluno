import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createSafeCamera} from '../../corretor/v2/scan-safe/camera.mjs';
import {createCaptureSession} from '../../corretor/v2/scan-safe/session.mjs';

const html = readFileSync(new URL('../corretor-v2.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../corretor-v2.css', import.meta.url), 'utf8');
function section(start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Current production section: ${start}`);
  return html.slice(from, to);
}
const photoSource = section('let rawRaster=null', 'function scanModelNotice(');
const cameraSource = section('function drawScanContour(', "$('loadManifest').onchange=");

function eventTarget(extra = {}) {
  const handlers = new Map();
  return Object.assign({
    addEventListener(name, handler, options) {
      const entries = handlers.get(name) || [];
      entries.push({handler, once: !!options?.once}); handlers.set(name, entries);
    },
    removeEventListener(name, handler) {
      handlers.set(name, (handlers.get(name) || []).filter(entry => entry.handler !== handler));
    },
    emit(name) {
      for (const entry of [...(handlers.get(name) || [])]) {
        if (entry.once) this.removeEventListener(name, entry.handler);
        entry.handler({target: this});
      }
    },
  }, extra);
}
function stream({torch = true, lit = false, apply} = {}) {
  const constraints = [];
  const track = eventTarget({stops: 0, lit, readyState: 'live',
    getCapabilities: () => ({torch, focusMode: ['continuous']}),
    getSettings() { return {width: 1920, height: 1080, torch: this.lit}; },
    stop() { this.stops++; this.readyState = 'ended'; this.lit = false; },
    async applyConstraints(value) {
      constraints.push(value);
      if (apply) await apply(value);
      if (this.readyState !== 'ended' && value.advanced?.[0]?.torch !== undefined) this.lit = value.advanced[0].torch;
    },
  });
  return {value: {getTracks: () => [track], getVideoTracks: () => [track]}, track, constraints};
}
function harness({streams = [stream()], acquire, userAgent = 'iPhone AppleWebKit Safari'} = {}) {
  const elements = new Map(), requests = [], jobs = [], reads = [], paint = [], frames = new Map();
  let options, cancellations = 0, nextFrame = 1;
  function element(id = '') {
    if (id && elements.has(id)) return elements.get(id);
    const attrs = new Map(), classes = new Set();
    const ctx = {
      drawImage() {}, putImageData(image) { paint.push(image); },
      getImageData(x, y, w, h) { return {data: new Uint8ClampedArray(w * h * 4).fill(245)}; },
      createImageData(w, h) { return {data: new Uint8ClampedArray(w * h * 4)}; },
    };
    const el = eventTarget({id, hidden: true, disabled: false, dataset: {}, value: '', textContent: '', width: 0, height: 0,
      classList: {add(name) {classes.add(name);}, remove(name) {classes.delete(name);}, contains: name => classes.has(name)},
      style: {}, setAttribute(key, value) {attrs.set(key, String(value));}, getAttribute: key => attrs.get(key) ?? null,
      replaceChildren() {}, append() {}, getContext: () => ctx,
      querySelector(selector) {return element(id + ':' + selector);},
      getBoundingClientRect: () => ({width: 390, height: 219}),
    });
    if (id) elements.set(id, el);
    return el;
  }
  const video = element('video');
  Object.assign(video, {videoWidth: 1920, videoHeight: 1080, readyState: 4, paused: false, srcObject: null,
    parentElement: element('cameraStage'), play() {this.paused = false; return Promise.resolve();}, pause() {this.paused = true;}});
  const file = element('file');
  const doc = eventTarget({hidden: false, querySelectorAll: () => [file], createElement: () => element(), createElementNS: () => element()});
  const win = eventTarget({innerWidth: 390, innerHeight: 844, visualViewport: eventTarget({width: 390, height: 844}),
    requestAnimationFrame(callback) {const id = nextFrame++; frames.set(id, callback); return id;},
    cancelAnimationFrame(id) {frames.delete(id);}});
  const mediaDevices = {async getUserMedia(constraints) {
    requests.push(constraints);
    return acquire ? acquire(constraints, requests.length) : streams[requests.length - 1].value;
  }};
  const worker = {
    cancel() {cancellations++;},
    process(payload) {return new Promise((resolve, reject) => jobs.push({payload, resolve, reject}));},
  };
  const template = {templateId: 'synthetic', revision: 8, pageCount: 1, identity: {mode: 'manual'}};
  const manifest = {templateId: template.templateId, revision: 8, contentHash: 'synthetic-hash'};
  const state = {
    $: element, document: doc, window: win, cameraStream: null, template, activeManifest: manifest, assessmentBank: null,
    createCaptureSession, createScanWorker: () => worker,
    createSafeCamera(config) {options = config; return createSafeCamera({...config, mediaDevices, userAgent, window: win, document: doc});},
    ensureScanTemplate() {}, readNormalized(reading, context) {reads.push({reading, context});},
    ImageData: class {constructor(data, width, height) {Object.assign(this, {data, width, height});}},
  };
  element('scanPage').value = '1';
  vm.createContext(state);
  vm.runInContext(photoSource + '\n' + cameraSource, state, {timeout: 2000});
  return {state, element, video, win, doc, requests, streams, jobs, reads, paint, frames,
    camera: vm.runInContext('safeCamera', state), get options() {return options;},
    get cancellations() {return cancellations;}, get: expression => vm.runInContext(expression, state)};
}
const photo = () => ({data: new Uint8ClampedArray(4 * 5 * 4), w: 4, h: 5});
function finish(job, label) {
  const {token} = job.payload;
  job.resolve({token, document: {data: new Uint8ClampedArray(4 * 5 * 4), w: 4, h: 5},
    sourceOptical: {gray: new Uint8Array(20), width: 4, height: 5},
    optical: {pixels: new Uint8Array(20), width: 4, height: 5}, reading: {label}});
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('current UI wires the safe camera with native preview, accessible torch and no manual lens controls', () => {
  assert.match(html, /import \{createSafeCamera\} from '\.\.\/corretor\/v2\/scan-safe\/camera\.mjs'/);
  assert.match(html, /<canvas id="cameraPreview" hidden aria-hidden="true"/);
  assert.match(html, /<button id="cameraTorchButton"[^>]*hidden disabled aria-pressed="false" aria-label="Ligar iluminação da câmera"/);
  assert.match(html, /id="cameraTorchButton"[^>]*>\s*<span aria-hidden="true">💡<\/span> Luz/);
  assert.match(html, /<input id="read" type="hidden" aria-hidden="true">/);
  assert.match(html, /<button id="manualAlign"[^>]*hidden>/);
  assert.doesNotMatch(html, /id="bankTestEntry"|id="cameraDevice"|id="cameraFocus"|id="cameraZoom"|class="camera-settings"/);
  assert.match(css, /\.camera-stage video\{object-position:center;transform:none\}/);
  const h = harness();
  assert.equal(h.options.video, h.video);
  assert.equal(h.options.preview, h.element('cameraPreview'));
  assert.equal(h.options.suspended(), false);
  h.element('read').disabled = true;
  assert.equal(h.options.suspended(), true);
});

test('supported torch changes the live track and accessible UI; closing camera releases stream and light', async () => {
  const h = harness(), button = h.element('cameraTorchButton'), track = h.streams[0].track;
  await h.element('camera').onclick();
  assert.equal(h.element('camera').textContent, 'Fechar câmera');
  assert.equal(h.element('cameraStage').hidden, false);
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  await button.onclick();
  assert.equal(track.lit, true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Desligar iluminação da câmera');
  await button.onclick();
  assert.equal(track.lit, false);
  await button.onclick();
  assert.deepEqual(h.streams[0].constraints, [{advanced: [{torch: true}]}, {advanced: [{torch: false}]}, {advanced: [{torch: true}]}]);
  h.element('camera').onclick();
  assert.equal(track.stops, 1);
  assert.equal(track.lit, false);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.state.cameraStream, null);
  assert.equal(h.element('cameraStage').hidden, true);
  assert.equal(h.element('camera').textContent, 'Abrir câmera');
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('unsupported torch remains absent; a rejected supported lamp keeps the active camera usable', async () => {
  const unsupported = harness({streams: [stream({torch: false})]});
  await unsupported.state.startCamera();
  assert.equal(unsupported.element('cameraTorchButton').hidden, true);
  assert.equal(unsupported.element('cameraTorchButton').disabled, true);
  assert.equal(unsupported.camera.active, true);
  assert.equal(unsupported.streams[0].constraints.length, 0);
  unsupported.state.stopCamera();
  const failed = harness({streams: [stream({apply: async () => {throw Error('Unavailable');}})]});
  await failed.state.startCamera();
  await failed.element('cameraTorchButton').onclick();
  assert.equal(failed.element('cameraTorchButton').getAttribute('aria-pressed'), 'false');
  assert.equal(failed.element('cameraTorchButton').disabled, false);
  assert.match(failed.element('cameraGuideStatus').textContent, /Iluminação indisponível/);
  assert.equal(failed.camera.active, true);
  assert.equal(failed.streams[0].track.stops, 0);
  failed.state.stopCamera();
});

test('ending the live track resets the actual camera UI and preview without a manual stop', async () => {
  const h = harness();
  await h.state.startCamera();
  await h.element('cameraTorchButton').onclick();
  h.streams[0].track.emit('ended');
  assert.equal(h.camera.active, false);
  assert.equal(h.state.cameraStream, null);
  assert.equal(h.element('cameraStage').hidden, true);
  assert.equal(h.element('cameraTorchButton').hidden, true);
  assert.equal(h.element('cameraTorchButton').getAttribute('aria-pressed'), 'false');
  assert.equal(h.element('cameraPreview').width, 0);
  assert.equal(h.frames.size, 0);
});

test('track ending invalidates a pending capture before a reopened camera can accept its old Worker result', async () => {
  const h = harness({streams: [stream(), stream()]});
  await h.state.startCamera();
  const oldCapture = h.options.onCapture(photo());
  assert.equal(h.get('captureBusy'), true);
  const cancellationsBeforeEnd = h.cancellations;
  h.streams[0].track.emit('ended');
  assert.equal(h.camera.active, false);
  assert.equal(h.get('captureBusy'), false);
  assert.equal(h.get('scanContext.current'), null);
  assert.ok(h.cancellations > cancellationsBeforeEnd);
  await h.state.startCamera();
  h.element('cameraGuideStatus').textContent = 'Nova câmera pronta';
  finish(h.jobs[0], 'old camera session'); await oldCapture;
  assert.equal(h.reads.length, 0);
  assert.equal(h.get('currentDocument'), null);
  assert.equal(h.get('currentReading'), null);
  assert.equal(h.element('cameraGrade').hidden, true);
  assert.equal(h.element('cameraGuideStatus').textContent, 'Nova câmera pronta');
  const currentCapture = h.options.onCapture(photo());
  finish(h.jobs[1], 'current camera session'); await currentCapture;
  assert.equal(h.reads.length, 1);
  assert.equal(h.reads[0].reading.label, 'current camera session');
  h.state.stopCamera();
});

test('late lamp completion cannot overwrite a newly opened camera or its torch state', async () => {
  let release;
  const old = stream({apply: () => new Promise(resolve => {release = resolve;})});
  const fresh = stream({lit: true});
  const h = harness({streams: [old, fresh]});
  await h.state.startCamera();
  const pending = h.element('cameraTorchButton').onclick();
  assert.equal(h.element('cameraTorchButton').disabled, true);
  h.state.stopCamera();
  await h.state.startCamera();
  const button = h.element('cameraTorchButton');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  h.element('cameraGuideStatus').textContent = 'Nova câmera pronta';
  release(); await pending;
  assert.equal(h.state.cameraStream, fresh.value);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Desligar iluminação da câmera');
  assert.equal(button.disabled, false);
  assert.equal(h.element('cameraGuideStatus').textContent, 'Nova câmera pronta');
  h.state.stopCamera();
});

test('late lamp completion after close cannot revive the button or replace the current message', async () => {
  let release;
  const h = harness({streams: [stream({apply: () => new Promise(resolve => {release = resolve;})})]});
  await h.state.startCamera();
  const pending = h.element('cameraTorchButton').onclick();
  h.state.stopCamera();
  h.element('cameraGuideStatus').textContent = 'Câmera fechada';
  release(); await pending;
  assert.equal(h.element('cameraTorchButton').hidden, true);
  assert.equal(h.element('cameraTorchButton').disabled, true);
  assert.equal(h.element('cameraGuideStatus').textContent, 'Câmera fechada');
});

test('Safari UI picker cancellation, rotation and background resume preserve the same native acquisition', async () => {
  const h = harness();
  await h.state.startCamera();
  const sameStream = h.video.srcObject;
  assert.deepEqual(h.requests, [{video: {facingMode: 'environment', width: {ideal: 1920}, height: {ideal: 1080}}, audio: false}]);
  h.element('file').emit('click'); h.video.paused = true; h.element('file').emit('cancel');
  await settle();
  h.video.videoWidth = 1080; h.video.videoHeight = 1920;
  h.win.emit('orientationchange'); h.win.visualViewport.emit('resize');
  h.doc.hidden = true; h.doc.emit('visibilitychange');
  h.video.paused = true; h.doc.hidden = false; h.doc.emit('visibilitychange');
  await settle();
  assert.equal(h.requests.length, 1);
  assert.equal(h.video.srcObject, sameStream);
  assert.equal(h.streams[0].constraints.length, 0, 'No focus/zoom/size renegotiation in Safari');
  assert.equal(h.video.paused, false);
  assert.equal(h.element('cameraStage').hidden, false);
  h.state.stopCamera();
});

test('canceling the opening button stops a late permission stream and keeps the closed UI', async () => {
  let release;
  const pendingStream = stream();
  const h = harness({acquire: () => new Promise(resolve => {release = resolve;})});
  const opening = h.element('camera').onclick();
  assert.equal(h.element('camera').textContent, 'Cancelar abertura');
  h.element('camera').onclick();
  assert.equal(h.element('camera').textContent, 'Abrir câmera');
  release(pendingStream.value); await opening;
  assert.equal(pendingStream.track.stops, 1);
  assert.equal(h.element('cameraStage').hidden, true);
  assert.equal(h.element('cameraTorchButton').hidden, true);
  assert.equal(h.video.srcObject, null);
});

test('a native acquisition rejected after opening cancellation cannot request a fallback camera', async () => {
  let rejectAcquisition;
  const fallback = stream();
  const h = harness({acquire: (_constraints, request) => request === 1
    ? new Promise((_resolve, reject) => {rejectAcquisition = reject;})
    : Promise.resolve(fallback.value)});
  const opening = h.element('camera').onclick();
  h.element('camera').onclick();
  rejectAcquisition(Object.assign(Error('Resolution failed after cancellation'), {name: 'OverconstrainedError'}));
  await opening;
  assert.equal(h.requests.length, 1, 'Canceled acquisition cannot reopen a lens through fallback');
  assert.equal(h.camera.active, false);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.element('camera').textContent, 'Abrir câmera');
  assert.equal(h.element('cameraStage').hidden, true);
  assert.equal(h.element('cameraTorchButton').hidden, true);
});

test('camera progress preserves the previous grade until capture; late Worker result cannot cross a new photograph', async () => {
  const h = harness({streams: [stream(), stream()]});
  h.element('cameraGrade').hidden = false;
  h.element('cameraGradeValue').textContent = '8,0';
  await h.state.startCamera();
  h.options.onStatus('Procurando a folha inteira…', {stable: 1, phase: 'watching'});
  assert.equal(h.element('cameraGrade').hidden, false);
  assert.equal(h.element('cameraGradeValue').textContent, '8,0');
  const oldCapture = h.options.onCapture(photo());
  assert.equal(h.element('cameraGrade').hidden, true);
  assert.equal(h.element('cameraGradeValue').textContent, '');
  assert.equal(h.element('scanFlash').classList.contains('go'), true);
  assert.equal(h.jobs.length, 1);
  assert.equal(h.options.suspended(), true);
  h.state.stopCamera();
  assert.equal(h.get('captureBusy'), false);
  await h.state.startCamera();
  const nextCapture = h.options.onCapture(photo());
  assert.equal(h.jobs.length, 2);
  finish(h.jobs[1], 'current'); await nextCapture;
  assert.equal(h.reads.length, 1);
  assert.equal(h.reads[0].reading.label, 'current');
  const currentDocument = h.get('currentDocument');
  finish(h.jobs[0], 'obsolete'); await oldCapture;
  assert.equal(h.reads.length, 1);
  assert.equal(h.get('currentDocument'), currentDocument);
  assert.ok(h.cancellations >= 3);
  assert.equal(h.get('captureBusy'), false);
  h.state.stopCamera();
});
