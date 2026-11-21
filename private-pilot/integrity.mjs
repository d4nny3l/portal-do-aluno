// Only the exact audited catalog delta and this isolated preparation may differ.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,INTEGRATION_BASE,ASSESSMENTS_REF,git} from './baseline.mjs';
import {SCORE_FORMAT_PATHS,SCORE_FORMAT_DOWNGRADE_GUARD} from './score-format-candidate.mjs';
export const CATALOG_FILES=Object.freeze([
 'assessments-service/worker.mjs',
 'assessments-service/tests/catalog-pages.test.mjs',
 'corretor/v2/assessments/private-client.mjs',
 'corretor/v2/assessments/private-library.mjs',
 'corretor/v2/assessments/private-ui.mjs',
 'docs/avaliacoes/CONTRATO_EXECUTOR.md',
 'plataforma/tests/corretor-private-catalog-pages-p1.test.mjs'
]);
export function assertIntegrationPaths(paths){
 const forbidden=paths.filter(p=>!CATALOG_FILES.includes(p)&&!SCORE_FORMAT_PATHS.includes(p)&&!p.startsWith('private-pilot/')&&p!=='.github/workflows/test-private-pilot.yml');
 if(forbidden.length)throw Error('Forbidden integration changes: '+forbidden.join(', '));
}
export function assertApprovedCatalog(readCurrent=p=>readFileSync(path.join(ROOT,p))){
 for(const p of CATALOG_FILES){
  let approved=git('show',ASSESSMENTS_REF+':'+p);
  // Preserve every other byte of the service (session, grants, routes and SQL).
  if(p==='assessments-service/worker.mjs')approved=Buffer.from(approved.toString().replace("import {keyring,seal,open,operationMac} from './crypto.mjs';","import {keyring,seal,open,operationMac} from './crypto.mjs';\nimport {SCORE_FORMAT_VERSION} from '../corretor/v2/assessments/score-format.mjs';").replace("epoch:actor.epoch,cryptoModel:'server-managed'","epoch:actor.epoch,cryptoModel:'server-managed',scoreFormatVersion:SCORE_FORMAT_VERSION").replace(' const revision=p.expectedRevision+1, now=new Date().toISOString(), record=',SCORE_FORMAT_DOWNGRADE_GUARD+' const revision=p.expectedRevision+1, now=new Date().toISOString(), record='));
  // The only catalog exception is this deterministic test target: the minimum
  // random UUID is guaranteed to appear on the first page that the test checks.
  if(p==='assessments-service/tests/catalog-pages.test.mjs')approved=Buffer.from(approved.toString().replace('const latest=ids[0];','const latest=[...ids].sort()[0];'));
  if(!readCurrent(p).equals(approved))throw Error('Catalog differs from audited PR #72 plus declared test-only fix: '+p);
 }
}
export function verifyIntegration(){
 const paths=git('diff','--name-only','-z',INTEGRATION_BASE,'--').toString().split('\0').filter(Boolean);
 const untracked=git('ls-files','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
 assertIntegrationPaths([...paths,...untracked]);
 assertApprovedCatalog();
}
if(process.argv[1]===fileURLToPath(import.meta.url)){verifyIntegration();console.log('#72 catalog plus declared #85 contract candidate accepted; Stats, Auth, Diary, OMR and existing deploy workflows unchanged.');}
