-- Structural rollback for the isolated laboratory only. Back up ciphertext first.
DROP TABLE assessment_lab_sessions;
DROP TABLE assessment_requests;
DROP TABLE assessment_revisions;
DROP TABLE assessment_roots;
DROP TABLE assessment_grants;
DROP TABLE assessment_principals;
-- Wrangler-managed laboratory only: allow the same up migration after rollback.
DELETE FROM d1_migrations WHERE name='0001_assessments.sql';
