// Scancat — UI: camera, live detection, capture, tray, editor, export.

import * as V from "./vision.js";
import { buildPdf } from "./pdf.js";
import {cameraRegion, cameraStageAspect} from "./framing.js";

const $ = (id) => document.getElementById(id);

const DET_W = 640;           // resolução dos quadradinhos pretos
const LOOP_MS = 250;         // detector via Worker; ~4 quadros por segundo
const STEADY_FRAMES = 4;     // capturar após quatro leituras estáveis
const MIN_SCORE = 0.70;      // mínimo de confiança geométrica SALTA
const GOOD_SUPPORT = 0.82;  // destaca marcadores confiáveis
const MAX_SIDE = 2600;       // longest side of a scanned page (px)

const S = {
  stream: null, running: false, pages: [], seq: 0,
  mode: "color", pageSize: "fit", auto: true, sound: true,
  busy: 0, editing: null, corner: null,
  frameMode: "fill", cameraFrame: null, cameraFrameKey: "",
  markerModel: null, markerDetectBusy: false,
  det: { smooth: null, stable: 0, lost: 99, armed: true, lastCap: null, score: 0, support: 0, ms: 0, w: 0, h: 0 },
};

/* ---------- prefs ---------- */

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("salta-scan:prefs") || "{}");
    if (V.MODES.includes(p.mode)) S.mode = p.mode;
    if (["fit", "a4", "letter"].includes(p.pageSize)) S.pageSize = p.pageSize;
    if (typeof p.sound === "boolean") S.sound = p.sound;
  } catch { /* ignore */ }
}
function savePrefs() {
  try {
    localStorage.setItem("salta-scan:prefs", JSON.stringify({ mode: S.mode, pageSize: S.pageSize, sound: S.sound }));
  } catch { /* ignore */ }
}

/* ---------- worker ---------- */

const worker = new Worker("js/worker.js?v=fiducial-1", { type: "module" });
const pending = new Map();
let wid = 0;
worker.onmessage = (e) => {
  const { id, error } = e.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (error) p.reject(new Error(error)); else p.resolve(e.data);
};
worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || "worker failed")); pending.clear(); };
function callWorker(msg, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++wid;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...msg }, transfer);
  });
}

/* ---------- helpers ---------- */
function translateScanStatus(text) {
 const m=[
  [/^looking for a page…$/,"Procurando quatro marcadores pretos…"],
  [/^looking for a page — hold it up, fill the frame$/,"Mostre os quatro quadradinhos pretos na câmera."],
  [/^page found — hold still$/,"4 marcadores detectados. Segure firme."],
  [/^hold still…$/,"Mantenha a câmera estável…"],
  [/^page found — space to capture$/,"Quatro marcadores detectados."],
  [/^captured — move to the next page$/,"Capturado. Retire a folha para a próxima."],
  [/^captured — next page$/,"Capturado. Próxima folha."],
  [/^processing…$/,"Digitalizando…"],
  [/^writing PDF…$/,"Gerando PDF…"],
  [/^cleared$/,"Páginas removidas."],
  [/^camera stopped$/,"Câmera interrompida."],
  [/^re-rendering page (\d+) of (\d+)…$/,(_,a,b)=>"Processando página "+a+" de "+b+"…"],
  [/^page (\d+) captured$/,(_,a)=>"Página "+a+" digitalizada."],
  [/^page (\d+) captured \(whole frame — no page edges found\)$/,(_,a)=>"Página "+a+" sem contorno detectado. Ajuste os cantos."],
  [/^PDF saved — (\d+) pages?, ([\d.]+) MB$/,(_,a,b)=>"PDF pronto — "+a+" páginas · "+b+" MB"],
 ];
 for(const [pattern,label] of m){if(pattern.test(text))return text.replace(pattern,label)}
 return text;
}


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pillHold = 0;
/** Status line. A `holdMs` keeps a transient message on screen despite the live loop. */
function setPill(text, cls = "", holdMs = 0) {
  text = translateScanStatus(text);
  if (!holdMs && performance.now() < pillHold) return;
  const pill = $("pill");
  if (pill.textContent !== text) pill.textContent = text;
  pill.className = `pill mono ${cls}`.trim();
  if (holdMs) pillHold = performance.now() + holdMs;
}

function setRing(frac) {
  const ring = $("ring");
  if (frac == null) { ring.hidden = true; return; }
  ring.hidden = false;
  $("ringfg").style.strokeDashoffset = String(97.4 * (1 - Math.max(0, Math.min(1, frac))));
}

