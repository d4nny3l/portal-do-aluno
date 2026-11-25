import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {legacyOpticalSource,SCOPED_OPTICS} from '../validation/legacy-optical-source.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const base='195585572bdcefee809981aada4ee7614b7e023f';
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:30*1024*1024});
test('frozen laboratory, optical engines, private library and all production services remain byte-exact',()=>{
 const paths=['laboratorio/salta-omr-scan-safe-02','corretor/v2/omr','assessments-service',
  'stats-worker','auth-worker',
  'plataforma/avaliacoes-biblioteca.mjs','plataforma/avaliacoes-biblioteca.css'];
 const files=git('ls-tree','-r','--name-only','-z',base,'--',...paths).toString().split('\0').filter(p=>p&&p!=='assessments-service/tests/embedded-browser.mjs');
 assert.ok(files.length>80);
 for(const file of files){
  const current=readFileSync(new URL(file,new URL('../../../../',import.meta.url)));
  assert.deepEqual(SCOPED_OPTICS.includes(file)?Buffer.from(legacyOpticalSource(file,current.toString('utf8'))):current,git('show',base+':'+file),file);
 }
 const dossier='docs/SALTA_SCAN_SAFE_V2_DOSSIE_INTEGRACAO_20261125.md';
 assert.deepEqual(readFileSync(new URL(dossier,new URL('../../../../',import.meta.url))),git('show','7309f448a48d5e522232080b613b157d3caa1503:'+dossier));
});
test('official grade rules remain byte-exact; new CSS only appends camera presentation',()=>{
 const file='plataforma/corretor-v2.html',before=git('show',base+':'+file).toString(),after=readFileSync(new URL(file,new URL('../../../../',import.meta.url)),'utf8');
 for(const selector of ['#corrigir #cameraGrade{','#corrigir .camera-grade-title{','#corrigir .camera-grade-title svg{','#corrigir #cameraGradeValue{','#corrigir .camera-grade-accent{']){
  const rule=s=>s.slice(s.indexOf(selector),s.indexOf('}',s.indexOf(selector))+1);
  assert.equal(rule(after),rule(before),selector);
 }
 const css='plataforma/corretor-v2.css';assert.ok(readFileSync(new URL(css,new URL('../../../../',import.meta.url)),'utf8').startsWith(git('show',base+':'+css).toString()));
});
