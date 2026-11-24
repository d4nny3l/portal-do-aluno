// #122: standalone print-only geometry; never changes the optical template or manifest.
export const ECONOMY_PRINT_VERSION='salta-embedded-economy-print-v1';
const A4=[{orientation:'portrait',widthMm:210,heightMm:297},{orientation:'landscape',widthMm:297,heightMm:210}];
const EDGE=6,CLEAR=4,SCISSORS=7;
const num=n=>String(Math.round(n*10000)/10000);
export function planEconomySheet(manifest,copies){
 if(copies!==2&&copies!==4)throw new RangeError('Escolha 2 ou 4 quadros por folha.');
 if(manifest?.mode!=='embedded')throw new TypeError('Impressão econômica exclusiva de quadro incorporado.');
 const w=Number(manifest.paper?.widthMm),h=Number(manifest.paper?.heightMm);
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw new TypeError('Dimensões físicas inválidas.');
 const layouts=[];
 for(const paper of A4)for(const [cols,rows] of (copies===2?[[2,1],[1,2]]:[[2,2]])){
  const cw=paper.widthMm/cols,ch=paper.heightMm/rows;
  const cells=Array.from({length:copies},(_,i)=>{
   const col=i%cols,row=Math.floor(i/cols);
   const left=col===0?EDGE:CLEAR,right=col===cols-1?EDGE:CLEAR,top=row===0?EDGE:CLEAR,bottom=row===rows-1?EDGE:CLEAR;
   return {index:i+1,col,row,x:col*cw,y:row*ch,cw,ch,left,top,aw:cw-left-right,ah:ch-top-bottom};
  });
  const scale=Math.floor(Math.min(1,...cells.flatMap(c=>[c.aw/w,c.ah/h]))*1e6)/1e6;
  if(scale<=0)continue;
  const slots=cells.map(c=>({index:c.index,x:c.x+c.left+(c.aw-w*scale)/2,y:c.y+c.top+(c.ah-h*scale)/2,
   width:w*scale,height:h*scale,scale,cell:{x:c.x,y:c.y,width:c.cw,height:c.ch}}));
  layouts.push({...paper,columns:cols,rows,scale,slots});
 }
 if(!layouts.length)throw new RangeError('Não há encaixe seguro para esse quadro.');
 layouts.sort((a,b)=>b.scale-a.scale||(a.orientation==='portrait'?-1:1)-(b.orientation==='portrait'?-1:1)||a.columns-b.columns);
 const best=layouts[0],guides=[];
 if(best.columns===2)guides.push({axis:'vertical',x1:best.widthMm/2,y1:EDGE,x2:best.widthMm/2,y2:best.heightMm-EDGE});
 if(best.rows===2)guides.push({axis:'horizontal',x1:EDGE,y1:best.heightMm/2,x2:best.widthMm-EDGE,y2:best.heightMm/2});
 return {...best,copies,originalWidth:w,originalHeight:h,edgeMarginMm:EDGE,guideClearanceMm:CLEAR,scissorsMm:SCISSORS,guides};
}
function cutter(x,y){
 const cx=num(x-SCISSORS/2),cy=num(y-SCISSORS/2);
 return '<g data-economy-scissors="true" transform="translate('+cx+' '+cy+')">'+
  '<rect x="-.4" y="-.4" width="7.8" height="7.8" rx="1.1" fill="#fff"/>'+
  '<g transform="scale(.291667)" stroke="#454545" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="none">'+
  '<circle cx="5.5" cy="6" r="3.2"/><circle cx="5.5" cy="18" r="3.2"/>'+
  '<path d="M8 8.5 21 21 M8 15.5 21 3"/><circle cx="12" cy="12" r="1.15" fill="#fff"/></g></g>';
}
function positionedSvg(source,slot){
 const raw=source.trim(),found=/^<svg\b[^>]*>/u.exec(raw);
 if(!found||!/\sviewBox="[^"]+"/u.test(found[0])||!/\swidth="[^"]+"/u.test(found[0])||!/\sheight="[^"]+"/u.test(found[0]))
  throw new TypeError('SVG original sem dimensões e viewBox verificáveis.');
 const open=found[0].replace(/\swidth="[^"]+"/u,' width="'+num(slot.width)+'mm"')
  .replace(/\sheight="[^"]+"/u,' height="'+num(slot.height)+'mm"')
  .replace(/^<svg/u,'<svg data-economy-copy="'+slot.index+'" x="'+num(slot.x)+'" y="'+num(slot.y)+'"');
 return open+raw.slice(found[0].length);
}
const named=student=>Boolean(student&&typeof student==='object'&&Object.values(student).some(v=>typeof v==='string'&&v.trim()));
export function buildEconomyPrintDocument({template,manifest,header,renderSvg,copies}){
 const p=planEconomySheet(manifest,copies);
 if(!template||typeof renderSvg!=='function')throw new TypeError('Modelo SVG indisponível.');
 if(named(template.identity?.student)||named(manifest.identity?.student)||named(manifest.identityCode?.student)||
  manifest.identityBubbles?.some(b=>b.filled)||manifest.identityCode?.columns?.some(c=>c.printedDigit))
  throw new Error('Remova os dados individuais do aluno antes de imprimir cópias idênticas.');
 const original=renderSvg(template,{header,manifest});
 const copiesSvg=p.slots.map(slot=>positionedSvg(original,slot)).join('\n');
 const lines=p.guides.map(g=>'<line data-economy-cut="'+g.axis+'" x1="'+num(g.x1)+'" y1="'+num(g.y1)+'" x2="'+num(g.x2)+'" y2="'+num(g.y2)+'" stroke="#777" stroke-width=".32" stroke-dasharray="1.7 1.5" fill="none"/>').join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" class="economy-sheet" role="img" aria-label="A4 com '+copies+' quadros idênticos" width="'+p.widthMm+'mm" height="'+p.heightMm+'mm" viewBox="0 0 '+p.widthMm+' '+p.heightMm+'" data-economy-copies="'+copies+'" data-economy-scale="'+p.scale+'" data-economy-orientation="'+p.orientation+'" data-source-hash="'+manifest.contentHash+'">'+
  '<rect width="'+p.widthMm+'" height="'+p.heightMm+'" fill="#fff"/>'+copiesSvg+'<g data-economy-guides="true">'+lines+cutter(p.widthMm/2,p.heightMm/2)+'</g></svg>';
 const advice='A4 '+(p.orientation==='landscape'?'paisagem':'retrato')+' · '+copies+' cópias · escala '+(p.scale*100).toFixed(2).replace('.',',')+'%. Imprima em tamanho real (100%), sem ajustar à página. Leitura física de quadros reduzidos ainda não homologada.';
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Impressão econômica SALTA</title><style>'+
 '@page{size:A4 '+p.orientation+';margin:0}html,body{margin:0;padding:0;background:#fff}.economy-page{width:'+p.widthMm+'mm;height:'+p.heightMm+'mm;margin:0;overflow:hidden;break-after:auto;page-break-after:auto}.economy-sheet{display:block;width:'+p.widthMm+'mm;height:'+p.heightMm+'mm;max-width:none;max-height:none}.print-advice{font:14px Arial,sans-serif;padding:8px;text-align:center}'+
 '@media screen{body{background:#eee}.print-advice{max-width:680px;margin:auto}.economy-page{margin:10px auto;background:#fff;box-shadow:0 2px 14px #0002}}@media print{body{background:#fff}.print-advice{display:none!important}.economy-page{margin:0;box-shadow:none;break-inside:avoid;page-break-inside:avoid}}</style></head><body>'+
 '<p class="print-advice">'+advice+'</p><main class="economy-page">'+svg+'</main><script>addEventListener("load",()=>setTimeout(()=>print(),200))</script></body></html>';
}
