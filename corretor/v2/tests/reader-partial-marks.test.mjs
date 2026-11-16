import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemplate, createLegacyTemplate, layoutTemplate } from '../omr/template.mjs';
import { createCardManifest } from '../omr/render.mjs';
import { importCardManifest } from '../omr/manifest.mjs';
import { readRaster, diagnoseRaster } from '../omr/reader.mjs';

const width = 900, height = Math.round(width * 297 / 210);
const sections = [
  {type:'A-D',count:20,label:'Questões básicas'},
  {type:'A-E',count:20,label:'Questões gerais'},
  {type:'C-E',count:20,label:'Certo ou errado'},
];
const template = createTemplate(sections, {student:{code:'0001123'}});
const manifest = createCardManifest(template,null,{sectionFrameStyle:'content'});
const layout = layoutTemplate(template,{width,height,manifest});
const sample = (paper=245) => new Uint8Array(width*height).fill(paper);
const darken = (pixels,x,y,dark) => {
 const px=Math.round(x),py=Math.round(y);
 if(px>=0&&py>=0&&px<width&&py<height)pixels[py*width+px]=Math.min(pixels[py*width+px],dark);
};
function circle(pixels,bubble,{ink=25,dx=0,dy=0,r=7,kind='solid'}={}){
 for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
  if(x*x+y*y>r*r)continue;
  if(kind==='irregular'&&x>-2&&y<1&&x*x+y*y<r*r*.32)continue;
  darken(pixels,bubble.x+x+dx,bubble.y+y+dy,ink);
 }
}
function bubble(number,choice){
 const q=layout.cells.find(c=>c.number===number);
 assert.ok(q,number);
 const selected=q.bubbles.find(b=>b.choice===choice);
 assert.ok(selected,choice);
 return selected;
}
function initialModel(pixels, number) {
 const cell=layout.cells.find(c=>c.number===number),radius=Math.max(1,Math.round(cell.bubbleRadius*.42));
 const scores=cell.bubbles.map(b=>{
  let sum=0,n=0;
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
   const px=Math.round(b.x)+x,py=Math.round(b.y)+y;
   if(px>=0&&py>=0&&px<width&&py<height){sum+=255-pixels[py*width+px];n++;}
  }
  return {choice:b.choice,score:sum/Math.max(1,n)};
 }).sort((a,b)=>b.score-a.score);
 return scores[0].score>=155?(scores[1].score>=155?'double':scores[0].score-scores[1].score<18?'review':'read'):'blank';
}
function get(result,n){return result.observations.find(o=>o.number===n);}
function addCode(pixels,code='0001123'){
 for(const column of [1,2,3,4,5,6,7]){
  const b=layout.codeGrid.find(b=>b.column===column&&b.digit===Number(code[column-1]));
  assert.ok(b);
  circle(pixels,b,{ink:0,r:Math.max(2,Math.round(b.radius*.7))});
 }
}
function renderComparison({paper=245,mark=null,weakChoice=null,second=null}={}){
 const pixels=sample(paper);
 addCode(pixels);
 if(mark)circle(pixels,bubble(mark.n,mark.choice),mark);
 if(weakChoice)circle(pixels,bubble(weakChoice.n,weakChoice.choice),weakChoice);
 if(second)circle(pixels,bubble(second.n,second.choice),second);
 return pixels;
}

