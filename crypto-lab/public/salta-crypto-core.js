var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// (disabled):crypto
var require_crypto = __commonJS({
  "(disabled):crypto"() {
  }
});

// ../security/crypto/crypto-format.js
var CRYPTO_PROTOCOL_VERSION = 1;
var MAX_PLAINTEXT_BYTES = 1024 * 1024;
var MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 16;
var SECURE_DATA_TYPE_SET = /* @__PURE__ */ new Set([
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
var SECURE_DATA_TYPES = Object.freeze([...SECURE_DATA_TYPE_SET]);
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8", { fatal: true });
function randomBytes(length, cryptoApi = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1 || length > 65536) throw new TypeError("Invalid random byte length.");
  return cryptoApi.getRandomValues(new Uint8Array(length));
}
function toBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function fromBase64Url(value, maxBytes = MAX_CIPHERTEXT_BYTES) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/u.test(value) || value.length > Math.ceil(maxBytes * 4 / 3) + 4) {
    throw new TypeError("Invalid encoded cryptographic data.");
  }
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  if (binary.length > maxBytes) throw new TypeError("Cryptographic data exceeds the allowed size.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function encodeUtf8(value) {
  return encoder.encode(value);
}
function decodeUtf8(value) {
  return decoder.decode(value);
}
function canonicalJson(value) {
  const ancestors = /* @__PURE__ */ new Set();
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
      return "{" + keys.map((key) => {
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
function validateObjectContext(context) {
  if (!context || !validOpaqueId(context.tenantId) || !validOpaqueId(context.scopeId) || !validOpaqueId(context.objectId) || !SECURE_DATA_TYPE_SET.has(context.type) || !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1 || !Number.isSafeInteger(context.revision) || context.revision < 1) {
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
function objectAad(context) {
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
function validateEnvelopeContext(context) {
  if (!context || !validOpaqueId(context.tenantId) || !validOpaqueId(context.scopeId) || !validOpaqueId(context.recipientId) || !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1) {
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
function envelopeAad(context) {
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

// ../node_modules/@hpke/common/esm/src/errors.js
var HpkeError = class extends Error {
  constructor(e) {
    let message;
    if (e instanceof Error) {
      message = e.message;
    } else if (typeof e === "string") {
      message = e;
    } else {
      message = "";
    }
    super(message);
    this.name = this.constructor.name;
  }
};
var InvalidParamError = class extends HpkeError {
};
var SerializeError = class extends HpkeError {
};
var DeserializeError = class extends HpkeError {
};
var EncapError = class extends HpkeError {
};
var DecapError = class extends HpkeError {
};
var ExportError = class extends HpkeError {
};
var SealError = class extends HpkeError {
};
var OpenError = class extends HpkeError {
};
var MessageLimitReachedError = class extends HpkeError {
};
var DeriveKeyPairError = class extends HpkeError {
};
var NotSupportedError = class extends HpkeError {
};

// ../node_modules/@hpke/common/esm/_dnt.shims.js
var dntGlobals = {};
var dntGlobalThis = createMergeProxy(globalThis, dntGlobals);
function createMergeProxy(baseObj, extObj) {
  return new Proxy(baseObj, {
    get(_target, prop, _receiver) {
      if (prop in extObj) {
        return extObj[prop];
      } else {
        return baseObj[prop];
      }
    },
    set(_target, prop, value) {
      if (prop in extObj) {
        delete extObj[prop];
      }
      baseObj[prop] = value;
      return true;
    },
    deleteProperty(_target, prop) {
      let success = false;
      if (prop in extObj) {
        delete extObj[prop];
        success = true;
      }
      if (prop in baseObj) {
        delete baseObj[prop];
        success = true;
      }
      return success;
    },
    ownKeys(_target) {
      const baseKeys = Reflect.ownKeys(baseObj);
      const extKeys = Reflect.ownKeys(extObj);
      const extKeysSet = new Set(extKeys);
      return [...baseKeys.filter((k) => !extKeysSet.has(k)), ...extKeys];
    },
    defineProperty(_target, prop, desc) {
      if (prop in extObj) {
        delete extObj[prop];
      }
      Reflect.defineProperty(baseObj, prop, desc);
      return true;
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop in extObj) {
        return Reflect.getOwnPropertyDescriptor(extObj, prop);
      } else {
        return Reflect.getOwnPropertyDescriptor(baseObj, prop);
      }
    },
    has(_target, prop) {
      return prop in extObj || prop in baseObj;
    }
  });
}

// ../node_modules/@hpke/common/esm/src/algorithm.js
async function loadSubtleCrypto() {
  if (dntGlobalThis !== void 0 && globalThis.crypto !== void 0) {
    return globalThis.crypto.subtle;
  }
  try {
    const { webcrypto } = await Promise.resolve().then(() => __toESM(require_crypto(), 1));
    return webcrypto.subtle;
  } catch (e) {
    throw new NotSupportedError(e);
  }
}
var NativeAlgorithm = class {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
  }
  async _setup() {
    if (this._api !== void 0) {
      return;
    }
    this._api = await loadSubtleCrypto();
  }
};

// ../node_modules/@hpke/common/esm/src/identifiers.js
var Mode = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
};
var KemId = {
  NotAssigned: 0,
  DhkemP256HkdfSha256: 16,
  DhkemP384HkdfSha384: 17,
  DhkemP521HkdfSha512: 18,
  DhkemSecp256k1HkdfSha256: 19,
  DhkemX25519HkdfSha256: 32,
  DhkemX448HkdfSha512: 33,
  HybridkemX25519Kyber768: 48,
  MlKem512: 64,
  MlKem768: 65,
  MlKem1024: 66,
  XWing: 25722
};
var AeadId = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  Chacha20Poly1305: 3,
  ExportOnly: 65535
};

// ../node_modules/@hpke/common/esm/src/consts.js
var INPUT_LENGTH_LIMIT = 8192;
var INFO_LENGTH_LIMIT = 268435456;
var MINIMUM_PSK_LENGTH = 32;
var EMPTY = /* @__PURE__ */ new Uint8Array(0);

// ../node_modules/@hpke/common/esm/src/interfaces/kemInterface.js
var SUITE_ID_HEADER_KEM = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]);

// ../node_modules/@hpke/common/esm/src/utils/misc.js
var isCryptoKeyPair = (x) => typeof x === "object" && x !== null && typeof x.privateKey === "object" && typeof x.publicKey === "object";
function i2Osp(n, w) {
  if (w <= 0) {
    throw new Error("i2Osp: too small size");
  }
  if (n >= 256 ** w) {
    throw new Error("i2Osp: too large integer");
  }
  const ret = new Uint8Array(w);
  for (let i = 0; i < w && n; i++) {
    ret[w - (i + 1)] = n % 256;
    n = Math.floor(n / 256);
  }
  return ret;
}
function concat(...parts) {
  let len = 0;
  for (const p of parts)
    len += p.length;
  const ret = new Uint8Array(len);
  let offset = 0;
  for (const p of parts) {
    ret.set(p, offset);
    offset += p.length;
  }
  return ret;
}
function base64UrlToBytes(v) {
  const base64 = v.replace(/-/g, "+").replace(/_/g, "/");
  const byteString = atob(base64);
  const ret = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    ret[i] = byteString.charCodeAt(i);
  }
  return ret;
}
function xor(a, b) {
  if (a.byteLength !== b.byteLength) {
    throw new Error("xor: different length inputs");
  }
  const buf = new Uint8Array(a.byteLength);
  for (let i = 0; i < a.byteLength; i++) {
    buf[i] = a[i] ^ b[i];
  }
  return buf;
}

// ../node_modules/@hpke/common/esm/src/kdfs/hkdf.js
var HPKE_VERSION = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function toUint8Array(input) {
  return new Uint8Array(toArrayBuffer(input));
}
function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
  }
  return new Uint8Array(input).slice().buffer;
}
var HkdfNative = class extends NativeAlgorithm {
  /**
   * Uses WebCrypto HMAC for salts of any length when no callback is supplied.
   * Prefer omitting the callback and its JavaScript HMAC/SHA-2 imports to reduce
   * bundle size. Empty salts are normalized to hashSize zero bytes.
   *
   * @param fallbackExtract Optional legacy callback, taking precedence over
   * WebCrypto for nonempty salts whose length differs from hashSize.
   * Empty and hash-sized salts always use WebCrypto.
   */
  constructor(fallbackExtract) {
    super();
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 1
    });
    Object.defineProperty(this, "hashSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "_suiteId", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: EMPTY
    });
    Object.defineProperty(this, "algHash", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: {
        name: "HMAC",
        hash: "SHA-256",
        length: 256
      }
    });
    Object.defineProperty(this, "_fallbackExtract", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._fallbackExtract = fallbackExtract;
  }
  init(suiteId) {
    this._suiteId = suiteId;
  }
  buildLabeledIkm(label, ikm) {
    this._checkInit();
    return concat(HPKE_VERSION, this._suiteId, label, ikm);
  }
  buildLabeledInfo(label, info, len) {
    this._checkInit();
    return concat(
      // I2OSP(len, 2)
      new Uint8Array([len >> 8, len]),
      HPKE_VERSION,
      this._suiteId,
      label,
      info
    );
  }
  async extract(salt, ikm) {
    await this._setup();
    const saltBuf = salt.byteLength === 0 ? new ArrayBuffer(this.hashSize) : toArrayBuffer(salt);
    const ikmBuf = toArrayBuffer(ikm);
    if (saltBuf.byteLength !== this.hashSize && this._fallbackExtract !== void 0) {
      return this._fallbackExtract(new Uint8Array(saltBuf), new Uint8Array(ikmBuf)).buffer;
    }
    const key = await this._api.importKey("raw", saltBuf, { name: this.algHash.name, hash: this.algHash.hash }, false, [
      "sign"
    ]);
    return await this._api.sign("HMAC", key, ikmBuf);
  }
  async expand(prk, info, len) {
    await this._setup();
    if (len > 255 * this.hashSize) {
      throw new Error("Entropy limit reached");
    }
    const prkBuf = toArrayBuffer(prk);
    const key = await this._api.importKey("raw", prkBuf, this.algHash, false, [
      "sign"
    ]);
    const okm = new Uint8Array(len);
    let prev = EMPTY;
    const mid = toUint8Array(info);
    for (let counter = 1, offset = 0; offset < okm.length; counter++) {
      const input = new Uint8Array(prev.length + mid.length + 1);
      input.set(prev);
      input.set(mid, prev.length);
      input[input.length - 1] = counter;
      prev = new Uint8Array(await this._api.sign("HMAC", key, input));
      const block = prev.subarray(0, Math.min(prev.length, okm.length - offset));
      okm.set(block, offset);
      offset += block.length;
    }
    return okm.buffer;
  }
  async extractAndExpand(salt, ikm, info, len) {
    await this._setup();
    const ikmBuf = toArrayBuffer(ikm);
    const baseKey = await this._api.importKey("raw", ikmBuf, "HKDF", false, ["deriveBits"]);
    return await this._api.deriveBits({
      name: "HKDF",
      hash: this.algHash.hash,
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(info)
    }, baseKey, len * 8);
  }
  async labeledExtract(salt, label, ikm) {
    return await this.extract(salt, this.buildLabeledIkm(label, ikm));
  }
  async labeledExpand(prk, label, info, len) {
    return await this.expand(prk, this.buildLabeledInfo(label, info, len), len);
  }
  _checkInit() {
    if (this._suiteId === EMPTY) {
      throw new Error("Not initialized. Call init()");
    }
  }
};
var HkdfSha256Native = class extends HkdfNative {
  constructor() {
    super(...arguments);
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 1
    });
    Object.defineProperty(this, "hashSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
    Object.defineProperty(this, "algHash", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: {
        name: "HMAC",
        hash: "SHA-256",
        length: 256
      }
    });
  }
};

