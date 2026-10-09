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

function mean(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function bCount(turma) {
  return String(turma || "").toUpperCase().includes("EJA") ? 2 : 4;
}

async function ensureTurmaConfig(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS turma_config (" +
    "turma TEXT PRIMARY KEY, " +
    "rede TEXT NOT NULL, " +
    "media_minima REAL NOT NULL, " +
    "modelo_avaliativo TEXT NOT NULL, " +
    "ativa INTEGER NOT NULL DEFAULT 1, " +
    "atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP)"
  ).run();

  const turmas = await env.DB.prepare(
    "SELECT TRIM(turma) AS turma, " +
    "GROUP_CONCAT(bimestre1_avaliacoes, '|||') AS conjuntos " +
    "FROM alunos " +
    "WHERE turma IS NOT NULL AND TRIM(turma) <> '' " +
    "GROUP BY TRIM(turma)"
  ).all();

  for (const row of (turmas.results || [])) {
    const turma = String(row.turma || "").trim();
    if (!turma) continue;

    const exists = await env.DB.prepare(
      "SELECT turma FROM turma_config WHERE turma = ? LIMIT 1"
    ).bind(turma).first();

    if (exists) continue;

    let temBloco = false;
    for (const raw of String(row.conjuntos || "").split("|||")) {
      for (const av of parseArray(raw)) {
        if (/\bbloco\b/i.test(String(av?.nome || ""))) {
          temBloco = true;
          break;
        }
      }
      if (temBloco) break;
    }

    const rede = temBloco ? "GO" : "DF";
    const mediaMinima = rede === "GO" ? 6 : 5;
    const modelo = temBloco ? "GO_BLOCO" : "DF_SEM_BLOCO";

    await env.DB.prepare(
      "INSERT INTO turma_config " +
      "(turma, rede, media_minima, modelo_avaliativo) " +
      "VALUES (?, ?, ?, ?)"
    ).bind(turma, rede, mediaMinima, modelo).run();
  }
}

async function turmaConfig(env, turma) {
  await ensureTurmaConfig(env);
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
  return 1;
}


function buildTurmaStats(rows, config) {
  const vigente = bimestreVigenteDaTurma(rows);
  const turma = String(config?.turma || rows[0]?.turma || "").trim();
  const limite = Number(config?.media_minima ?? 6);
  const quantidadeBimestres = bCount(turma);

  const alunos = rows.map(row => {
    const medias = [];
    const vistos = [];
    const avaliacoesPorBimestre = {};

    for (let i = 1; i <= quantidadeBimestres; i++) {
      const media = Number(row["bimestre" + i + "_media"]);
      if (Number.isFinite(media)) medias.push(media);
      const visto = Number(row["bimestre" + i + "_vistos"]);
      if (Number.isFinite(visto)) vistos.push(visto);
      avaliacoesPorBimestre[i] = parseArray(row["bimestre" + i + "_avaliacoes"]);
    }

    const mediaAtual = medias.length ? medias[medias.length - 1] : null;
    const mediaAtualValor = Number(row["bimestre" + vigente + "_media"]);
    const mediaFinal = Number.isFinite(mediaAtualValor) ? mediaAtualValor : null;
    const vistosAtualValor = Number(row["bimestre" + vigente + "_vistos"]);

    return {
      codigo: row.codigo,
      nome: row.nome,
      turma: row.turma,
      medias,
      mediaAtual,
      mediaFinal,
      vistos: Number.isFinite(vistosAtualValor) ? vistosAtualValor : null,
      avaliacoesPorBimestre
    };
  });

  const finais = alunos.map(a => a.mediaFinal).filter(Number.isFinite);
  const atuais = alunos.map(a => a.mediaAtual).filter(Number.isFinite);
  const vistos = alunos.map(a => a.vistos).filter(Number.isFinite);

  const distribuicao = [
    { faixa: "0,0–2,9", quantidade: 0 },
    { faixa: "3,0–4,9", quantidade: 0 },
    { faixa: "5,0–6,9", quantidade: 0 },
    { faixa: "7,0–8,9", quantidade: 0 },
    { faixa: "9,0–10,0", quantidade: 0 }
  ];

  for (const value of finais) {
    if (value < 3) distribuicao[0].quantidade++;
    else if (value < 5) distribuicao[1].quantidade++;
    else if (value < 7) distribuicao[2].quantidade++;
    else if (value < 9) distribuicao[3].quantidade++;
    else distribuicao[4].quantidade++;
  }

  const desempenhoAvaliacoes = [];
  for (let bim = vigente; bim <= vigente; bim++) {
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
    .filter(a => Number.isFinite(a.mediaFinal) && a.mediaFinal < limite)
    .sort((a, b) => a.mediaFinal - b.mediaFinal)
    .map(a => ({
      codigo: a.codigo,
      nome: a.nome,
      media: round1(a.mediaFinal),
      vistos: round1(a.vistos)
    }));

  const porAluno = alunos
    .filter(a => Number.isFinite(a.mediaFinal))
    .sort((a, b) => b.mediaFinal - a.mediaFinal)
    .map(a => ({
      codigo: a.codigo,
      nome: a.nome,
      media: round1(a.mediaFinal),
      vistos: round1(a.vistos)
    }));

  return {
    turma,
    bimestreVigente: vigente,
    rede: config?.rede || "GO",
    mediaMinima: limite,
    modeloAvaliativo: config?.modelo_avaliativo || "—",
    quantidadeAlunos: alunos.length,
    alunosComMedia: finais.length,
    mediaTurma: round1(mean(finais)),
    maiorMedia: finais.length ? round1(Math.max(...finais)) : null,
    menorMedia: finais.length ? round1(Math.min(...finais)) : null,
    mediaVistos: round1(mean(vistos)),
    acimaOuIgualMedia: finais.filter(v => v >= limite).length,
    abaixoMedia: finais.filter(v => v < limite).length,
    distribuicao,
    desempenhoAvaliacoes,
    evolucao,
    acompanhamento,
    porAluno
  };
}


function buildGlobalStats(rows, configs) {
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
      rede: "GO",
      media_minima: 6,
      modelo_avaliativo: "—"
    };

    const vigente = bimestreVigenteDaTurma(turmaRows);

    for (const row of turmaRows) {
      const mediaValor = Number(row["bimestre" + vigente + "_media"]);
      const vistosValor = Number(row["bimestre" + vigente + "_vistos"]);

      alunos.push({
        codigo: row.codigo,
        nome: row.nome,
        turma,
        rede: config.rede,
        mediaMinima: Number(config.media_minima),
        media: Number.isFinite(mediaValor) ? mediaValor : null,
        vistos: Number.isFinite(vistosValor) ? vistosValor : null,
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
    const cfg = configMap.get(turma) || { rede:"GO", media_minima:6 };
    const medias = alunos.filter(a => a.turma === turma).map(a => a.media).filter(Number.isFinite);
    const vigente = bimestreVigenteDaTurma(lista);
    const limite = Number(cfg.media_minima ?? 6);

    turmas.push({
      turma,
      bimestreVigente: vigente,
      rede: cfg.rede || "GO",
      mediaMinima: limite,
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

  return {
    bimestresVigentes,
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
const STUDENT_MESSAGE_MAX_PER_HOUR = 5;

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
        "SELECT id, kind, scope, turma, title, body, sender_name, created_at " +
        "FROM salta_comms_messages " +
        "WHERE kind = 'announcement' AND active = 1 AND (" +
        "scope = 'global' OR " +
        "(scope = 'class' AND TRIM(turma) = ?) OR " +
        "(scope = 'individual' AND student_code = ?)) " +
        "ORDER BY datetime(created_at) DESC LIMIT 100"
      ).bind(student.turma || "", code).all();

      const direct = await env.DB.prepare(
        "SELECT id, kind, scope, sender_type, sender_name, title, body, created_at, " +
        "student_read_at, teacher_read_at " +
        "FROM salta_comms_messages " +
        "WHERE kind = 'direct' AND student_code = ? " +
        "ORDER BY datetime(created_at) DESC LIMIT 100"
      ).bind(code).all();

      return json({
        student: { codigo: student.codigo, nome: student.nome, turma: student.turma },
        announcements: announcements.results || [],
        messages: (direct.results || []).reverse()
      }, request);
    }

    if (path === "/comms/student/message" && method === "POST") {
      const payload = await request.json().catch(() => null);
      if (!payload) return json({ error: "Mensagem inválida." }, request, 400);
      const code = String(payload.codigo || "").trim().toUpperCase();
      const student = await findCommsStudent(env, code);
      if (!student) return json({ error: "Código não encontrado." }, request, 404);

      const title = trimLimited(payload.title, 80);
      const body = trimLimited(payload.body, 1000);
      if (!title || !body) {
        return json({ error: "Informe o assunto e escreva sua mensagem." }, request, 400);
      }
      if (String(payload.title || "").trim().length > 80 || String(payload.body || "").trim().length > 1000) {
        return json({ error: "O assunto pode ter até 80 caracteres e a mensagem até 1.000." }, request, 400);
      }

      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM salta_comms_messages " +
        "WHERE kind = 'direct' AND sender_type = 'student' AND student_code = ? " +
        "AND datetime(created_at) >= datetime('now', '-1 hour')"
      ).bind(code).first();

      if (Number(recent?.total || 0) >= STUDENT_MESSAGE_MAX_PER_HOUR) {
        return json({
          error: "Você atingiu o limite de 5 mensagens por hora. Tente novamente mais tarde."
        }, request, 429);
      }

      const id = await insertCommsMessage(env, {
        kind: "direct",
        scope: "individual",
        turma: student.turma,
        student_code: code,
        sender_type: "student",
        sender_name: String(student.nome || "Aluno").slice(0, 120),
        title,
        body
      });
      return json({ ok: true, id, message: "Mensagem enviada ao professor." }, request, 201);
    }

    if (path === "/comms/student/read" && method === "POST") {
      const payload = await request.json().catch(() => null);
      const code = String(payload?.codigo || "").trim().toUpperCase();
      const student = await findCommsStudent(env, code);
      if (!student) return json({ error: "Código não encontrado." }, request, 404);

      await env.DB.prepare(
        "UPDATE salta_comms_messages SET student_read_at = CURRENT_TIMESTAMP " +
        "WHERE kind = 'direct' AND student_code = ? AND sender_type = 'teacher' " +
        "AND student_read_at IS NULL"
      ).bind(code).run();
      return json({ ok: true }, request);
    }

    // All remaining communication routes are teacher-only.
    if (path.startsWith("/comms/teacher/")) {
      if (path === "/comms/teacher/announcements" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, scope, turma, student_code, sender_name, title, body, created_at, active " +
          "FROM salta_comms_messages WHERE kind = 'announcement' " +
          "ORDER BY datetime(created_at) DESC LIMIT 100"
        ).all();
        return json({ announcements: result.results || [] }, request);
      }

      if (path === "/comms/teacher/inbox" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT m.id, m.student_code, m.turma, m.sender_type, m.sender_name, " +
          "m.title, m.body, m.created_at, m.student_read_at, m.teacher_read_at, " +
          "a.nome AS student_name " +
          "FROM salta_comms_messages m " +
          "LEFT JOIN alunos a ON a.codigo = m.student_code " +
          "WHERE m.kind = 'direct' " +
          "ORDER BY datetime(m.created_at) DESC LIMIT 500"
        ).all();
        return json({ messages: result.results || [] }, request);
      }

      if (path === "/comms/teacher/thread" && method === "GET") {
        const code = (url.searchParams.get("codigo") || "").trim().toUpperCase();
        const student = await findCommsStudent(env, code);
        if (!student) return json({ error: "Aluno não encontrado." }, request, 404);

        const result = await env.DB.prepare(
          "SELECT id, student_code, turma, sender_type, sender_name, title, body, " +
          "created_at, student_read_at, teacher_read_at " +
          "FROM salta_comms_messages WHERE kind = 'direct' AND student_code = ? " +
          "ORDER BY datetime(created_at) ASC LIMIT 200"
        ).bind(code).all();
        return json({
          student: { codigo: student.codigo, nome: student.nome, turma: student.turma },
          messages: result.results || []
        }, request);
      }

      if (path === "/comms/teacher/read" && method === "POST") {
        const payload = await request.json().catch(() => null);
        const code = String(payload?.student_code || "").trim().toUpperCase();
        const student = await findCommsStudent(env, code);
        if (!student) return json({ error: "Aluno não encontrado." }, request, 404);

        await env.DB.prepare(
          "UPDATE salta_comms_messages SET teacher_read_at = CURRENT_TIMESTAMP " +
          "WHERE kind = 'direct' AND student_code = ? AND sender_type = 'student' " +
          "AND teacher_read_at IS NULL"
        ).bind(code).run();
        return json({ ok: true }, request);
      }

      if (path === "/comms/teacher/announcement" && method === "POST") {
        const payload = await request.json().catch(() => null);
        if (!payload) return json({ error: "Aviso inválido." }, request, 400);

        const scope = String(payload.scope || "").trim();
        const title = trimLimited(payload.title, COMMS_MAX_TITLE);
        const body = trimLimited(payload.body, COMMS_MAX_BODY);
        if (!["global", "class", "individual"].includes(scope)) {
          return json({ error: "Escolha se o aviso é global, por turma ou individual." }, request, 400);
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
        if (scope === "class") {
          turma = String(payload.turma || "").trim();
          if (!turma) return json({ error: "Selecione uma turma." }, request, 400);
          const classExists = await env.DB.prepare(
            "SELECT 1 AS ok FROM alunos WHERE TRIM(turma) = ? LIMIT 1"
          ).bind(turma).first();
          if (!classExists) return json({ error: "Turma não encontrada." }, request, 404);
        }
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

      if (path === "/comms/teacher/reply" && method === "POST") {
        const payload = await request.json().catch(() => null);
        if (!payload) return json({ error: "Mensagem inválida." }, request, 400);

        const code = String(payload.student_code || "").trim().toUpperCase();
        const student = await findCommsStudent(env, code);
        if (!student) return json({ error: "Aluno não encontrado." }, request, 404);

        const title = trimLimited(payload.title || "Mensagem do professor", 80);
        const body = trimLimited(payload.body, 1200);
        if (!body) return json({ error: "Escreva uma mensagem antes de enviar." }, request, 400);
        if (String(payload.body || "").trim().length > 1200) {
          return json({ error: "A resposta pode ter até 1.200 caracteres." }, request, 400);
        }

        const id = await insertCommsMessage(env, {
          kind: "direct",
          scope: "individual",
          turma: student.turma,
          student_code: code,
          sender_type: "teacher",
          sender_name: String(env.PROFESSOR_DISPLAY_NAME || "Professor").slice(0, 120),
          title,
          body
        });
        return json({ ok: true, id, message: "Resposta enviada ao aluno." }, request, 201);
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
        return json(result, request);
      }

      if (url.pathname === "/admin/turma-estatistica") {
        const turma = (url.searchParams.get("turma") || "").trim();
        if (!turma) return json({ error: "Turma não informada." }, request, 400);

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

        return json(buildTurmaStats(result.results, config), request);
      }

      if (url.pathname === "/admin/estatistica-global") {
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

        return json(buildGlobalStats(result.results || [], cfgResult.results || []), request);
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
