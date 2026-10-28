const AUTH_API_URL = "https://salta-auth.dannyel-moises.workers.dev";
const ALLOWED_ORIGINS = new Set(["https://d4nny3l.github.io", "http://localhost:5500", "http://127.0.0.1:5500"]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (ALLOWED_ORIGINS.has(origin)) { headers["Access-Control-Allow-Origin"] = origin; headers["Access-Control-Allow-Credentials"] = "true"; }
  return headers;
}

function json(data, request, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request)
    }
  });
}

async function proxyAuth(request, env, url) {
  const route = url.pathname.slice("/auth".length);
  if (!["/login", "/session", "/logout"].includes(route)) {
    return json({ ok: false, error: "Rota de autenticação não encontrada." }, request, 404);
  }
  const origin = request.headers.get("Origin") || "";
  if (request.method !== "GET" && !ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, error: "Origem não autorizada." }, request, 403);
  }
  if (!env.AUTH) return json({ ok: false, error: "Serviço de autenticação indisponível." }, request, 503);
  const target = new URL("https://salta-auth" + route);
  const upstream = new Request(target, request);
  const response = await env.AUTH.fetch(upstream);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function authenticated(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const cookie = request.headers.get("Cookie") || "";
  if (!bearer && !cookie) return false;

  // Validate browser sessions with the original HttpOnly cookie. The Auth Worker
  // parses both the current __Host cookie and the legacy cookie itself.
  const authHeaders = new Headers();
  if (bearer) authHeaders.set("Authorization", "Bearer " + bearer);
  else authHeaders.set("Cookie", cookie);

  const authRequest = new Request("https://salta-auth/session", {
    method: "GET",
    headers: authHeaders
  });

  const response = env.AUTH
    ? await env.AUTH.fetch(authRequest)
    : await fetch(AUTH_API_URL + "/session", {
        method: "GET",
        headers: authHeaders,
        cache: "no-store"
      });

  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return data.authenticated === true;
}

const FESTIVAL_EVENT_ID = "festival-consciencia-negra";

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomFestivalCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "SALTA-" + [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function festivalJsonBody(request) {
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return Promise.resolve({ error: "Envie os dados em JSON." });
  return request.json().catch(() => null);
}

async function ensureFestivalSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_config (event_id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_evaluators (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, evaluator_id INTEGER NOT NULL, entry_key TEXT NOT NULL, entry_name TEXT NOT NULL, answers_json TEXT NOT NULL, score REAL NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, removed_at TEXT, removal_reason TEXT, UNIQUE(event_id, evaluator_id, entry_key))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_attempts (ip_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_salta_festival_submissions_event ON salta_festival_submissions(event_id, created_at DESC)").run();
}

async function festivalRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256Hex("salta-festival:" + ip);
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / 600) * 600;
  await env.DB.prepare(
    "INSERT INTO salta_festival_attempts (ip_hash, window_start, attempts) VALUES (?, ?, 1) " +
    "ON CONFLICT(ip_hash) DO UPDATE SET " +
    "attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END, " +
    "window_start = excluded.window_start"
  ).bind(key, window).run();
  const row = await env.DB.prepare("SELECT attempts FROM salta_festival_attempts WHERE ip_hash = ?").bind(key).first();
  return Number(row?.attempts || 0) > 12;
}

function validateFestivalConfig(value) {
  const title = trimLimited(value?.title, 120);
  const description = trimLimited(value?.description, 1200);
  const entries = Array.isArray(value?.entries) ? value.entries.map(item => trimLimited(item, 140)).filter(Boolean) : [];
  const criteria = Array.isArray(value?.criteria) ? value.criteria.slice(0, 20).map((item, index) => {
    const id = trimLimited(item?.id, 40) || "criterio-" + (index + 1);
    const name = trimLimited(item?.name, 100);
    const detail = trimLimited(item?.description, 500);
    const levels = Array.isArray(item?.levels) ? item.levels.slice(0, 10).map(level => ({
      label: trimLimited(level?.label, 60),
      value: Number(level?.value)
    })).filter(level => level.label && Number.isFinite(level.value) && level.value >= 0) : [];
    return { id, name, description: detail, levels };
  }) : [];
  if (!title || !entries.length || !criteria.length || criteria.some(item => !item.name || !item.levels.length)) {
    return { error: "Informe título, ao menos um trabalho/turma e critérios com níveis de nota." };
  }
  const ids = new Set();
  for (const criterion of criteria) {
    if (ids.has(criterion.id)) return { error: "Cada critério precisa de um identificador próprio." };
    ids.add(criterion.id);
    const values = new Set();
    for (const level of criterion.levels) {
      if (values.has(level.value)) return { error: "Os níveis de cada critério devem ter notas diferentes." };
      values.add(level.value);
    }
  }
  if (new Set(entries.map(item => item.toLocaleLowerCase("pt-BR"))).size !== entries.length) {
    return { error: "Os trabalhos/turmas da lista não podem se repetir." };
  }
  return { value: { title, description, entries, criteria, active: value?.active !== false } };
}

async function getFestivalConfig(env) {
  const row = await env.DB.prepare("SELECT config_json, updated_at FROM salta_festival_config WHERE event_id = ? LIMIT 1").bind(FESTIVAL_EVENT_ID).first();
  let config = null;
  try { config = row ? JSON.parse(row.config_json) : null; } catch { config = null; }
  return { config, updatedAt: row?.updated_at || null };
}

async function findFestivalEvaluator(env, code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!/^SALTA-[A-F0-9]{48}$/.test(clean)) return null;
  return env.DB.prepare("SELECT id, display_name FROM salta_festival_evaluators WHERE event_id = ? AND code_hash = ? AND active = 1 LIMIT 1")
    .bind(FESTIVAL_EVENT_ID, await sha256Hex(clean)).first();
}

