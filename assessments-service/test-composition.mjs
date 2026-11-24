// Current candidate only. Synthetic Auth/D1; no historical frontend substitution or remote API.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {ROOT,matrix,verifyDependencies} from './build.mjs';
import {verifyScope} from './integrity.mjs';
verifyScope();verifyDependencies();
const tree=ROOT;
const logs=path.resolve(process.argv[2]||path.join(ROOT,'assessments-service/dist/test-evidence'));mkdirSync(logs,{recursive:true});
{
 const run=(name,args)=>{const r=spawnSync(process.execPath,args,{cwd:tree,encoding:'utf8',maxBuffer:30*1024*1024,env:{...process.env,P1_85_GIT_ROOT:ROOT,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});writeFileSync(path.join(logs,name+'.log'),(r.stdout||'')+(r.stderr||''));if(r.status!==0){process.stdout.write((r.stdout||'')+(r.stderr||''));throw Error('Synthetic composition failed: '+name)}console.log(name+': '+r.stdout.split('\n').filter(x=>/^[ℹ#] (?:tests|pass|fail) /.test(x)).join(' | '));};
 const dirs=['corretor/v2/tests','plataforma/tests','stats-worker/tests','assessments-lab/tests','assessments-service/tests'];
 const cases=dirs.flatMap(d=>readdirSync(path.join(tree,d)).filter(n=>n.endsWith('.test.mjs')&&!(d==='assessments-service/tests'&&n==='build.test.mjs')).map(n=>d+'/'+n));
 run('regressions',['--test',...cases]);
 run('real-integrations',['--test','assessments-service/tests/d1-auth.integration.mjs','assessments-service/tests/gateway.integration.mjs','assessments-service/tests/frontend88.integration.mjs','assessments-service/tests/embedded-library.integration.mjs']);
 run('legacy-build',['assessments-lab/build.mjs']);run('legacy-http',['--test','assessments-lab/tests/d1-http.integration.mjs']);
 writeFileSync(path.join(logs,'composition.json'),JSON.stringify({frontendBase:matrix.main,backendSource:matrix.backendSource,backendSourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT}).toString().trim(),syntheticOnly:true,temporaryD1Only:true,productionOperations:0},null,2)+'\n');
}
