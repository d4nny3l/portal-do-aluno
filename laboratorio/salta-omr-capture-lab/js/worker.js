// Scancat — page processing off the main thread: warp → enhance → rotate.

import * as V from "./vision.js";
import {enhanceDocument} from "./document-enhance.mjs";
const gray8 = (rgba,w,h) => { const g=new Uint8Array(w*h); for(let i=0,j=0;i<g.length;i++,j+=4)g[i]=Math.round(.299*rgba[j]+.587*rgba[j+1]+.114*rgba[j+2]); return g; };

self.onmessage = (e) => {
  const { id, op } = e.data;
  try {
    if (op === "process") {
      const { data, w, h, corners, mode, rot, maxSide, optical } = e.data;
      const size = V.outputSize(corners, maxSide || 2600);
      let out = V.warp(data, w, h, corners, size.w, size.h);
      const source = optical ? {gray:gray8(data,w,h),width:w,height:h} : null;
      const opticalImage = optical ? V.rotate(V.enhance(out,size.w,size.h,"gray"),size.w,size.h,rot||0) : null;
      const rectified = opticalImage ? {gray:gray8(opticalImage.data,opticalImage.w,opticalImage.h),width:opticalImage.w,height:opticalImage.h} : null;
      out = enhanceDocument(out, size.w, size.h, mode);
      const r = V.rotate(out, size.w, size.h, rot || 0);
      const transfer=[r.data.buffer];
      if(source&&rectified)transfer.push(source.gray.buffer,rectified.gray.buffer);
      self.postMessage({ id, data: r.data, w: r.w, h: r.h, optical:source?{source,rectified}:null },transfer);
      return;
    }
    throw new Error(`unknown op ${op}`);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
