import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../corretor-v2.html',import.meta.url),'utf8');
const lines=html.split('\n');
function one(prefix){const found=lines.filter(l=>l.startsWith(prefix));assert.equal(found.length,1,prefix);return found[0]}
const code=[one('function setCameraProgress('),one('function showCameraGrade('),one('function markLastReadingPending('),
 html.slice(html.indexOf('function scanCameraFrame(){'),html.indexOf('function updateCameraInfo(){'))].join('\n');

function setup({fail=false,inconclusive=false}={}){
 const elements=new Map();
 const $=id=>{if(!elements.has(id))elements.set(id,{id,hidden:false,dataset:{},textContent:'',innerHTML:'',checked:false});return elements.get(id)};
 const corners=[{x:100,y:100},{x:800,y:100},{x:800,y:900},{x:100,y:900}];
 const frame={gray:new Uint8Array(900*1000).fill(220),width:900,height:1000};
 let found=true, count=0, failure=fail;
 Object.assign($('video'),{videoWidth:900,videoHeight:1000,readyState:4});
 $('scanScore').hidden=false;$('scanScore').innerHTML='<strong>Nota final 10,00</strong>';$('scanScore').dataset.review='false';
 const state={
  $,cameraStream:{},cameraScratch:{},cameraFrameDimensions:'',stableFrames:0,previousCorners:null,
  previousCameraFrame:null,waitingForRemoval:false,absentFrames:0,lastCaptureAt:0,captureBusy:false,
  drawVideoFrame:()=>frame,detectFiducials:()=>found?{found:true,confidence:.96,corners}:{found:false,corners:[]},
  captureQuality:()=>({ok:true,message:'Folha estável.'}),samePosition:()=>true,
  positionGuides(){},updateCameraInfo(){},setScanMessage(){},captureFrameGray:()=>frame,
  mapFramePoints:x=>x,
  prepareImage(){count++;if(failure)return null;$('scanScore').dataset.review=inconclusive?'true':'false';return frame;}
 };
 vm.createContext(state);vm.runInContext(code,state,{timeout:3000});
 return {state,$,hide:()=>{found=false},show:()=>{found=true},fail:v=>{failure=v},count:()=>count};
}
test('camera indicators reflect stable, real consolidation and recognized card; reset on removal',()=>{
 const h=setup(),s=h.state;
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.$('cameraStableStatus').hidden,true);
 assert.equal(h.$('cameraCaptureStatus').hidden,true);
 s.scanCameraFrame();
 assert.equal(h.count(),1);
 for(const id of ['cameraStableStatus','cameraCaptureStatus','cameraReadStatus'])assert.equal(h.$(id).hidden,false,id);
 assert.match(h.$('cameraLiveBadge').textContent,/Aguardando retirada da folha/);
 s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),1,'no duplicate while sheet present');
 h.hide();s.scanCameraFrame();s.scanCameraFrame();
 for(const id of ['cameraStableStatus','cameraCaptureStatus','cameraReadStatus'])assert.equal(h.$(id).hidden,true,id);
 h.show();s.lastCaptureAt=0;
 s.scanCameraFrame();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),2);
});
test('failed normalization cannot claim consolidated or recognized; stale score is explicitly labeled',()=>{
 const h=setup({fail:true}),s=h.state;
 s.scanCameraFrame();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),1);assert.equal(s.waitingForRemoval,false);
 assert.equal(h.$('cameraCaptureStatus').hidden,true);
 assert.equal(h.$('cameraReadStatus').hidden,true);
 assert.match(h.$('scanScore').innerHTML,/Última leitura bem-sucedida/);
 assert.equal(h.$('scanScore').dataset.stale,'true');
 assert.equal(h.$('cameraGrade').hidden,true);
 h.fail(false);s.lastCaptureAt=0;
 s.scanCameraFrame();s.scanCameraFrame();s.scanCameraFrame();
 assert.equal(h.count(),2);
 assert.equal(h.$('cameraReadStatus').hidden,false);
});
test('optically inconclusive read cannot claim card recognized even when normalization succeeded',()=>{
 const h=setup({inconclusive:true});
 h.state.scanCameraFrame();h.state.scanCameraFrame();h.state.scanCameraFrame();
 assert.equal(h.$('cameraStableStatus').hidden,false);
 assert.equal(h.$('cameraCaptureStatus').hidden,false);
 assert.equal(h.$('cameraReadStatus').hidden,true);
});
