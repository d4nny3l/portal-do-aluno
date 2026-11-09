const MAX_CIPHERTEXT_CHARS = 1400000;
const TYPES = new Set([
  "diary.class.v1", "diary.student.v1", "diary.item.v1", "diary.record.v1",
  "diary.attendance.v1", "diary.calendar.v1", "diary.report.v1",
  "communications.announcement.v1", "festival.submission.v1",
  "mostra.assessment.v1", "institution.profile.v1"
]);
const IDENTIFIER = /^[A-Za-z0-9_-][A-Za-z0-9._-]{1,127}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function isLocalRequest(url, env) {
  return env.SALTA_E2EE_LAB === "local-only" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1");
}

function validId(value) {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => allowed.has(key));
}

function validateCipherFields(body) {
  return body.protocol_version === 1 &&
    Number.isSafeInteger(body.key_version) && body.key_version > 0 &&
    Number.isSafeInteger(body.revision) && body.revision > 0 &&
    body.kdf === "HKDF-SHA256" && body.aead === "AES-256-GCM" &&
    typeof body.salt === "string" && body.salt.length === 43 && BASE64URL.test(body.salt) &&
    typeof body.nonce === "string" && body.nonce.length === 16 && BASE64URL.test(body.nonce) &&
    typeof body.ciphertext === "string" && body.ciphertext.length >= 22 &&
    body.ciphertext.length <= MAX_CIPHERTEXT_CHARS && BASE64URL.test(body.ciphertext);
}

async function parseJson(request, maxBytes = MAX_CIPHERTEXT_CHARS + 10000) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function membership(db, tenantId, userId) {
  return db.prepare(
    "SELECT id,tenant_id,principal_id,role,status FROM memberships WHERE tenant_id=? AND principal_id=?"
  ).bind(tenantId, userId).first();
}

async function scopeGrant(db, tenantId, scopeId, userId) {
  return db.prepare(
    "SELECT membership_id,can_read,can_write,can_share,revoked_at FROM scope_grants WHERE tenant_id=? AND scope_id=? AND principal_id=?"
  ).bind(tenantId, scopeId, userId).first();
}

function allowed(grant, action) {
  if (!grant || grant.revoked_at) return false;
  return action === "read" ? grant.can_read === 1 :
    action === "write" ? grant.can_write === 1 :
      action === "share" ? grant.can_share === 1 : false;
}

