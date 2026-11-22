// Hermetic synthetic composition of approved #88 or fixed #101 frontend with the same backend candidate. No network/API.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,cpSync,symlinkSync,mkdirSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ROOT,matrix,verifyDependencies} from './build.mjs';
import {verifyScope} from './integrity.mjs';
verifyScope();verifyDependencies();
const RELEASE_101='4f088f5a6bdd256bef20ef2ad9ac1f4e60d8b0df';
const frontend=process.env.P1_85_FRONTEND_HEAD||matrix.frontend88;
if(![matrix.frontend88,RELEASE_101].includes(frontend))throw Error('Unapproved frontend head');
const tree=mkdtempSync(path.join(tmpdir(),'salta-backend-compose-'));
const logs=path.resolve(process.argv[2]||path.join(ROOT,'assessments-service/dist/test-evidence'));mkdirSync(logs,{recursive:true});
try{
 const archive=execFileSync('git',['archive',frontend],{cwd:ROOT,maxBuffer:100*1024*1024});
 execFileSync('tar',['-xf','-','-C',tree],{input:archive});
 cpSync(path.join(ROOT,'assessments-service'),path.join(tree,'assessments-service'),{recursive:true,filter:p=>!p.split(path.sep).includes('dist')});
 symlinkSync(path.join(ROOT,'assessments-lab/node_modules'),path.join(tree,'assessments-lab/node_modules'),'dir');
 const run=(name,args)=>{const r=spawnSync(process.execPath,args,{cwd:tree,encoding:'utf8',maxBuffer:30*1024*1024,env:{...process.env,P1_85_GIT_ROOT:ROOT,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});writeFileSync(path.join(logs,name+'.log'),(r.stdout||'')+(r.stderr||''));if(r.status!==0){process.stdout.write((r.stdout||'')+(r.stderr||''));throw Error('Synthetic composition failed: '+name)}console.log(name+': '+r.stdout.split('\n').filter(x=>/^[ℹ#] (?:tests|pass|fail) /.test(x)).join(' | '));};
 const dirs=['corretor/v2/tests','plataforma/tests','stats-worker/tests','assessments-lab/tests','assessments-service/tests'];
 const cases=dirs.flatMap(d=>readdirSync(path.join(tree,d)).filter(n=>n.endsWith('.test.mjs')&&!(d==='assessments-service/tests'&&n==='build.test.mjs')).map(n=>d+'/'+n));
 run('regressions',['--test',...cases]);
 run('real-integrations',['--test','assessments-service/tests/d1-auth.integration.mjs','assessments-service/tests/gateway.integration.mjs','assessments-service/tests/frontend88.integration.mjs']);
 run('legacy-build',['assessments-lab/build.mjs']);run('legacy-http',['--test','assessments-lab/tests/d1-http.integration.mjs']);
 writeFileSync(path.join(logs,'composition.json'),JSON.stringify({frontend,approvedFrontend88:matrix.frontend88,release101:frontend===RELEASE_101,backendRuntime:matrix.contract,backendSourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT}).toString().trim(),syntheticOnly:true,temporaryD1Only:true,productionOperations:0},null,2)+'\n');
}finally{rmSync(tree,{recursive:true,force:true})}
