// Regressões PAPER-SAFE — node laboratorio/salta-omr-capture-lab/tests/paper-safe.test.mjs
import assert from 'node:assert/strict';
import {cameraScene,changedScene,createCardFlow,cardCaptured,cardReadFinished,cardNotDetected,cardDetected} from '../js/card-flow.js';
import {fullPaperVisible,addPaperMargin} from '../js/paper-geometry.js';

function flatFrame(luma){
 const w=160,h=120,data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<data.length;i+=4)data[i]=data[i+1]=data[i+2]=luma,data[i+3]=255;
 return cameraScene(data,w,h);
}
const paper=flatFrame(225),desk=flatFrame(51),blur=flatFrame(218);
assert.equal(changedScene(paper,desk),true);
assert.equal(changedScene(paper,blur),false);
const gate=createCardFlow();
cardCaptured(gate,{cardId:1,now:1000,scene:paper});
assert.equal(cardDetected(gate),false,'A mesma folha não pode disparar novamente');
assert.equal(cardReadFinished(gate,99),false,'Não receber leitura de outra página');
assert.equal(cardReadFinished(gate,1),true);
for(const now of [1110,1400,1700,2000,2400,2700])
 cardNotDetected(gate,{now,scene:blur});
assert.equal(gate.phase,'locked','Desfoque não equivale à retirada da folha');
assert.equal(cardDetected(gate),false);
for(const now of [3000,3200,3420,3630,3850])
 cardNotDetected(gate,{now,scene:desk});
assert.equal(gate.phase,'vacant','A saída real da folha deve liberar a próxima');
assert.equal(cardDetected(gate),true);
assert.equal(gate.phase,'ready');
cardCaptured(gate,{cardId:2,now:3930,scene:paper});
for(const now of [4050,4320,4560,4780])
 cardNotDetected(gate,{now,scene:desk});
assert.equal(gate.phase,'vacant');
assert.equal(cardDetected(gate),false,'Leitura anterior ainda não terminou');
assert.equal(cardReadFinished(gate,2),true);
assert.equal(cardDetected(gate),true,'Rearmar automaticamente após a leitura');
const rect=[[24,26],[360,22],[361,478],[21,480]];
assert.equal(fullPaperVisible(rect,384,512),true);
const expanded=addPaperMargin(rect,384,512);
assert.ok(expanded[0][0]<rect[0][0] && expanded[0][1]<rect[0][1]);
assert.ok(expanded[2][0]>rect[2][0] && expanded[2][1]>rect[2][1]);
assert.equal(fullPaperVisible([[0,26],[360,22],[361,478],[0,480]],384,512),false,
 'Folha cortada na câmera não é válida para disparo');
console.log('PAPER-SAFE: fluxo contínuo sem duplicatas e margens externas passaram.');
