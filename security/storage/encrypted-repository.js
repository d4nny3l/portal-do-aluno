import { decryptJson } from "../crypto/decryption.js";
import { encryptJson } from "../crypto/encryption.js";
import { validateObjectContext } from "../crypto/crypto-format.js";
import { requireScopePermission } from "../access/permissions.js";
import { assertScopeKey } from "../crypto/key-generation.js";

function safeType(type) {
  if (typeof type !== "string") throw new TypeError("A registered sensitive-data type is required.");
  return type;
}

function validateEndpoint(endpoint) {
  if (endpoint === "" || (endpoint.startsWith("/") && !endpoint.startsWith("//"))) return endpoint;
  let url;
  try { url = new URL(endpoint); } catch { throw new TypeError("Use a same-origin path or a secure HTTPS storage endpoint."); }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.hash) {
    throw new TypeError("Storage endpoints must use HTTPS (or loopback HTTP for local tests).");
  }
  return url.origin + url.pathname.replace(/\/$/u, "");
}

export class EncryptedRepository {
  constructor({ endpoint, actorId, membershipId, tenantId, scopeId, keyVersion, scopeKey, permissions, fetchImpl = (...args) => globalThis.fetch(...args), labPrincipalHeader = false }) {
    if (typeof endpoint !== "string" || !actorId || !membershipId || !tenantId || !scopeId || !Number.isSafeInteger(keyVersion)) {
      throw new TypeError("The encrypted repository needs an explicit authenticated scope.");
    }
    if (scopeKey) assertScopeKey(scopeKey);
    this.endpoint = validateEndpoint(endpoint).replace(/\/$/u, "");
    this.actorId = actorId;
    this.membershipId = membershipId;
    this.tenantId = tenantId;
    this.scopeId = scopeId;
    this.keyVersion = keyVersion;
    this.scopeKey = scopeKey;
    this.permissions = new Set(permissions || []);
    this.fetchImpl = fetchImpl;
    this.labPrincipalHeader = labPrincipalHeader;
  }

  #authorize(permission) {
    requireScopePermission({
      actor: {
        userId: this.actorId,
        tenantId: this.tenantId,
        membershipId: this.membershipId,
        membershipStatus: "active",
        status: "active"
      },
      scope: { id: this.scopeId, tenantId: this.tenantId },
      grant: {
        tenantId: this.tenantId,
        scopeId: this.scopeId,
        userId: this.actorId,
        membershipId: this.membershipId,
        permissions: this.permissions
      }
    }, permission);
  }

  #requireKey() {
    if (!this.scopeKey) throw new Error("Unlock an authorized scope key before reading or writing encrypted content.");
    assertScopeKey(this.scopeKey);
  }

  async #request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (this.labPrincipalHeader) headers["X-SALTA-Lab-Principal"] = this.actorId;
    const response = await this.fetchImpl(this.endpoint + path, {
      ...options,
      credentials: "include",
      cache: "no-store",
      headers
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 409
        ? "The record changed in another session. Reload it before saving."
        : "The encrypted storage operation was denied or failed.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async save({ type, data, objectId = globalThis.crypto.randomUUID(), revision = 1 }) {
    this.#authorize("write");
    this.#requireKey();
    const context = validateObjectContext({
      tenantId: this.tenantId,
      scopeId: this.scopeId,
      objectId,
      type: safeType(type),
      keyVersion: this.keyVersion,
      revision
    });
    const encrypted = await encryptJson(this.scopeKey, context, data);
    const metadata = await this.#request("/v1/objects", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: this.tenantId,
        scope_id: this.scopeId,
        object_id: context.objectId,
        object_type: context.type,
        protocol_version: encrypted.protocol_version,
        key_version: encrypted.key_version,
        revision: encrypted.revision,
        kdf: encrypted.kdf,
        aead: encrypted.aead,
        salt: encrypted.salt,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext
      })
    });
    return { ...metadata, object_id: context.objectId, revision };
  }

  async update({ type, data, objectId, expectedRevision }) {
    this.#authorize("write");
    this.#requireKey();
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new TypeError("A current revision is required.");
    const context = validateObjectContext({
      tenantId: this.tenantId,
      scopeId: this.scopeId,
      objectId,
      type: safeType(type),
      keyVersion: this.keyVersion,
      revision: expectedRevision + 1
    });
    const encrypted = await encryptJson(this.scopeKey, context, data);
    const metadata = await this.#request("/v1/objects/" + encodeURIComponent(objectId), {
      method: "PUT",
      body: JSON.stringify({
        tenant_id: this.tenantId,
        scope_id: this.scopeId,
        object_type: context.type,
        expected_revision: expectedRevision,
        protocol_version: encrypted.protocol_version,
        key_version: encrypted.key_version,
        revision: encrypted.revision,
        kdf: encrypted.kdf,
        aead: encrypted.aead,
        salt: encrypted.salt,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext
      })
    });
    return { ...metadata, object_id: context.objectId, revision: context.revision };
  }

  async load({ objectId }) {
    this.#authorize("read");
    this.#requireKey();
    const query = new URLSearchParams({ tenant_id: this.tenantId, scope_id: this.scopeId });
    const result = await this.#request("/v1/objects/" + encodeURIComponent(objectId) + "?" + query, { method: "GET" });
    const row = result.object;
    if (!row || row.tenant_id !== this.tenantId || row.scope_id !== this.scopeId || row.object_id !== objectId) {
      throw new Error("The encrypted record is unavailable in this scope.");
    }
    return decryptJson(this.scopeKey, {
      tenantId: row.tenant_id,
      scopeId: row.scope_id,
      objectId: row.object_id,
      type: row.object_type,
      keyVersion: row.key_version,
      revision: row.revision
    }, row);
  }

  async listEncrypted({ after = "", limit = 25 } = {}) {
    this.#authorize("read");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError("Page size must be between 1 and 50.");
    const query = new URLSearchParams({ tenant_id: this.tenantId, scope_id: this.scopeId, limit: String(limit) });
    if (after) query.set("after", after);
    const result = await this.#request("/v1/objects?" + query, { method: "GET" });
    if (!Array.isArray(result.objects)) throw new Error("The encrypted storage page is invalid.");
    return { objects: result.objects, nextCursor: result.next_cursor || null };
  }

  async publishEnvelope(envelope) {
    this.#authorize("share");
    if (envelope.tenant_id !== this.tenantId || envelope.scope_id !== this.scopeId ||
        envelope.key_version !== this.keyVersion) {
      throw new TypeError("The envelope does not belong to this repository scope.");
    }
    return this.#request("/v1/envelopes", { method: "POST", body: JSON.stringify(envelope) });
  }

  async getMyEnvelope() {
    this.#authorize("read");
    const query = new URLSearchParams({ tenant_id: this.tenantId, scope_id: this.scopeId });
    const result = await this.#request("/v1/envelopes?" + query, { method: "GET" });
    return result.envelope || null;
  }
}
