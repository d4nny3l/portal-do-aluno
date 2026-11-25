// Presentation only: never requests a stream, constraints, crop or optical processing.
export function createCameraPresentation({video, onDimensionsChanged, window:win=window, document:doc=document, debug=false}) {
  let stream=null, width=0, height=0, epoch=0, playing=null;
  const listeners=[], events=[];
  function snapshot(reason='snapshot') {
    const rect=element=>{
      const r=element?.getBoundingClientRect();
      return r?{width:r.width,height:r.height}:null;
    };
    let settings={};
    try{settings=stream?.getVideoTracks()[0]?.getSettings?.()||{};}catch{/* ended/browser-specific track */}
    const rendered=rect(video),container=rect(video.parentElement);
    const style=win.getComputedStyle?.(video);
    // Whitelist numeric geometry/state. No IDs, labels, frames, models or credentials.
    return {reason,time:Date.now(),session:epoch,intrinsic:{width:video.videoWidth,height:video.videoHeight},
      video:rendered,container,
      ratios:{intrinsic:video.videoHeight?video.videoWidth/video.videoHeight:null,
        rendered:rendered?.height?rendered.width/rendered.height:null,container:container?.height?container.width/container.height:null},
      objectFit:style?.objectFit??null,objectPosition:style?.objectPosition??null,
      track:{width:settings.width??null,height:settings.height??null,aspectRatio:settings.aspectRatio??null,
        resizeMode:settings.resizeMode??null,readyState:stream?.getVideoTracks()[0]?.readyState??null},
      viewport:{width:win.innerWidth,height:win.innerHeight,visualWidth:win.visualViewport?.width??null,
        visualHeight:win.visualViewport?.height??null,scale:win.visualViewport?.scale??null},
      hidden:doc.hidden,paused:video.paused,readyState:video.readyState};
  }
  function record(reason){if(debug){events.push(snapshot(reason));if(events.length>160)events.shift();}}
  function sync(reason='sync') {
    if(!stream||video.srcObject!==stream)return false;
    const w=video.videoWidth,h=video.videoHeight;
    if(!(w>0&&h>0))return false; // temporary missing metadata is not new geometry
    if(w===width&&h===height)return false;
    const previous={width,height};width=w;height=h;
    onDimensionsChanged({width,height,previous});record(reason);
    return true;
  }
  function resume(reason){
    sync(reason);record(reason);
    if(doc.hidden||!stream||video.srcObject!==stream||!video.paused||playing)return;
    const request=epoch;
    // Resume this same video/stream after background suspension. Never reopen the lens.
    playing=Promise.resolve().then(()=>{
      if(request===epoch&&!doc.hidden&&video.srcObject===stream)return video.play();
    }).catch(()=>{if(request===epoch)record('play-rejected');}).finally(()=>{if(request===epoch)playing=null;});
  }
  function listen(target,event,callback){target?.addEventListener?.(event,callback);listeners.push(()=>target?.removeEventListener?.(event,callback));}
  function stop(){
    record('detach');epoch++;listeners.splice(0).forEach(remove=>remove());
    stream=null;width=0;height=0;playing=null;
  }
  function start(next){
    stop();stream=next;
    for(const event of ['loadedmetadata','resize'])listen(video,event,()=>sync(event));
    for(const event of ['resize','orientationchange'])listen(win,event,()=>{sync(event);record(event);});
    listen(win.visualViewport,'resize',()=>{sync('visualViewport');record('visualViewport');});
    listen(doc,'visibilitychange',()=>resume('visibilitychange'));
    listen(win,'pageshow',()=>resume('pageshow'));
    const track=stream.getVideoTracks()[0];
    listen(track,'mute',()=>record('track-mute'));
    listen(track,'unmute',()=>resume('track-unmute'));
    listen(track,'ended',()=>record('track-ended'));
    sync('attach');record('attach');
  }
  return {start,stop,sync,snapshot,events};
}
