import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const workerSource = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`);
const worker = workerModule.default;
const diaryPage = await readFile(new URL("../../plataforma/diario-teste.html", import.meta.url), "utf8");
const apiStart = diaryPage.indexOf("async function api(");
const apiEnd = diaryPage.indexOf("\nconst WEEKDAY_NAMES=", apiStart);
assert.ok(apiStart >= 0 && apiEnd > apiStart, "não foi possível extrair o adaptador HTTP da interface");
const frontendApi = new Function("fetch", "AbortSignal", "location", "API", `return (${diaryPage.slice(apiStart, apiEnd)});`);

class MemoryD1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new MemoryD1Statement(this.database, this.sql, bindings);
  }

  all() {
    this.database.maybeFail(this.sql);
    return { results: this.database.sqlite.prepare(this.sql).all(...this.bindings), success: true };
  }

  first() {
    this.database.maybeFail(this.sql);
    return this.database.sqlite.prepare(this.sql).get(...this.bindings) ?? null;
  }

  run() {
    this.database.maybeFail(this.sql);
    const result = this.database.sqlite.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
    };
  }
}

class MemoryD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.failNextSchemaWrite = false;
    this.failNextPeriodWrite = false;
  }

  prepare(sql) {
    return new MemoryD1Statement(this, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map(statement => statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  maybeFail(sql) {
    if (this.failNextSchemaWrite && sql.includes("CREATE TABLE IF NOT EXISTS salta_diario_classes")) {
      this.failNextSchemaWrite = false;
      throw new Error("D1_ERROR: synthetic schema failure with private marker DO_NOT_LOG");
    }
    if (this.failNextPeriodWrite && sql.includes("INSERT INTO salta_diario_periods")) {
      this.failNextPeriodWrite = false;
      throw new Error("D1_ERROR: synthetic test failure with private marker DO_NOT_LOG");
    }
  }
}

const database = new MemoryD1();
const env = {
  DIARIO_DB: database,
  AUTH: {
    async fetch(request) {
      const authenticated = request.headers.get("Cookie") === "salta_test_session=valid";
      return Response.json({ authenticated }, { status: authenticated ? 200 : 401 });
    }
  }
};

function request(path, { method = "GET", body, authenticated = true } = {}) {
  const headers = new Headers({ Origin: "https://d4nny3l.github.io" });
  if (authenticated) headers.set("Cookie", "salta_test_session=valid");
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(`https://salta-stats.test/diario${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function jsonResponse(path, options) {
  const response = await worker.fetch(request(path, options), env);
  return { response, body: await response.json() };
}

