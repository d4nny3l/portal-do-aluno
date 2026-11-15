import {
  MAX_CIPHERTEXT_BYTES,
  MAX_PLAINTEXT_BYTES,
  canonicalJson,
  encodeUtf8,
  objectAad,
  randomBytes,
  toBase64Url,
  validateObjectContext
} from "./crypto-format.js";
import { assertScopeKey } from "./key-generation.js";

export async function encryptJson(scopeKey, context, data) {
  assertScopeKey(scopeKey);
  const validated = validateObjectContext(context);
  const plaintext = encodeUtf8(canonicalJson(data));
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new TypeError("The record exceeds the encryption size limit.");
  const salt = randomBytes(32);
  const nonce = randomBytes(12);
  const key = await globalThis.crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: objectAad(validated) },
    scopeKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  try {
    const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: objectAad(validated), tagLength: 128 },
      key,
      plaintext
    ));
    if (ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) throw new TypeError("The encrypted record exceeds the size limit.");
    return Object.freeze({
      protocol_version: validated.protocolVersion,
      key_version: validated.keyVersion,
      revision: validated.revision,
      kdf: "HKDF-SHA256",
      aead: "AES-256-GCM",
      salt: toBase64Url(salt),
      nonce: toBase64Url(nonce),
      ciphertext: toBase64Url(ciphertext)
    });
  } catch {
    throw new Error("The record could not be encrypted.");
  } finally {
    plaintext.fill(0);
  }
}
