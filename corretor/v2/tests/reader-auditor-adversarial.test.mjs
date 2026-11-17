import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplate,layoutTemplate} from '../omr/template.mjs';
import {createCardManifest} from '../omr/render.mjs';
import {readRaster,diagnoseRaster} from '../omr/reader.mjs';

// Explicit synthetic ground truth is assigned before executing either reader.
// Moderate competing marks in the two "artifact" cases represent non-answer
// noise intentionally applied by the fixture; not a claim about real handwriting.
const width=900,height=Math.round(width*297/210);
const cases=[
 {id:'blank-2',type:'C-E',truth:[],ink:[]},
 {id:'blank-4',type:'A-D',truth:[],ink:[]},
 {id:'blank-5',type:'A-E',truth:[],ink:[]},
 {id:'printed-ring-4',type:'A-D',truth:[],ink:[],ring:true},
 {id:'shadow-blank-5',type:'A-E',truth:[],ink:[],paper:195},
 {id:'noise-blank-5',type:'A-E',truth:[],ink:[],noise:true},
 {id:'strong-2',type:'C-E',truth:['E'],ink:[{choice:'E',shade:0}]},
 {id:'strong-4',type:'A-D',truth:['A'],ink:[{choice:'A',shade:0}]},
 {id:'strong-5',type:'A-E',truth:['D'],ink:[{choice:'D',shade:20}]},
 {id:'strong-artifact-4',type:'A-D',truth:['A'],ink:[{choice:'A',shade:0},{choice:'B',shade:110,artifact:true}]},
 {id:'strong-artifact-5',type:'A-E',truth:['A'],ink:[{choice:'A',shade:0},{choice:'B',shade:110,artifact:true}]},
 {id:'double-near-strong-5',type:'A-E',truth:['A','D'],ink:[{choice:'A',shade:0},{choice:'D',shade:70}]},
 {id:'partial-2',type:'C-E',truth:['E'],ink:[{choice:'E',shade:120,irregular:true}]},
 {id:'partial-4',type:'A-D',truth:['B'],ink:[{choice:'B',shade:120,irregular:true}]},
 {id:'partial-5',type:'A-E',truth:['C'],ink:[{choice:'C',shade:115,irregular:true}]},
 {id:'blue-offset-5',type:'A-E',truth:['B'],ink:[{choice:'B',shade:130,dx:2,dy:-1}]},
 {id:'partial-shadow-2',type:'C-E',truth:['C'],ink:[{choice:'C',shade:115,dx:2}],paper:195},
 {id:'double-strong-2',type:'C-E',truth:['C','E'],ink:[{choice:'C',shade:0},{choice:'E',shade:0}]},
 {id:'double-strong-4',type:'A-D',truth:['B','D'],ink:[{choice:'B',shade:0},{choice:'D',shade:0}]},
 {id:'double-partial-2',type:'C-E',truth:['C','E'],ink:[{choice:'C',shade:115},{choice:'E',shade:115}]},
 {id:'double-partial-4',type:'A-D',truth:['B','D'],ink:[{choice:'B',shade:115},{choice:'D',shade:115}]},
 {id:'double-partial-5',type:'A-E',truth:['B','D'],ink:[{choice:'B',shade:115},{choice:'D',shade:115}]},
 {id:'faint-mark-5',type:'A-E',truth:['B'],ink:[{choice:'B',shade:190}]},
];
function rasterFor(entry){
 const template=createTemplate([{type:entry.type,count:1,label:'Sintético'}],{identityMode:'none'});
 const manifest=createCardManifest(template),layout=layoutTemplate(template,{width,height,manifest});
 const pixels=new Uint8Array(width*height).fill(entry.paper??245);
 const put=(x,y,shade)=>{const xx=Math.round(x),yy=Math.round(y);if(xx>=0&&yy>=0&&xx<width&&yy<height)pixels[yy*width+xx]=Math.min(pixels[yy*width+xx],shade)};
 const bubbles=layout.cells[0].bubbles;
 for(const b of bubbles){
  if(entry.ring)for(let y=-10;y<=10;y++)for(let x=-10;x<=10;x++)if(Math.abs(x*x+y*y-81)<=15)put(b.x+x,b.y+y,90);
  if(entry.noise)for(let d=0;d<6;d++)put(b.x+d%3-1,b.y+(d*3)%7-3,200-d%2*15);
 }
 for(const ink of entry.ink){
  const b=bubbles.find(b=>b.choice===ink.choice);assert.ok(b,ink.choice);
  const radius=7;
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
   if(x*x+y*y>radius*radius)continue;
   if(ink.irregular&&x>-2&&y<1&&x*x+y*y<radius*radius*.32)continue;
   put(b.x+x+(ink.dx||0),b.y+y+(ink.dy||0),ink.shade);
  }
 }
 return {template,manifest,pixels};
}
function auditedBefore(scores){
 const s=[...scores].sort((a,b)=>b.core-a.core),[first,second]=s;
 const strong=s.filter(x=>x.core>=155);
 const partial=s.filter(x=>x.core<155&&x.shifted>=97.65&&x.extended>=97&&x.coverage>=.18
  && x.shifted-Math.min(...s.filter(y=>x!==y).map(y=>y.shifted))>=27
  && x.extended-Math.min(...s.filter(y=>x!==y).map(y=>y.extended))>=20);
 const weak=s.filter(x=>x.core<155&&x.core>=110&&x.extended>=126&&x.coverage>=.4);
 if(strong.length>1)return 'double';
 if(strong.length===1&&partial.some(x=>x!==strong[0]))return 'review';
 if(strong.length===1)return first.core-second.core<18?'review':'read';
 if(partial.length)return partial.length>1?'double':'review';
 return weak.length>1?'review':'blank';
}
function classify(truth,state,answer){
 return {
  correctDefinitive:truth.length===1&&state==='read'&&answer===truth[0],
  recoveredReview:truth.length===1&&state==='review',
  markedIgnored:truth.length>0&&state==='blank',
  blankReview:truth.length===0&&['review','double'].includes(state),
  incorrectDefinitive:state==='read'&&(truth.length!==1||answer!==truth[0])
 };
}
test('A-01/A-03: 23 independently labelled raster scenarios comparing audited PR #45 and fix',()=>{
 const zeros=()=>({correctDefinitive:0,recoveredReview:0,markedIgnored:0,blankReview:0,incorrectDefinitive:0});
 const before=zeros(),after=zeros(),rows=[];
 for(const entry of cases){
  const {template,manifest,pixels}=rasterFor(entry);
  const actual=readRaster(template,pixels,width,height,{manifest}).observations[0];
  const diagnostics=diagnoseRaster(template,pixels,width,height,{manifest})[0].choiceScores;
  const previous=auditedBefore(diagnostics),oldAnswer=previous==='read'?[...diagnostics].sort((a,b)=>b.core-a.core)[0].choice:null;
  for(const [state,answer,counts] of [[previous,oldAnswer,before],[actual.state,actual.answer,after]])
   for(const [category,match]of Object.entries(classify(entry.truth,state,answer)))if(match)counts[category]++;
  rows.push({id:entry.id,truth:entry.truth.join('+')||'blank',before:previous,after:actual.state,answer:actual.answer,marks:actual.marks});
  if(entry.truth.length>1){assert.ok(['double','review'].includes(actual.state),entry.id);assert.equal(actual.answer,null);assert.deepEqual(new Set(actual.marks),new Set(entry.truth),entry.id)}
  if(entry.truth.length===0)assert.equal(actual.state,'blank',entry.id);
 }
 assert.equal(after.incorrectDefinitive,0);
 assert.equal(after.blankReview,0);
 assert.equal(after.markedIgnored,1,'faint mark intentionally remains unrecognized');
 assert.equal(after.correctDefinitive,5);
 assert.equal(after.recoveredReview,5);
 assert.ok(after.correctDefinitive>before.correctDefinitive);
 for(const id of ['strong-artifact-4','strong-artifact-5']){
  const row=rows.find(x=>x.id===id);assert.equal(row.before,'review');assert.equal(row.after,'read');assert.equal(row.answer,'A');assert.deepEqual(row.marks,['A']);
 }
 for(const id of ['partial-2','partial-4','partial-5','blue-offset-5','partial-shadow-2']){
  const row=rows.find(x=>x.id===id);assert.equal(row.after,'review');assert.equal(row.answer,null);
 }
 console.log('A-03 synthetic labelled comparison:',JSON.stringify({before,after}));
 console.log('A-03 per-case states:',JSON.stringify(rows));
});