function showErr(msg) {
  const el = $("camerr");
  el.textContent = msg;
  el.hidden = !msg;
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

let actx = null;
function shutterSound() {
  if (!S.sound) return;
  try {
    actx = actx || new AudioContext();
    const sr = actx.sampleRate, t = actx.currentTime;
    const burst = (at, len, freq, gain) => {
      const buf = actx.createBuffer(1, Math.round(sr * len), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * len * 0.18));
      const src = actx.createBufferSource(); src.buffer = buf;
      const f = actx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.8;
      const g = actx.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(actx.destination);
      src.start(at);
    };
    burst(t, 0.05, 3200, 0.5);
    burst(t + 0.07, 0.08, 1600, 0.35);
  } catch { /* no audio, no problem */ }
}

function flash() {
  const el = $("flash");
  el.classList.remove("go");
  void el.offsetWidth;
  el.classList.add("go");
}

/* ---------- camera ---------- */

function stopStream() {
  if (S.stream) for (const t of S.stream.getTracks()) t.stop();
  S.stream = null;
}

function cameraError(e) {
  if (!window.isSecureContext) return "A câmera exige HTTPS ou localhost.";
  switch (e && e.name) {
    case "NotAllowedError": case "SecurityError":
      return "A câmera foi bloqueada. Autorize o acesso nas configurações do navegador e tente novamente.";
    case "NotFoundError": case "OverconstrainedError": return "Não encontramos uma câmera neste dispositivo.";
    case "NotReadableError": case "AbortError": return "A câmera está sendo usada por outro aplicativo.";
    default: return `Não foi possível abrir a câmera: ${e && e.message || e}`;
  }
}

// Safari/WebKit: preferir foco nativo e não reconfigurar o MediaStreamTrack.
// applyConstraints() pode reinicializar ou interromper a prévia nesses aparelhos.
const isWebKitCamera = () => {
  const ua = navigator.userAgent || "";
  // Chrome/Edge/Firefox no iOS continuam usando WebKit; Chrome/Android não.
  return /iPhone|iPad|iPod/i.test(ua) ||
    (/AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|SamsungBrowser/i.test(ua));
};
let cameraRequestId = 0;

async function requestContinuousFocus(track) {
  if (isWebKitCamera() || !track || typeof track.getCapabilities !== "function" ||
      typeof track.applyConstraints !== "function") return false;
  try {
    const capabilities = track.getCapabilities();
    if (!Array.isArray(capabilities?.focusMode) || !capabilities.focusMode.includes("continuous")) return false;
    // Nunca replicar width/height/facingMode pelo applyConstraints: só o foco opcional.
    await track.applyConstraints({advanced:[{focusMode:"continuous"}]});
    return true;
  } catch {
    return false;
  }
}

function stopCameraView() {
  cameraRequestId++; // invalida permissões/resoluções de câmera em andamento
  S.running = false;
  S.cameraStarting = false;
  stopStream();
  const video = $("video");
  video.pause?.();
  video.srcObject = null;
  resetDetection();
  S.cameraFrame = null; S.cameraFrameKey = "";
  document.body.classList.remove("live");
  $("scanner").classList.remove("camera-on");
  $("scanner").hidden = S.pages.length === 0;
  $("res").textContent = "";
}

function waitForCameraMetadata(video, timeoutMs = 4500) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true);
  return new Promise(resolve => {
    let completed = false;
    let timeout;
    const events = ["loadedmetadata", "loadeddata", "resize", "canplay"];
    function cleanup() {
      events.forEach(event => video.removeEventListener(event, check));
      clearTimeout(timeout);
    }
    function finish(ok) {
      if (completed) return;
      completed = true;
      cleanup();
      resolve(ok);
    }
    function check() {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    }
    events.forEach(event => video.addEventListener(event, check));
    timeout = setTimeout(() => finish(false), timeoutMs);
    check();
  });
}

// Enquadramento único: a prévia nativa, o detector e o JPG usam o mesmo
// recorte calculado da fonte REAL. Nenhum zoom é aplicado só no CSS.
function updateCameraStage(video = $("video")) {
  const viewport = $("viewport"), button = $("framing");
  if (!video.videoWidth || !video.videoHeight) return;
  const portrait = window.matchMedia
    ? window.matchMedia("(max-width: 860px) and (orientation: portrait)").matches
    : window.innerWidth <= 860 && window.innerHeight > window.innerWidth;
  const viewWidth = viewport.getBoundingClientRect().width || viewport.clientWidth || window.innerWidth - 24;
  const aspect = cameraStageAspect(video.videoWidth, video.videoHeight, {
    portrait, viewWidth, windowHeight: window.innerHeight, mode: S.frameMode
  });
  viewport.style.aspectRatio = String(aspect);
  viewport.dataset.frameMode = S.frameMode;
  video.style.objectFit = S.frameMode === "fit" ? "contain" : "cover";
  button.textContent = S.frameMode === "fill" ? "Ver imagem inteira" : "Ampliar prévia";
  button.setAttribute("aria-pressed", S.frameMode === "fit" ? "true" : "false");
  S.cameraFrame = null; S.cameraFrameKey = "";
  resetDetection();
}

