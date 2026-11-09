PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  public_key BLOB NOT NULL,
  key_alg TEXT NOT NULL CHECK(key_alg = 'DHKEM(P-256,HKDF-SHA256)'),
  key_version INTEGER NOT NULL CHECK(key_version > 0),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  principal_id TEXT NOT NULL REFERENCES principals(id),
  role TEXT NOT NULL CHECK(role IN ('teacher','coordinator','tenant_admin','student','guardian')),
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,principal_id)
);

CREATE TABLE cryptographic_scopes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  scope_type TEXT NOT NULL CHECK(scope_type IN ('teacher','academic_year','class','student')),
  academic_year INTEGER,
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  key_version INTEGER NOT NULL CHECK(key_version > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,id)
);

CREATE TABLE scope_grants (
  tenant_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  can_read INTEGER NOT NULL DEFAULT 0 CHECK(can_read IN (0,1)),
  can_write INTEGER NOT NULL DEFAULT 0 CHECK(can_write IN (0,1)),
  can_share INTEGER NOT NULL DEFAULT 0 CHECK(can_share IN (0,1)),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  PRIMARY KEY(tenant_id,scope_id,principal_id),
  FOREIGN KEY(tenant_id,scope_id) REFERENCES cryptographic_scopes(tenant_id,id),
  FOREIGN KEY(tenant_id,principal_id) REFERENCES memberships(tenant_id,principal_id)
);

CREATE TABLE key_envelopes (
  tenant_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  key_version INTEGER NOT NULL CHECK(key_version > 0),
  protocol_version INTEGER NOT NULL CHECK(protocol_version = 1),
  kem TEXT NOT NULL CHECK(kem = 'DHKEM(P-256,HKDF-SHA256)'),
  kdf TEXT NOT NULL CHECK(kdf = 'HKDF-SHA256'),
  aead TEXT NOT NULL CHECK(aead = 'AES-256-GCM'),
  enc TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,scope_id,recipient_id,key_version),
  FOREIGN KEY(tenant_id,scope_id,recipient_id) REFERENCES scope_grants(tenant_id,scope_id,principal_id)
);

CREATE TABLE encrypted_objects (
  tenant_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK(object_type IN (
    'diary.class.v1','diary.student.v1','diary.item.v1','diary.record.v1',
    'diary.attendance.v1','diary.calendar.v1','diary.report.v1',
    'communications.announcement.v1','festival.submission.v1',
    'mostra.assessment.v1','institution.profile.v1'
  )),
  protocol_version INTEGER NOT NULL CHECK(protocol_version = 1),
  key_version INTEGER NOT NULL CHECK(key_version > 0),
  revision INTEGER NOT NULL CHECK(revision > 0),
  kdf TEXT NOT NULL CHECK(kdf = 'HKDF-SHA256'),
  aead TEXT NOT NULL CHECK(aead = 'AES-256-GCM'),
  salt TEXT NOT NULL,
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,scope_id,object_id),
  FOREIGN KEY(tenant_id,scope_id) REFERENCES cryptographic_scopes(tenant_id,id)
);

CREATE TABLE security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  key_version INTEGER,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,scope_id) REFERENCES cryptographic_scopes(tenant_id,id)
);

CREATE INDEX idx_encrypted_objects_scope ON encrypted_objects(tenant_id,scope_id,updated_at,object_id);
CREATE INDEX idx_scope_grants_principal ON scope_grants(tenant_id,principal_id,revoked_at);
CREATE INDEX idx_security_events_tenant ON security_events(tenant_id,occurred_at);
