import { decryptJson } from "./decryption.js";
import { encryptJson } from "./encryption.js";
import { provisionScopeForRecipients } from "./sharing.js";

export async function rotateScopeRecords({ records, oldScopeKey, newTenantKey, tenantId, scopeId, oldKeyVersion, newKeyVersion }) {
  if (!Array.isArray(records) || newKeyVersion !== oldKeyVersion + 1) {
    throw new TypeError("Rotation requires a sequential key version and a record list.");
  }
  const rotated = [];
  for (const record of records) {
    const base = {
      tenantId,
      scopeId,
      objectId: record.object_id,
      type: record.object_type,
      keyVersion: oldKeyVersion,
      revision: record.revision
    };
    const value = await decryptJson(oldScopeKey, base, record.encrypted);
    const next = {
      ...base,
      keyVersion: newKeyVersion,
      revision: record.revision + 1
    };
    rotated.push({
      object_id: record.object_id,
      object_type: record.object_type,
      ...await encryptJson(newTenantKey, next, value)
    });
  }
  return rotated;
}

export async function createRotatedScope({ tenantId, scopeId, keyVersion, recipients }) {
  if (keyVersion < 2) throw new TypeError("A rotation must use a new positive key version.");
  return provisionScopeForRecipients({ tenantId, scopeId, keyVersion, recipients });
}
