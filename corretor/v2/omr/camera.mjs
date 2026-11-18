// Camera pixels stay local. No lens warp: a device-specific measured profile is required.
export function frameSize(width, height, limit = 1800) {
  if (!(width > 0 && height > 0 && limit > 0)) throw new Error('A câmera ainda está iniciando.');
  const scale = Math.min(1, limit / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function drawVideoFrame(video, canvas, limit = 1800) {
  const { width, height } = frameSize(video.videoWidth, video.videoHeight, limit);
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // The five-argument form draws the WHOLE frame. No CSS dimensions, crop or mirroring.
  ctx.drawImage(video, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = Math.round(rgba[i] * .299 + rgba[i + 1] * .587 + rgba[i + 2] * .114);
  return { gray, width, height };
}

export function containMapping(width, height, boxWidth, boxHeight) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  const x = (boxWidth - width * scale) / 2, y = (boxHeight - height * scale) / 2;
  return { scale, x, y, project: point => ({ x: x + point.x * scale, y: y + point.y * scale }) };
}

export function guidePoints(width, height) {
  const paperWidth = Math.min(width * .88, height * .88 * 210 / 297);
  const paperHeight = paperWidth * 297 / 210;
  const x = (width - paperWidth) / 2, y = (height - paperHeight) / 2;
  return [[8,8],[202,8],[202,289],[8,289]].map(([mx,my]) => ({x:x+paperWidth*mx/210,y:y+paperHeight*my/297}));
}

export function cameraRank(label = '') {
  // Labels are hints, never proof of focal length. The explicit selector is always available.
  if (/ultra|0[.,]5|telephoto|teleobjetiva/i.test(label)) return -10;
  if (/back|rear|traseira|environment|world/i.test(label)) return /triple|dual|tripla|dupla|virtual/i.test(label) ? 2 : 10;
  if (/front|user|frontal|face/i.test(label)) return -5;
  return 0;
}

export function safeCapabilities(track) {
  try { return track?.getCapabilities?.() || {}; } catch { return {}; }
}

export function cameraControls(capabilities) {
  const controls = {};
  for (const name of ['zoom', 'exposureCompensation']) {
    const range = capabilities[name];
    if (Number.isFinite(range?.min) && Number.isFinite(range?.max) && range.max > range.min) controls[name] = range;
  }
  if (capabilities.focusMode?.includes('continuous')) controls.focusMode = 'continuous';
  if (capabilities.torch === true) controls.torch = true;
  return controls;
}

export async function applyCameraControl(track, name, value) {
  const control = cameraControls(safeCapabilities(track))[name];
  if (!control || !track?.applyConstraints) return false;
  if (typeof control === 'object' && (!Number.isFinite(value) || value < control.min || value > control.max)) return false;
  if (name === 'focusMode' && value !== 'continuous' || name === 'torch' && typeof value !== 'boolean') return false;
  try { await track.applyConstraints({ advanced: [{ [name]: value }] }); return true; } catch { return false; }
}


export function cameraZoomSnapshot(track) {
  const capabilities = safeCapabilities(track);
  let settings = {}, constraints = {};
  try { settings = track?.getSettings?.() || {}; } catch { /* browser-specific */ }
  try { constraints = track?.getConstraints?.() || {}; } catch { /* browser-specific */ }
  const range = capabilities.zoom;
  const supported = Number.isFinite(range?.min) && Number.isFinite(range?.max) && range.max > range.min;
  return {
    supported,
    min: supported ? range.min : null,
    max: supported ? range.max : null,
    current: Number.isFinite(settings.zoom) ? settings.zoom : null,
    constraint: typeof constraints.zoom === 'number' ? constraints.zoom : null,
    resizeMode: settings.resizeMode || null,
    facingMode: settings.facingMode || null,
  };
}

// Request a native supported lower zoom only when the browser actually reports
// that zoom is above its range minimum. No image rescaling or magic 1x value.
export async function reduceUnwantedCameraZoom(track) {
  const before = cameraZoomSnapshot(track);
  if (!before.supported || before.current === null || before.current <= before.min + .001) {
    return { attempted: false, applied: false, before, after: before };
  }
  let requested = false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: before.min }] });
    requested = true;
  } catch { /* unsupported or conflicting native camera constraint */ }
  const after = cameraZoomSnapshot(track);
  return {
    attempted: true,
    applied: requested && after.current !== null && after.current < before.current - .001,
    before, after,
  };
}

