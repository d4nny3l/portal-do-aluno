// Owner workstation only. Uses existing Wrangler OAuth, never creates an HTTP
// listener or deploys an operator Worker. Do not bind CustodyOperator to the app.
import {createRequire} from 'node:module';
import {writeFileSync,openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectCustodyExport} from './export.mjs';
export async function runOperator(binding,action){
 const allowed=['initialize','status','close','reconcile','checkpoint','open','export'];
 if(!allowed.includes(action))throw Error('Unknown operator action');
 const invoke=async payload=>{const r=await binding.fetch('https://custody-operator/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const b=await r.json();if(!r.ok||b.ok!==true)throw Error('Custody operator: '+(b.code||r.status));return b};
 return action==='export'?collectCustodyExport(invoke):invoke({action});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [config,action,destination]=process.argv.slice(2);
 if(!config||!action||action==='export'&&!destination)throw Error('Usage: operator.mjs operator-local.json action [private-export.json]');
 // Wrangler is an installed operator dependency, not included in either bundle.
 const require=createRequire(new URL('../../assessments-lab/package.json',import.meta.url));
 const {getPlatformProxy}=require(process.env.SALTA_WRANGLER_MODULE||'wrangler');
 const proxy=await getPlatformProxy({configPath:path.resolve(config),envFiles:[],persist:false,remoteBindings:true});
 try{
  const result=await runOperator(proxy.env.OPERATOR,action);
  if(action==='export'){
   const fd=openSync(path.resolve(destination),'wx',0o600);try{writeFileSync(fd,JSON.stringify(result,null,2)+'\n')}finally{closeSync(fd)}
   console.log(JSON.stringify({ok:true,action,events:result.events.length,checkpoint:result.checkpoint}));
  }else if(action==='status')console.log(JSON.stringify({ok:true,mode:result.mode,controller:result.controller,sequence:result.seq,pending:Boolean(result.pending),fenceCount:result.fenceCount,custodian:result.custodian}));
  else console.log(JSON.stringify(result));
 }finally{await proxy.dispose()}
}
