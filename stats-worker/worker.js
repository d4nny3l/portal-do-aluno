const AUTH_API_URL = "https://salta-auth.dannyel-moises.workers.dev";
const ALLOWED_ORIGINS = new Set(["https://d4nny3l.github.io", "http://localhost:5500", "http://127.0.0.1:5500"]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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
const FESTIVAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FESTIVAL_DEFAULT_THEMES = [
  "África antes e depois da diáspora",
  "Personalidades negras de Brazlândia",
  "Racismo estrutural e desigualdade social",
  "Juventude negra, escola e projeto de vida",
  "Literatura negra brasileira",
  "Mulheres negras: ciência, política, cultura e resistência",
  "Ciência, tecnologia e invenções de pessoas negras",
  "Saúde da população negra",
  "Corpo negro, beleza e representatividade",
  "Cultura afro-brasileira: música, dança e oralidade",
  "Religiosidades africanas e afro-brasileiras",
  "Quilombos, territórios e direito à terra",
  "Racismo ambiental e direito à cidade",
  "Imagem da população negra na mídia e nas redes sociais",
  "Racismo, direitos humanos e cidadania",
  "Esporte, racismo e superação de estereótipos"
];
const FESTIVAL_DEFAULT_CONFIG = {
  title: "Mostra Cultural — Vozes da Ancestralidade",
  description: "Literatura, Arte e Resistência. A distribuição organiza duas turmas por tema; substitua os rótulos de exemplo pelos nomes das turmas.",
  entries: FESTIVAL_DEFAULT_THEMES.flatMap((theme, index) => [
    String(index + 1).padStart(2, "0") + " · " + theme + " · Turma 1 (definir)",
    String(index + 1).padStart(2, "0") + " · " + theme + " · Turma 2 (definir)"
  ]),
  criteria: [
    { id: "pesquisa", name: "Pesquisa", description: "Considere a qualidade, a relevância e a diversidade das fontes e informações apresentadas.", levels: [] },
    { id: "estetica", name: "Estética", description: "Considere organização, clareza visual e sonora, criatividade e cuidado na apresentação.", levels: [] },
    { id: "respeito-ao-tema", name: "Respeito ao tema", description: "Considere a abordagem antirracista, contextualizada e respeitosa, sem caricaturas ou estereótipos.", levels: [] },
    { id: "dominio-de-conteudo", name: "Domínio de conteúdo", description: "Considere a precisão, a compreensão e a clareza com que o conteúdo é explicado.", levels: [] }
  ],
  active: false
};

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomFromAlphabet(alphabet, length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join("");
}

function validFestivalShortCode(value) {
  return /^2026[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(String(value || "").trim().toUpperCase());
}

function randomFestivalCode() {
  return "2026" + randomFromAlphabet(FESTIVAL_CODE_ALPHABET, 4);
}

function randomFestivalPin() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map(byte => String(byte % 10)).join("");
}

function randomSaltHex() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function festivalPinHash(pin, saltHex) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(byte => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

function festivalJsonBody(request) {
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return Promise.resolve({ error: "Envie os dados em JSON." });
  return request.json().catch(() => null);
}

async function ensureFestivalSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_config (event_id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_evaluators (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, pin_salt TEXT, pin_hash TEXT, display_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT)").run();
  const evaluatorColumns = await env.DB.prepare("PRAGMA table_info(salta_festival_evaluators)").all();
  const columnNames = new Set((evaluatorColumns.results || []).map(column => column.name));
  for (const column of ["pin_salt", "pin_hash", "code_value", "pin_value"]) {
    if (columnNames.has(column)) continue;
    await env.DB.prepare("ALTER TABLE salta_festival_evaluators ADD COLUMN " + column + " TEXT").run().catch(error => {
      if (!/duplicate column/i.test(String(error?.message || error))) throw error;
    });
  }
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, evaluator_id INTEGER NOT NULL, entry_key TEXT NOT NULL, entry_name TEXT NOT NULL, answers_json TEXT NOT NULL, score REAL NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT, removed_at TEXT, removal_reason TEXT, UNIQUE(event_id, evaluator_id, entry_key))").run();
  const submissionColumns = await env.DB.prepare("PRAGMA table_info(salta_festival_submissions)").all();
  if (!(submissionColumns.results || []).some(column => column.name === "updated_at")) {
    await env.DB.prepare("ALTER TABLE salta_festival_submissions ADD COLUMN updated_at TEXT").run().catch(error => {
      if (!/duplicate column/i.test(String(error?.message || error))) throw error;
    });
  }
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_attempts (ip_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_pin_attempts (code_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS salta_festival_access_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, evaluator_id INTEGER NOT NULL, accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_salta_festival_access_logs_event ON salta_festival_access_logs(event_id, accessed_at DESC)").run();
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

async function festivalCodeRateLimit(env, codeHash) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / 600) * 600;
  await env.DB.prepare(
    "INSERT INTO salta_festival_pin_attempts (code_hash, window_start, attempts) VALUES (?, ?, 1) " +
    "ON CONFLICT(code_hash) DO UPDATE SET " +
    "attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END, " +
    "window_start = excluded.window_start"
  ).bind(codeHash, window).run();
  const row = await env.DB.prepare("SELECT attempts FROM salta_festival_pin_attempts WHERE code_hash = ?").bind(codeHash).first();
  return Number(row?.attempts || 0) > 5;
}

async function festivalCodeIsBlocked(env, codeHash) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / 600) * 600;
  const row = await env.DB.prepare("SELECT window_start, attempts FROM salta_festival_pin_attempts WHERE code_hash = ?").bind(codeHash).first();
  return Number(row?.window_start) === window && Number(row?.attempts || 0) > 5;
}

async function verifyTurnstileToken(secret, token, request, expectedAction) {
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || undefined
      })
    });
    const result = await response.json().catch(() => null);
    return response.ok &&
      result?.success === true &&
      result.hostname === "d4nny3l.github.io" &&
      result.action === expectedAction;
  } catch {
    return false;
  }
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
  if (!title || !entries.length || !criteria.length || criteria.some(item => !item.name || (value?.active !== false && !item.levels.length))) {
    return { error: "Informe título, ao menos um trabalho/turma e critérios; para abrir, cada critério precisa de níveis de nota." };
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
  if (!/^SALTA-[A-F0-9]{48}$/.test(clean) && !validFestivalShortCode(clean)) return null;
  return env.DB.prepare("SELECT id, display_name, pin_salt, pin_hash FROM salta_festival_evaluators WHERE event_id = ? AND code_hash = ? AND active = 1 LIMIT 1")
    .bind(FESTIVAL_EVENT_ID, await sha256Hex(clean)).first();
}

async function verifyFestivalCredentials(request, env, payload) {
  if (!env.TURNSTILE_SECRET_KEY || !(await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, payload?.turnstileToken, request, "evaluator_access"))) {
    return { error: "A verificação de segurança não foi concluída. Atualize a página e tente novamente.", status: 403 };
  }
  const code = String(payload?.code || "").trim().toUpperCase();
  const evaluator = await findFestivalEvaluator(env, code);
  let valid = !!evaluator;
  let codeBlocked = false;
  if (valid && evaluator.pin_hash) {
    const codeHash = await sha256Hex(code);
    if (await festivalCodeIsBlocked(env, codeHash)) return { error: "Muitas tentativas para este código. Aguarde alguns minutos e tente novamente.", status: 429 };
    const pin = String(payload?.pin || "").trim();
    const suppliedHash = await festivalPinHash(pin, evaluator.pin_salt || "");
    valid = /^\d{8}$/.test(pin) && constantTimeEqual(suppliedHash, evaluator.pin_hash);
    if (!valid) codeBlocked = await festivalCodeRateLimit(env, codeHash);
    else await env.DB.prepare("DELETE FROM salta_festival_pin_attempts WHERE code_hash = ?").bind(codeHash).run();
  } else if (valid) {
    // Previously issued SALTA-<48 hex> evaluator keys remain valid during migration.
    valid = /^SALTA-[A-F0-9]{48}$/.test(code);
  }
  if (!valid) {
    if (codeBlocked || await festivalRateLimit(request, env)) return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.", status: 429 };
    return { error: "Código ou PIN inválido ou revogado.", status: 401 };
  }
  return { evaluator };
}

