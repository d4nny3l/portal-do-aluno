import { assertScopePermission } from "../domain/identity.mjs";

export function authorizeDatabaseAction(db, { workspaceId, scopeId, userRef, permission }) {
  const scope = db.prepare("SELECT id, workspace_id AS workspaceId, resource_ref AS resourceId, resource_type AS type FROM scopes WHERE id=? AND workspace_id=?").get(scopeId, workspaceId);
  const membership = db.prepare("SELECT id, workspace_id AS workspaceId, user_ref AS userId, role, status FROM memberships WHERE workspace_id=? AND user_ref=?").get(workspaceId, userRef);
  const workspace = db.prepare("SELECT status FROM workspaces WHERE id=?").get(workspaceId);
  const user = db.prepare("SELECT status FROM users WHERE id=?").get(userRef);
  if (!scope || !membership || !workspace || !user || workspace.status !== "active" || user.status !== "active") throw new Error("Acesso negado.");
  const grantRow = db.prepare("SELECT workspace_id AS workspaceId, scope_id AS scopeId, membership_id AS membershipId, status, permissions_json FROM scope_grants WHERE workspace_id=? AND scope_id=? AND membership_id=?").get(workspaceId, scopeId, membership.id);
  if (!grantRow) throw new Error("Acesso negado.");
  let permissions;
  try { permissions = JSON.parse(grantRow.permissions_json); } catch { throw new Error("Acesso negado."); }
  return assertScopePermission({
    actor: { id: userRef, status: user.status },
    membership: { id: membership.id, userId: membership.userId, tenantId: workspaceId, status: membership.status },
    scope: { id: scope.id, tenantId: scope.workspaceId, resourceId: scope.resourceId, type: scope.type },
    grant: { tenantId: grantRow.workspaceId, scopeId: grantRow.scopeId, membershipId: grantRow.membershipId, status: grantRow.status, permissions },
    permission
  });
}

export function revokeMembership(db, { workspaceId, membershipId }) {
  const result = db.prepare("UPDATE memberships SET status='revoked' WHERE workspace_id=? AND id=? AND status='active'").run(workspaceId, membershipId);
  if (result.changes !== 1) return false;
  db.prepare("UPDATE scope_grants SET status='revoked' WHERE workspace_id=? AND membership_id=?").run(workspaceId, membershipId);
  return true;
}
