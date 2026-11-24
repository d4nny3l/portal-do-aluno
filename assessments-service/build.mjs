// Offline candidate build only. No credentials, resource configuration or deployment.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const matrix=JSON.parse(readFileSync(new URL('dependencies.json',import.meta.url)));
const require=createRequire(new URL('../assessments-lab/package.json',import.meta.url));
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function verifyDependencies(read=p=>readFileSync(path.join(ROOT,p))){
 if(matrix.inputs.length!==17||new Set(matrix.inputs.map(x=>x.path)).size!==17||matrix.inputs.filter(x=>x.comparison==='identical').length!==14)throw Error('Dependency matrix cardinality');
 for(const row of matrix.inputs){const b=read(row.path),blob=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
  if(blob!==row.candidateBlob||sha256(b)!==row.sha256)throw Error('Unapproved runtime input: '+row.path);
  if(row.comparison==='identical'&&row.mainBlob!==row.candidateBlob)throw Error('Main identity mismatch');
 }
 return matrix;
}
export async function buildBackend(directory){
 const {build}=require('esbuild');
 verifyDependencies();
 const result=await build({absWorkingDir:ROOT,entryPoints:[path.join(ROOT,'assessments-service/worker.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,metafile:true});
 const actual=Object.keys(result.metafile.inputs).map(p=>path.relative(ROOT,path.resolve(ROOT,p.split('?')[0])).split(path.sep).join('/')).sort();
 if(JSON.stringify(actual)!==JSON.stringify(matrix.inputs.map(x=>x.path).sort()))throw Error('Unexpected backend dependency graph');
 const code=result.outputFiles[0].text;
 if(sha256(code)!==matrix.expectedBundleSha256)throw Error('Bundle differs from audited contract');
 let sourceHead=null;try{sourceHead=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,stdio:['ignore','pipe','pipe']}).toString().trim()}catch{}
 const manifest={schemaVersion:'salta-minimal-backend-build-v1',status:sourceHead?'candidate-not-published':'synthetic-composition-not-published',sourceHead,runtimeSource:matrix.backendSource,frontendReference:matrix.main,artifactSha256:sha256(code),inputs:matrix.inputs.map(x=>({path:x.path,gitBlob:x.candidateBlob,sha256:x.sha256})),defaultFlag:'disabled-unless-explicitly-configured',deploymentPerformed:false,secretsIncluded:false};
 mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'assessments-private.mjs'),code);writeFileSync(path.join(directory,'artifacts.json'),JSON.stringify(manifest,null,2)+'\n');
 return {code,manifest};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const b=await buildBackend(path.resolve(process.argv[2]||new URL('dist/',import.meta.url).pathname));console.log(JSON.stringify(b.manifest,null,2))}