// ../node_modules/@hpke/common/esm/src/kems/dhkem.js
var LABEL_EAE_PRK = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]);
var LABEL_SHARED_SECRET = /* @__PURE__ */ new Uint8Array([
  115,
  104,
  97,
  114,
  101,
  100,
  95,
  115,
  101,
  99,
  114,
  101,
  116
]);
var Dhkem = class {
  constructor(id, prim, kdf) {
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "secretSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "encSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "publicKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "privateKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "_prim", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_kdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.id = id;
    this._prim = prim;
    this._kdf = kdf;
    const suiteId = new Uint8Array(SUITE_ID_HEADER_KEM);
    suiteId.set(i2Osp(this.id, 2), 3);
    this._kdf.init(suiteId);
  }
  async serializePublicKey(key) {
    return await this._prim.serializePublicKey(key);
  }
  async deserializePublicKey(key) {
    return await this._prim.deserializePublicKey(toArrayBuffer(key));
  }
  async serializePrivateKey(key) {
    return await this._prim.serializePrivateKey(key);
  }
  async deserializePrivateKey(key) {
    return await this._prim.deserializePrivateKey(toArrayBuffer(key));
  }
  async importKey(format, key, isPublic = true) {
    return await this._prim.importKey(format, key, isPublic);
  }
  async generateKeyPair() {
    return await this._prim.generateKeyPair();
  }
  async deriveKeyPair(ikm) {
    const rawIkm = toArrayBuffer(ikm);
    if (rawIkm.byteLength > INPUT_LENGTH_LIMIT) {
      throw new InvalidParamError("Too long ikm");
    }
    return await this._prim.deriveKeyPair(rawIkm);
  }
  async encap(params) {
    let ke;
    if (params.ekm === void 0) {
      ke = await this.generateKeyPair();
    } else if (isCryptoKeyPair(params.ekm)) {
      ke = params.ekm;
    } else {
      ke = await this.deriveKeyPair(params.ekm);
    }
    const enc = await this._prim.serializePublicKey(ke.publicKey);
    const pkrm = await this._prim.serializePublicKey(params.recipientPublicKey);
    let dh = EMPTY;
    let dh1 = EMPTY;
    let dh2 = EMPTY;
    try {
      dh1 = new Uint8Array(await this._prim.dh(ke.privateKey, params.recipientPublicKey));
      dh = dh1;
      let pksm = EMPTY;
      if (params.senderKey !== void 0) {
        const sks = isCryptoKeyPair(params.senderKey) ? params.senderKey.privateKey : params.senderKey;
        dh2 = new Uint8Array(await this._prim.dh(sks, params.recipientPublicKey));
        dh = concat(dh1, dh2);
        dh1.fill(0);
        dh2.fill(0);
        const pks = isCryptoKeyPair(params.senderKey) ? params.senderKey.publicKey : await this._prim.derivePublicKey(params.senderKey);
        pksm = new Uint8Array(await this._prim.serializePublicKey(pks));
      }
      const kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm), pksm);
      const sharedSecret = await this._generateSharedSecret(dh, kemContext);
      return {
        enc,
        sharedSecret
      };
    } catch (e) {
      throw new EncapError(e);
    } finally {
      dh.fill(0);
      dh1.fill(0);
      dh2.fill(0);
    }
  }
  async decap(params) {
    const enc = toArrayBuffer(params.enc);
    const pke = await this._prim.deserializePublicKey(enc);
    const skr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.privateKey : params.recipientKey;
    const pkr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.publicKey : await this._prim.derivePublicKey(params.recipientKey);
    const pkrm = await this._prim.serializePublicKey(pkr);
    let dh = EMPTY;
    let dh1 = EMPTY;
    let dh2 = EMPTY;
    try {
      dh1 = new Uint8Array(await this._prim.dh(skr, pke));
      dh = dh1;
      let pksm = EMPTY;
      if (params.senderPublicKey !== void 0) {
        dh2 = new Uint8Array(await this._prim.dh(skr, params.senderPublicKey));
        dh = concat(dh1, dh2);
        dh1.fill(0);
        dh2.fill(0);
        pksm = new Uint8Array(await this._prim.serializePublicKey(params.senderPublicKey));
      }
      const kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm), pksm);
      return await this._generateSharedSecret(dh, kemContext);
    } catch (e) {
      throw new DecapError(e);
    } finally {
      dh.fill(0);
      dh1.fill(0);
      dh2.fill(0);
    }
  }
  async _generateSharedSecret(dh, kemContext) {
    const labeledIkm = this._kdf.buildLabeledIkm(LABEL_EAE_PRK, dh);
    try {
      const labeledInfo = this._kdf.buildLabeledInfo(LABEL_SHARED_SECRET, kemContext, this.secretSize);
      return await this._kdf.extractAndExpand(EMPTY, labeledIkm, labeledInfo, this.secretSize);
    } finally {
      labeledIkm.fill(0);
    }
  }
};

