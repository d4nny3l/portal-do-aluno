import { randomBytes } from "./crypto-format.js";

export async function createScopeKeyMaterial({ cryptoApi = globalThis.crypto } = {}) {
  const rawKey = randomBytes(32, cryptoApi);
  try {
    const key = await cryptoApi.subtle.importKey("raw", rawKey, "HKDF", false, ["deriveKey"]);
    return { key, destroy: () => rawKey.fill(0) };
  } catch (error) {
    rawKey.fill(0);
    throw error;
  }
}

export function assertScopeKey(key) {
  if (!(key instanceof CryptoKey) || key.type !== "secret" || key.extractable ||
      key.algorithm?.name !== "HKDF" || !key.usages.includes("deriveKey")) {
    throw new TypeError("A non-exportable HKDF scope key is required.");
  }
  return key;
}

export function assertPrivateIdentityKey(key) {
  if (!(key instanceof CryptoKey) || key.type !== "private" || key.extractable ||
      key.algorithm?.name !== "ECDH" || key.algorithm?.namedCurve !== "P-256") {
    throw new TypeError("A non-exportable P-256 identity key is required.");
  }
  return key;
}

export function assertIdentityKeyPair(keyPair) {
  if (!keyPair || !(keyPair.privateKey instanceof CryptoKey) || !(keyPair.publicKey instanceof CryptoKey) ||
      keyPair.publicKey.type !== "public" || keyPair.publicKey.algorithm?.name !== "ECDH" ||
      keyPair.publicKey.algorithm?.namedCurve !== "P-256") {
    throw new TypeError("A complete P-256 identity key pair is required.");
  }
  assertPrivateIdentityKey(keyPair.privateKey);
  return keyPair;
}
