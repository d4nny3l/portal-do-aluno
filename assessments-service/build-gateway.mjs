// Offline ONLY: library gateway + byte-pinned productive Stats, never main's D-04.
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ROOT,sha256} from './build.mjs';
const require=createRequire(new URL('../assessments-lab/package.json',import.meta.url));
export async function buildLifecycleGateway(directory){
 const stats=execFileSync('git',['show','f4dce82716faa06720068f3228a6f890fd0f928f:stats-worker/worker.js'],{cwd:ROOT});
 if(sha256(stats)!=='6e1c0c0ad36d2c136ee0a6b8065ed2b611fea23828a4f3a0b8e8aead731a3fba')throw Error('Productive Stats provenance mismatch');
 const {build}=require('esbuild');
 const result=await build({absWorkingDir:ROOT,stdin:{contents:"import legacy from 'salta:production-stats';import {createStatsGateway} from './assessments-service/gateway-lifecycle.mjs';export default createStatsGateway(legacy);",resolveDir:ROOT,sourcefile:'lifecycle-entry.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,plugins:[{name:'sealed-productive-stats',setup(b){b.onResolve({filter:/^salta:production-stats$/},()=>({path:'worker.js',namespace:'productive-stats'}));b.onLoad({filter:/.*/,namespace:'productive-stats'},()=>({contents:stats.toString(),loader:'js'}));}}]});
 const code=result.outputFiles[0].text;if(code.includes('d04-v1'))throw Error('D-04 must never enter gateway');
 mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'stats-lifecycle-candidate.mjs'),code);
 const manifest={sha256:sha256(code),statsSource:'f4dce82716faa06720068f3228a6f890fd0f928f',statsSha256:sha256(stats),deploymentPerformed:false,newFeatureDefault:'disabled'};
 writeFileSync(path.join(directory,'gateway-artifacts.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildLifecycleGateway(path.join(ROOT,'assessments-service/dist')),null,2));
