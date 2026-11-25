export function confirmAssessmentDeletion({document,title,opener}){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='assessment-delete-dialog';
  dialog.setAttribute('aria-labelledby','assessment-delete-title');dialog.setAttribute('aria-describedby','assessment-delete-warning');
  const heading=document.createElement('h2');heading.id='assessment-delete-title';heading.textContent='Excluir avaliação?';
  const name=document.createElement('p');name.textContent=title;
  const warning=document.createElement('p');warning.id='assessment-delete-warning';warning.textContent='Esta avaliação será excluída permanentemente. Não será possível recuperá-la.';
  const actions=document.createElement('div');actions.className='omr-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.autofocus=true;cancel.className='assessment-delete-cancel';
  const erase=document.createElement('button');erase.type='button';erase.textContent='Excluir definitivamente';erase.className='assessment-delete-confirm';
  let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();if(!value)document.defaultView?.setTimeout(()=>opener?.focus(),0);resolve(value)};
  cancel.onclick=()=>finish(false);erase.onclick=()=>finish(true);
  dialog.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();(document.activeElement===cancel?erase:cancel).focus()}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});
  dialog.addEventListener('close',()=>finish(false));
  actions.append(cancel,erase);dialog.append(heading,name,warning,actions);document.body.append(dialog);
  dialog.showModal();cancel.focus();
 });
}