async function handleFestivalRoute(request, env, url) {
  await ensureFestivalSchema(env);
  const path = url.pathname;
  if (path === "/festival/public/config" && request.method === "GET") {
    const { config, updatedAt } = await getFestivalConfig(env);
    return json({ configured: !!config, config: config ? { ...config, criteria: config.criteria, entries: config.entries } : null, updatedAt }, request);
  }
  if ((path === "/festival/public/verify-code" || path === "/festival/public/submissions" || path === "/festival/public/submissions/lookup") && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    const credentialResult = await verifyFestivalCredentials(request, env, payload);
    if (credentialResult.error) {
      const response = json({ error: credentialResult.error }, request, credentialResult.status);
      if (credentialResult.status === 429) response.headers.set("Retry-After", "600");
      return response;
    }
    const evaluator = credentialResult.evaluator;
    if (path.endsWith("verify-code")) {
      await env.DB.prepare("INSERT INTO salta_festival_access_logs (event_id, evaluator_id) VALUES (?, ?)")
        .bind(FESTIVAL_EVENT_ID, evaluator.id).run();
      return json({ ok: true, avaliador: evaluator.display_name }, request);
    }

    const { config } = await getFestivalConfig(env);
    if (!config?.active) return json({ error: "As avaliações ainda não estão abertas." }, request, 409);
    const entry = config.entries.find(item => item === payload.entry);
    if (!entry) return json({ error: "Selecione um trabalho ou turma válido." }, request, 400);
    const entryKey = entry.toLocaleLowerCase("pt-BR");
    if (path.endsWith("/lookup")) {
      const row = await env.DB.prepare("SELECT id, answers_json, notes, score, created_at, updated_at FROM salta_festival_submissions WHERE event_id = ? AND evaluator_id = ? AND entry_key = ? AND removed_at IS NULL LIMIT 1")
        .bind(FESTIVAL_EVENT_ID, evaluator.id, entryKey).first();
      if (!row) return json({ ok: true, submission: null }, request);
      let savedAnswers = {};
      try { savedAnswers = JSON.parse(row.answers_json) || {}; } catch { savedAnswers = {}; }
      return json({ ok: true, submission: { id: row.id, answers: savedAnswers, notes: row.notes, score: row.score, created_at: row.created_at, updated_at: row.updated_at } }, request);
    }
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
      const existing = await env.DB.prepare("SELECT id, removed_at FROM salta_festival_submissions WHERE event_id = ? AND evaluator_id = ? AND entry_key = ? LIMIT 1")
        .bind(FESTIVAL_EVENT_ID, evaluator.id, entryKey).first();
      if (existing?.removed_at) return json({ error: "Esta avaliação foi removida do resultado pelo administrador e não pode ser alterada." }, request, 409);
      if (existing) {
        await env.DB.prepare("UPDATE salta_festival_submissions SET entry_name = ?, answers_json = ?, score = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND evaluator_id = ? AND removed_at IS NULL")
          .bind(entry, JSON.stringify(normalized), Math.round(score * 100) / 100, notes, existing.id, evaluator.id).run();
        return json({ ok: true, updated: true, id: existing.id, score: Math.round(score * 100) / 100 }, request);
      }
      const result = await env.DB.prepare(
        "INSERT INTO salta_festival_submissions (event_id, evaluator_id, entry_key, entry_name, answers_json, score, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(FESTIVAL_EVENT_ID, evaluator.id, entryKey, entry, JSON.stringify(normalized), Math.round(score * 100) / 100, notes).run();
      return json({ ok: true, updated: false, id: result.meta?.last_row_id || null, score: Math.round(score * 100) / 100 }, request, 201);
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
    const [{ config, updatedAt }, evaluators, submissions, removed, accessLogs] = await Promise.all([
      getFestivalConfig(env),
      env.DB.prepare("SELECT id, display_name, code_value, pin_value, active, created_at, revoked_at FROM salta_festival_evaluators WHERE event_id = ? ORDER BY id DESC").bind(FESTIVAL_EVENT_ID).all(),
      env.DB.prepare("SELECT s.id, s.entry_name, s.answers_json, s.score, s.notes, s.created_at, s.updated_at, e.display_name AS evaluator FROM salta_festival_submissions s JOIN salta_festival_evaluators e ON e.id = s.evaluator_id WHERE s.event_id = ? AND s.removed_at IS NULL ORDER BY s.created_at DESC").bind(FESTIVAL_EVENT_ID).all(),
      env.DB.prepare("SELECT s.id, s.entry_name, s.score, s.notes, s.created_at, s.removed_at, s.removal_reason, e.display_name AS evaluator FROM salta_festival_submissions s JOIN salta_festival_evaluators e ON e.id = s.evaluator_id WHERE s.event_id = ? AND s.removed_at IS NOT NULL ORDER BY s.removed_at DESC").bind(FESTIVAL_EVENT_ID).all(),
      env.DB.prepare("SELECT l.id, l.accessed_at, e.display_name AS evaluator FROM salta_festival_access_logs l JOIN salta_festival_evaluators e ON e.id = l.evaluator_id WHERE l.event_id = ? ORDER BY l.accessed_at DESC LIMIT 500").bind(FESTIVAL_EVENT_ID).all()
    ]);
    return json({ config: config || FESTIVAL_DEFAULT_CONFIG, updatedAt, avaliadores: evaluators.results || [], avaliacoes: (submissions.results || []).map(row => {
      let respostas = {};
      try { respostas = JSON.parse(row.answers_json) || {}; } catch { respostas = {}; }
      return { ...row, respostas };
    }), removidas: removed.results || [], acessos: accessLogs.results || [] }, request);
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
    let code = String(payload?.code || "").trim().toUpperCase();
    if (code && !validFestivalShortCode(code)) return json({ error: "O código personalizado deve começar por 2026 e ter mais quatro caracteres (letras sem I/O ou números 2–9)." }, request, 400);
    if (!code) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = randomFestivalCode();
        const existing = await env.DB.prepare("SELECT id FROM salta_festival_evaluators WHERE event_id = ? AND code_hash = ? LIMIT 1").bind(FESTIVAL_EVENT_ID, await sha256Hex(candidate)).first();
        if (!existing) { code = candidate; break; }
      }
    }
    if (!code) return json({ error: "Não foi possível gerar um código exclusivo. Tente novamente." }, request, 503);
    const pin = randomFestivalPin();
    const salt = randomSaltHex();
    try {
      const result = await env.DB.prepare("INSERT INTO salta_festival_evaluators (event_id, code_hash, pin_salt, pin_hash, code_value, pin_value, display_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(FESTIVAL_EVENT_ID, await sha256Hex(code), salt, await festivalPinHash(pin, salt), code, pin, displayName).run();
      return json({ ok: true, id: result.meta?.last_row_id || null, display_name: displayName, code, pin }, request, 201);
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || error))) return json({ error: "Esse código já está em uso. Escolha outro." }, request, 409);
      throw error;
    }
  }
  const rotateMatch = path.match(/^\/festival\/admin\/codes\/(\d+)\/rotate$/);
  if (rotateMatch && request.method === "POST") {
    const evaluatorId = Number(rotateMatch[1]);
    const existingEvaluator = await env.DB.prepare("SELECT id FROM salta_festival_evaluators WHERE event_id = ? AND id = ? LIMIT 1")
      .bind(FESTIVAL_EVENT_ID, evaluatorId).first();
    if (!existingEvaluator) return json({ error: "Avaliador não encontrado." }, request, 404);
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = randomFestivalCode();
      const existing = await env.DB.prepare("SELECT id FROM salta_festival_evaluators WHERE event_id = ? AND code_hash = ? LIMIT 1")
        .bind(FESTIVAL_EVENT_ID, await sha256Hex(candidate)).first();
      if (!existing) { code = candidate; break; }
    }
    if (!code) return json({ error: "Não foi possível gerar um novo código exclusivo. Tente novamente." }, request, 503);
    const pin = randomFestivalPin();
    const salt = randomSaltHex();
    await env.DB.prepare("UPDATE salta_festival_evaluators SET code_hash = ?, code_value = ?, pin_salt = ?, pin_hash = ?, pin_value = ?, active = 1, revoked_at = NULL WHERE event_id = ? AND id = ?")
      .bind(await sha256Hex(code), code, salt, await festivalPinHash(pin, salt), pin, FESTIVAL_EVENT_ID, evaluatorId).run();
    return json({ ok: true, id: evaluatorId, code, pin }, request);
  }
  const revokeMatch = path.match(/^\/festival\/admin\/codes\/(\d+)\/revoke$/);
  if (revokeMatch && request.method === "POST") {
    const result = await env.DB.prepare("UPDATE salta_festival_evaluators SET active = 0, revoked_at = CURRENT_TIMESTAMP WHERE event_id = ? AND id = ? AND active = 1")
      .bind(FESTIVAL_EVENT_ID, Number(revokeMatch[1])).run();
    return json({ ok: true, revoked: Number(result.meta?.changes || 0) > 0 }, request);
  }
  if (path === "/festival/admin/access-history/clear" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (payload?.confirm !== "apagar-historico") return json({ error: "Confirme a remoção do histórico de acessos." }, request, 400);
    const result = await env.DB.prepare("DELETE FROM salta_festival_access_logs WHERE event_id = ?").bind(FESTIVAL_EVENT_ID).run();
    return json({ ok: true, apagados: Number(result.meta?.changes || 0) }, request);
  }
  if (path === "/festival/admin/submissions/remove-batch" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    const reason = trimLimited(payload?.reason, 500);
    const rawIds = Array.isArray(payload?.ids) ? payload.ids : [];
    const ids = [...new Set(rawIds.map(value => Number(value)))];
    if (!reason) return json({ error: "Informe o motivo comum para a remoção." }, request, 400);
    if (!ids.length || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      return json({ error: "Selecione entre 1 e 500 avaliações válidas." }, request, 400);
    }
    const placeholders = ids.map(() => "?").join(",");
    const result = await env.DB.prepare(
      "UPDATE salta_festival_submissions SET removed_at = CURRENT_TIMESTAMP, removal_reason = ? " +
      "WHERE event_id = ? AND removed_at IS NULL AND id IN (" + placeholders + ")"
    ).bind(reason, FESTIVAL_EVENT_ID, ...ids).run();
    return json({ ok: true, removed: Number(result.meta?.changes || 0) }, request);
  }
  if (path === "/festival/admin/submissions/removed/delete" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (payload?.confirm !== "excluir-historico") {
      return json({ error: "Confirme a exclusão do histórico de avaliações removidas." }, request, 400);
    }
    let result;
    if (payload.all === true) {
      result = await env.DB.prepare(
        "DELETE FROM salta_festival_submissions WHERE event_id = ? AND removed_at IS NOT NULL"
      ).bind(FESTIVAL_EVENT_ID).run();
    } else {
      const rawIds = Array.isArray(payload.ids) ? payload.ids : [];
      const ids = [...new Set(rawIds.map(value => Number(value)))];
      if (!ids.length || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
        return json({ error: "Selecione entre 1 e 500 avaliações removidas válidas." }, request, 400);
      }
      const placeholders = ids.map(() => "?").join(",");
      result = await env.DB.prepare(
        "DELETE FROM salta_festival_submissions WHERE event_id = ? AND removed_at IS NOT NULL AND id IN (" + placeholders + ")"
      ).bind(FESTIVAL_EVENT_ID, ...ids).run();
    }
    return json({ ok: true, deleted: Number(result.meta?.changes || 0) }, request);
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

const MOSTRA_EVENT_ID = "mostra-cultural-consciencia-negra-2026";
const MOSTRA_DEFAULT_CONFIG = {
  title: "Mostra Cultural — Consciência Negra",
  description: "Centro de Ensino Médio 02 de Brazlândia · Avaliação de participação e reflexão.",
  active: false
};
const MOSTRA_CLASSES = [
  { id:"MA-A-1A",label:"1º A / ALEMANHA",turno:"Matutino",oferta:"A",serie:"1º ano" },
  { id:"MA-A-1B",label:"1º B / BRASIL",turno:"Matutino",oferta:"A",serie:"1º ano" },
  { id:"MA-A-1C",label:"1º C / CROÁCIA",turno:"Matutino",oferta:"A",serie:"1º ano" },
  { id:"MA-A-2A",label:"2º A / ARGENTINA",turno:"Matutino",oferta:"A",serie:"2º ano" },
  { id:"MA-A-2B",label:"2º B / URUGUAI",turno:"Matutino",oferta:"A",serie:"2º ano" },
  { id:"MA-A-2C",label:"2º C / COLÔMBIA",turno:"Matutino",oferta:"A",serie:"2º ano" },
  { id:"MA-A-3A",label:"3º A / AUSTRÁLIA",turno:"Matutino",oferta:"A",serie:"3º ano" },
  { id:"MA-A-3B",label:"3º B / BÉLGICA",turno:"Matutino",oferta:"A",serie:"3º ano" },
  { id:"MA-B-1D",label:"1º D / ÁFRICA DO SUL",turno:"Matutino",oferta:"B",serie:"1º ano" },
  { id:"MA-B-1E",label:"1º E / EGITO",turno:"Matutino",oferta:"B",serie:"1º ano" },
  { id:"MA-B-1F",label:"1º F / FRANÇA",turno:"Matutino",oferta:"B",serie:"1º ano" },
  { id:"MA-B-2D",label:"2º D / ARGÉLIA",turno:"Matutino",oferta:"B",serie:"2º ano" },
  { id:"MA-B-2E",label:"2º E / EQUADOR",turno:"Matutino",oferta:"B",serie:"2º ano" },
  { id:"MA-B-2F",label:"2º F / ESCÓCIA",turno:"Matutino",oferta:"B",serie:"2º ano" },
  { id:"MA-B-3C",label:"3º C / CANADÁ",turno:"Matutino",oferta:"B",serie:"3º ano" },
  { id:"MA-B-3D",label:"3º D / ARÁBIA SAUDITA",turno:"Matutino",oferta:"B",serie:"3º ano" },
  { id:"VE-A-1G",label:"1º G / GANA",turno:"Vespertino",oferta:"A",serie:"1º ano" },
  { id:"VE-A-1H",label:"1º H / HOLANDA",turno:"Vespertino",oferta:"A",serie:"1º ano" },
  { id:"VE-A-1I",label:"1º I / INGLATERRA",turno:"Vespertino",oferta:"A",serie:"1º ano" },
  { id:"VE-A-1J",label:"1º J / JAPÃO",turno:"Vespertino",oferta:"A",serie:"1º ano" },
  { id:"VE-A-2G",label:"2º G / COSTA DO MARFIM",turno:"Vespertino",oferta:"A",serie:"2º ano" },
  { id:"VE-A-2H",label:"2º H / HAITI",turno:"Vespertino",oferta:"A",serie:"2º ano" },
  { id:"VE-A-3E",label:"3º E / ESPANHA",turno:"Vespertino",oferta:"A",serie:"3º ano" },
  { id:"VE-A-3F",label:"3º F / ESTADOS UNIDOS",turno:"Vespertino",oferta:"A",serie:"3º ano" },
  { id:"VE-B-1K",label:"1º K / MARROCOS",turno:"Vespertino",oferta:"B",serie:"1º ano" },
  { id:"VE-B-1L",label:"1º L / PORTUGAL",turno:"Vespertino",oferta:"B",serie:"1º ano" },
  { id:"VE-B-1M",label:"1º M / MÉXICO",turno:"Vespertino",oferta:"B",serie:"1º ano" },
  { id:"VE-B-1N",label:"1º N / NORUEGA",turno:"Vespertino",oferta:"B",serie:"1º ano" },
  { id:"VE-B-2I",label:"2º I / IRÃ",turno:"Vespertino",oferta:"B",serie:"2º ano" },
  { id:"VE-B-2J",label:"2º J / JORDÂNIA",turno:"Vespertino",oferta:"B",serie:"2º ano" },
  { id:"VE-B-3G",label:"3º G / CATAR",turno:"Vespertino",oferta:"B",serie:"3º ano" },
  { id:"VE-B-3H",label:"3º H / TUNÍSIA",turno:"Vespertino",oferta:"B",serie:"3º ano" }
];
const MOSTRA_QUESTIONS = [
  { id:"q01",text:"Antes da diáspora africana, existiam no continente africano diferentes sociedades, reinos, línguas, culturas e formas de organização." },
  { id:"q02",text:"As contribuições africanas e afro-brasileiras para a formação do Brasil se limitam à história da escravidão." },
  { id:"q03",text:"O racismo acontece somente quando uma pessoa ofende outra diretamente; por isso, instituições e desigualdades sociais não podem reproduzi-lo." },
  { id:"q04",text:"A literatura negra brasileira pode abordar resistência, identidade, memória e ancestralidade, sem se limitar a histórias de sofrimento e violência." },
  { id:"q05",text:"Para conhecer as religiões de matriz africana, os estudantes devem simular rituais ou expor suas próprias crenças religiosas." },
  { id:"q06",text:"As desigualdades de saúde vividas pela população negra devem ser explicadas por uma suposta inferioridade biológica racial." },
  { id:"q07",text:"Valorizar mulheres negras na ciência, na política, na cultura e na comunidade ajuda a ampliar a representatividade e a reconhecer suas contribuições." },
  { id:"q08",text:"Fantasias caricatas e estereótipos são formas adequadas de representar manifestações culturais afro-brasileiras em uma mostra." },
  { id:"q09",text:"Diante de uma situação de racismo, é importante acolher a pessoa atingida, preservar sua privacidade e procurar os responsáveis e canais institucionais adequados." },
  { id:"q10",text:"O racismo ambiental pode ser observado quando determinados grupos enfrentam, de forma desigual, problemas como falta de saneamento, poluição e poucas áreas verdes." },
  { id:"q11",text:"As culturas africanas e afro-brasileiras contribuíram para diferentes aspectos da vida no Brasil, como a música, a culinária, a língua e os conhecimentos tradicionais." },
  { id:"q12",text:"Todas as pessoas negras têm as mesmas experiências, opiniões e tradições, sem diferenças entre elas." },
  { id:"q13",text:"Preconceito é uma ideia ou julgamento prévio sobre alguém; discriminação ocorre quando esse julgamento se transforma em tratamento desigual." },
  { id:"q14",text:"Rir de uma piada racista ou tratá-la como algo sem importância pode ajudar a normalizar o racismo." },
  { id:"q15",text:"Apresentar manifestações culturais afro-brasileiras com respeito inclui contextualizá-las e evitar estereótipos ou caricaturas." },
  { id:"q16",text:"A literatura de autoria negra deve falar apenas sobre escravidão e racismo, sem abordar outros temas." },
  { id:"q17",text:"As desigualdades de saúde podem estar relacionadas a fatores sociais, como acesso a serviços, condições de moradia e discriminação." },
  { id:"q18",text:"Políticas de ações afirmativas buscam enfrentar desigualdades históricas e ampliar oportunidades para grupos que foram discriminados." },
  { id:"q19",text:"A história e as contribuições da população negra devem ser lembradas somente durante o mês de novembro." },
  { id:"q20",text:"Ao presenciar uma situação de racismo na escola, é importante buscar ajuda de um adulto ou responsável, sem expor publicamente a pessoa atingida." }
];
const MOSTRA_ESSAY_QUESTION = "Qual ideia, história ou apresentação da mostra mais chamou sua atenção? O que ela fez você pensar sobre respeito, representatividade ou combate ao racismo?";

function mostraRandomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function mostraShuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    const j = bytes[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function mostraCleanName(value) {
  return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 100);
}
function mostraNameKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}
function mostraClassKey(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR");
  const match = normalized.match(/([1-3])\s*(?:º|O)?\s*(?:ANO\s*)?([A-N])/);
  return match ? match[1] + match[2] : normalized.replace(/[^A-Z0-9]/g, "");
}

