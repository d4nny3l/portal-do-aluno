// UX-79C-QA-CI-03 — somente no Chromium local do GitHub Actions, injetado ANTES da SALTA real.
// Isola todos os endpoints remotos, sem emitir fetch externo. Nunca usar em produção.
(() => {
  'use strict';
  const ORIGIN = 'https://salta-stats.dannyel-moises.workers.dev';
  const STORAGE_KEY = '__SALTA_QA_SYNTHETIC_FIXTURE_ONLY_V1';
  const COPY = v => JSON.parse(JSON.stringify(v));
  const initial = {records:[],grants:[{
    institutionId:'inst-qa-2026',classId:'turma-qa-a',periodId:'2026-11-qa'
  }],principalId:'professor-ficticio-qa',epoch:1,scoreFormatVersion:'salta-score-format-v1',
    fault:null,sessionEnabled:true};
  let loaded;try{loaded=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null')}catch{}
  const fixture=loaded&&typeof loaded==='object'?{...initial,...loaded}:initial;
  const records=new Map((fixture.records||[]).map(x=>[x.id,x]));
  const selections=new Map();
  const receipts=new Map();
  const events=[];
  const counters={mocked:0,unknown:0};
  const idFor=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const scopeKeys=['institutionId','classId','periodId'];
  const sameScope=(a,b)=>scopeKeys.every(k=>a?.[k]===b?.[k]);
  const persist=()=>sessionStorage.setItem(STORAGE_KEY,JSON.stringify({
    records:[...records.values()],grants:fixture.grants,principalId:fixture.principalId,
    epoch:fixture.epoch,scoreFormatVersion:fixture.scoreFormatVersion,
    fault:fixture.fault,sessionEnabled:fixture.sessionEnabled
  }));
  const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
  const api={
    events,records,selections,counters,fixture,
    save:persist,
    setFault(status,route='/assessments/v1/assessments'){
      fixture.fault={status,route,remaining:1};persist();
    },
    clearFault(){fixture.fault=null;persist()},
    seedClones(n){
      if(!Number.isInteger(n)||n<0||n>201)throw Error('Contagem sintética inválida');
      const first=[...records.values()].find(r=>r.status==='issued')||[...records.values()][0];
      if(!first)throw Error('Crie e salve ao menos uma avaliação sintética pela UI real primeiro.');
      records.clear();
      for(let i=1;i<=n;i++){
        const r=COPY(first);r.id=idFor(i);r.revision=1;r.status='issued';r.archived=false;
        r.definition.title='Avaliação sintética '+String(i).padStart(3,'0');
        records.set(r.id,r);
      }
      persist();
    },
    clear(){records.clear();selections.clear();receipts.clear();fixture.fault=null;persist()},
    addGrantB(){fixture.grants=[initial.grants[0],{
      institutionId:'inst-qa-2026',classId:'turma-qa-b',periodId:'2026-11-qa'
    }];persist();},
    setPrincipal(principalId,epoch){fixture.principalId=principalId;fixture.epoch=epoch;persist();},
    getSummary(){return {records:records.size,selectionCount:selections.size,
      mockedRequests:counters.mocked,unknownRequests:counters.unknown,
      events:events.slice(-100),fixture:{principalId:fixture.principalId,epoch:fixture.epoch,
        grants:fixture.grants,scoreFormatVersion:fixture.scoreFormatVersion}};}
  };
  Object.defineProperty(window,'__SALTA_QA__',{value:api,configurable:false});
  window.confirm=()=>true; // Apenas lote/rascunho sintético. Nunca em origem real.
  // Teste local de negativa da câmera — sem fluxo físico / sem pessoas.
  try{
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
      enumerateDevices:async()=>[],getUserMedia:async()=>{
        const error=new Error('Permissão negada na simulação local');error.name='NotAllowedError';throw error;
      }
    }});
  }catch{}
  // Browser-level context routing also denies external egress. These explicit
  // constructors close non-fetch channels before application initialization.
  for (const protocol of ['WebSocket','EventSource']) {
    try {
      Object.defineProperty(window, protocol, {configurable:true,value:class {
        constructor() { counters.unknown++; throw new Error('QA blocked '+protocol+' external channel'); }
      }});
    } catch { counters.unknown++; }
  }
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const raw=typeof input==='string'?input:input?.url;
    const url=new URL(raw,location.href),method=String(init?.method||'GET').toUpperCase();
    // A SALTA existente inicializa também seu adaptador de homologação legado
    // no localhost. Neutralize-o com contrato sintético vazio; não há API real.
    if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
      counters.mocked++;events.push({method,path:url.pathname,query:url.search,status:'synthetic_local_legacy'});
      if(url.pathname==='/api/session'&&method==='GET')
        return json({mode:'synthetic-only',principalId:'professor-ficticio-qa',epoch:1});
      if(url.pathname==='/api/classes'&&method==='GET')
        return json({classes:[{classId:'turma-qa-a',periodId:'2026-11-qa',label:'Turma QA A'}]});
      if(url.pathname==='/api/assessments'&&method==='GET')return json({assessments:[]});
      counters.unknown++;return json({error:'qa_legacy_api_not_stubbed'},404);
    }
    if(url.origin!==ORIGIN){
      if(url.origin===location.origin)return nativeFetch(input,init);
      counters.unknown++;
      throw new TypeError('QA BLOQUEOU FETCH EXTERNO: '+url.origin);
    }
    counters.mocked++;events.push({method,path:url.pathname,query:url.search,status:'synthetic'});
    if(!fixture.sessionEnabled)return json({authenticated:false},401);
    if(url.pathname==='/auth/session')return json({authenticated:true,user:{id:'professor-ficticio-qa'},role:'professor'});
    const prefix='/assessments/v1';
    if(!url.pathname.startsWith(prefix+'/'))return json({code:'blocked_out_of_contract'},404);
    const route=url.pathname.slice(prefix.length),fault=fixture.fault;
    if(fault&&fault.remaining>0&&url.pathname===fault.route){
      fault.remaining--;persist();events.push({kind:'fault',method,path:url.pathname,status:fault.status});return json({code:'qa_injected_failure'},fault.status);
    }
    if(route==='/session'&&method==='GET')return json({authenticated:true,principalId:fixture.principalId,
      epoch:fixture.epoch,scoreFormatVersion:fixture.scoreFormatVersion});
    if(route==='/grants'&&method==='GET')return json({grants:COPY(fixture.grants)});
    if(route==='/assessments'&&method==='GET'){
      const scope={institutionId:url.searchParams.get('institutionId'),classId:url.searchParams.get('classId'),periodId:url.searchParams.get('periodId')};
      const list=[...records.values()].filter(r=>sameScope(r,scope)&&!r.archived)
        .sort((a,b)=>a.id.localeCompare(b.id));
      const after=url.searchParams.get('after');
      const start=after?list.findIndex(r=>r.id===after)+1:0;
      if(after&&start===0)return json({code:'invalid_cursor'},400);
      const page=list.slice(start,start+10),nextCursor=start+10<list.length?page[page.length-1].id:null;
      return json({assessments:page.map(r=>({id:r.id,title:r.definition.title,
        revision:r.revision,state:r.status,institutionId:r.institutionId,
        classId:r.classId,periodId:r.periodId})),nextCursor});
    }
    const readRecord=route.match(/^\/assessments\/([\da-f-]+)(?:\/revisions\/(\d+))?$/i);
    if(readRecord&&method==='GET'){
      const rec=records.get(readRecord[1]);
      if(!rec||readRecord[2]&&rec.revision!==Number(readRecord[2]))return json({code:'not_found'},404);
      return json({record:COPY(rec)});
    }
    const history=route.match(/^\/assessments\/([\da-f-]+)\/revisions$/i);
    if(history&&method==='GET'){
      const rec=records.get(history[1]);if(!rec)return json({code:'not_found'},404);
      return json({revisions:[{revision:rec.revision,status:rec.status,manifestHash:rec.manifestHash}]});
    }
    const put=route.match(/^\/assessments\/([\da-f-]+)$/i);
    if(put&&method==='PUT'){
      const payload=JSON.parse(init.body),id=put[1],previous=records.get(id);
      if(receipts.has(payload.requestId))return json(COPY(receipts.get(payload.requestId)));
      if((previous?.revision??0)!==payload.expectedRevision)return json({code:'conflict'},409);
      const definition=COPY(payload.definition),revision=(previous?.revision??0)+1;
      const record={id,revision,definition,manifestHash:definition.manifest.contentHash,
        scoreScale:10000,totalUnits:definition.blocks.reduce((x,b)=>x+BigInt(b.valueUnits),0n).toString(),
        status:payload.status,archived:false,...Object.fromEntries(scopeKeys.map(k=>[k,payload[k]]))};
      records.set(id,record);
      const receipt={ok:true,id,revision,manifestHash:record.manifestHash};
      receipts.set(payload.requestId,receipt);persist();return json(receipt);
    }
    const dup=route.match(/^\/assessments\/([\da-f-]+)\/duplicate$/i);
    if(dup&&method==='POST'){
      const request=JSON.parse(init.body),source=records.get(dup[1]);
      if(!source)return json({code:'not_found'},404);
      const clone={...COPY(source),id:request.newId,revision:1,status:'draft'};
      records.set(clone.id,clone);persist();
      return json({ok:true,id:clone.id,revision:1,manifestHash:clone.manifestHash});
    }
    if(route==='/selections'&&method==='POST'){
      const req=JSON.parse(init.body),rec=records.get(req.assessmentId);
      if(!rec||rec.status!=='issued')return json({code:'not_issued'},409);
      selections.set(req.selectionId,COPY(rec));return json({ok:true,id:rec.id,
        revision:rec.revision,selectionId:req.selectionId,manifestHash:rec.manifestHash});
    }
    const sel=route.match(/^\/selections\/([\da-f-]+)$/i);
    if(sel&&method==='GET'){
      const rec=selections.get(sel[1]);if(!rec)return json({code:'not_found'},404);
      return json({selectionId:sel[1],record:COPY(rec)});
    }
    counters.unknown++;return json({code:'qa_unknown_contract',route},404);
  };
})();