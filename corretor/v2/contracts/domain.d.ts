export type OpaqueId = string;
export type TenantKind = "individual" | "institution";
export type MembershipRole = "teacher" | "coordinator" | "tenant_admin" | "student" | "guardian";
export type QuestionType = "A-D" | "A-E" | "C-E";
export type AssessmentStatus = "draft" | "published" | "closed";
export type ResultStatus = "absent" | "provisional" | "definitive";
export type AttemptKind = "first" | "second_call";
export type AnnulledPolicy = "award" | "normalize";

export interface Tenant { id: OpaqueId; kind: TenantKind; status: "active" | "suspended" }
export interface User { id: OpaqueId; status: "active" | "disabled" }
export interface Membership { id: OpaqueId; tenantId: OpaqueId; userId: OpaqueId; role: MembershipRole; status: "active" | "revoked" }
export interface SchoolYear { id: OpaqueId; tenantId: OpaqueId; year: number }
export interface StudentIdentity { id: OpaqueId; status: "active" | "archived" }
export interface Classroom { id: OpaqueId; tenantId: OpaqueId; schoolYearId: OpaqueId }
export interface Enrollment { id: OpaqueId; tenantId: OpaqueId; studentId: OpaqueId; classId: OpaqueId; schoolYearId: OpaqueId; status: "active" | "ended" }
export interface AuthorizationScope { id: OpaqueId; tenantId: OpaqueId; resourceId: OpaqueId; type: "class" | "enrollment" | "assessment" }
export interface ScopeGrant { tenantId: OpaqueId; scopeId: OpaqueId; membershipId: OpaqueId; status: "active" | "revoked"; permissions: Array<"read" | "write" | "manage" | "publish" | "review"> }

export interface Question { id: OpaqueId; number: number; weight: number }
export interface AssessmentSection { id: OpaqueId; type: QuestionType; questions: Question[] }
export interface CardTemplateRevision { id: OpaqueId; revision: number; questionCount: number; layoutVersion?: string }
export interface AssessmentRevision {
  assessmentId: OpaqueId; revisionId: OpaqueId; revision: number; tenantId: OpaqueId; scopeId: OpaqueId;
  classId: OpaqueId; schoolYearId: OpaqueId; period: number; totalPoints: number; status: AssessmentStatus;
  doubleMarkPolicy: "review" | "zero"; sections: AssessmentSection[]; participantRefs: OpaqueId[]; template: CardTemplateRevision;
}
export interface AnswerKeyRevision {
  assessmentId: OpaqueId; assessmentRevision: number; revisionId: OpaqueId; revision: number;
  annulledPolicy: AnnulledPolicy; answers: Record<OpaqueId, "A" | "B" | "C" | "D" | "E" | "annulled">;
}
export interface ParticipantSnapshot {
  snapshotId: OpaqueId; assessmentId: OpaqueId; assessmentRevision: number; tenantId: OpaqueId;
  classId: OpaqueId; schoolYearId: OpaqueId; createdAt: string;
  participants: Array<{ participantRef: OpaqueId; enrollmentId: OpaqueId; encryptedDisplay: { ciphertext: string; [metadata: string]: unknown } }>;
}
export interface AnswerObservation { questionId: OpaqueId; marks: string[]; confidence: number; state: "read" | "review" | "double" | "blank"; manualDecision?: string | "blank" }
export interface ManualAdjudication {
  adjudicationId: OpaqueId; occurrenceId: OpaqueId; assessmentId: OpaqueId; assessmentRevision: number;
  attemptId: OpaqueId; questionId: OpaqueId; reviewerRef: OpaqueId; selectedAnswer: "A" | "B" | "C" | "D" | "E" | "blank";
  reasonCode: "omr_uncertain" | "double_mark_confirmed" | "blank_confirmed" | "manual_correction" | "template_review"; decidedAt: string;
}
export interface ScoredResult {
  status: ResultStatus; score: number | null; provisionalRange: { min: number; max: number } | null;
  eligibleForBimester: boolean; attemptKind: AttemptKind; pendingQuestionIds: readonly OpaqueId[];
}
export interface CardAttempt {
  attemptId: OpaqueId; assessmentId: OpaqueId; assessmentRevision: number; participantRef: OpaqueId;
  attemptNumber: number; kind: AttemptKind; status: "in_progress" | "needs_review" | ResultStatus;
  templateId: OpaqueId; templateRevision: number; createdAt: string;
}
export interface CardOccurrence {
  occurrenceId: OpaqueId; attemptId: OpaqueId; assessmentId: OpaqueId; assessmentRevision: number;
  participantRef: OpaqueId; cardToken: OpaqueId; templateId: OpaqueId; templateRevision: number;
  attemptNumber: number; attemptKind: AttemptKind; pageIndexes: number[]; readerVersion: string; capturedAt: string;
}

