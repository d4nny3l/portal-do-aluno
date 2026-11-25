import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Extract the exact non-exported classification function without changing the
// official reader. This is a targeted pixel-level regression, not full OMR.
const src=readFileSync(new URL('../../../corretor/v2/omr/reader.mjs',import.meta.url),'utf8');
const start=src.indexOf('function inkAt'),end=src.indexOf('/**\n * Diagnostic only',start);
assert.ok(start>=0&&end>start);
const classify=new Function(src.slice(start,end)+'\nreturn analyzeQuestion;')();
const w=360,h=480,cell={bubbleRadius:12,bubbles:[0,1,2,3,4].map(i=>({x:84+i*48,y:240,choice:'ABCDE'[i]}))};
function image(marks){
 const a=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let val=220;for(let k=0;k<cell.bubbles.length;k++){const b=cell.bubbles[k],d=Math.hypot(x-b.x,y-b.y);if(d>=11&&d<=12)val=Math.min(val,25);if(marks[k]!=null&&d<=9)val=Math.min(val,marks[k]);}
  a.set([val,val,val,255],(y*w+x)*4);
 }return a;
}
test('real worker separates all visual filters from both optical buffers',async()=>{
 let output;
 const oldSelf=globalThis.self;
 globalThis.self={postMessage:r=>{output=r;}};
 try{
  await import('../js/worker.js');
  const exec=(marks,mode)=>{output=null;globalThis.self.onmessage({data:{id:1,op:'process',data:image(marks),w,h,corners:[[0,0],[w,0],[w,h],[0,h]],mode,rot:0,maxSide:2600,optical:true}});assert.ok(output&&!output.error,output?.error);return output;};
  for(const [marks,expected] of [[[130],'read'],[[65,95],'double']]){
   const color=exec(marks,'color'),gray=exec(marks,'gray'),bw=exec(marks,'bw');
   for(const key of ['source','rectified']){
    assert.deepEqual(color.optical[key].gray,gray.optical[key].gray);
    assert.deepEqual(color.optical[key].gray,bw.optical[key].gray);
    const r=color.optical[key],answer=classify(cell,r.gray,r.width,r.height,100,18);
    assert.equal(answer.state,expected);if(expected==='read')assert.equal(answer.winner,'A');
   }
  }
 }finally{if(oldSelf===undefined)delete globalThis.self;else globalThis.self=oldSelf;}
});
