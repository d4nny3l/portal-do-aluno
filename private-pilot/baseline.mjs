import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const STATS_REF='f4dce82716faa06720068f3228a6f890fd0f928f';
export const STATS_BLOB='3cb6e181d000f86a664edeefe9fad3aae0df51fe';
export const STATS_SHA256='6e1c0c0ad36d2c136ee0a6b8065ed2b611fea23828a4f3a0b8e8aead731a3fba';
export const INTEGRATION_BASE='d453e1da14147990a8ba837a39f38975bbdff627';
export const GATEWAY_REF='06e876b6674b11a46caa177d45f9986986bcf06f';
export const ASSESSMENTS_REF='466a6780b29fe462cbf645ca6262b265a4c0c135';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const git=(...args)=>execFileSync('git',args,{cwd:ROOT,stdio:['ignore','pipe','pipe']});
export function productionSource(){
 const source=git('show',STATS_REF+':stats-worker/worker.js');
 if(sha256(source)!==STATS_SHA256||git('rev-parse',STATS_REF+':stats-worker/worker.js').toString().trim()!==STATS_BLOB)throw Error('Production Stats baseline mismatch; do not build');
 return source;
}
