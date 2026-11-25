// Offline, exactly pinned independent custody artifact. Never publishes.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(new URL('../../assessments-lab/package.json',import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
export async function buildCustody(directory){
 const matrix=JSON.parse(readFileSync(new URL('sources.json',import.meta.url)));
 for(const row of matrix.inputs)if(sha(readFileSync(path.join(root,row.path)))!==row.sha256)throw Error('Unapproved custody source: '+row.path);
 const b=await require('esbuild').build({absWorkingDir:root,entryPoints:['assessments-service/custody/worker.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,metafile:true,external:['cloudflare:workers']});
 if(JSON.stringify(Object.keys(b.metafile.inputs).sort())!==JSON.stringify(matrix.inputs.map(r=>r.path).sort()))throw Error('Custody graph changed');
 const code=b.outputFiles[0].text;if(sha(code)!==matrix.artifactSha256)throw Error('Unapproved custody artifact');
 mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'custody.mjs'),code);writeFileSync(path.join(directory,'custody-artifacts.json'),JSON.stringify(matrix,null,2)+'\n');return {code,manifest:matrix};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify((await buildCustody(path.resolve(process.argv[2]||'assessments-service/dist/custody'))).manifest,null,2));
