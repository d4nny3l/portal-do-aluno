// Separate diagnostic target, never a student card or an OMR geometry change.
export function calibrationSvg() {
  const lines=[];
  for(let x=30;x<=180;x+=30)lines.push(`<path d="M${x} 30V270"/>`);
  for(let y=48.5;y<=248.5;y+=40)lines.push(`<path d="M20 ${y}H190"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="white"/><g fill="black">${[[8,8],[202,8],[202,289],[8,289]].map(([x,y])=>`<rect x="${x-2.75}" y="${y-2.75}" width="5.5" height="5.5"/>`).join('')}</g><g fill="none" stroke="black" stroke-width=".45">${lines.join('')}<circle cx="105" cy="148.5" r="10"/></g><g font-family="sans-serif" text-anchor="middle" font-size="3"><text x="105" y="19">SALTA · PADRÃO DE DIAGNÓSTICO DA CÂMERA</text><text x="105" y="282">Imprimir em 100% · grade 30 × 40 mm · não é cartão de respostas</text></g></svg>`;
}

export function calibrationMetrics(gray,width,height) {
  if(gray?.length!==width*height)throw new Error('Imagem de calibração inválida.');
  const sx=width/210,sy=height/297,lines=[];
  // Search narrow bands at known grid coordinates, avoiding perpendicular intersections.
  for(const vertical of [true,false]) for(let mm=vertical?30:48.5;mm<=(vertical?180:248.5);mm+=vertical?30:40){
    const points=[];
    for(let along=vertical?35:25;along<=(vertical?265:185);along+=5){
      const crossStep=vertical?40:30,crossStart=vertical?48.5:30;
      if(Math.abs((along-crossStart)/crossStep-Math.round((along-crossStart)/crossStep))*crossStep<4)continue;
      if(Math.hypot((vertical?mm:along)-105,(vertical?along:mm)-148.5)<24)continue;
      let weight=0,sum=0;
      for(let offset=-6;offset<=6;offset+=1/(vertical?sx:sy)){
        const x=Math.round((vertical?mm+offset:along)*sx),y=Math.round((vertical?along:mm+offset)*sy);
        const darkness=Math.max(0,225-gray[y*width+x]);weight+=darkness;sum+=(mm+offset)*darkness;
      }
      if(weight>50)points.push({t:along,p:sum/weight});
    }
    if(points.length<12)continue;
    const mt=points.reduce((s,p)=>s+p.t,0)/points.length,mp=points.reduce((s,p)=>s+p.p,0)/points.length;
    const slope=points.reduce((s,p)=>s+(p.t-mt)*(p.p-mp),0)/points.reduce((s,p)=>s+(p.t-mt)**2,0);
    const rms=Math.sqrt(points.reduce((s,p)=>s+(p.p-mp-slope*(p.t-mt))**2,0)/points.length);
    lines.push({axis:vertical?'x':'y',positionMm:mm,offsetMm:mp-mm,slope,rmsMm:rms});
  }
  if(lines.length<10)throw new Error('Padrão incompleto. Fotografe o padrão de diagnóstico inteiro e ajuste os quatro marcadores.');
  const maxCurvatureMm=Math.max(...lines.map(l=>l.rmsMm));
  const maxOffsetMm=Math.max(...lines.map(l=>Math.abs(l.offsetMm)));
  const edgeEnergy=(left,top,right,bottom)=>{let sum=0,n=0;for(let y=Math.round(top*sy)+1;y<bottom*sy-1;y++)for(let x=Math.round(left*sx)+1;x<right*sx-1;x++){const i=y*width+x;sum+=Math.abs(gray[i-1]-gray[i+1])+Math.abs(gray[i-width]-gray[i+width]);n++}return sum/n};
  const centerSharpness=edgeEnergy(60,100,150,200),edgeSharpness=(edgeEnergy(20,30,50,270)+edgeEnergy(160,30,190,270))/2;
  return {lines,maxCurvatureMm,maxOffsetMm,centerSharpness,edgeSharpness,edgeToCenter:centerSharpness?edgeSharpness/centerSharpness:null,lensCorrection:false};
}