function currentCameraFrame(video) {
  const viewport = $("viewport");
  const rect = viewport.getBoundingClientRect();
  const width = rect.width || viewport.clientWidth;
  const height = rect.height || viewport.clientHeight;
  if (!video.videoWidth || !video.videoHeight || width < 2 || height < 2) return null;
  const frame = cameraRegion(video.videoWidth, video.videoHeight, width, height, S.frameMode);
  const key = [frame.sourceWidth,frame.sourceHeight,S.frameMode,
    Math.round(width),Math.round(height),Math.round(frame.sx),Math.round(frame.sy),
    Math.round(frame.sw),Math.round(frame.sh)].join(":");
  if (S.cameraFrameKey !== key) {
    S.cameraFrameKey = key;
    resetDetection();
    const svg = $("overlay");
    svg.style.left = frame.dx + "px";
    svg.style.top = frame.dy + "px";
    svg.style.width = frame.dw + "px";
    svg.style.height = frame.dh + "px";
  }
  S.cameraFrame = frame;
  return frame;
}

async function startCamera() {
  if (S.running && S.stream) return true;
  if (S.cameraStarting) return false;
  if (!navigator.mediaDevices?.getUserMedia) {
    showErr("O Safari não disponibilizou a câmera. Abra o link diretamente no Safari ou importe uma foto.");
    return false;
  }
  const request = ++cameraRequestId;
  S.cameraStarting = true;
  const video = $("video");
  let stream = null;
  try {
    stopStream();
    // Tornar o vídeo visível ANTES de anexar o stream e chamar play().
    // iOS Safari pode suspender metadados e reprodução de vídeo oculto.
    document.body.classList.add("live");
    $("scanner").hidden = false;
    $("scanner").classList.add("camera-on");
    $("res").textContent = "Iniciando câmera…";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    showErr("");

    // 4:3 aproveita mais da altura da folha que o antigo 16:9.
    // Valores são preferências, não imposições: Safari escolhe câmera/lente.
    const portrait = window.innerWidth <= 860 && window.innerHeight > window.innerWidth;
    const preferred = portrait
      ? {facingMode:"environment",width:{ideal:1440},height:{ideal:1920},aspectRatio:{ideal:0.75}}
      : {facingMode:"environment",width:{ideal:1920},height:{ideal:1440},aspectRatio:{ideal:4/3}};
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:preferred,audio:false});
    } catch (error) {
      // Uma configuração incompatível não deve bloquear a câmera. Negação de
      // permissão, porém, não deve disparar uma segunda solicitação.
      if (!["OverconstrainedError","NotFoundError","NotReadableError","AbortError"].includes(error?.name)) throw error;
      stream = await navigator.mediaDevices.getUserMedia({
        video:{facingMode:"environment"},audio:false
      });
    }
    if (request !== cameraRequestId) {
      stream.getTracks().forEach(track=>track.stop());
      return false;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("Nenhum vídeo retornado pela câmera.");
    S.stream = stream;
    video.srcObject = stream;

    // Não esperar por play() antes de aguardar metadados: no iOS a promessa
    // pode ficar pendente. Erros são tratados sem rejeição não observada.
    try {
      const playing = video.play();
      if (playing?.catch) playing.catch(()=>{});
    } catch { /* metadados e timeout vão decidir o resultado */ }

    let ready = await waitForCameraMetadata(video);
    if (!ready && request === cameraRequestId) {
      // WebKit pode manter o track ativo, mas perder a camada de vídeo.
      // Remontar apenas o elemento é menos invasivo que reiniciar getUserMedia.
      video.srcObject = null;
      video.srcObject = stream;
      try { const playing = video.play(); if (playing?.catch) playing.catch(()=>{}); } catch {}
      ready = await waitForCameraMetadata(video, 3000);
    }
    if (request !== cameraRequestId) return false;
    if (!ready || !video.videoWidth || !video.videoHeight) {
      throw new Error("A câmera foi autorizada, mas o vídeo não iniciou no Safari. Feche outros aplicativos com câmera e tente novamente.");
    }

    const vw=video.videoWidth,vh=video.videoHeight;
    updateCameraStage(video);
    $("res").textContent=`${vw}×${vh} · câmera automática`;
    track.addEventListener("ended",()=>{
      if(S.running && request===cameraRequestId){
        stopCameraView();
        showErr("A câmera foi desconectada. Abra novamente para tentar.");
      }
    },{once:true});
    S.running=true;
    resetDetection();
    setPill("looking for a page…");
    requestAnimationFrame(loop);
    void requestContinuousFocus(track); // nunca aplica foco manual no WebKit
    return true;
  } catch(error) {
    if (request === cameraRequestId) {
      stopCameraView();
      showErr(error?.name ? cameraError(error) : String(error?.message || error));
    }
    return false;
  } finally {
    if (request===cameraRequestId) S.cameraStarting=false;
  }
}

/* ---------- detection loop ---------- */

