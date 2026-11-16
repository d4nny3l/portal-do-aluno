// Only this controller's explicit confirm() can issue a mutation.
export class AttendanceDraftController {
  constructor({api,onChange=()=>{},newId=()=>crypto.randomUUID()}){this.api=api;this.onChange=onChange;this.newId=newId;this.generation=0;this.context=null;this.drafts=new Map();this.loads=new Map();this.contract=null;}
  setContext(context){this.generation++;this.context=context?{class_id:Number(context.class_id),period:Number(context.period)}:null;this.drafts.clear();this.loads.clear();this.contract=null;return this.generation;}
  key(item){return JSON.stringify([this.context?.class_id,this.context?.period,item.date,Number(item.shift_id),Number(item.weekday),Number(item.lesson_number)]);}
  get(key){return this.drafts.get(key);}
  async open(item){
    if(!this.context||Number(item.class_id)!==this.context.class_id)throw Error('Selecione a turma correta antes de abrir a chamada.');
    const key=this.key(item);if(this.drafts.has(key))return this.drafts.get(key);if(this.loads.has(key))return this.loads.get(key);
    const generation=this.generation,context={...this.context},current=()=>generation===this.generation;
    const task=(async()=>{
      let contract;try{contract=await(this.contract||(this.contract=this.api('/frequencia/contrato?class_id='+context.class_id)))}catch{if(current())this.contract=null;throw Error('A confirmação segura da chamada ainda não está disponível. Nenhuma presença foi gravada.');}
      if(!current())return null;
      if(contract.version!=='d04-v1'||!contract.enabled)throw Error(contract.reason||'A confirmação segura ainda não foi homologada. Nenhuma presença foi gravada.');
      const fields={...context,institution_id:contract.institution_id,shift_id:Number(item.shift_id),weekday:Number(item.weekday),lesson_number:Number(item.lesson_number),attendance_date:item.date};
      const snapshot=await this.api('/frequencia/ocorrencias/rascunho?'+new URLSearchParams(fields));if(!current())return null;
      if(snapshot.contract!=='d04-v1'||snapshot.institution_id!==fields.institution_id||!Array.isArray(snapshot.registros))throw Error('O contexto da chamada não corresponde ao modelo seguro. Reabra a turma.');
      const draft={key,item:{...item},fields,snapshot,choices:new Map(snapshot.registros.map(r=>[Number(r.student_id),snapshot.session_id?r.present:true])),saving:false,request:null,error:'',generation};
      this.drafts.set(key,draft);this.onChange();return draft;
    })();
    this.loads.set(key,task);try{return await task}catch(error){if(!current())return null;throw error}finally{if(current())this.loads.delete(key)}
  }
  toggle(key,id){const draft=this.drafts.get(key);if(!draft||draft.saving||draft.request)return false;if(!draft.choices.has(Number(id)))throw Error('Estudante não pertence a esta chamada.');draft.choices.set(Number(id),draft.choices.get(Number(id))===true?false:true);this.onChange();return true;}
  cancel(key){const draft=this.drafts.get(key);if(draft?.saving)return false;this.drafts.delete(key);this.onChange();return true;}
  async reopen(key){const item=this.drafts.get(key)?.item;if(!item)return null;if(!this.cancel(key))return null;return this.open(item);}
  async confirm(key){
    const draft=this.drafts.get(key);if(!draft||draft.generation!==this.generation)throw Error('Reabra a chamada no contexto atual.');
    if(draft.saving)return null;
    if([...draft.choices.values()].some(v=>typeof v!=='boolean'))throw Error('Revise os estudantes sem registro antes de confirmar.');
    if(!draft.request){draft.request={...draft.fields,confirm:true,request_id:this.newId(),expected_version:draft.snapshot.version,expected_snapshot:draft.snapshot.snapshot,...(draft.snapshot.session_id?{session_id:draft.snapshot.session_id}:{}),registros:[...draft.choices].map(([student_id,present])=>({student_id,present}))};}
    // Keep this exact request after any ambiguous failure. Editing cannot reuse
    // its id with another payload or silently overwrite a later confirmation.
    const request=draft.request,generation=this.generation;draft.saving=true;draft.error='';this.onChange();
    try{
      const receipt=await this.api('/frequencia/ocorrencias',{method:draft.snapshot.session_id?'PUT':'POST',body:request});
      if(generation!==this.generation)return null;
      if(receipt?.ok!==true||receipt.request_id!==request.request_id||receipt.institution_id!==request.institution_id||receipt.total!==request.registros.length||receipt.version!==request.expected_version+1||!Number.isSafeInteger(receipt.id)||receipt.id<1||receipt.presentes!==request.registros.filter(r=>r.present).length||receipt.faltas!==request.registros.filter(r=>!r.present).length)throw Error('O servidor não forneceu o recibo esperado. Reenvie a mesma confirmação.');
      this.drafts.delete(key);this.onChange();return receipt;
    }catch(error){if(generation!==this.generation)return null;if(generation===this.generation){draft.error=error.message||'Não foi possível confirmar. Reenvie a mesma confirmação ou reabra para conferir.';}throw error;}
    finally{if(generation===this.generation){draft.saving=false;this.onChange();}}
  }
}
