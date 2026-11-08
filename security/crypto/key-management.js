import { createIdentityWithRecovery, recoverIdentity } from "./recovery.js";
import { provisionScopeForRecipients } from "./sharing.js";
import { assertScopeKey } from "./key-generation.js";

export async function createSaltaIdentity(context) {
  return createIdentityWithRecovery(context);
}

export async function restoreSaltaIdentity(code, bundle, context) {
  return recoverIdentity(code, bundle, context);
}

export async function createSaltaScope({ tenantId, scopeId, keyVersion = 1, recipients }) {
  return provisionScopeForRecipients({ tenantId, scopeId, keyVersion, recipients });
}

export function verifyScopeKey(key) {
  return assertScopeKey(key);
}