const detCanvas = document.createElement("canvas");
const detCtx = detCanvas.getContext("2d", { willReadFrequently: true });
let lastTick = 0;
let markerEpoch = 0;

function resetDetection() {
  markerEpoch++;
  Object.assign(S.det, { smooth: null, markers: null, stable: 0, lost: 99, armed: true, lastCap: null, score: 0, support: 0 });
  drawOverlay(null);
  setRing(null);
}

async function loop(ts) {
  if (!S.running) return;
  requestAnimationFrame(loop);
  if (ts - lastTick < LOOP_MS || document.hidden || S.editing || S.markerDetectBusy || S.busy) return;
  const video = $("video");
  if (video.readyState < 2 || !video.videoWidth) return;
  const frame = currentCameraFrame(video);
  if (!frame) return;
  lastTick = ts;
  const dw = DET_W, dh = Math.max(8, Math.round(frame.sh * dw / frame.sw));
  if (detCanvas.width !== dw || detCanvas.height !== dh) { detCanvas.width = dw; detCanvas.height = dh; }
  detCtx.drawImage(video, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, dw, dh);
  const img = detCtx.getImageData(0, 0, dw, dh);
  const epoch = markerEpoch;
  const t0 = performance.now();
  S.markerDetectBusy = true;
  try {
    const response = await callWorker({
      op: "detect-markers", data: img.data, w: dw, h: dh, geometry: S.markerModel
    }, [img.data.buffer]);
    if (!S.running || epoch !== markerEpoch || S.editing) return;
    S.det.ms = performance.now() - t0;
    S.det.w = dw; S.det.h = dh;
    track(response.result, dw, dh);
  } catch (error) {
    if (epoch === markerEpoch && S.running) {
      console.warn("Falha ao detectar marcadores SALTA:", error);
      setPill("Detecção de marcadores indisponível. Tente novamente.", "bad", 900);
    }
  } finally {
    S.markerDetectBusy = false;
  }
}

function maxShift(a, b) {
  let m = 0;
  for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
  return m;
}

function track(q, dw, dh) {
  const D = S.det;
  if (S.busy) { setPill("processing…"); setRing(null); return; }
  if (!q?.found || q.confidence < MIN_SCORE) {
    D.lost++;
    if (D.lost > 2) { D.smooth = null; D.markers = null; D.stable = 0; drawOverlay(null); setRing(null); D.score = 0; D.support = 0; }
    if (D.lost > 8) D.armed = true;
    if (D.lost > 2) setPill(q?.reason === "outside" ? "Marcadores localizados, mas a borda está cortada. Afaste o celular ou toque em Ver imagem inteira." : S.pages.length && !D.armed ? "captured — next page" : "looking for a page — hold it up, fill the frame");
    return;
  }
  D.lost = 0;
  D.score = q.confidence; D.support = q.confidence;
  if (!D.smooth) { D.smooth = q.corners.map(c=>[...c]); D.markers = q.markers.map(c=>[...c]); D.stable = 0; }
  else {
    const shift = maxShift(q.corners, D.smooth);
    for (let i = 0; i < 4; i++) {
      D.smooth[i][0] += (q.corners[i][0] - D.smooth[i][0]) * 0.45;
      D.smooth[i][1] += (q.corners[i][1] - D.smooth[i][1]) * 0.45;
      D.markers[i][0] += (q.markers[i][0] - D.markers[i][0]) * 0.45;
      D.markers[i][1] += (q.markers[i][1] - D.markers[i][1]) * 0.45;
    }
    if (shift < 0.02 * dw) D.stable++; else D.stable = 0;
  }
  if (!D.armed && D.lastCap && maxShift(D.smooth, D.lastCap) > 0.15 * dw) D.armed = true;
  drawOverlay(D.smooth, q.confidence >= GOOD_SUPPORT, D.markers);
  if (S.auto && D.armed) {
    const frac = D.stable / STEADY_FRAMES;
    setRing(frac);
    setPill(D.stable < 2 ? "page found — hold still" : "hold still…", q.confidence >= GOOD_SUPPORT ? "ok" : "");
    if (D.stable >= STEADY_FRAMES) {
      D.armed = false; D.stable = 0; D.lastCap = D.smooth.map((c) => [c[0], c[1]]);
      setRing(null);
      capture("auto");
    }
  } else {
    setRing(null);
    setPill(!D.armed && S.auto ? "captured — move to the next page" : "page found — space to capture", q.confidence >= GOOD_SUPPORT ? "ok" : "");
  }
}

