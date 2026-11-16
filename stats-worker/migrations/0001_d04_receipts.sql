-- D-04: additive only. Apply explicitly in isolated homologation first.
-- Never run automatically on a GET/open/cancel. Do not drop receipts on rollback.
CREATE TABLE IF NOT EXISTS salta_diario_attendance_commits (
  institution_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  kind TEXT NOT NULL CHECK(kind IN ('lesson','daily')),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  snapshot_before TEXT NOT NULL,
  session_id INTEGER,
  receipt TEXT CHECK(receipt IS NULL OR json_valid(receipt)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(institution_id,request_id),
  UNIQUE(scope_key,version)
);
CREATE INDEX IF NOT EXISTS idx_diario_attendance_commit_session
 ON salta_diario_attendance_commits(kind,session_id,institution_id);
