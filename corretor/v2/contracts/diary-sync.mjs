import { assertOpaqueId } from "../domain/identity.mjs";
import { validateCiphertextEnvelope } from "./crypto-envelope.mjs";

export function createFinalDiarySyncRequest({ tenantId, scopeId, assessmentId, diaryItemId, participantRef, attempt, resultRevision, resultStatus, encryptedResult }) {
  for (const [label, value] of Object.entries({ tenantId, scopeId, assessmentId, diaryItemId, participantRef })) assertOpaqueId(value, label);
  if (resultStatus !== "definitive") throw new Error("Somente resultado definitivo pode ser sincronizado ao Diário.");
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isInteger(resultRevision) || resultRevision < 1) throw new TypeError("Tentativa/revisão inválida.");
  const envelope = validateCiphertextEnvelope(encryptedResult, { tenant_id: tenantId, scope_id: scopeId, object_type: "salta.diary.result.v1", revision: resultRevision });
  const idempotencyKey = `omr:${assessmentId}:${participantRef}:${attempt}:${resultRevision}`;
  return Object.freeze({ tenantId, scopeId, assessmentId, diaryItemId, participantRef, attempt, resultRevision, resultStatus, idempotencyKey, encryptedResult: envelope });
}

export function validateFinalDiarySyncRequest(request) {
  const allowed = new Set(["tenantId", "scopeId", "assessmentId", "diaryItemId", "participantRef", "attempt", "resultRevision", "resultStatus", "idempotencyKey", "encryptedResult"]);
  if (!request || typeof request !== "object" || Object.keys(request).some(key => !allowed.has(key))) throw new TypeError("Pedido do Diário contém campos desconhecidos.");
  const normalized = createFinalDiarySyncRequest(request);
  if (normalized.idempotencyKey !== request.idempotencyKey) throw new Error("Chave idempotente não corresponde ao resultado.");
  return normalized;
}

export class DiarySyncCoordinator {
  #transport;
  #inFlight = new Map();

  constructor(transport) {
    if (typeof transport?.writeFinalResult !== "function") throw new TypeError("Transporte do Diário inválido.");
    this.#transport = transport;
  }

  sync(request) {
    const safeRequest = validateFinalDiarySyncRequest(request);
    const fingerprint = JSON.stringify(safeRequest);
    const active = this.#inFlight.get(safeRequest.idempotencyKey);
    if (active) {
      if (active.fingerprint !== fingerprint) throw new Error("Conflito: a mesma chave idempotente recebeu conteúdo diferente.");
      return active.promise;
    }
    const promise = this.#send(safeRequest).finally(() => this.#inFlight.delete(safeRequest.idempotencyKey));
    this.#inFlight.set(safeRequest.idempotencyKey, { fingerprint, promise });
    return promise;
  }

  async #send(request) {
    try {
      const acknowledgement = await this.#transport.writeFinalResult(request);
      if (acknowledgement?.persisted !== true || acknowledgement.idempotencyKey !== request.idempotencyKey || acknowledgement.revision !== request.resultRevision) {
        return Object.freeze({ state: "retryable", idempotencyKey: request.idempotencyKey });
      }
      return Object.freeze({ state: "synced", idempotencyKey: request.idempotencyKey, revision: acknowledgement.revision });
    } catch {
      return Object.freeze({ state: "retryable", idempotencyKey: request.idempotencyKey });
    }
  }
}