function drawOverlay(corners, good = true, markers = null) {
  const svg = $("overlay"), poly = $("quad"), dots = $("dots");
  if (!corners) { poly.setAttribute("points", ""); dots.innerHTML = ""; return; }
  svg.setAttribute("viewBox", `0 0 ${S.det.w} ${S.det.h}`);
  poly.setAttribute("points", corners.map((c) => `${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" "));
  poly.classList.toggle("weak", !good);
  if (dots.childElementCount !== 4) {
    dots.innerHTML = "";
    for (let i = 0; i < 4; i++) { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("r", "7"); dots.appendChild(c); }
  }
  const points=markers?.length===4 ? markers : corners;
  Array.from(dots.children).forEach((c, i) => { c.setAttribute("cx", points[i][0].toFixed(1)); c.setAttribute("cy", points[i][1].toFixed(1)); });
}

/* ---------- pages ---------- */

const fullCanvas = document.createElement("canvas");
const fullCtx = fullCanvas.getContext("2d", { willReadFrequently: true });

function shrinkQuad(corners, frac) {
  const cx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4;
  const cy = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;
  return corners.map(([x, y]) => [x + (cx - x) * frac, y + (cy - y) * frac]);
}

async function capture(source = "manual") {
  const video = $("video");
  if (!S.running || S.busy || video.readyState < 2 || !video.videoWidth) return null;
  const frame = S.cameraFrame;
  if (!frame || frame.sourceWidth !== video.videoWidth || frame.sourceHeight !== video.videoHeight) return null;
  const vw = Math.max(1, Math.round(frame.sw)), vh = Math.max(1, Math.round(frame.sh));
  const det = S.det.smooth;
  if (!det || S.det.markers?.length!==4 || S.det.score<MIN_SCORE) return null;
  const fx = vw / (S.det.w || DET_W), fy = vh / (S.det.h || 1);
  const corners = shrinkQuad(det.map(([x, y]) => [x * fx, y * fy]), 0.008);
  if (fullCanvas.width !== vw || fullCanvas.height !== vh) { fullCanvas.width = vw; fullCanvas.height = vh; }
  fullCtx.drawImage(video, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, vw, vh);
  const img = fullCtx.getImageData(0, 0, vw, vh);
  flash();
  shutterSound();
  if (source === "manual") { S.det.armed = false; S.det.lastCap = det ? det.map((c) => [c[0], c[1]]) : null; S.det.stable = 0; }
  const page = { id: ++S.seq, fw: vw, fh: vh, corners, rot: 0, mode: null, frame: null, out: null, url: "", w: 0, h: 0, cropped: !!det };
  page.frameReady = new Promise((res) => fullCanvas.toBlob((b) => { page.frame = b; res(b); }, "image/jpeg", 0.92));
  S.busy++;
  setPill("processing…");
  try {
    await processPage(page, img);
    S.pages.push(page);
    renderTray();
    window.dispatchEvent(new CustomEvent("salta-omr:page",{detail:{page}}));
    setPill(`page ${S.pages.length} captured`, "ok", 1500);
  } catch (e) {
    console.error(e);
    setPill(`couldn't process that page: ${e.message}`, "bad", 4000);
  } finally {
    S.busy--;
  }
  return page;
}

async function frameImageData(page) {
  await page.frameReady;
  const bmp = await createImageBitmap(page.frame);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

async function processPage(page, img = null) {
  img = img || await frameImageData(page);
  const res = await callWorker({
    op: "process", data: img.data, w: img.width, h: img.height,
    corners: page.corners, mode: page.mode || S.mode, rot: page.rot, maxSide: MAX_SIDE,
  }, [img.data.buffer]);
  const c = document.createElement("canvas");
  c.width = res.w; c.height = res.h;
  c.getContext("2d").putImageData(new ImageData(res.data, res.w, res.h), 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  if (page.url) URL.revokeObjectURL(page.url);
  page.out = blob; page.url = URL.createObjectURL(blob); page.w = res.w; page.h = res.h;
  return page;
}

async function reprocess(page) {
  const li = $("pages").querySelector(`[data-id="${page.id}"]`);
  if (li) li.classList.add("busy");
  S.busy++;
  try { await processPage(page); }
  finally { S.busy--; if (li) li.classList.remove("busy"); }
  renderTray();
  if (S.editing === page) $("edimg").src = page.url;
}

async function reprocessAll() {
  const targets = S.pages.filter((p) => !p.mode);
  for (let i = 0; i < targets.length; i++) {
    setPill(`re-rendering page ${i + 1} of ${targets.length}…`);
    await reprocess(targets[i]);
  }
}

function removePage(page) {
  const i = S.pages.indexOf(page);
  if (i < 0) return;
  S.pages.splice(i, 1);
  if (page.url) URL.revokeObjectURL(page.url);
  if (S.editing === page) closeEditor();
  renderTray();
}

function movePage(from, to) {
  if (from === to || from < 0 || to < 0 || from >= S.pages.length || to >= S.pages.length) return;
  const [p] = S.pages.splice(from, 1);
  S.pages.splice(to, 0, p);
  renderTray();
}

/* ---------- tray ---------- */

let dragId = null;

function renderTray() {
  const ol = $("pages");
  const n = S.pages.length;
  $("count").textContent = n ? `${n} página${n === 1 ? "" : "s"}` : "Nenhuma página ainda";
  $("trayhint").hidden = n > 0;
  $("pdf").disabled = !n; $("jpgs").disabled = !n; $("clear").disabled = !n;
  const seen = new Set();
  S.pages.forEach((p, i) => {
    seen.add(p.id);
    let li = ol.querySelector(`[data-id="${p.id}"]`);
    if (!li) {
      li = document.createElement("li");
      li.className = "page";
      li.dataset.id = p.id;
      li.draggable = true;
      li.tabIndex = 0;
      li.innerHTML = `<img alt=""><span class="num mono"></span><div class="acts"><button type="button" data-act="rot" title="Rotate right">⟳</button><button type="button" data-act="del" title="Delete">×</button></div>`;
      li.addEventListener("click", (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        if (act === "rot") { p.rot = (p.rot + 1) % 4; reprocess(p); }
        else if (act === "del") removePage(p);
        else openEditor(p);
      });
      li.addEventListener("keydown", (e) => { if (e.key === "Enter") openEditor(p); });
      li.addEventListener("dragstart", (e) => { dragId = p.id; li.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; });
      li.addEventListener("dragend", () => { dragId = null; li.classList.remove("drag"); ol.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); });
      li.addEventListener("dragover", (e) => { if (dragId != null) { e.preventDefault(); li.classList.add("over"); } });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = S.pages.findIndex((x) => x.id === dragId), to = S.pages.findIndex((x) => x.id === p.id);
        movePage(from, to);
      });
      ol.appendChild(li);
    }
    const img = li.querySelector("img");
    if (img.src !== p.url) img.src = p.url;
    img.alt = `Página ${i + 1}`;
    li.querySelector(".num").textContent = String(i + 1);
    li.setAttribute("aria-label", `page ${i + 1}`);
    if (ol.children[i] !== li) ol.insertBefore(li, ol.children[i] || null);
  });
  Array.from(ol.children).forEach((li) => { if (!seen.has(+li.dataset.id)) li.remove(); });
}

