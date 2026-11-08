import {
  Aes256Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256
} from "@hpke/core";
import { envelopeAad, fromBase64Url, randomBytes, toBase64Url, validateEnvelopeContext } from "./crypto-format.js";
import { assertIdentityKeyPair } from "./key-generation.js";

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm()
});

export async function serializeIdentityPublicKey(publicKey) {
  if (!(publicKey instanceof CryptoKey) || publicKey.type !== "public") throw new TypeError("A public identity key is required.");
  return new Uint8Array(await suite.kem.serializePublicKey(publicKey));
}

export async function generateIdentityKeyPair() {
  const generated = await suite.kem.generateKeyPair();
  const publicKeyBytes = new Uint8Array(await suite.kem.serializePublicKey(generated.publicKey));
  const privateKeyBytes = new Uint8Array(await suite.kem.serializePrivateKey(generated.privateKey));
  try {
    const jwk = await globalThis.crypto.subtle.exportKey("jwk", generated.privateKey);
    const privateKey = await globalThis.crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
    const publicKey = await suite.kem.deserializePublicKey(publicKeyBytes);
    return { publicKey, privateKey, publicKeyBytes, privateKeyBytes };
  } catch (error) {
    privateKeyBytes.fill(0);
    throw error;
  }
}

export async function importIdentityPrivateKey(rawPrivateKey) {
  const privateKeyBytes = rawPrivateKey instanceof Uint8Array ? rawPrivateKey : new Uint8Array(rawPrivateKey);
  try {
    const temporaryKey = await suite.kem.deserializePrivateKey(privateKeyBytes);
    const jwk = await globalThis.crypto.subtle.exportKey("jwk", temporaryKey);
    return await globalThis.crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
  } catch {
    throw new Error("The identity key could not be imported.");
  } finally {
    privateKeyBytes.fill(0);
  }
}

export async function importIdentityPublicKey(rawPublicKey) {
  const bytes = rawPublicKey instanceof Uint8Array ? rawPublicKey : new Uint8Array(rawPublicKey);
  try {
    return await suite.kem.deserializePublicKey(bytes);
  } catch {
    throw new Error("The recipient public key is invalid.");
  }
}

export async function fingerprintPublicKey(publicKeyBytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", publicKeyBytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function wrapScopeKey(rawScopeKey, recipientPublicKey, context) {
  const validated = validateEnvelopeContext(context);
  if (!(recipientPublicKey instanceof CryptoKey) || recipientPublicKey.type !== "public") {
    throw new TypeError("A recipient public key is required.");
  }
  const raw = rawScopeKey instanceof Uint8Array ? rawScopeKey : new Uint8Array(rawScopeKey);
  if (raw.byteLength !== 32) throw new TypeError("Scope keys must contain 32 random bytes.");
  const aad = envelopeAad(validated);
  try {
    const { enc, ct } = await suite.seal({ recipientPublicKey }, raw, aad);
    return Object.freeze({
      protocol_version: validated.protocolVersion,
      kem: "DHKEM(P-256,HKDF-SHA256)",
      kdf: "HKDF-SHA256",
      aead: "AES-256-GCM",
      tenant_id: validated.tenantId,
      scope_id: validated.scopeId,
      recipient_id: validated.recipientId,
      key_version: validated.keyVersion,
      enc: toBase64Url(new Uint8Array(enc)),
      ciphertext: toBase64Url(new Uint8Array(ct))
    });
  } catch {
    throw new Error("Could not create the recipient key envelope.");
  }
}

export async function unwrapScopeKey(envelope, identityKeyPair, expectedContext) {
  const validated = validateEnvelopeContext(expectedContext);
  assertIdentityKeyPair(identityKeyPair);
  if (!envelope || envelope.protocol_version !== validated.protocolVersion ||
      envelope.kem !== "DHKEM(P-256,HKDF-SHA256)" || envelope.kdf !== "HKDF-SHA256" ||
      envelope.aead !== "AES-256-GCM" || envelope.tenant_id !== validated.tenantId ||
      envelope.scope_id !== validated.scopeId || envelope.recipient_id !== validated.recipientId ||
      envelope.key_version !== validated.keyVersion) {
    throw new Error("The key envelope does not match this user, tenant, scope, or key version.");
  }
  try {
    const plaintext = await suite.open(
      // DHKEM needs the public half to build its KEM context. Passing only a
      // non-exportable private CryptoKey makes the library try to derive and
      // export its public key, which WebCrypto correctly rejects.
      { recipientKey: identityKeyPair, enc: fromBase64Url(envelope.enc, 256) },
      fromBase64Url(envelope.ciphertext, 256),
      envelopeAad(validated)
    );
    const rawKey = new Uint8Array(plaintext);
    if (rawKey.byteLength !== 32) {
      rawKey.fill(0);
      throw new Error("invalid key size");
    }
    try {
      return await globalThis.crypto.subtle.importKey("raw", rawKey, "HKDF", false, ["deriveKey"]);
    } finally {
      rawKey.fill(0);
    }
  } catch {
    throw new Error("The key envelope could not be opened by this identity.");
  }
}

export async function createScopeKeyEnvelopes({ recipientPublicKeys, tenantId, scopeId, keyVersion }) {
  if (!Array.isArray(recipientPublicKeys) || recipientPublicKeys.length === 0) {
    throw new TypeError("At least one authorized recipient is required.");
  }
  const rawKey = randomBytes(32);
  try {
    const key = await globalThis.crypto.subtle.importKey("raw", rawKey, "HKDF", false, ["deriveKey"]);
    const envelopes = await Promise.all(recipientPublicKeys.map(recipient =>
      wrapScopeKey(rawKey, recipient.publicKey, {
        tenantId,
        scopeId,
        recipientId: recipient.recipientId,
        keyVersion
      })
    ));
    return { key, envelopes };
  } finally {
    rawKey.fill(0);
  }
}
