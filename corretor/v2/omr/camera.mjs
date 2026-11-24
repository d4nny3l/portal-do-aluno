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
  try {
    await track.applyConstraints({ advanced: [{ [name]: value }] });
    // Advanced constraints can be ignored by the browser. If it reports an
    // incompatible focus mode, don't present the request as applied.
    if(name==='focusMode'){
      const actual=track.getSettings?.()?.focusMode;
      if(actual!=null&&actual!==value)return false;
    }
    return true;
  } catch { return false; }
}


// Native focus is optional. A stalled capability request must not prevent video
// from opening. The browser may still finish its own native request later.
export async function requestContinuousFocus(track,timeoutMs=2500){
  if(!cameraControls(safeCapabilities(track)).focusMode)return false;
  let timer;
  try{
    return await Promise.race([applyCameraControl(track,'focusMode','continuous'),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs)})]);
  }finally{clearTimeout(timer)}
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
  const settings = track?.getSettings?.() || {};
  if (settings.facingMode === 'user' || /front|frontal|selfie/i.test(track?.label || '')) return false;
  if (settings.deviceId && settings.deviceId !== deviceId) return false;
  // A supported maximum is not the resolution of the delivered video frames.
  // Fail closed when effective track settings are missing or inconsistent.
  const w = settings.width, h = settings.height;
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
    const acquire = async (id,activate=true) => {
      const stream = await media.getUserMedia({audio:false,video:id?{deviceId:{exact:id}}:{facingMode:{exact:'environment'}}});
      if (generation !== this.generation) {stream.getTracks().forEach(t=>t.stop());throw new Error('Abertura da câmera cancelada.');}
      if (activate) this.stream = stream;return stream;
    };
    const negotiate = async stream => {
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Nenhum fluxo de vídeo foi recebido. Importe uma fotografia.');
      const facing = track.getSettings?.().facingMode;
      if (facing === 'user' || (/front|user|frontal|face/i.test(track.label) && !/back|rear|traseira|environment/i.test(track.label))) {
        throw new Error('A câmera traseira não está disponível neste navegador. Importe uma fotografia para continuar.');
      }
      const caps = safeCapabilities(track), constraints = {};
      // Prefer a common 4:3 pair; independent equal maxima may request a square stream.
       if (caps.width?.max) constraints.width={ideal:Math.min(1920,caps.width.max)};
       if (caps.height?.max) constraints.height={ideal:Math.min(1440,caps.height.max)};
       if (caps.aspectRatio) constraints.aspectRatio={ideal:4/3};
      if (caps.resizeMode?.includes('none')) constraints.resizeMode={exact:'none'};
      if (track.applyConstraints && Object.keys(constraints).length) {
        try {await track.applyConstraints(constraints)} catch { /* Keep usable native video. */ }
      }
      if (generation !== this.generation) throw new Error('Abertura da câmera cancelada.');
      const zoom = await reduceUnwantedCameraZoom(track);
      if (generation !== this.generation) throw new Error('Abertura da câmera cancelada.');
      await requestContinuousFocus(track);
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
        const originalStream=stream;
        const originalId=selected.track.getSettings?.().deviceId||'';
        const originalZoom=selected.zoom.after;
        let optionalStream=null;
        try {
          // Keep the proven main-camera stream alive while probing an optional lens.
          // Cancellation still stops the main stream; a late candidate is stopped by acquire().
          optionalStream=await acquire(wider.deviceId,false);
          const candidate=await negotiate(optionalStream);
          if (!adequateWideStream(candidate.track,wider.deviceId,originalZoom)) throw new Error('Lente mais aberta não confirmou resolução/qualidade nativa suficiente.');
          if (generation!==this.generation) throw new Error('Abertura da câmera cancelada.');
          originalStream.getTracks().forEach(t=>t.stop());
          stream=optionalStream;this.stream=optionalStream;selected=candidate;
        } catch(error) {
          optionalStream?.getTracks().forEach(t=>t.stop());
          if (generation!==this.generation) throw error;
          // A denied OPTIONAL device is not proof that the selected main camera failed.
          // If browser permission was revoked and the main track has ended, try only
          // to restore the previously verified original device; never use a frontal fallback.
          const mainIsLive=originalStream.active!==false &&
            originalStream.getVideoTracks().some(t=>t.readyState!=='ended');
          if (!mainIsLive) {
            originalStream.getTracks().forEach(t=>t.stop());this.stream=null;
            stream=await acquire(originalId);
            selected=await negotiate(stream);
          } else {
            stream=originalStream;this.stream=originalStream;
          }
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

// A smaller sheet is not automatically unreadable. For the conservative alternative
// below, measure each actual dark marker core in both axes; never infer detail from
// an upscaled canvas or from area alone. The final image is checked independently.
export function markerCorePixels(frame, corners) {
  const {gray,width,height}=frame;
  const short=Math.min(...corners.map((p,i)=>Math.hypot(p.x-corners[(i+1)%4].x,p.y-corners[(i+1)%4].y)));
  const radius=Math.max(5,Math.min(60,Math.ceil(short*.08)));
  return Math.min(...corners.flatMap(p=>[[1,0],[0,1]].map(([dx,dy])=>{
    const x=Math.round(p.x),y=Math.round(p.y);
    if(x-radius<0||x+radius>=width||y-radius<0||y+radius>=height)return 0;
    const sample=i=>gray[(y+i*dy)*width+x+i*dx];
    const center=sample(0);
    let light=0;
    for(let i=-radius;i<=radius;i++)light=Math.max(light,sample(i));
    if(light-center<35)return 0;
    const threshold=(light+center)/2;
    let a=0,b=0;
    while(a>-radius&&sample(a-1)<=threshold)a--;
    while(b<radius&&sample(b+1)<=threshold)b++;
    return a===-radius||b===radius?0:b-a+1;
  })));
}
export function captureQuality(frame, detection, previous = null, {captureSize=frame} = {}) {
  const {gray,width,height} = frame, corners = detection?.corners;
  if (!detection?.found || detection.confidence < .7 || corners?.length !== 4) return {ok:false,message:'Centralize o cartão.'};
  const area = Math.abs(corners.reduce((s,p,i) => {const q=corners[(i+1)%4];return s+p.x*q.y-q.x*p.y},0)/2)/(width*height);
  // Preserve the detector's existing 8% lower bound. Below 18%, require
  // sufficient real capture pixels and visible marker detail, not digital zoom.
  if (area < .08) return {ok:false,message:'Aproxime a folha aos poucos, sem perder o foco.',area};
  if (corners.some(p => p.x < width*.015 || p.x > width*.985 || p.y < height*.015 || p.y > height*.985)) return {ok:false,message:'Centralize o cartão.',area};
  const scale=Math.min(captureSize.width/width,captureSize.height/height);
  const minEdge=Math.min(...corners.map((p,i)=>Math.hypot(p.x-corners[(i+1)%4].x,p.y-corners[(i+1)%4].y)));
  const effectiveEdge=minEdge*scale;
  const markerPixels=area<.18?markerCorePixels(frame,corners):null;
  const enoughDetail=area>=.18||(Number.isFinite(scale)&&scale>=1&&effectiveEdge>=360&&markerPixels>=4&&markerPixels*scale>=10);
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
  else if(brightness<95)message='Melhore a iluminação.';
  else if(contrast<35||sharpness<5||edges/n<.0005)message='Afaste um pouco a folha se estiver perto demais. Aguarde o foco e mantenha boa iluminação.';
  else if(!enoughDetail)message='Aproxime a folha aos poucos, somente enquanto continuar nítida.';
  else if(motion>10)message='Segure a câmera firmemente.';
  return {ok:!message,message:message||'Folha estável e legível.',area,brightness,contrast,sharpness,motion,glare,effectiveEdge,markerPixels};
}

export function mapFramePoints(points, source, target) {
  if(Math.abs((source.width/source.height)/(target.width/target.height)-1)>.005) throw new Error('A orientação mudou. Segure a câmera firmemente e fotografe novamente.');
  return points.map(p=>({x:p.x*target.width/source.width,y:p.y*target.height/source.height}));
}