async function authorize(db, request, tenantId, scopeId, action) {
  const userId = request.headers.get("X-SALTA-Lab-Principal");
  if (!validId(userId) || !validId(tenantId) || !validId(scopeId)) return null;
  const [member, tenant, principal, scope, grant] = await Promise.all([
    membership(db, tenantId, userId),
    db.prepare("SELECT status FROM tenants WHERE id=?").bind(tenantId).first(),
    db.prepare("SELECT status FROM principals WHERE id=?").bind(userId).first(),
    db.prepare("SELECT id,tenant_id,status,key_version FROM cryptographic_scopes WHERE tenant_id=? AND id=?")
      .bind(tenantId, scopeId).first(),
    scopeGrant(db, tenantId, scopeId, userId)
  ]);
  if (!member || member.status !== "active" || !tenant || tenant.status !== "active" ||
      !principal || principal.status !== "active" || !scope || scope.status !== "active" ||
      !grant || grant.membership_id !== member.id || !allowed(grant, action)) return null;
  return { userId, member, tenant, principal, scope, grant };
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (!isLocalRequest(url, env) || !env.E2EE_DB) return json({ error: "Not found." }, 404);
  const db = env.E2EE_DB;
  if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, environment: "isolated-local-lab" });
  if (request.method === "POST" && url.pathname === "/__lab/seed") {
    const body = await parseJson(request, 16000);
    const keys = new Set(["tenant_id","scope_id","academic_year","members"]);
    if (!hasOnlyKeys(body,keys) || !validId(body.tenant_id) || !validId(body.scope_id) ||
        !Number.isInteger(body.academic_year) || body.academic_year < 2020 || body.academic_year > 2100 ||
        !Array.isArray(body.members) || body.members.length !== 2) return json({ error: "Invalid synthetic fixture." },400);
    const allowedMemberKeys = new Set(["user_id","membership_id","role","public_key","fingerprint","can_read","can_write","can_share"]);
    if (!body.members.every(item => hasOnlyKeys(item,allowedMemberKeys) && validId(item.user_id) && validId(item.membership_id) &&
        ["tenant_admin","teacher"].includes(item.role) && typeof item.public_key === "string" &&
        item.public_key.length >= 80 && item.public_key.length <= 120 && BASE64URL.test(item.public_key) &&
        /^[a-f0-9]{64}$/u.test(item.fingerprint) && [0,1].includes(item.can_read) &&
        [0,1].includes(item.can_write) && [0,1].includes(item.can_share))) return json({ error: "Invalid synthetic fixture." },400);
    await db.prepare("INSERT OR IGNORE INTO tenants (id,status) VALUES (?,'active')").bind(body.tenant_id).run();
    for (const item of body.members) {
      await db.prepare("INSERT OR IGNORE INTO principals (id,public_key,key_alg,key_version,fingerprint,status) VALUES (?,?,? ,1,?,'active')")
        .bind(item.user_id,item.public_key,"DHKEM(P-256,HKDF-SHA256)",item.fingerprint).run();
      await db.prepare("INSERT OR IGNORE INTO memberships (id,tenant_id,principal_id,role,status) VALUES (?,?,?,?,'active')")
        .bind(item.membership_id,body.tenant_id,item.user_id,item.role).run();
    }
    await db.prepare("INSERT OR IGNORE INTO cryptographic_scopes (id,tenant_id,scope_type,academic_year,status,key_version) VALUES (?,?,'class',?,'active',1)")
      .bind(body.scope_id,body.tenant_id,body.academic_year).run();
    for (const item of body.members) {
      await db.prepare("INSERT OR IGNORE INTO scope_grants (tenant_id,scope_id,principal_id,membership_id,can_read,can_write,can_share) VALUES (?,?,?,?,?,?,?)")
        .bind(body.tenant_id,body.scope_id,item.user_id,item.membership_id,item.can_read,item.can_write,item.can_share).run();
    }
    return json({ ok: true, synthetic_only: true },201);
  }
  if (!url.pathname.startsWith("/v1/")) return json({ error: "Not found." }, 404);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "POST" && url.pathname === "/v1/objects") {
    const body = await parseJson(request);
    const keys = new Set(["tenant_id","scope_id","object_id","object_type","protocol_version","key_version","revision","kdf","aead","salt","nonce","ciphertext"]);
    if (!hasOnlyKeys(body, keys) || !validId(body.tenant_id) || !validId(body.scope_id) ||
        !validId(body.object_id) || !TYPES.has(body.object_type) || !validateCipherFields(body)) {
      return json({ error: "Invalid encrypted object envelope." }, 400);
    }
    const auth = await authorize(db, request, body.tenant_id, body.scope_id, "write");
    if (!auth) return json({ error: "Access denied." }, 403);
    if (body.key_version !== auth.scope.key_version) return json({ error: "Unsupported scope key version." }, 409);
    const existing = await db.prepare("SELECT revision FROM encrypted_objects WHERE tenant_id=? AND scope_id=? AND object_id=?")
      .bind(body.tenant_id, body.scope_id, body.object_id).first();
    if (existing) return json({ error: "Object already exists; use its revision for updates." }, 409);
    await db.prepare(
      "INSERT INTO encrypted_objects (tenant_id,scope_id,object_id,object_type,protocol_version,key_version,revision,kdf,aead,salt,nonce,ciphertext) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(body.tenant_id,body.scope_id,body.object_id,body.object_type,body.protocol_version,body.key_version,body.revision,body.kdf,body.aead,body.salt,body.nonce,body.ciphertext).run();
    await db.prepare("INSERT INTO security_events (tenant_id,actor_id,scope_id,event_type,key_version) VALUES (?,?,?,?,?)")
      .bind(body.tenant_id,auth.userId,body.scope_id,"encrypted_object_created",body.key_version).run();
    return json({ ok: true, object_id: body.object_id, revision: body.revision }, 201);
  }

  if (request.method === "PUT" && parts.length === 3 && parts[0] === "v1" && parts[1] === "objects") {
    const body = await parseJson(request);
    const keys = new Set(["tenant_id","scope_id","object_type","expected_revision","protocol_version","key_version","revision","kdf","aead","salt","nonce","ciphertext"]);
    const objectId = parts[2];
    if (!hasOnlyKeys(body, keys) || !validId(objectId) || !validId(body?.tenant_id) || !validId(body?.scope_id) ||
        !TYPES.has(body?.object_type) || !Number.isSafeInteger(body?.expected_revision) || body.expected_revision < 1 ||
        !validateCipherFields(body) || body.revision !== body.expected_revision + 1) {
      return json({ error: "Invalid encrypted object update." }, 400);
    }
    const auth = await authorize(db, request, body.tenant_id, body.scope_id, "write");
    if (!auth) return json({ error: "Access denied." }, 403);
    if (body.key_version !== auth.scope.key_version) return json({ error: "Unsupported scope key version." }, 409);
    const result = await db.prepare(
      "UPDATE encrypted_objects SET object_type=?,protocol_version=?,key_version=?,revision=?,kdf=?,aead=?,salt=?,nonce=?,ciphertext=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND scope_id=? AND object_id=? AND revision=?"
    ).bind(body.object_type,body.protocol_version,body.key_version,body.revision,body.kdf,body.aead,body.salt,body.nonce,body.ciphertext,body.tenant_id,body.scope_id,objectId,body.expected_revision).run();
    if (Number(result.meta?.changes || 0) !== 1) return json({ error: "Concurrent change detected." }, 409);
    await db.prepare("INSERT INTO security_events (tenant_id,actor_id,scope_id,event_type,key_version) VALUES (?,?,?,?,?)")
      .bind(body.tenant_id,auth.userId,body.scope_id,"encrypted_object_updated",body.key_version).run();
    return json({ ok: true, object_id: objectId, revision: body.revision });
  }

  if (request.method === "GET" && parts.length === 3 && parts[0] === "v1" && parts[1] === "objects") {
    const tenantId = url.searchParams.get("tenant_id");
    const scopeId = url.searchParams.get("scope_id");
    const objectId = parts[2];
    const auth = await authorize(db, request, tenantId, scopeId, "read");
    if (!auth || !validId(objectId)) return json({ error: "Access denied." }, 403);
    const row = await db.prepare(
      "SELECT tenant_id,scope_id,object_id,object_type,protocol_version,key_version,revision,kdf,aead,salt,nonce,ciphertext FROM encrypted_objects WHERE tenant_id=? AND scope_id=? AND object_id=?"
    ).bind(tenantId,scopeId,objectId).first();
    if (!row) return json({ error: "Encrypted record not found." }, 404);
    return json({ object: row });
  }

  if (request.method === "GET" && url.pathname === "/v1/objects") {
    const tenantId = url.searchParams.get("tenant_id");
    const scopeId = url.searchParams.get("scope_id");
    const auth = await authorize(db,request,tenantId,scopeId,"read");
    if (!auth) return json({ error: "Access denied." },403);
    const limitValue = Number(url.searchParams.get("limit") || 25);
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 50) return json({ error: "Invalid page size." },400);
    const after = url.searchParams.get("after") || "";
    if (after && !validId(after)) return json({ error: "Invalid cursor." },400);
    const rows = await db.prepare(
      "SELECT tenant_id,scope_id,object_id,object_type,protocol_version,key_version,revision,kdf,aead,salt,nonce,ciphertext FROM encrypted_objects WHERE tenant_id=? AND scope_id=? AND object_id>? ORDER BY object_id LIMIT ?"
    ).bind(tenantId,scopeId,after,limitValue + 1).all();
    const page = (rows.results || []).slice(0,limitValue);
    return json({ objects: page, next_cursor: rows.results?.length > limitValue ? page.at(-1)?.object_id || null : null });
  }

  if (request.method === "POST" && url.pathname === "/v1/envelopes") {
    const body = await parseJson(request, 12000);
    const keys = new Set(["protocol_version","kem","kdf","aead","tenant_id","scope_id","recipient_id","key_version","enc","ciphertext"]);
    if (!hasOnlyKeys(body, keys) || body.protocol_version !== 1 ||
        body.kem !== "DHKEM(P-256,HKDF-SHA256)" || body.kdf !== "HKDF-SHA256" || body.aead !== "AES-256-GCM" ||
        !validId(body.tenant_id) || !validId(body.scope_id) || !validId(body.recipient_id) ||
        !Number.isSafeInteger(body.key_version) || body.key_version < 1 ||
        typeof body.enc !== "string" || body.enc.length < 40 || body.enc.length > 256 || !BASE64URL.test(body.enc) ||
        typeof body.ciphertext !== "string" || body.ciphertext.length < 32 || body.ciphertext.length > 256 || !BASE64URL.test(body.ciphertext)) {
      return json({ error: "Invalid key envelope." }, 400);
    }
    const auth = await authorize(db, request, body.tenant_id, body.scope_id, "share");
    if (!auth) return json({ error: "Access denied." }, 403);
    if (body.key_version !== auth.scope.key_version) return json({ error: "Unsupported scope key version." }, 409);
    const recipientMembership = await membership(db, body.tenant_id, body.recipient_id);
    const recipientGrant = await scopeGrant(db, body.tenant_id, body.scope_id, body.recipient_id);
    if (!recipientMembership || recipientMembership.status !== "active" || !allowed(recipientGrant,"read")) {
      return json({ error: "Recipient is not authorized for this scope." }, 403);
    }
    await db.prepare(
      "INSERT INTO key_envelopes (tenant_id,scope_id,recipient_id,key_version,protocol_version,kem,kdf,aead,enc,ciphertext) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,scope_id,recipient_id,key_version) DO UPDATE SET protocol_version=excluded.protocol_version,kem=excluded.kem,kdf=excluded.kdf,aead=excluded.aead,enc=excluded.enc,ciphertext=excluded.ciphertext,created_at=CURRENT_TIMESTAMP"
    ).bind(body.tenant_id,body.scope_id,body.recipient_id,body.key_version,body.protocol_version,body.kem,body.kdf,body.aead,body.enc,body.ciphertext).run();
    await db.prepare("INSERT INTO security_events (tenant_id,actor_id,scope_id,event_type,key_version) VALUES (?,?,?,?,?)")
      .bind(body.tenant_id,auth.userId,body.scope_id,"key_envelope_shared",body.key_version).run();
    return json({ ok: true }, 201);
  }

  if (request.method === "GET" && url.pathname === "/v1/envelopes") {
    const tenantId = url.searchParams.get("tenant_id");
    const scopeId = url.searchParams.get("scope_id");
    const auth = await authorize(db, request, tenantId, scopeId, "read");
    if (!auth) return json({ error: "Access denied." }, 403);
    const row = await db.prepare(
      "SELECT protocol_version,kem,kdf,aead,tenant_id,scope_id,recipient_id,key_version,enc,ciphertext FROM key_envelopes WHERE tenant_id=? AND scope_id=? AND recipient_id=? AND key_version=?"
    ).bind(tenantId,scopeId,auth.userId,auth.scope.key_version).first();
    if (!row) return json({ error: "Key envelope not found." }, 404);
    return json({ envelope: row });
  }

  if (request.method === "POST" && url.pathname === "/v1/access-grants/revoke") {
    const body = await parseJson(request, 2000);
    const keys = new Set(["tenant_id","scope_id","principal_id"]);
    if (!hasOnlyKeys(body,keys) || !validId(body.tenant_id) || !validId(body.scope_id) || !validId(body.principal_id)) {
      return json({ error: "Invalid revocation request." }, 400);
    }
    const member = await membership(db,body.tenant_id,request.headers.get("X-SALTA-Lab-Principal"));
    if (!member || member.status !== "active" || member.role !== "tenant_admin") return json({ error: "Access denied." },403);
    const target = await membership(db,body.tenant_id,body.principal_id);
    if (!target) return json({ error: "Membership not found." },404);
    await db.prepare("UPDATE scope_grants SET revoked_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND scope_id=? AND principal_id=?")
      .bind(body.tenant_id,body.scope_id,body.principal_id).run();
    await db.prepare("DELETE FROM key_envelopes WHERE tenant_id=? AND scope_id=? AND recipient_id=?")
      .bind(body.tenant_id,body.scope_id,body.principal_id).run();
    await db.prepare("INSERT INTO security_events (tenant_id,actor_id,scope_id,event_type,key_version) VALUES (?,?,?,?,?)")
      .bind(body.tenant_id,member.principal_id,body.scope_id,"scope_access_revoked",null).run();
    return json({ ok: true, requires_key_rotation: true });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch {
      return json({ error: "The isolated encrypted-storage operation failed." }, 500);
    }
  }
};
