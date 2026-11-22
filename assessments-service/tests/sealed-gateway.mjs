// Test-only historical gateway fixture. Never an input of the backend artifact.
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {ROOT,buildBackend,sha256} from '../build.mjs';
const require=createRequire(new URL('../../assessments-lab/package.json',import.meta.url)),{build}=require('esbuild');
export const PORTAL_ORIGIN='https://d4nny3l.github.io';
export const LIMITERS=['PRIVATE_IP_LIMITER','PRIVATE_ACCOUNT_LIMITER','PRIVATE_WRITE_LIMITER','PRIVATE_PRINT_LIMITER'];
const git=(...a)=>execFileSync('git',a,{cwd:process.env.P1_85_GIT_ROOT||ROOT,stdio:['ignore','pipe','pipe']});
export async function buildTestPilot(directory){
 const ref='7080d2de0b5a01bbe417b71732221a869e7a4d42',stats=git('show','f4dce82716faa06720068f3228a6f890fd0f928f:stats-worker/worker.js');
 if(sha256(stats)!=='6e1c0c0ad36d2c136ee0a6b8065ed2b611fea23828a4f3a0b8e8aead731a3fba')throw Error('Stats fixture provenance');
 const files=['private-pilot/stats-entry.mjs','private-pilot/gateway.mjs'];
 const sources=new Map(files.map(p=>[path.join(ROOT,p),git('show',ref+':'+p).toString()]));
 const gateway=await build({absWorkingDir:ROOT,entryPoints:[path.join(ROOT,files[0])],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,plugins:[{name:'sealed-production-fixture',setup(b){
  b.onResolve({filter:/^salta:production-stats$/},()=>({path:'worker.js',namespace:'sealed-stats'}));
  b.onLoad({filter:/.*/,namespace:'sealed-stats'},()=>({contents:stats.toString(),loader:'js'}));
  b.onResolve({filter:/stats-entry\.mjs$|^\.\/gateway\.mjs$/},a=>({path:a.path.startsWith('.')?path.resolve(a.resolveDir,a.path):a.path}));
  b.onLoad({filter:/private-pilot\/.*\.mjs$/},a=>sources.has(a.path)?{contents:sources.get(a.path),loader:'js'}:undefined);
 }}]});
 const gatewayCode=gateway.outputFiles[0].text;
 if(sha256(gatewayCode)!=='2100592bf4f565388fe23f5ffc2e9675a8b25e4c9ff716eca795f10c0ec5dc74'||gatewayCode.includes('d04-v1'))throw Error('Gateway fixture changed');
 const backend=await buildBackend(directory);return {gatewayCode,backendCode:backend.code};
}
