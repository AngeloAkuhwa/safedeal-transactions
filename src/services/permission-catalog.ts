// Single source of truth for the internal permission catalogue.
// Keep in sync with the seed migration in src/db (roles + permissions).

export type PermissionAction =
  | "view" | "create" | "update" | "assign" | "reassign"
  | "approve" | "reject" | "resolve" | "escalate" | "suspend" | "reactivate"
  | "export" | "configure" | "manage_permissions"
  | "view_assigned" | "add_internal_note" | "request_information"
  | "request_evidence" | "update_status" | "resolve_assigned"
  | "resolve_all" | "remove_flag"
  | "release" | "issue" | "flag";

export interface PermissionEntry {
  key: string;      // module.action
  module: string;
  action: PermissionAction;
  label: string;
  risk?: PermissionRiskLevel;
  description?: string;
  status?: "active" | "suspended" | "deprecated";
  approval_required?: boolean;
  owner_role?: string | null;
  updated_at?: string;
  created_at?: string;
}

export interface PermissionModule {
  key: string;
  label: string;
  permissions: PermissionEntry[];
}

// ---------------------------------------------------------------------------
// Risk levels and effective-permission source (mirrors DB columns)
// ---------------------------------------------------------------------------

export type PermissionRiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_ORDER: Record<PermissionRiskLevel, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

export type PermissionSource =
  | "system_default"
  | "role_template"
  | "direct_role"
  | "user_override"
  | "temporary_access"
  | "system_restriction";

export const PERMISSION_SOURCE_LABEL: Record<PermissionSource, string> = {
  system_default: "System Default",
  role_template: "Role Template",
  direct_role: "Direct Role Configuration",
  user_override: "User Override",
  temporary_access: "Temporary Access",
  system_restriction: "System Restriction",
};

// Row-level state used for INDIVIDUAL permission rows (never module summaries).
export type PermissionRowState =
  | "granted"
  | "denied"
  | "override_granted"
  | "override_denied"
  | "pending"
  | "restricted";

export const PERMISSION_ROW_STATE_LABEL: Record<PermissionRowState, string> = {
  granted: "Granted",
  denied: "Denied",
  override_granted: "Override Granted",
  override_denied: "Override Denied",
  pending: "Pending",
  restricted: "Restricted",
};

const MODULES: Array<{ key: string; label: string; actions: PermissionAction[] }> = [
  { key: "dashboard",              label: "Dashboard",              actions: ["view", "export"] },
  { key: "analytics",              label: "Analytics",              actions: ["view", "export", "configure"] },
  { key: "reports",                label: "Reports & Exports",      actions: ["view", "export", "configure"] },
  { key: "transactions",           label: "Transactions",           actions: ["view", "update", "export", "escalate"] },
  { key: "escrow",                 label: "Escrow",                 actions: ["view", "update", "approve", "configure", "export"] },
  { key: "payouts",                label: "Payouts",                actions: ["view", "create", "approve", "reject", "release", "export"] },
  { key: "payments",               label: "Payments",               actions: ["view", "update", "export"] },
  { key: "refunds",                label: "Refunds",                actions: ["view", "create", "approve", "reject", "issue", "export"] },
  { key: "release_review",         label: "Release Review",         actions: ["view", "flag", "resolve"] },
  { key: "money_tracing",          label: "Money Tracing",          actions: ["view", "export"] },
  { key: "disputes",               label: "Disputes",               actions: ["view", "view_assigned", "create", "update", "update_status", "add_internal_note", "request_information", "request_evidence", "assign", "reassign", "resolve", "resolve_assigned", "resolve_all", "escalate", "approve", "reject", "export"] },
  { key: "identity_verification",  label: "Identity Verification",  actions: ["view", "approve", "reject", "escalate", "export"] },
  { key: "users",                  label: "Users",                  actions: ["view", "update", "suspend", "reactivate", "export"] },
  { key: "investigations",         label: "Investigations",         actions: ["view", "create", "update", "assign", "reassign", "escalate", "resolve", "export"] },
  { key: "task_orchestration",     label: "Task Orchestration",     actions: ["view", "assign", "reassign", "configure"] },
  { key: "agent_performance",      label: "Agent Performance",      actions: ["view", "export"] },
  { key: "flagged_users",          label: "Flagged Users",          actions: ["view", "update", "remove_flag", "suspend", "export"] },
  { key: "users_and_access",       label: "Users & Access",         actions: ["view", "create", "update", "suspend", "reactivate", "manage_permissions", "export"] },
  { key: "permissions",            label: "Permission Management",  actions: ["view", "manage_permissions"] },
  { key: "financial_controls",     label: "Financial Controls",     actions: ["view", "create", "approve", "reject", "configure", "export"] },
  { key: "audit_logs",             label: "Audit Logs",             actions: ["view", "export"] },
  { key: "platform_configuration", label: "Platform Configuration", actions: ["view", "configure"] },
];

