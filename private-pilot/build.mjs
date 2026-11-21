// Offline artifact build. No Wrangler command, network, credentials or deployment.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,STATS_REF,STATS_BLOB,STATS_SHA256,ASSESSMENTS_REF,INTEGRATION_BASE,GATEWAY_REF,productionSource,git,sha256} from './baseline.mjs';
import {verifyIntegration} from './integrity.mjs';
import {CONTRACT_BASE,SCORE_FORMAT_RUNTIME_FILES} from './score-format-candidate.mjs';
const require=createRequire(new URL('../assessments-lab/package.json',import.meta.url));
const {build}=require('esbuild');
export async function buildPilot(directory){
 verifyIntegration();
 const source=productionSource();
 const gateway=await build({absWorkingDir:ROOT,entryPoints:[path.join(ROOT,'private-pilot/stats-entry.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,metafile:true,plugins:[{name:'sealed-production-stats',setup(b){
  b.onResolve({filter:/^salta:production-stats$/},()=>({path:'worker.js',namespace:'sealed-stats'}));
  b.onLoad({filter:/.*/,namespace:'sealed-stats'},()=>({contents:source.toString(),loader:'js'}));
 }}]});
 const gatewayCode=gateway.outputFiles[0].text;
 if(gatewayCode.includes('d04-v1')||gatewayCode.includes('salta_diario_attendance_commits'))throw Error('Unapproved attendance contract in gateway artifact');
 const backend=await build({absWorkingDir:ROOT,entryPoints:[path.join(ROOT,'assessments-service/worker.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,metafile:true});
 const backendInputs=[];
 for(const name of Object.keys(backend.metafile.inputs)){
  const absolute=path.resolve(ROOT,name.split('?')[0]), relative=path.relative(ROOT,absolute).split(path.sep).join('/');
  if(relative.startsWith('../'))throw Error('Backend dependency outside approved repository');
  const current=await readFile(absolute),candidate=SCORE_FORMAT_RUNTIME_FILES.includes(relative);
  if(!candidate){const approved=git('show',ASSESSMENTS_REF+':'+relative);
   if(!current.equals(approved))throw Error('Backend dependency differs from audited PR #72: '+relative);}
  backendInputs.push({path:relative,sha256:sha256(current),...(candidate?{contractCandidate:85}:{})});
 }
 await mkdir(directory,{recursive:true});
 await writeFile(path.join(directory,'stats-gateway.mjs'),gatewayCode);
 await writeFile(path.join(directory,'assessments-private.mjs'),backend.outputFiles[0].text);
 const manifest={schema:'salta-private-pilot-artifacts-v1',sourceHead:git('rev-parse','HEAD').toString().trim(),integration:{base:INTEGRATION_BASE,gatewayRef:GATEWAY_REF,catalogRef:ASSESSMENTS_REF},stats:{ref:STATS_REF,blob:STATS_BLOB,sourceSha256:STATS_SHA256,artifactSha256:sha256(gatewayCode)},assessments:{ref:ASSESSMENTS_REF,contractCandidate:{issue:85,base:CONTRACT_BASE,audited:false},artifactSha256:sha256(backend.outputFiles[0].text),inputs:backendInputs},flagsDefault:'disabled',deployed:false};
 await writeFile(path.join(directory,'artifacts.json'),JSON.stringify(manifest,null,2)+'\n');
 return {manifest,gatewayCode,backendCode:backend.outputFiles[0].text};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const directory=path.resolve(process.argv[2]||path.join(ROOT,'private-pilot/dist'));
 const {manifest}=await buildPilot(directory);console.log(JSON.stringify(manifest,null,2));
}
