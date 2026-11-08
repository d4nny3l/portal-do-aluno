import {
  canonicalJson,
  decodeUtf8,
  encodeUtf8,
  fromBase64Url,
  randomBytes,
  toBase64Url
} from "./crypto-format.js";
import { generateIdentityKeyPair, importIdentityPrivateKey, importIdentityPublicKey } from "./key-wrapping.js";

function validateRecoveryContext(context) {
  if (!context || typeof context.tenantId !== "string" || typeof context.userId !== "string" ||
      !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1) {
    throw new TypeError("A valid identity context is required for recovery.");
  }
  return { protocolVersion: 1, tenantId: context.tenantId, userId: context.userId, keyVersion: context.keyVersion };
}

function recoveryAad(context) {
  return encodeUtf8(canonicalJson({ purpose: "salta-identity-recovery", ...context }));
}

export async function createIdentityWithRecovery(context) {
  const validated = validateRecoveryContext(context);
  const identity = await generateIdentityKeyPair();
  const recoverySecret = randomBytes(32);
  const nonce = randomBytes(12);
  const aad = recoveryAad(validated);
  try {
    const recoveryKey = await globalThis.crypto.subtle.importKey("raw", recoverySecret, "AES-GCM", false, ["encrypt", "decrypt"]);
    const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
      recoveryKey,
      identity.privateKeyBytes
    ));
    return {
      identity: { publicKey: identity.publicKey, privateKey: identity.privateKey },
      identityKeyPair: { publicKey: identity.publicKey, privateKey: identity.privateKey },
      publicKey: toBase64Url(identity.publicKeyBytes),
      recoveryCode: toBase64Url(recoverySecret),
      recoveryBundle: Object.freeze({
        protocol_version: validated.protocolVersion,
        tenant_id: validated.tenantId,
        user_id: validated.userId,
        key_version: validated.keyVersion,
        public_key: toBase64Url(identity.publicKeyBytes),
        nonce: toBase64Url(nonce),
        ciphertext: toBase64Url(ciphertext)
      })
    };
  } catch {
    throw new Error("Could not create the experimental recovery bundle.");
  } finally {
    identity.privateKeyBytes.fill(0);
    recoverySecret.fill(0);
  }
}

export async function recoverIdentity(recoveryCode, bundle, context) {
  const validated = validateRecoveryContext(context);
  if (!bundle || bundle.protocol_version !== validated.protocolVersion ||
      bundle.tenant_id !== validated.tenantId || bundle.user_id !== validated.userId ||
      bundle.key_version !== validated.keyVersion) {
    throw new Error("The recovery bundle does not match this identity.");
  }
  const secret = fromBase64Url(recoveryCode, 32);
  const nonce = fromBase64Url(bundle.nonce, 12);
  const ciphertext = fromBase64Url(bundle.ciphertext, 512);
  if (secret.byteLength !== 32 || nonce.byteLength !== 12 || ciphertext.byteLength < 32) {
    secret.fill(0);
    throw new Error("The recovery material is incomplete.");
  }
  try {
    const recoveryKey = await globalThis.crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["decrypt"]);
    const rawPrivateKey = new Uint8Array(await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: recoveryAad(validated), tagLength: 128 },
      recoveryKey,
      ciphertext
    ));
    const privateKey = await importIdentityPrivateKey(rawPrivateKey);
    const publicKeyBytes = fromBase64Url(bundle.public_key, 256);
    const publicKey = await importIdentityPublicKey(publicKeyBytes);
    return { publicKey, privateKey, publicKeyBytes, identityKeyPair: { publicKey, privateKey } };
  } catch {
    throw new Error("The recovery code is incorrect or the bundle is damaged.");
  } finally {
    secret.fill(0);
  }
}
