// Offline diagnostic only. Never uploads/logs image, learner identity, grades or keys.
// Usage: node scripts/diagnose-omr-raster.mjs model.json normalized.gray 1200 1697 11,15,26,29,41,50,51,54,58
// The image MUST be an aligned 8-bit single-channel grayscale raster from the
// reader (raw bytes, row-major, no PNG/JPEG header); provide its exact dimensions.
import { readFile } from 'node:fs/promises';
import { importCardManifest } from '../corretor/v2/omr/manifest.mjs';
import { diagnoseRaster } from '../corretor/v2/omr/reader.mjs';

// Historical PR #45 review classification, evaluated from the same normalized
// pixels via rounded diagnostic scores. Borderline values can differ by 0.1;
// exact physical A/B requires executing the historical commit against this file.
function auditedPR45(scores) {
 const s=[...scores].sort((a,b)=>b.core-a.core),[first,second]=s;
 const strong=s.filter(item=>item.core>=155);
 const partial=s.filter(item=>item.core<155&&item.shifted>=97.65&&item.extended>=97&&item.coverage>=.18
  && item.shifted-Math.min(...s.filter(other=>other!==item).map(other=>other.shifted))>=27
  && item.extended-Math.min(...s.filter(other=>other!==item).map(other=>other.extended))>=20);
 const weak=s.filter(item=>item.core<155&&item.core>=110&&item.extended>=126&&item.coverage>=.4);
 if(strong.length>1)return 'double';
 if(strong.length===1&&partial.some(item=>item!==strong[0]))return 'review';
 if(strong.length===1)return first.core-second.core<18?'review':'read';
 if(partial.length)return partial.length>1?'double':'review';
 return weak.length>1?'review':'blank';
}

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
    const alternatives=row.choiceScores.map(score=>{
      const peers=row.choiceScores.filter(other=>other!==score);
      return {...score,margemMelhorConcorrente:{
        deslocada:Math.round((score.shifted-Math.max(...peers.map(p=>p.shifted)))*10)/10,
        circular:Math.round((score.extended-Math.max(...peers.map(p=>p.extended)))*10)/10
      }};
    });
    return {questao:row.number,estadoLeitorOriginal:before,
      estadoPR45AuditadoAproximado:auditedPR45(row.choiceScores),
      estadoCorrigido:row.state,candidatas:row.candidateMarks,alternativas:alternatives};
   });
  // Never include student codes, names, headers, metadata, or model hashes.
  console.log(JSON.stringify({origem:'raster normalizado local',questoes:rows},null,2));
 }catch(error){console.error('Falha no diagnóstico:',error.message);process.exitCode=1;}
}
