const AUTH_API_URL = "https://salta-auth.dannyel-moises.workers.dev";
const ALLOWED_ORIGIN = "https://d4nny3l.github.io";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    "atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP)"
  ).run();

  const turmas = await env.DB.prepare(
    "SELECT TRIM(turma) AS turma, bimestre1_avaliacoes FROM alunos " +
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

    const avaliacoes = parseArray(row.bimestre1_avaliacoes);
    const temBloco = avaliacoes.some(av =>
      /bloco/i.test(String(av?.nome || ""))
    );
    const rede = temBloco ? "GO" : "DF";
    const mediaMinima = rede === "GO" ? 6 : 5;
    const modelo = temBloco ? "GO_BLOCO" : "DF_SEM_BLOCO";

    await env.DB.prepare(
      "INSERT INTO turma_config (turma, rede, media_minima, modelo_avaliativo) VALUES (?, ?, ?, ?)"
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

function buildTurmaStats(rows, config) {
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
    const mediaFinal = medias.length
      ? medias.reduce((sum, value) => sum + value, 0) / quantidadeBimestres
      : null;

    return {
      codigo: row.codigo,
      nome: row.nome,
      turma: row.turma,
      medias,
      mediaAtual,
      mediaFinal,
      vistos: vistos.length ? mean(vistos) : null,
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
  for (let bim = 1; bim <= quantidadeBimestres; bim++) {
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "GET") {
      return json({ error: "Método não permitido." }, request, 405);
    }
    if (!(await authenticated(request, env))) {
      return json({ error: "Acesso restrito." }, request, 401);
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/health") {
        return json({ ok: true, service: "salta-stats" }, request);
      }

      if (url.pathname === "/admin/turmas") {
        const totals = await env.DB.prepare(
          "SELECT COUNT(*) AS total_alunos, " +
          "COUNT(CASE WHEN turma IS NOT NULL AND TRIM(turma) <> '' THEN 1 END) AS com_turma, " +
          "COUNT(DISTINCT CASE WHEN turma IS NOT NULL AND TRIM(turma) <> '' THEN TRIM(turma) END) AS turmas " +
          "FROM alunos"
        ).first();

        const result = await env.DB.prepare(
          "SELECT TRIM(turma) AS turma FROM alunos " +
          "WHERE turma IS NOT NULL AND TRIM(turma) <> '' " +
          "GROUP BY TRIM(turma) ORDER BY TRIM(turma)"
        ).all();

        return json({
          turmas: (result.results || []).map(row => row.turma).filter(Boolean),
          diagnostico: {
            totalAlunos: Number(totals?.total_alunos || 0),
            alunosComTurma: Number(totals?.com_turma || 0),
            quantidadeTurmas: Number(totals?.turmas || 0)
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
          "bimestre1_media,bimestre1_vistos,bimestre1_avaliacoes," +
          "bimestre2_media,bimestre2_vistos,bimestre2_avaliacoes," +
          "bimestre3_media,bimestre3_vistos,bimestre3_avaliacoes," +
          "bimestre4_media,bimestre4_vistos,bimestre4_avaliacoes " +
          "FROM alunos WHERE TRIM(turma) = ? ORDER BY nome"
        ).bind(turma).all();

        if (!result.results?.length) {
          return json({ error: "Turma não encontrada." }, request, 404);
        }

        return json(buildTurmaStats(result.results, config), request);
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