// An ultra-wide label is only a candidate. Ask for it when native settings
// show unavoidable zoom or browser crop; never equate a label with real FOV.
export function widerRearCandidate(devices, track) {
  const settings = track?.getSettings?.() || {};
  const zoom = cameraZoomSnapshot(track);
  const narrowed = (zoom.supported && zoom.min > 1.25) || settings.resizeMode === 'crop-and-scale';
  if (!narrowed) return null;
  return devices.find(d => d.kind === 'videoinput' && d.deviceId && d.deviceId !== settings.deviceId
    && /back|rear|traseira|environment/i.test(d.label || '')
    && /ultra|0[.,]5|ultra.angular/i.test(d.label || '')) || null;
}

function adequateWideStream(track, deviceId, priorZoom) {
  const settings = track?.getSettings?.() || {}, caps = safeCapabilities(track);
  if (settings.facingMode === 'user' || /front|frontal|selfie/i.test(track?.label || '')) return false;
  if (settings.deviceId && settings.deviceId !== deviceId) return false;
  const w = Number(settings.width || caps.width?.max), h = Number(settings.height || caps.height?.max);
  if (!Number.isFinite(w) || !Number.isFinite(h) || Math.min(w,h) < 960 || Math.max(w,h) < 1280) return false;
  const trialZoom = cameraZoomSnapshot(track);
  if (trialZoom.supported && priorZoom.supported && trialZoom.min > priorZoom.min + .001) return false;
  return true;
}

export class CameraSession {
  constructor(mediaDevices) { this.mediaDevices = mediaDevices; this.generation = 0; this.stream = null; }
  stop() { this.generation++; this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; }
  async open(deviceId = '') {
    this.stop(); const generation = this.generation;
    const media = this.mediaDevices;
    if (!media?.getUserMedia) throw new Error('Este navegador não oferece acesso à câmera. Importe uma fotografia para continuar.');
    const acquire = async id => {
      const stream = await media.getUserMedia({audio:false,video:id?{deviceId:{exact:id}}:{facingMode:{exact:'environment'}}});
      if (generation !== this.generation) {stream.getTracks().forEach(t=>t.stop());throw new Error('Abertura da câmera cancelada.');}
      this.stream = stream;return stream;
    };
    const negotiate = async stream => {
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Nenhum fluxo de vídeo foi recebido. Importe uma fotografia.');
      const facing = track.getSettings?.().facingMode;
      if (facing === 'user' || (/front|user|frontal|face/i.test(track.label) && !/back|rear|traseira|environment/i.test(track.label))) {
        throw new Error('A câmera traseira não está disponível neste navegador. Importe uma fotografia para continuar.');
      }
      const caps = safeCapabilities(track), constraints = {};
      for (const dim of ['width','height']) if (caps[dim]?.max) constraints[dim]={ideal:Math.min(2560,caps[dim].max)};
      if (caps.resizeMode?.includes('none')) constraints.resizeMode={exact:'none'};
      if (track.applyConstraints && Object.keys(constraints).length) {
        try {await track.applyConstraints(constraints)} catch { /* Keep usable native video. */ }
      }
      if (generation !== this.generation) throw new Error('Abertura da câmera cancelada.');
      const zoom = await reduceUnwantedCameraZoom(track);
      if (generation !== this.generation) throw new Error('Abertura da câmera cancelada.');
      return {track,capabilities:safeCapabilities(track),zoom};
    };
    try {
      let stream = await acquire(deviceId);
      let devices = [];
      try {devices=(await media.enumerateDevices?.()||[]).filter(d=>d.kind==='videoinput')}catch {/* Retain default. */}
      if (generation !== this.generation) throw new Error('Abertura da câmera cancelada.');
      if (!deviceId) {
        const current = stream.getVideoTracks()[0];
        const preferred=[...devices].sort((a,b)=>cameraRank(b.label)-cameraRank(a.label))[0];
        if (preferred && cameraRank(preferred.label)>cameraRank(current?.label) && preferred.deviceId!==current?.getSettings?.().deviceId) {
          stream.getTracks().forEach(t=>t.stop());this.stream=null;
          try {stream=await acquire(preferred.deviceId)}
          catch(error){if(generation!==this.generation||error.name==='NotAllowedError')throw error;stream=await acquire('')}
        }
      }
      let selected=await negotiate(stream);
      const wider=!deviceId?widerRearCandidate(devices,selected.track):null;
      if (wider) {
        const originalId=selected.track.getSettings?.().deviceId||'';
        const originalZoom=selected.zoom.after;
        stream.getTracks().forEach(t=>t.stop());this.stream=null;
        try {
          stream=await acquire(wider.deviceId);
          const candidate=await negotiate(stream);
          if (!adequateWideStream(candidate.track,wider.deviceId,originalZoom)) throw new Error('Lente mais aberta não confirmou resolução/qualidade nativa suficiente.');
          selected=candidate;
        } catch(error) {
          if (generation!==this.generation||error.name==='NotAllowedError') throw error;
          this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
          stream=await acquire(originalId);
          selected=await negotiate(stream);
        }
      }
      return {stream,devices,...selected};
    } catch(error) {
      if (generation===this.generation) this.stop();
      throw error;
    }
  }
}

