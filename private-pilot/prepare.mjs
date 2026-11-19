// Generates CLOSED configurations from approved resource metadata. No provisioning,
// authentication, secret access, remote migration, flag activation or deployment.
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ROOT,STATS_REF,ASSESSMENTS_REF,git,sha256} from './baseline.mjs';
import {buildPilot} from './build.mjs';
const bannedDatabases=new Set(['e7538b0a-891e-408f-a668-75d60ca907e3','44259972-59ed-4ef7-8db8-4fc442e1b90c','fb74f058-06f8-40a5-8327-445bded453e3']);
export function validateMetadata(m){
 const keys=['workerName','databaseName','databaseId','limiterNamespaces','activeKeyVersion'];
 if(!m||Object.keys(m).sort().join()!==keys.sort().join())throw Error('Only approved resource metadata is accepted; do not supply credentials');
 if(!/^salta-assessments-private-[a-z0-9-]{1,32}$/.test(m.workerName)||!/^salta-assessments-private-[a-z0-9-]{1,32}$/.test(m.databaseName))throw Error('Exclusive assessment resource names required');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(m.databaseId)||bannedDatabases.has(m.databaseId))throw Error('Academic or legacy D1 reuse is forbidden');
 if(!Number.isSafeInteger(m.activeKeyVersion)||m.activeKeyVersion<1)throw Error('Approved active key version required');
 const names=['ip','account','write','print'];
 if(!m.limiterNamespaces||Object.keys(m.limiterNamespaces).sort().join()!==names.sort().join())throw Error('Four approved limiter namespaces required');
 const ids=Object.values(m.limiterNamespaces);
 if(ids.some(id=>typeof id!=='string'||!(/^[1-9][0-9]{0,8}$/.test(id))||['21061101','21061102'].includes(id))||new Set(ids).size!==4)throw Error('Limiter namespaces must be distinct and not reuse Auth');
 return m;
}
export async function preparePilot(metadata,directory){
 const m=validateMetadata(metadata), built=await buildPilot(directory);
 let config=git('show',STATS_REF+':stats-worker/wrangler.toml').toString();
 if(!config.includes('main = "worker.js"')||config.includes('[vars]')||config.includes('[[ratelimits]]'))throw Error('Production config changed; stop');
 config=config.replace('main = "worker.js"','main = "stats-gateway.mjs"');
 config+='\n# New private namespace only; legacy bindings and settings above are unchanged.\n[[services]]\nbinding = "PRIVATE_ASSESSMENTS"\nservice = "'+m.workerName+'"\n\n[vars]\nPRIVATE_GATEWAY_ENABLED = "false"\n';
 const rates=[['ip','PRIVATE_IP_LIMITER',300],['account','PRIVATE_ACCOUNT_LIMITER',120],['write','PRIVATE_WRITE_LIMITER',20],['print','PRIVATE_PRINT_LIMITER',15]];
 for(const [key,binding,amount]of rates)config+='\n[[ratelimits]]\nname = "'+binding+'"\nnamespace_id = "'+m.limiterNamespaces[key]+'"\nsimple = { limit = '+amount+', period = 60 }\n';
 const backend='name = "'+m.workerName+'"\nmain = "assessments-private.mjs"\ncompatibility_date = "2026-10-01"\nworkers_dev = false\npreview_urls = false\n\n[vars]\nENABLE_ASSESSMENTS = "false"\nPORTAL_ORIGIN = "https://d4nny3l.github.io"\nASSESSMENT_ACTIVE_KEY_VERSION = "'+m.activeKeyVersion+'"\n\n[[services]]\nbinding = "AUTH"\nservice = "salta-auth"\n\n[[d1_databases]]\nbinding = "ASSESSMENTS_DB"\ndatabase_name = "'+m.databaseName+'"\ndatabase_id = "'+m.databaseId+'"\nmigrations_dir = "migrations"\nremote = false\n';
 await writeFile(path.join(directory,'gateway.wrangler.toml'),config);
 await writeFile(path.join(directory,'backend.wrangler.toml'),backend);
 await mkdir(path.join(directory,'migrations'),{recursive:true});
 const migration=git('show',ASSESSMENTS_REF+':assessments-service/migrations/0001_private_library.sql');
 await writeFile(path.join(directory,'migrations/0001_private_library.sql'),migration);
 built.manifest.configurations={gatewaySha256:sha256(config),backendSha256:sha256(backend),migrationSha256:sha256(migration),resourceMetadata:m,createdRemotely:false,flagsEnabled:false};
 await writeFile(path.join(directory,'artifacts.json'),JSON.stringify(built.manifest,null,2)+'\n');
 return built;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [metadataFile,output]=process.argv.slice(2);
 if(!metadataFile||!output)throw Error('Usage: node private-pilot/prepare.mjs <approved-metadata.json> <output-directory>');
 const result=await preparePilot(JSON.parse(await readFile(metadataFile,'utf8')),path.resolve(output));
 console.log(JSON.stringify(result.manifest,null,2));
}
