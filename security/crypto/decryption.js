import {
  MAX_CIPHERTEXT_BYTES,
  canonicalJson,
  decodeUtf8,
  encodeUtf8,
  fromBase64Url,
  objectAad,
  validateObjectContext
} from "./crypto-format.js";
import { assertScopeKey } from "./key-generation.js";

export async function decryptJson(scopeKey, context, encrypted) {
  assertScopeKey(scopeKey);
  const validated = validateObjectContext(context);
  if (!encrypted || encrypted.protocol_version !== validated.protocolVersion ||
      encrypted.key_version !== validated.keyVersion || encrypted.revision !== validated.revision ||
      encrypted.kdf !== "HKDF-SHA256" || encrypted.aead !== "AES-256-GCM") {
    throw new Error("The encrypted record format or version is not supported.");
  }
  const salt = fromBase64Url(encrypted.salt, 32);
  const nonce = fromBase64Url(encrypted.nonce, 12);
  const ciphertext = fromBase64Url(encrypted.ciphertext, MAX_CIPHERTEXT_BYTES);
  if (salt.byteLength !== 32 || nonce.byteLength !== 12 || ciphertext.byteLength < 16) {
    throw new Error("The encrypted record is incomplete or corrupt.");
  }
  const aad = objectAad(validated);
  const key = await globalThis.crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: aad },
    scopeKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  try {
    const plaintext = new Uint8Array(await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
      key,
      ciphertext
    ));
    try {
      const value = JSON.parse(decodeUtf8(plaintext));
      if (canonicalJson(value) !== decodeUtf8(plaintext)) throw new Error("non-canonical JSON");
      return value;
    } finally {
      plaintext.fill(0);
    }
  } catch {
    throw new Error("The encrypted record failed authentication or could not be decoded.");
  }
}