export interface EncryptedEnvelope {
  tenant_id: OpaqueId; scope_id: OpaqueId; object_id: OpaqueId; object_type: string;
  protocol_version: 1; key_version: number; revision: number; kdf: "HKDF-SHA256";
  aead: "AES-256-GCM"; salt: string; nonce: string; ciphertext: string;
}
export interface CryptoObjectContext {
  tenantId: OpaqueId; scopeId: OpaqueId; objectId: OpaqueId; type: string;
  keyVersion: number; revision: number;
}
export interface IdentityRecoveryContext { tenantId: OpaqueId; userId: OpaqueId; keyVersion: number }
export interface IdentityRecoveryBundle {
  protocol_version: number; tenant_id: OpaqueId; user_id: OpaqueId; key_version: number;
  public_key: string; nonce: string; ciphertext: string;
}
export interface FinalDiarySyncRequest {
  tenantId: OpaqueId; scopeId: OpaqueId; assessmentId: OpaqueId; diaryItemId: OpaqueId;
  participantRef: OpaqueId; attempt: number; resultRevision: number; resultStatus: "definitive"; idempotencyKey: string;
  encryptedResult: EncryptedEnvelope;
}

export interface SaltaCryptoCorePort {
  encryptJson(key: CryptoKey, context: CryptoObjectContext, value: unknown): Promise<Omit<EncryptedEnvelope, "tenant_id" | "scope_id" | "object_id" | "object_type">>;
  decryptJson(key: CryptoKey, context: CryptoObjectContext, envelope: Omit<EncryptedEnvelope, "tenant_id" | "scope_id" | "object_id" | "object_type">): Promise<unknown>;
  createSaltaIdentity(context: IdentityRecoveryContext): Promise<{ identityKeyPair: CryptoKeyPair; recoveryCode: string; recoveryBundle: IdentityRecoveryBundle }>;
  restoreSaltaIdentity(code: string, bundle: IdentityRecoveryBundle, context: IdentityRecoveryContext): Promise<{ identityKeyPair: CryptoKeyPair }>;
  createSaltaScope(input: { tenantId: OpaqueId; scopeId: OpaqueId; keyVersion?: number; recipients: unknown[] }): Promise<unknown>;
  unwrapScopeKey(envelope: unknown, identityKeyPair: CryptoKeyPair, expectedContext: Record<string, unknown>): Promise<CryptoKey>;
  rotateScopeRecords(input: { records: unknown[]; oldScopeKey: CryptoKey; newTenantKey: CryptoKey; tenantId: OpaqueId; scopeId: OpaqueId; oldKeyVersion: number; newKeyVersion: number }): Promise<unknown[]>;
  createRotatedScope(input: { tenantId: OpaqueId; scopeId: OpaqueId; keyVersion: number; recipients: unknown[] }): Promise<unknown>;
}
export interface RecoveryPort {
  createIdentityWithRecovery(context: IdentityRecoveryContext): Promise<{ identityKeyPair: CryptoKeyPair; recoveryCode: string; recoveryBundle: IdentityRecoveryBundle }>;
  recoverIdentity(recoveryCode: string, bundle: IdentityRecoveryBundle, context: IdentityRecoveryContext): Promise<{ identityKeyPair: CryptoKeyPair }>;
}
export interface RevocationPort { revokeGrant(tenantId: OpaqueId, scopeId: OpaqueId, membershipId: OpaqueId): Promise<{ revoked: boolean; rotationRequired: boolean }> }
