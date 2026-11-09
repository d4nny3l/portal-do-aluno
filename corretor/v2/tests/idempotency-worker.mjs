import { parentPort, workerData } from "node:worker_threads";
import { openLocalDatabase } from "../persistence/database.mjs";
import { beginIdempotentOperation } from "../persistence/repository.mjs";

const db = openLocalDatabase(workerData.filename);
try {
  const result = beginIdempotentOperation(db, {
    context: workerData.context,
    idempotencyKey: workerData.idempotencyKey,
    requestHash: workerData.requestHash
  });
  parentPort.postMessage({ ok: true, created: result.created, state: result.state });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error.message, code: error.code });
} finally {
  db.close();
}