async function handleFestivalRoute(request, env, url) {
  await ensureFestivalSchema(env);
  const path = url.pathname;
  if (path === "/festival/public/config" && request.method === "GET") {
    const { config, updatedAt } = await getFestivalConfig(env);
    return json({ configured: !!config, config: config ? { ...config, criteria: config.criteria, entries: config.entries } : null, updatedAt }, request);
  }
  if ((path === "/festival/public/verify-code" || path === "/festival/public/submissions") && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    if (await festivalRateLimit(request, env)) {
      const response = json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, request, 429);
      response.headers.set("Retry-After", "600");
      return response;
    }
    const evaluator = await findFestivalEvaluator(env, payload.code);
    if (!evaluator) return json({ error: "Código inválido ou revogado." }, request, 401);
    if (path.endsWith("verify-code")) return json({ ok: true, avaliador: evaluator.display_name }, request);

    const { config } = await getFestivalConfig(env);
    if (!config?.active) return json({ error: "As avaliações ainda não estão abertas." }, request, 409);
    const entry = config.entries.find(item => item === payload.entry);
    if (!entry) return json({ error: "Selecione um trabalho ou turma válido." }, request, 400);
    const answers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
    const expected = config.criteria.map(criterion => criterion.id);
    if (Object.keys(answers).length !== expected.length || expected.some(id => !Object.prototype.hasOwnProperty.call(answers, id))) {
      return json({ error: "Responda a todos os critérios antes de enviar." }, request, 400);
    }
    let score = 0;
    const normalized = {};
    for (const criterion of config.criteria) {
      const value = Number(answers[criterion.id]);
      if (!criterion.levels.some(level => level.value === value)) return json({ error: "Uma das notas não corresponde aos níveis permitidos." }, request, 400);
      normalized[criterion.id] = value;
      score += value;
    }
    const notes = trimLimited(payload.notes, 2000);
    try {
      const result = await env.DB.prepare(
        "INSERT INTO salta_festival_submissions (event_id, evaluator_id, entry_key, entry_name, answers_json, score, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(FESTIVAL_EVENT_ID, evaluator.id, entry.toLocaleLowerCase("pt-BR"), entry, JSON.stringify(normalized), Math.round(score * 100) / 100, notes).run();
      return json({ ok: true, id: result.meta?.last_row_id || null, score: Math.round(score * 100) / 100 }, request, 201);
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || error))) return json({ error: "Este código já enviou uma avaliação para esse trabalho ou turma." }, request, 409);
      throw error;
    }
  }

  if (!path.startsWith("/festival/admin/")) return json({ error: "Rota não encontrada." }, request, 404);
  const origin = request.headers.get("Origin") || "";
  if (request.method !== "GET" && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origem não autorizada." }, request, 403);
  if (!(await authenticated(request, env))) return json({ error: "Acesso restrito. Entre na Área do Professor." }, request, 401);
  if (path === "/festival/admin/data" && request.method === "GET") {
    const [{ config, updatedAt }, evaluators, submissions, removed] = await Promise.all([
      getFestivalConfig(env),
      env.DB.prepare("SELECT id, display_name, active, created_at, revoked_at FROM salta_festival_evaluators WHERE event_id = ? ORDER BY id DESC").bind(FESTIVAL_EVENT_ID).all(),
      env.DB.prepare("SELECT s.id, s.entry_name, s.answers_json, s.score, s.notes, s.created_at, e.display_name AS evaluator FROM salta_festival_submissions s JOIN salta_festival_evaluators e ON e.id = s.evaluator_id WHERE s.event_id = ? AND s.removed_at IS NULL ORDER BY s.created_at DESC").bind(FESTIVAL_EVENT_ID).all(),
      env.DB.prepare("SELECT s.id, s.entry_name, s.score, s.notes, s.created_at, s.removed_at, s.removal_reason, e.display_name AS evaluator FROM salta_festival_submissions s JOIN salta_festival_evaluators e ON e.id = s.evaluator_id WHERE s.event_id = ? AND s.removed_at IS NOT NULL ORDER BY s.removed_at DESC").bind(FESTIVAL_EVENT_ID).all()
    ]);
    return json({ config, updatedAt, avaliadores: evaluators.results || [], avaliacoes: (submissions.results || []).map(row => {
      let respostas = {};
      try { respostas = JSON.parse(row.answers_json) || {}; } catch { respostas = {}; }
      return { ...row, respostas };
    }), removidas: removed.results || [] }, request);
  }
  if (path === "/festival/admin/config" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    const validated = validateFestivalConfig(payload);
    if (validated.error) return json({ error: validated.error }, request, 400);
    await env.DB.prepare("INSERT INTO salta_festival_config (event_id, config_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(event_id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP")
      .bind(FESTIVAL_EVENT_ID, JSON.stringify(validated.value)).run();
    return json({ ok: true }, request);
  }
  if (path === "/festival/admin/codes" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    const displayName = trimLimited(payload?.display_name, 100);
    if (!displayName) return json({ error: "Informe o nome do avaliador." }, request, 400);
    const code = randomFestivalCode();
    const result = await env.DB.prepare("INSERT INTO salta_festival_evaluators (event_id, code_hash, display_name) VALUES (?, ?, ?)")
      .bind(FESTIVAL_EVENT_ID, await sha256Hex(code), displayName).run();
    return json({ ok: true, id: result.meta?.last_row_id || null, display_name: displayName, code }, request, 201);
  }
  const revokeMatch = path.match(/^\/festival\/admin\/codes\/(\d+)\/revoke$/);
  if (revokeMatch && request.method === "POST") {
    const result = await env.DB.prepare("UPDATE salta_festival_evaluators SET active = 0, revoked_at = CURRENT_TIMESTAMP WHERE event_id = ? AND id = ? AND active = 1")
      .bind(FESTIVAL_EVENT_ID, Number(revokeMatch[1])).run();
    return json({ ok: true, revoked: Number(result.meta?.changes || 0) > 0 }, request);
  }
  const removeMatch = path.match(/^\/festival\/admin\/submissions\/(\d+)\/remove$/);
  if (removeMatch && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    const reason = trimLimited(payload?.reason, 500);
    if (!reason) return json({ error: "Informe o motivo da remoção." }, request, 400);
    const result = await env.DB.prepare("UPDATE salta_festival_submissions SET removed_at = CURRENT_TIMESTAMP, removal_reason = ? WHERE event_id = ? AND id = ? AND removed_at IS NULL")
      .bind(reason, FESTIVAL_EVENT_ID, Number(removeMatch[1])).run();
    return json({ ok: true, removed: Number(result.meta?.changes || 0) > 0 }, request);
  }
  return json({ error: "Método ou rota de administração não permitidos." }, request, 405);
}
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function numericValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(typeof value === "string" ? value.trim().replace(",", ".") : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values) {
  const valid = values.map(numericValue).filter(value => value !== null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function bCount(turma) {
  return String(turma || "").toUpperCase().includes("EJA") ? 2 : 4;
}

function inferTurmaRule(turma, assessmentGroups = []) {
  // D1 armazena as avaliações de cada período; o modelo Bloco identifica Goiás.
  // DF usa mínimo 5, Goiás 6 e EJA 6 em seus dois períodos.
  const eja = String(turma || "").toUpperCase().includes("EJA");
  const assessmentSets = assessmentGroups.flatMap(raw =>
    Array.isArray(raw) ? [raw] : String(raw || "").split("|||")
  );
  const hasBloco = assessmentSets.some(raw =>
    parseArray(raw).some(av => /\bbloco\b/i.test(String(av?.nome || "")))
  );
  const rede = eja ? "EJA" : (hasBloco ? "GO" : "DF");
  const mediaMinima = eja || hasBloco ? 6 : 5;
  return {
    rede,
    media_minima: mediaMinima,
    modelo_avaliativo: eja ? "EJA_2_BIMESTRES" : (hasBloco ? "GO_BLOCO" : "DF_SEM_BLOCO")
  };
}

function turmaRulePayload(turma, config) {
  const quantidadeBimestres = bCount(turma);
  const mediaMinima = numericValue(config?.media_minima) ??
    (String(turma || "").toUpperCase().includes("EJA") ? 6 : 5);
  return {
    turma: String(turma || "").trim(),
    rede: config?.rede || (String(turma || "").toUpperCase().includes("EJA") ? "EJA" : "DF"),
    modeloAvaliativo: config?.modelo_avaliativo || "—",
    quantidadeBimestres,
    mediaMinima,
    mediaMinimaBimestral: mediaMinima,
    mediaMinimaFinal: mediaMinima,
    somaMinimaFinal: mediaMinima * quantidadeBimestres
  };
}

async function ensureTurmaConfig(env, onlyTurma = "") {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS turma_config (" +
    "turma TEXT PRIMARY KEY, " +
    "rede TEXT NOT NULL, " +
    "media_minima REAL NOT NULL, " +
    "modelo_avaliativo TEXT NOT NULL, " +
    "ativa INTEGER NOT NULL DEFAULT 1, " +
    "atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP)"
  ).run();

  let query =
    "SELECT TRIM(turma) AS turma, " +
    "GROUP_CONCAT(bimestre1_avaliacoes, '|||') AS bimestre1, " +
    "GROUP_CONCAT(bimestre2_avaliacoes, '|||') AS bimestre2, " +
    "GROUP_CONCAT(bimestre3_avaliacoes, '|||') AS bimestre3, " +
    "GROUP_CONCAT(bimestre4_avaliacoes, '|||') AS bimestre4 " +
    "FROM alunos " +
    "WHERE turma IS NOT NULL AND TRIM(turma) <> '' ";
  const binds = [];
  if (onlyTurma) {
    query += "AND TRIM(turma) = ? ";
    binds.push(onlyTurma);
  }
  query += "GROUP BY TRIM(turma)";
  const statement = env.DB.prepare(query);
  const turmas = await (binds.length ? statement.bind(...binds).all() : statement.all());

  for (const row of (turmas.results || [])) {
    const turma = String(row.turma || "").trim();
    if (!turma) continue;
    // A configuração importada pelo gerar_banco.py é a fonte oficial.
    // Só inferimos a regra para turmas antigas que ainda não têm T63 no D1.
    const atual = await env.DB.prepare(
      "SELECT media_minima FROM turma_config WHERE turma = ? LIMIT 1"
    ).bind(turma).first();
    if (numericValue(atual?.media_minima) !== null) continue;

    const rule = inferTurmaRule(turma, [row.bimestre1, row.bimestre2, row.bimestre3, row.bimestre4]);

    await env.DB.prepare(
      "INSERT INTO turma_config (turma, rede, media_minima, modelo_avaliativo) " +
      "VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(turma) DO NOTHING"
    ).bind(turma, rule.rede, rule.media_minima, rule.modelo_avaliativo).run();
  }
}

async function turmaConfig(env, turma) {
  await ensureTurmaConfig(env, turma);
  return env.DB.prepare(
    "SELECT turma, rede, media_minima, modelo_avaliativo, atualizado_em " +
    "FROM turma_config WHERE turma = ? LIMIT 1"
  ).bind(turma).first();
}

function bimestreVigenteDaTurma(rows) {
  const maxBimestres = Math.max(...rows.map(r => bCount(r.turma)), 1);
  for (let i = 1; i <= maxBimestres; i++) {
    if (rows.some(row => String(row["bimestre" + i + "_status"] || "").toLowerCase() === "andamento")) return i;
  }
  for (let i = maxBimestres; i >= 1; i--) {
    if (rows.some(row => numericValue(row["bimestre" + i + "_media"]) !== null ||
      String(row["bimestre" + i + "_status"] || "").toLowerCase() === "concluido")) return i;
  }
  return 1;
}

function resolveReportPeriod(requested, vigente) {
  const value = String(requested || "vigente").trim().toLowerCase();
  if (value === "vigente") return { value, bimestre: vigente, final: false };
  if (value === "final") return { value, bimestre: null, final: true };
  const bimestre = Number(value);
  if (Number.isInteger(bimestre) && bimestre >= 1 && bimestre <= 4) {
    return { value: String(bimestre), bimestre, final: false };
  }
  return null;
}

function finalAverage(medias, quantidadeBimestres) {
  const lancadas = medias.filter(value => value !== null);
  if (!lancadas.length) return null;
  return medias.reduce((sum, value) => sum + (value === null ? 0 : value), 0) / quantidadeBimestres;
}

function selectedVistos(vistos, periodo) {
  if (periodo.final) {
    const lancados = vistos.filter(value => value !== null);
    return lancados.length ? lancados.reduce((sum, value) => sum + value, 0) : null;
  }
  return vistos[periodo.bimestre - 1] ?? null;
}

function reportPeriodLabel(value, bimestre, vigenteSet) {
  if (value === "final") return "Média final";
  if (value === "vigente") {
    return vigenteSet?.length === 1
      ? vigenteSet[0] + "º bimestre vigente"
      : "Bimestre vigente de cada turma";
  }
  return bimestre + "º bimestre";
}


function buildTurmaStats(rows, config, requestedPeriod = "vigente") {
  const vigente = bimestreVigenteDaTurma(rows);
  const turma = String(config?.turma || rows[0]?.turma || "").trim();
  const limite = Number(config?.media_minima ?? 6);
  const quantidadeBimestres = bCount(turma);
  const periodo = resolveReportPeriod(requestedPeriod, vigente);
  if (!periodo) throw new Error("Período de análise inválido.");

  const alunos = rows.map(row => {
    const medias = [];
    const vistosPorBimestre = [];
    const avaliacoesPorBimestre = {};

    for (let i = 1; i <= quantidadeBimestres; i++) {
      medias.push(numericValue(row["bimestre" + i + "_media"]));
      vistosPorBimestre.push(numericValue(row["bimestre" + i + "_vistos"]));
      avaliacoesPorBimestre[i] = parseArray(row["bimestre" + i + "_avaliacoes"]);
    }

    const mediaSelecionada = periodo.final
      ? finalAverage(medias, quantidadeBimestres)
      : medias[periodo.bimestre - 1] ?? null;

    return {
      codigo: row.codigo,
      nome: row.nome,
      turma: row.turma,
      medias,
      mediaSelecionada,
      vistos: selectedVistos(vistosPorBimestre, periodo),
      avaliacoesPorBimestre
    };
  });

  const mediasSelecionadas = alunos.map(a => a.mediaSelecionada).filter(value => value !== null);
  const vistos = alunos.map(a => a.vistos).filter(value => value !== null);

  const distribuicao = [
    { faixa: "0,0–2,9", quantidade: 0 },
    { faixa: "3,0–4,9", quantidade: 0 },
    { faixa: "5,0–6,9", quantidade: 0 },
    { faixa: "7,0–8,9", quantidade: 0 },
    { faixa: "9,0–10,0", quantidade: 0 }
  ];

  for (const value of mediasSelecionadas) {
    if (value < 3) distribuicao[0].quantidade++;
    else if (value < 5) distribuicao[1].quantidade++;
    else if (value < 7) distribuicao[2].quantidade++;
    else if (value < 9) distribuicao[3].quantidade++;
    else distribuicao[4].quantidade++;
  }

  const desempenhoAvaliacoes = [];
  const bimestresDasAvaliacoes = periodo.final
    ? Array.from({ length: quantidadeBimestres }, (_, index) => index + 1)
    : [periodo.bimestre];
  for (const bim of bimestresDasAvaliacoes) {
    const mapa = new Map();
    for (const aluno of alunos) {
      for (const av of (aluno.avaliacoesPorBimestre[bim] || [])) {
        const nome = String(av?.nome || "Avaliação").trim();
        const pontos = Number(av?.pontos);
        if (!Number.isFinite(pontos)) continue;
        if (!mapa.has(nome)) mapa.set(nome, []);
        mapa.get(nome).push(pontos);
      }
    }
    for (const [nome, values] of mapa.entries()) {
      desempenhoAvaliacoes.push({
        bimestre: bim,
        avaliacao: nome,
        media: round1(mean(values)),
        quantidade: values.length
      });
    }
  }

  const evolucao = [];
  for (let i = 1; i <= quantidadeBimestres; i++) {
    const bimValues = alunos.map(a => a.medias[i - 1]).filter(Number.isFinite);
    evolucao.push({
      bimestre: i,
      media: round1(mean(bimValues)),
      alunosComMedia: bimValues.length
    });
  }

  const acompanhamento = alunos
    .filter(a => a.mediaSelecionada !== null && a.mediaSelecionada < limite)
    .sort((a, b) => a.mediaSelecionada - b.mediaSelecionada)
    .map(a => ({
      codigo: a.codigo,
      nome: a.nome,
      media: round1(a.mediaSelecionada),
      vistos: round1(a.vistos)
    }));

  const porAluno = [...alunos]
    .sort((a, b) => {
      const mediaA = Number.isFinite(a.mediaSelecionada) ? a.mediaSelecionada : -Infinity;
      const mediaB = Number.isFinite(b.mediaSelecionada) ? b.mediaSelecionada : -Infinity;
      return mediaB - mediaA || String(a.nome).localeCompare(String(b.nome), "pt-BR");
    })
    .map(a => ({
      codigo: a.codigo,
      nome: a.nome,
      media: Number.isFinite(a.mediaSelecionada) ? round1(a.mediaSelecionada) : null,
      vistos: Number.isFinite(a.vistos) ? round1(a.vistos) : null
    }));

  return {
    turma,
    rede: config?.rede || "GO",
    segmento: quantidadeBimestres === 2 ? "EJA" : "REGULAR",
    quantidadeBimestres,
    bimestreVigente: vigente,
    periodo: periodo.value,
    bimestreSelecionado: periodo.bimestre,
    rotuloPeriodo: reportPeriodLabel(periodo.value, periodo.bimestre, [vigente]),
    detalhePeriodo: periodo.final
      ? "Média final calculada pela soma das médias bimestrais dividida pelos " + quantidadeBimestres + " períodos do segmento."
      : "Médias do " + periodo.bimestre + "º bimestre.",
    mediaMinima: limite,
    mediaMinimaBimestral: limite,
    mediaMinimaFinal: limite,
    somaMinimaFinal: limite * quantidadeBimestres,
    modeloAvaliativo: config?.modelo_avaliativo || "—",
    quantidadeAlunos: alunos.length,
    alunosComMedia: mediasSelecionadas.length,
    mediaTurma: round1(mean(mediasSelecionadas)),
    maiorMedia: mediasSelecionadas.length ? round1(Math.max(...mediasSelecionadas)) : null,
    menorMedia: mediasSelecionadas.length ? round1(Math.min(...mediasSelecionadas)) : null,
    mediaVistos: round1(mean(vistos)),
    vistosAcumulados: periodo.final,
    acimaOuIgualMedia: mediasSelecionadas.filter(v => v >= limite).length,
    abaixoMedia: mediasSelecionadas.filter(v => v < limite).length,
    distribuicao,
    desempenhoAvaliacoes,
    evolucao,
    acompanhamento,
    porAluno
  };
}


function buildGlobalStats(rows, configs, requestedPeriod = "vigente") {
  const periodoSolicitado = String(requestedPeriod || "vigente").trim().toLowerCase();
  if (!(["vigente", "final", "1", "2", "3", "4"].includes(periodoSolicitado))) {
    throw new Error("Período de análise inválido.");
  }
  const configMap = new Map(configs.map(c => [String(c.turma).trim(), c]));
  const grupos = new Map();

  for (const row of rows) {
    const turma = String(row.turma || "").trim();
    if (!grupos.has(turma)) grupos.set(turma, []);
    grupos.get(turma).push(row);
  }

  const alunos = [];

  for (const [turma, turmaRows] of grupos.entries()) {
    const config = configMap.get(turma) || {
      turma,
      ...inferTurmaRule(turma)
    };

    const vigente = bimestreVigenteDaTurma(turmaRows);
    const periodo = resolveReportPeriod(periodoSolicitado, vigente);
    const quantidadeBimestres = bCount(turma);

    for (const row of turmaRows) {
      const medias = Array.from({ length: quantidadeBimestres }, (_, index) =>
        numericValue(row["bimestre" + (index + 1) + "_media"]));
      const vistosPorBimestre = Array.from({ length: quantidadeBimestres }, (_, index) =>
        numericValue(row["bimestre" + (index + 1) + "_vistos"]));
      const mediaSelecionada = periodo.final
        ? finalAverage(medias, quantidadeBimestres)
        : medias[periodo.bimestre - 1] ?? null;

      alunos.push({
        codigo: row.codigo,
        nome: row.nome,
        turma,
        rede: config.rede,
        mediaMinima: Number(config.media_minima),
        media: mediaSelecionada,
        vistos: selectedVistos(vistosPorBimestre, periodo),
        bimestreVigente: vigente
      });
    }
  }

  const comMedia = alunos.filter(a => Number.isFinite(a.media));
  const mediaGlobal = mean(comMedia.map(a => a.media));
  const mediaVistos = mean(alunos.map(a => a.vistos).filter(Number.isFinite));
  const acima = comMedia.filter(a => a.media >= a.mediaMinima);
  const abaixo = comMedia.filter(a => a.media < a.mediaMinima);

  const melhores = [...comMedia]
    .sort((a,b) => b.media - a.media || String(a.nome).localeCompare(String(b.nome), "pt-BR"))
    .slice(0,5);

  const piores = [...comMedia]
    .sort((a,b) => a.media - b.media || String(a.nome).localeCompare(String(b.nome), "pt-BR"))
    .slice(0,5);

  const faixas = [
    { faixa:"0,0–2,9", quantidade:0 },
    { faixa:"3,0–4,9", quantidade:0 },
    { faixa:"5,0–6,9", quantidade:0 },
    { faixa:"7,0–8,9", quantidade:0 },
    { faixa:"9,0–10,0", quantidade:0 }
  ];
  for (const a of comMedia) {
    if (a.media < 3) faixas[0].quantidade++;
    else if (a.media < 5) faixas[1].quantidade++;
    else if (a.media < 7) faixas[2].quantidade++;
    else if (a.media < 9) faixas[3].quantidade++;
    else faixas[4].quantidade++;
  }

  const turmas = [];
  for (const [turma, lista] of grupos.entries()) {
    const cfg = configMap.get(turma) || { turma, ...inferTurmaRule(turma) };
    const medias = alunos.filter(a => a.turma === turma).map(a => a.media).filter(Number.isFinite);
    const vigente = bimestreVigenteDaTurma(lista);
    const limite = Number(cfg.media_minima ?? 6);
    const quantidadeBimestres = bCount(turma);

    turmas.push({
      turma,
      bimestreVigente: vigente,
      periodo: periodoSolicitado,
      rede: cfg.rede || "GO",
      mediaMinima: limite,
      mediaMinimaBimestral: limite,
      mediaMinimaFinal: limite,
      somaMinimaFinal: limite * quantidadeBimestres,
      quantidadeBimestres,
      alunos: lista.length,
      alunosComMedia: medias.length,
      media: round1(mean(medias)),
      maiorMedia: medias.length ? round1(Math.max(...medias)) : null,
      menorMedia: medias.length ? round1(Math.min(...medias)) : null,
      acimaOuIgual: medias.filter(v => v >= limite).length,
      abaixo: medias.filter(v => v < limite).length
    });
  }

  turmas.sort((a,b) => (b.media ?? -Infinity) - (a.media ?? -Infinity) ||
    String(a.turma).localeCompare(String(b.turma), "pt-BR"));

  const bimestresVigentes = [...new Set(turmas.map(t => t.bimestreVigente))].sort((a,b) => a-b);
  const bimestreSelecionado = periodoSolicitado === "vigente" && bimestresVigentes.length === 1
    ? bimestresVigentes[0]
    : (periodoSolicitado === "vigente" ? null : Number(periodoSolicitado) || null);

  return {
    periodo: periodoSolicitado,
    bimestreSelecionado,
    rotuloPeriodo: reportPeriodLabel(periodoSolicitado, bimestreSelecionado, bimestresVigentes),
    detalhePeriodo: periodoSolicitado === "final"
      ? "Soma das médias bimestrais dividida pelo total de períodos do segmento de ensino."
      : periodoSolicitado === "vigente"
        ? "Considera o bimestre vigente de cada turma."
        : "Médias do " + periodoSolicitado + "º bimestre.",
    bimestresVigentes,
    vistosAcumulados: periodoSolicitado === "final",
    quantidadeAlunos: alunos.length,
    alunosComMedia: comMedia.length,
    mediaGlobal: round1(mediaGlobal),
    mediaVistos: round1(mediaVistos),
    acimaOuIgualMedia: acima.length,
    abaixoMedia: abaixo.length,
    distribuicao: faixas,
    alunos: alunos.map(a => ({
      codigo: a.codigo,
      nome: a.nome,
      turma: a.turma,
      rede: a.rede,
      bimestreVigente: a.bimestreVigente,
      mediaMinima: a.mediaMinima,
      media: Number.isFinite(a.media) ? round1(a.media) : null,
      vistos: Number.isFinite(a.vistos) ? round1(a.vistos) : null
    })),
    melhores: melhores.map(a => ({
      codigo:a.codigo, nome:a.nome, turma:a.turma, rede:a.rede,
      bimestreVigente:a.bimestreVigente, media:round1(a.media), vistos:round1(a.vistos)
    })),
    piores: piores.map(a => ({
      codigo:a.codigo, nome:a.nome, turma:a.turma, rede:a.rede,
      bimestreVigente:a.bimestreVigente, media:round1(a.media), vistos:round1(a.vistos)
    })),
    turmas
  };
}



const COMMS_MAX_TITLE = 100;
const COMMS_MAX_BODY = 1500;
async function ensureCommsSchema(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS salta_comms_messages (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
    "kind TEXT NOT NULL, " +
    "scope TEXT NOT NULL, " +
    "turma TEXT, " +
    "student_code TEXT, " +
    "sender_type TEXT NOT NULL, " +
    "sender_name TEXT NOT NULL, " +
    "title TEXT NOT NULL, " +
    "body TEXT NOT NULL, " +
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
    "active INTEGER NOT NULL DEFAULT 1, " +
    "student_read_at TEXT, " +
    "teacher_read_at TEXT)"
  ).run();

  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_salta_comms_student " +
    "ON salta_comms_messages(student_code, kind, created_at)"
  ).run();

  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_salta_comms_scope " +
    "ON salta_comms_messages(scope, turma, active, created_at)"
  ).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_comms_announcement_reads (announcement_id INTEGER NOT NULL, student_code TEXT NOT NULL, read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (announcement_id, student_code))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_student_access_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_code TEXT NOT NULL, accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_salta_student_access_time ON salta_student_access_logs(accessed_at DESC)").run();
}