test("períodos do Diário: autenticação, persistência, validação e falha do D1", async t => {
  await t.test("recusa acesso sem sessão antes de consultar o banco", async () => {
    const { response, body } = await jsonResponse("/bimestres?modelo=df&segmento=regular", { authenticated: false });
    assert.equal(response.status, 401);
    assert.match(body.error, /Acesso restrito/);
  });

  await t.test("falha ao inicializar o esquema retorna 503 com referência segura", async () => {
    const logs = [];
    const originalError = console.error;
    console.error = value => logs.push(String(value));
    database.failNextSchemaWrite = true;
    try {
      const { response, body } = await jsonResponse("/bimestres?modelo=df&segmento=regular");
      assert.equal(response.status, 503);
      assert.match(body.error, /temporariamente indisponível/);
      assert.equal(body.category, "database");
      assert.match(body.request_id, /^[0-9a-f-]{36}$/i);
    } finally {
      console.error = originalError;
    }
    assert.equal(logs.length, 1);
    assert.match(logs[0], /"category":"database"/);
    assert.doesNotMatch(logs[0], /DO_NOT_LOG|D1_ERROR/);
  });

  await t.test("salva período válido e lê o mesmo valor após nova requisição", async () => {
    const { response: saveResponse, body: saveBody } = await jsonResponse("/bimestres", {
      method: "PUT",
      body: { evaluation_system: "df", segment: "regular", period: 1, start_date: "2026-02-02", end_date: "2026-04-30" }
    });
    assert.equal(saveResponse.status, 200);
    assert.deepEqual(saveBody, { ok: true });

    const { response, body } = await jsonResponse("/bimestres?modelo=df&segmento=regular");
    assert.equal(response.status, 200);
    assert.deepEqual(body.bimestres.map(({ period, start_date, end_date }) => ({ period, start_date, end_date })), [
      { period: 1, start_date: "2026-02-02", end_date: "2026-04-30" }
    ]);
  });

  await t.test("rejeita data inexistente sem alterar o período salvo", async () => {
    const { response, body } = await jsonResponse("/bimestres", {
      method: "PUT",
      body: { evaluation_system: "df", segment: "regular", period: 1, start_date: "2026-02-30", end_date: "2026-04-30" }
    });
    assert.equal(response.status, 400);
    assert.match(body.error, /datas válidos/);

    const saved = await database.prepare("SELECT start_date,end_date FROM salta_diario_periods WHERE evaluation_system='df' AND segment='regular' AND period=1").first();
    assert.deepEqual({ ...saved }, { start_date: "2026-02-02", end_date: "2026-04-30" });
  });

  await t.test("atualiza um período sem alterar os demais", async () => {
    await jsonResponse("/bimestres", {
      method: "PUT",
      body: { evaluation_system: "df", segment: "regular", period: 2, start_date: "2026-05-01", end_date: "2026-07-31" }
    });
    const { response } = await jsonResponse("/bimestres", {
      method: "PUT",
      body: { evaluation_system: "df", segment: "regular", period: 1, start_date: "2026-02-02", end_date: "2026-04-29" }
    });
    assert.equal(response.status, 200);

    const rows = (await database.prepare("SELECT period,start_date,end_date FROM salta_diario_periods WHERE evaluation_system='df' AND segment='regular' ORDER BY period").all()).results;
    assert.deepEqual(rows.map(row => ({ ...row })), [
      { period: 1, start_date: "2026-02-02", end_date: "2026-04-29" },
      { period: 2, start_date: "2026-05-01", end_date: "2026-07-31" }
    ]);
  });

  await t.test("falha de banco retorna referência e registra somente metadados seguros", async () => {
    const logs = [];
    const originalError = console.error;
    console.error = value => logs.push(String(value));
    database.failNextPeriodWrite = true;
    try {
      const { response, body } = await jsonResponse("/bimestres", {
        method: "PUT",
        body: { evaluation_system: "df", segment: "regular", period: 3, start_date: "2026-08-01", end_date: "2026-10-31" }
      });
      assert.equal(response.status, 500);
      assert.match(body.error, /Não foi possível processar o Diário/);
      assert.equal(body.category, "database");
      assert.match(body.request_id, /^[0-9a-f-]{36}$/i);
      assert.equal(response.headers.get("X-Request-ID"), body.request_id);
      assert.equal(response.headers.get("Access-Control-Expose-Headers"), "X-Request-ID");
    } finally {
      console.error = originalError;
    }
    assert.equal(logs.length, 1);
    assert.match(logs[0], /"category":"database"/);
    assert.match(logs[0], /"request_id":"[0-9a-f-]{36}"/i);
    assert.doesNotMatch(logs[0], /DO_NOT_LOG|D1_ERROR|2026-08-01/);
  });
});

test("a interface interpreta os erros do Worker sem perder o status nem a referência", async t => {
  const location = { redirectedTo: null, replace(path) { this.redirectedTo = path; } };
  const callApi = response => frontendApi(async () => response, AbortSignal, location, "https://salta-stats.test/diario");

  await t.test("mostra categoria e identificador numa falha de banco", async () => {
    const requestId = "f410fd2f-3190-4d4f-b72d-1332936a81f2";
    const response = Response.json({ error: "Não foi possível processar o Diário. Tente novamente.", category: "database", request_id: requestId }, { status: 500, headers: { "X-Request-ID": requestId } });
    await assert.rejects(callApi(response)("/bimestres"), error => {
      assert.match(error.message, /falha no banco/);
      assert.match(error.message, new RegExp(requestId));
      return true;
    });
  });

  await t.test("mantém mensagem de validação sem referência técnica", async () => {
    const response = Response.json({ error: "Informe datas válidas." }, { status: 400 });
    await assert.rejects(callApi(response)("/bimestres"), error => {
      assert.equal(error.message, "Informe datas válidas.");
      assert.doesNotMatch(error.message, /Referência de suporte/);
      return true;
    });
  });

  await t.test("preserva a rota de redirecionamento para sessão expirada", async () => {
    const response = Response.json({ error: "Acesso restrito." }, { status: 401 });
    await assert.rejects(callApi(response)("/bimestres"), error => error.message === "Acesso restrito.");
    assert.equal(location.redirectedTo, "./professor.html");
  });
});