const ACTION_LABEL: Record<PermissionAction, string> = {
  view: "View", create: "Create", update: "Update", assign: "Assign",
  reassign: "Reassign", approve: "Approve", reject: "Reject", resolve: "Resolve",
  escalate: "Escalate", suspend: "Suspend", reactivate: "Reactivate", export: "Export", configure: "Configure",
  manage_permissions: "Manage Permissions",
  view_assigned: "View Assigned", add_internal_note: "Add Internal Note",
  request_information: "Request Information", request_evidence: "Request Evidence",
  update_status: "Update Status", resolve_assigned: "Resolve Assigned",
  resolve_all: "Resolve Any", remove_flag: "Remove Flag",
  release: "Release Funds", issue: "Issue", flag: "Flag",
};

// Static fallback catalog (used until the DB hydrator resolves).
// After `hydratePermissionCatalog()` runs, `PERMISSION_MODULES` is replaced
// in-place with the DB truth (risk levels + any new keys).
export let PERMISSION_MODULES: PermissionModule[] = MODULES.map((m) => ({
  key: m.key,
  label: m.label,
  permissions: m.actions.map((action) => ({
    key: `${m.key}.${action}`,
    module: m.key,
    action,
    label: `${m.label}. ${ACTION_LABEL[action]}`,
  })),
}));

export function getAllPermissionKeys(): string[] {
  return PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key));
}

// Kept for backwards compatibility with existing callers.
export const ALL_PERMISSION_KEYS: string[] = getAllPermissionKeys();

// Risk lookup: hydrated from DB alongside the module catalog.
const RISK_BY_KEY = new Map<string, PermissionRiskLevel>();
export function getPermissionRisk(key: string): PermissionRiskLevel {
  return RISK_BY_KEY.get(key) ?? "low";
}

// System-default lookup: permissions inserted by the base seed migration.
const SYSTEM_DEFAULT_KEYS = new Set<string>();
export function isSystemDefaultPermission(key: string): boolean {
  return SYSTEM_DEFAULT_KEYS.has(key);
}

/**
 * Hydrate the module catalog and risk lookup from DB rows returned by
 * permissionRepo.listFeatures(). Safe to call multiple times.
 */
export function hydratePermissionCatalog(rows: Array<{
  key: string; module: string; action: string; label: string;
  risk_level: PermissionRiskLevel; module_label?: string;
  is_system_default?: boolean;
  description?: string;
  status?: "active" | "suspended" | "deprecated";
  approval_required?: boolean;
  owner_role?: string | null;
  updated_at?: string;
  created_at?: string;
}>) {
  if (!rows || rows.length === 0) return;
  RISK_BY_KEY.clear();
  SYSTEM_DEFAULT_KEYS.clear();
  const byModule = new Map<string, { key: string; label: string; perms: PermissionEntry[] }>();
  // seed module labels from the static catalog first for stable order
  for (const m of MODULES) byModule.set(m.key, { key: m.key, label: m.label, perms: [] });
  for (const r of rows) {
    RISK_BY_KEY.set(r.key, r.risk_level ?? "low");
    if (r.is_system_default) SYSTEM_DEFAULT_KEYS.add(r.key);
    const modLabel = r.module_label ?? MODULES.find((m) => m.key === r.module)?.label ?? r.module;
    if (!byModule.has(r.module)) byModule.set(r.module, { key: r.module, label: modLabel, perms: [] });
    const bucket = byModule.get(r.module)!;
    bucket.perms.push({
      key: r.key,
      module: r.module,
      action: r.action as PermissionAction,
      label: r.label,
      risk: r.risk_level ?? "low",
      description: r.description,
      status: r.status ?? "active",
      approval_required: r.approval_required ?? false,
      owner_role: r.owner_role ?? null,
      updated_at: r.updated_at,
      created_at: r.created_at,
    });
  }
  PERMISSION_MODULES = Array.from(byModule.values())
    .filter((m) => m.perms.length > 0)
    .map((m) => ({ key: m.key, label: m.label, permissions: m.perms }));
}

