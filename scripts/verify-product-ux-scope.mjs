import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='84eb9ca69d3f3c87a78ff19d25285d3c6d668c89';
const allowed=new Set([
 'plataforma/corretor-v2.html',
 'plataforma/avaliacoes-biblioteca.mjs',
 'plataforma/corretor-v2.css',
 'plataforma/tests/corretor-ux-ready-01.test.mjs',
 'plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs',
 'scripts/verify-product-ux-scope.mjs',
 '.github/workflows/test-direct-pdf.yml',
 '.github/workflows/test-avaliacoes-biblioteca.yml',
 '.github/workflows/test-assessments-embedded.yml'
]);
const transformations={"plataforma/corretor-v2.html":[["<p class=\"status\">CARTÃO DE RESPOSTAS é o título fixo do cartão. O título da avaliação e o componente formam o subtítulo.</p>",""],["<p class=\"status\">Um único arquivo PDF reúne as páginas selecionadas. Os dados do lote ficam nesta sessão e não são enviados.</p>",""],["Avaliação cadastrada (homologação)","Avaliação cadastrada"],["Formato padrão V2","Formato"],["Questões do modelo padrão","Questões"],["Importar modelo exato (JSON)","Importar modelo do cartão (JSON)"],["Gere o cartão nesta sessão ou importe o JSON exato, inclusive para cartões anteriores.",""],["Captura consolidada","Foto capturada"],["A leitura óptica de quadros reduzidos ainda não foi homologada.",""],["const limitations=[];if(hasCdu)limitations.push('C-D-U pode ser impresso, mas a leitura automática ainda não está disponível.');","const limitations=[];if(hasCdu)limitations.push('CDU: sem leitura automática.');"],["function scanModelNotice(model){if(model.mode==='embedded')return ' Aproxime a câmera se o quadro estiver distante.';if(model.questions.some(q=>q.type==='CDU'))return ' C-D-U: leitura automática indisponível.';return ''}","function scanModelNotice(model){return model.questions.some(q=>q.type==='CDU')?' CDU: sem leitura automática.':''}"],["$('scanModelStatus').textContent='Modelo padrão disponível. Importe o arquivo do cartão para corrigir avaliações anteriores.'","$('scanModelStatus').textContent=''"],["$('scanModelStatus').textContent='Modelo padrão pronto. Para outro cartão, confira o arquivo correspondente.'","$('scanModelStatus').textContent=''"],["$('buildStatus').textContent='A composição foi reorganizada automaticamente para caber. Confira a prévia antes de exportar.'","$('buildStatus').textContent='Layout ajustado. Confira a prévia.'"],["${copies} cópias em A4 ${plan.orientation==='landscape'?'paisagem':'retrato'} · escala ${(plan.scale*100).toFixed(2).replace('.',',')}%. Imprima em tamanho real (100%), sem ajustar à página. ","${copies} quadros por folha A4 · ${plan.orientation==='landscape'?'paisagem':'retrato'}. Imprima em tamanho real (100%)."]],"plataforma/avaliacoes-biblioteca.mjs":[["A biblioteca aceita cartões A4 e quadros incorporados V2 com questões A–D, A–E ou C–E. Este modelo não é compatível com o salvamento.","Este cartão não pode ser salvo na biblioteca. Use questões A–D, A–E ou C–E."],["O servidor conectado ainda não confirma o salvamento de quadros incorporados. Você pode continuar usando o quadro no Corretor.","Não é possível salvar este quadro na biblioteca agora. Você ainda pode baixá-lo."],["Este servidor ainda não confirma o salvamento integral das configurações. Nada foi salvo; reconecte-se quando o serviço atualizado estiver disponível.","Não foi possível salvar todas as configurações. Nada foi salvo."],["O servidor ainda não confirma o formato da nota. Nada foi salvo.","Não foi possível salvar o formato da nota. Nada foi salvo."],["A sessão não confirma o formato da nota desta avaliação. Conecte-se a um servidor compatível.","Não foi possível recuperar o formato da nota desta avaliação. Confira antes de continuar."],["A operação está sendo verificada. Alterações posteriores ainda não foram salvas.","Conferindo a operação. Alterações recentes não salvas."],["A avaliação enviada foi salva e conferida; suas alterações posteriores ainda não foram salvas.","Alterações não salvas."],["Há alterações nesta avaliação que ainda não foram salvas.","Alterações não salvas."],["A avaliação mudou durante a seleção. Salve as alterações e confirme novamente para corrigir.","A avaliação mudou. Salve e selecione novamente para corrigir."],["Avaliação salva e conferida no servidor.","Salvo."],["Avaliação confirmada para correção.","Pronto para corrigir."],["Conferindo avaliações e dados antes de liberar a lista…","Carregando avaliações…"],["Avaliação aberta para edição.",""],["'Escolha uma avaliação ou crie uma nova.';","'';"],["Avaliação histórica: apenas informações verificáveis foram restauradas. Preferências não registradas receberam padrões neutros; confira antes de editar.","Alguns campos não foram recuperados. Confira os dados antes de editar."],["A operação anterior continua pendente; alterações recentes ainda não foram salvas.","Operação em andamento. Alterações não salvas."],["Alterações ainda não salvas nesta avaliação.","Alterações não salvas."]],"plataforma/tests/avaliacoes-biblioteca-unificada.test.mjs":[["/não foram salvas|confirme novamente/i","/Alterações não salvas|confirme novamente/i"],["/não foram salvas|confirme novamente/","/Alterações não salvas|confirme novamente/i"],["/avaliação enviada foi salva.*alterações posteriores/i","/Alterações não salvas/i"],["/alterações posteriores/i","/Alterações não salvas/i"],["/alterações ainda não salvas/i","/Alterações não salvas/i"]]};
const cssRule="\n/* Mensagens vazias nao reservam espaco; aria-live continua no DOM para estados reais. */\n.omr-group .status:empty,#scanModelStatus:empty,#economyPrintStatus:empty{margin:0;padding:0}\n";
const rawGit=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const git=(...args)=>rawGit(...args).trim();
const assert=(condition,message)=>{if(!condition)throw Error(message)};
try{
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  const ev=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert(ev.pull_request?.number===130&&ev.pull_request?.head?.ref==='feat/corretor-ux-ready-129','Only PR #130 can use the UX-only guard.');
 }
 git('merge-base','--is-ancestor',base,'HEAD');
 const diff=git('diff','--name-only',base,'HEAD','--').split('\n').filter(Boolean);
 assert(diff.length>0&&diff.every(p=>allowed.has(p)),'Forbidden product UX delta: '+diff.join(', '));
 assert(!git('diff','--name-only','HEAD','--'),'Tracked worktree modified');
 for(const [name,pairs] of Object.entries(transformations)){
  let expected=rawGit('show',base+':'+name);
  for(const [from,to] of pairs){
   assert(expected.split(from).length===2,'Missing or repeated UI wording anchor: '+from.slice(0,65));
   expected=expected.replace(from,to);
  }
  const actual=readFileSync(path.join(root,name),'utf8');
  assert(expected===actual,'Unexpected code/logic change outside exact UX copy substitutions in '+name);
 }
 const cssBase=rawGit('show',base+':plataforma/corretor-v2.css');
 const css=readFileSync(path.join(root,'plataforma/corretor-v2.css'),'utf8');
 assert(css===cssBase.trimEnd()+'\n'+cssRule,'CSS modified outside empty-message spacing rule');
 assert(readFileSync(path.join(root,'plataforma/corretor-v2.html'),'utf8').includes('Não use avaliações ou dados reais.'),
  'Synthetic laboratory warning cannot be removed');
 console.log('PR #130 strict copy-only scope PASS. No OMR, backend, data model, PDF or access change.');
}catch(e){console.error('Not UX-READY-01:',e.message);process.exitCode=1;}
