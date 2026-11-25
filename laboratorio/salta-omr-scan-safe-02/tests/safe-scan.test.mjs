import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcile,frameFresh,sceneSignature,structuralChange,canRetain} from '../js/safe-scan.mjs';
import * as flow from '../js/card-flow-safe.mjs';
function testSafe({reconcile,frameFresh,sceneSignature,structuralChange,canRetain,flow,assert}){
 const checks=[];const test=(name,ok)=>{assert(ok,name);checks.push(name);};
 const row=(state,answer,marks)=>({questionId:"1",number:1,page:1,state,answer,marks});
 const result=(o,id="1234567")=>({ok:true,reading:{contentHash:"abc",templateId:"t",templateRevision:1,page:1,pageCount:1,identity:{state:"read",code:id},observations:[o]}});
 const a=result(row("read","A",["A"])),b=result(row("double",null,["A","B"])),c=result(row("blank",null,[]));
 test("double never becomes single",!reconcile(b,a).complete&&reconcile(b,a).reading.observations[0].state==="review");
 test("weak/blank conflict not definitive",!reconcile(a,c).complete);
 test("same read allowed",reconcile(a,a).complete);
 test("different code blocked",!reconcile(a,result(row("read","A",["A"]),"7654321")).complete);
 test("one-path failure blocked",!reconcile(a,{ok:false}).complete);
 test("wrong page blocked",!reconcile(a,{ok:true,reading:{...a.reading,page:2}}).complete);
 let clock={};test("first frame resets",frameFresh(clock,1,100,true).reset);test("repeated timestamp not fresh",!frameFresh(clock,1,170,true).fresh);test("new timestamp fresh",frameFresh(clock,1.1,200,true).fresh);test("frozen after long gap stays rejected",!frameFresh(clock,1.1,900,true).fresh);test("long gap resets",frameFresh(clock,2,901,true).reset);test("muted stream not fresh",!frameFresh(clock,3,1000,false).fresh);
 const make=f=>{const w=120,h=120,d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=f(x,y);d.set([v,v,v,255],(y*w+x)*4)}return sceneSignature(d,w,h)};
 const value=(x,y)=>x<20||x>=100||y<15||y>=105?220:(Math.floor(x/10)+Math.floor(y/10))%2?180:245;
 const paper=make(value),shadow=make((x,y)=>Math.round(value(x,y)*.55)),desk=make(()=>220);
 test("similar brightness empty desk recognized",structuralChange(paper,desk));test("uniform darkening not removal",!structuralChange(paper,shadow));
 let g=flow.createCardFlow();flow.cardCaptured(g,{scene:paper,cardId:1});flow.cardReadFinished(g,1);
 for(let i=0;i<12;i++)flow.cardNotDetected(g,{scene:shadow,now:100*i});test("shadow does not unlock",g.phase==="locked");
 for(let i=0;i<12;i++)flow.cardNotDetected(g,{scene:desk,now:2000+100*i});test("desk unlocks",g.phase==="vacant"&&flow.cardDetected(g));
 g=flow.createCardFlow();flow.cardCaptured(g,{scene:paper,cardId:2});for(let i=0;i<12;i++)flow.cardNotDetected(g,{scene:desk,now:100*i});
 test("read pending blocks next",!flow.cardDetected(g));flow.cardReadFinished(g,2);test("after read next allowed",flow.cardDetected(g));test("memory cap",!canRetain([{frame:{size:80}}],{out:{size:30}},100,5));test("page cap",!canRetain([{}],{},100,1));return checks;
}
test('safe scan contract',()=>{const checks=testSafe({reconcile,frameFresh,sceneSignature,structuralChange,canRetain,flow,assert:(ok,n)=>assert.ok(ok,n)});console.log(checks);});
