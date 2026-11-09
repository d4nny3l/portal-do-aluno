import { id, makeAssessment, syntheticEnvelope } from "./helpers.mjs";
import { createParticipantSnapshot } from "../domain/assessment.mjs";
import { migrateUp } from "../persistence/migrate.mjs";
import { openLocalDatabase } from "../persistence/database.mjs";

export const workspaceA = id("tenant1");
export const scopeA = id("scope1");
export const teacherA = id("teacher1");
export const membershipA = id("membership1");
export const contextA = Object.freeze({ workspaceId: workspaceA, scopeId: scopeA, userRef: teacherA });

export function provisionWorkspace(db, { workspaceId = workspaceA, scopeId = scopeA, teacher = teacherA, membershipId = membershipA, permissions = ["read", "write", "manage", "publish", "review"] } = {}) {
  const grant = id(`grant_${workspaceId}`);
  db.prepare("INSERT INTO workspaces(id,kind,status,created_at) VALUES (?,'institution','active',?)").run(workspaceId, "2026-11-09T12:00:00.000Z");
  db.prepare("INSERT INTO users(id,status,created_at) VALUES (?,'active',?)").run(teacher, "2026-11-09T12:00:00.000Z");
  db.prepare("INSERT INTO memberships(id,workspace_id,user_ref,role,status) VALUES (?,?,?,'teacher','active')").run(membershipId, workspaceId, teacher);
  db.prepare("INSERT INTO scopes(id,workspace_id,resource_ref,resource_type) VALUES (?,?,?,'class')").run(scopeId, workspaceId, id(`class_${workspaceId}`));
  db.prepare("INSERT INTO scope_grants(id,workspace_id,scope_id,membership_id,status,permissions_json) VALUES (?,?,?,?,'active',?)").run(grant, workspaceId, scopeId, membershipId, JSON.stringify(permissions));
}

export function createDatabase() {
  const db = openLocalDatabase(":memory:");
  return migrateUp(db).then(() => { provisionWorkspace(db); return db; });
}

export function makePersistableAssessment({ workspaceId = workspaceA, scopeId = scopeA, count = 3 } = {}) {
  const assessment = structuredClone(makeAssessment({ count }));
  assessment.tenantId = workspaceId;
  assessment.scopeId = scopeId;
  const snapshot = createParticipantSnapshot({
    snapshotId: id("snapshot1"), assessmentId: assessment.assessmentId, assessmentRevision: assessment.revision,
    tenantId: workspaceId, classId: assessment.classId, schoolYearId: assessment.schoolYearId,
    createdAt: "2026-11-09T12:00:00.000Z",
    participants: assessment.participantRefs.map((participantRef, index) => ({
      participantRef, enrollmentId: id(`enrollment${index + 1}`),
      encryptedDisplay: syntheticEnvelope({ tenantId: workspaceId, scopeId, objectId: id(`display${index + 1}`), objectType: "salta.assessment.participants.v1", ciphertext: `ciphertext-display-fixture-${index + 1}` })
    }))
  });
  const answerKeyEnvelope = syntheticEnvelope({ tenantId: workspaceId, scopeId, objectId: id("keypayload1"), objectType: "salta.assessment.key.v1", ciphertext: "ciphertext-key-fixture" });
  return { assessment, snapshot, answerKeyEnvelope };
}

export function sealFixture(workspaceId, scopeId, type, revision = 1) {
  return syntheticEnvelope({ tenantId: workspaceId, scopeId, objectId: id(`payload_${type.replaceAll(".", "_")}_${revision}`), objectType: type, revision, ciphertext: `ciphertext-fixture-${type}-${revision}` });
}
