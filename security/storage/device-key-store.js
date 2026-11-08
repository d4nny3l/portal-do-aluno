const DB_NAME = "salta-crypto-lab";
const STORE_NAME = "non-exportable-keys";
const DB_VERSION = 1;

function openDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) throw new Error("This browser does not provide IndexedDB.");
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("The local key store could not be opened."));
  });
}

async function transact(keyId, mode, operation, indexedDb) {
  if (typeof keyId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/u.test(keyId)) throw new TypeError("Use an opaque local key identifier.");
  const database = await openDatabase(indexedDb);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);
      let result = null;
      request.onsuccess = () => { result = request.result ?? null; };
      request.onerror = () => reject(new Error("The local key operation failed."));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(new Error("The local key transaction failed."));
      transaction.onabort = () => reject(new Error("The local key transaction was aborted."));
    });
  } finally {
    database.close();
  }
}

export class DeviceKeyStore {
  constructor({ indexedDb = globalThis.indexedDB } = {}) {
    this.indexedDb = indexedDb;
    this.unlocked = false;
  }

  async savePrivateIdentity(keyId, identityKeyPair) {
    const privateKey = identityKeyPair?.privateKey;
    const publicKey = identityKeyPair?.publicKey;
    if (!(privateKey instanceof CryptoKey) || privateKey.type !== "private" || privateKey.extractable ||
        !(publicKey instanceof CryptoKey) || publicKey.type !== "public") {
      throw new TypeError("A non-exportable private key and its public identity key are required.");
    }
    await transact(keyId,"readwrite",store => store.put({ purpose:"identity-key-pair", key:identityKeyPair, savedAt:Date.now() },keyId),this.indexedDb);
  }

  async saveScopeKey(keyId, scopeKey) {
    if (!(scopeKey instanceof CryptoKey) || scopeKey.type !== "secret" || scopeKey.extractable || scopeKey.algorithm?.name !== "HKDF") {
      throw new TypeError("Only non-exportable scope keys may be stored.");
    }
    await transact(keyId,"readwrite",store => store.put({ purpose:"scope-hkdf", key:scopeKey, savedAt:Date.now() },keyId),this.indexedDb);
  }

  async getKey(keyId, purpose) {
    const record = await transact(keyId,"readonly",store => store.get(keyId),this.indexedDb);
    if (!record || record.purpose !== purpose) return null;
    if (purpose === "identity-key-pair") {
      if (!record.key || !(record.key.privateKey instanceof CryptoKey) || record.key.privateKey.extractable ||
          !(record.key.publicKey instanceof CryptoKey)) return null;
    } else if (!(record.key instanceof CryptoKey) || record.key.extractable) return null;
    this.unlocked = true;
    return record.key;
  }

  async deleteKey(keyId) {
    await transact(keyId,"readwrite",store => store.delete(keyId),this.indexedDb);
  }

  async clear() {
    const database = await openDatabase(this.indexedDb);
    try {
      await new Promise((resolve,reject) => {
        const transaction = database.transaction(STORE_NAME,"readwrite");
        transaction.objectStore(STORE_NAME).clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(new Error("The local key store could not be cleared."));
      });
    } finally {
      database.close();
      this.unlocked = false;
    }
  }

  lock() {
    // JavaScript cannot guarantee zeroization of all engine copies or tab memory.
    this.unlocked = false;
  }
}
