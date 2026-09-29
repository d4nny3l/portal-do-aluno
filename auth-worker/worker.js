export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }

    if (url.pathname === "/login" && request.method === "POST") {
      return login(request, env);
    }

    if (url.pathname === "/session" && request.method === "GET") {
      return session(request, env);
    }

    if (url.pathname === "/logout" && request.method === "POST") {
      return logout(request);
    }

    return json({ ok: false, error: "Rota não encontrada." }, 404, request);
  }
};

async function login(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Requisição inválida." }, 400, request);
  }

  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return json({ ok: false, error: "Usuário e senha são obrigatórios." }, 400, request);
  }

  const expectedUser = String(env.PROFESSOR_USER || "").trim().toLowerCase();
  const expectedPassword = String(env.PROFESSOR_PASSWORD || "");

  if (!expectedUser || !expectedPassword) {
    return json({ ok: false, error: "Autenticação não configurada no servidor." }, 500, request);
  }

  if (username !== expectedUser || !safeEqual(password, expectedPassword)) {
    return json({ ok: false, error: "Usuário ou senha incorretos." }, 401, request);
  }

  const now = Math.floor(Date.now() / 1000);
  const expires = now + 60 * 60 * 8;
  const token = await sign({
    sub: username,
    iat: now,
    exp: expires
  }, env.AUTH_SECRET);

  const headers = corsHeaders(request);
  headers.set(
    "Set-Cookie",
    "salta_session=" + token +
    "; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=None"
  );

  return new Response(JSON.stringify({ ok: true, user: username }), {
    status: 200,
    headers: { ...Object.fromEntries(headers), "Content-Type": "application/json" }
  });
}

async function session(request, env) {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const header = request.headers.get("Authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token = bearer || cookies.salta_session;

  if (!token) {
    return json({ ok: false, authenticated: false }, 401, request);
  }

  const payload = await verify(token, env.AUTH_SECRET);

  if (!payload) {
    return json({ ok: false, authenticated: false }, 401, request);
  }

  return json({
    ok: true,
    authenticated: true,
    user: payload.sub
  }, 200, request);
}

async function logout(request) {
  const headers = corsHeaders(request);
  headers.set(
    "Set-Cookie",
    "salta_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None"
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...Object.fromEntries(headers), "Content-Type": "application/json" }
  });
}

function json(data, status, request) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json");
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

function parseCookies(value) {
  const out = {};
  for (const part of value.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlJson(value) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  ));
}

async function sign(payload, secret) {
  if (!secret) throw new Error("AUTH_SECRET não configurado.");
  const body = base64urlJson(payload);
  const signature = base64url(await hmac(body, secret));
  return body + "." + signature;
}

async function verify(token, secret) {
  try {
    if (!secret) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [body, signature] = parts;
    const expected = base64url(await hmac(body, secret));

    if (!safeEqual(signature, expected)) return null;

    const decoded = atob(body.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - body.length % 4) % 4));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded, c => c.charCodeAt(0))));

    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