/* ---------- editor ---------- */

function openEditor(page) {
  S.editing = page;
  if (S.running) resetDetection();
  $("edimg").src = page.url;
  $("edtitle").textContent = `Página ${S.pages.indexOf(page) + 1} de ${S.pages.length}`;
  $("edmode").value = page.mode || "";
  leaveCornerMode();
  $("editor").hidden = false;
  $("edcloseX").focus();
}

function closeEditor() {
  S.editing = null;
  leaveCornerMode();
  $("editor").hidden = true;
  if (S.running) resetDetection();
}

function leaveCornerMode() {
  S.corner = null;
  $("cornerpane").hidden = true;
  $("edview").hidden = false;
}

async function enterCornerMode() {
  const page = S.editing;
  if (!page) return;
  await page.frameReady;
  const bmp = await createImageBitmap(page.frame);
  const cv = $("cornercv");
  const maxW = Math.min(960, window.innerWidth - 80), maxH = Math.max(240, window.innerHeight - 260);
  const k = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  const svg = $("cornersvg");
  svg.setAttribute("viewBox", `0 0 ${page.fw} ${page.fh}`);
  S.corner = { page, pts: page.corners.map((c) => [c[0], c[1]]), drag: -1 };
  drawCornerUI();
  $("edview").hidden = true;
  $("cornerpane").hidden = false;
}

function drawCornerUI() {
  const C = S.corner; if (!C) return;
  $("cornerpoly").setAttribute("points", C.pts.map((c) => `${c[0]},${c[1]}`).join(" "));
  $("cornersvg").querySelectorAll(".h").forEach((h, i) => { h.setAttribute("cx", C.pts[i][0]); h.setAttribute("cy", C.pts[i][1]); });
}

function cornerPointer(e) {
  const C = S.corner, svg = $("cornersvg");
  const r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * C.page.fw, y = (e.clientY - r.top) / r.height * C.page.fh;
  return [Math.max(0, Math.min(C.page.fw, x)), Math.max(0, Math.min(C.page.fh, y))];
}

