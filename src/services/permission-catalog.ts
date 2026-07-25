// Single source of truth for the internal permission catalogue.
// Keep in sync with the seed migration in src/db (roles + permissions).

export type PermissionAction =
  | "view" | "create" | "update" | "assign" | "reassign"
  | "approve" | "reject" | "resolve" | "escalate" | "suspend"
  | "export" | "configure" | "manage_permissions"
  | "view_assigned" | "add_internal_note" | "request_information"
  | "request_evidence" | "update_status" | "resolve_assigned"
  | "resolve_all" | "remove_flag";

export interface PermissionEntry {
  key: string;      // module.action
  module: string;
  action: PermissionAction;
  label: string;
}

export interface PermissionModule {
  key: string;
  label: string;
  permissions: PermissionEntry[];
}

const MODULES: Array<{ key: string; label: string; actions: PermissionAction[] }> = [
  { key: "dashboard",              label: "Dashboard",              actions: ["view", "export"] },
  { key: "transactions",           label: "Transactions",           actions: ["view", "update", "export", "escalate"] },
  { key: "escrow",                 label: "Escrow",                 actions: ["view", "update", "approve", "configure", "export"] },
  { key: "disputes",               label: "Disputes",               actions: ["view", "view_assigned", "create", "update", "update_status", "add_internal_note", "request_information", "request_evidence", "assign", "reassign", "resolve", "resolve_assigned", "resolve_all", "escalate", "approve", "reject", "export"] },
  { key: "identity_verification",  label: "Identity Verification",  actions: ["view", "approve", "reject", "escalate", "export"] },
  { key: "task_orchestration",     label: "Task Orchestration",     actions: ["view", "assign", "reassign", "configure"] },
  { key: "agent_performance",      label: "Agent Performance",      actions: ["view", "export"] },
  { key: "flagged_users",          label: "Flagged Users",          actions: ["view", "update", "remove_flag", "suspend", "export"] },
  { key: "users_and_access",       label: "Users & Access",         actions: ["view", "create", "update", "suspend", "manage_permissions", "export"] },
  { key: "permissions",            label: "Permission Management",  actions: ["view", "manage_permissions"] },
  { key: "financial_controls",     label: "Financial Controls",     actions: ["view", "create", "approve", "reject", "configure", "export"] },
  { key: "audit_logs",             label: "Audit Logs",             actions: ["view", "export"] },
  { key: "reports",                label: "Reports & Exports",      actions: ["view", "export", "configure"] },
  { key: "platform_configuration", label: "Platform Configuration", actions: ["view", "configure"] },
];

const ACTION_LABEL: Record<PermissionAction, string> = {
  view: "View", create: "Create", update: "Update", assign: "Assign",
  reassign: "Reassign", approve: "Approve", reject: "Reject", resolve: "Resolve",
  escalate: "Escalate", suspend: "Suspend", export: "Export", configure: "Configure",
  manage_permissions: "Manage Permissions",
  view_assigned: "View Assigned", add_internal_note: "Add Internal Note",
  request_information: "Request Information", request_evidence: "Request Evidence",
  update_status: "Update Status", resolve_assigned: "Resolve Assigned",
  resolve_all: "Resolve Any", remove_flag: "Remove Flag",
};

export const PERMISSION_MODULES: PermissionModule[] = MODULES.map((m) => ({
  key: m.key,
  label: m.label,
  permissions: m.actions.map((action) => ({
    key: `${m.key}.${action}`,
    module: m.key,
    action,
    label: `${m.label} — ${ACTION_LABEL[action]}`,
  })),
}));

export const ALL_PERMISSION_KEYS: string[] =
  PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key));

/**
 * Union of role→permission arrays. Callers pass the map loaded from the
 * `role_permissions` table so this stays a single source of truth without
 * duplicating the seed here.
 */
export function permissionsForRoles(
  roles: string[],
  rolePerms: Map<string, string[]>,
): string[] {
  const out = new Set<string>();
  for (const r of roles) for (const p of (rolePerms.get(r) ?? [])) out.add(p);
  return Array.from(out).sort();
}

/**
 * High-signal / dangerous action list. Used to flag "privileged permissions
 * being introduced" in the Change Role diff and "restricted" listings.
 */
export const PRIVILEGED_ACTIONS: PermissionAction[] = [
  "approve", "manage_permissions", "configure", "suspend",
];

