// Remote homologation trusts the Access runtime, never client-supplied identity headers.
export const protectedMode=env=>env.SALTA_ASSESSMENTS_MODE==='protected-synthetic';
export async function accessPrincipal(env,ctx,db){
 const denied=()=>{throw Object.assign(new Error('Sessão protegida ou autorização indisponível.'),{accessStatus:403})};
 if(!env.ACCESS_AUD||ctx?.access?.aud!==env.ACCESS_AUD)denied();
 const identity=await ctx.access.getIdentity();
 if(typeof identity?.email!=='string'||!identity.email.includes('@'))denied();
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity.email.trim().toLowerCase()));
 const subject='access:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const actor=await db.prepare(`SELECT p.id,p.label,c.epoch,c.expires_at FROM assessment_principals p JOIN assessment_access_control c ON c.principal_id=p.id WHERE p.auth_subject=? AND c.enabled=1 AND c.expires_at>?`).bind(subject,Date.now()).first();
 if(!actor)denied();
 return actor;
}
export function validateVault(value){
 const keys=['schema','kdf','iterations','salt','nonce','ciphertext'];
 if(!value||Object.keys(value).sort().join(',')!==keys.sort().join(',')||value.schema!=='salta-key-vault-v1'||value.kdf!=='PBKDF2-SHA256'||value.iterations!==600000||!/^[-_A-Za-z0-9]{43}$/.test(value.salt)||!/^[-_A-Za-z0-9]{16}$/.test(value.nonce)||!/^[-_A-Za-z0-9]{64}$/.test(value.ciphertext))throw Object.assign(new Error('Cofre cifrado inválido.'),{accessStatus:400});
 return value;
}
