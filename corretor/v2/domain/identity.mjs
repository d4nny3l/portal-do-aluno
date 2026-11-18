const OPAQUE_ID = /^[A-Za-z0-9_-]{8,128}$/u;
const PERMISSIONS = new Set(["read", "write", "manage", "publish", "review"]);

export function assertOpaqueId(value, label = "ID") {
  if (typeof value !== "string" || !OPAQUE_ID.test(value)) {
    throw new TypeError(`${label} deve ser um identificador opaco válido.`);
  }
  return value;
}

export function validateIdentityGraph(graph) {
  const { tenant, user, membership, schoolYear, student, classroom, enrollment, scope } = graph || {};
  for (const [label, entity] of Object.entries({ tenant, user, membership, schoolYear, student, classroom, enrollment, scope })) {
    if (!entity || typeof entity !== "object") throw new TypeError(`${label} é obrigatório.`);
  }
  assertOpaqueId(tenant.id, "tenant.id");
  assertOpaqueId(user.id, "user.id");
  assertOpaqueId(membership.id, "membership.id");
  assertOpaqueId(schoolYear.id, "schoolYear.id");
  assertOpaqueId(student.id, "student.id");
  assertOpaqueId(classroom.id, "classroom.id");
  assertOpaqueId(enrollment.id, "enrollment.id");
  assertOpaqueId(scope.id, "scope.id");
  if (!["individual", "institution"].includes(tenant.kind)) throw new TypeError("Tipo de tenant inválido.");
  if (!Number.isInteger(schoolYear.year) || schoolYear.year < 2000 || schoolYear.year > 2200) throw new TypeError("Ano letivo inválido.");
  if (membership.tenantId !== tenant.id || membership.userId !== user.id) throw new TypeError("Membership não pertence ao usuário e tenant informados.");
  if (schoolYear.tenantId !== tenant.id || classroom.tenantId !== tenant.id || enrollment.tenantId !== tenant.id || scope.tenantId !== tenant.id) {
    throw new TypeError("O grafo de identidade mistura tenants.");
  }
  if (classroom.schoolYearId !== schoolYear.id || enrollment.schoolYearId !== schoolYear.id || enrollment.classId !== classroom.id || enrollment.studentId !== student.id) {
    throw new TypeError("Matrícula, turma, aluno e ano letivo não correspondem.");
  }
  if (membership.status !== "active" || user.status !== "active" || tenant.status !== "active" || enrollment.status !== "active") {
    throw new TypeError("A identidade ou o vínculo não está ativo.");
  }
  if (scope.resourceId !== classroom.id && scope.resourceId !== enrollment.id) throw new TypeError("O escopo não corresponde à turma ou matrícula.");
  return Object.freeze({ tenantId: tenant.id, userId: user.id, membershipId: membership.id, schoolYearId: schoolYear.id, studentId: student.id, classId: classroom.id, enrollmentId: enrollment.id, scopeId: scope.id });
}

// Política pura para testes e validação de contratos. A autorização real sempre
// deve ser reconstruída no Worker a partir de uma sessão e memberships verificadas.
export function assertScopePermission({ actor, membership, scope, grant, permission }) {
  if (!PERMISSIONS.has(permission)) throw new TypeError("Permissão desconhecida.");
  if (!actor || !membership || !scope || !grant) throw new TypeError("Contexto de autorização incompleto.");
  if (actor.status !== "active" || membership.status !== "active" || grant.status !== "active") throw new Error("Acesso negado.");
  if (actor.id !== membership.userId || membership.tenantId !== scope.tenantId || grant.tenantId !== scope.tenantId || grant.scopeId !== scope.id || grant.membershipId !== membership.id) {
    throw new Error("Acesso negado.");
  }
  if (!Array.isArray(grant.permissions) || !grant.permissions.includes(permission)) throw new Error("Acesso negado.");
  return true;
}

export function validateSaltaCode(code) {
  if (typeof code !== "string" || !/^\d{7}$/u.test(code)) throw new TypeError("O Código SALTA deve conter exatamente sete dígitos.");
  return code;
}

export function generateSaltaCode(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== "function") throw new Error("CSPRNG indisponível; não é seguro gerar um Código SALTA.");
  const space = 0x1000000;
  const range = 10_000_000;
  const cutoff = Math.floor(space / range) * range;
  const bytes = new Uint8Array(3);
  for (;;) {
    cryptoProvider.getRandomValues(bytes);
    const value = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
    if (value < cutoff) return String(value % range).padStart(7, "0");
  }
}

// `claimUnique` é uma porta, não um armazenamento incluído. Em produção ela
// exige um serviço confiável com índice cego; nunca deve expor busca global.
export async function allocateUniqueSaltaCode({ claimUnique, cryptoProvider = globalThis.crypto, maxAttempts = 32 }) {
  if (typeof claimUnique !== "function") throw new TypeError("A reserva única do código é obrigatória.");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 256) throw new TypeError("Limite de tentativas inválido.");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateSaltaCode(cryptoProvider);
    if (await claimUnique(code)) return code;
  }
  throw new Error("Não foi possível reservar um código único após várias colisões.");
}
