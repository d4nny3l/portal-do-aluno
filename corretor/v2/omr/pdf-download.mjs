// #125: browser-only vector PDF generation. No API, printing, uploads or OMR mutations.
// jsPDF and svg2pdf.js are pinned MIT libraries bundled locally, loaded on first request.
import {createCardManifest,renderTemplateSvg,DEFAULT_CARD_HEADER} from './render.mjs';
import {bindStudentToManifest} from './export.mjs';
import {buildEconomySheetSvg} from './print-economy.mjs';

export const PDF_DOWNLOAD_VERSION='salta-vector-pdf-download-v1';
const A4={width:210,height:297};
let vendorPromise;
function loadScript(path){
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=new URL(path,import.meta.url).href;
  script.async=true;
  script.onload=()=>resolve();
  script.onerror=()=>{script.remove();reject(new Error('Não foi possível carregar o gerador de PDF local. Confira a conexão e tente novamente.'));};
  document.head.appendChild(script);
 });
}
export async function getPdfRuntime(){
 if(typeof document==='undefined')throw new Error('A geração vetorial de PDF exige um navegador.');
 if(!vendorPromise)vendorPromise=(async()=>{
  await loadScript('../../../plataforma/vendor/pdf/jspdf.umd.min.js');
  await loadScript('../../../plataforma/vendor/pdf/svg2pdf.umd.min.js');
  const jsPDF=globalThis.jspdf?.jsPDF;
  if(typeof jsPDF!=='function'||typeof jsPDF.API.svg!=='function')throw new Error('O gerador vetorial de PDF não foi inicializado corretamente.');
  return jsPDF;
 })().catch(error=>{vendorPromise=null;throw error});
 return vendorPromise;
}
function vectorElement(source){
 const parsed=new DOMParser().parseFromString(source,'image/svg+xml');
 if(parsed.querySelector('parsererror')||parsed.documentElement?.localName!=='svg')throw new Error('O cartão contém SVG inválido para conversão.');
 const svg=document.importNode(parsed.documentElement,true);
 for(const image of svg.querySelectorAll('image')){
  const href=image.getAttribute('href')||image.getAttribute('xlink:href')||'';
  if(!/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/u.test(href))
   throw new Error('O logotipo precisa estar incorporado ao cartão, sem imagens externas.');
 }
 return svg;
}
function printPages(template,{header,manifest,students,economyCopies}){
 if(!template||!Array.isArray(students)||students.length>500)throw new Error('O lote de PDFs aceita até 500 cartões.');
 const source=manifest||createCardManifest(template,header);
 if(economyCopies){
  if(students.length)throw new Error('A impressão econômica não aceita cartões nominais em lote.');
  const {svg,plan}=buildEconomySheetSvg({template,manifest:source,header,renderSvg:renderTemplateSvg,copies:economyCopies});
  return [{svg,pageWidth:plan.widthMm,pageHeight:plan.heightMm,x:0,y:0,width:plan.widthMm,height:plan.heightMm}];
 }
 const width=Number(source.paper?.widthMm),height=Number(source.paper?.heightMm);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width>A4.width||height>A4.height||width<=0||height<=0)
  throw new Error('O manifesto contém dimensões físicas incompatíveis com o PDF A4.');
 const roster=students.length?students:[template.identity?.student||null];
 return roster.map(student=>{
  const printed=bindStudentToManifest(source,student);
  return {svg:renderTemplateSvg(template,{header,manifest:printed}),pageWidth:A4.width,pageHeight:A4.height,
   x:(A4.width-width)/2,y:(A4.height-height)/2,width,height};
 });
}
export async function generatePdfBlob(template,{
 header=DEFAULT_CARD_HEADER,manifest=null,students=[],economyCopies=0,
 onProgress=()=>{},runtime=null
}={}){
 if(economyCopies!==0&&economyCopies!==2&&economyCopies!==4)throw new RangeError('Selecione 2 ou 4 quadros por A4.');
 const pages=printPages(template,{header,manifest,students,economyCopies});
 const PDF=runtime||await getPdfRuntime();
 let doc=null;
 for(let i=0;i<pages.length;i++){
  const p=pages[i];
  if(!doc)doc=new PDF({orientation:p.pageWidth>p.pageHeight?'landscape':'portrait',
   unit:'mm',format:[p.pageWidth,p.pageHeight],compress:true,precision:12,putOnlyUsedFonts:true});
  else doc.addPage([p.pageWidth,p.pageHeight],p.pageWidth>p.pageHeight?'landscape':'portrait');
  // Keep the source SVG attached so svg2pdf can resolve CSS font metrics;
  // never render the source in the professor's visible editor.
  const host=document.createElement('div');
  host.setAttribute('aria-hidden','true');
  host.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none;width:1px;height:1px;';
  const svg=vectorElement(p.svg);
  host.appendChild(svg);
  document.body.appendChild(host);
  try{
   await doc.svg(svg,{x:p.x,y:p.y,width:p.width,height:p.height});
  }finally{host.remove();}
  onProgress(i+1,pages.length);
  // Yield periodically for a responsive status on slow/memory-constrained devices.
  if((i+1)%4===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 doc.setProperties({title:'Cartão de respostas SALTA',subject:'Cartão de respostas',creator:'SALTA - exportação local'});
 const buffer=doc.output('arraybuffer');
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<100||new TextDecoder('ascii').decode(new Uint8Array(buffer,0,5))!=='%PDF-')
  throw new Error('O arquivo gerado não é um PDF válido.');
 return new Blob([buffer],{type:'application/pdf'});
}
export function filenameForPdf({economyCopies=0,batch=false}={}){
 if(batch)return 'cartoes-resposta-lote.pdf';
 if(economyCopies===2||economyCopies===4)return 'cartao-respostas-'+economyCopies+'-por-a4.pdf';
 return 'cartao-respostas-a4.pdf';
}
