PRAGMA foreign_keys = ON;
-- New domain only. No academic/laboratory table is reused or altered.
CREATE TABLE av_principals (
 id TEXT PRIMARY KEY,
 issuer TEXT NOT NULL CHECK(issuer='salta-auth'),
 auth_user TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role='teacher'),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 epoch INTEGER NOT NULL CHECK(epoch>0),
 expires_at INTEGER NOT NULL,
 UNIQUE(issuer,auth_user)
);
CREATE TABLE av_grants (
 principal_id TEXT NOT NULL REFERENCES av_principals(id),
 institution_id TEXT NOT NULL, class_id TEXT NOT NULL, period_id TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 epoch INTEGER NOT NULL CHECK(epoch>0), expires_at INTEGER NOT NULL,
 PRIMARY KEY(principal_id,institution_id,class_id,period_id)
);
CREATE TABLE av_assessments (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES av_principals(id),
 institution_id TEXT NOT NULL, class_id TEXT NOT NULL, period_id TEXT NOT NULL,
 current_revision INTEGER NOT NULL DEFAULT 0 CHECK(current_revision>=0),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','archived')),
 updated_at TEXT NOT NULL
);
CREATE TABLE av_revisions (
 assessment_id TEXT NOT NULL REFERENCES av_assessments(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 status TEXT NOT NULL CHECK(status IN ('draft','issued')),
 manifest_hash TEXT NOT NULL, key_version INTEGER NOT NULL CHECK(key_version>0),
 encrypted_json TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(assessment_id,revision)
);
CREATE TABLE av_selections (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES av_principals(id),
 assessment_id TEXT NOT NULL, revision INTEGER NOT NULL,
 manifest_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(assessment_id,revision) REFERENCES av_revisions(assessment_id,revision)
);
CREATE TABLE av_requests (
 owner_id TEXT NOT NULL REFERENCES av_principals(id), request_id TEXT NOT NULL,
 body_mac TEXT NOT NULL, key_version INTEGER NOT NULL,
 assessment_id TEXT NOT NULL, revision INTEGER NOT NULL,
 receipt_json TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id),
 FOREIGN KEY(assessment_id,revision) REFERENCES av_revisions(assessment_id,revision)
);
CREATE INDEX av_owner_index ON av_assessments(owner_id,id);
CREATE TRIGGER av_revision_no_update BEFORE UPDATE ON av_revisions BEGIN SELECT RAISE(ABORT,'immutable revision'); END;
CREATE TRIGGER av_revision_no_delete BEFORE DELETE ON av_revisions BEGIN SELECT RAISE(ABORT,'immutable revision'); END;
CREATE TRIGGER av_selection_no_update BEFORE UPDATE ON av_selections BEGIN SELECT RAISE(ABORT,'immutable selection'); END;
CREATE TRIGGER av_selection_no_delete BEFORE DELETE ON av_selections BEGIN SELECT RAISE(ABORT,'immutable selection'); END;
CREATE TRIGGER av_request_no_update BEFORE UPDATE ON av_requests BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
CREATE TRIGGER av_request_no_delete BEFORE DELETE ON av_requests BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
CREATE TRIGGER av_root_identity BEFORE UPDATE OF owner_id,institution_id,class_id,period_id ON av_assessments BEGIN SELECT RAISE(ABORT,'immutable scope'); END;