// ../node_modules/@hpke/common/esm/src/interfaces/dhkemPrimitives.js
var KEM_USAGES = ["deriveBits"];
var LABEL_DKP_PRK = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]);

// ../node_modules/@hpke/common/esm/src/kems/dhkemPrimitives/ecDhkemPrimitives.js
var LABEL_CANDIDATE = /* @__PURE__ */ new Uint8Array([
  99,
  97,
  110,
  100,
  105,
  100,
  97,
  116,
  101
]);
var EC_P_256 = {
  namedCurve: "P-256",
  size: 32,
  bitmask: 255,
  // deno-fmt-ignore
  pkcs8AlgId: /* @__PURE__ */ new Uint8Array([
    48,
    65,
    2,
    1,
    0,
    48,
    19,
    6,
    7,
    42,
    134,
    72,
    206,
    61,
    2,
    1,
    6,
    8,
    42,
    134,
    72,
    206,
    61,
    3,
    1,
    7,
    4,
    39,
    48,
    37,
    2,
    1,
    1,
    4,
    32
  ]),
  n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
};
var EC_P_384 = {
  namedCurve: "P-384",
  size: 48,
  bitmask: 255,
  // deno-fmt-ignore
  pkcs8AlgId: /* @__PURE__ */ new Uint8Array([
    48,
    78,
    2,
    1,
    0,
    48,
    16,
    6,
    7,
    42,
    134,
    72,
    206,
    61,
    2,
    1,
    6,
    5,
    43,
    129,
    4,
    0,
    34,
    4,
    55,
    48,
    53,
    2,
    1,
    1,
    4,
    48
  ]),
  n: 0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973n
};
var EC_P_521 = {
  namedCurve: "P-521",
  size: 66,
  bitmask: 1,
  // deno-fmt-ignore
  pkcs8AlgId: /* @__PURE__ */ new Uint8Array([
    48,
    96,
    2,
    1,
    0,
    48,
    16,
    6,
    7,
    42,
    134,
    72,
    206,
    61,
    2,
    1,
    6,
    5,
    43,
    129,
    4,
    0,
    35,
    4,
    73,
    48,
    71,
    2,
    1,
    1,
    4,
    66
  ]),
  n: 0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409n
};
function bigIntToBytes(v, len) {
  const out = new Uint8Array(len);
  let n = v;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  if (n !== 0n) {
    throw new Error("Invalid coordinate length");
  }
  return out;
}
function lessThan(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
}
function isZero(a) {
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    acc |= a[i];
  }
  return acc === 0;
}
var EcDhkemPrimitives = class extends NativeAlgorithm {
  /**
   * @param curve The curve parameters ({@link EC_P_256}, {@link EC_P_384} or {@link EC_P_521}).
   * @param hkdf The KDF used for DeriveKeyPair.
   */
  constructor(curve, hkdf) {
    super();
    Object.defineProperty(this, "_hkdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_curve", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_alg", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nPk", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nSk", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._hkdf = hkdf;
    this._curve = curve;
    this._alg = { name: "ECDH", namedCurve: curve.namedCurve };
    this._nPk = 1 + curve.size * 2;
    this._nSk = curve.size;
  }
  async serializePublicKey(key) {
    await this._setup();
    try {
      return await this._api.exportKey("raw", key);
    } catch (e) {
      throw new SerializeError(e);
    }
  }
  async deserializePublicKey(key) {
    await this._setup();
    try {
      return await this._importRawKey(toArrayBuffer(key), true);
    } catch (e) {
      throw new DeserializeError(e);
    }
  }
  async serializePrivateKey(key) {
    await this._setup();
    try {
      const jwk = await this._api.exportKey("jwk", key);
      if (!("d" in jwk)) {
        throw new Error("Not private key");
      }
      return base64UrlToBytes(jwk["d"]).buffer;
    } catch (e) {
      throw new SerializeError(e);
    }
  }
  async deserializePrivateKey(key) {
    await this._setup();
    try {
      return await this._importRawKey(toArrayBuffer(key), false);
    } catch (e) {
      throw new DeserializeError(e);
    }
  }
  async importKey(format, key, isPublic) {
    await this._setup();
    try {
      if (format === "raw") {
        return await this._importRawKey(key, isPublic);
      }
      if (key instanceof ArrayBuffer) {
        throw new Error("Invalid jwk key format");
      }
      return await this._importJWK(key, isPublic);
    } catch (e) {
      throw new DeserializeError(e);
    }
  }
  async generateKeyPair() {
    await this._setup();
    try {
      return await this._api.generateKey(this._alg, true, KEM_USAGES);
    } catch (e) {
      throw new NotSupportedError(e);
    }
  }
  async deriveKeyPair(ikm) {
    await this._setup();
    try {
      const rawIkm = toArrayBuffer(ikm);
      const dkpPrk = await this._hkdf.labeledExtract(EMPTY, LABEL_DKP_PRK, new Uint8Array(rawIkm));
      const order = bigIntToBytes(this._curve.n, this._nSk);
      let sk;
      for (let counter = 0; sk === void 0; counter++) {
        if (counter > 255) {
          throw new Error("Faild to derive a key pair");
        }
        const bytes = new Uint8Array(await this._hkdf.labeledExpand(dkpPrk, LABEL_CANDIDATE, i2Osp(counter, 1), this._nSk));
        bytes[0] = bytes[0] & this._curve.bitmask;
        if (!isZero(bytes) && lessThan(bytes, order)) {
          sk = await this._deserializePkcs8Key(bytes);
        }
        bytes.fill(0);
      }
      return {
        privateKey: sk,
        publicKey: await this.derivePublicKey(sk)
      };
    } catch (e) {
      throw new DeriveKeyPairError(e);
    }
  }
  async derivePublicKey(key) {
    await this._setup();
    const api = this._api;
    try {
      let jwk;
      try {
        jwk = await api.exportKey("jwk", key);
      } catch {
        jwk = await api.exportKey("jwk", await api.importKey("pkcs8", await api.exportKey("pkcs8", key), this._alg, true, KEM_USAGES));
      }
      delete jwk["d"];
      delete jwk["key_ops"];
      return await api.importKey("jwk", jwk, this._alg, true, []);
    } catch (e) {
      throw new DeserializeError(e);
    }
  }
  async dh(sk, pk) {
    try {
      await this._setup();
      const bits = await this._api.deriveBits({
        name: "ECDH",
        public: pk
      }, sk, this._nSk * 8);
      return bits;
    } catch (e) {
      throw new SerializeError(e);
    }
  }
  async _importRawKey(key, isPublic) {
    if (isPublic && key.byteLength !== this._nPk) {
      throw new Error("Invalid public key for the ciphersuite");
    }
    if (!isPublic && key.byteLength !== this._nSk) {
      throw new Error("Invalid private key for the ciphersuite");
    }
    if (isPublic) {
      return await this._api.importKey("raw", key, this._alg, true, []);
    }
    return await this._deserializePkcs8Key(new Uint8Array(key));
  }
  async _importJWK(key, isPublic) {
    if (typeof key.crv === "undefined" || key.crv !== this._alg.namedCurve) {
      throw new Error(`Invalid crv: ${key.crv}`);
    }
    if (isPublic) {
      if (typeof key.d !== "undefined") {
        throw new Error("Invalid key: `d` should not be set");
      }
      return await this._api.importKey("jwk", key, this._alg, true, []);
    }
    if (typeof key.d === "undefined") {
      throw new Error("Invalid key: `d` not found");
    }
    return await this._api.importKey("jwk", key, this._alg, true, KEM_USAGES);
  }
  async _deserializePkcs8Key(k) {
    const algId = this._curve.pkcs8AlgId;
    const pkcs8Key = new Uint8Array(algId.length + k.length);
    pkcs8Key.set(algId, 0);
    pkcs8Key.set(k, algId.length);
    try {
      return await this._api.importKey("pkcs8", pkcs8Key, this._alg, true, KEM_USAGES);
    } finally {
      pkcs8Key.fill(0);
    }
  }
};

// ../node_modules/@hpke/common/esm/src/kems/dhkemPrimitives/ec.js
function ecCurveOf(kem) {
  switch (kem) {
    case KemId.DhkemP256HkdfSha256:
      return EC_P_256;
    case KemId.DhkemP384HkdfSha384:
      return EC_P_384;
    case KemId.DhkemP521HkdfSha512:
      return EC_P_521;
    default:
      throw new NotSupportedError(`Unsupported KEM ID for Ec: ${kem}`);
  }
}
var Ec = class extends EcDhkemPrimitives {
  /**
   * @param kem The KEM ID (`DhkemP256HkdfSha256`, `DhkemP384HkdfSha384` or
   * `DhkemP521HkdfSha512`).
   * @param hkdf The KDF used for DeriveKeyPair.
   * @throws NotSupportedError if `kem` is not one of the above.
   */
  constructor(kem, hkdf) {
    super(ecCurveOf(kem), hkdf);
  }
};

// ../node_modules/@hpke/common/esm/src/interfaces/aeadEncryptionContext.js
var AEAD_USAGES = ["encrypt", "decrypt"];

// ../node_modules/@hpke/core/esm/src/aeads/aesGcm.js
var AesGcmContext = class extends NativeAlgorithm {
  constructor(key) {
    super();
    Object.defineProperty(this, "_rawKey", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_key", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._rawKey = toArrayBuffer(key);
  }
  async seal(iv, data, aad) {
    await this._setupKey();
    const alg = {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad)
    };
    const ct = await this._api.encrypt(alg, this._key, toArrayBuffer(data));
    return ct;
  }
  async open(iv, data, aad) {
    await this._setupKey();
    const alg = {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad)
    };
    const pt = await this._api.decrypt(alg, this._key, toArrayBuffer(data));
    return pt;
  }
  async _setupKey() {
    if (this._key !== void 0) {
      return;
    }
    await this._setup();
    const key = await this._importKey(this._rawKey);
    new Uint8Array(this._rawKey).fill(0);
    this._key = key;
    return;
  }
  async _importKey(key) {
    return await this._api.importKey("raw", key, { name: "AES-GCM" }, true, AEAD_USAGES);
  }
};
var Aes128Gcm = class {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: AeadId.Aes128Gcm
    });
    Object.defineProperty(this, "keySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 16
    });
    Object.defineProperty(this, "nonceSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 12
    });
    Object.defineProperty(this, "tagSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 16
    });
  }
  createEncryptionContext(key) {
    return new AesGcmContext(key);
  }
};
var Aes256Gcm = class extends Aes128Gcm {
  constructor() {
    super(...arguments);
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: AeadId.Aes256Gcm
    });
    Object.defineProperty(this, "keySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
    Object.defineProperty(this, "nonceSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 12
    });
    Object.defineProperty(this, "tagSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 16
    });
  }
};

