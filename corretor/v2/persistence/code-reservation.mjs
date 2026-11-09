import { generateSaltaCode } from "../domain/identity.mjs";
import { validateCiphertextEnvelope } from "../contracts/crypto-envelope.mjs";
import { compactEncryptedClaim } from "./crypto-adapter.mjs";

const encoder = new TextEncoder();

async function digestCode(code, pepperKey, cryptoProvider) {
  if (!pepperKey || !cryptoProvider?.subtle) throw new Error("HMAC de reserva indisponível.");
  const key = await cryptoProvider.subtle.importKey("raw", pepperKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await cryptoProvider.subtle.sign("HMAC", key, encoder.encode(code)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function inTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = operation(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

export async function reserveSaltaCode({ db, workspaceId, scopeId, participantRef, pepperKey, sealClaim, authorizeReservation, cryptoProvider = globalThis.crypto, generateCode = () => generateSaltaCode(cryptoProvider), maxAttempts = 32, clock = () => new Date().toISOString() }) {
  if (typeof sealClaim !== "function") throw new TypeError("A reserva exige adapter criptográfico para cifrar o vínculo.");
  if (typeof authorizeReservation !== "function" || await authorizeReservation({ workspaceId, scopeId }) !== true) throw new Error("Acesso negado.");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 256) throw new TypeError("Limite de tentativas inválido.");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateCode();
    if (!/^\d{7}$/u.test(code)) throw new TypeError("O Código SALTA gerado é inválido.");
    const digest = await digestCode(code, pepperKey, cryptoProvider);
    const envelope = validateCiphertextEnvelope(await sealClaim({ code, workspaceId, scopeId, participantRef }), {
      tenant_id: workspaceId, scope_id: scopeId, object_type: "salta.identity.code-claim.v1"
    });
    const compact = compactEncryptedClaim(envelope, { tenant_id: workspaceId, scope_id: scopeId, object_type: "salta.identity.code-claim.v1" });
    try {
      inTransaction(db, () => db.prepare("INSERT INTO salta_code_claims(code_digest,encrypted_claim_json,created_at) VALUES (?,?,?)").run(digest, JSON.stringify(compact), clock()));
      return Object.freeze({ code, attempts: attempt + 1 });
    } catch (error) {
      if (error.code === "ERR_SQLITE_CONSTRAINT_PRIMARYKEY" || error.code === "ERR_SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed: salta_code_claims\.code_digest/u.test(error.message)) continue;
      throw error;
    }
  }
  throw new Error("Não foi possível reservar um código único após várias colisões.");
}

export async function findCodeClaim(db, { code, pepperKey, cryptoProvider = globalThis.crypto, workspaceId, scopeId, openClaim, authorizeLookup }) {
  if (typeof openClaim !== "function") throw new TypeError("A leitura exige adapter criptográfico autorizado.");
  if (typeof authorizeLookup !== "function" || await authorizeLookup({ workspaceId, scopeId }) !== true) throw new Error("Acesso negado.");
  const digest = await digestCode(code, pepperKey, cryptoProvider);
  const row = db.prepare("SELECT encrypted_claim_json FROM salta_code_claims WHERE code_digest=?").get(digest);
  if (!row) return null;
  const compact = JSON.parse(row.encrypted_claim_json);
  const envelope = validateCiphertextEnvelope({ ...compact, tenant_id: workspaceId, scope_id: scopeId }, {
    tenant_id: workspaceId, scope_id: scopeId, object_type: "salta.identity.code-claim.v1"
  });
  return openClaim(envelope);
}
