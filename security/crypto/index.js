export { CRYPTO_PROTOCOL_VERSION, SECURE_DATA_TYPES, canonicalJson, fingerprintPublicKey, fromBase64Url, toBase64Url } from "./public-api.js";
export { createSaltaIdentity, restoreSaltaIdentity, createSaltaScope, verifyScopeKey } from "./key-management.js";
export { importIdentityPublicKey, serializeIdentityPublicKey, unwrapScopeKey } from "./key-wrapping.js";
export { encryptJson } from "./encryption.js";
export { decryptJson } from "./decryption.js";
export { rotateScopeRecords, createRotatedScope } from "./rotation.js";
export { EncryptedRepository } from "../storage/encrypted-repository.js";
export { DeviceKeyStore } from "../storage/device-key-store.js";