// ../node_modules/@hpke/core/esm/src/utils/emitNotSupported.js
function emitNotSupported() {
  return new Promise((_resolve, reject) => {
    reject(new NotSupportedError("Not supported"));
  });
}

// ../node_modules/@hpke/core/esm/src/exporterContext.js
var LABEL_SEC = new Uint8Array([115, 101, 99]);
var ExporterContextImpl = class {
  constructor(api, kdf, exporterSecret) {
    Object.defineProperty(this, "_api", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "exporterSecret", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_kdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._api = api;
    this._kdf = kdf;
    this.exporterSecret = exporterSecret;
  }
  async seal(_data, _aad) {
    return await emitNotSupported();
  }
  async open(_data, _aad) {
    return await emitNotSupported();
  }
  async export(exporterContext, len) {
    const rawExporterContext = toArrayBuffer(exporterContext);
    if (rawExporterContext.byteLength > INPUT_LENGTH_LIMIT) {
      throw new InvalidParamError("Too long exporter context");
    }
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, LABEL_SEC, new Uint8Array(rawExporterContext), len);
    } catch (e) {
      throw new ExportError(e);
    }
  }
};
var RecipientExporterContextImpl = class extends ExporterContextImpl {
};
var SenderExporterContextImpl = class extends ExporterContextImpl {
  constructor(api, kdf, exporterSecret, enc) {
    super(api, kdf, exporterSecret);
    Object.defineProperty(this, "enc", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.enc = enc;
    return;
  }
};

// ../node_modules/@hpke/core/esm/src/encryptionContext.js
var EncryptionContextImpl = class extends ExporterContextImpl {
  constructor(api, kdf, params) {
    super(api, kdf, params.exporterSecret);
    Object.defineProperty(this, "_aead", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nK", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nN", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nT", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_ctx", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    if (params.key === void 0 || params.baseNonce === void 0 || params.seq === void 0) {
      throw new Error("Required parameters are missing");
    }
    this._aead = params.aead;
    this._nK = this._aead.keySize;
    this._nN = this._aead.nonceSize;
    this._nT = this._aead.tagSize;
    const key = this._aead.createEncryptionContext(params.key);
    this._ctx = {
      key,
      baseNonce: params.baseNonce,
      seq: params.seq
    };
  }
  computeNonce(k) {
    const seqBytes = i2Osp(k.seq, k.baseNonce.byteLength);
    return xor(k.baseNonce, seqBytes).buffer;
  }
  incrementSeq(k) {
    if (k.seq > Number.MAX_SAFE_INTEGER) {
      throw new MessageLimitReachedError("Message limit reached");
    }
    k.seq += 1;
    return;
  }
};

// ../node_modules/@hpke/core/esm/src/mutex.js
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _Mutex_locked;
var Mutex = class {
  constructor() {
    _Mutex_locked.set(this, Promise.resolve());
  }
  async lock() {
    let releaseLock;
    const nextLock = new Promise((resolve) => {
      releaseLock = resolve;
    });
    const previousLock = __classPrivateFieldGet(this, _Mutex_locked, "f");
    __classPrivateFieldSet(this, _Mutex_locked, nextLock, "f");
    await previousLock;
    return releaseLock;
  }
};
_Mutex_locked = /* @__PURE__ */ new WeakMap();

// ../node_modules/@hpke/core/esm/src/recipientContext.js
var __classPrivateFieldGet2 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet2 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _RecipientContextImpl_mutex;
var RecipientContextImpl = class extends EncryptionContextImpl {
  constructor() {
    super(...arguments);
    _RecipientContextImpl_mutex.set(this, void 0);
  }
  async open(data, aad = EMPTY.buffer) {
    __classPrivateFieldSet2(this, _RecipientContextImpl_mutex, __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f") ?? new Mutex(), "f");
    const release = await __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f").lock();
    let pt;
    try {
      pt = await this._ctx.key.open(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad));
    } catch (e) {
      throw new OpenError(e);
    } finally {
      release();
    }
    this.incrementSeq(this._ctx);
    return pt;
  }
};
_RecipientContextImpl_mutex = /* @__PURE__ */ new WeakMap();

// ../node_modules/@hpke/core/esm/src/senderContext.js
var __classPrivateFieldGet3 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet3 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _SenderContextImpl_mutex;
var SenderContextImpl = class extends EncryptionContextImpl {
  constructor(api, kdf, params, enc) {
    super(api, kdf, params);
    Object.defineProperty(this, "enc", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    _SenderContextImpl_mutex.set(this, void 0);
    this.enc = enc;
  }
  async seal(data, aad = EMPTY.buffer) {
    __classPrivateFieldSet3(this, _SenderContextImpl_mutex, __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f") ?? new Mutex(), "f");
    const release = await __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f").lock();
    let ct;
    try {
      ct = await this._ctx.key.seal(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad));
    } catch (e) {
      throw new SealError(e);
    } finally {
      release();
    }
    this.incrementSeq(this._ctx);
    return ct;
  }
};
_SenderContextImpl_mutex = /* @__PURE__ */ new WeakMap();

// ../node_modules/@hpke/core/esm/src/cipherSuiteNative.js
var LABEL_BASE_NONCE = new Uint8Array([
  98,
  97,
  115,
  101,
  95,
  110,
  111,
  110,
  99,
  101
]);
var LABEL_EXP = new Uint8Array([101, 120, 112]);
var LABEL_INFO_HASH = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]);
var LABEL_KEY = new Uint8Array([107, 101, 121]);
var LABEL_PSK_ID_HASH = new Uint8Array([
  112,
  115,
  107,
  95,
  105,
  100,
  95,
  104,
  97,
  115,
  104
]);
var LABEL_SECRET = new Uint8Array([115, 101, 99, 114, 101, 116]);
var SUITE_ID_HEADER_HPKE = new Uint8Array([
  72,
  80,
  75,
  69,
  0,
  0,
  0,
  0,
  0,
  0
]);
var CipherSuiteNative = class extends NativeAlgorithm {
  /**
   * @param params A set of parameters for building a cipher suite.
   *
   * If the error occurred, throws {@link InvalidParamError}.
   *
   * @throws {@link InvalidParamError}
   */
  constructor(params) {
    super();
    Object.defineProperty(this, "_kem", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_kdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_aead", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_suiteId", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    if (typeof params.kem === "number") {
      throw new InvalidParamError("KemId cannot be used");
    }
    this._kem = params.kem;
    if (typeof params.kdf === "number") {
      throw new InvalidParamError("KdfId cannot be used");
    }
    this._kdf = params.kdf;
    if (typeof params.aead === "number") {
      throw new InvalidParamError("AeadId cannot be used");
    }
    this._aead = params.aead;
    this._suiteId = new Uint8Array(SUITE_ID_HEADER_HPKE);
    this._suiteId.set(i2Osp(this._kem.id, 2), 4);
    this._suiteId.set(i2Osp(this._kdf.id, 2), 6);
    this._suiteId.set(i2Osp(this._aead.id, 2), 8);
    this._kdf.init(this._suiteId);
  }
  /**
   * Gets the KEM context of the ciphersuite.
   */
  get kem() {
    return this._kem;
  }
  /**
   * Gets the KDF context of the ciphersuite.
   */
  get kdf() {
    return this._kdf;
  }
  /**
   * Gets the AEAD context of the ciphersuite.
   */
  get aead() {
    return this._aead;
  }
  /**
   * Creates an encryption context for a sender.
   *
   * If the error occurred, throws {@link DecapError} | {@link ValidationError}.
   *
   * @param params A set of parameters for the sender encryption context.
   * @returns A sender encryption context.
   * @throws {@link EncapError}, {@link ValidationError}
   */
  async createSenderContext(params) {
    this._validateInputLength(params);
    await this._setup();
    const dh = await this._kem.encap(params);
    let mode;
    if (params.psk !== void 0) {
      mode = params.senderKey !== void 0 ? Mode.AuthPsk : Mode.Psk;
    } else {
      mode = params.senderKey !== void 0 ? Mode.Auth : Mode.Base;
    }
    return await this._keyScheduleS(mode, dh.sharedSecret, dh.enc, params);
  }
  /**
   * Creates an encryption context for a recipient.
   *
   * If the error occurred, throws {@link DecapError}
   * | {@link DeserializeError} | {@link ValidationError}.
   *
   * @param params A set of parameters for the recipient encryption context.
   * @returns A recipient encryption context.
   * @throws {@link DecapError}, {@link DeserializeError}, {@link ValidationError}
   */
  async createRecipientContext(params) {
    this._validateInputLength(params);
    await this._setup();
    const sharedSecret = await this._kem.decap(params);
    let mode;
    if (params.psk !== void 0) {
      mode = params.senderPublicKey !== void 0 ? Mode.AuthPsk : Mode.Psk;
    } else {
      mode = params.senderPublicKey !== void 0 ? Mode.Auth : Mode.Base;
    }
    return await this._keyScheduleR(mode, sharedSecret, params);
  }
  /**
   * Encrypts a message to a recipient.
   *
   * If the error occurred, throws `EncapError` | `MessageLimitReachedError` | `SealError` | `ValidationError`.
   *
   * @param params A set of parameters for building a sender encryption context.
   * @param pt A plain text as bytes to be encrypted.
   * @param aad Additional authenticated data as bytes fed by an application.
   * @returns A cipher text and an encapsulated key as bytes.
   * @throws {@link EncapError}, {@link MessageLimitReachedError}, {@link SealError}, {@link ValidationError}
   */
  async seal(params, pt, aad = EMPTY.buffer) {
    const ctx = await this.createSenderContext(params);
    return {
      ct: await ctx.seal(pt, aad),
      enc: ctx.enc
    };
  }
  /**
   * Decrypts a message from a sender.
   *
   * If the error occurred, throws `DecapError` | `DeserializeError` | `OpenError` | `ValidationError`.
   *
   * @param params A set of parameters for building a recipient encryption context.
   * @param ct An encrypted text as bytes to be decrypted.
   * @param aad Additional authenticated data as bytes fed by an application.
   * @returns A decrypted plain text as bytes.
   * @throws {@link DecapError}, {@link DeserializeError}, {@link OpenError}, {@link ValidationError}
   */
  async open(params, ct, aad = EMPTY.buffer) {
    const ctx = await this.createRecipientContext(params);
    return await ctx.open(ct, aad);
  }
  // private verifyPskInputs(mode: Mode, params: KeyScheduleParams) {
  //   const gotPsk = (params.psk !== undefined);
  //   const gotPskId = (params.psk !== undefined && params.psk.id.byteLength > 0);
  //   if (gotPsk !== gotPskId) {
  //     throw new Error('Inconsistent PSK inputs');
  //   }
  //   if (gotPsk && (mode === Mode.Base || mode === Mode.Auth)) {
  //     throw new Error('PSK input provided when not needed');
  //   }
  //   if (!gotPsk && (mode === Mode.Psk || mode === Mode.AuthPsk)) {
  //     throw new Error('Missing required PSK input');
  //   }
  //   return;
  // }
  async _keySchedule(mode, sharedSecret, params) {
    const pskId = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.id);
    const pskIdHash = await this._kdf.labeledExtract(EMPTY, LABEL_PSK_ID_HASH, pskId);
    const info = params.info === void 0 ? EMPTY : toUint8Array(params.info);
    const infoHash = await this._kdf.labeledExtract(EMPTY, LABEL_INFO_HASH, info);
    const keyScheduleContext = new Uint8Array(1 + pskIdHash.byteLength + infoHash.byteLength);
    keyScheduleContext.set(new Uint8Array([mode]), 0);
    keyScheduleContext.set(new Uint8Array(pskIdHash), 1);
    keyScheduleContext.set(new Uint8Array(infoHash), 1 + pskIdHash.byteLength);
    const psk = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.key);
    const ikm = this._kdf.buildLabeledIkm(LABEL_SECRET, psk);
    const exporterSecretInfo = this._kdf.buildLabeledInfo(LABEL_EXP, keyScheduleContext, this._kdf.hashSize);
    const exporterSecret = await this._kdf.extractAndExpand(sharedSecret, ikm, exporterSecretInfo, this._kdf.hashSize);
    if (this._aead.id === AeadId.ExportOnly) {
      return { aead: this._aead, exporterSecret };
    }
    const keyInfo = this._kdf.buildLabeledInfo(LABEL_KEY, keyScheduleContext, this._aead.keySize);
    const key = await this._kdf.extractAndExpand(sharedSecret, ikm, keyInfo, this._aead.keySize);
    const baseNonceInfo = this._kdf.buildLabeledInfo(LABEL_BASE_NONCE, keyScheduleContext, this._aead.nonceSize);
    const baseNonce = await this._kdf.extractAndExpand(sharedSecret, ikm, baseNonceInfo, this._aead.nonceSize);
    return {
      aead: this._aead,
      exporterSecret,
      key,
      baseNonce: new Uint8Array(baseNonce),
      seq: 0
    };
  }
  async _keyScheduleS(mode, sharedSecret, enc, params) {
    const res = await this._keySchedule(mode, sharedSecret, params);
    if (res.key === void 0) {
      return new SenderExporterContextImpl(this._api, this._kdf, res.exporterSecret, enc);
    }
    return new SenderContextImpl(this._api, this._kdf, res, enc);
  }
  async _keyScheduleR(mode, sharedSecret, params) {
    const res = await this._keySchedule(mode, sharedSecret, params);
    if (res.key === void 0) {
      return new RecipientExporterContextImpl(this._api, this._kdf, res.exporterSecret);
    }
    return new RecipientContextImpl(this._api, this._kdf, res);
  }
  _validateInputLength(params) {
    if (params.info !== void 0 && params.info.byteLength > INFO_LENGTH_LIMIT) {
      throw new InvalidParamError("Too long info");
    }
    if (params.psk !== void 0) {
      if (params.psk.key.byteLength < MINIMUM_PSK_LENGTH) {
        throw new InvalidParamError(`PSK must have at least ${MINIMUM_PSK_LENGTH} bytes`);
      }
      if (params.psk.key.byteLength > INPUT_LENGTH_LIMIT) {
        throw new InvalidParamError("Too long psk.key");
      }
      if (params.psk.id.byteLength > INPUT_LENGTH_LIMIT) {
        throw new InvalidParamError("Too long psk.id");
      }
    }
    return;
  }
};

