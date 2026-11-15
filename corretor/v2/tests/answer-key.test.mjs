import test from 'node:test';
import assert from 'node:assert/strict';
import {createTemplate,layoutTemplate} from '../omr/template.mjs';
import {createCardManifest} from '../omr/render.mjs';
import {readRaster} from '../omr/reader.mjs';
import {parseAnswerKey} from '../omr/answer-key.mjs';

test('A-03: 2,7,11,20 read and associate by stable IDs even in a different visual order',()=>{
 const t=createTemplate([{type:'A-E',items:[20,2,11,7].map(number=>({questionId:'stable-'+number,number,type:'A-E'}))}]);
 const m=createCardManifest(t),snapshot=JSON.stringify(m),w=840,h=1188;
 const cells=layoutTemplate(t,{width:w,height:h,manifest:m}).cells,pixels=new Uint8Array(w*h).fill(255);
 for(const cell of cells){const bubble=cell.bubbles.find(b=>b.choice==='C');for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++)pixels[(Math.round(bubble.y)+y)*w+Math.round(bubble.x)+x]=0;}
 const result=readRaster(t,pixels,w,h,{manifest:m});
 assert.deepEqual(result.observations.map(q=>q.questionId),['stable-2','stable-7','stable-11','stable-20']);
 const key=parseAnswerKey('2 C\n7 C\n11 C\n20 C',t.questions);assert.equal(key.valid,true);
 assert.ok(result.observations.every(q=>q.answer===key.answers.get(q.questionId)));
 assert.equal(JSON.stringify(m),snapshot);
 for(const raw of ['2 C\n7 C\n11 C\n1 C','2 C\n2 C\n11 C\n20 C','2 Z\n7 C\n11 C\n20 C'])assert.equal(parseAnswerKey(raw,t.questions).valid,false);
});

test('answer key validates actual formats and does not accept answers from another set of numbers',()=>{
 const questions=[{questionId:'a',number:2,type:'A-D',choices:['A','B','C','D']},{questionId:'b',number:7,type:'C-E',choices:['C','E']}];
 assert.equal(parseAnswerKey('2 D\n7 E',questions).answers.get('b'),'E');
 assert.equal(parseAnswerKey('2 E\n7 D',questions).valid,false);
 assert.equal(parseAnswerKey('1 D\n2 E',questions).valid,false);
});
