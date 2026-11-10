import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { activeAdminModule, ADMIN_MODULES, renderAdminShell } from "../admin-shell.mjs";

test("menu central lista rotas administrativas com labels e grupos únicos", () => {
  assert.equal(ADMIN_MODULES.length, 8);
  assert.equal(new Set(ADMIN_MODULES.map(item => item.id)).size, ADMIN_MODULES.length);
  assert.deepEqual([...new Set(ADMIN_MODULES.map(item => item.group))], ["Menu principal", "Ferramentas acadêmicas", "Projetos e eventos"]);
  assert.ok(ADMIN_MODULES.every(item => item.href && item.icon && item.label));
});

test("resolve módulo ativo nas rotas profundas e na Mostra em modo administrativo", () => {
  assert.equal(activeAdminModule("/plataforma/professor.html"), "home");
  assert.equal(activeAdminModule("/plataforma/estatistica-individual.html"), "reports");
  assert.equal(activeAdminModule("/plataforma/estatistica-turma.html"), "reports");
  assert.equal(activeAdminModule("/plataforma/estatistica-acessos.html"), "reports");
  assert.equal(activeAdminModule("/plataforma/festival-consciencia-negra-admin.html"), "festival");
  assert.equal(activeAdminModule("/mostra-cultural.html", "?admin=1"), "show");
});

test("renderiza um único estado ativo e mantém o caminho de retorno correto", () => {
  const markup = renderAdminShell({ pathname: "/plataforma/estatistica-turma.html", active: "reports", platformHref: "./" });
  assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
  assert.match(markup, /href="\.\/professor\.html#inicio"/);
  assert.match(markup, /id="teacherShellToggle"[^>]+aria-controls="teacherShellSidebar"/);
  assert.match(markup, /id="teacherShellOverlay"/);
  assert.doesNotMatch(markup, /Sessão administrativa protegida/);
});

test("páginas textuais administrativas usam o shell central sem cópia do menu", async () => {
  const files = ["professor.html", "corretor-v2.html", "estatistica.html", "estatistica-individual.html", "estatistica-turma.html", "estatistica-acessos.html", "mensagens.html", "fechamento-bimestre.html", "festival-consciencia-negra-admin.html"];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /admin-shell\.mjs\?v=20261110ux1/, file);
    assert.doesNotMatch(source, /<aside class="teacher-shell-sidebar"/, file);
  }
  const mostra = await readFile(new URL("../../mostra-cultural.html", import.meta.url), "utf8");
  assert.match(mostra, /admin-shell\.mjs\?v=20261110ux1/);
});

test("formulário do Corretor esconde controles que não se aplicam ao modo escolhido", async () => {
  const source = await readFile(new URL("../corretor-v2.html", import.meta.url), "utf8");
  assert.match(source, /data-field-group="embedded"/);
  assert.match(source, /data-field-group="identity-code"/);
  assert.match(source, /data-field-group="cdu"/);
  assert.doesNotMatch(source, /id="assessmentValue"/);
  assert.equal((source.match(/id="sectionManager"/g) || []).length, 1);
  assert.equal((source.match(/id="studentCodeBatch"/g) || []).length, 1);
  assert.equal((source.match(/id="printBatch"/g) || []).length, 1);
  assert.match(source, /id="printCard"[^>]*class="button-primary"/);
  assert.doesNotMatch(source, /data-view="(?:minhas|revisoes|modelos|cabecalhos|analise)"/);
  assert.match(source, /aria-label="Exportações técnicas avançadas"/);
});
