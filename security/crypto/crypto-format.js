export const CRYPTO_PROTOCOL_VERSION = 1;
export const MAX_PLAINTEXT_BYTES = 1024 * 1024;
export const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 16;

const SECURE_DATA_TYPE_SET = new Set([
  "diary.class.v1",
  "diary.student.v1",
  "diary.item.v1",
  "diary.record.v1",
  "diary.attendance.v1",
  "diary.calendar.v1",
  "diary.report.v1",
  "communications.announcement.v1",
  "festival.submission.v1",
  "mostra.assessment.v1",
  "institution.profile.v1"
]);
export const SECURE_DATA_TYPES = Object.freeze([...SECURE_DATA_TYPE_SET]);

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function randomBytes(length, cryptoApi = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1 || length > 65536) throw new TypeError("Invalid random byte length.");
  return cryptoApi.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function fromBase64Url(value, maxBytes = MAX_CIPHERTEXT_BYTES) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/u.test(value) || value.length > Math.ceil(maxBytes * 4 / 3) + 4) {
    throw new TypeError("Invalid encoded cryptographic data.");
  }
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  if (binary.length > maxBytes) throw new TypeError("Cryptographic data exceeds the allowed size.");
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function encodeUtf8(value) {
  return encoder.encode(value);
}

export function decodeUtf8(value) {
  return decoder.decode(value);
}

export function canonicalJson(value) {
  const ancestors = new Set();
  function serialize(item) {
    if (item === null || typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError("Encrypted values must contain finite JSON numbers.");
      return JSON.stringify(item);
    }
    if (typeof item !== "object") throw new TypeError("Encrypted values must be plain JSON data.");
    if (ancestors.has(item)) throw new TypeError("Encrypted values cannot contain circular references.");
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.getOwnPropertySymbols(item).length) throw new TypeError("Encrypted arrays cannot contain symbol properties.");
        return "[" + Array.from(item, serialize).join(",") + "]";
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Encrypted values must use plain objects.");
      if (Object.getOwnPropertySymbols(item).length) throw new TypeError("Encrypted objects cannot contain symbol properties.");
      const keys = Object.keys(item).sort();
      return "{" + keys.map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("Encrypted objects cannot contain accessors.");
        return JSON.stringify(key) + ":" + serialize(descriptor.value);
      }).join(",") + "}";
    } finally {
      ancestors.delete(item);
    }
  }
  return serialize(value);
}

function validOpaqueId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-][A-Za-z0-9._-]{1,127}$/u.test(value);
}

export function validateObjectContext(context) {
  if (!context || !validOpaqueId(context.tenantId) || !validOpaqueId(context.scopeId) ||
      !validOpaqueId(context.objectId) || !SECURE_DATA_TYPE_SET.has(context.type) ||
      !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1 ||
      !Number.isSafeInteger(context.revision) || context.revision < 1) {
    throw new TypeError("The cryptographic context is incomplete or unsupported.");
  }
  return Object.freeze({
    protocolVersion: CRYPTO_PROTOCOL_VERSION,
    tenantId: context.tenantId,
    scopeId: context.scopeId,
    objectId: context.objectId,
    type: context.type,
    keyVersion: context.keyVersion,
    revision: context.revision
  });
}

export function objectAad(context) {
  const validated = validateObjectContext(context);
  return encodeUtf8(canonicalJson({
    protocol_version: validated.protocolVersion,
    tenant_id: validated.tenantId,
    scope_id: validated.scopeId,
    object_id: validated.objectId,
    object_type: validated.type,
    key_version: validated.keyVersion,
    revision: validated.revision
  }));
}

export function validateEnvelopeContext(context) {
  if (!context || !validOpaqueId(context.tenantId) || !validOpaqueId(context.scopeId) ||
      !validOpaqueId(context.recipientId) || !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1) {
    throw new TypeError("The key envelope context is incomplete.");
  }
  return Object.freeze({
    protocolVersion: CRYPTO_PROTOCOL_VERSION,
    tenantId: context.tenantId,
    scopeId: context.scopeId,
    recipientId: context.recipientId,
    keyVersion: context.keyVersion
  });
}

export function envelopeAad(context) {
  const validated = validateEnvelopeContext(context);
  return encodeUtf8(canonicalJson({
    protocol_version: validated.protocolVersion,
    purpose: "salta-scope-key-envelope",
    tenant_id: validated.tenantId,
    scope_id: validated.scopeId,
    recipient_id: validated.recipientId,
    key_version: validated.keyVersion
  }));
}
