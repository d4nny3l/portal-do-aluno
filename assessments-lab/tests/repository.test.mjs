import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,ALICE,CLASS_A} from './helpers.mjs';
import {AssessmentRepository} from '../../corretor/v2/assessments/repository.mjs';
import {makeBundle} from '../../corretor/v2/assessments/domain.mjs';
import {createTemplate} from '../../corretor/v2/omr/template.mjs';
import {createCardManifest} from '../../corretor/v2/omr/render.mjs';
test('lost response can be retried without duplicate revision; another instance reopens with its non-exportable stored key',async t=>{
 const h=harness();t.after(()=>h.db.close());const cookie=await h.login('teacher-one'),keys=new Map();let loseResponse=true;
 const keyStore={getKey:async id=>keys.get(id)||null,saveScopeKey:async(id,key)=>keys.set(id,key)};
 const fetchApi=async(path,options)=>{
  const response=await h.request(path,{method:options.method,cookie,...(options.body?{data:JSON.parse(options.body)}:{})});
  if(options.method==='PUT'&&loseResponse){loseResponse=false;throw Error('network dropped after commit')}
  return response;
 };
 const repo=await new AssessmentRepository({fetchApi,keyStore}).initialize();assert.equal(keys.get(ALICE).extractable,false);
 const t1=createTemplate([{type:'A-E',count:20}]);
 const bundle=makeBundle({id:crypto.randomUUID(),revision:1,ownerId:ALICE,classId:CLASS_A,periodId:'p2026-4',title:'Matemática sintética',subject:'Matemática',kind:'Prova',maxScore:10,manifest:createCardManifest(t1),editor:{},keyText:Array.from({length:20},(_,i)=>`${i+1} C`).join('\n')});
 await assert.rejects(repo.save(bundle),/Nenhum salvamento foi confirmado/);
 assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_revisions').get().n,1);
 const recovered=await repo.save(bundle);assert.equal(recovered.revision,1);
 assert.equal(h.db.db.prepare('SELECT COUNT(*) AS n FROM assessment_revisions').get().n,1);
 const reopened=await new AssessmentRepository({fetchApi,keyStore}).initialize();assert.equal((await reopened.load(bundle.id)).answerKey.questions[0].correct,'C');
 await assert.rejects(new AssessmentRepository({fetchApi,keyStore:{getKey:async()=>null}}).initialize(),/Chave local ausente/);
});
