#!/usr/bin/env python3
"""SALTA UX-79C-QA-CI-03: Chromium executa o Corretor REAL em checkout integral e isolado.

Não cria páginas, não altera o repositório, não realiza rede externa, não usa credenciais.
Dependências fora do repositório: Python 3.10+, playwright + navegador Chromium instalado.
Não usar em produção; testes reais de navegador exclusivamente com fixtures.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import subprocess
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

BASE_SHA = 'd2d67eb4dd96a1431a9440f341406700d601a602'
NEEDED = [
    'plataforma/corretor-v2.html',
    'plataforma/avaliacoes-biblioteca.mjs',
    'plataforma/catalogo-avaliacoes.mjs',
    'plataforma/admin-shell.mjs',
    'plataforma/corretor-v2.css',
    'plataforma/avaliacoes-biblioteca.css',
    'plataforma/professor-theme.css',
    'salta-theme.css',
    'corretor/v2/assessments/score-format.mjs',
    'corretor/v2/assessments/private-client.mjs',
    'corretor/v2/assessments/private-library.mjs',
    'corretor/v2/omr/reader.mjs',
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Robots-Tag', 'noindex, nofollow')
        super().end_headers()


def create_server(repo):
    handler = functools.partial(QuietHandler, directory=str(repo))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    return srv


def validate_source(repo, expected_head):
    try:
        sha = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'],
                                      text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise RuntimeError(f'CHECKOUT NÃO ENCONTRADO em {repo}. Obtenha cópia integral pelo Git antes da QA.') from exc
    if sha != expected_head:
        raise RuntimeError(f'CHECKOUT INCORRETO: HEAD={sha}; exigido={expected_head}. Interrompido antes de iniciar navegador.')
    changes = subprocess.check_output(['git','-C',str(repo),'diff','--name-only',BASE_SHA,sha], text=True).splitlines()
    allowed = {'.github/workflows/test-ux79c-browser-qa.yml',
               'plataforma/tests/browser-qa/qa_integrada.py',
               'plataforma/tests/browser-qa/qa_synthetic_gateway.js'}
    if set(changes) != allowed:
        raise RuntimeError('ESCOPO INVÁLIDO: delta contra PR #92 não é exatamente o harness: '+str(changes))
    notfound = [name for name in NEEDED if not (repo / name).is_file()]
    if notfound:
        raise RuntimeError('CHECKOUT INCOMPLETO: '+', '.join(notfound))
    changed = subprocess.check_output(['git', '-C', str(repo), 'status', '--porcelain'], text=True)
    if changed.strip():
        raise RuntimeError('CHECKOUT NÃO LIMPO. Use cópia temporária limpa e mantenha scripts/saídas fora do repositório.')
    files = subprocess.check_output(['git', '-C', str(repo), 'ls-files'], text=True).splitlines()
    return {'sha':sha,'approved_pr92_base_sha':BASE_SHA,'tracked_files':len(files),'mandatory_modules':NEEDED,'changed_test_files':changes}


def main():
    parser=argparse.ArgumentParser(description='QA Chromium app real SALTA UX-79C — somente local e sintética')
    parser.add_argument('--repo',required=True,type=Path,help='checkout integral e limpo do HEAD exato do PR QA')
    parser.add_argument('--expected-head',required=True,help='SHA exato do head do pull_request (não merge ref)')
    parser.add_argument('--out',required=True,type=Path,help='pasta para prints/logs (FORA do checkout)')
    parser.add_argument('--mock',default=str(Path(__file__).with_name('qa_synthetic_gateway.js')))
    args=parser.parse_args()
    repo=args.repo.expanduser().resolve()
    out=args.out.expanduser().resolve()
    if out==repo or repo in out.parents:
        raise SystemExit('ERRO: saída precisa estar fora do checkout; não alterar o código aprovado.')
    mock_file=Path(args.mock).expanduser().resolve()
    if not mock_file.is_file():
        raise SystemExit('ERRO: JS sintético não encontrado: '+str(mock_file))
    source=validate_source(repo,args.expected_head)  # Fail closed antes do navegador ou da rede.
    out.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright
    server=create_server(repo)
    origin=f'http://127.0.0.1:{server.server_address[1]}'
    report={'task':'UX-79C-QA-CI-03','source':source,'origin':origin,
            'date_utc':datetime.now(timezone.utc).isoformat(),
            'environment':{'browser':'Playwright Chromium local','authorization':'interceptada, sintética',
                           'network':'somente 127.0.0.1 porta local','real_safari_iphone':'NÃO TESTADO',
                           'real_browser_zoom_200':'NÃO TESTADO (reflow 195px não equivale a zoom real)'},
            'scenarios':[],'blocked_external_attempts':[],'external_requests_transmitted':0,'page_errors':[], 'console_errors':[],'loaded_local_assets':[]}
    page = None
    assets_seen = set()

    def mark(name,status,notes=None,data=None):
        row={'name':name,'status':status,'notes':notes,'data':data}
        report['scenarios'].append(row)
        print(f'[{status}] {name}'+(f' — {notes}' if notes else ''),flush=True)
        return row

    def trial(name,fn):
        try:
            data=fn()
            mark(name,'PASSOU',data=data)
            return True
        except Exception as error:
            mark(name,'FALHOU',notes=f'{type(error).__name__}: {str(error)[:700]}')
            if page:
                safe=''.join(c if c.isalnum() or c in '-_' else '_' for c in name)[:70]
                try:page.screenshot(path=str(out/f'FALHA_{safe}.png'),full_page=True)
                except Exception:pass
            return False

    def qa_eval(js):
        return page.evaluate(js)

    def wait_ready():
        page.locator('#savedAssessments:not([hidden])').wait_for(timeout=20000)
        page.wait_for_function('''() => {
          const h=document.querySelector('#savedAssessments');
          const c=h?.querySelector('select[aria-label="Minhas avaliações"]');
          const format=document.getElementById('scoreFormatField');
          return h && !h.hidden && c && !c.disabled && format && !format.hidden;
        }''',timeout=20000)

    def tab(tab_id):
        page.locator(f'nav.module-nav button[data-view="{tab_id}"]').click()
        page.wait_for_function('(id) => document.querySelector(".module-view.active")?.id===id',arg=tab_id)

    def evidence(label):
        filename=out/(label+'.png')
        page.screenshot(path=str(filename),full_page=True,animations='disabled')
        return str(filename)

    def metrics():
        return qa_eval('''() => ({viewport:innerWidth,documentClient:document.documentElement.clientWidth,
          documentScroll:document.documentElement.scrollWidth,bodyScroll:document.body.scrollWidth,
          title:document.title,activeTab:document.querySelector('.module-view.active')?.id,
          appReady:document.body.classList.contains('salta-auth-ready'),
          status:document.querySelector('#savedAssessments p[role="status"]')?.textContent,
          mock:window.__SALTA_QA__?.getSummary()})''')

    def count_options(n):
        page.wait_for_function("""n => document.querySelectorAll('#savedAssessments select[aria-label="Minhas avaliações"] option').length===n""",arg=n,timeout=25000)
        return qa_eval('''() => [...document.querySelectorAll('#savedAssessments select[aria-label="Minhas avaliações"] option')].map(x=>x.textContent)''')

    try:
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(headless=True,args=[
                '--disable-background-networking','--disable-sync',
                '--no-first-run','--no-default-browser-check',
                '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1',
                '--no-proxy-server'
            ])
            context=browser.new_context(viewport={'width':1440,'height':900},locale='pt-BR',
                                        service_workers='block',permissions=[])
            # A interceptação inicia ANTES de carregar qualquer HTML ou módulo.
            context.add_init_script(path=str(mock_file))
            def route_only_local(route):
                target=urlsplit(route.request.url)
                if target.hostname in ('127.0.0.1','localhost') and target.port==server.server_address[1]:
                    route.continue_()
                else:
                    report['blocked_external_attempts'].append({'method':route.request.method,
                                                                 'url':route.request.url.split('?')[0]})
                    route.abort('blockedbyclient')
            context.route('**/*',route_only_local)
            # WebSocket route: deny even if a future dependency adds a socket.
            context.route_web_socket('**/*', lambda ws:ws.close())
            page=context.new_page()
            page.on('pageerror',lambda exc:report['page_errors'].append(str(exc)[:400]))
            def record_local_response(response):
                u=urlsplit(response.url)
                if u.hostname in ('127.0.0.1','localhost') and u.port==server.server_address[1]:
                    assets_seen.add(u.path)
                    if response.status>=400:report['page_errors'].append('Local asset HTTP '+str(response.status)+': '+u.path)
            page.on('response',record_local_response)
            page.on('console',lambda msg:report['console_errors'].append(msg.text[:400]) if msg.type=='error' else None)
            page.on('dialog',lambda dialog:dialog.accept())
            app=origin+'/plataforma/corretor-v2.html'
            page.goto(app,wait_until='domcontentloaded',timeout=30000)

            if not trial('Aplicação real montada — autenticação, imports e catálogo sintéticos',
                         lambda:(wait_ready(),metrics())[1]):
                mark('Demais fluxos','NÃO EXECUTÁVEL','A aplicação não inicializou: ver logs e capturas; não presumir sucesso.')
            else:
                def navigation():
                    views={}
                    for view in ('criar','corrigir','cartoes'):
                        tab(view);views[view]=evidence('salta_real_navegacao_'+view)
                    tab('criar')
                    return views
                trial('Navegação DOM real: Criar / Corrigir / Cartão-resposta',navigation)

                def viewport_sweep():
                    results=[]
                    for width,height,label in [(1440,900,'desktop'),(768,900,'tablet'),(390,844,'celular'),(195,844,'reflow_195px')]:
                        page.set_viewport_size({'width':width,'height':height})
                        page.wait_for_timeout(120)
                        data=metrics()
                        data['screenshot']=evidence('salta_real_'+label)
                        results.append(data)
                        if data['documentScroll']>data['documentClient']+1:
                            raise AssertionError(f'Overflow horizontal em {width}px: scroll={data["documentScroll"]}, client={data["documentClient"]}. Captura: {data["screenshot"]}')
                    return results
                trial('Responsividade DOM real: 1440/768/390 e reflow 195px',viewport_sweep)
                page.set_viewport_size({'width':1440,'height':900})

                def format_and_create():
                    # A criação acontece no formulário NATIVO do Corretor: nenhum DOM inventado.
                    page.locator('#assessmentTitle').fill('Avaliação sintética — QA integração')
                    page.locator('#assessmentSubject').fill('Matemática')
                    page.locator('#assessmentClass').fill('Turma QA A')
                    page.locator('#assessmentDate').fill('2026-11-21')
                    page.locator('#type').select_option('A-E')
                    page.locator('#count').fill('3')
                    page.locator('#add').click()
                    page.locator('#savedAssessments details.library-answers summary').click()
                    options=qa_eval('''() => [...document.querySelector('#scoreFormatSelect').options].map(o=>({text:o.textContent,value:o.value}))''')
                    if [x['text'].strip() for x in options]!=['10','10,0','10,00']:
                        raise AssertionError('Opções da nota divergentes: '+str(options))
                    # Passive event-timeline probe: records the browser's input/change
                    # phases without changing values, stopping propagation or touching app code.
                    page.evaluate("""() => {
                      const sel=document.getElementById('scoreFormatSelect'),events=[];
                      window.__SALTA_QA_EVENT_TRACE__=events;
                      sel.addEventListener('input',()=>events.push({event:'input-target',value:sel.value}),true);
                      document.addEventListener('input',e=>{
                        if(e.target===sel)events.push({event:'input-document-after-bubble',value:sel.value});
                      },false);
                      sel.addEventListener('change',()=>events.push({event:'change-target',value:sel.value}),true);
                    }""")
                    values=[]; format_states=[]
                    for decimals in ('0','1','2'):
                        page.locator('#scoreFormatSelect').select_option(decimals)
                        state=qa_eval('''() => ({
                          selectValue: document.getElementById('scoreFormatSelect').value,
                          formatVisible: !document.getElementById('scoreFormatField').hidden,
                          inputValue: document.querySelector('#savedAssessments .library-scoring input')?.value,
                          summary: document.querySelector('#savedAssessments .library-toolbar p[aria-live="polite"]')?.textContent,
                          status: document.querySelector('#savedAssessments p[role="status"]')?.textContent,
                          eventTrace: window.__SALTA_QA_EVENT_TRACE__?.slice(-5)
                        })''')
                        values.append(state['inputValue']);format_states.append(state)
                    format_mismatch=values!=['10','10,0','10,00']
                    box=page.locator('#savedAssessments .library-scoring input').first
                    box.fill('0.3333')
                    rejected=box.input_value()!='0.3333'
                    if not rejected:raise AssertionError('Entrada 0.3333 foi aceita no formato 10,00')
                    box.fill('10')
                    page.locator('#savedAssessments textarea').fill('1 A\n2 B\n3 C')
                    page.get_by_role('button',name='Aplicar gabarito').click()
                    evidence('salta_real_formato_pontuacao')
                    if format_mismatch:
                        raise AssertionError('Formato não reflete o seletor: '+str(format_states))
                    return {'options':options,'display_values':values,'precision_rejected':rejected,
                            'formatStates':format_states}
                composed=trial('Três formatos de nota + formulário real + rejeição de 4 casas',format_and_create)

                def save():
                    page.locator('#savedAssessments button[data-action-icon="save"]').click()
                    # Verify exactly what a real client requires: the PUT receipt
                    # followed by authenticated GET of the immutable revision.
                    # The UI may change its status to 'opened' after history GET;
                    # that must be reported but cannot invalidate a verified receipt.
                    page.wait_for_function('''() => {
                      const qa=window.__SALTA_QA__;
                      const events=qa?.events || [];
                      return qa?.records.size===1 &&
                        events.some(e=>e.method==='PUT' && /\/assessments\/v1\/assessments\//.test(e.path)) &&
                        events.some(e=>e.method==='GET' && /\/revisions\/1$/.test(e.path));
                    }''',timeout=20000)
                    record=qa_eval('''() => {const qa=window.__SALTA_QA__;
                      const r=[...qa.records.values()][0],ev=qa.events;
                      return {id:r.id,revision:r.revision,status:r.status,totalUnits:r.totalUnits,
                        display:r.definition.display,answers:r.definition.answers.length,
                        receiptVerified:ev.some(e=>e.method==='GET' && /\/revisions\/1$/.test(e.path)),
                        statusMessage:document.querySelector('#savedAssessments p[role="status"]')?.textContent,
                        requestSequence:ev.filter(e=>e.method==='PUT'||/\/revisions\/1$/.test(e.path)).map(e=>e.method+' '+e.path)};
                    }''')
                    if record['totalUnits']!='100000' or record['status']!='issued' or not record['receiptVerified']:
                        raise AssertionError('Recibo/reabertura sintéticos incoerentes: '+str(record))
                    evidence('salta_real_salvo_sintetico')
                    return record
                # The actual form may still save valid data when a format-display test fails.
                # Do not hide independent flows behind a previous QA assertion.
                saved=trial('Salvar: recibo + GET sintéticos e valor interno exato',save)

                def reopen_duplicate_correct():
                    first_id=qa_eval('''() => [...window.__SALTA_QA__.records.values()][0].id''')
                    page.locator('#savedAssessments button[data-action-icon="new"]').click()
                    page.locator('#savedAssessments select[aria-label="Minhas avaliações"]').select_option(first_id)
                    page.wait_for_function('''() => document.getElementById('assessmentTitle')?.value.includes('Avaliação sintética')''')
                    page.locator('#savedAssessments button[data-action-icon="duplicate"]').click()
                    page.wait_for_function('''() => window.__SALTA_QA__.records.size===2''')
                    copied=qa_eval('''() => [...window.__SALTA_QA__.records.values()].map(r=>({id:r.id,status:r.status,revision:r.revision}))''')
                    if sorted(r['status'] for r in copied)!=['draft','issued']:
                        raise AssertionError('Duplicação deve iniciar como draft: '+str(copied))
                    page.locator('#savedAssessments button[data-action-icon="new"]').click()
                    page.locator('#savedAssessments select[aria-label="Minhas avaliações"]').select_option(first_id)
                    page.locator('#savedAssessments button[data-action-icon="correct"]').click()
                    page.wait_for_function('''() => (document.getElementById('scanModelStatus')?.textContent||'').includes('confirmada para correção')''')
                    tab('corrigir')
                    evidence('salta_real_correcao_privada_sintetica')
                    return {'records':copied,'correctionStatus':page.locator('#scanModelStatus').inner_text()}
                if saved:trial('Reabrir, duplicar e vincular correção com contrato sintético',reopen_duplicate_correct)

                def camera_permission():
                    tab('corrigir')
                    page.locator('#camera').click()
                    page.wait_for_function('''() => (document.getElementById('cameraGuideStatus')?.textContent||'').includes('Permita o acesso')''',timeout=15000)
                    evidence('salta_real_camera_permissao_negada')
                    return {'status':page.locator('#cameraGuideStatus').inner_text()}
                trial('Controle de câmera: permissão negada sinteticamente',camera_permission)

                def keyboard_a11y():
                    tab('criar')
                    page.keyboard.press('Tab')
                    focus1=qa_eval('''() => ({tag:document.activeElement.tagName,name:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent?.trim().slice(0,80),outline:getComputedStyle(document.activeElement).outlineColor})''')
                    page.keyboard.press('Shift+Tab')
                    focus2=qa_eval('''() => ({tag:document.activeElement.tagName,name:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent?.trim().slice(0,80)})''')
                    icon=qa_eval('''() => ({save:getComputedStyle(document.querySelector('#savedAssessments button[data-action-icon="save"]'),'::before').maskImage,
                      camera:getComputedStyle(document.querySelector('#camera'),'::before').maskImage})''')
                    if not icon['save'] or icon['save']=='none' or not icon['camera'] or icon['camera']=='none':
                        raise AssertionError('Ícones Lucide de salvar/câmera não encontrados no CSS computado')
                    return {'focusForward':focus1,'focusBack':focus2,'icons':icon}
                trial('Foco de teclado / nomes e ícones Lucide no DOM real',keyboard_a11y)

                # Precisa de ao menos uma avaliação emitida verdadeira criada acima.
                if saved:
                    def pagination(n):
                        tab('criar')
                        qa_eval(f'() => window.__SALTA_QA__.seedClones({n})')
                        page.reload(wait_until='domcontentloaded',timeout=30000)
                        if n<=200:
                            wait_ready();opts=count_options(n+1)
                            if n and (' - Matemática - Turma QA A' not in opts[1] or ' - Matemática - Turma QA A' not in opts[-1]):
                                raise AssertionError('Rótulos completos ausentes')
                            if n==13:evidence('salta_real_catalogo_13')
                            return {'count':len(opts)-1,'first':opts[1] if n else '',
                                    'last':opts[-1] if n else ''}
                        page.wait_for_function('''() => (document.querySelector('#savedAssessments p[role="status"]')?.textContent||'').includes('200 avaliações')''',timeout=25000)
                        opts=qa_eval('''() => [...document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]').options].map(x=>x.textContent)''')
                        if len(opts)!=1:raise AssertionError('201 publicou catálogo parcial')
                        evidence('salta_real_catalogo_201_fail_closed')
                        return {'count':len(opts)-1,'message':page.locator('#savedAssessments p[role="status"]').inner_text()}
                    for n in (13,200,201):
                        trial(f'Catálogo real {n} itens: paginação/rotulagem/fail-closed',lambda n=n:pagination(n))

                    def recover(status):
                        qa_eval('''() => window.__SALTA_QA__.seedClones(13)''')
                        qa_eval(f'() => window.__SALTA_QA__.setFault({status})')
                        page.reload(wait_until='domcontentloaded',timeout=30000)
                        page.wait_for_function('''() => [...document.querySelectorAll('#savedAssessments button')].some(b=>b.textContent==='Tentar novamente'&&!b.hidden)''',timeout=20000)
                        before=qa_eval('''() => document.querySelectorAll('#savedAssessments select[aria-label="Minhas avaliações"] option').length''')
                        if before!=1:raise AssertionError('Apareceu lista parcial antes de retry')
                        page.locator('#savedAssessments button[data-action-icon="refresh"]').click()
                        count_options(14)
                        return {'http':status,'beforeOptions':before,'afterOptions':14}
                    for status in (429,503):trial(f'Falha HTTP sintética {status} e retry do catálogo',lambda st=status:recover(st))

                    def deny(status):
                        qa_eval('''() => window.__SALTA_QA__.seedClones(13)''')
                        first=qa_eval('''() => [...window.__SALTA_QA__.records.values()][0].id''')
                        qa_eval(f'''() => window.__SALTA_QA__.setFault({status}, '/assessments/v1/assessments/{first}/revisions/1')''')
                        page.reload(wait_until='domcontentloaded',timeout=30000)
                        page.wait_for_timeout(2000)
                        opts=qa_eval('''() => [...document.querySelector('#savedAssessments select[aria-label="Minhas avaliações"]').options].map(o=>o.textContent)''')
                        if len(opts)>1:raise AssertionError('Revogação expôs rótulos privados')
                        return {'http':status,'remainingOptions':opts}
                    for status in (401,403):trial(f'Revogação 401/403 sintética: catálogo não é publicado ({status})',lambda st=status:deny(st))

                # A auditoria de zoom real/Safari/fotografia não pode ser substituída por emulação.
                for name in ['Zoom 200% REAL do navegador','Safari/iPhone físico',
                             'Leitura óptica de cartão A4 físico',
                             'Resposta tardia A→B com atraso controlado',
                             'Correção manual com 1/3 via OMR/raster real']:
                    mark(name,'NÃO EXECUTÁVEL','Exige procedimento humano/dispositivo/harness específico; não simulado neste script.')
                report['loaded_local_assets']=sorted(assets_seen)
                required_paths=['/plataforma/corretor-v2.html',
                  '/plataforma/avaliacoes-biblioteca.mjs','/plataforma/corretor-v2.css',
                  '/plataforma/avaliacoes-biblioteca.css',
                  '/corretor/v2/assessments/private-client.mjs',
                  '/corretor/v2/omr/reader.mjs']
                missing=[path for path in required_paths if path not in assets_seen]
                mark('Recursos reais HTML/JS/CSS carregados por HTTP localhost',
                     'PASSOU' if not missing else 'FALHOU',
                     data={'required':required_paths,'missing':missing,'loaded':len(assets_seen)})
                integrity=qa_eval('''() => window.__SALTA_QA__?.getSummary()''')
                safe=not report['blocked_external_attempts'] and not report['page_errors'] and integrity['unknownRequests']==0
                mark('Nenhuma requisição externa / nenhum erro JS não tratado',
                     'PASSOU' if safe else 'FALHOU',
                     data={'blockedExternalAttempts':report['blocked_external_attempts'],
                           'browserPageErrors':report['page_errors'],
                           'mockUnknownRequests':integrity['unknownRequests'],
                           'syntheticMockCalls':integrity['mockedRequests'],
                           'externalRequestsTransmitted':0})
            context.close();browser.close()
    except Exception as exc:
        mark('Execução do runner','FALHOU',notes=str(exc)[:1000])
        report['fatal_traceback']=traceback.format_exc()[-4000:]
    finally:
        server.shutdown();server.server_close()
        path=out/'salta_qa_integrada_resultados.json'
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
        print('EVIDÊNCIAS LOCAIS:',path,flush=True)
    return 0 if report['scenarios'] and all(r['status']!='FALHOU' for r in report['scenarios']) else 2


if __name__=='__main__':
    raise SystemExit(main())