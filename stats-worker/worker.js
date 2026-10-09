const AUTH_API_URL = "https://salta-auth.dannyel-moises.workers.dev";
const ALLOWED_ORIGIN = "https://d4nny3l.github.io";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = origin;
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

function cookieToken(request) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const item = part.trim();
    if (item.startsWith("salta_session=")) return decodeURIComponent(item.slice("salta_session=".length));
  }
  return "";
}

async function authenticated(request, env) {
  const header = request.headers.get("Authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const cookie = cookieToken(request);
  const token = bearer || cookie;
  if (!token) return false;

  const authRequest = new Request("https://salta-auth/session", {
    method: "GET",
    headers: { Authorization: "Bearer " + token }
  });

  const response = env.AUTH
    ? await env.AUTH.fetch(authRequest)
    : await fetch(AUTH_API_URL + "/session", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store"
      });

  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return data.authenticated === true;
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
    const rule = inferTurmaRule(turma, [row.bimestre1, row.bimestre2, row.bimestre3, row.bimestre4]);

    await env.DB.prepare(
      "INSERT INTO turma_config (turma, rede, media_minima, modelo_avaliativo) " +
      "VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(turma) DO UPDATE SET " +
      "rede = excluded.rede, media_minima = excluded.media_minima, " +
      "modelo_avaliativo = excluded.modelo_avaliativo, atualizado_em = CURRENT_TIMESTAMP " +
      "WHERE turma_config.rede <> excluded.rede " +
      "OR turma_config.media_minima <> excluded.media_minima " +
      "OR turma_config.modelo_avaliativo <> excluded.modelo_avaliativo"
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

  const porAluno = alunos
    .filter(a => a.mediaSelecionada !== null)
    .sort((a, b) => b.mediaSelecionada - a.mediaSelecionada)
    .map(a => ({
      codigo: a.codigo,
      nome: a.nome,
      media: round1(a.mediaSelecionada),
      vistos: round1(a.vistos)
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
}

function validStudentCode(value) {
  return /^2026[A-Z]{1,4}$/.test(String(value || "").trim().toUpperCase());
}

function trimLimited(value, max) {
  return String(value || "").trim().slice(0, max);
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

      const announcements = await env.DB.prepare(
        "SELECT m.id, m.scope, m.title, m.body, m.sender_name, m.created_at, r.read_at, " +
        "CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS is_read " +
        "FROM salta_comms_messages m LEFT JOIN salta_comms_announcement_reads r " +
        "ON r.announcement_id = m.id AND r.student_code = ? " +
        "WHERE m.kind = 'announcement' AND m.active = 1 AND " +
        "(m.scope = 'global' OR (m.scope = 'individual' AND m.student_code = ?)) " +
        "ORDER BY datetime(m.created_at) DESC LIMIT 100"
      ).bind(code, code).all();

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
          "(scope = 'global' OR (scope = 'individual' AND student_code = ?)) LIMIT 1"
        ).bind(id, code).first();
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
          "SELECT id, scope, turma, student_code, sender_name, title, body, created_at, active " +
          "FROM salta_comms_messages WHERE kind = 'announcement' AND scope IN ('global', 'individual') " +
          "ORDER BY datetime(created_at) DESC LIMIT 100"
        ).all();
        return json({ announcements: result.results || [] }, request);
      }

      if (path === "/comms/teacher/announcement" && method === "POST") {
        const payload = await request.json().catch(() => null);
        if (!payload) return json({ error: "Aviso inválido." }, request, 400);

        const scope = String(payload.scope || "").trim();
        const title = trimLimited(payload.title, COMMS_MAX_TITLE);
        const body = trimLimited(payload.body, COMMS_MAX_BODY);
        if (!["global", "individual"].includes(scope)) {
          return json({ error: "Escolha um aviso global ou individual." }, request, 400);
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

    if (request.method !== "GET") {
      return json({ error: "Método não permitido." }, request, 405);
    }
    if (!(await authenticated(request, env))) {
      return json({ error: "Acesso restrito." }, request, 401);
    }

    try {
      if (url.pathname === "/health") {
        return json({ ok: true, service: "salta-stats" }, request);
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
