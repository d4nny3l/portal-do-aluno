import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIGRATION_DIRECTORY = fileURLToPath(new URL("./migrations/", import.meta.url));

function inTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function listMigrations(directory = MIGRATION_DIRECTORY) {
  const filenames = (await readdir(directory)).filter(name => /^\d{4}_(up|down)\.sql$/u.test(name));
  const versions = [...new Set(filenames.map(name => name.slice(0, 4)))].sort();
  return Promise.all(versions.map(async version => {
    const up = await readFile(path.join(directory, `${version}_up.sql`), "utf8");
    const down = await readFile(path.join(directory, `${version}_down.sql`), "utf8");
    return Object.freeze({ version, up, down, checksum: createHash("sha256").update(up).digest("hex") });
  }));
}

export async function migrateUp(db, { directory = MIGRATION_DIRECTORY, through = null } = {}) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Map(db.prepare("SELECT version, checksum FROM schema_migrations").all().map(row => [row.version, row.checksum]));
  const migrations = await listMigrations(directory);
  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      if (applied.get(migration.version) !== migration.checksum) throw new Error(`Checksum divergente da migration ${migration.version}.`);
      continue;
    }
    if (through && migration.version > through) break;
    inTransaction(db, () => {
      db.exec(migration.up);
      db.prepare("INSERT INTO schema_migrations(version,checksum,applied_at) VALUES (?,?,?)").run(migration.version, migration.checksum, new Date().toISOString());
    });
  }
  return db.prepare("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version").all();
}

export async function migrateDown(db, { directory = MIGRATION_DIRECTORY } = {}) {
  const latest = db.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version DESC LIMIT 1").get();
  if (!latest) return null;
  const migration = (await listMigrations(directory)).find(item => item.version === latest.version);
  if (!migration || migration.checksum !== latest.checksum) throw new Error(`Migration ${latest.version} ausente ou com checksum divergente.`);
  inTransaction(db, () => {
    db.exec(migration.down);
    db.prepare("DELETE FROM schema_migrations WHERE version=?").run(latest.version);
  });
  return latest.version;
}
