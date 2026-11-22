#!/usr/bin/env python3
"""QA-79C-COMPLETE-02: real SALTA app, native Chromium zoom, delayed synthetic scope QA.

QA-only, no runtime modifications. Does not claim a same-document A->B race when
the real UI disables its scope selector during an outstanding request.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import subprocess
import time
import traceback
import threading
from ctypes import CDLL, c_void_p, c_uint, c_int, c_ulong
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

BASE = '3b1fd8df600d7c9fbc4f688cc36d4fd9f03fc7b8'
MOCK_BLOB = '03067245ca9cb60897a3b172e62fc759f3bdbc2f'
APP = '/plataforma/corretor-v2.html'

OVERLAY = r"""
(() => {
  'use strict';
  // Additional disposable QA-only interception: mock is installed first.
  const original = window.fetch, held = [], events = [];
  let enabled = false;
  const source = 'turma-qa-a';
  Object.defineProperty(window, '__QA_DELAY_SCOPE__', {value: {
    events, arm(){enabled=true;events.push({kind:'armed',at:Date.now()})},
    get pendingCount(){return held.length},
    release(status=null){
      const item=held.shift();
      if(!item)throw new Error('Negative control: no held A response');
      events.push({kind:'A-released',at:Date.now(),status:status??200});
      item.done(status==null?item.response:
        new Response(JSON.stringify({code:'synthetic_delayed_denial'}),{
          status,headers:{'Content-Type':'application/json'}}));
    }
  }});
  window.fetch=async(input,init={})=>{
    const raw=typeof input==='string'?input:input?.url;
    const u=new URL(raw,location.href);
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(enabled && method==='GET' && u.pathname==='/assessments/v1/assessments' &&
       u.searchParams.get('classId')===source && u.searchParams.has('after')){
      enabled=false;
      const response=await original(input,init);
      events.push({kind:'A-page2-held',at:Date.now(),path:u.pathname,scope:source,
        after:u.searchParams.get('after')});
      return await new Promise(done=>held.push({done,response}));
    }
    return original(input,init);
  };
})();
"""

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

def utc():
    return datetime.now(timezone.utc).isoformat()

def git(repo, *args):
    return subprocess.check_output(['git','-C',str(repo),*args],text=True).strip()

def require_source(repo, expected):
    assert git(repo,'rev-parse','HEAD') == expected, 'Checkout is not the exact test PR HEAD.'
    assert git(repo,'rev-parse',f'{BASE}:plataforma/tests/browser-qa/qa_synthetic_gateway.js') == MOCK_BLOB
    assert git(repo,'rev-parse','HEAD:plataforma/tests/browser-qa/qa_synthetic_gateway.js') == MOCK_BLOB
    allowed={'.github/workflows/test-ux79c-complete-02.yml',
             'plataforma/tests/browser-qa/qa_complete_02.py'}
    actual=set(git(repo,'diff','--name-only',BASE,'HEAD').splitlines())
    assert actual==allowed, 'Scope changed from approved PR96: '+str(sorted(actual^allowed))
    assert not git(repo,'status','--porcelain'), 'Checkout must be clean.'
    assert not git(repo,'diff','--check',BASE,'HEAD'), 'Whitespace errors.'
    assert not git(repo,'diff','--name-only',BASE,'HEAD','--',
                   'plataforma/corretor-v2.html','plataforma/avaliacoes-biblioteca.mjs',
                   'plataforma/avaliacoes-biblioteca.css','plataforma/corretor-v2.css',
                   'corretor/v2','plataforma/tests/browser-qa/qa_integrada.py'), 'Runtime changed.'
    return {'base':BASE,'head':expected,'diff':sorted(actual),
            'mockBlob':MOCK_BLOB,'appBlob':git(repo,'rev-parse','HEAD:plataforma/corretor-v2.html')}

def native_keys(steps):
    X=CDLL('libX11.so.6')
    T=CDLL('libXtst.so.6')
    X.XOpenDisplay.restype=c_void_p
    X.XOpenDisplay.argtypes=[c_void_p]
    X.XKeysymToKeycode.restype=c_uint
    X.XKeysymToKeycode.argtypes=[c_void_p,c_ulong]
    X.XFlush.argtypes=[c_void_p]
    T.XTestFakeKeyEvent.argtypes=[c_void_p,c_uint,c_int,c_ulong]
    d=X.XOpenDisplay(None)
    if not d: raise RuntimeError('X11/Xvfb session unavailable: cannot test native zoom')
    ctrl=X.XKeysymToKeycode(d,0xffe3)
    equals=X.XKeysymToKeycode(d,0x3d)
    for _ in range(steps):
        T.XTestFakeKeyEvent(d,ctrl,1,0);X.XFlush(d);time.sleep(.04)
        T.XTestFakeKeyEvent(d,equals,1,0);X.XFlush(d);time.sleep(.04)
        T.XTestFakeKeyEvent(d,equals,0,0);X.XFlush(d);time.sleep(.04)
        T.XTestFakeKeyEvent(d,ctrl,0,0);X.XFlush(d);time.sleep(.14)

def native_reset():
    """Reset browser site zoom by the same real X11 accelerator mechanism."""
    X=CDLL('libX11.so.6')
    T=CDLL('libXtst.so.6')
    X.XOpenDisplay.restype=c_void_p
    X.XOpenDisplay.argtypes=[c_void_p]
    X.XKeysymToKeycode.restype=c_uint
    X.XKeysymToKeycode.argtypes=[c_void_p,c_ulong]
    X.XFlush.argtypes=[c_void_p]
    T.XTestFakeKeyEvent.argtypes=[c_void_p,c_uint,c_int,c_ulong]
    d=X.XOpenDisplay(None)
    if not d: raise RuntimeError('X11 unavailable for native 100% reset')
    ctrl=X.XKeysymToKeycode(d,0xffe3)
    zero=X.XKeysymToKeycode(d,0x30)
    T.XTestFakeKeyEvent(d,ctrl,1,0);X.XFlush(d);time.sleep(.05)
    T.XTestFakeKeyEvent(d,zero,1,0);X.XFlush(d);time.sleep(.05)
    T.XTestFakeKeyEvent(d,zero,0,0);X.XFlush(d);time.sleep(.05)
    T.XTestFakeKeyEvent(d,ctrl,0,0);X.XFlush(d);time.sleep(.15)

def metrics(page):
    return page.evaluate("""() => {
      const d=document.documentElement,h=document.querySelector('#savedAssessments');
      const visible=e=>{const r=e.getBoundingClientRect(),style=getComputedStyle(e);
         return r.width>0 && r.height>0 && style.visibility!=='hidden' &&
           style.display!=='none'};
      const buttons=[...h.querySelectorAll('button')].filter(visible);
      return {timestamp:new Date().toISOString(),
        viewport:{innerWidth,innerHeight,outerWidth,outerHeight},
        devicePixelRatio,visualViewportScale:visualViewport.scale,
        documentClientWidth:d.clientWidth,documentScrollWidth:d.scrollWidth,
        bodyScrollWidth:document.body.scrollWidth,
        appReady:document.body.classList.contains('salta-auth-ready'),
        libraryShown:!h.hidden,
        controlsVisible:buttons.map(b=>({name:b.textContent.trim(),width:b.getBoundingClientRect().width})),
        mockRecords:window.__SALTA_QA__?.records.size??null};
    }""")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo',required=True,type=Path)
    ap.add_argument('--out',required=True,type=Path)
    ap.add_argument('--expected-head',required=True)
    args=ap.parse_args()
    repo=args.repo.resolve();out=args.out.resolve()
    assert repo!=out and repo not in out.parents
    source=require_source(repo,args.expected_head)
    out.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright,TimeoutError as PlaywrightTimeout
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),
        functools.partial(Handler,directory=str(repo)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_address[1]}{APP}'
    mock=(repo/'plataforma/tests/browser-qa/qa_synthetic_gateway.js').read_text()
    report={'task':'QA-79C-COMPLETE-02','createdUTC':utc(),'source':source,
            'localhostOnly':True,'scenarios':[],'externalAttempts':[],
            'pageErrors':[],'consoleErrors':[],'assets':[]}
    assets=set()
    def add(name,status,data=None,note=None):
        row={'name':name,'status':status,'data':data,'note':note,'dateUTC':utc()}
        report['scenarios'].append(row)
        print(f'[{status}] {name}'+(f' — {note}' if note else ''),flush=True)
    def network_guard(route):
        target=urlsplit(route.request.url)
        if target.hostname in ('127.0.0.1','localhost') and target.port==server.server_address[1]:
            route.continue_()
        else:
            report['externalAttempts'].append({'url':route.request.url,'method':route.request.method})
            route.abort('blockedbyclient')
    def new_context(browser,width=1440,overlay=False):
        c=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1,
            locale='pt-BR',permissions=[],service_workers='block')
        c.add_init_script(script=mock+('\n;'+OVERLAY if overlay else ''))
        c.route('**/*',network_guard)
        c.route_web_socket('**/*',lambda ws:ws.close())
        return c
    def page_hooks(p):
        p.on('pageerror',lambda e:report['pageErrors'].append(str(e)[:400]))
        p.on('console',lambda e:report['consoleErrors'].append(e.text[:400]) if e.type=='error' else None)
        p.on('response',lambda response:assets.add(urlsplit(response.url).path)
             if urlsplit(response.url).hostname in ('127.0.0.1','localhost') else None)
        p.on('dialog',lambda d:d.accept())
    def ready(p):
        p.locator('#savedAssessments:not([hidden])').wait_for(timeout=20000)
        p.wait_for_function("""() => {
          const e=document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]');
          return e && !e.disabled && !document.getElementById('scoreFormatField').hidden;
        }""",timeout=20000)

    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=False,args=[
                '--disable-background-networking','--disable-sync','--no-first-run',
                '--no-default-browser-check','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1',
                '--no-proxy-server'])
            # Scenario A: real browser accelerators, NOT CSS/viewport emulation.
            for width in (1440,768,390):
                c=new_context(browser,width);p=c.new_page();page_hooks(p)
                case=f'ZOOM-NATIVO-200-{width}'
                try:
                    p.goto(url,wait_until='domcontentloaded',timeout=30000)
                    ready(p);p.bring_to_front()
                    p.keyboard.press('Control+0')
                    p.wait_for_timeout(300)
                    baseline=metrics(p)
                    if abs(baseline['devicePixelRatio']-1)>0.06 or abs(baseline['viewport']['innerWidth']-width)>2:
                        raise AssertionError('Negative control: zoom 100% not established: '+str(baseline))
                    p.screenshot(path=str(out/f'zoom_{width}_100.png'),full_page=True,animations='disabled')
                    native_keys(5)
                    p.wait_for_timeout(500)
                    after=metrics(p)
                    p.screenshot(path=str(out/f'zoom_{width}_200.png'),full_page=True,animations='disabled')
                    zoomRatio=after['devicePixelRatio']/baseline['devicePixelRatio']
                    widthRatio=baseline['viewport']['innerWidth']/after['viewport']['innerWidth']
                    if abs(zoomRatio-2)>0.08 or abs(widthRatio-2)>0.08:
                        raise AssertionError('Native 200% not proven by DPR and layout viewport: '+str(after))
                    if abs(after['visualViewportScale']-1)>0.05:
                        raise AssertionError('Pinch/page-scale emulation, not native zoom')
                    if after['documentScrollWidth']>after['documentClientWidth']+1:
                        raise AssertionError('Horizontal overflow at native 200%: '+str(after))
                    if not after['appReady'] or not after['libraryShown'] or len(after['controlsVisible'])<3:
                        raise AssertionError('Real app not rendered at zoom 200%')
                    native_reset()
                    p.wait_for_timeout(350)
                    reset=metrics(p)
                    if abs(reset['devicePixelRatio']-baseline['devicePixelRatio'])>0.06:
                        raise AssertionError('Negative control: native reset to 100% failed')
                    add(case,'PASSOU',{'baseline':baseline,'native200':after,'reset':reset,
                        'nativeInput':'XTest Control+= repeated five times, browser graphical Xvfb',
                        'screenshots':[f'zoom_{width}_100.png',f'zoom_{width}_200.png']})
                except Exception as ex:
                    add(case,'FALHOU',note=f'{type(ex).__name__}: {str(ex)[:600]}')
                    try:p.screenshot(path=str(out/f'FAIL_zoom_{width}.png'),full_page=True)
                    except Exception:pass
                finally:c.close()

            # Scenario B: real DOM/UI scope switch after a deliberately held
            # synthetic A page-2 response. The application's operationBusy guard
            # may prevent *concurrent* A->B switching; do not bypass it.
            c=new_context(browser,1440,overlay=True);p=c.new_page();page_hooks(p)
            try:
                p.goto(url,wait_until='domcontentloaded',timeout=30000)
                ready(p)
                # Create one real assessment through UI; then clone *only* mock
                # records to seed deterministic A/B paginated data.
                p.locator('#assessmentTitle').fill('QA completa — avaliação sintética inicial')
                p.locator('#assessmentSubject').fill('Matemática')
                p.locator('#assessmentClass').fill('Turma QA A')
                p.locator('#assessmentDate').fill('2026-11-22')
                p.locator('#type').select_option('A-E')
                p.locator('#count').fill('3')
                p.locator('#add').click()
                p.locator('#savedAssessments details.library-answers summary').click()
                p.locator('#savedAssessments textarea').fill('1 A\n2 B\n3 C')
                p.get_by_role('button',name='Aplicar gabarito').click()
                p.locator('#savedAssessments button[data-action-icon="save"]').click()
                p.wait_for_function("""() => window.__SALTA_QA__?.records.size===1 &&
                   window.__SALTA_QA__.events.some(x=>x.method==='GET'&&/\/revisions\/1$/.test(x.path))""",
                   timeout=20000)
                # Obtain TWO distinct valid manifests through the authentic UI,
                # one for each scope. A fake B title with an A header is unsafe
                # as evidence of privacy; do not clone A's manifest into B.
                p.evaluate('window.__SALTA_QA__.addGrantB()')
                p.reload(wait_until='domcontentloaded',timeout=30000)
                p.wait_for_function("""() => document.querySelector(
                  '#savedAssessments select[aria-label="Turma autorizada"]')?.options.length===2
                """,timeout=20000)
                p.locator('#savedAssessments select[aria-label="Turma autorizada"]').select_option('1')
                p.wait_for_function("""() => {
                   const s=document.querySelector('#savedAssessments select[aria-label="Turma autorizada"]');
                   const c=document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]');
                   return s?.value==='1'&&!s.disabled&&c?.options.length===1;
                }""",timeout=20000)
                p.locator('#assessmentTitle').fill('QA completa — avaliação B independente')
                p.locator('#assessmentSubject').fill('Matemática')
                p.locator('#assessmentClass').fill('Turma QA B')
                p.locator('#assessmentDate').fill('2026-11-22')
                p.locator('#type').select_option('A-E')
                p.locator('#count').fill('3')
                p.locator('#add').click()
                p.locator('#savedAssessments details.library-answers summary').click()
                p.locator('#savedAssessments textarea').fill('1 A\n2 B\n3 C')
                p.get_by_role('button',name='Aplicar gabarito').click()
                p.locator('#savedAssessments button[data-action-icon="save"]').click()
                p.wait_for_function("""() => window.__SALTA_QA__?.records.size===2 &&
                  [...window.__SALTA_QA__.records.values()].some(
                    r=>r.classId==='turma-qa-b'&&r.status==='issued'&&r.revision===1)
                """,timeout=20000)
                seeded=p.evaluate("""() => {
                  const qa=window.__SALTA_QA__;
                  const snapshots=[...qa.records.values()];
                  const firstA=snapshots.find(r=>r.classId==='turma-qa-a');
                  const firstB=snapshots.find(r=>r.classId==='turma-qa-b');
                  if(!firstA||!firstB||firstA.status!=='issued'||firstB.status!=='issued'||
                     firstA.definition.manifest.header.className!=='Turma QA A'||
                     firstB.definition.manifest.header.className!=='Turma QA B')
                    throw Error('Negative control: independently saved A/B headers absent');
                  qa.records.clear();
                  const makeId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
                  for(let i=1;i<=13;i++){
                    for(const [letter,n,base] of [['A',i,firstA],['B',100+i,firstB]]){
                      const r=structuredClone(base);
                      r.id=makeId(n);
                      r.definition.title=letter+'-PRIVADA-'+String(i).padStart(2,'0');
                      qa.records.set(r.id,r);
                    }
                  }
                  qa.save();
                  return {mockRecords:qa.records.size,grants:qa.fixture.grants.length,
                    headersVerified:true,recordSource:'two independent UI saves'};
                }""")
                if seeded!={'mockRecords':26,'grants':2,'headersVerified':True,
                           'recordSource':'two independent UI saves'}:
                    raise AssertionError('Fixture A/B origins were not independent: '+str(seeded))
                p.reload(wait_until='domcontentloaded',timeout=30000)
                p.wait_for_function("""() =>
                  document.querySelector('#savedAssessments select[aria-label="Turma autorizada"]')?.options.length===2
                """,timeout=20000)
                p.evaluate('window.__QA_DELAY_SCOPE__.arm()')
                scope=p.locator('#savedAssessments select[aria-label="Turma autorizada"]')
                scope.select_option('0')
                p.wait_for_function("""() => window.__QA_DELAY_SCOPE__.pendingCount===1""",timeout=20000)
                pending=p.evaluate("""() => ({
                  scopeDisabled:document.querySelector('#savedAssessments select[aria-label="Turma autorizada"]').disabled,
                  pending:window.__QA_DELAY_SCOPE__.pendingCount,
                  catalog:[...document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]').options].map(x=>x.textContent),
                  events:window.__QA_DELAY_SCOPE__.events
                })""")
                if pending['pending']!=1 or not pending['scopeDisabled'] or len(pending['catalog'])!=1:
                    raise AssertionError('Negative control: delayed A page2 did not lock/private-hide UI: '+str(pending))
                p.screenshot(path=str(out/'ab_A_second_page_held.png'),full_page=True)
                # There is deliberately no direct-call override of the
                # application's operationBusy or disabled selector.
                p.evaluate('window.__QA_DELAY_SCOPE__.release()')
                p.wait_for_function("""() => document.querySelector(
                   '#savedAssessments select[aria-label="Minhas avaliações"]')?.options.length===14""",
                   timeout=20000)
                a_titles=p.evaluate("""() => [...document.querySelector(
                   '#savedAssessments select[aria-label="Minhas avaliações"]').options].map(x=>x.textContent)""")
                scope.select_option('1')
                p.wait_for_function("""() => {
                  const scope=document.querySelector('#savedAssessments select[aria-label="Turma autorizada"]');
                  const catalog=document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]');
                  return scope?.value==='1' && !scope.disabled && catalog?.options.length===14;
                }""",timeout=20000)
                b_titles=p.evaluate("""() => [...document.querySelector(
                   '#savedAssessments select[aria-label="Minhas avaliações"]').options].map(x=>x.textContent)""")
                if not all('A-PRIVADA' in x for x in a_titles[1:]):
                    raise AssertionError('A titles incomplete')
                if not all('B-PRIVADA' in x and 'Turma QA B' in x for x in b_titles[1:]):
                    raise AssertionError('B titles or B headers missing: '+str(b_titles))
                if any('A-PRIVADA' in x or 'Turma QA A' in x for x in b_titles):
                    raise AssertionError('Private A label OR class header leaked into B')
                p.screenshot(path=str(out/'ab_B_after_A_release.png'),full_page=True)
                add('A-B-UI-SEGURA-SEM-SOBREPOSICAO','PASSOU',
                    {'source':'full real app, canonical mock, extra test-only delay wrapper',
                     'fixture':seeded,'Aheld':pending,'Alabels':a_titles,
                     'Blabels':b_titles,'noAinB':True})
                # Supplement: real catalog module imported into the same loaded
                # browser, with deterministic deferred A GET after B acceptance.
                # This is NOT represented as a full controller/UI race.
                late=p.evaluate("""async () => {
                  const {enrichCatalogRows}=await import('./catalogo-avaliacoes.mjs');
                  const original=[...document.querySelector(
                     '#savedAssessments select[aria-label="Minhas avaliações"]').options]
                     .map(x=>x.textContent);
                  const scopeA={institutionId:'inst-qa-2026',classId:'turma-qa-a',
                    periodId:'2026-11-qa'};
                  const scopeB={...scopeA,classId:'turma-qa-b'};
                  const results=[];
                  const row=(suffix,scope)=>({id:'00000000-0000-4000-8000-'+
                     String(suffix).padStart(12,'0'),revision:1,...scope,
                     title:suffix===5?'A-PRIVADA-MODULO':'B-EXCLUSIVA-MODULO'});
                  for(const httpStatus of [401,403]){
                    let actor='A',rejectA=null,denied=0,started=false;
                    const cacheA=new Map();
                    const pendingA=enrichCatalogRows([row(5,scopeA)],{
                      open:async()=>{started=true;return await new Promise((resolve,reject)=>{
                        rejectA=()=>reject(Object.assign(new Error('A delayed synthetic rejection'),
                          {status:httpStatus}));
                      })},
                      isCurrent:()=>actor==='A',cache:cacheA,onDenied:()=>{denied++}
                    });
                    for(let i=0;i<20&&!started;i++)await Promise.resolve();
                    if(!started||!rejectA)throw Error('Negative control: A was not held');
                    actor='B';
                    const fromB=await enrichCatalogRows([row(6,scopeB)],{
                      open:async()=>({id:row(6,scopeB).id,revision:1,...scopeB,
                        definition:{title:'B-EXCLUSIVA-MODULO',
                          subject:'Matemática',manifest:{header:{className:'B'}}}}),
                      isCurrent:()=>actor==='B',cache:new Map()
                    });
                    rejectA();
                    const arrivedA=await pendingA;
                    if(arrivedA!==null||denied!==0||cacheA.size!==0||
                       fromB.length!==1||fromB[0].title!=='B-EXCLUSIVA-MODULO')
                      throw Error('Late A '+httpStatus+' corrupted B or triggered stale denial');
                    const now=[...document.querySelector(
                     '#savedAssessments select[aria-label="Minhas avaliações"]').options]
                     .map(x=>x.textContent);
                    if(JSON.stringify(now)!==JSON.stringify(original))
                      throw Error('Module test changed real B catalog DOM');
                    // Active 401/403 MUST be observable, or this test could pass
                    // even with a completely disconnected onDenied callback.
                    let activeDenial=0;
                    try{
                      await enrichCatalogRows([row(5,scopeA)],{
                        open:async()=>{throw Object.assign(new Error('active denied'),{status:httpStatus})},
                        isCurrent:()=>true,onDenied:()=>{activeDenial++},cache:new Map()
                      });
                      throw Error('Negative control: active '+httpStatus+' not rejected');
                    }catch(e){
                      if(e.status!==httpStatus)throw e;
                    }
                    if(activeDenial!==1)throw Error('Negative control: active denial lost');
                    results.push({httpStatus,lateAReturnedNull:true,lateDenied:denied,
                      staleCacheEntries:cacheA.size,Btitle:fromB[0].title,
                      originalDomPreserved:true,activeDeniedControl:activeDenial,
                      dateUTC:new Date().toISOString()});
                  }
                  return results;
                }""")
                add('A-B-LATE-401-403-MODULO-NO-CHROMIUM','PASSOU',{
                    'source':'actual catalogo-avaliacoes.mjs imported in real app Chromium',
                    'scope':'module only; NOT same controller/UI in-flight scope switch',
                    'statuses':late})
                # A completion after B cannot be produced via this native UI
                # because the scope control remains disabled during A's GET.
                add('A-B-RESPOSTA-TARDIA-APOS-B-NA-MESMA-INSTANCIA','NÃO EXECUTÁVEL',
                    note='Real app locks scope via operationBusy while A second-page GET is pending. '
                         'Changing to B before releasing A would require bypassing runtime UI or mutating mocks.')
            except Exception as ex:
                add('A-B-UI-SEGURA-SEM-SOBREPOSICAO','FALHOU',
                    note=f'{type(ex).__name__}: {str(ex)[:700]}')
                try:p.screenshot(path=str(out/'FAIL_AB_real_app.png'),full_page=True)
                except Exception:pass
            finally:c.close()
            browser.close()
    except Exception as ex:
        add('RUNNER-CRASH','FALHOU',note=f'{type(ex).__name__}: {ex}')
        report['traceback']=traceback.format_exc()[-4500:]
    finally:
        server.shutdown();server.server_close()
        report['assets']=sorted(assets)
        (out/'qa_complete_02_results.json').write_text(
            json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('EVIDENCE: '+str(out/'qa_complete_02_results.json'),flush=True)
    return 0 if report['scenarios'] and not any(
        x['status']=='FALHOU' for x in report['scenarios']) else 2

if __name__=='__main__':
    raise SystemExit(main())
