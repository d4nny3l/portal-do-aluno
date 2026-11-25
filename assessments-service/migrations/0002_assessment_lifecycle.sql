-- Local candidate ONLY. Apply with the library CLOSED after owner retention decision.
-- No definition is deleted by this schema transition; receipts retain no definition.
CREATE TABLE av_requests_next (
 owner_id TEXT NOT NULL REFERENCES av_principals(id), request_id TEXT NOT NULL,
 body_mac TEXT NOT NULL, key_version INTEGER NOT NULL,
 assessment_id TEXT NOT NULL, revision INTEGER NOT NULL, receipt_json TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
INSERT INTO av_requests_next SELECT * FROM av_requests;
DROP TABLE av_requests;
ALTER TABLE av_requests_next RENAME TO av_requests;
CREATE TRIGGER av_request_no_update BEFORE UPDATE ON av_requests BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
CREATE TRIGGER av_request_no_delete BEFORE DELETE ON av_requests BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
CREATE TABLE av_lifecycle_fences (
 assessment_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES av_principals(id),
 institution_id TEXT NOT NULL, class_id TEXT NOT NULL, period_id TEXT NOT NULL,
 revision_floor INTEGER NOT NULL CHECK(revision_floor>0),
 deleted INTEGER NOT NULL CHECK(deleted IN(0,1)), updated_at TEXT NOT NULL
);
CREATE TRIGGER av_fence_no_delete BEFORE DELETE ON av_lifecycle_fences BEGIN SELECT RAISE(ABORT,'immutable fence'); END;
CREATE TRIGGER av_fence_monotonic BEFORE UPDATE ON av_lifecycle_fences
 WHEN NEW.assessment_id!=OLD.assessment_id OR NEW.owner_id!=OLD.owner_id OR NEW.institution_id!=OLD.institution_id OR NEW.class_id!=OLD.class_id OR NEW.period_id!=OLD.period_id OR NEW.revision_floor<OLD.revision_floor OR NEW.deleted<OLD.deleted
 BEGIN SELECT RAISE(ABORT,'monotonic fence'); END;
CREATE TABLE av_retention_holds (
 assessment_id TEXT PRIMARY KEY REFERENCES av_assessments(id), reason_code TEXT NOT NULL CHECK(reason_code IN('academic','legal'))
);
-- A guard exists only INSIDE an authenticated, CAS-checked atomic D1 batch.
CREATE TABLE av_purge_guards (
 assessment_id TEXT PRIMARY KEY REFERENCES av_assessments(id), owner_id TEXT NOT NULL REFERENCES av_principals(id),
 expected_revision INTEGER NOT NULL, request_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('replace','delete'))
);
DROP TRIGGER av_revision_no_delete;
CREATE TRIGGER av_revision_no_delete BEFORE DELETE ON av_revisions
 WHEN NOT EXISTS(SELECT 1 FROM av_purge_guards g JOIN av_assessments a ON a.id=g.assessment_id AND a.owner_id=g.owner_id
 WHERE g.assessment_id=OLD.assessment_id AND (g.kind='delete' OR OLD.revision<a.current_revision))
 BEGIN SELECT RAISE(ABORT,'unguarded revision purge'); END;
DROP TRIGGER av_selection_no_delete;
CREATE TRIGGER av_selection_no_delete BEFORE DELETE ON av_selections
 WHEN NOT EXISTS(SELECT 1 FROM av_purge_guards g WHERE g.assessment_id=OLD.assessment_id AND g.owner_id=OLD.owner_id)
 BEGIN SELECT RAISE(ABORT,'unguarded selection purge'); END;
CREATE TRIGGER av_root_no_resurrection BEFORE INSERT ON av_assessments
 WHEN EXISTS(SELECT 1 FROM av_lifecycle_fences WHERE assessment_id=NEW.id AND deleted=1)
 BEGIN SELECT RAISE(ABORT,'deleted assessment'); END;
CREATE TABLE av_lifecycle_schema (version TEXT PRIMARY KEY CHECK(version='salta-assessment-lifecycle-v1'));
INSERT INTO av_lifecycle_schema VALUES('salta-assessment-lifecycle-v1');
-- Sticky storage safety: an old binary/disabled capability cannot start appending
-- recoverable history again after this schema has been installed.
CREATE TRIGGER av_revision_replace_required BEFORE INSERT ON av_revisions
 WHEN EXISTS(SELECT 1 FROM av_revisions WHERE assessment_id=NEW.assessment_id)
 AND NOT EXISTS(SELECT 1 FROM av_purge_guards WHERE assessment_id=NEW.assessment_id AND kind='replace')
 BEGIN SELECT RAISE(ABORT,'replacement contract required'); END;
CREATE TRIGGER av_selection_current_only BEFORE INSERT ON av_selections
 WHEN NOT EXISTS(SELECT 1 FROM av_assessments WHERE id=NEW.assessment_id AND owner_id=NEW.owner_id AND current_revision=NEW.revision AND state='active')
 BEGIN SELECT RAISE(ABORT,'selection must be current'); END;
