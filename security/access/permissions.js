const ALLOWED_PERMISSIONS = new Set(["read", "write", "share", "manage"]);

export function authorizeScope({ actor, scope, grant, permission }) {
  if (!ALLOWED_PERMISSIONS.has(permission) || !actor || !scope || !grant) return false;
  if (actor.status !== "active" || actor.tenantId !== scope.tenantId || grant.tenantId !== scope.tenantId ||
      grant.scopeId !== scope.id || grant.userId !== actor.userId || grant.revokedAt) return false;
  if (actor.membershipStatus !== "active" || actor.membershipId !== grant.membershipId) return false;
  return grant.permissions instanceof Set && grant.permissions.has(permission);
}

export function requireScopePermission(context, permission) {
  if (!authorizeScope({ ...context, permission })) {
    throw new Error("The authenticated user is not authorized for this encrypted scope.");
  }
}
