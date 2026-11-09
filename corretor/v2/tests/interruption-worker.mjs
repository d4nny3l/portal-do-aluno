import { parentPort, workerData } from "node:worker_threads";
import { openLocalDatabase } from "../persistence/database.mjs";

const db = openLocalDatabase(workerData.filename);
try {
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO idempotency_operations(workspace_id,scope_id,idempotency_key,request_hash,state,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?)")
    .run(workerData.context.workspaceId, workerData.context.scopeId, workerData.idempotencyKey, workerData.requestHash, new Date().toISOString(), new Date().toISOString());
  parentPort.postMessage({ open: true });
  setInterval(() => {}, 1000);
} catch (error) {
  parentPort.postMessage({ error: error.message });
  db.close();
}
