// Explicit resource identity; generates files only. No network or deployment.
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const CUSTODY_WORKER='salta-assessments-custody';
export const PRIVATE_WORKER='salta-assessments-private-api';
export const DATABASE_ID='66fbb041-a76a-4777-b54e-641299affe30';
export const ACCOUNT_ID='e9a635c670c3569507b539397be60a77';
export function custodyConfig(bundle){return {name:CUSTODY_WORKER,account_id:ACCOUNT_ID,main:path.resolve(bundle),compatibility_date:'2026-10-01',workers_dev:false,preview_urls:false,routes:[],observability:{enabled:false},vars:{CUSTODY_DATABASE_ID:DATABASE_ID,CUSTODY_CUSTODIAN:'SALTA-owner'},d1_databases:[{binding:'PRIMARY_ASSESSMENTS_DB',database_name:'salta-assessments-private-db',database_id:DATABASE_ID}],durable_objects:{bindings:[{name:'JOURNAL',class_name:'CustodyLedger'}]},migrations:[{tag:'custody-v1',new_sqlite_classes:['CustodyLedger']}]}}
export function operatorConfig(){return {name:'salta-custody-operator-local-only',account_id:ACCOUNT_ID,compatibility_date:'2026-10-01',workers_dev:false,preview_urls:false,routes:[],services:[{binding:'OPERATOR',service:CUSTODY_WORKER,entrypoint:'CustodyOperator',remote:true}]}}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dir=path.resolve(process.argv[2]||'assessments-service/dist/custody');mkdirSync(dir,{recursive:true});
 writeFileSync(path.join(dir,'custody-worker.json'),JSON.stringify(custodyConfig(path.join(dir,'custody.mjs')),null,2)+'\n');
 writeFileSync(path.join(dir,'operator-local.json'),JSON.stringify(operatorConfig(),null,2)+'\n');
 console.log('Private custody and local-only operator configurations generated; no resource changed.');
}
