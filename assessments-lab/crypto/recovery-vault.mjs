// Password wraps a random root, not assessment data. No password/root is sent to the API.
const enc=new TextEncoder();
const encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function wrappingKey(password,salt){
 if(typeof password!=='string'||password.length<16||password.length>1024)throw Error('Use uma frase de recuperação com pelo menos 16 caracteres.');
 const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const aad=owner=>enc.encode(JSON.stringify({schema:'salta-key-vault-v1',owner}));
export async function createRecoveryVault(password,owner){
 const raw=crypto.getRandomValues(new Uint8Array(32)),salt=crypto.getRandomValues(new Uint8Array(32)),nonce=crypto.getRandomValues(new Uint8Array(12));
 try{
  const wrap=await wrappingKey(password,salt),ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad(owner)},wrap,raw);
  const key=await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
  return {key,vault:{schema:'salta-key-vault-v1',kdf:'PBKDF2-SHA256',iterations:600000,salt:encode(salt),nonce:encode(nonce),ciphertext:encode(new Uint8Array(ciphertext))}};
 }finally{raw.fill(0)}
}
export async function recoverVault(password,owner,vault){
 if(vault?.schema!=='salta-key-vault-v1'||vault.kdf!=='PBKDF2-SHA256'||vault.iterations!==600000)throw Error('Cofre de recuperação incompatível.');
 let raw;
 try{
  const key=await wrappingKey(password,decode(vault.salt));
  raw=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(vault.nonce),additionalData:aad(owner)},key,decode(vault.ciphertext)));
  if(raw.length!==32)throw Error('Invalid root');
  return await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
 }catch{throw Error('Não foi possível abrir o cofre. Confira a frase de recuperação.')}finally{raw?.fill(0)}
}