test('physical-like cases: preserve strong marks and blanks; partial marks request review',()=>{
 const cases=[
  {n:15,choice:'A',settings:{ink:20,r:7},before:'read',after:'read'},
  {n:26,choice:'D',settings:{ink:20,r:7},before:'read',after:'read'},
  {n:29,choice:'B',settings:{ink:30,r:7},before:'read',after:'read'},
  {n:41,choice:'E',settings:{ink:120,r:7,kind:'irregular'},before:'blank',after:'review'},
  {n:50,choice:'E',settings:{ink:20,r:7},before:'read',after:'read'},
  {n:58,choice:'C',settings:{ink:115,r:7,kind:'irregular'},before:'blank',after:'review'},
  {n:51,choice:'C',settings:{ink:0,r:8},before:'read',after:'read'},
 ];
 for(const c of cases){
  const pixels=renderComparison({mark:{n:c.n,choice:c.choice,...c.settings}});
  assert.equal(initialModel(pixels,c.n),c.before,'prior: '+c.n);
  const result=readRaster(template,pixels,width,height,{manifest});
  const question=get(result,c.n);
  assert.equal(question.state,c.after,'candidate: '+c.n);
  assert.equal(question.answer,c.after==='read'?c.choice:null,'automatic answer: '+c.n);
  assert.ok(question.marks.includes(c.choice),'candidate bubble visible for human review: '+c.n);
  assert.equal(result.identity.code,'0001123','seven digits preserved');
  const diag=diagnoseRaster(template,pixels,width,height,{manifest}).find(item=>item.number===c.n);
  assert.equal(diag.state,c.after);
  assert.equal(diag.choiceScores.length,c.n<=20?4:c.n<=40?5:2);
  assert.ok(diag.choiceScores.every(s=>Number.isFinite(s.core)&&Number.isFinite(s.extended)&&s.coverage>=0&&s.coverage<=1));
 }
 const blank=renderComparison();
 const result=readRaster(template,blank,width,height,{manifest});
 for(const n of [11,54])assert.deepEqual({state:get(result,n).state,answer:get(result,n).answer},{state:'blank',answer:null});
 assert.equal(result.identity.code,'0001123');
});

test('guard rails: double marks never auto-selected; pale/blank/shadowed bubbles do not turn into answers',()=>{
 for(const n of [12,28,45]){
  const kind=n===45?'C':'A',other=n===45?'E':'B';
  const strong=renderComparison({mark:{n,choice:kind,ink:0,r:7},second:{n,choice:other,ink:0,r:7}});
  assert.equal(get(readRaster(template,strong,width,height,{manifest}),n).state,'double');
  const partial=renderComparison({mark:{n,choice:kind,ink:115,r:7},second:{n,choice:other,ink:115,r:7}});
  const observation=get(readRaster(template,partial,width,height,{manifest}),n);
  assert.equal(observation.answer,null,'two weak marks cannot yield a single answer');
  assert.notEqual(observation.state,'read');
 }
 for(const paper of [255,235,195,165]){
  const pixels=renderComparison({paper});
  const result=readRaster(template,pixels,width,height,{manifest});
  assert.ok(result.observations.every(q=>q.state==='blank'),'uniform shadow '+paper);
  assert.equal(result.identity.code,'0001123','code under shadow '+paper);
 }
 const pale=renderComparison({mark:{n:24,choice:'B',ink:186,r:7}});
 const result=readRaster(template,pale,width,height,{manifest});
 assert.equal(get(result,24).answer,null,'pale mark is not promoted automatically');
});

test('exact V1/V2 manifests, hashes and historical models continue to import',()=>{
 const oldTemplate=createLegacyTemplate([{type:'A-D',count:10,label:'Histórico'}]);
 const oldManifest=createCardManifest(oldTemplate);
 const v1=importCardManifest({manifest:oldManifest});
 const v2=importCardManifest({manifest});
 assert.equal(v1.manifest.contentHash,oldManifest.contentHash);
 assert.equal(v2.manifest.contentHash,manifest.contentHash);
 const oldRaster=sample();
 const a=readRaster(v1.template,oldRaster,width,height,{manifest:v1.manifest});
 const b=readRaster(v2.template,sample(),width,height,{manifest:v2.manifest});
 assert.equal(a.layoutVersion,'v1');
 assert.equal(b.layoutVersion,'v2');
 assert.equal(a.contentHash,oldManifest.contentHash);
 assert.equal(b.contentHash,manifest.contentHash);
 assert.ok(a.observations.every(q=>q.state==='blank'));
 assert.ok(b.observations.every(q=>q.state==='blank'));
});
