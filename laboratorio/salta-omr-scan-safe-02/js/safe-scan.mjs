export function reconcile(a,b){
 if(!a?.ok||!b?.ok)return {complete:false,reason:"Um caminho óptico não pôde ser validado.",reading:null};
 const x=a.reading,y=b.reading;
 if(x.contentHash!==y.contentHash||x.templateId!==y.templateId||x.templateRevision!==y.templateRevision||x.page!==y.page||x.pageCount!==y.pageCount||x.observations.length!==y.observations.length)return {complete:false,reason:"Modelo ou página divergente.",reading:null};
 const identityOk=x.identity.state===y.identity.state&&x.identity.code===y.identity.code&&["read","disabled"].includes(x.identity.state);
 const peer=new Map(y.observations.map(o=>[o.questionId,o]));let conflicts=0;
 const observations=x.observations.map(o=>{
  const t=peer.get(o.questionId);
  const same=t&&o.number===t.number&&o.page===t.page&&o.state===t.state&&o.answer===t.answer&&JSON.stringify([...o.marks].sort())===JSON.stringify([...t.marks].sort());
  if(!same||o.state==="review"||!identityOk){conflicts++;return {...o,answer:null,recognition:null,state:"review",reviewed:false};}
  return {...o,reviewed:true};
 });
 return {complete:conflicts===0&&identityOk,reason:conflicts||!identityOk?"Divergência óptica ou identificação pendente. Confira a folha física.":null,reading:{...x,identity:identityOk?x.identity:{state:"review",code:null},observations,needsReview:conflicts>0||!identityOk},conflicts};
}

export function frameFresh(state,time,now,usable=true){
 if(!usable||!Number.isFinite(time)||!Number.isFinite(now)){state.time=null;state.at=null;return {fresh:false,reset:true};}
 if(state.time!=null&&time===state.time)return {fresh:false,reset:now-state.at>250};
 const reset=state.time==null||time<state.time||state.at==null||now-state.at>500;
 state.time=time;state.at=now;return {fresh:true,reset};
}

export function sceneSignature(rgba,w,h){
 if(!rgba||rgba.length!==w*h*4||w<24||h<24)return {valid:false};
 const n=12,grid=new Float32Array(n*n);
 for(let gy=0;gy<n;gy++)for(let gx=0;gx<n;gx++){let sum=0;for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){const x=Math.min(w-1,Math.floor((gx+(sx+.5)/4)*w/n)),y=Math.min(h-1,Math.floor((gy+(sy+.5)/4)*h/n)),i=(y*w+x)*4;sum+=.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2];}grid[gy*n+gx]=sum/16;}
 const edges=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=grid[y*n+x];for(const b of [x+1<n?grid[y*n+x+1]:null,y+1<n?grid[(y+1)*n+x]:null])if(b!==null)edges.push((a-b)/Math.max(30,a+b));}
 return {valid:true,edges,energy:edges.reduce((s,v)=>s+Math.abs(v),0)/edges.length};
}

export function structuralChange(a,b){
 if(!a?.valid||!b?.valid||!a.edges||!b.edges||a.edges.length!==b.edges.length)return false;
 const distance=a.edges.reduce((s,v,i)=>s+Math.abs(v-b.edges[i]),0)/a.edges.length;
 return a.energy>=.012&&distance>=.018;
}

export function canRetain(pages,page,maxBytes=96*1024*1024,maxPages=100){
 return pages.length<maxPages&&pages.reduce((s,p)=>s+(p.frame?.size||0)+(p.out?.size||0),0)+(page.frame?.size||0)+(page.out?.size||0)<=maxBytes;
}