function validStudentCode(value) {
  return /^2026[A-Z]{1,4}$/.test(String(value || "").trim().toUpperCase());
}

function trimLimited(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function ensurePeriodClosureSchema(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS salta_period_closures (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
    "academic_year INTEGER NOT NULL, " +
    "calendar_period INTEGER NOT NULL, " +
    "student_count INTEGER NOT NULL DEFAULT 0, " +
    "activity_count INTEGER NOT NULL DEFAULT 0, " +
    "students_with_grade INTEGER NOT NULL DEFAULT 0, " +
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
    "status TEXT NOT NULL DEFAULT 'complete')"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS salta_period_closure_students (" +
    "closure_id INTEGER NOT NULL, " +
    "student_code TEXT NOT NULL, " +
    "student_name TEXT NOT NULL, " +
    "turma TEXT NOT NULL, " +
    "segment TEXT NOT NULL, " +
    "calendar_period INTEGER NOT NULL, " +
    "segment_period INTEGER NOT NULL, " +
    "period_status TEXT, " +
    "media REAL, " +
    "vistos REAL, " +
    "assessments_json TEXT NOT NULL DEFAULT '[]', " +
    "source_updated_at TEXT, " +
    "PRIMARY KEY (closure_id, student_code))"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_salta_period_closures_year_period " +
    "ON salta_period_closures(academic_year, calendar_period, created_at DESC)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_salta_period_closure_students_code " +
    "ON salta_period_closure_students(student_code, closure_id)"
  ).run();
}

function closurePeriodFields(calendarPeriod) {
  const ejaPeriod = calendarPeriod === 1 || calendarPeriod === 3 ? 1 : 2;
  const regular = "bimestre" + calendarPeriod + "_";
  const eja = "bimestre" + ejaPeriod + "_";
  const field = suffix =>
    "CASE WHEN UPPER(COALESCE(turma, '')) LIKE '%EJA%' THEN " + eja + suffix +
    " ELSE " + regular + suffix + " END";
  return { ejaPeriod, field };
}

async function periodClosureSource(env, calendarPeriod) {
  const { ejaPeriod, field } = closurePeriodFields(calendarPeriod);
  const result = await env.DB.prepare(
    "SELECT codigo, nome, TRIM(turma) AS turma, ultima_atualizacao, " +
    field("status") + " AS period_status, " +
    field("media") + " AS media, " +
    field("vistos") + " AS vistos, " +
    field("avaliacoes") + " AS avaliacoes " +
    "FROM alunos WHERE turma IS NOT NULL AND TRIM(turma) <> '' " +
    "ORDER BY TRIM(turma), nome"
  ).all();
  const rows = result.results || [];
  const classes = new Map();
  let activityCount = 0;
  let studentsWithGrade = 0;
  for (const row of rows) {
    const turma = String(row.turma || "").trim();
    const assessments = parseArray(row.avaliacoes);
    activityCount += assessments.length;
    if (numericValue(row.media) !== null) studentsWithGrade++;
    if (!classes.has(turma)) classes.set(turma, { turma, alunos: 0, atividades: 0, comMedia: 0 });
    const group = classes.get(turma);
    group.alunos++;
    group.atividades += assessments.length;
    if (numericValue(row.media) !== null) group.comMedia++;
  }
  return {
    rows, ejaPeriod, activityCount, studentsWithGrade,
    classes: [...classes.values()].sort((a, b) => a.turma.localeCompare(b.turma, "pt-BR"))
  };
}

async function handlePeriodClosure(request, env, url) {
  await ensurePeriodClosureSchema(env);
  const path = url.pathname;
  if (request.method === "GET" && path === "/admin/fechamentos-bimestre") {
    const result = await env.DB.prepare(
      "SELECT id, academic_year, calendar_period, student_count, activity_count, " +
      "students_with_grade, created_at, status FROM salta_period_closures " +
      "WHERE status = 'complete' ORDER BY academic_year DESC, calendar_period DESC, id DESC LIMIT 100"
    ).all();
    return json({ fechamentos: result.results || [] }, request);
  }

  const detailMatch = path.match(/^\/admin\/fechamentos-bimestre\/(\d+)$/);
  if (request.method === "GET" && detailMatch) {
    const id = Number(detailMatch[1]);
    const closure = await env.DB.prepare(
      "SELECT id, academic_year, calendar_period, student_count, activity_count, " +
      "students_with_grade, created_at, status FROM salta_period_closures " +
      "WHERE id = ? AND status = 'complete' LIMIT 1"
    ).bind(id).first();
    if (!closure) return json({ error: "Fechamento não encontrado." }, request, 404);
    const result = await env.DB.prepare(
      "SELECT student_code, student_name, turma, segment, calendar_period, segment_period, " +
      "period_status, media, vistos, assessments_json, source_updated_at " +
      "FROM salta_period_closure_students WHERE closure_id = ? " +
      "ORDER BY turma, student_name"
    ).bind(id).all();
    return json({
      fechamento: closure,
      alunos: (result.results || []).map(row => ({
        ...row,
        avaliacoes: parseArray(row.assessments_json)
      }))
    }, request);
  }

  const calendarPeriod = Number(url.searchParams.get("bimestre"));
  if (request.method === "GET" && path === "/admin/fechamento-bimestre") {
    const year = Number(url.searchParams.get("ano"));
    if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
        !Number.isInteger(calendarPeriod) || calendarPeriod < 1 || calendarPeriod > 4) {
      return json({ error: "Informe um ano letivo e um bimestre entre 1 e 4." }, request, 400);
    }
    const source = await periodClosureSource(env, calendarPeriod);
    const existing = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM salta_period_closures " +
      "WHERE academic_year = ? AND calendar_period = ? AND status = 'complete'"
    ).bind(year, calendarPeriod).first();
    return json({
      anoLetivo: year,
      bimestre: calendarPeriod,
      bimestreEja: source.ejaPeriod,
      quantidadeAlunos: source.rows.length,
      quantidadeAtividades: source.activityCount,
      alunosComMedia: source.studentsWithGrade,
      fechamentosAnteriores: Number(existing?.total || 0),
      turmas: source.classes
    }, request);
  }

  if (request.method === "POST" && path === "/admin/fechamento-bimestre") {
    const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return json({ error: "Formato de confirmação inválido." }, request, 415);
    const payload = await request.json().catch(() => null);
    const year = Number(payload?.anoLetivo);
    const period = Number(payload?.bimestre);
    if (!payload || payload.confirm !== "fechar-bimestre" || !Number.isInteger(year) || year < 2000 || year > 2100 ||
        !Number.isInteger(period) || period < 1 || period > 4) {
      return json({ error: "Confirme o fechamento e informe o ano letivo e o bimestre." }, request, 400);
    }
    const source = await periodClosureSource(env, period);
    if (!source.rows.length) return json({ error: "Não há alunos com turma para arquivar." }, request, 409);

    const created = await env.DB.prepare(
      "INSERT INTO salta_period_closures " +
      "(academic_year, calendar_period, student_count, activity_count, students_with_grade, status) " +
      "VALUES (?, ?, ?, ?, ?, 'processing')"
    ).bind(year, period, source.rows.length, source.activityCount, source.studentsWithGrade).run();
    const id = Number(created.meta?.last_row_id || 0);
    if (!id) return json({ error: "Não foi possível iniciar o fechamento." }, request, 500);

    const { ejaPeriod } = source;
    const { field } = closurePeriodFields(period);
    const statement = env.DB.prepare(
      "INSERT INTO salta_period_closure_students " +
      "(closure_id, student_code, student_name, turma, segment, calendar_period, segment_period, " +
      "period_status, media, vistos, assessments_json, source_updated_at) " +
      "SELECT ?, codigo, nome, TRIM(turma), " +
      "CASE WHEN UPPER(COALESCE(turma, '')) LIKE '%EJA%' THEN 'EJA' ELSE 'REGULAR' END, ?, " +
      "CASE WHEN UPPER(COALESCE(turma, '')) LIKE '%EJA%' THEN ? ELSE ? END, " +
      field("status") + ", " + field("media") + ", " + field("vistos") + ", " +
      "COALESCE(" + field("avaliacoes") + ", '[]'), ultima_atualizacao " +
      "FROM alunos WHERE turma IS NOT NULL AND TRIM(turma) <> ''"
    ).bind(id, period, ejaPeriod, period);
    try {
      await env.DB.batch([
        statement,
        env.DB.prepare("UPDATE salta_period_closures SET status = 'complete' WHERE id = ?").bind(id)
      ]);
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM salta_period_closure_students WHERE closure_id = ?").bind(id),
        env.DB.prepare("DELETE FROM salta_period_closures WHERE id = ?").bind(id)
      ]).catch(() => {});
      throw error;
    }
    return json({
      ok: true,
      fechamento: {
        id, anoLetivo: year, bimestre: period, bimestreEja: ejaPeriod,
        alunos: source.rows.length, atividades: source.activityCount,
        turmas: source.classes.length
      }
    }, request, 201);
  }
  return json({ error: "Rota de fechamento de bimestre não encontrada." }, request, 404);
}

