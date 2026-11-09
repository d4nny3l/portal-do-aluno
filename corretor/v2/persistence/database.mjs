import { DatabaseSync } from "node:sqlite";

export function openLocalDatabase(filename = ":memory:") {
  if (typeof filename !== "string" || filename.length === 0 || /^https?:/iu.test(filename)) throw new TypeError("O Corretor experimental aceita somente arquivo SQLite local ou :memory:.");
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true, timeout: 5000 });
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  return db;
}
