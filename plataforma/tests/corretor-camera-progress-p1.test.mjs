import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CAMERA_POLICY, createPaperTracker} from '../../corretor/v2/scan-safe/camera.mjs';
import {createCaptureSession} from '../../corretor/v2/scan-safe/session.mjs';

const html = readFileSync(new URL('../corretor-v2.html', import.meta.url), 'utf8');
function section(start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Current production section: ${start}`);
  return html.slice(from, to);
}
const source = [
  section('let rawRaster=null', 'function scanModelNotice('),
  section('function readNormalized(', "$('manualAlign').onclick="),
  section('function drawScanContour(', "$('loadManifest').onchange="),
].join('\n');
const paper = {score: .9, support: .8, corners: [[30, 30], [354, 30], [354, 500], [30, 500]]};
const landscape = {score: .9, support: .8, corners: [[30, 30], [500, 30], [500, 354], [30, 354]]};
const scene = edge => ({valid: true, energy: .1, edges: Array(264).fill(edge)});
const photo = () => ({data: new Uint8ClampedArray(20 * 30 * 4), w: 20, h: 30,
  corners: [[1, 1], [19, 1], [19, 29], [1, 29]]});

function setup() {
  const elements = new Map(), jobs = [], rendered = [];
  let callbacks, time = 0;
  const tracker = createPaperTracker();
  function $(id = '') {
    if (id && elements.has(id)) return elements.get(id);
    const attributes = new Map(), classes = new Set();
    const element = {id, hidden: true, disabled: false, dataset: {}, textContent: '', value: '', width: 0, height: 0,
      children: [], classList: {add(name) {classes.add(name);}, remove(name) {classes.delete(name);}},
      setAttribute(name, value) {attributes.set(name, String(value));}, getAttribute: name => attributes.get(name) ?? null,
      append(child) {this.children.push(child);}, replaceChildren(...children) {this.children = children;},
      querySelector(selector) {return $(id + ':' + selector);},
      getContext: () => ({putImageData() {}}),
    };
    if (id) elements.set(id, element);
    return element;
  }
  const worker = {cancel() {}, process(payload) {return new Promise((resolve, reject) => jobs.push({payload, resolve, reject}));}};
  const template = {templateId: 'synthetic', revision: 8, pageCount: 1, identity: {mode: 'manual'}};
  const manifest = {templateId: template.templateId, revision: 8, contentHash: 'synthetic-hash'};
  const state = {$, template, activeManifest: manifest, assessmentBank: null, cameraStream: null,
    document: {createElement: () => $(), createElementNS: () => $()},
    createCaptureSession, createScanWorker: () => worker,
    // Only acquisition is omitted here: invoke the CURRENT HTML callbacks with
    // real tracker observations. Camera/MediaStream lifecycle has its own UI test.
    createSafeCamera(options) {callbacks = options; return {active: true, stop() {}};},
    ensureScanTemplate() {}, renderAnswers(result) {rendered.push(result);}, renderHistory() {},
    ImageData: class {constructor(data, width, height) {Object.assign(this, {data, width, height});}},
  };
  $('scanPage').value = '1';
  vm.createContext(state); vm.runInContext(source, state, {timeout: 2000});
  function observe({quad = paper, signature = scene(0), at, width = 384, height = 540} = {}) {
    time = at ?? time + CAMERA_POLICY.LOOP_MS;
    const observation = tracker.observe(quad, width, height, signature, time);
    callbacks.onContour(observation.corners, width, height);
    callbacks.onStatus(observation.message, observation);
    return observation;
  }
  function ready(options = {}) {
    let observation;
    for (let i = 0; i <= CAMERA_POLICY.STEADY_FRAMES; i++) {
      observation = observe(options);
      if (observation.captureId) return observation;
    }
    return observation;
  }
  function resolve(job, {review = false, identityPending = false, failure = false, hash} = {}) {
    const {token} = job.payload;
    const reading = failure ? null : {templateId: token.templateId, templateRevision: token.templateRevision,
      contentHash: hash ?? token.contentHash, page: token.page, pageCount: template.pageCount,
      identity: {state: identityPending ? 'review' : 'disabled', code: null}, needsReview: review || identityPending,
      observations: [{questionId: 'synthetic-q1', number: 1, state: review ? 'review' : 'read', answer: review ? null : 'A'}]};
    job.resolve({token, document: {data: new Uint8ClampedArray(20 * 30 * 4), w: 20, h: 30},
      sourceOptical: {gray: new Uint8Array(600), width: 20, height: 30},
      optical: {pixels: new Uint8Array(600), width: 20, height: 30}, reading,
      ...(failure ? {error: {message: 'Marcadores insuficientes. Confira os quatro marcadores.'}} : {})});
  }
  return {state, $, tracker, callbacks, jobs, rendered, observe, ready, resolve,
    get: expression => vm.runInContext(expression, state)};
}
function indicators(h) {
  return ['cameraStableStatus', 'cameraCaptureStatus', 'cameraReadStatus'].map(id => !h.$(id).hidden);
}

test('ten stable observations expose capture progress, and only a matching Worker reading can recognize the card', async () => {
  const h = setup();
  for (let i = 0; i < CAMERA_POLICY.STEADY_FRAMES; i++) {
    const observation = h.observe();
    assert.equal(observation.captureId, undefined);
    assert.deepEqual(indicators(h), [false, false, false]);
    assert.equal(h.jobs.length, 0);
  }
  const observation = h.observe();
  assert.equal(observation.stable, 10);
  assert.equal(observation.phase, 'locked');
  assert.deepEqual(indicators(h), [true, true, false]);
  const capture = photo(), pending = h.callbacks.onCapture(capture);
  assert.equal(h.jobs.length, 1);
  assert.equal(h.jobs[0].payload.data, capture.data);
  assert.deepEqual(h.jobs[0].payload.corners, capture.corners);
  assert.equal(h.callbacks.suspended(), true);
  assert.equal(h.rendered.length, 0);
  assert.equal(h.get('currentReading'), null);
  assert.equal(h.$('cameraReadStatus').hidden, true);
  h.resolve(h.jobs[0]); await pending;
  assert.deepEqual(indicators(h), [true, true, true]);
  assert.equal(h.rendered.length, 1);
  assert.equal(h.get('scanHistory.length'), 1);
  assert.equal(h.get('captureBusy'), false);
  assert.equal(h.tracker.finish(observation.captureId), true);
});

test('geometric failure and Worker error show recovery without claiming recognition or rearming the stationary sheet', async () => {
  for (const failure of ['fiducials', 'worker']) {
    const h = setup(), observation = h.ready();
    h.$('scanScore').dataset.stale = 'false';
    h.$('cameraGrade').hidden = false;
    const pending = h.callbacks.onCapture(photo());
    if (failure === 'fiducials') h.resolve(h.jobs[0], {failure: true});
    else h.jobs[0].reject(Error('Falha no Worker. Capture a folha novamente.'));
    await pending;
    assert.deepEqual(indicators(h), [true, true, false]);
    assert.equal(h.rendered.length, 0);
    assert.equal(h.get('scanHistory.length'), 0);
    assert.equal(h.$('scanScore').dataset.stale, 'true');
    assert.equal(h.$('cameraGrade').hidden, true);
    assert.equal(h.get('captureBusy'), false);
    assert.match(h.$('status').textContent, failure === 'fiducials' ? /marcadores/ : /Falha no Worker/);
    if (failure === 'fiducials') {
      assert.equal(h.$('manualAlign').hidden, false);
      assert.equal(h.get('rawRaster.width'), 20);
      assert.equal(h.$('canvas').hidden, false);
    }
    h.tracker.finish(observation.captureId);
    const locked = h.observe({at: 100000});
    assert.equal(locked.captureId, undefined);
    assert.equal(locked.phase, 'locked');
    assert.equal(h.jobs.length, 1, 'Failed processing does not authorize another photo of the same sheet');
  }
});

test('inconclusive or identity-pending reading never claims recognized; a foreign reader hash is rejected', async () => {
  for (const result of [{review: true}, {identityPending: true}, {hash: 'another-model'}]) {
    const h = setup(); h.ready();
    const pending = h.callbacks.onCapture(photo());
    h.resolve(h.jobs[0], result); await pending;
    assert.equal(h.$('cameraReadStatus').hidden, true);
    if (result.hash) {
      assert.equal(h.rendered.length, 0);
      assert.equal(h.get('currentReading'), null);
      assert.equal(h.get('scanHistory.length'), 0);
    } else {
      assert.equal(h.rendered.length, 1);
      assert.equal(h.get('scanHistory.length'), 1);
      assert.match(h.$('status').textContent, result.identityPending ? /Identificação pendente/ : /respostas inconclusivas/);
      assert.equal(h.get('activeHistoryEntry.identityPending'), !!result.identityPending);
    }
  }
});

test('structural withdrawal clears capture progress; brief losses and unchanged desk structure preserve the lock', async () => {
  const h = setup(), first = h.ready();
  const pending = h.callbacks.onCapture(photo()); h.resolve(h.jobs[0]); await pending;
  h.tracker.finish(first.captureId);
  // Brightness/clock changes with the same edge signature do not prove removal.
  for (const at of [1000, 5000, 30000, 90000]) {
    const observation = h.observe({quad: null, signature: scene(0), at});
    assert.equal(observation.phase, 'locked');
    assert.equal(h.$('cameraCaptureStatus').hidden, false);
  }
  h.observe({quad: null, signature: scene(.1), at: 90100});
  h.observe({quad: null, signature: scene(.1), at: 90400});
  assert.equal(h.observe({at: 90450}).phase, 'locked', 'Sheet returning interrupts structural withdrawal proof');
  for (const at of [91000, 91200, 91450, 91700]) h.observe({quad: null, signature: scene(.1), at});
  assert.equal(h.tracker.snapshot().phase, 'vacant');
  assert.deepEqual(indicators(h), [false, false, false]);
  const next = h.ready();
  assert.ok(next.captureId > first.captureId);
  assert.deepEqual(indicators(h), [true, true, false]);
  const nextPending = h.callbacks.onCapture(photo());
  assert.ok(h.jobs[1].payload.token.captureId > h.jobs[0].payload.token.captureId);
  h.resolve(h.jobs[1], {review: true}); await nextPending;
  assert.equal(h.$('cameraReadStatus').hidden, true, 'Recognition of the previous sheet cannot label the next one');
});

test('transient paper loss retains geometric reference but cannot capture; sustained/partial loss resets stability', () => {
  const h = setup(); h.observe(); h.observe(); h.observe();
  const stableBefore = h.tracker.snapshot().stable;
  const reference = h.$('scanQuad').getAttribute('points');
  const missing = h.observe({quad: null});
  assert.equal(missing.captureId, undefined);
  assert.equal(h.$('scanQuad').getAttribute('points'), reference);
  assert.equal(h.tracker.snapshot().stable, stableBefore);
  assert.deepEqual(indicators(h), [false, false, false]);
  assert.equal(h.observe().stable, stableBefore + 1);
  const partial = {...paper, corners: [[0, 0], [354, 30], [354, 500], [30, 500]]};
  for (let i = 0; i < 4; i++) assert.equal(h.observe({quad: partial}).captureId, undefined);
  assert.equal(h.tracker.snapshot().stable, 0);
  assert.equal(h.$('scanQuad').getAttribute('points'), '');
  assert.equal(h.observe().stable, 0, 'Returning paper starts a fresh geometric reference');
  assert.deepEqual(indicators(h), [false, false, false]);
  assert.equal(h.jobs.length, 0);
  assert.equal(h.rendered.length, 0);
});

test('dimension reset discards old contour coordinates and stability while preserving an already captured-sheet lock', () => {
  const h = setup();
  h.observe(); h.observe(); h.observe();
  assert.notEqual(h.$('scanQuad').getAttribute('points'), '');
  h.tracker.resetGeometry();
  h.callbacks.onContour(null);
  assert.equal(h.$('scanQuad').getAttribute('points'), '');
  const reset = h.observe({quad: landscape, width: 540, height: 384});
  assert.equal(reset.stable, 0);
  assert.equal(reset.captureId, undefined);
  assert.equal(h.$('scanOverlay').getAttribute('viewBox'), '0 0 540 384');
  assert.equal(h.$('scanQuad').getAttribute('points'), landscape.corners.map(p => p.join(',')).join(' '));
  assert.deepEqual(indicators(h), [false, false, false]);
  const capture = h.ready({quad: landscape, width: 540, height: 384});
  assert.ok(capture.captureId);
  h.tracker.finish(capture.captureId);
  h.tracker.resetGeometry();
  const changed = h.observe({quad: null, signature: scene(.2), at: 5000});
  assert.equal(changed.phase, 'locked');
  assert.equal(changed.corners, null, 'New geometry cannot retain an obsolete contour');
  assert.equal(h.$('scanQuad').getAttribute('points'), '');
  for (const at of [6000, 7000, 8000, 9000]) assert.equal(h.observe({quad: null, signature: scene(.2), at}).phase, 'locked');
  assert.equal(h.observe({at: 10000}).captureId, undefined);
  assert.equal(h.jobs.length, 0, 'Resetting dimensions never directly authorizes a new capture');
});