async function findCommsStudent(env, code) {
  if (!validStudentCode(code)) return null;
  return env.DB.prepare(
    "SELECT codigo, nome, TRIM(turma) AS turma " +
    "FROM alunos WHERE codigo = ? LIMIT 1"
  ).bind(String(code).trim().toUpperCase()).first();
}

async function insertCommsMessage(env, message) {
  const result = await env.DB.prepare(
    "INSERT INTO salta_comms_messages " +
    "(kind, scope, turma, student_code, sender_type, sender_name, title, body) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    message.kind,
    message.scope,
    message.turma || null,
    message.student_code || null,
    message.sender_type,
    message.sender_name,
    message.title,
    message.body
  ).run();

  return Number(result.meta?.last_row_id || 0);
}

async function handleCommsRequest(request, env, url) {
  try {
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (!["GET", "POST"].includes(method)) {
      return json({ error: "Método não permitido." }, request, 405);
    }

    // Check teacher authorization before touching the communications tables.
    if (path.startsWith("/comms/teacher/") && !(await authenticated(request, env))) {
      return json({ error: "Acesso restrito. Entre novamente na Área do Professor." }, request, 401);
    }

    await ensureCommsSchema(env);

    // Public student routes require a valid individual school code.
    if (path === "/comms/student" && method === "GET") {
      const code = (url.searchParams.get("codigo") || "").trim().toUpperCase();
      const student = await findCommsStudent(env, code);
      if (!student) return json({ error: "Código não encontrado." }, request, 404);

      // Registra uma consulta concluída com código individual válido.
      await env.DB.prepare("INSERT INTO salta_student_access_logs (student_code) VALUES (?)").bind(student.codigo).run();

      const announcements = await env.DB.prepare(
        "SELECT m.id, m.scope, m.title, m.body, m.sender_name, m.created_at, r.read_at, " +
        "CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS is_read " +
        "FROM salta_comms_messages m LEFT JOIN salta_comms_announcement_reads r " +
        "ON r.announcement_id = m.id AND r.student_code = ? " +
        "WHERE m.kind = 'announcement' AND m.active = 1 AND " +
        "(m.scope = 'global' OR (m.scope = 'individual' AND m.student_code = ?) " +
        "OR (m.scope = 'class' AND TRIM(m.turma) = ?)) " +
        "ORDER BY datetime(m.created_at) DESC LIMIT 100"
      ).bind(code, code, String(student.turma || "").trim()).all();

      return json({
        student: { codigo: student.codigo, nome: student.nome, turma: student.turma },
        announcements: announcements.results || []
      }, request);
    }

    if (path === "/comms/student/read" && method === "POST") {
      const payload = await request.json().catch(() => null);
      const code = String(payload?.codigo || "").trim().toUpperCase();
      if (!(await findCommsStudent(env, code))) return json({ error: "Código não encontrado." }, request, 404);
      const ids = Array.isArray(payload?.announcement_ids)
        ? [...new Set(payload.announcement_ids.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 100) : [];
      let marked = 0;
      for (const id of ids) {
        const applicable = await env.DB.prepare(
          "SELECT id FROM salta_comms_messages WHERE id = ? AND kind = 'announcement' AND active = 1 AND " +
          "(scope = 'global' OR (scope = 'individual' AND student_code = ?) " +
          "OR (scope = 'class' AND EXISTS (SELECT 1 FROM alunos WHERE codigo = ? AND TRIM(turma) = TRIM(salta_comms_messages.turma)))) LIMIT 1"
        ).bind(id, code, code).first();
        if (!applicable) continue;
        await env.DB.prepare("INSERT OR IGNORE INTO salta_comms_announcement_reads (announcement_id, student_code) VALUES (?, ?)")
          .bind(id, code).run();
        marked++;
      }
      return json({ ok: true, marked }, request);
    }

    // All remaining communication routes are teacher-only.
    if (path.startsWith("/comms/teacher/")) {
      if (path === "/comms/teacher/announcements" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT m.id, m.scope, m.turma, m.student_code, m.sender_name, m.title, m.body, m.created_at, m.active, " +
          "(SELECT COUNT(*) FROM salta_comms_announcement_reads r WHERE r.announcement_id = m.id) AS read_count, " +
          "CASE m.scope " +
          "WHEN 'individual' THEN 1 " +
          "WHEN 'class' THEN (SELECT COUNT(*) FROM alunos a WHERE TRIM(a.turma) = TRIM(m.turma)) " +
          "ELSE (SELECT COUNT(*) FROM alunos) END AS recipient_count " +
          "FROM salta_comms_messages m WHERE m.kind = 'announcement' AND m.scope IN ('global', 'individual', 'class') " +
          "ORDER BY datetime(m.created_at) DESC LIMIT 100"
        ).all();
        return json({ announcements: result.results || [] }, request);
      }

      if (path === "/comms/teacher/announcement-readers" && method === "GET") {
        const id = Number(url.searchParams.get("id"));
        if (!Number.isInteger(id) || id < 1) {
          return json({ error: "Informe um aviso válido." }, request, 400);
        }

        const announcement = await env.DB.prepare(
          "SELECT id FROM salta_comms_messages " +
          "WHERE id = ? AND kind = 'announcement' AND scope IN ('global', 'individual', 'class') LIMIT 1"
        ).bind(id).first();
        if (!announcement) return json({ error: "Aviso não encontrado." }, request, 404);

        const result = await env.DB.prepare(
          "SELECT COALESCE(NULLIF(TRIM(a.nome), ''), 'Aluno não identificado') AS nome, " +
          "COALESCE(TRIM(a.turma), '') AS turma, r.read_at " +
          "FROM salta_comms_announcement_reads r " +
          "LEFT JOIN alunos a ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(r.student_code)) " +
          "WHERE r.announcement_id = ? " +
          "ORDER BY datetime(r.read_at) DESC, a.nome COLLATE NOCASE"
        ).bind(id).all();

        return json({ id, readers: result.results || [] }, request);
      }

      if (path === "/comms/teacher/announcement-backup" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT m.id, m.scope, m.turma, m.student_code, m.sender_type, m.sender_name, " +
          "m.title, m.body, m.created_at, m.active, a.nome AS reader_name, " +
          "TRIM(a.turma) AS reader_class, r.read_at " +
          "FROM salta_comms_messages m " +
          "LEFT JOIN salta_comms_announcement_reads r ON r.announcement_id = m.id " +
          "LEFT JOIN alunos a ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(r.student_code)) " +
          "WHERE m.kind = 'announcement' ORDER BY m.id DESC, datetime(r.read_at) ASC"
        ).all();
        const announcements = new Map();
        for (const row of result.results || []) {
          let item = announcements.get(row.id);
          if (!item) {
            item = {
              id: row.id, scope: row.scope, turma: row.turma, student_code: row.student_code,
              sender_type: row.sender_type, sender_name: row.sender_name, title: row.title,
              body: row.body, created_at: row.created_at, active: row.active, readers: []
            };
            announcements.set(row.id, item);
          }
          if (row.read_at) item.readers.push({
            nome: row.reader_name || "Aluno não identificado",
            turma: row.reader_class || "",
            read_at: row.read_at
          });
        }
        return json({
          format: "salta-announcement-backup-v1",
          exported_at: new Date().toISOString(),
          total: announcements.size,
          announcements: [...announcements.values()]
        }, request);
      }

      if (path === "/comms/teacher/announcement-delete" && method === "POST") {
        const payload = await request.json().catch(() => null);
        const id = Number(payload?.id);
        if (!Number.isInteger(id) || id < 1) {
          return json({ error: "Informe um aviso válido para apagar." }, request, 400);
        }

        const existing = await env.DB.prepare(
          "SELECT id FROM salta_comms_messages WHERE id = ? AND kind = 'announcement' LIMIT 1"
        ).bind(id).first();
        if (!existing) return json({ error: "Aviso não encontrado no histórico." }, request, 404);

        const deleted = await env.DB.batch([
          env.DB.prepare("DELETE FROM salta_comms_announcement_reads WHERE announcement_id = ?").bind(id),
          env.DB.prepare("DELETE FROM salta_comms_messages WHERE id = ? AND kind = 'announcement'").bind(id)
        ]);
        const changes = Number(deleted?.[1]?.meta?.changes || 0);
        if (!changes) return json({ error: "O aviso não foi apagado." }, request, 409);
        return json({ ok: true, id, deleted: 1, message: "Aviso apagado do histórico e removido da Área do Aluno." }, request);
      }

      if (path === "/comms/teacher/announcement-history-clear" && method === "POST") {
        const deleted = await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM salta_comms_announcement_reads WHERE announcement_id IN " +
            "(SELECT id FROM salta_comms_messages WHERE kind = 'announcement')"
          ),
          env.DB.prepare("DELETE FROM salta_comms_messages WHERE kind = 'announcement'")
        ]);
        const changes = Number(deleted?.[1]?.meta?.changes || 0);
        return json({
          ok: true,
          deleted: changes,
          message: changes
            ? changes + (changes === 1 ? " aviso apagado do histórico." : " avisos apagados do histórico.")
            : "O histórico já estava vazio."
        }, request);
      }

      if (path === "/comms/teacher/announcement-status" && method === "POST") {
        const payload = await request.json().catch(() => null);
        if (!payload) return json({ error: "Solicitação inválida." }, request, 400);

        const id = Number(payload.id);
        const active = payload.active === true ? 1 : payload.active === false ? 0 : null;
        if (!Number.isInteger(id) || id < 1 || active === null) {
          return json({ error: "Informe um aviso válido e o estado desejado." }, request, 400);
        }

        const announcement = await env.DB.prepare(
          "SELECT id FROM salta_comms_messages " +
          "WHERE id = ? AND kind = 'announcement' AND scope IN ('global', 'individual', 'class') LIMIT 1"
        ).bind(id).first();
        if (!announcement) return json({ error: "Aviso não encontrado." }, request, 404);

        await env.DB.prepare(
          "UPDATE salta_comms_messages SET active = ? " +
          "WHERE id = ? AND kind = 'announcement' AND scope IN ('global', 'individual', 'class')"
        ).bind(active, id).run();

        return json({
          ok: true,
          id,
          active,
          message: active ? "Aviso restaurado e visível aos destinatários." : "Aviso removido da Área do Aluno. Ele continua no histórico e pode ser restaurado."
        }, request);
      }

      if (path === "/comms/teacher/announcement-batch" && method === "POST") {
        const payload = await request.json().catch(() => null);
        if (!payload) return json({ error: "Aviso inválido." }, request, 400);

        const title = trimLimited(payload.title, COMMS_MAX_TITLE);
        const body = trimLimited(payload.body, COMMS_MAX_BODY);
        if (!title || !body) {
          return json({ error: "Informe um título e o texto do aviso." }, request, 400);
        }
        if (String(payload.title || "").trim().length > COMMS_MAX_TITLE ||
            String(payload.body || "").trim().length > COMMS_MAX_BODY) {
          return json({ error: "O título aceita até 100 caracteres e o aviso até 1.500." }, request, 400);
        }

        const receivedCodes = Array.isArray(payload.student_codes) ? payload.student_codes : [];
        const codes = [...new Set(receivedCodes.map(code => String(code || "").trim().toUpperCase()))];
        if (!codes.length) return json({ error: "Selecione ao menos um aluno." }, request, 400);
        if (codes.length > 100) return json({ error: "Envie no máximo 100 avisos individuais por vez." }, request, 400);
        if (codes.some(code => !validStudentCode(code))) {
          return json({ error: "Um ou mais códigos de aluno são inválidos." }, request, 400);
        }

        const placeholders = codes.map(() => "?").join(",");
        const found = await env.DB.prepare(
          "SELECT codigo, TRIM(turma) AS turma FROM alunos WHERE codigo IN (" + placeholders + ")"
        ).bind(...codes).all();
        const students = new Map((found.results || []).map(student => [
          String(student.codigo || "").trim().toUpperCase(),
          student
        ]));
        if (students.size !== codes.length) {
          return json({ error: "Um ou mais alunos selecionados não foram encontrados. Revise a seleção." }, request, 404);
        }

        const senderName = String(env.PROFESSOR_DISPLAY_NAME || "Professor").slice(0, 120);
        const statements = codes.map(code => {
          const student = students.get(code);
          return env.DB.prepare(
            "INSERT INTO salta_comms_messages " +
            "(kind, scope, turma, student_code, sender_type, sender_name, title, body) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            "announcement",
            "individual",
            student.turma || null,
            code,
            "teacher",
            senderName,
            title,
            body
          );
        });
        const inserted = await env.DB.batch(statements);
        const published = inserted.filter(result => result.success !== false).length;
        return json({
          ok: true,
          published,
          message: published + (published === 1 ? " aviso individual publicado." : " avisos individuais publicados.")
        }, request, 201);
      }

      if (path === "/comms/teacher/announcement" && method === "POST") {
        const payload = await request.json().catch(() => null);
        if (!payload) return json({ error: "Aviso inválido." }, request, 400);

        const scope = String(payload.scope || "").trim();
        const title = trimLimited(payload.title, COMMS_MAX_TITLE);
        const body = trimLimited(payload.body, COMMS_MAX_BODY);
        if (!["global", "individual", "class"].includes(scope)) {
          return json({ error: "Escolha um aviso global, para turma ou individual." }, request, 400);
        }
        if (!title || !body) {
          return json({ error: "Informe um título e o texto do aviso." }, request, 400);
        }
        if (String(payload.title || "").trim().length > COMMS_MAX_TITLE ||
            String(payload.body || "").trim().length > COMMS_MAX_BODY) {
          return json({ error: "O título aceita até 100 caracteres e o aviso até 1.500." }, request, 400);
        }

        let turma = null;
        let code = null;
        if (scope === "individual") {
          code = String(payload.student_code || "").trim().toUpperCase();
          const student = await findCommsStudent(env, code);
          if (!student) return json({ error: "Código do aluno não encontrado." }, request, 404);
          turma = student.turma;
        } else if (scope === "class") {
          const requestedClass = String(payload.turma || "").trim();
          if (!requestedClass || requestedClass.length > 100) {
            return json({ error: "Selecione uma turma válida para o aviso." }, request, 400);
          }
          const classRow = await env.DB.prepare(
            "SELECT TRIM(turma) AS turma FROM alunos WHERE TRIM(turma) = ? LIMIT 1"
          ).bind(requestedClass).first();
          if (!classRow?.turma) return json({ error: "A turma selecionada não foi encontrada." }, request, 404);
          turma = String(classRow.turma).trim();
        }

        const id = await insertCommsMessage(env, {
          kind: "announcement",
          scope,
          turma,
          student_code: code,
          sender_type: "teacher",
          sender_name: String(env.PROFESSOR_DISPLAY_NAME || "Professor").slice(0, 120),
          title,
          body
        });
        return json({ ok: true, id, message: "Aviso publicado." }, request, 201);
      }

    }

    return json({ error: "Rota de comunicação não encontrada." }, request, 404);
  } catch (error) {
    return json({ error: "Falha no serviço de mensagens." }, request, 500);
  }
}


