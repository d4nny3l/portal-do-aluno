PRAGMA foreign_keys = ON;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('individual','institution')),
  status TEXT NOT NULL CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_ref TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('teacher','coordinator','tenant_admin')),
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  UNIQUE (workspace_id, user_ref),
  UNIQUE (workspace_id, id)
);

CREATE TABLE scopes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  resource_ref TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('class','assessment')),
  UNIQUE (workspace_id, resource_ref),
  UNIQUE (workspace_id, id)
);

CREATE TABLE scope_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  scope_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  permissions_json TEXT NOT NULL,
  UNIQUE (workspace_id, scope_id, membership_id),
  FOREIGN KEY (workspace_id, scope_id) REFERENCES scopes(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, membership_id) REFERENCES memberships(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  scope_id TEXT NOT NULL,
  class_ref TEXT NOT NULL,
  school_year_ref TEXT NOT NULL,
  current_revision INTEGER NOT NULL CHECK (current_revision > 0),
  status TEXT NOT NULL CHECK (status IN ('draft','published','closed')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, scope_id) REFERENCES scopes(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE assessment_revisions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 4),
  total_points REAL NOT NULL CHECK (total_points > 0 AND total_points <= 100),
  status TEXT NOT NULL CHECK (status IN ('draft','published','closed')),
  double_mark_policy TEXT NOT NULL CHECK (double_mark_policy IN ('review','zero')),
  created_at TEXT NOT NULL,
  UNIQUE (assessment_id, revision),
  UNIQUE (assessment_id, id)
);

CREATE TABLE assessment_sections (
  revision_id TEXT NOT NULL REFERENCES assessment_revisions(id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  section_number INTEGER NOT NULL CHECK (section_number > 0),
  question_type TEXT NOT NULL CHECK (question_type IN ('A-D','A-E','C-E')),
  PRIMARY KEY (revision_id, id),
  UNIQUE (revision_id, section_number)
);

CREATE TABLE assessment_questions (
  revision_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  id TEXT NOT NULL,
  question_number INTEGER NOT NULL CHECK (question_number BETWEEN 1 AND 100),
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 100),
  PRIMARY KEY (revision_id, id),
  UNIQUE (revision_id, question_number),
  FOREIGN KEY (revision_id, section_id) REFERENCES assessment_sections(revision_id,id) ON DELETE RESTRICT
);

CREATE TABLE participant_snapshots (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  assessment_revision INTEGER NOT NULL CHECK (assessment_revision > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (assessment_id, assessment_revision) REFERENCES assessment_revisions(assessment_id,revision) ON DELETE RESTRICT
);

CREATE TABLE snapshot_participants (
  snapshot_id TEXT NOT NULL REFERENCES participant_snapshots(id) ON DELETE RESTRICT,
  participant_ref TEXT NOT NULL,
  enrollment_ref TEXT NOT NULL,
  encrypted_display_json TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, participant_ref)
);

CREATE TABLE answer_keys (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  assessment_revision INTEGER NOT NULL CHECK (assessment_revision > 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  annulled_policy TEXT NOT NULL CHECK (annulled_policy IN ('award','normalize')),
  encrypted_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (assessment_id, assessment_revision, revision),
  FOREIGN KEY (assessment_id, assessment_revision) REFERENCES assessment_revisions(assessment_id,revision) ON DELETE RESTRICT
);

CREATE TABLE card_templates (
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 100),
  layout_version TEXT NOT NULL,
  PRIMARY KEY (assessment_id, id, revision),
  UNIQUE (assessment_id, revision)
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  assessment_revision INTEGER NOT NULL CHECK (assessment_revision > 0),
  participant_ref TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  kind TEXT NOT NULL CHECK (kind IN ('first','second_call')),
  status TEXT NOT NULL CHECK (status IN ('in_progress','needs_review','absent','provisional','definitive')),
  template_id TEXT NOT NULL,
  template_revision INTEGER NOT NULL CHECK (template_revision > 0),
  created_at TEXT NOT NULL,
  UNIQUE (assessment_id, participant_ref, attempt_number),
  FOREIGN KEY (assessment_id, assessment_revision) REFERENCES assessment_revisions(assessment_id,revision) ON DELETE RESTRICT,
  FOREIGN KEY (assessment_id, template_id, template_revision) REFERENCES card_templates(assessment_id,id,revision) ON DELETE RESTRICT
);

CREATE TABLE scan_occurrences (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  card_token TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_revision INTEGER NOT NULL CHECK (template_revision > 0),
  page_indexes_json TEXT NOT NULL,
  reader_version TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (assessment_id, template_id, template_revision) REFERENCES card_templates(assessment_id,id,revision) ON DELETE RESTRICT
);