async function ensureMostraSchema(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS salta_mostra_assessment_config (" +
    "event_id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS salta_mostra_assessment_attempts (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, device_hash TEXT NOT NULL, " +
    "attempt_token TEXT NOT NULL UNIQUE, student_name TEXT NOT NULL, student_key TEXT NOT NULL, " +
    "class_id TEXT NOT NULL, class_label TEXT NOT NULL, shift TEXT NOT NULL, offer TEXT NOT NULL, grade TEXT NOT NULL, " +
    "question_snapshot_json TEXT NOT NULL, answers_json TEXT NOT NULL DEFAULT '{}', discursive_answer TEXT NOT NULL DEFAULT '', " +
    "correct_count INTEGER, objective_score REAL, discursive_score REAL, final_score REAL, status TEXT NOT NULL DEFAULT 'started', " +
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_at TEXT, updated_at TEXT)"
  ).run();
  await env.DB.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_salta_mostra_one_device ON salta_mostra_assessment_attempts(event_id, device_hash)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_salta_mostra_class ON salta_mostra_assessment_attempts(event_id, shift, offer, grade, class_id)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS salta_mostra_question_bank (" +
    "event_id TEXT NOT NULL, question_id TEXT NOT NULL, question_text TEXT NOT NULL, answer_key TEXT NOT NULL, " +
    "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(event_id, question_id))"
  ).run();
  const questionCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM salta_mostra_question_bank WHERE event_id = ?")
    .bind(MOSTRA_EVENT_ID).first();
  if (Number(questionCount?.total || 0) === 0) {
    let privateAnswerKey = null;
    try { privateAnswerKey = JSON.parse(String(env.MOSTRA_ANSWER_KEY_JSON || "null")); } catch { privateAnswerKey = null; }
    const validPrivateKey = privateAnswerKey && MOSTRA_QUESTIONS.every(question =>
      ["C", "E"].includes(String(privateAnswerKey[question.id] || "").toUpperCase())
    );
    if (validPrivateKey) {
      try {
        await env.DB.batch(MOSTRA_QUESTIONS.map(question => env.DB.prepare(
          "INSERT INTO salta_mostra_question_bank (event_id, question_id, question_text, answer_key) VALUES (?, ?, ?, ?)"
        ).bind(MOSTRA_EVENT_ID, question.id, question.text, String(privateAnswerKey[question.id]).toUpperCase())));
      } catch (error) {
        if (!/unique|constraint/i.test(String(error?.message || error))) throw error;
      }
    }
  }
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS salta_mostra_grade_history (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, previous_score REAL, new_score REAL NOT NULL, " +
    "changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, changed_by TEXT NOT NULL)"
  ).run();
  await env.DB.prepare(
    "UPDATE salta_mostra_assessment_attempts SET objective_score = ROUND(correct_count * 0.2, 2), " +
    "discursive_score = NULL, final_score = ROUND(correct_count * 0.2, 2), updated_at = CURRENT_TIMESTAMP " +
    "WHERE event_id = ? AND status = 'submitted' AND correct_count IS NOT NULL AND (" +
    "objective_score IS NULL OR ABS(objective_score - correct_count * 0.2) > 0.001 OR " +
    "discursive_score IS NOT NULL OR final_score IS NULL OR ABS(final_score - correct_count * 0.2) > 0.001)"
  ).bind(MOSTRA_EVENT_ID).run();
}
async function getMostraConfig(env) {
  const row = await env.DB.prepare("SELECT config_json, updated_at FROM salta_mostra_assessment_config WHERE event_id = ? LIMIT 1")
    .bind(MOSTRA_EVENT_ID).first();
  let config = null;
  try { config = row ? JSON.parse(row.config_json) : null; } catch { config = null; }
  return { config: config || MOSTRA_DEFAULT_CONFIG, updatedAt: row?.updated_at || null };
}
async function getMostraQuestionBank(env) {
  const result = await env.DB.prepare(
    "SELECT question_id AS id, question_text AS text, answer_key AS answer FROM salta_mostra_question_bank " +
    "WHERE event_id = ? ORDER BY question_id"
  ).bind(MOSTRA_EVENT_ID).all();
  return result.results?.length
    ? result.results
    : MOSTRA_QUESTIONS.map(question => ({ ...question, answer: "" }));
}
function mostraPublicAttempt(row) {
  let snapshot = [];
  let answers = {};
  try { snapshot = JSON.parse(row.question_snapshot_json) || []; } catch { snapshot = []; }
  try { answers = JSON.parse(row.answers_json) || {}; } catch { answers = {}; }
  return {
    attemptToken: row.attempt_token,
    status: row.status,
    studentName: row.student_name,
    classId: row.class_id,
    questions: snapshot.map(question => ({ id: question.id, text: question.text })),
    answers,
    discursiveAnswer: row.discursive_answer || ""
  };
}
async function mostraDeviceHash(deviceId) {
  return sha256Hex("SALTA-MOSTRA-DEVICE-V1:" + deviceId);
}
async function handleMostraCulturalRoute(request, env, url) {
  await ensureMostraSchema(env);
  const path = url.pathname;

  if (path === "/mostra-cultural/public/config" && request.method === "GET") {
    const { config } = await getMostraConfig(env);
    return json({
      title: config.title || MOSTRA_DEFAULT_CONFIG.title,
      description: config.description || MOSTRA_DEFAULT_CONFIG.description,
      active: config.active === true,
      classes: MOSTRA_CLASSES,
      objectiveCount: 10,
      objectivePoints: 2,
      essayPoints: 0,
      essayQuestion: MOSTRA_ESSAY_QUESTION
    }, request);
  }

  if (path === "/mostra-cultural/public/start" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    const studentName = mostraCleanName(payload.student_name);
    const classId = String(payload.class_id || "").trim();
    const deviceId = String(payload.device_id || "").trim();
    if (studentName.length < 5) return json({ error: "Informe seu nome completo." }, request, 400);
    if (!/^[A-Za-z0-9-]{32,100}$/.test(deviceId)) return json({ error: "Não foi possível identificar este navegador. Atualize a página e tente novamente." }, request, 400);
    const selectedClass = MOSTRA_CLASSES.find(item => item.id === classId);
    if (!selectedClass) return json({ error: "Selecione uma turma válida." }, request, 400);
    const { config } = await getMostraConfig(env);
    const deviceHash = await mostraDeviceHash(deviceId);
    const existing = await env.DB.prepare(
      "SELECT * FROM salta_mostra_assessment_attempts WHERE event_id = ? AND device_hash = ? LIMIT 1"
    ).bind(MOSTRA_EVENT_ID, deviceHash).first();
    if (existing) {
      if (existing.status === "submitted") return json({ error: "Este aparelho já enviou uma avaliação. O sistema aceita somente uma resposta por aparelho." }, request, 409);
      return json({ ok: true, resumed: true, attempt: mostraPublicAttempt(existing) }, request);
    }
    if (config.active !== true) return json({ error: "A avaliação ainda não foi liberada pelo professor." }, request, 403);
    const questionBank = await getMostraQuestionBank(env);
    if (questionBank.length !== 20 || questionBank.some(question => !["C", "E"].includes(String(question.answer || "").toUpperCase()))) {
      return json({ error: "O professor ainda precisa configurar o gabarito das 20 questões antes de liberar a avaliação." }, request, 503);
    }
    const picked = mostraShuffle(questionBank).slice(0, 10);
    const token = mostraRandomToken();
    try {
      await env.DB.prepare(
        "INSERT INTO salta_mostra_assessment_attempts " +
        "(event_id, device_hash, attempt_token, student_name, student_key, class_id, class_label, shift, offer, grade, question_snapshot_json) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        MOSTRA_EVENT_ID, deviceHash, token, studentName, mostraNameKey(studentName),
        selectedClass.id, selectedClass.label, selectedClass.turno, selectedClass.oferta, selectedClass.serie,
        JSON.stringify(picked)
      ).run();
      const created = await env.DB.prepare("SELECT * FROM salta_mostra_assessment_attempts WHERE attempt_token = ? LIMIT 1").bind(token).first();
      return json({ ok: true, resumed: false, attempt: mostraPublicAttempt(created) }, request, 201);
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || error))) {
        const raced = await env.DB.prepare(
          "SELECT * FROM salta_mostra_assessment_attempts WHERE event_id = ? AND device_hash = ? LIMIT 1"
        ).bind(MOSTRA_EVENT_ID, deviceHash).first();
        if (raced?.status === "started") return json({ ok: true, resumed: true, attempt: mostraPublicAttempt(raced) }, request);
        return json({ error: "Este aparelho já possui uma avaliação registrada." }, request, 409);
      }
      throw error;
    }
  }

  if (path === "/mostra-cultural/public/progress" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    const token = String(payload.attempt_token || "").trim();
    const deviceId = String(payload.device_id || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(token) || !/^[A-Za-z0-9-]{32,100}$/.test(deviceId)) return json({ error: "Tentativa inválida." }, request, 400);
    const deviceHash = await mostraDeviceHash(deviceId);
    const attempt = await env.DB.prepare(
      "SELECT id, question_snapshot_json, status FROM salta_mostra_assessment_attempts WHERE event_id = ? AND attempt_token = ? AND device_hash = ? LIMIT 1"
    ).bind(MOSTRA_EVENT_ID, token, deviceHash).first();
    if (!attempt) return json({ error: "Esta avaliação não pertence a este navegador." }, request, 403);
    if (attempt.status !== "started") return json({ error: "Esta avaliação já foi enviada." }, request, 409);
    let snapshot = [];
    try { snapshot = JSON.parse(attempt.question_snapshot_json) || []; } catch { snapshot = []; }
    const allowed = new Set(snapshot.map(item => item.id));
    const rawAnswers = payload.answers && typeof payload.answers === "object" && !Array.isArray(payload.answers) ? payload.answers : {};
    const answers = {};
    for (const [id, value] of Object.entries(rawAnswers)) {
      if (!allowed.has(id) || !["C", "E"].includes(String(value))) return json({ error: "Uma resposta enviada é inválida." }, request, 400);
      answers[id] = String(value);
    }
    const discursive = String(payload.discursive_answer || "").trim();
    if (discursive.length > 4000) return json({ error: "A resposta discursiva aceita até 4.000 caracteres." }, request, 400);
    await env.DB.prepare(
      "UPDATE salta_mostra_assessment_attempts SET answers_json = ?, discursive_answer = ?, updated_at = CURRENT_TIMESTAMP " +
      "WHERE id = ? AND status = 'started'"
    ).bind(JSON.stringify(answers), discursive, attempt.id).run();
    return json({ ok: true }, request);
  }

  if (path === "/mostra-cultural/public/submit" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    const token = String(payload.attempt_token || "").trim();
    const deviceId = String(payload.device_id || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(token) || !/^[A-Za-z0-9-]{32,100}$/.test(deviceId)) return json({ error: "Tentativa inválida." }, request, 400);
    const deviceHash = await mostraDeviceHash(deviceId);
    const attempt = await env.DB.prepare(
      "SELECT * FROM salta_mostra_assessment_attempts WHERE event_id = ? AND attempt_token = ? AND device_hash = ? LIMIT 1"
    ).bind(MOSTRA_EVENT_ID, token, deviceHash).first();
    if (!attempt) return json({ error: "Esta avaliação não pertence a este navegador." }, request, 403);
    if (attempt.status === "submitted") return json({ error: "Esta avaliação já foi enviada. Não é possível enviar outra resposta deste aparelho." }, request, 409);
    let snapshot = [];
    try { snapshot = JSON.parse(attempt.question_snapshot_json) || []; } catch { snapshot = []; }
    let answersInput = payload.answers && typeof payload.answers === "object" && !Array.isArray(payload.answers) ? payload.answers : {};
    const expectedIds = snapshot.map(item => item.id);
    if (Object.keys(answersInput).length !== 10 || expectedIds.some(id => !Object.prototype.hasOwnProperty.call(answersInput, id))) {
      return json({ error: "Responda às 10 afirmações antes de enviar." }, request, 400);
    }
    const normalized = {};
    let correct = 0;
    for (const question of snapshot) {
      const value = String(answersInput[question.id] || "").toUpperCase();
      if (!["C", "E"].includes(value)) return json({ error: "Marque C ou E em todas as afirmações." }, request, 400);
      normalized[question.id] = value;
      if (value === question.answer) correct++;
    }
    const discursive = String(payload.discursive_answer || "").trim();
    if (discursive.length > 4000) return json({ error: "A reflexão aceita até 4.000 caracteres." }, request, 400);
    const objectiveScore = Math.round(correct * 0.2 * 100) / 100;
    const update = await env.DB.prepare(
      "UPDATE salta_mostra_assessment_attempts SET answers_json = ?, discursive_answer = ?, correct_count = ?, " +
      "objective_score = ?, discursive_score = NULL, final_score = ?, status = 'submitted', " +
      "submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP " +
      "WHERE id = ? AND status = 'started'"
    ).bind(JSON.stringify(normalized), discursive, correct, objectiveScore, objectiveScore, attempt.id).run();
    if (Number(update.meta?.changes || 0) !== 1) return json({ error: "Esta avaliação já foi enviada ou está sendo finalizada." }, request, 409);
    return json({ ok: true, message: "Avaliação enviada com sucesso. Obrigado pela participação!" }, request, 201);
  }

  if (!path.startsWith("/mostra-cultural/admin/")) return json({ error: "Rota não encontrada." }, request, 404);
  const origin = request.headers.get("Origin") || "";
  if (request.method !== "GET" && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origem não autorizada." }, request, 403);
  if (!(await authenticated(request, env))) return json({ error: "Acesso restrito. Entre na Área do Professor." }, request, 401);

  if (path === "/mostra-cultural/admin/data" && request.method === "GET") {
    const [{ config, updatedAt }, questionBank, result] = await Promise.all([
      getMostraConfig(env),
      getMostraQuestionBank(env),
      env.DB.prepare(
        "SELECT id, student_name, class_id, class_label, shift, offer, grade, question_snapshot_json, answers_json, " +
        "discursive_answer, correct_count, objective_score, discursive_score, final_score, status, created_at, submitted_at, updated_at " +
        "FROM salta_mostra_assessment_attempts WHERE event_id = ? AND status = 'submitted' ORDER BY submitted_at DESC LIMIT 2000"
      ).bind(MOSTRA_EVENT_ID).all()
    ]);
    const callOrderSource = "ordem alfabética pelo nome do estudante";
    const assessments = (result.results || []).map(row => {
      let questions = [];
      let answers = {};
      try { questions = JSON.parse(row.question_snapshot_json) || []; } catch { questions = []; }
      try { answers = JSON.parse(row.answers_json) || {}; } catch { answers = {}; }
      return { ...row, questions, answers };
    });
    const objectiveAverage = assessments.length
      ? assessments.reduce((sum, row) => sum + Number(row.objective_score || 0), 0) / assessments.length : null;
    const correctAverage = assessments.length
      ? assessments.reduce((sum, row) => sum + Number(row.correct_count || 0), 0) / assessments.length : null;
    const highestScore = assessments.length
      ? Math.max(...assessments.map(row => Number(row.objective_score || 0))) : null;
    const classesWithResponses = new Set(assessments.map(row => row.class_id)).size;
    return json({
      config, updatedAt,
      summary: {
        total: assessments.length,
        classesWithResponses,
        objectiveAverage: objectiveAverage === null ? null : Math.round(objectiveAverage * 100) / 100,
        correctAverage: correctAverage === null ? null : Math.round(correctAverage * 100) / 100,
        highestScore: highestScore === null ? null : Math.round(highestScore * 100) / 100
      },
      assessments,
      callOrderSource,
      classes: MOSTRA_CLASSES,
      questions: questionBank
    }, request);
  }

  if (path === "/mostra-cultural/admin/config" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    const title = String(payload.title || "").trim().slice(0, 120) || MOSTRA_DEFAULT_CONFIG.title;
    const description = String(payload.description || "").trim().slice(0, 500) || MOSTRA_DEFAULT_CONFIG.description;
    const current = await getMostraConfig(env);
    const config = { title, description, active: payload.active === true };
    await env.DB.prepare(
      "INSERT INTO salta_mostra_assessment_config (event_id, config_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
      "ON CONFLICT(event_id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP"
    ).bind(MOSTRA_EVENT_ID, JSON.stringify(config)).run();
    return json({ ok: true, config, previousActive: current.config.active === true }, request);
  }

  if (path === "/mostra-cultural/admin/questions" && request.method === "POST") {
    const payload = await festivalJsonBody(request);
    if (!payload || payload.error) return json({ error: payload?.error || "Requisição inválida." }, request, payload?.error ? 415 : 400);
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    const expectedIds = MOSTRA_QUESTIONS.map(question => question.id).sort();
    const suppliedIds = questions.map(question => String(question?.id || "").trim()).sort();
    if (questions.length !== 20 || expectedIds.some((id, index) => id !== suppliedIds[index])) {
      return json({ error: "O banco precisa conter exatamente as 20 questões originais, sem IDs repetidos ou ausentes." }, request, 400);
    }
    const normalized = questions.map(question => ({
      id: String(question.id).trim(),
      text: String(question.text || "").trim().slice(0, 1200),
      answer: String(question.answer || "").trim().toUpperCase()
    }));
    if (normalized.some(question => question.text.length < 10 || !["C", "E"].includes(question.answer))) {
      return json({ error: "Cada questão precisa ter enunciado e gabarito C ou E." }, request, 400);
    }
    await env.DB.batch(normalized.map(question => env.DB.prepare(
      "INSERT INTO salta_mostra_question_bank (event_id, question_id, question_text, answer_key, updated_at) " +
      "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(event_id, question_id) DO UPDATE SET " +
      "question_text = excluded.question_text, answer_key = excluded.answer_key, updated_at = CURRENT_TIMESTAMP"
    ).bind(MOSTRA_EVENT_ID, question.id, question.text, question.answer)));
    return json({ ok: true, updated: normalized.length }, request);
  }


  return json({ error: "Rota ou método administrativo não permitido." }, request, 405);
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


const DIARIO_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS salta_diario_classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, segment TEXT NOT NULL CHECK(segment IN ('regular','eja')), period_count INTEGER NOT NULL CHECK(period_count IN (2,4)), minimum REAL NOT NULL DEFAULT 5 CHECK(minimum >= 0 AND minimum <= 10), evaluation_system TEXT NOT NULL DEFAULT 'df' CHECK(evaluation_system IN ('df','goias')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS salta_diario_students (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES salta_diario_classes(id), name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(class_id, name COLLATE NOCASE))",
  "CREATE TABLE IF NOT EXISTS salta_diario_items (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES salta_diario_classes(id), period INTEGER NOT NULL CHECK(period BETWEEN 1 AND 4), title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('avaliacao','atividade','visto')), max_score REAL NOT NULL DEFAULT 0 CHECK(max_score >= 0 AND max_score <= 100), component TEXT NOT NULL DEFAULT 'outro', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS salta_diario_records (student_id INTEGER NOT NULL REFERENCES salta_diario_students(id), item_id INTEGER NOT NULL REFERENCES salta_diario_items(id), score REAL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(student_id,item_id))",
  "CREATE INDEX IF NOT EXISTS idx_salta_diario_students_class ON salta_diario_students(class_id,active,name)",
  "CREATE INDEX IF NOT EXISTS idx_salta_diario_items_class_period ON salta_diario_items(class_id,period,id)",
  "CREATE INDEX IF NOT EXISTS idx_salta_diario_records_item ON salta_diario_records(item_id,student_id)"
];

let diarioSchemaPromise;
async function ensureDiarioSchema(env) {
  if (!env.DIARIO_DB) throw new Error("Banco do Diário de Classe não configurado.");
  if (!diarioSchemaPromise) {
    diarioSchemaPromise = (async () => {
      await env.DIARIO_DB.batch(DIARIO_SCHEMA.map(sql => env.DIARIO_DB.prepare(sql)));
      const columns = await env.DIARIO_DB.prepare("PRAGMA table_info(salta_diario_students)").all();
      if (!(columns.results || []).some(column => column.name === "sort_order")) {
        await env.DIARIO_DB.prepare("ALTER TABLE salta_diario_students ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
      }
      const classColumns = await env.DIARIO_DB.prepare("PRAGMA table_info(salta_diario_classes)").all();
      if (!(classColumns.results || []).some(column => column.name === "evaluation_system")) {
        await env.DIARIO_DB.prepare("ALTER TABLE salta_diario_classes ADD COLUMN evaluation_system TEXT NOT NULL DEFAULT 'df'").run();
      }
      const itemColumns = await env.DIARIO_DB.prepare("PRAGMA table_info(salta_diario_items)").all();
      if (!(itemColumns.results || []).some(column => column.name === "component")) {
        await env.DIARIO_DB.prepare("ALTER TABLE salta_diario_items ADD COLUMN component TEXT NOT NULL DEFAULT 'outro'").run();
      }
      await env.DIARIO_DB.prepare("CREATE INDEX IF NOT EXISTS idx_salta_diario_students_order ON salta_diario_students(class_id,active,sort_order,id)").run();
    })().catch(error => {
      diarioSchemaPromise = undefined;
      throw error;
    });
  }
  await diarioSchemaPromise;
}

function normalizeDiarioStudentName(value) {
  let name = String(value || "").normalize("NFC").trim().replace(/\s+/g, " ");
  // Remove only a leading numeric identifier followed by a clear separator.
  name = name.replace(/^\s*#?\d{1,16}(?:\s*[-–—.)/|:]\s*|\s+)(?=\p{L})/u, "");
  return name.trim().replace(/\s+/g, " ");
}

function roundDiarioScore(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateDiarioPeriod(system, periodItems, recordMap, studentId) {
  const hasEntries = periodItems.some(item => recordMap.has(studentId + ":" + item.id));
  if (!hasEntries) return { media: null, componentes: null };
  const scoreFor = item => {
    const record = recordMap.get(studentId + ":" + item.id);
    return record?.score === null || record?.score === undefined ? 0 : Number(record.score);
  };
  const sum = predicate => periodItems.filter(predicate).reduce((total, item) => total + scoreFor(item), 0);
  const views = periodItems.filter(item => item.kind === "visto");
  const completedViews = views.reduce((total, item) => total + (recordMap.get(studentId + ":" + item.id)?.completed ? 1 : 0), 0);
  const notebook = views.length ? (completedViews / views.length) * (system === "goias" ? 10 : 2) : 0;

  if (system === "goias") {
    const study = sum(item => item.kind !== "visto" && ["estudo_dirigido", "outro"].includes(item.component));
    const blockItems = periodItems.filter(item => item.kind !== "visto" && item.component === "prova_bloco");
    const blockPossible = blockItems.reduce((total, item) => total + Number(item.max_score || 0), 0);
    const blockEarned = blockItems.reduce((total, item) => total + scoreFor(item), 0);
    const block = blockPossible ? (blockEarned / blockPossible) * 10 : 0;
    const base = Math.min(10, notebook * 0.3 + study * 0.3 + block * 0.4);
    const recoveryItems = periodItems.filter(item => item.kind !== "visto" && item.component === "recuperacao_final");
    const recoveryPossible = recoveryItems.reduce((total, item) => total + Number(item.max_score || 0), 0);
    const recoveryEarned = recoveryItems.reduce((total, item) => total + scoreFor(item), 0);
    const recovery = recoveryPossible ? (recoveryEarned / recoveryPossible) * 10 : null;
    const media = Math.min(10, roundDiarioScore(recovery !== null && recovery > base ? (base + recovery) / 2 : base));
    return { media, componentes: { caderno: roundDiarioScore(notebook), estudoDirigido: roundDiarioScore(study), provaBloco: blockPossible ? roundDiarioScore(blockEarned) + "/" + roundDiarioScore(blockPossible) : "—", notaBase: roundDiarioScore(base), recuperacao: recovery === null ? null : roundDiarioScore(recovery), recuperacaoAplicada: recovery !== null && recovery > base, media } };
  }

  const study = sum(item => item.kind !== "visto" && item.component === "estudo_dirigido");
  const studyRecovery = sum(item => item.kind !== "visto" && item.component === "recuperacao_estudo");
  const studyAfterRecovery = Math.max(study, studyRecovery);
  const proof = sum(item => item.kind !== "visto" && item.component === "prova");
  const essay = sum(item => item.kind !== "visto" && item.component === "redacao");
  const other = sum(item => item.kind !== "visto" && item.component === "outro");
  const media = Math.min(10, roundDiarioScore(notebook + studyAfterRecovery + proof + essay + other));
  return { media, componentes: { caderno: roundDiarioScore(notebook), estudoAntesRecuperacao: roundDiarioScore(study), estudoDirigido: roundDiarioScore(studyAfterRecovery), recuperacaoEstudo: studyRecovery ? roundDiarioScore(studyRecovery) : null, recuperacaoAplicada: studyRecovery > study, prova: roundDiarioScore(proof), redacao: roundDiarioScore(essay), outros: roundDiarioScore(other), media } };
}

function diarioError(message, request, status = 400) {
  return json({ error: message }, request, status);
}

async function diarioJson(request) {
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return null;
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 1000000) return null;
  return request.json().catch(() => null);
}

async function handleDiarioRequest(request, env, url) {
  if (!(await authenticated(request, env))) return diarioError("Acesso restrito. Entre novamente na Área Administrativa.", request, 401);
  try { await ensureDiarioSchema(env); }
  catch { return diarioError("A base online do Diário de Classe ainda não está disponível.", request, 503); }

  const db = env.DIARIO_DB;
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (method === "GET" && path === "/diario/resumo") {
    const [classes, students, items] = await Promise.all([
      db.prepare("SELECT c.id,c.name,c.segment,c.period_count,c.minimum,c.evaluation_system,COUNT(DISTINCT s.id) AS student_count,COUNT(DISTINCT i.id) AS item_count FROM salta_diario_classes c LEFT JOIN salta_diario_students s ON s.class_id=c.id AND s.active=1 LEFT JOIN salta_diario_items i ON i.class_id=c.id GROUP BY c.id ORDER BY c.name").all(),
      db.prepare("SELECT COUNT(*) AS total FROM salta_diario_students WHERE active=1").first(),
      db.prepare("SELECT COUNT(*) AS total FROM salta_diario_items").first()
    ]);
    return json({ turmas: classes.results || [], totalAlunos: Number(students?.total || 0), totalRegistros: Number(items?.total || 0) }, request);
  }

  if (method === "POST" && path === "/diario/turmas") {
    const body = await diarioJson(request);
    const name = String(body?.name || "").trim();
    const segment = String(body?.segment || "").trim().toLowerCase();
    const minimum = Number(body?.minimum);
    const evaluationSystem = String(body?.evaluation_system || "df").trim().toLowerCase();
    if (!name || name.length > 100 || !["regular", "eja"].includes(segment) || !["df", "goias"].includes(evaluationSystem) || !Number.isFinite(minimum) || minimum < 0 || minimum > 10) return diarioError("Informe turma, segmento, modelo avaliativo e média mínima entre 0 e 10.", request);
    const count = segment === "eja" ? 2 : 4;
    try {
      const result = await db.prepare("INSERT INTO salta_diario_classes (name,segment,period_count,minimum,evaluation_system) VALUES (?,?,?,?,?)").bind(name, segment, count, Math.round(minimum * 100) / 100, evaluationSystem).run();
      return json({ ok: true, id: result.meta?.last_row_id }, request, 201);
    } catch (error) {
      if (/unique/i.test(String(error?.message || error))) return diarioError("Já existe uma turma com esse nome.", request, 409);
      throw error;
    }
  }

  const classMatch = path.match(/^\/diario\/turmas\/(\d+)$/);
  if (classMatch && method === "PUT") {
    const body = await diarioJson(request);
    const id = Number(classMatch[1]);
    const name = String(body?.name || "").trim();
    const segment = String(body?.segment || "").trim().toLowerCase();
    const minimum = Number(body?.minimum);
    const evaluationSystem = String(body?.evaluation_system || "df").trim().toLowerCase();
    if (!Number.isSafeInteger(id) || !name || name.length > 100 || !["regular", "eja"].includes(segment) || !["df", "goias"].includes(evaluationSystem) || !Number.isFinite(minimum) || minimum < 0 || minimum > 10) return diarioError("Dados da turma inválidos.", request);
    const currentClass = await db.prepare("SELECT evaluation_system FROM salta_diario_classes WHERE id=?").bind(id).first();
    if (!currentClass) return diarioError("Turma não encontrada.", request, 404);
    if (currentClass.evaluation_system !== evaluationSystem) {
      const existingItems = await db.prepare("SELECT COUNT(*) AS total FROM salta_diario_items WHERE class_id=?").bind(id).first();
      if (Number(existingItems?.total || 0) > 0) return diarioError("O modelo avaliativo não pode ser trocado depois que a turma recebe avaliações. Isso poderia mudar o cálculo de notas já lançadas.", request, 409);
    }
    const nextPeriodCount = segment === "eja" ? 2 : 4;
    const laterItems = await db.prepare("SELECT COUNT(*) AS total FROM salta_diario_items WHERE class_id=? AND period>?").bind(id, nextPeriodCount).first();
    if (Number(laterItems?.total || 0) > 0) return diarioError("Não é possível reduzir os bimestres desta turma enquanto houver registros nos períodos posteriores.", request, 409);
    try {
      const result = await db.prepare("UPDATE salta_diario_classes SET name=?,segment=?,period_count=?,minimum=?,evaluation_system=? WHERE id=?").bind(name, segment, nextPeriodCount, Math.round(minimum * 100) / 100, evaluationSystem, id).run();
      if (!result.meta?.changes) return diarioError("Turma não encontrada.", request, 404);
      return json({ ok: true }, request);
    } catch (error) {
      if (/unique/i.test(String(error?.message || error))) return diarioError("Já existe uma turma com esse nome.", request, 409);
      throw error;
    }
  }

  if (method === "GET" && path === "/diario/alunos") {
    const classId = Number(url.searchParams.get("turma"));
    if (!Number.isSafeInteger(classId) || classId < 1) return diarioError("Selecione uma turma.", request);
    const result = await db.prepare("SELECT id,class_id,name,sort_order FROM salta_diario_students WHERE class_id=? AND active=1 ORDER BY sort_order,id").bind(classId).all();
    return json({ alunos: result.results || [] }, request);
  }

  if (method === "POST" && path === "/diario/alunos") {
    const body = await diarioJson(request);
    const classId = Number(body?.class_id);
    const name = normalizeDiarioStudentName(body?.name);
    if (!Number.isSafeInteger(classId) || classId < 1 || !name || name.length > 160) return diarioError("Informe o nome do aluno e uma turma válida.", request);
    if (!(await db.prepare("SELECT id FROM salta_diario_classes WHERE id=?").bind(classId).first())) return diarioError("Turma não encontrada.", request, 404);
    try {
      const existing = await db.prepare("SELECT id,active FROM salta_diario_students WHERE class_id=? AND name=? COLLATE NOCASE").bind(classId, name).first();
      const order = await db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM salta_diario_students WHERE class_id=? AND active=1").bind(classId).first();
      if (existing && Number(existing.active) === 1) return diarioError("Esse aluno já está cadastrado nesta turma.", request, 409);
      if (existing) {
        await db.prepare("UPDATE salta_diario_students SET active=1,sort_order=? WHERE id=?").bind(Number(order?.next_order || 0), existing.id).run();
        return json({ ok: true, id: existing.id, reactivated: true }, request);
      }
      const result = await db.prepare("INSERT INTO salta_diario_students (class_id,name,sort_order) VALUES (?,?,?)").bind(classId, name, Number(order?.next_order || 0)).run();
      return json({ ok: true, id: result.meta?.last_row_id }, request, 201);
    } catch (error) {
      if (/unique/i.test(String(error?.message || error))) return diarioError("Esse aluno já está cadastrado nesta turma.", request, 409);
      throw error;
    }
  }

  const studentMatch = path.match(/^\/diario\/alunos\/(\d+)$/);
  if (method === "DELETE" && studentMatch) {
    const studentId = Number(studentMatch[1]);
    if (!Number.isSafeInteger(studentId) || studentId < 1) return diarioError("Aluno inválido.", request);
    const result = await db.prepare("UPDATE salta_diario_students SET active=0 WHERE id=? AND active=1").bind(studentId).run();
    if (!result.meta?.changes) return diarioError("Aluno não encontrado ou já removido da turma.", request, 404);
    return json({ ok: true }, request);
  }

  if (method === "POST" && path === "/diario/alunos/lote") {
    const body = await diarioJson(request);
    const classId = Number(body?.class_id);
    const entries = Array.isArray(body?.entries) ? body.entries : [];
    if (!Number.isSafeInteger(classId) || classId < 1 || !entries.length || entries.length > 500) return diarioError("Selecione uma turma e envie uma lista de até 500 alunos.", request);
    if (!(await db.prepare("SELECT id FROM salta_diario_classes WHERE id=?").bind(classId).first())) return diarioError("Turma não encontrada.", request, 404);

    const cleaned = [];
    const seen = new Set();
    let invalid = 0;
    for (const entry of entries) {
      const name = normalizeDiarioStudentName(typeof entry === "string" ? entry : entry?.name);
      if (!name || name.length > 160) { invalid++; continue; }
      const key = name.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(name);
    }
    if (!cleaned.length) return diarioError("Não encontrei nomes válidos na lista. Confira a prévia e tente novamente.", request);

    const existing = await db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM salta_diario_students WHERE class_id=? AND active=1").bind(classId).first();
    let nextOrder = Number(existing?.next_order || 0);
    let added = 0;
    for (let offset = 0; offset < cleaned.length; offset += 50) {
      const batchEntries = cleaned.slice(offset, offset + 50);
      const statements = batchEntries.flatMap(name => {
        const sortOrder = nextOrder++;
        return [
          db.prepare("UPDATE salta_diario_students SET active=1,sort_order=? WHERE class_id=? AND name COLLATE NOCASE=? AND active=0").bind(sortOrder, classId, name),
          db.prepare("INSERT OR IGNORE INTO salta_diario_students (class_id,name,sort_order) VALUES (?,?,?)").bind(classId, name, sortOrder)
        ];
      });
      const results = await db.batch(statements);
      for (const result of results) added += Number(result.meta?.changes || 0);
    }
    return json({ ok: true, added, duplicates: cleaned.length - added, invalid }, request, 201);
  }

  if (method === "PUT" && path === "/diario/alunos/ordem") {
    const body = await diarioJson(request);
    const classId = Number(body?.class_id);
    const studentIds = Array.isArray(body?.student_ids) ? body.student_ids.map(Number) : [];
    if (!Number.isSafeInteger(classId) || classId < 1 || !studentIds.length || studentIds.length > 500 || studentIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(studentIds).size !== studentIds.length) return diarioError("A nova ordem dos alunos é inválida.", request);
    const marks = studentIds.map(() => "?").join(",");
    const found = await db.prepare("SELECT id FROM salta_diario_students WHERE class_id=? AND active=1 AND id IN (" + marks + ")").bind(classId, ...studentIds).all();
    const total = await db.prepare("SELECT COUNT(*) AS total FROM salta_diario_students WHERE class_id=? AND active=1").bind(classId).first();
    if ((found.results || []).length !== studentIds.length || Number(total?.total || 0) !== studentIds.length) return diarioError("A lista mudou enquanto era reordenada. Atualize a turma e tente novamente.", request, 409);
    await db.batch(studentIds.map((id, index) => db.prepare("UPDATE salta_diario_students SET sort_order=? WHERE class_id=? AND id=? AND active=1").bind(index, classId, id)));
    return json({ ok: true }, request);
  }

  if (method === "GET" && path === "/diario/itens") {
    const classId = Number(url.searchParams.get("turma"));
    const period = Number(url.searchParams.get("bimestre"));
    const turma = await db.prepare("SELECT period_count,evaluation_system FROM salta_diario_classes WHERE id=?").bind(classId).first();
    if (!turma) return diarioError("Turma não encontrada.", request, 404);
    if (!Number.isInteger(period) || period < 1 || period > turma.period_count) return diarioError("Bimestre inválido para esta turma.", request);
    const result = await db.prepare("SELECT id,class_id,period,title,kind,max_score,component FROM salta_diario_items WHERE class_id=? AND period=? ORDER BY id DESC").bind(classId, period).all();
    return json({ itens: result.results || [] }, request);
  }

  if (method === "POST" && path === "/diario/itens") {
    const body = await diarioJson(request);
    const classId = Number(body?.class_id);
    const period = Number(body?.period);
    const title = String(body?.title || "").trim();
    const kind = String(body?.kind || "").trim().toLowerCase();
    const component = kind === "visto" ? "caderno" : String(body?.component || "outro").trim().toLowerCase();
    const maxScore = kind === "visto" ? 0 : Number(body?.max_score);
    const turma = await db.prepare("SELECT period_count,evaluation_system FROM salta_diario_classes WHERE id=?").bind(classId).first();
    if (!turma) return diarioError("Turma não encontrada.", request, 404);
    const components = turma.evaluation_system === "goias" ? ["estudo_dirigido", "prova_bloco", "recuperacao_final", "outro"] : ["estudo_dirigido", "prova", "redacao", "recuperacao_estudo", "outro"];
    if (!Number.isInteger(period) || period < 1 || period > turma.period_count || !title || title.length > 120 || !["avaliacao", "atividade", "visto"].includes(kind) || (kind !== "visto" && !components.includes(component)) || !Number.isFinite(maxScore) || maxScore < 0 || maxScore > 100 || (kind !== "visto" && maxScore <= 0)) return diarioError("Confira o bimestre, o nome, o componente e a pontuação máxima do registro.", request);
    const result = await db.prepare("INSERT INTO salta_diario_items (class_id,period,title,kind,max_score,component) VALUES (?,?,?,?,?,?)").bind(classId, period, title, kind, maxScore, component).run();
    return json({ ok: true, id: result.meta?.last_row_id }, request, 201);
  }

  const itemMatch = path.match(/^\/diario\/itens\/(\d+)$/);
  if (method === "PUT" && itemMatch) {
    const body = await diarioJson(request);
    const id = Number(itemMatch[1]);
    const title = String(body?.title || "").trim();
    const component = String(body?.component || "").trim().toLowerCase();
    const item = await db.prepare("SELECT id,class_id,kind,max_score FROM salta_diario_items WHERE id=?").bind(id).first();
    if (!item) return diarioError("Registro não encontrado.", request, 404);
    const turma = await db.prepare("SELECT evaluation_system FROM salta_diario_classes WHERE id=?").bind(item.class_id).first();
    const components = item.kind === "visto" ? ["caderno"] : turma?.evaluation_system === "goias" ? ["estudo_dirigido", "prova_bloco", "recuperacao_final", "outro"] : ["estudo_dirigido", "prova", "redacao", "recuperacao_estudo", "outro"];
    const maxScore = item.kind === "visto" ? 0 : Number(body?.max_score);
    if (!title || title.length > 120 || !components.includes(component) || !Number.isFinite(maxScore) || maxScore < 0 || maxScore > 100 || (item.kind !== "visto" && maxScore <= 0)) return diarioError("Confira o nome, o componente e o valor máximo do registro.", request);
    const excessive = await db.prepare("SELECT COUNT(*) AS total FROM salta_diario_records WHERE item_id=? AND score>?").bind(id, maxScore).first();
    if (Number(excessive?.total || 0) > 0) return diarioError("O novo valor máximo fica abaixo de notas já lançadas. Ajuste as notas antes de reduzir o máximo.", request, 409);
    await db.prepare("UPDATE salta_diario_items SET title=?,component=?,max_score=? WHERE id=?").bind(title, component, maxScore, id).run();
    return json({ ok: true }, request);
  }

  if (method === "GET" && path === "/diario/notas") {
    const classId = Number(url.searchParams.get("turma"));
    const period = Number(url.searchParams.get("bimestre"));
    const turma = await db.prepare("SELECT period_count FROM salta_diario_classes WHERE id=?").bind(classId).first();
    if (!turma) return diarioError("Turma não encontrada.", request, 404);
    if (!Number.isInteger(period) || period < 1 || period > turma.period_count) return diarioError("Bimestre inválido para esta turma.", request);
    const [students, items, records] = await Promise.all([
      db.prepare("SELECT id,name FROM salta_diario_students WHERE class_id=? AND active=1 ORDER BY sort_order,id").bind(classId).all(),
      db.prepare("SELECT id,title,kind,max_score,component FROM salta_diario_items WHERE class_id=? AND period=? ORDER BY id").bind(classId, period).all(),
      db.prepare("SELECT r.student_id,r.item_id,r.score,r.completed FROM salta_diario_records r INNER JOIN salta_diario_students s ON s.id=r.student_id INNER JOIN salta_diario_items i ON i.id=r.item_id WHERE s.class_id=? AND i.period=?").bind(classId, period).all()
    ]);
    return json({ alunos: students.results || [], itens: items.results || [], registros: records.results || [] }, request);
  }

  if (method === "PUT" && path === "/diario/notas") {
    const body = await diarioJson(request);
    const itemId = Number(body?.item_id);
    const rows = Array.isArray(body?.registros) ? body.registros : [];
    if (!Number.isSafeInteger(itemId) || rows.length > 1000) return diarioError("Lote de notas inválido.", request);
    const item = await db.prepare("SELECT id,class_id,kind,max_score FROM salta_diario_items WHERE id=?").bind(itemId).first();
    if (!item) return diarioError("Avaliação ou atividade não encontrada.", request, 404);
    const studentIds = [...new Set(rows.map(row => Number(row?.student_id)))];
    if (studentIds.some(id => !Number.isSafeInteger(id) || id < 1)) return diarioError("Há um aluno inválido no lote.", request);
    if (studentIds.length) {
      const marks = studentIds.map(() => "?").join(",");
      const found = await db.prepare("SELECT id FROM salta_diario_students WHERE class_id=? AND active=1 AND id IN (" + marks + ")").bind(item.class_id, ...studentIds).all();
      if ((found.results || []).length !== studentIds.length) return diarioError("Uma ou mais pessoas não pertencem a esta turma.", request, 400);
    }
    if (item.kind !== "visto" && rows.some(row => {
      const value = row.score === "" || row.score === null || row.score === undefined ? null : Number(row.score);
      return value !== null && (!Number.isFinite(value) || value < 0 || value > Number(item.max_score));
    })) return diarioError("Cada nota deve ficar entre zero e o valor máximo do item.", request);
    const statements = rows.map(row => {
      const studentId = Number(row.student_id);
      if (item.kind === "visto") {
        const completed = row.completed === true || row.completed === 1 ? 1 : 0;
        return db.prepare("INSERT INTO salta_diario_records (student_id,item_id,score,completed,updated_at) VALUES (?,?,NULL,?,CURRENT_TIMESTAMP) ON CONFLICT(student_id,item_id) DO UPDATE SET completed=excluded.completed,updated_at=CURRENT_TIMESTAMP").bind(studentId, itemId, completed);
      }
      const raw = row.score === "" || row.score === null || row.score === undefined ? null : Number(row.score);
      if (raw === null) return db.prepare("DELETE FROM salta_diario_records WHERE student_id=? AND item_id=?").bind(studentId, itemId);
      return db.prepare("INSERT INTO salta_diario_records (student_id,item_id,score,completed,updated_at) VALUES (?,?,?,0,CURRENT_TIMESTAMP) ON CONFLICT(student_id,item_id) DO UPDATE SET score=excluded.score,updated_at=CURRENT_TIMESTAMP").bind(studentId, itemId, raw);
    });
    if (statements.length) await db.batch(statements);
    return json({ ok: true, saved: statements.length }, request);
  }

  if (method === "GET" && path === "/diario/relatorios") {
    const selectedClass = (url.searchParams.get("turma") || "todas").trim();
    const period = (url.searchParams.get("bimestre") || "1").trim().toLowerCase();
    const classesResult = await db.prepare("SELECT id,name,segment,period_count,minimum,evaluation_system FROM salta_diario_classes ORDER BY name").all();
    const classes = classesResult.results || [];
    const chosen = selectedClass === "todas" ? classes : classes.filter(row => row.id === Number(selectedClass));
    if (selectedClass !== "todas" && !chosen.length) return diarioError("Turma não encontrada.", request, 404);
    if (!chosen.length) return json({ turmas: [], alunos: [], periodo: period }, request);
    const ids = chosen.map(row => row.id);
    const classMarks = ids.map(() => "?").join(",");
    const [students, items, records] = await Promise.all([
      db.prepare("SELECT s.id,s.class_id,s.name,s.sort_order,c.name AS turma,c.segment,c.period_count,c.minimum,c.evaluation_system FROM salta_diario_students s INNER JOIN salta_diario_classes c ON c.id=s.class_id WHERE s.active=1 AND s.class_id IN (" + classMarks + ") ORDER BY c.name,s.sort_order,s.id").bind(...ids).all(),
      db.prepare("SELECT id,class_id,period,title,kind,max_score,component FROM salta_diario_items WHERE class_id IN (" + classMarks + ") ORDER BY class_id,period,id").bind(...ids).all(),
      db.prepare("SELECT r.student_id,r.item_id,r.score,r.completed FROM salta_diario_records r INNER JOIN salta_diario_students s ON s.id=r.student_id INNER JOIN salta_diario_items i ON i.id=r.item_id WHERE s.class_id IN (" + classMarks + ")").bind(...ids).all()
    ]);
    const itemRows = items.results || [];
    const recordMap = new Map((records.results || []).map(row => [row.student_id + ":" + row.item_id, row]));
    const studentsWithGrades = (students.results || []).map(student => {
      const periodAverages = [];
      const periodComponents = [];
      let seenCount = 0;
      const allItemRecords = [];
      for (let p = 1; p <= student.period_count; p++) {
        const periodItems = itemRows.filter(item => item.class_id === student.class_id && item.period === p);
        for (const item of periodItems) {
          const record = recordMap.get(student.id + ":" + item.id);
          const score = record?.score === null || record?.score === undefined ? null : Number(record.score);
          if (record) allItemRecords.push({ id: item.id, periodo: p, titulo: item.title, tipo: item.kind, componente: item.component, nota: score, maximo: Number(item.max_score), feito: item.kind === "visto" ? Boolean(record.completed) : undefined });
        }
        const calculation = calculateDiarioPeriod(student.evaluation_system, periodItems, recordMap, student.id);
        periodAverages.push(calculation.media);
        periodComponents.push(calculation.componentes);
        for (const item of periodItems.filter(item => item.kind === "visto")) {
          const record = recordMap.get(student.id + ":" + item.id);
          if (record?.completed) seenCount++;
        }
      }
      const finalAverage = Math.round((periodAverages.reduce((sum, value) => sum + (value ?? 0), 0) / student.period_count) * 100) / 100;
      const periodNumber = Number(period);
      const average = period === "final" ? finalAverage : periodAverages[periodNumber - 1] ?? null;
      return { id: student.id, class_id: student.class_id, nome: student.name, turma: student.turma, segmento: student.segment, modeloAvaliativo: student.evaluation_system, quantidadeBimestres: student.period_count, mediaMinima: Number(student.minimum), media: average, mediaFinal: finalAverage, mediasBimestrais: periodAverages, componentesBimestrais: periodComponents, vistos: seenCount, registros: allItemRecords };
    });
    const formulas = [...new Set(chosen.map(row => row.evaluation_system))].map(system => system === "goias" ? "Goiás: caderno 30% + estudo dirigido 30% + prova de bloco 40%; recuperação usa a média entre a nota base e a recuperação somente quando melhora o resultado." : "DF: caderno até 2 pontos + estudo dirigido + prova + redação; a recuperação substitui o estudo dirigido somente quando for maior. Componentes somados em escala de 10.");
    formulas.push("Média final: média aritmética dos períodos do segmento (4 no regular ou 2 na EJA); períodos sem nota contam como zero.");
    return json({ turmas: chosen, itens: itemRows, alunos: studentsWithGrades, periodo: period, formula: formulas.join(" ") }, request);
  }

  return diarioError("Rota do Diário de Classe não encontrada.", request, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/mostra-cultural/")) {
      try { return await handleMostraCulturalRoute(request, env, url); }
      catch (error) { return json({ error: "Não foi possível processar a avaliação da Mostra Cultural." }, request, 500); }
    }
    if (url.pathname.startsWith("/festival/")) {
      try { return await handleFestivalRoute(request, env, url); }
      catch { return json({ error: "Não foi possível processar a avaliação do festival." }, request, 500); }
    }
    if (url.pathname.startsWith("/auth/")) {
      return proxyAuth(request, env, url);
    }
    if (url.pathname.startsWith("/diario/")) {
      try { return await handleDiarioRequest(request, env, url); }
      catch { return json({ error: "Não foi possível processar o Diário de Classe." }, request, 500); }
    }
    if (url.pathname.startsWith("/comms/")) {
      return handleCommsRequest(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/public/student-lookup") {
      let payload;
      try { payload = await request.json(); }
      catch { return json({ error: "Requisição inválida." }, request, 400); }

      const codigo = String(payload?.codigo || "").trim().toUpperCase();
      if (!validStudentCode(codigo)) {
        return json({ error: "Código inválido." }, request, 400);
      }
      if (!env.TURNSTILE_SECRET_KEY) {
        return json({ error: "A consulta está temporariamente indisponível." }, request, 503);
      }
      if (!(await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, payload?.turnstileToken, request, "student_lookup"))) {
        return json({ error: "A verificação de segurança não foi concluída. Tente novamente." }, request, 403);
      }

      try {
        // Consulta diretamente a base atual da SALTA. O endpoint legado
        // portal-aluno-api não é mais necessário para localizar estudantes.
        const student = await env.DB.prepare(
          "SELECT codigo, nome, turma, ultima_atualizacao, " +
          "bimestre1_status,bimestre1_media,bimestre1_vistos,bimestre1_avaliacoes," +
          "bimestre2_status,bimestre2_media,bimestre2_vistos,bimestre2_avaliacoes," +
          "bimestre3_status,bimestre3_media,bimestre3_vistos,bimestre3_avaliacoes," +
          "bimestre4_status,bimestre4_media,bimestre4_vistos,bimestre4_avaliacoes " +
          "FROM alunos WHERE codigo = ? LIMIT 1"
        ).bind(codigo).first();

        if (!student) {
          return json({ error: "Código não encontrado. Confira os caracteres e tente novamente." }, request, 404);
        }
        if (!String(student.nome || "").trim() || !String(student.turma || "").trim()) {
          return json({ error: "A ficha deste aluno está incompleta. Procure o Professor Dannyel." }, request, 409);
        }

        const config = await turmaConfig(env, student.turma);
        await ensureCommsSchema(env);
        await env.DB.prepare(
          "INSERT INTO salta_student_access_logs (student_code) VALUES (?)"
        ).bind(student.codigo).run();

        return json({ ...student, ...turmaRulePayload(student.turma, config) }, request);
      } catch (error) {
        return json({ error: "Não foi possível consultar a ficha agora. Tente novamente." }, request, 500);
      }
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