// ../node_modules/@hpke/core/esm/src/kems/dhkemNative.js
var DhkemP256HkdfSha256Native = class extends Dhkem {
  constructor() {
    const kdf = new HkdfSha256Native();
    const prim = new Ec(KemId.DhkemP256HkdfSha256, kdf);
    super(KemId.DhkemP256HkdfSha256, prim, kdf);
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: KemId.DhkemP256HkdfSha256
    });
    Object.defineProperty(this, "secretSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
    Object.defineProperty(this, "encSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 65
    });
    Object.defineProperty(this, "publicKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 65
    });
    Object.defineProperty(this, "privateKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
  }
};

// ../node_modules/@hpke/core/esm/src/native.js
var CipherSuite = class extends CipherSuiteNative {
};
var DhkemP256HkdfSha256 = class extends DhkemP256HkdfSha256Native {
};
var HkdfSha256 = class extends HkdfSha256Native {
};

// ../node_modules/@hpke/core/esm/src/kems/dhkemPrimitives/x25519.js
var PKCS8_ALG_ID_X25519 = new Uint8Array([
  48,
  46,
  2,
  1,
  0,
  48,
  5,
  6,
  3,
  43,
  101,
  110,
  4,
  34,
  4,
  32
]);

// ../node_modules/@hpke/core/esm/src/kems/dhkemPrimitives/x448.js
var PKCS8_ALG_ID_X448 = new Uint8Array([
  48,
  70,
  2,
  1,
  0,
  48,
  5,
  6,
  3,
  43,
  101,
  111,
  4,
  58,
  4,
  56
]);

