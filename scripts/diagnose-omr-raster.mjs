// Offline diagnostic only. Never uploads/logs image, learner identity, grades or keys.
// Usage: node scripts/diagnose-omr-raster.mjs model.json normalized.gray 1200 1697 11,15,26,29,41,50,51,54,58
// The image MUST be an aligned 8-bit single-channel grayscale raster from the
// reader (raw bytes, row-major, no PNG/JPEG header); provide its exact dimensions.
import { readFile } from 'node:fs/promises';
import { importCardManifest } from '../corretor/v2/omr/manifest.mjs';
import { diagnoseRaster } from '../corretor/v2/omr/reader.mjs';

const [modelPath, rasterPath, widthText, heightText, numbersText] = process.argv.slice(2);
if (!modelPath || !rasterPath || !widthText || !heightText) {
 console.error('Uso: node scripts/diagnose-omr-raster.mjs modelo.json raster.gray largura altura [questões]');
 process.exitCode=2;
} else {
 try {
  const width=Number(widthText),height=Number(heightText);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<300||height<300||width*height>9_000_000)throw new RangeError('Dimensões inválidas.');
  const json=JSON.parse(await readFile(modelPath,'utf8'));
  const {template,manifest}=importCardManifest(json);
  const raw=await readFile(rasterPath);
  if(raw.length!==width*height)throw new RangeError('Raster incompatível com as dimensões indicadas.');
  const wanted=numbersText?new Set(numbersText.split(',').map(n=>Number(n.trim()))):null;
  if(wanted&&[...wanted].some(n=>!Number.isSafeInteger(n)||n<1||n>150))throw new RangeError('Lista de questões inválida.');
  const rows=diagnoseRaster(template,new Uint8Array(raw),width,height,{manifest})
   .filter(r=>!wanted||wanted.has(r.number))
   .map(row=>{
    const [first,second]=[...row.choiceScores].sort((a,b)=>b.core-a.core);
    const before=first.core>=155?(second.core>=155?'double':first.core-second.core<18?'review':'read'):'blank';
    return {questao:row.number,estadoAntes:before,estadoCandidato:row.state,
      candidatas:row.candidateMarks,alternativas:row.choiceScores};
   });
  // Never include student codes, names, headers, metadata, or model hashes.
  console.log(JSON.stringify({origem:'raster normalizado local',questoes:rows},null,2));
 }catch(error){console.error('Falha no diagnóstico:',error.message);process.exitCode=1;}
}
