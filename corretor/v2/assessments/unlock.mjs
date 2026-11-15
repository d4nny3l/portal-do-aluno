import {createRecoveryVault,recoverVault} from '../../../assessments-lab/crypto/recovery-vault.mjs';
export async function unlockProtectedRepository(repo){
 const {vault}=await repo.request('/api/key-vault');
 const section=document.createElement('section');section.className='corretor-card';section.setAttribute('aria-label','Cofre de gabaritos');
 section.innerHTML='<h2>Cofre de gabaritos · homologação</h2><p>Somente avaliações sintéticas. A frase abre sua chave neste navegador e não é enviada ao servidor. Guarde-a fora da SALTA: sem ela não há recuperação. O desbloqueio dura até 15 minutos.</p><form class="omr-form-grid"><label>Frase de recuperação<input id="vaultPhrase" type="password" autocomplete="off" minlength="16" maxlength="1024" required></label><label id="vaultConfirmLabel">Repita a frase<input id="vaultConfirm" type="password" autocomplete="off" minlength="16" maxlength="1024"></label><button type="submit">Desbloquear cofre</button><p role="status" aria-live="polite"></p></form>';
 const form=section.querySelector('form'),phrase=section.querySelector('#vaultPhrase'),confirm=section.querySelector('#vaultConfirm'),status=section.querySelector('[role=status]'),button=section.querySelector('button');
 section.querySelector('#vaultConfirmLabel').hidden=!!vault;confirm.required=!vault;
 button.textContent=vault?'Desbloquear cofre':'Criar cofre de teste';
 document.querySelector('.corretor-content').prepend(section);
 await new Promise(resolve=>{form.onsubmit=async event=>{
  event.preventDefault();button.disabled=true;status.textContent='Abrindo o cofre localmente…';
  try{
   let current=vault;
   if(!current){
    if(phrase.value!==confirm.value)throw Error('As frases não coincidem.');
    const created=await createRecoveryVault(phrase.value,repo.session.principalId);
    await repo.request('/api/key-vault',{method:'PUT',data:created.vault});
    current=(await repo.request('/api/key-vault')).vault;
   }
   repo.key=await recoverVault(phrase.value,repo.session.principalId,current);
   phrase.value='';confirm.value='';section.remove();resolve();
  }catch(error){status.textContent=error.message;button.disabled=false}
 }});
 repo.unlockedUntil=Date.now()+15*60_000;
 const expire=()=>{repo.lock();location.replace('/')};
 repo.expiryTimer=setTimeout(expire,15*60_000);
 repo.sessionTimer=setInterval(()=>repo.guard().catch(expire),60_000);
 addEventListener('pagehide',()=>repo.lock(),{once:true});
 addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
}
