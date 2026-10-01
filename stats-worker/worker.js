const AUTH_API_URL = "https://salta-auth.dannyel-moises.workers.dev";
const ALLOWED_ORIGIN = "https://d4nny3l.github.io";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
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

async function authenticated(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const response = await fetch(AUTH_API_URL + "/session", {
    method: "GET",
    headers: { Authorization: auth },
    cache: "no-store"
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return data.authenticated === true;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "GET") {
      return json({ error: "Método não permitido." }, request, 405);
    }
    if (!(await authenticated(request))) {
      return json({ error: "Acesso restrito." }, request, 401);
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === "/admin/turmas") {
        const result = await env.DB.prepare(
          "SELECT DISTINCT turma FROM alunos WHERE turma IS NOT NULL AND turma <> '' ORDER BY turma COLLATE NOCASE"
        ).all();
        return json({ turmas: (result.results || []).map(row => row.turma) }, request);
      }
      if (url.pathname === "/admin/alunos") {
        const turma = (url.searchParams.get("turma") || "").trim();
        const nome = (url.searchParams.get("nome") || "").trim();
        let query = "SELECT codigo, nome, turma FROM alunos WHERE 1=1";
        const binds = [];
        if (turma) { query += " AND turma = ?"; binds.push(turma); }
        if (nome) { query += " AND LOWER(nome) LIKE LOWER(?)"; binds.push("%" + nome + "%"); }
        query += " ORDER BY turma COLLATE NOCASE, nome COLLATE NOCASE";
        const result = await env.DB.prepare(query).bind(...binds).all();
        return json({ total: (result.results || []).length, alunos: result.results || [] }, request);
      }
      if (url.pathname === "/admin/aluno") {
        const codigo = (url.searchParams.get("codigo") || "").trim().toUpperCase();
        if (!/^2026[A-Z]{1,4}$/.test(codigo)) return json({ error: "Código inválido." }, request, 400);
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
      return json({ error: "Rota não encontrada." }, request, 404);
    } catch (error) {
      return json({ error: "Erro ao consultar os dados." }, request, 500);
    }
  }
};