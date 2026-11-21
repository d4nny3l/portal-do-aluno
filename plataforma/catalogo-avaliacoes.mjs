// Private catalog projection for UI labels. No storage, public fallback, or answer rendering.
const sameScope=(a,b)=>['institutionId','classId','periodId'].every(k=>a?.[k]===b?.[k]);
export const assessmentLabel=row=>[
 row?.title,row?.subject??row?.definition?.subject,
 row?.className??row?.definition?.manifest?.header?.className
].map(value=>typeof value==='string'?value.trim():'').filter(Boolean).join(' - ');

// The listing endpoint omits subject and readable class. Fetch current private
// revisions BEFORE publishing options. At most two authenticated reads in flight.
export async function enrichCatalogRows(rows,{open,isCurrent,onDenied=()=>{},cache=new Map(),concurrency=2}={}){
 if(!Array.isArray(rows)||typeof open!=='function'||typeof isCurrent!=='function'||
    !Number.isInteger(concurrency)||concurrency<1||concurrency>3)
  throw new TypeError('Consulta de metadados do catálogo inválida.');
 let cursor=0,failure=null;
 const hydrated=new Array(rows.length);
 async function worker(){
  while(!failure&&isCurrent()){
   const i=cursor++;
   if(i>=rows.length)return;
   const row=rows[i];
   // Revisions without a stable number cannot be safely reused from cache.
   const key=Number.isSafeInteger(row.revision)&&row.revision>=1?row.id+'@'+row.revision:null;
   try{
    // A complete, authenticated listing projection needs no extra detail GET.
    if(typeof row.title==='string'&&row.title.trim()&&
       typeof row.subject==='string'&&row.subject.trim()&&
       typeof row.className==='string'&&row.className.trim()){
     hydrated[i]={...row};continue;
    }
    let meta=key?cache.get(key):null;
    if(!meta){
     const record=await open(row.id,row.revision??null);
     if(!isCurrent())return;
     if(!record||record.id!==row.id||!sameScope(record,row)||
        (row.revision!=null&&record.revision!==row.revision))
      throw new TypeError('Metadados de revisão incompatíveis com o catálogo autorizado.');
     meta=Object.freeze({
      title:record.definition?.title||row.title,
      subject:typeof record.definition?.subject==='string'?record.definition.subject:'',
      className:typeof record.definition?.manifest?.header?.className==='string'?
       record.definition.manifest.header.className:''
     });
     if(key)cache.set(key,meta);
    }
    if(!isCurrent())return;
    hydrated[i]={...row,...meta};
   }catch(error){
    if(!isCurrent())return;
    if(!failure){
     failure=error;
     if(error?.status===401||error?.status===403)onDenied(error);
    }
   }
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,rows.length)},()=>worker()));
 if(failure)throw failure;
 return isCurrent()?hydrated:null;
}
