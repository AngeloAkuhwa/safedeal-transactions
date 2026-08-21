// Client-side guardrails for role permission edits. Matches the intent
// of DB triggers and the spec: protected roles have mandatory keys, the
// last active Super Admin cannot lose critical access, Auditor stays
// read-only, and Finance separation-of-duties is preserved.

import { INTERNAL_ROLES, isProtectedRole, type InternalRoleKey } from "./permission-catalog";

export const SUPER_ADMIN_MANDATORY: ReadonlySet<string> = new Set([
  "permissions.manage_permissions",
  "users_and_access.manage_permissions",
  "audit_logs.view",
]);

const AUDITOR_WRITE_ACTION = /\.(create|update|approve|reject|configure|suspend|reactivate|manage_permissions|escalate|resolve|assign|reassign|remove_flag)$/;

const FINANCE_APPROVE_KEYS: ReadonlySet<string> = new Set([
  "financial_controls.approve", "payouts.approve", "refunds.approve", "escrow.approve",
]);

const FINANCE_CREATE_KEYS: ReadonlySet<string> = new Set([
  "financial_controls.create", "payouts.create", "refunds.create",
]);

const OPERATIONAL_ROLES: ReadonlySet<InternalRoleKey> = new Set([
  "dispute_agent", "dispute_manager", "support_agent", "identity_officer",
]);

const OPS_SENSITIVE = /^(platform_configuration\..+|permissions\.manage_permissions)$/;

export interface GuardResult {
  ok: boolean;
  blocked?: boolean;      // hard-blocked (do not stage)
  requiresApproval?: boolean;
  message?: string;
}

/**
 * Check whether staging a `grant`/`revoke` for `permissionKey` on `role`
 * is allowed. Callers must respect `blocked` and surface `message`.
 *
 * `activeSuperAdminCount` is the number of enabled users currently
 * assigned to `super_admin`; used to protect the last one.
 */
export function checkRoleStageAllowed(
  role: InternalRoleKey,
  permissionKey: string,
  op: "grant" | "revoke",
  ctx: { activeSuperAdminCount?: number } = {},
): GuardResult {
  // Super Admin: mandatory keys locked; last-active safeguard on revoke.
  if (role === "super_admin") {
    if (op === "revoke" && SUPER_ADMIN_MANDATORY.has(permissionKey)) {
      if ((ctx.activeSuperAdminCount ?? 0) <= 1) {
        return { ok: false, blocked: true,
          message: "Last active Super Admin: critical administrative access cannot be reduced." };
      }
      return { ok: false, blocked: true,
        message: "This permission is mandatory for Super Admin and cannot be removed." };
    }
  }

  // Auditor: read-only. Only view / view_assigned / export are allowed.
  if (role === "auditor" && op === "grant" && AUDITOR_WRITE_ACTION.test(permissionKey)) {
    return { ok: false, blocked: true,
      message: "Auditor must remain read-only: write-scope permissions cannot be granted." };
  }

  // Finance separation of duties.
  if (role === "finance_operator" && op === "grant" && FINANCE_APPROVE_KEYS.has(permissionKey)) {
    return { ok: false, blocked: true,
      message: "Finance Operator cannot approve financial actions they initiate." };
  }
  if (role === "finance_approver" && op === "grant" && FINANCE_CREATE_KEYS.has(permissionKey)) {
    return { ok: false, blocked: true,
      message: "Finance Approver should not automatically receive initiation permissions." };
  }

  // Operational roles: sensitive platform/permissions edits require approval.
  if (OPERATIONAL_ROLES.has(role) && op === "grant" && OPS_SENSITIVE.test(permissionKey)) {
    return { ok: true, requiresApproval: true,
      message: "Operational agents must not receive platform security permissions by default. This change will require Super Admin approval." };
  }

  return { ok: true };
}

export function isMandatorySuperAdminKey(key: string): boolean {
  return SUPER_ADMIN_MANDATORY.has(key);
}

export function isProtectedRoleKey(key: string): boolean {
  return isProtectedRole(key);
}

export function listProtectedRoles(): InternalRoleKey[] {
  return INTERNAL_ROLES.filter((r) => r.protected).map((r) => r.key);
}

/**
 * Guardrail for creating a user-permission override. Mirrors the role-stage
 * rules so overrides cannot bypass mandatory system restrictions, auditor
 * read-only, or Finance separation of duties.
 */
export function checkOverrideAllowed(
  userRole: InternalRoleKey | null,
  permissionKey: string,
  mode: "grant" | "revoke",
  ctx: { expiresAt?: string | null; isPrivileged?: boolean } = {},
): GuardResult {
  // Temporary privileged access must have an expiry.
  if (mode === "grant" && ctx.isPrivileged && !ctx.expiresAt) {
    return {
      ok: false, blocked: true,
      message: "Temporary privileged access requires an expiry date.",
    };
  }

  // Mandatory Super Admin keys cannot be denied via override.
  if (mode === "revoke" && SUPER_ADMIN_MANDATORY.has(permissionKey) && userRole === "super_admin") {
    return { ok: false, blocked: true,
      message: "Mandatory Super Admin permissions cannot be removed via override." };
  }

  if (!userRole) return { ok: true };

  // Delegate to the same rules used for role staging, but only when the
  // override actually flips a role's baseline.
  return checkRoleStageAllowed(userRole, permissionKey, mode);
}