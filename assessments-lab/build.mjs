import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=fileURLToPath(new URL('.',import.meta.url)),root=path.resolve(here,'..'),out=path.join(here,'public');
async function copy(relative){const target=path.join(out,relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,relative),target)}
for(const file of ['salta-theme.css','favicon.svg','plataforma/professor-theme.css','plataforma/corretor-v2.css','plataforma/admin-shell.mjs'])await copy(file);
for(const dir of ['corretor/v2/omr','corretor/v2/assessments','assessments-lab/crypto'])for(const name of await readdir(path.join(root,dir)))if(/\.(mjs|js)$/.test(name))await copy(dir+'/'+name);
let html=await readFile(path.join(root,'plataforma/corretor-v2.html'),'utf8');
html=html.replaceAll('https://salta-stats.dannyel-moises.workers.dev/auth/session','/api/session').replaceAll("location.replace('./professor.html')","location.replace('/index.html')");
await writeFile(path.join(out,'plataforma/corretor-v2.html'),html);
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SALTA · laboratório de avaliações</title><link rel="stylesheet" href="/salta-theme.css"><main style="max-width:680px;margin:50px auto;padding:24px"><h1>Homologação local de avaliações</h1><p>Somente dados sintéticos. Estas identidades são fixtures de teste, sem acesso a alunos, turmas ou bancos acadêmicos. Não é o login de produção.</p><button id="teacher-one">Professor sintético A</button><button id="teacher-two">Professor sintético B</button><p id="labStatus" role="status"></p></main><script type="module" src="/lab-login.mjs"></script></html>`);
await writeFile(path.join(out,'lab-login.mjs'),`for(const fixture of ['teacher-one','teacher-two'])document.getElementById(fixture).onclick=async()=>{try{const r=await fetch('/__lab/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({fixture})});const data=await r.json();if(!r.ok)throw Error(data.error);location.assign('/plataforma/corretor-v2.html')}catch(error){document.getElementById('labStatus').textContent=error.message}};`);
console.log('Allowlisted frontend assets built for loopback-only laboratory. Production auth source unchanged.');
