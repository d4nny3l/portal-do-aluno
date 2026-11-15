PRAGMA foreign_keys = ON;
CREATE TABLE assessment_principals (
 id TEXT PRIMARY KEY, auth_subject TEXT NOT NULL UNIQUE, label TEXT NOT NULL
);
CREATE TABLE assessment_grants (
 principal_id TEXT NOT NULL REFERENCES assessment_principals(id),
 class_id TEXT NOT NULL, period_id TEXT NOT NULL, label TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(principal_id,class_id,period_id)
);
CREATE TABLE assessment_roots (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES assessment_principals(id),
 class_id TEXT NOT NULL, period_id TEXT NOT NULL,
 current_revision INTEGER NOT NULL DEFAULT 0 CHECK(current_revision>=0),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','issued','archived')),
 updated_at TEXT NOT NULL
);
CREATE TABLE assessment_revisions (
 assessment_id TEXT NOT NULL REFERENCES assessment_roots(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 state TEXT NOT NULL CHECK(state IN ('draft','issued','archived')),
 manifest_hash TEXT NOT NULL, encrypted_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(assessment_id,revision)
);
CREATE TABLE assessment_requests (
 owner_id TEXT NOT NULL REFERENCES assessment_principals(id),
 request_id TEXT NOT NULL, body_hash TEXT NOT NULL,
 assessment_id TEXT NOT NULL REFERENCES assessment_roots(id), revision INTEGER NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE assessment_lab_sessions (
 token_hash TEXT PRIMARY KEY, principal_id TEXT NOT NULL REFERENCES assessment_principals(id),
 expires_at INTEGER NOT NULL
);
CREATE INDEX idx_assessment_owner ON assessment_roots(owner_id,updated_at DESC);