export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/festival/")) {
      try { return await handleFestivalRoute(request, env, url); }
      catch { return json({ error: "Não foi possível processar a avaliação do festival." }, request, 500); }
    }
    if (url.pathname.startsWith("/auth/")) {
      return proxyAuth(request, env, url);
    }
    if (url.pathname.startsWith("/comms/")) {
      return handleCommsRequest(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/public/grade-rule") {
      const codigo = (url.searchParams.get("codigo") || "").trim().toUpperCase();
      if (!/^2026[A-Z]{1,4}$/.test(codigo)) {
        return json({ error: "Código inválido." }, request, 400);
      }
      try {
        const student = await env.DB.prepare(
          "SELECT TRIM(turma) AS turma FROM alunos WHERE codigo = ? LIMIT 1"
        ).bind(codigo).first();
        if (!student) return json({ error: "Aluno não encontrado." }, request, 404);
        if (!String(student.turma || "").trim()) {
          return json({ error: "A turma deste aluno ainda não está definida." }, request, 409);
        }
        const config = await turmaConfig(env, student.turma);
        return json(turmaRulePayload(student.turma, config), request);
      } catch (error) {
        return json({ error: "Não foi possível consultar o critério da turma." }, request, 500);
      }
    }

    const clearingAccessHistory = url.pathname === "/admin/acessos-alunos/limpar" && request.method === "POST";
    const periodClosureRoute = url.pathname.startsWith("/admin/fechamento-bimestre") ||
      url.pathname.startsWith("/admin/fechamentos-bimestre");
    if (request.method !== "GET" && !clearingAccessHistory && !(periodClosureRoute && request.method === "POST")) {
      return json({ error: "Método não permitido." }, request, 405);
    }
    if (!(await authenticated(request, env))) {
      return json({ error: "Acesso restrito." }, request, 401);
    }

    try {
      if (periodClosureRoute) return await handlePeriodClosure(request, env, url);
      if (clearingAccessHistory) {
        const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
        if (contentType !== "application/json") {
          return json({ error: "Formato de confirmação inválido." }, request, 415);
        }
        const payload = await request.json().catch(() => null);
        if (payload?.confirm !== "apagar-historico") {
          return json({ error: "Confirme a exclusão do histórico." }, request, 400);
        }
        await ensureCommsSchema(env);
        await env.DB.prepare("DELETE FROM salta_student_access_logs").run();
        return json({ ok: true }, request);
      }
      if (url.pathname === "/health") {
        return json({ ok: true, service: "salta-stats" }, request);
      }

      if (url.pathname === "/admin/acessos-alunos") {
        await ensureCommsSchema(env);
        const [summary, result] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN datetime(accessed_at) >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS ultimos_30_dias, COUNT(DISTINCT CASE WHEN datetime(accessed_at) >= datetime('now', '-30 days') THEN student_code END) AS alunos_ultimos_30_dias FROM salta_student_access_logs").first(),
          env.DB.prepare("SELECT a.nome, TRIM(a.turma) AS turma, l.student_code, l.accessed_at FROM salta_student_access_logs l INNER JOIN alunos a ON a.codigo = l.student_code ORDER BY datetime(l.accessed_at) DESC LIMIT 500").all()
        ]);
        return json({ resumo: { total: Number(summary?.total || 0), acessos30Dias: Number(summary?.ultimos_30_dias || 0), alunos30Dias: Number(summary?.alunos_ultimos_30_dias || 0) }, totalListados: (result.results || []).length, acessos: result.results || [] }, request);
      }

      if (url.pathname === "/admin/turmas") {
        const totalRow = await env.DB.prepare(
          "SELECT COUNT(*) AS total_alunos FROM alunos"
        ).first();

        const comTurmaRow = await env.DB.prepare(
          "SELECT COUNT(*) AS com_turma FROM alunos " +
          "WHERE turma IS NOT NULL AND TRIM(turma) <> ''"
        ).first();

        const result = await env.DB.prepare(
          "SELECT TRIM(turma) AS turma FROM alunos " +
          "WHERE turma IS NOT NULL AND TRIM(turma) <> '' " +
          "GROUP BY TRIM(turma) ORDER BY TRIM(turma)"
        ).all();

        return json({
          turmas: (result.results || []).map(row => row.turma).filter(Boolean),
          diagnostico: {
            totalAlunos: Number(totalRow?.total_alunos || 0),
            alunosComTurma: Number(comTurmaRow?.com_turma || 0),
            quantidadeTurmas: (result.results || []).length
          }
        }, request);
      }

      if (url.pathname === "/admin/alunos") {
        const turma = (url.searchParams.get("turma") || "").trim();
        const nome = (url.searchParams.get("nome") || "").trim();
        let query = "SELECT codigo, nome, TRIM(turma) AS turma FROM alunos WHERE 1=1";
        const binds = [];
        if (turma) { query += " AND TRIM(turma) = ?"; binds.push(turma); }
        if (nome) { query += " AND LOWER(nome) LIKE LOWER(?)"; binds.push("%" + nome + "%"); }
        query += " ORDER BY TRIM(turma), nome";
        const result = await env.DB.prepare(query).bind(...binds).all();
        return json({ total: (result.results || []).length, alunos: result.results || [] }, request);
      }

      if (url.pathname === "/admin/aluno") {
        const codigo = (url.searchParams.get("codigo") || "").trim().toUpperCase();
        if (!/^2026[A-Z]{1,4}$/.test(codigo)) {
          return json({ error: "Código inválido." }, request, 400);
        }
        const result = await env.DB.prepare(
          "SELECT codigo, nome, turma, ultima_atualizacao, " +
          "bimestre1_status,bimestre1_media,bimestre1_vistos,bimestre1_avaliacoes," +
          "bimestre2_status,bimestre2_media,bimestre2_vistos,bimestre2_avaliacoes," +
          "bimestre3_status,bimestre3_media,bimestre3_vistos,bimestre3_avaliacoes," +
          "bimestre4_status,bimestre4_media,bimestre4_vistos,bimestre4_avaliacoes " +
          "FROM alunos WHERE codigo = ? LIMIT 1"
        ).bind(codigo).first();
        if (!result) return json({ error: "Aluno não encontrado." }, request, 404);
        const config = await turmaConfig(env, result.turma);
        return json({ ...result, ...turmaRulePayload(result.turma, config) }, request);
      }

      if (url.pathname === "/admin/turma-estatistica") {
        const turma = (url.searchParams.get("turma") || "").trim();
        const periodo = (url.searchParams.get("periodo") || "vigente").trim().toLowerCase();
        if (!turma) return json({ error: "Turma não informada." }, request, 400);
        if (!["vigente", "final", "1", "2", "3", "4"].includes(periodo)) {
          return json({ error: "Período de análise inválido." }, request, 400);
        }

        const config = await turmaConfig(env, turma);
        const result = await env.DB.prepare(
          "SELECT codigo, nome, TRIM(turma) AS turma, " +
          "bimestre1_status,bimestre1_media,bimestre1_vistos,bimestre1_avaliacoes," +
          "bimestre2_status,bimestre2_media,bimestre2_vistos,bimestre2_avaliacoes," +
          "bimestre3_status,bimestre3_media,bimestre3_vistos,bimestre3_avaliacoes," +
          "bimestre4_status,bimestre4_media,bimestre4_vistos,bimestre4_avaliacoes " +
          "FROM alunos WHERE TRIM(turma) = ? ORDER BY nome"
        ).bind(turma).all();

        if (!result.results?.length) {
          return json({ error: "Turma não encontrada." }, request, 404);
        }

        return json(buildTurmaStats(result.results, config, periodo), request);
      }

      if (url.pathname === "/admin/estatistica-global") {
        const periodo = (url.searchParams.get("periodo") || "vigente").trim().toLowerCase();
        if (!["vigente", "final", "1", "2", "3", "4"].includes(periodo)) {
          return json({ error: "Período de análise inválido." }, request, 400);
        }
        await ensureTurmaConfig(env);

        const cfgResult = await env.DB.prepare(
          "SELECT turma, rede, media_minima, modelo_avaliativo, atualizado_em " +
          "FROM turma_config ORDER BY turma"
        ).all();

        const result = await env.DB.prepare(
          "SELECT codigo, nome, TRIM(turma) AS turma, " +
          "bimestre1_status,bimestre1_media,bimestre1_vistos," +
          "bimestre2_status,bimestre2_media,bimestre2_vistos," +
          "bimestre3_status,bimestre3_media,bimestre3_vistos," +
          "bimestre4_status,bimestre4_media,bimestre4_vistos " +
          "FROM alunos WHERE turma IS NOT NULL AND TRIM(turma) <> '' " +
          "ORDER BY TRIM(turma), nome"
        ).all();

        return json(buildGlobalStats(result.results || [], cfgResult.results || [], periodo), request);
      }

      if (url.pathname === "/admin/turmas-config") {
        await ensureTurmaConfig(env);
        const result = await env.DB.prepare(
          "SELECT turma, rede, media_minima, modelo_avaliativo, atualizado_em " +
          "FROM turma_config ORDER BY turma"
        ).all();
        return json({ turmas: result.results || [] }, request);
      }

      return json({ error: "Rota não encontrada." }, request, 404);
    } catch (error) {
      return json({ error: "Erro ao consultar os dados." }, request, 500);
    }
  }
};