function wireCornerEditor() {
  const svg = $("cornersvg");
  svg.addEventListener("pointerdown", (e) => {
    const C = S.corner; if (!C) return;
    const [x, y] = cornerPointer(e);
    let best = -1, bd = Infinity;
    C.pts.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
    const r = svg.getBoundingClientRect();
    if (bd * r.width / C.page.fw > 40) return;
    C.drag = best;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener("pointermove", (e) => {
    const C = S.corner; if (!C || C.drag < 0) return;
    C.pts[C.drag] = cornerPointer(e);
    drawCornerUI();
  });
  const up = () => { if (S.corner) S.corner.drag = -1; };
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);
  $("cornerfull").addEventListener("click", () => { const C = S.corner; if (!C) return; C.pts = V.frameCorners(C.page.fw, C.page.fh); drawCornerUI(); });
  $("cornercancel").addEventListener("click", leaveCornerMode);
  $("cornerapply").addEventListener("click", async () => {
    const C = S.corner; if (!C) return;
    C.page.corners = V.orderCorners(C.pts.map((c) => [c[0], c[1]]));
    C.page.cropped = true;
    leaveCornerMode();
    await reprocess(C.page);
  });
}

async function pagePng(page) {
  const bmp = await createImageBitmap(page.out);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close();
  return new Promise((r) => c.toBlob(r, "image/png"));
}

/* ---------- export ---------- */

async function downloadPdf() {
  if (!S.pages.length || S.busy) return null;
  S.busy++;
  setPill("writing PDF…");
  try {
    const pages = [];
    for (const p of S.pages) pages.push({ jpeg: new Uint8Array(await p.out.arrayBuffer()), width: p.w, height: p.h });
    const bytes = buildPdf(pages, { pageSize: S.pageSize, title: `SALTA Scan ${stamp()}` });
    const blob = new Blob([bytes], { type: "application/pdf" });
    download(blob, `SALTA-Scan-${stamp()}.pdf`);
    setPill(`PDF saved — ${pages.length} page${pages.length === 1 ? "" : "s"}, ${(blob.size / 1048576).toFixed(1)} MB`, "ok", 3000);
    return blob;
  } finally { S.busy--; }
}

async function downloadJpegs() {
  const base = `SALTA-Scan-${stamp()}`;
  for (let i = 0; i < S.pages.length; i++) {
    download(S.pages[i].out, `${base}-p${String(i + 1).padStart(2, "0")}.jpg`);
    await sleep(350);
  }
}


/* SALTA Scan Lab — importação de imagens com recorte automático e ajuste manual. */
function importStatus(message, isError=false) {
 const el=document.getElementById("importStatus");
 if(el){el.textContent=message;el.dataset.error=String(isError);}
}
async function importPhoto(file,{showManual=true}={}) {
 if(!file||!(file.type.startsWith("image/")||/\.(heic|heif)$/i.test(file.name))) throw new Error("Selecione uma imagem.");
 const url=URL.createObjectURL(file);
 let image;
 try {
  image=new Image();
  image.decoding="async";
  image.src=url;
  await image.decode();
 } finally {
  URL.revokeObjectURL(url);
 }
 const iw=image.naturalWidth,ih=image.naturalHeight;
 if(!iw||!ih)throw new Error("Não foi possível abrir esta fotografia.");
 const scale=Math.min(1,3200/Math.max(iw,ih));
 const fw=Math.max(1,Math.round(iw*scale)),fh=Math.max(1,Math.round(ih*scale));
 const c=document.createElement("canvas");c.width=fw;c.height=fh;
 const ctx=c.getContext("2d",{willReadFrequently:true});
 if(!ctx)throw new Error("Canvas não disponível.");
 ctx.drawImage(image,0,0,fw,fh);
 const frame=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("Falha ao preparar fotografia.")),"image/jpeg",.96));
 const dw=Math.min(780,fw),dh=Math.max(8,Math.round(fh*dw/fw));
 const thumb=document.createElement("canvas");thumb.width=dw;thumb.height=dh;
 const tc=thumb.getContext("2d",{willReadFrequently:true});
 tc.drawImage(c,0,0,dw,dh);
 let detection=null;
 try{
  const rgba=tc.getImageData(0,0,dw,dh);
  const response=await callWorker({op:"detect-markers",data:rgba.data,w:dw,h:dh,geometry:S.markerModel},[rgba.data.buffer]);
  detection=response.result;
 }catch(error){console.warn("Marcadores não detectados na foto:",error);}
 const found=Boolean(detection?.found&&detection.confidence>=MIN_SCORE&&detection.corners?.length===4);
 const pts=found?detection.corners.map(p=>[p[0]*fw/dw,p[1]*fh/dh]):V.frameCorners(fw,fh);
 const page={
  id:++S.seq,fw,fh,corners:pts,rot:0,mode:null,frame,
  frameReady:Promise.resolve(frame),out:null,url:"",w:0,h:0,cropped:found
 };
 $("scanner").hidden=false;
 if(!S.running)$("scanner").classList.remove("camera-on");
 S.busy++;
 try{
  const input=ctx.getImageData(0,0,fw,fh);
  await processPage(page,input);
  S.pages.push(page);
  renderTray();
  window.dispatchEvent(new CustomEvent("salta-omr:page",{detail:{page}}));
  importStatus(found?"Quatro marcadores detectados. Foto alinhada e pronta para leitura.":"Quatro quadradinhos não encontrados. Ajuste os cantos manualmente.");
  if(!found&&showManual){openEditor(page);await enterCornerMode();}
  return page;
 } finally {S.busy--;}
}

/* ---------- wiring ---------- */