// P1 research: dry-run only. This never changes the production classifier.
// The proposed envelope is deliberately stricter than the 'review' heuristic.
function provisionalPromotion(observation,scores){
 if(observation.state!=='review'||observation.marks.length!==1||observation.answer!==null)return null;
 const choice=observation.marks[0],s=scores.find(x=>x.choice===choice);
 if(!s)return null;
 const peers=scores.filter(x=>x.choice!==choice);
 const margin=field=>s[field]-Math.max(...peers.map(x=>x[field]));
 if(s.core<118||s.shifted<128||s.extended<105||s.coverage<.3)return null;
 if(margin('core')<42||margin('shifted')<55||margin('extended')<35)return null;
 // A provisional result does not represent an official answer or a correction.
 return choice;
}

test('P1 dry run: proposed pencil/partial promotion measured on the same 23 labelled rasters',()=>{
 const totals={cases:cases.length,readBefore:0,reviewBefore:0,blankBefore:0,doubleBefore:0,
  promoted:0,correctPromoted:0,wrongPromoted:0,falseBlankPromoted:0,doublePromoted:0};
 const details=[];
 for(const entry of cases){
  const {template,manifest,pixels}=rasterFor(entry);
  const result=readRaster(template,pixels,width,height,{manifest}).observations[0];
  const scores=diagnoseRaster(template,pixels,width,height,{manifest})[0].choiceScores;
  totals[result.state+'Before']++;
  const suggested=provisionalPromotion(result,scores);
  if(suggested){
   totals.promoted++;
   if(entry.truth.length===1&&entry.truth[0]===suggested)totals.correctPromoted++;
   else totals.wrongPromoted++;
   if(entry.truth.length===0)totals.falseBlankPromoted++;
   if(entry.truth.length>1)totals.doublePromoted++;
  }
  details.push({fixture:entry.id,before:result.state,proposal:suggested??'review unchanged'});
 }
 // Synthetic guardrails; a real-field acceptance requires a separate dataset.
 assert.equal(totals.wrongPromoted,0);
 assert.equal(totals.falseBlankPromoted,0);
 assert.equal(totals.doublePromoted,0);
 console.log('SALTA P1 PROBE, SYNTHETIC ONLY:',JSON.stringify({totals,details}));
});

test('P1 observability limit: same pencil-like grayscale cannot prove marking intent',()=>{
 const pencil={id:'graphite-mark',type:'A-E',truth:['B'],ink:[{choice:'B',shade:130,dx:2,dy:-1}]};
 const artifact={...pencil,id:'graphite-shaped-smudge',truth:[]};
 const a=rasterFor(pencil),b=rasterFor(artifact);
 assert.deepEqual(a.pixels,b.pixels,'identical pixels must be interpreted the same');
 const reading=readRaster(a.template,a.pixels,width,height,{manifest:a.manifest}).observations[0];
 const scores=diagnoseRaster(a.template,a.pixels,width,height,{manifest:a.manifest})[0].choiceScores;
 const proposed=provisionalPromotion(reading,scores);
 // No classifier, including this probe, can distinguish two labels with
 // identical pixels. Therefore field negatives and review safeguards are needed.
 console.log('SALTA P1 IDENTIFIABILITY CHECK:',JSON.stringify({samePixels:true,readerState:reading.state,proposed,labels:['mark','smudge']}));
});
