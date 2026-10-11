const SESSION_TTL_SECONDS = 4 * 60 * 60;
const SESSION_COOKIE = "__Host-salta_session";
const LEGACY_COOKIE = "salta_session";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      if (url.pathname === "/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/session" && request.method === "GET") return session(request, env);
      if (url.pathname === "/logout" && request.method === "POST") return logout(request, env);
      return json({ ok: false, error: "Rota não encontrada." }, 404, request);
    } catch {
      return json({ ok: false, error: "Não foi possível concluir a autenticação." }, 500, request);
    }
  }
};

async function login(request, env) {
  if (!env.SESSIONS || !env.LOGIN_IP_LIMITER || !env.LOGIN_ACCOUNT_LIMITER) {
    return json({ ok: false, error: "Autenticação temporariamente indisponível." }, 503, request);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!ip) return json({ ok: false, error: "Autenticação temporariamente indisponível." }, 503, request);
  const ipLimit = await env.LOGIN_IP_LIMITER.limit({ key: ip });
  if (!ipLimit.success) return rateLimited(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Requisição inválida." }, 400, request);
  }

  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!username || !password || username.length > 120 || password.length > 512) {
    return json({ ok: false, error: "Usuário e senha são obrigatórios." }, 400, request);
  }

  const accountLimit = await env.LOGIN_ACCOUNT_LIMITER.limit({ key: username });
  if (!accountLimit.success) return rateLimited(request);

  const expectedUser = String(env.PROFESSOR_USER || "").trim().toLowerCase();
  const expectedPassword = String(env.PROFESSOR_PASSWORD || "");
  if (!expectedUser || !expectedPassword) {
    return json({ ok: false, error: "Autenticação não configurada no servidor." }, 503, request);
  }

  const passwordMatches = safeEqual(password, expectedPassword);
  if (username !== expectedUser || !passwordMatches) {
    return json({ ok: false, error: "Usuário ou senha incorretos." }, 401, request);
  }

  const sessionId = createSessionId();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  await sessionStore(env).fetch("https://sessions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sessionId, user: username, expiresAt })
  });

  const headers = corsHeaders(request);
  headers.set("Set-Cookie", sessionCookie(sessionId, SESSION_TTL_SECONDS));
  headers.append("Set-Cookie", expiredCookie(LEGACY_COOKIE));
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ ok: true, user: username }), { status: 200, headers });
}

async function session(request, env) {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const sessionId = bearer || cookies[SESSION_COOKIE] || cookies[LEGACY_COOKIE] || "";
  if (!sessionId || !env.SESSIONS) return json({ ok: false, authenticated: false }, 401, request);

  const response = await sessionStore(env).fetch("https://sessions/read", {
    headers: { "X-Session-Id": sessionId }
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.user || Number(result.expiresAt) <= Math.floor(Date.now() / 1000)) {
    if (result?.expired) {
      await sessionStore(env).fetch("https://sessions/delete", {
        method: "POST",
        headers: { "X-Session-Id": sessionId }
      });
    }
    return json({ ok: false, authenticated: false }, 401, request);
  }
  return json({ ok: true, authenticated: true, user: result.user }, 200, request);
}

async function logout(request, env) {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const sessionId = bearer || cookies[SESSION_COOKIE] || cookies[LEGACY_COOKIE] || "";
  if (sessionId && env.SESSIONS) {
    await sessionStore(env).fetch("https://sessions/delete", {
      method: "POST",
      headers: { "X-Session-Id": sessionId }
    });
  }

  const headers = corsHeaders(request);
  headers.set("Set-Cookie", expiredCookie(SESSION_COOKIE));
  headers.append("Set-Cookie", expiredCookie(LEGACY_COOKIE));
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function sessionStore(env) {
  const id = env.SESSIONS.idFromName("salta-professor-sessions");
  return env.SESSIONS.get(id);
}

class SessionStore {
  constructor(state) {
    this.state = state;
  }

  async alarm() {
    const entries = await this.state.storage.list({ prefix: "session:" });
    const now = Math.floor(Date.now() / 1000);
    let nextExpiry = Infinity;
    for (const [key, value] of entries) {
      if (Number(value.expiresAt) <= now) await this.state.storage.delete(key);
      else nextExpiry = Math.min(nextExpiry, Number(value.expiresAt));
    }
    if (Number.isFinite(nextExpiry)) await this.state.storage.setAlarm(nextExpiry * 1000);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const id = request.headers.get("X-Session-Id") || "";
    if (url.pathname === "/create" && request.method === "POST") {
      const value = await request.json().catch(() => null);
      if (!value?.id || !value?.user || !Number.isFinite(Number(value.expiresAt))) {
        return new Response(null, { status: 400 });
      }
      const expiresAt = Number(value.expiresAt);
      await this.state.storage.put("session:" + value.id, {
        user: String(value.user),
        expiresAt
      });
      const currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm === null || expiresAt * 1000 < currentAlarm) {
        await this.state.storage.setAlarm(expiresAt * 1000);
      }
      return new Response(null, { status: 204 });
    }
    if (!id || id.length > 128) return new Response(null, { status: 400 });
    const key = "session:" + id;
    if (url.pathname === "/read" && request.method === "GET") {
      const value = await this.state.storage.get(key);
      if (!value) return Response.json({ authenticated: false }, { status: 404 });
      if (value.expiresAt <= Math.floor(Date.now() / 1000)) {
        await this.state.storage.delete(key);
        return Response.json({ expired: true }, { status: 404 });
      }
      return Response.json(value);
    }
    if (url.pathname === "/delete" && request.method === "POST") {
      await this.state.storage.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }
}

function rateLimited(request) {
  const response = json({ ok: false, error: "Muitas tentativas. Aguarde um minuto e tente novamente." }, 429, request);
  response.headers.set("Retry-After", "60");
  return response;
}

function json(data, status, request) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set([
    "https://d4nny3l.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ]);
  const headers = new Headers();
  if (allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Vary", "Origin");
  return headers;
}

function sessionCookie(value, maxAge) {
  return SESSION_COOKIE + "=" + encodeURIComponent(value) +
    "; Max-Age=" + maxAge + "; Path=/; HttpOnly; Secure; SameSite=None; Partitioned";
}

function expiredCookie(name) {
  return name + "=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None; Partitioned";
}

function createSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCookies(value) {
  const out = {};
  for (const part of value.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { /* Ignore malformed cookies. */ }
  }
  return out;
}

function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) difference |= (left[i] || 0) ^ (right[i] || 0);
  return difference === 0;
}

export { SessionStore };