// ../security/crypto/key-generation.js
function assertScopeKey(key) {
  if (!(key instanceof CryptoKey) || key.type !== "secret" || key.extractable || key.algorithm?.name !== "HKDF" || !key.usages.includes("deriveKey")) {
    throw new TypeError("A non-exportable HKDF scope key is required.");
  }
  return key;
}
function assertPrivateIdentityKey(key) {
  if (!(key instanceof CryptoKey) || key.type !== "private" || key.extractable || key.algorithm?.name !== "ECDH" || key.algorithm?.namedCurve !== "P-256") {
    throw new TypeError("A non-exportable P-256 identity key is required.");
  }
  return key;
}
function assertIdentityKeyPair(keyPair) {
  if (!keyPair || !(keyPair.privateKey instanceof CryptoKey) || !(keyPair.publicKey instanceof CryptoKey) || keyPair.publicKey.type !== "public" || keyPair.publicKey.algorithm?.name !== "ECDH" || keyPair.publicKey.algorithm?.namedCurve !== "P-256") {
    throw new TypeError("A complete P-256 identity key pair is required.");
  }
  assertPrivateIdentityKey(keyPair.privateKey);
  return keyPair;
}

// ../security/crypto/key-wrapping.js
var suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm()
});
async function serializeIdentityPublicKey(publicKey) {
  if (!(publicKey instanceof CryptoKey) || publicKey.type !== "public") throw new TypeError("A public identity key is required.");
  return new Uint8Array(await suite.kem.serializePublicKey(publicKey));
}
async function generateIdentityKeyPair() {
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
async function fingerprintPublicKey(publicKeyBytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", publicKeyBytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function wrapScopeKey(rawScopeKey, recipientPublicKey, context) {
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
async function unwrapScopeKey(envelope, identityKeyPair, expectedContext) {
  const validated = validateEnvelopeContext(expectedContext);
  assertIdentityKeyPair(identityKeyPair);
  if (!envelope || envelope.protocol_version !== validated.protocolVersion || envelope.kem !== "DHKEM(P-256,HKDF-SHA256)" || envelope.kdf !== "HKDF-SHA256" || envelope.aead !== "AES-256-GCM" || envelope.tenant_id !== validated.tenantId || envelope.scope_id !== validated.scopeId || envelope.recipient_id !== validated.recipientId || envelope.key_version !== validated.keyVersion) {
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
async function createScopeKeyEnvelopes({ recipientPublicKeys, tenantId, scopeId, keyVersion }) {
  if (!Array.isArray(recipientPublicKeys) || recipientPublicKeys.length === 0) {
    throw new TypeError("At least one authorized recipient is required.");
  }
  const rawKey = randomBytes(32);
  try {
    const key = await globalThis.crypto.subtle.importKey("raw", rawKey, "HKDF", false, ["deriveKey"]);
    const envelopes = await Promise.all(recipientPublicKeys.map(
      (recipient) => wrapScopeKey(rawKey, recipient.publicKey, {
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

// ../security/crypto/recovery.js
function validateRecoveryContext(context) {
  if (!context || typeof context.tenantId !== "string" || typeof context.userId !== "string" || !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1) {
    throw new TypeError("A valid identity context is required for recovery.");
  }
  return { protocolVersion: 1, tenantId: context.tenantId, userId: context.userId, keyVersion: context.keyVersion };
}
function recoveryAad(context) {
  return encodeUtf8(canonicalJson({ purpose: "salta-identity-recovery", ...context }));
}
async function createIdentityWithRecovery(context) {
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

// ../security/crypto/sharing.js
async function provisionScopeForRecipients({ tenantId, scopeId, keyVersion, recipients }) {
  if (!Array.isArray(recipients) || recipients.length === 0) throw new TypeError("Authorized recipients are required.");
  const seen = /* @__PURE__ */ new Set();
  for (const recipient of recipients) {
    if (!recipient || typeof recipient.recipientId !== "string" || !(recipient.publicKey instanceof CryptoKey)) {
      throw new TypeError("Each recipient needs a verified identity and public key.");
    }
    if (seen.has(recipient.recipientId)) throw new TypeError("Duplicate scope recipient.");
    seen.add(recipient.recipientId);
    if (typeof recipient.confirmedFingerprint !== "string") {
      throw new Error("Public-key fingerprint confirmation is required before sharing.");
    }
    const rawPublicKey = await serializeIdentityPublicKey(recipient.publicKey);
    const actualFingerprint = await fingerprintPublicKey(rawPublicKey);
    if (actualFingerprint !== recipient.confirmedFingerprint.toLowerCase()) {
      throw new Error("The recipient identity fingerprint does not match the confirmed value.");
    }
  }
  const result = await createScopeKeyEnvelopes({
    recipientPublicKeys: recipients.map(({ recipientId, publicKey }) => ({ recipientId, publicKey })),
    tenantId,
    scopeId,
    keyVersion
  });
  result.envelopes.forEach((envelope) => validateEnvelopeContext({
    tenantId: envelope.tenant_id,
    scopeId: envelope.scope_id,
    recipientId: envelope.recipient_id,
    keyVersion: envelope.key_version
  }));
  return result;
}

// ../security/crypto/key-management.js
async function createSaltaIdentity(context) {
  return createIdentityWithRecovery(context);
}
async function createSaltaScope({ tenantId, scopeId, keyVersion = 1, recipients }) {
  return provisionScopeForRecipients({ tenantId, scopeId, keyVersion, recipients });
}

// ../security/crypto/encryption.js
async function encryptJson(scopeKey, context, data) {
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

// ../security/crypto/decryption.js
async function decryptJson(scopeKey, context, encrypted) {
  assertScopeKey(scopeKey);
  const validated = validateObjectContext(context);
  if (!encrypted || encrypted.protocol_version !== validated.protocolVersion || encrypted.key_version !== validated.keyVersion || encrypted.revision !== validated.revision || encrypted.kdf !== "HKDF-SHA256" || encrypted.aead !== "AES-256-GCM") {
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

// ../security/access/permissions.js
var ALLOWED_PERMISSIONS = /* @__PURE__ */ new Set(["read", "write", "share", "manage"]);
function authorizeScope({ actor, scope, grant, permission }) {
  if (!ALLOWED_PERMISSIONS.has(permission) || !actor || !scope || !grant) return false;
  if (actor.status !== "active" || actor.tenantId !== scope.tenantId || grant.tenantId !== scope.tenantId || grant.scopeId !== scope.id || grant.userId !== actor.userId || grant.revokedAt) return false;
  if (actor.membershipStatus !== "active" || actor.membershipId !== grant.membershipId) return false;
  return grant.permissions instanceof Set && grant.permissions.has(permission);
}
function requireScopePermission(context, permission) {
  if (!authorizeScope({ ...context, permission })) {
    throw new Error("The authenticated user is not authorized for this encrypted scope.");
  }
}

// ../security/storage/encrypted-repository.js
function safeType(type) {
  if (typeof type !== "string") throw new TypeError("A registered sensitive-data type is required.");
  return type;
}
function validateEndpoint(endpoint) {
  if (endpoint === "" || endpoint.startsWith("/") && !endpoint.startsWith("//")) return endpoint;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError("Use a same-origin path or a secure HTTPS storage endpoint.");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp || url.username || url.password || url.hash) {
    throw new TypeError("Storage endpoints must use HTTPS (or loopback HTTP for local tests).");
  }
  return url.origin + url.pathname.replace(/\/$/u, "");
}
var EncryptedRepository = class {
  constructor({ endpoint, actorId, membershipId, tenantId, scopeId, keyVersion, scopeKey, permissions, fetchImpl = (...args) => globalThis.fetch(...args), labPrincipalHeader = false }) {
    if (typeof endpoint !== "string" || !actorId || !membershipId || !tenantId || !scopeId || !Number.isSafeInteger(keyVersion)) {
      throw new TypeError("The encrypted repository needs an explicit authenticated scope.");
    }
    if (scopeKey) assertScopeKey(scopeKey);
    this.endpoint = validateEndpoint(endpoint).replace(/\/$/u, "");
    this.actorId = actorId;
    this.membershipId = membershipId;
    this.tenantId = tenantId;
    this.scopeId = scopeId;
    this.keyVersion = keyVersion;
    this.scopeKey = scopeKey;
    this.permissions = new Set(permissions || []);
    this.fetchImpl = fetchImpl;
    this.labPrincipalHeader = labPrincipalHeader;
  }
  #authorize(permission) {
    requireScopePermission({
      actor: {
        userId: this.actorId,
        tenantId: this.tenantId,
        membershipId: this.membershipId,
        membershipStatus: "active",
        status: "active"
      },
      scope: { id: this.scopeId, tenantId: this.tenantId },
      grant: {
        tenantId: this.tenantId,
        scopeId: this.scopeId,
        userId: this.actorId,
        membershipId: this.membershipId,
        permissions: this.permissions
      }
    }, permission);
  }
  #requireKey() {
    if (!this.scopeKey) throw new Error("Unlock an authorized scope key before reading or writing encrypted content.");
    assertScopeKey(this.scopeKey);
  }
  async #request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers || {}
    };
    if (this.labPrincipalHeader) headers["X-SALTA-Lab-Principal"] = this.actorId;
    const response = await this.fetchImpl(this.endpoint + path, {
      ...options,
      credentials: "include",
      cache: "no-store",
      headers
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 409 ? "The record changed in another session. Reload it before saving." : "The encrypted storage operation was denied or failed.");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  async save({ type, data, objectId = globalThis.crypto.randomUUID(), revision = 1 }) {
    this.#authorize("write");
    this.#requireKey();
    const context = validateObjectContext({
      tenantId: this.tenantId,
      scopeId: this.scopeId,
      objectId,
      type: safeType(type),
      keyVersion: this.keyVersion,
      revision
    });
    const encrypted = await encryptJson(this.scopeKey, context, data);
    const metadata = await this.#request("/v1/objects", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: this.tenantId,
        scope_id: this.scopeId,
        object_id: context.objectId,
        object_type: context.type,
        protocol_version: encrypted.protocol_version,
        key_version: encrypted.key_version,
        revision: encrypted.revision,
        kdf: encrypted.kdf,
        aead: encrypted.aead,
        salt: encrypted.salt,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext
      })
    });
    return { ...metadata, object_id: context.objectId, revision };
  }
  async update({ type, data, objectId, expectedRevision }) {
    this.#authorize("write");
    this.#requireKey();
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new TypeError("A current revision is required.");
    const context = validateObjectContext({
      tenantId: this.tenantId,
      scopeId: this.scopeId,
      objectId,
      type: safeType(type),
      keyVersion: this.keyVersion,
      revision: expectedRevision + 1
    });
    const encrypted = await encryptJson(this.scopeKey, context, data);
    const metadata = await this.#request("/v1/objects/" + encodeURIComponent(objectId), {
      method: "PUT",
      body: JSON.stringify({
        tenant_id: this.tenantId,
        scope_id: this.scopeId,
        object_type: context.type,
        expected_revision: expectedRevision,
        protocol_version: encrypted.protocol_version,
        key_version: encrypted.key_version,
        revision: encrypted.revision,
        kdf: encrypted.kdf,
        aead: encrypted.aead,
        salt: encrypted.salt,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext
      })
    });
    return { ...metadata, object_id: context.objectId, revision: context.revision };
  }
  async load({ objectId }) {
    this.#authorize("read");
    this.#requireKey();
    const query = new URLSearchParams({ tenant_id: this.tenantId, scope_id: this.scopeId });
    const result = await this.#request("/v1/objects/" + encodeURIComponent(objectId) + "?" + query, { method: "GET" });
    const row = result.object;
    if (!row || row.tenant_id !== this.tenantId || row.scope_id !== this.scopeId || row.object_id !== objectId) {
      throw new Error("The encrypted record is unavailable in this scope.");
    }
    return decryptJson(this.scopeKey, {
      tenantId: row.tenant_id,
      scopeId: row.scope_id,
      objectId: row.object_id,
      type: row.object_type,
      keyVersion: row.key_version,
      revision: row.revision
    }, row);
  }
  async listEncrypted({ after = "", limit = 25 } = {}) {
    this.#authorize("read");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError("Page size must be between 1 and 50.");
    const query = new URLSearchParams({ tenant_id: this.tenantId, scope_id: this.scopeId, limit: String(limit) });
    if (after) query.set("after", after);
    const result = await this.#request("/v1/objects?" + query, { method: "GET" });
    if (!Array.isArray(result.objects)) throw new Error("The encrypted storage page is invalid.");
    return { objects: result.objects, nextCursor: result.next_cursor || null };
  }
  async publishEnvelope(envelope) {
    this.#authorize("share");
    if (envelope.tenant_id !== this.tenantId || envelope.scope_id !== this.scopeId || envelope.key_version !== this.keyVersion) {
      throw new TypeError("The envelope does not belong to this repository scope.");
    }
    return this.#request("/v1/envelopes", { method: "POST", body: JSON.stringify(envelope) });
  }
  async getMyEnvelope() {
    this.#authorize("read");
    const query = new URLSearchParams({ tenant_id: this.tenantId, scope_id: this.scopeId });
    const result = await this.#request("/v1/envelopes?" + query, { method: "GET" });
    return result.envelope || null;
  }
};

// public/demo.js
var status = document.querySelector("#status");
var button = document.querySelector("#run");
var results = document.querySelector("#results");
var setStatus = (message, state = "") => {
  status.textContent = message;
  status.dataset.state = state;
};
async function localRequest(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "A opera\xE7\xE3o local falhou.");
  return result;
}
async function runDemo() {
  if (!["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
    throw new Error("Este ensaio s\xF3 pode ser executado em localhost.");
  }
  const tenantId = crypto.randomUUID();
  const scopeId = crypto.randomUUID();
  const teacherOneId = crypto.randomUUID();
  const teacherTwoId = crypto.randomUUID();
  const teacherOneMembership = crypto.randomUUID();
  const teacherTwoMembership = crypto.randomUUID();
  setStatus("Gerando identidades sint\xE9ticas no navegador\u2026");
  const [one, two] = await Promise.all([
    createSaltaIdentity({ tenantId, userId: teacherOneId, keyVersion: 1 }),
    createSaltaIdentity({ tenantId, userId: teacherTwoId, keyVersion: 1 })
  ]);
  const onePublic = await serializeIdentityPublicKey(one.identity.publicKey);
  const twoPublic = await serializeIdentityPublicKey(two.identity.publicKey);
  const oneFingerprint = await fingerprintPublicKey(onePublic);
  const twoFingerprint = await fingerprintPublicKey(twoPublic);
  await localRequest("/__lab/seed", {
    tenant_id: tenantId,
    scope_id: scopeId,
    academic_year: (/* @__PURE__ */ new Date()).getFullYear(),
    members: [
      { user_id: teacherOneId, membership_id: teacherOneMembership, role: "tenant_admin", public_key: one.publicKey, fingerprint: oneFingerprint, can_read: 1, can_write: 1, can_share: 1 },
      { user_id: teacherTwoId, membership_id: teacherTwoMembership, role: "teacher", public_key: two.publicKey, fingerprint: twoFingerprint, can_read: 1, can_write: 1, can_share: 0 }
    ]
  });
  setStatus("Criando chave de turma e envelopes HPKE\u2026");
  const scope = await createSaltaScope({
    tenantId,
    scopeId,
    keyVersion: 1,
    recipients: [
      { recipientId: teacherOneId, publicKey: one.identity.publicKey, confirmedFingerprint: oneFingerprint },
      { recipientId: teacherTwoId, publicKey: two.identity.publicKey, confirmedFingerprint: twoFingerprint }
    ]
  });
  const repoOne = new EncryptedRepository({
    endpoint: "",
    actorId: teacherOneId,
    membershipId: teacherOneMembership,
    tenantId,
    scopeId,
    keyVersion: 1,
    scopeKey: scope.key,
    permissions: ["read", "write", "share"],
    labPrincipalHeader: true
  });
  for (const envelope2 of scope.envelopes) await repoOne.publishEnvelope(envelope2);
  const objectId = crypto.randomUUID();
  const syntheticDiary = {
    student_label: "Estudante Sint\xE9tico A",
    subject_label: "Matem\xE1tica",
    bimesters: [
      { period: 1, grades: [{ item: "Avalia\xE7\xE3o sint\xE9tica 1", value: 8.5, maximum: 10 }], attendance: { present: 18, total: 20 } },
      { period: 2, grades: [{ item: "Avalia\xE7\xE3o sint\xE9tica 2", value: 7.5, maximum: 10 }], attendance: { present: 19, total: 20 } }
    ]
  };
  setStatus("Cifrando e gravando dados sint\xE9ticos\u2026");
  await repoOne.save({ type: "diary.student.v1", data: syntheticDiary, objectId });
  const repoTwoWithoutKey = new EncryptedRepository({
    endpoint: "",
    actorId: teacherTwoId,
    membershipId: teacherTwoMembership,
    tenantId,
    scopeId,
    keyVersion: 1,
    permissions: ["read", "write"],
    labPrincipalHeader: true
  });
  const envelope = await repoTwoWithoutKey.getMyEnvelope();
  const teacherTwoScopeKey = await unwrapScopeKey(envelope, two.identityKeyPair, {
    tenantId,
    scopeId,
    recipientId: teacherTwoId,
    keyVersion: 1
  });
  const repoTwo = new EncryptedRepository({
    endpoint: "",
    actorId: teacherTwoId,
    membershipId: teacherTwoMembership,
    tenantId,
    scopeId,
    keyVersion: 1,
    scopeKey: teacherTwoScopeKey,
    permissions: ["read", "write"],
    labPrincipalHeader: true
  });
  const opened = await repoTwo.load({ objectId });
  const scores = opened.bimesters.flatMap((item) => item.grades.map((grade) => grade.value));
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const page = await repoTwo.listEncrypted({ limit: 10 });
  results.hidden = false;
  results.innerHTML = "";
  const rows = [
    ["Institui\xE7\xE3o sint\xE9tica", tenantId],
    ["Professores autorizados", "2 identidades locais"],
    ["Registros armazenados", String(page.objects.length) + " ciphertext"],
    ["Aluno", opened.student_label],
    ["M\xE9dia calculada no navegador", average.toFixed(2).replace(".", ",")],
    ["Frequ\xEAncia calculada no navegador", opened.bimesters.map((item) => String(item.attendance.present) + "/" + String(item.attendance.total)).join(" \xB7 ")],
    ["Envelope recuperado", "HPKE \xB7 vers\xE3o de chave 1"]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    title.textContent = label;
    detail.textContent = value;
    row.append(title, detail);
    results.append(row);
  }
  setStatus("Fluxo local conclu\xEDdo. O Worker recebeu ciphertext, envelope de chave e metadados; a m\xE9dia foi calculada aqui.", "success");
}
button.addEventListener("click", async () => {
  button.disabled = true;
  results.hidden = true;
  try {
    await runDemo();
  } catch (error) {
    setStatus(error?.message || "O experimento falhou.", "error");
  } finally {
    button.disabled = false;
  }
});