export function motionBetween(current, previous) {
  if (!previous || previous.width !== current.width || previous.height !== current.height) return Infinity;
  let sum = 0, n = 0;
  for (let i = 0; i < current.gray.length; i += 23) { sum += Math.abs(current.gray[i] - previous.gray[i]); n++; }
  return sum / n;
}

export function captureQuality(frame, detection, previous = null) {
  const {gray,width,height} = frame, corners = detection?.corners;
  if (!detection?.found || detection.confidence < .7 || corners?.length !== 4) return {ok:false,message:'Centralize o cartão.'};
  const area = Math.abs(corners.reduce((s,p,i) => {const q=corners[(i+1)%4];return s+p.x*q.y-q.x*p.y},0)/2)/(width*height);
  if (area < .18) return {ok:false,message:'Aproxime a folha.',area};
  if (corners.some(p => p.x < width*.015 || p.x > width*.985 || p.y < height*.015 || p.y > height*.985)) return {ok:false,message:'Centralize o cartão.',area};
  // Work only inside the marker quadrilateral; dark background is not paper illumination.
  const inside = (x,y) => { const turns=corners.map((p,i)=>{const q=corners[(i+1)%4];return (q.x-p.x)*(y-p.y)-(q.y-p.y)*(x-p.x)}); return turns.every(t=>t>=0)||turns.every(t=>t<=0); };
  const histogram = new Uint32Array(256), tiles = Array.from({length:16},()=>({sum:0,white:0,n:0}));
  let edges=0,sharp=0,n=0;
  for(let y=2;y<height-2;y+=3) for(let x=2;x<width-2;x+=3) {
    if(!inside(x,y)) continue;
    const i=y*width+x,v=gray[i];histogram[v]++;n++;
    const tile=tiles[Math.min(3,Math.floor(y/height*4))*4+Math.min(3,Math.floor(x/width*4))];tile.sum+=v;tile.white+=v>=254;tile.n++;
    const gradient=Math.max(Math.abs(v-gray[i+2]),Math.abs(v-gray[i+2*width]));
    if(gradient>12){edges++;sharp+=Math.abs(4*v-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width]);}
  }
  const percentile = fraction => {let count=0;for(let v=0;v<256;v++){count+=histogram[v];if(count>=n*fraction)return v}return 255};
  const brightness=percentile(.75),contrast=percentile(.95)-percentile(.02),sharpness=edges?sharp/edges:0;
  const lit=tiles.filter(t=>t.n>20),means=lit.map(t=>t.sum/t.n);
  // A white sheet alone is NOT glare. Only a saturated patch amid markedly dark paper warns.
  const glare=lit.some(t=>t.white/t.n>.8)&&means.some(v=>v<110);
  const motion=motionBetween(frame,previous);
  let message='';
  if(glare)message='Evite reflexos.';
  else if(brightness<95||contrast<35)message='Melhore a iluminação.';
  else if(sharpness<5||edges/n<.0005)message='Ajuste o foco e segure a câmera firmemente.';
  else if(motion>10)message='Segure a câmera firmemente.';
  return {ok:!message,message:message||'Folha estável e legível.',area,brightness,contrast,sharpness,motion,glare};
}

export function mapFramePoints(points, source, target) {
  if(Math.abs((source.width/source.height)/(target.width/target.height)-1)>.005) throw new Error('A orientação mudou. Segure a câmera firmemente e fotografe novamente.');
  return points.map(p=>({x:p.x*target.width/source.width,y:p.y*target.height/source.height}));
}
