// Separate SQLite journal emulates the independent DO, never a production bypass.
import {DatabaseSync} from 'node:sqlite';
import {Ledger,CustodyFailure} from '../custody/ledger.mjs';
export function journalStorage(sqlite=new DatabaseSync(':memory:')){
 return {sqlite,sql:{exec(sql,...args){const stmt=sqlite.prepare(sql);if(stmt.columns().length)return {toArray:()=>stmt.all(...args)};stmt.run(...args);return {toArray:()=>[]}}},transactionSync(fn){sqlite.exec('BEGIN');try{const x=fn();sqlite.exec('COMMIT');return x}catch(e){sqlite.exec('ROLLBACK');throw e}}};
}
export async function custodyFixture(db,{storage=journalStorage(),initialize=true,now}={}){
 const ledger=new Ledger(storage,db,{databaseId:'00000000-0000-4000-8000-000000000001',custodian:'synthetic-custodian',now});
 let tail=Promise.resolve();const state={failBefore:null,loseAfter:null};
 const call=(lane,p)=>{const job=tail.then(async()=>{if(state.failBefore===p.action)throw Error('synthetic independent storage unavailable');const result=await ledger.handle(lane,p);if(state.loseAfter===p.action){state.loseAfter=null;throw Error('synthetic external ACK lost')}return result});tail=job.catch(()=>{});return job};
 const writer={async fetch(request){try{return Response.json(await call('writer',await request.json()))}catch(e){return Response.json({ok:false,code:e instanceof CustodyFailure?e.code:'custody_unavailable'},{status:e instanceof CustodyFailure?e.status:503})}}};
 if(initialize){await call('operator',{action:'initialize'});await call('operator',{action:'open'})}
 return {ledger,storage,state,writer,operator:p=>call('operator',p),close:()=>storage.sqlite.close()};
}