export function isPrivilegedPermission(key: string): boolean {
  const action = key.split(".")[1] as PermissionAction | undefined;
  return !!action && PRIVILEGED_ACTIONS.includes(action);
}

// ---------------------------------------------------------------------------
// Internal role catalogue
// ---------------------------------------------------------------------------

export type InternalRoleKey =
  | "super_admin" | "senior_admin"
  | "dispute_manager" | "dispute_agent"
  | "support_agent" | "identity_officer"
  | "finance_operator" | "finance_approver"
  | "compliance_officer" | "auditor";

export interface InternalRoleDefinition {
  key: InternalRoleKey;
  name: string;
  description: string;
  protected: boolean;
}

export const INTERNAL_ROLES: InternalRoleDefinition[] = [
  { key: "super_admin",        name: "Super Admin",                    protected: true,  description: "Complete platform access. Approves privileged access changes." },
  { key: "senior_admin",       name: "Senior Admin",                   protected: true,  description: "Manages day-to-day platform operations, agents and reviews." },
  { key: "dispute_manager",    name: "Dispute Manager",                protected: false, description: "Assigns, escalates and reviews dispute resolutions." },
  { key: "dispute_agent",      name: "Dispute Agent",                  protected: false, description: "Handles assigned dispute cases and updates case stages." },
  { key: "support_agent",      name: "Support Agent",                  protected: false, description: "Views support-related transaction and dispute information." },
  { key: "identity_officer",   name: "Identity Verification Officer",  protected: false, description: "Reviews identity submissions and processes verification." },
  { key: "finance_operator",   name: "Finance Operator",               protected: false, description: "Prepares and initiates permitted financial operations." },
  { key: "finance_approver",   name: "Finance Approver",               protected: true,  description: "Approves or rejects financial operations." },
  { key: "compliance_officer", name: "Compliance Officer",             protected: false, description: "Applies compliance flags and reviews audit history." },
  { key: "auditor",            name: "Auditor",                        protected: false, description: "Read-only access to approved platform data and reports." },
];

export const ROLE_LABEL: Record<InternalRoleKey, string> =
  Object.fromEntries(INTERNAL_ROLES.map((r) => [r.key, r.name])) as Record<InternalRoleKey, string>;

export function isProtectedRole(key: string): boolean {
  return INTERNAL_ROLES.some((r) => r.key === key && r.protected);
}

// ---------------------------------------------------------------------------
// Access level derivation (mirrors internal_effective_access_level in SQL)
// ---------------------------------------------------------------------------

export type AccessLevel = "full" | "high" | "standard" | "limited";

const HIGH_PERMISSIONS = new Set<string>([
  "permissions.manage_permissions",
  "financial_controls.approve",
  "financial_controls.configure",
  "platform_configuration.configure",
  "users_and_access.suspend",
  "users_and_access.manage_permissions",
]);

// Suspension permission split (Support Agent RBAC finalisation):
//   • `flagged_users.suspend`     — suspensions initiated from the Flagged
//     Users queue (contextual to a risk signal). Wired in
//     `admin-flagged-users-action`.
//   • `users_and_access.suspend`  — directory-initiated suspensions from the
//     Users & Access screen (independent of flags). Enforced on any
//     directory-side suspend endpoint.
// Both map to the same DB mutation but audit distinctly by source.

const STANDARD_ACTIONS = /\.(create|update|assign|reassign|resolve|escalate|approve|reject)$/;

export function deriveAccessLevel(perms: string[], roles: string[] = []): AccessLevel {
  if (roles.includes("super_admin")) return "full";
  if (perms.some((p) => HIGH_PERMISSIONS.has(p))) return "high";
  if (perms.some((p) => STANDARD_ACTIONS.test(p))) return "standard";
  return "limited";
}

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  full: "Full Access",
  high: "High Access",
  standard: "Standard Access",
  limited: "Limited Access",
};

// Cross-role guardrails enforced client-side (matches DB trigger).
export interface RoleSetValidation { ok: boolean; error?: string }
export function validateRoleSet(roles: string[]): RoleSetValidation {
  if (roles.includes("super_admin") && roles.length > 1) {
    return { ok: false, error: "Super Admin cannot be combined with any other role." };
  }
  if (roles.includes("finance_operator") && roles.includes("finance_approver")) {
    return { ok: false, error: "Finance Operator and Finance Approver cannot be assigned to the same person." };
  }
  if (roles.length === 0) {
    return { ok: false, error: "At least one role is required." };
  }
  return { ok: true };
}