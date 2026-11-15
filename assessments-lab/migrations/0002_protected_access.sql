CREATE TABLE assessment_access_control (
 principal_id TEXT PRIMARY KEY REFERENCES assessment_principals(id),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch>0),
 expires_at INTEGER NOT NULL
);
CREATE TABLE assessment_key_vaults (
 principal_id TEXT PRIMARY KEY REFERENCES assessment_principals(id),
 encrypted_json TEXT NOT NULL, created_at TEXT NOT NULL
);