/**
 * Lookup helper: find a permission entry by its key across all modules.
 */
export function findPermissionEntry(key: string): (PermissionEntry & { moduleLabel: string }) | null {
  for (const m of PERMISSION_MODULES) {
    const p = m.permissions.find((x) => x.key === key);
    if (p) return { ...p, moduleLabel: m.label };
  }
  return null;
}

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
 *
 * @deprecated Use `getPermissionRisk(key)`: this heuristic pre-dates the
 * `permissions.risk_level` column and is only kept for legacy call sites.
 */
export const PRIVILEGED_ACTIONS: PermissionAction[] = [
  "approve", "manage_permissions", "configure", "suspend",
];

/**
 * @deprecated Prefer `getPermissionRisk(key)` and compare against `"high"`
 * or `"critical"`. Kept as a shim so old call sites keep working while the
 * catalog hydrates from the DB.
 */
export function isPrivilegedPermission(key: string): boolean {
  const risk = RISK_BY_KEY.get(key);
  if (risk === "high" || risk === "critical") return true;
  const action = key.split(".")[1] as PermissionAction | undefined;
  return !!action && PRIVILEGED_ACTIONS.includes(action);
}

// ---------------------------------------------------------------------------
// Row-state derivation
// ---------------------------------------------------------------------------

export interface DeriveRowStateArgs {
  permissionKey: string;
  userId?: string | null;
  userRoleKeys?: string[];
  viewerCanManagePermissions?: boolean;
  roleGrantMap?: Map<string, Set<string>>;
  override?: { mode: "grant" | "revoke"; expires_at?: string | null } | null;
  pendingKeysForUser?: Set<string>;
}

/**
 * Derive the effective row-state for a single (permission, user) pair using
 * the model from the spec (§4). Order matters:
 *   restricted  → critical + viewer lacks manage
 *   pending     → open access_change_requests row
 *   override_*  → user_permission_overrides row
 *   granted     → any of the user's roles grants it
 *   denied      → default
 */
export function derivePermissionRowState(a: DeriveRowStateArgs): PermissionRowState {
  const risk = getPermissionRisk(a.permissionKey);
  if (risk === "critical" && a.viewerCanManagePermissions === false) return "restricted";
  if (a.pendingKeysForUser?.has(a.permissionKey)) return "pending";
  if (a.override) return a.override.mode === "grant" ? "override_granted" : "override_denied";
  if (a.roleGrantMap && a.userRoleKeys?.length) {
    for (const role of a.userRoleKeys) {
      if (a.roleGrantMap.get(role)?.has(a.permissionKey)) return "granted";
    }
  }
  return "denied";
}

/**
 * Derive the "source of truth" chip for an effective permission.
 * Used by drawers to explain WHY the user has (or lacks) an action.
 */
export function derivePermissionSource(a: {
  permissionKey: string;
  override?: { mode: "grant" | "revoke"; expires_at?: string | null } | null;
  matchedTemplateName?: string | null;
  grantedByRole?: boolean;
  viewerCanManagePermissions?: boolean;
}): PermissionSource {
  if (a.override) {
    if (a.override.expires_at && new Date(a.override.expires_at) > new Date()) return "temporary_access";
    return "user_override";
  }
  const risk = getPermissionRisk(a.permissionKey);
  if (risk === "critical" && a.viewerCanManagePermissions === false && !a.grantedByRole) {
    return "system_restriction";
  }
  if (a.matchedTemplateName) return "role_template";
  if (a.grantedByRole) return "direct_role";
  if (isSystemDefaultPermission(a.permissionKey)) return "system_default";
  return "direct_role";
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
//   • `flagged_users.suspend`    : suspensions initiated from the Flagged
//     Users queue (contextual to a risk signal). Wired in
//     `admin-flagged-users-action`.
//   • `users_and_access.suspend` : directory-initiated suspensions from the
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