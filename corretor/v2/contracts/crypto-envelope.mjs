import { assertOpaqueId } from "../domain/identity.mjs";

const OBJECT_TYPES = new Set([
  "salta.assessment.v1", "salta.assessment.participants.v1", "salta.assessment.key.v1",
  "salta.assessment.capture.v1", "salta.assessment.observation.v1", "salta.assessment.result.v1", "salta.identity.code-claim.v1",
  "salta.diary.result.v1"
]);
const ENVELOPE_KEYS = new Set(["tenant_id", "scope_id", "object_id", "object_type", "protocol_version", "key_version", "revision", "kdf", "aead", "salt", "nonce", "ciphertext"]);

export function validateCiphertextEnvelope(envelope, expected = {}) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new TypeError("Envelope cifrado inválido.");
  for (const key of Object.keys(envelope)) if (!ENVELOPE_KEYS.has(key)) throw new TypeError("O contrato aceita somente metadados e ciphertext.");
  for (const key of ["tenant_id", "scope_id", "object_id"]) assertOpaqueId(envelope[key], key);
  if (!OBJECT_TYPES.has(envelope.object_type)) throw new TypeError("Tipo de objeto SALTA não registrado para o contrato experimental.");
  if (envelope.protocol_version !== 1 || envelope.kdf !== "HKDF-SHA256" || envelope.aead !== "AES-256-GCM") throw new TypeError("Versão ou algoritmo criptográfico incompatível.");
  if (!Number.isSafeInteger(envelope.key_version) || envelope.key_version < 1 || !Number.isSafeInteger(envelope.revision) || envelope.revision < 1) throw new TypeError("Versão de chave/revisão inválida.");
  for (const key of ["salt", "nonce", "ciphertext"]) if (typeof envelope[key] !== "string" || envelope[key].length < 8 || envelope[key].length > 2_000_000) throw new TypeError(`Campo cifrado inválido: ${key}.`);
  for (const [key, value] of Object.entries(expected)) if (value !== undefined && envelope[key] !== value) throw new TypeError("Envelope fora do tenant, escopo ou objeto esperado.");
  return Object.freeze({ ...envelope });
}

// Interface estrutural para o Crypto Core: valida a presença das operações,
// sem duplicar algoritmos nem simular cifra em produção.
export function requireCryptoCore(core) {
  for (const method of ["encryptJson", "decryptJson", "createSaltaScope", "unwrapScopeKey"]) {
    if (typeof core?.[method] !== "function") throw new TypeError(`SALTA Crypto Core precisa implementar ${method}.`);
  }
  return core;
}

export const registeredAssessmentObjectTypes = Object.freeze([...OBJECT_TYPES]);