function wire() {
  loadPrefs();
  $("mode").value = S.mode; $("pagesize").value = S.pageSize;
  S.auto = true; $("sound").checked = S.sound;

  $("start").addEventListener("click", async () => {
    $("start").disabled = true;
    try {
      const ok = await startCamera();
      if (ok) $("scanner").scrollIntoView?.({block:"start",behavior:"smooth"});
    } finally { $("start").disabled = false; }
  });
  $("closeCamera").addEventListener("click", stopCameraView);
  window.addEventListener("salta-omr:geometry", event => {
    // Só geometria física; não recebe gabarito, nota ou dados de aluno.
    S.markerModel = event.detail?.geometry || null;
    resetDetection();
    if (S.running) setPill("Procurando quatro quadradinhos pretos…");
  });
  $("framing").addEventListener("click", () => {
    S.frameMode = S.frameMode === "fill" ? "fit" : "fill";
    if (S.running) updateCameraStage($("video"));
  });
  $("video").addEventListener("resize", () => {
    if (S.running) {
      updateCameraStage($("video"));
      $("res").textContent = `${$("video").videoWidth}×${$("video").videoHeight} · câmera automática`;
    }
  });
  window.addEventListener("resize", () => { if (S.running) updateCameraStage($("video")); });
  $("sound").addEventListener("change", (e) => { S.sound = e.target.checked; savePrefs(); });
  $("pagesize").addEventListener("change", (e) => { S.pageSize = e.target.value; savePrefs(); });
  $("mode").addEventListener("change", async (e) => { S.mode = e.target.value; savePrefs(); await reprocessAll(); });

  $("pdf").addEventListener("click", downloadPdf);
  $("jpgs").addEventListener("click", downloadJpegs);
  $("clear").addEventListener("click", () => {
    if (!S.pages.length) return;
    if (!confirm(`Excluir ${S.pages.length} página${S.pages.length===1?"":"s"} digitalizada${S.pages.length===1?"":"s"}?`)) return;
    for (const p of S.pages.splice(0)) if (p.url) URL.revokeObjectURL(p.url);
    closeEditor();
    renderTray();
    resetDetection();
    setPill("cleared", "", 1500);
  });

  $("edclose").addEventListener("click", closeEditor);
  $("edcloseX").addEventListener("click", closeEditor);
  $("editor").addEventListener("click", (e) => { if (e.target === $("editor")) closeEditor(); });
  $("edrotl").addEventListener("click", () => { const p = S.editing; if (p) { p.rot = (p.rot + 3) % 4; reprocess(p); } });
  $("edrotr").addEventListener("click", () => { const p = S.editing; if (p) { p.rot = (p.rot + 1) % 4; reprocess(p); } });
  $("edmode").addEventListener("change", (e) => { const p = S.editing; if (p) { p.mode = e.target.value || null; reprocess(p); } });
  $("edcorners").addEventListener("click", enterCornerMode);
  $("eddel").addEventListener("click", () => { if (S.editing) removePage(S.editing); });
  $("eddl").addEventListener("click", () => { const p = S.editing; if (p) download(p.out, `scancat-${stamp()}-p${String(S.pages.indexOf(p) + 1).padStart(2, "0")}.jpg`); });
  $("edcopy").addEventListener("click", async () => {
    const p = S.editing; if (!p) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pagePng(p) })]);
      $("edcopy").textContent = "Copiado";
    } catch (e) {
      $("edcopy").textContent = "Falhou";
    }
    setTimeout(() => { $("edcopy").textContent = "Copiar"; }, 1500);
  });

  const files=$("files");
  for(const id of ["importbtn","importbtn2"]){
   const btn=$(id);if(btn)btn.addEventListener("click",()=>files?.click());
  }
  files?.addEventListener("change",async()=>{
   const selected=Array.from(files.files||[]).slice(0,12);
   files.value="";
   if(!selected.length)return;
   if(S.busy){importStatus("Conclua o processamento atual antes de importar.",true);return;}
   for(let i=0;i<selected.length;i++){
    importStatus("Importando "+(i+1)+" de "+selected.length+"…");
    try{await importPhoto(selected[i],{showManual:selected.length===1});}
    catch(error){importStatus("Falha em "+selected[i].name+": "+(error?.message||error),true);}
   }
  });

  wireCornerEditor();

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea")) return;
    if (S.editing) { if (e.key === "Escape") closeEditor(); return; }
    if (!S.running && !S.pages.length) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      if (S.pages.length) { e.preventDefault(); removePage(S.pages[S.pages.length - 1]); }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      downloadPdf();
    }
  });

  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.running) requestAnimationFrame(loop); });
  window.addEventListener("pagehide", () => { S.running=false; stopStream(); });

  // test hooks
  window.__scancat = { S, capture, downloadPdf, processPage, V, buildPdf, startCamera, stopCameraView, requestContinuousFocus, importPhoto, currentCameraFrame, updateCameraStage }; window.__saltaScan = window.__scancat;
}

wire();