CREATE TABLE answer_observation_sets (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES scan_occurrences(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  UNIQUE (occurrence_id, revision)
);

CREATE TABLE answer_observations (
  id TEXT PRIMARY KEY,
  observation_set_id TEXT NOT NULL REFERENCES answer_observation_sets(id) ON DELETE RESTRICT,
  question_ref TEXT NOT NULL,
  encrypted_payload_json TEXT NOT NULL,
  UNIQUE (observation_set_id, question_ref)
);

CREATE TABLE manual_reviews (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES scan_occurrences(id) ON DELETE RESTRICT,
  question_ref TEXT NOT NULL,
  reviewer_ref TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('omr_uncertain','double_mark_confirmed','blank_confirmed','manual_correction','template_review')),
  decision_envelope_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE results (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL CHECK (status IN ('absent','provisional','definitive')),
  eligible_for_bimester INTEGER NOT NULL CHECK (eligible_for_bimester IN (0,1)),
  encrypted_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, revision),
  CHECK (status != 'provisional' OR eligible_for_bimester = 0),
  CHECK (status != 'absent' OR eligible_for_bimester = 0)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  actor_ref TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  event_type TEXT NOT NULL,
  subject_ref TEXT,
  ciphertext_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TRIGGER assessment_revisions_no_update BEFORE UPDATE ON assessment_revisions BEGIN SELECT RAISE(ABORT, 'assessment_revisions are append-only'); END;
CREATE TRIGGER assessment_revisions_no_delete BEFORE DELETE ON assessment_revisions BEGIN SELECT RAISE(ABORT, 'assessment_revisions are append-only'); END;
CREATE TRIGGER assessment_sections_no_update BEFORE UPDATE ON assessment_sections BEGIN SELECT RAISE(ABORT, 'assessment_sections are append-only'); END;
CREATE TRIGGER assessment_sections_no_delete BEFORE DELETE ON assessment_sections BEGIN SELECT RAISE(ABORT, 'assessment_sections are append-only'); END;
CREATE TRIGGER assessment_questions_no_update BEFORE UPDATE ON assessment_questions BEGIN SELECT RAISE(ABORT, 'assessment_questions are append-only'); END;
CREATE TRIGGER assessment_questions_no_delete BEFORE DELETE ON assessment_questions BEGIN SELECT RAISE(ABORT, 'assessment_questions are append-only'); END;
CREATE TRIGGER participant_snapshots_no_update BEFORE UPDATE ON participant_snapshots BEGIN SELECT RAISE(ABORT, 'participant_snapshots are append-only'); END;
CREATE TRIGGER participant_snapshots_no_delete BEFORE DELETE ON participant_snapshots BEGIN SELECT RAISE(ABORT, 'participant_snapshots are append-only'); END;
CREATE TRIGGER snapshot_participants_no_update BEFORE UPDATE ON snapshot_participants BEGIN SELECT RAISE(ABORT, 'snapshot_participants are append-only'); END;
CREATE TRIGGER snapshot_participants_no_delete BEFORE DELETE ON snapshot_participants BEGIN SELECT RAISE(ABORT, 'snapshot_participants are append-only'); END;
CREATE TRIGGER answer_keys_no_update BEFORE UPDATE ON answer_keys BEGIN SELECT RAISE(ABORT, 'answer_keys are append-only'); END;
CREATE TRIGGER answer_keys_no_delete BEFORE DELETE ON answer_keys BEGIN SELECT RAISE(ABORT, 'answer_keys are append-only'); END;
CREATE TRIGGER card_templates_no_update BEFORE UPDATE ON card_templates BEGIN SELECT RAISE(ABORT, 'card_templates are append-only'); END;
CREATE TRIGGER card_templates_no_delete BEFORE DELETE ON card_templates BEGIN SELECT RAISE(ABORT, 'card_templates are append-only'); END;
CREATE TRIGGER scan_occurrences_no_update BEFORE UPDATE ON scan_occurrences BEGIN SELECT RAISE(ABORT, 'scan_occurrences are append-only'); END;
CREATE TRIGGER scan_occurrences_no_delete BEFORE DELETE ON scan_occurrences BEGIN SELECT RAISE(ABORT, 'scan_occurrences are append-only'); END;
CREATE TRIGGER answer_observation_sets_no_update BEFORE UPDATE ON answer_observation_sets BEGIN SELECT RAISE(ABORT, 'answer_observation_sets are append-only'); END;
CREATE TRIGGER answer_observation_sets_no_delete BEFORE DELETE ON answer_observation_sets BEGIN SELECT RAISE(ABORT, 'answer_observation_sets are append-only'); END;
CREATE TRIGGER answer_observations_no_update BEFORE UPDATE ON answer_observations BEGIN SELECT RAISE(ABORT, 'answer_observations are append-only'); END;
CREATE TRIGGER answer_observations_no_delete BEFORE DELETE ON answer_observations BEGIN SELECT RAISE(ABORT, 'answer_observations are append-only'); END;
CREATE TRIGGER manual_reviews_no_update BEFORE UPDATE ON manual_reviews BEGIN SELECT RAISE(ABORT, 'manual_reviews are append-only'); END;
CREATE TRIGGER manual_reviews_no_delete BEFORE DELETE ON manual_reviews BEGIN SELECT RAISE(ABORT, 'manual_reviews are append-only'); END;
CREATE TRIGGER results_no_update BEFORE UPDATE ON results BEGIN SELECT RAISE(ABORT, 'results are append-only'); END;
CREATE TRIGGER results_no_delete BEFORE DELETE ON results BEGIN SELECT RAISE(ABORT, 'results are append-only'); END;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events are append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events are append-only'); END;

CREATE TABLE idempotency_operations (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','succeeded','retryable')),
  response_envelope_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, scope_id, idempotency_key)
);

CREATE TABLE diary_sync_states (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  state TEXT NOT NULL CHECK (state IN ('pending','synced','retryable')),
  idempotency_key TEXT NOT NULL,
  acknowledged_revision INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (attempt_id, result_revision),
  CHECK (state != 'synced' OR acknowledged_revision = result_revision)
);

CREATE TABLE salta_code_claims (
  code_digest TEXT PRIMARY KEY,
  encrypted_claim_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX attempts_assessment_idx ON attempts(assessment_id, assessment_revision);
CREATE INDEX results_attempt_idx ON results(attempt_id, revision);
CREATE INDEX audit_assessment_idx ON audit_events(assessment_id, created_at);
