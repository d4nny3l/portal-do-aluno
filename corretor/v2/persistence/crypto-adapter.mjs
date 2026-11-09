import { requireCryptoCore, validateCiphertextEnvelope } from "../contracts/crypto-envelope.mjs";

const STORED_CIPHER_KEYS = Object.freeze(["object_id", "object_type", "protocol_version", "key_version", "revision", "kdf", "aead", "salt", "nonce", "ciphertext"]);

function coreContext(context) {
  return {
    protocolVersion: 1,
    tenantId: context.tenant_id,
    scopeId: context.scope_id,
    objectId: context.object_id,
    type: context.object_type,
    keyVersion: context.key_version,
    revision: context.revision
  };
}

export function createCryptoCoreAdapter(core) {
  requireCryptoCore(core);
  if (typeof core?.encryptJson !== "function" || typeof core?.decryptJson !== "function") throw new TypeError("Crypto Core precisa cifrar e decifrar JSON.");
  return Object.freeze({
    async seal(scopeKey, context, value) {
      const metadata = validateCiphertextEnvelope({
        ...context,
        protocol_version: 1,
        key_version: context.key_version,
        revision: context.revision,
        kdf: "HKDF-SHA256", aead: "AES-256-GCM", salt: "pending-salt", nonce: "pending-nonce", ciphertext: "pending-ciphertext"
      });
      const encrypted = await core.encryptJson(scopeKey, coreContext(metadata), value);
      return validateCiphertextEnvelope({ ...metadata, ...encrypted });
    },
    async open(scopeKey, context, envelope) {
      const validated = validateCiphertextEnvelope(envelope, context);
      const encrypted = Object.fromEntries(STORED_CIPHER_KEYS.filter(key => key !== "object_id" && key !== "object_type").map(key => [key, validated[key]]));
      return core.decryptJson(scopeKey, coreContext(validated), encrypted);
    }
  });
}

export function compactEncryptedClaim(envelope, expected) {
  const valid = validateCiphertextEnvelope(envelope, expected);
  return Object.freeze(Object.fromEntries(STORED_CIPHER_KEYS.map(key => [key, valid[key]])));
}

export function expandEncryptedClaim(compact, { tenant_id, scope_id }) {
  return validateCiphertextEnvelope({ ...compact, tenant_id, scope_id });
}
