// Access Control Management service. Supabase backed.
// Model is documented in mem://architecture/service-layer.

import { supabase } from "@/integrations/supabase/client";
import {
  ACCESS_LABEL,
  ALL_PERMISSION_KEYS,
  INTERNAL_ROLES,
  PERMISSION_MODULES,
  ROLE_LABEL,
  deriveAccessLevel,
  isProtectedRole,
  isPrivilegedPermission,
  permissionsForRoles,
  validateRoleSet,
  type AccessLevel,
  type InternalRoleKey,
  type PermissionModule,
} from "./permission-catalog";

export {
  ACCESS_LABEL, ROLE_LABEL, deriveAccessLevel, isProtectedRole, validateRoleSet,
  PERMISSION_MODULES, isPrivilegedPermission, permissionsForRoles,
};
export type { AccessLevel, InternalRoleKey, PermissionModule };

export type InternalRole = InternalRoleKey;

/**
 * Client-side throttled heartbeat writer for `internal_users.last_active_at`.
 * No-op for buyers/sellers (row missing). Never throws. Presence must not
 * break the app shell.
 */
const TOUCH_KEY = "sd:internal-last-active:ts";
const TOUCH_MIN_MS = 60_000;
export async function touchInternalUserLastActive(): Promise<void> {
  try {
    const now = Date.now();
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(TOUCH_KEY) : null;
    const last = raw ? Number(raw) : 0;
    if (Number.isFinite(last) && now - last < TOUCH_MIN_MS) return;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TOUCH_KEY, String(now));
    await supabase.rpc("touch_internal_user_last_active");
  } catch {
    /* silent: presence is best-effort */
  }
}

export type InternalUserStatus =
  | "active"
  | "suspended"
  | "pending_approval"
  | "invited"
  | "locked"
  | "deactivated";

export interface InternalUser {
  id: string;
  display_id: string;
  employee_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  roles: InternalRoleKey[];
  primary_role: InternalRoleKey;
  access_level: AccessLevel;
  status: InternalUserStatus;
  last_active_at: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  department: string | null;
  team: string | null;
  job_title: string | null;
  reporting_manager_id: string | null;
  reporting_manager_name: string | null;
  reporting_manager_role: InternalRoleKey | null;
  access_expires_at: string | null;
  reason_for_access: string | null;
  invitation_status: "not_invited" | "sent" | "accepted" | "expired" | "revoked";
  permissions: string[];         // effective (union - revokes + grants)
  base_permissions: string[];    // from roles only
  grants: string[];              // explicit grants (overrides)
  revokes: string[];             // explicit revokes (overrides)
}

export interface AccessSummary {
  active_admins: number;
  admins_delta_week: number;
  active_agents: number;
  agents_delta_week: number;
  suspended_users: number;
  suspended_delta_week: number;
  full_access_users: number;
  pending_invites: number;
  pending_approvals: number;
  suspended_or_locked: number;
  privileged_users: number;
}

export type AccessFilter =
  | "all" | "admins" | "agents" | "finance"
  | "compliance" | "identity" | "auditors"
  | "suspended" | "critical"
  | "invited" | "pending_approval" | "suspended_or_locked" | "privileged";

export interface AccessDirectoryQuery {
  filter?: AccessFilter;
  q?: string;
  role?: InternalRoleKey | null;
  department?: string | null;
  status?: InternalUserStatus | null;
  access_level?: AccessLevel | null;
  sort_by?: "name" | "role" | "status" | "access_level" | "last_active";
  sort_dir?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface AccessDirectoryResponse {
  summary: AccessSummary;
  rows: InternalUser[];
  total: number;
  page: number;
  page_size: number;
  departments: string[];
}

export interface AccessAuditEntry {
  id: string;
  user_id: string;
  actor_name: string;
  action: string;
  detail: string;
  created_at: string;
  severity: "info" | "warning" | "critical";
  metadata: Record<string, unknown>;
}

export interface AccessChangeRequest {
  id: string;
  target_user_id: string;
  target_name: string | null;
  requested_by: string;
  requested_by_name: string | null;
  change_type: "role" | "permission" | "suspend" | "reactivate";
  payload: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
}

// ---------- Role classification helpers ----------

const ADMIN_ROLES: InternalRoleKey[] = ["super_admin", "senior_admin"];
const AGENT_ROLES: InternalRoleKey[] = ["dispute_manager", "dispute_agent", "support_agent"];
const FINANCE_ROLES: InternalRoleKey[] = ["finance_operator", "finance_approver"];
const COMPLIANCE_ROLES: InternalRoleKey[] = ["compliance_officer"];
const IDENTITY_ROLES: InternalRoleKey[] = ["identity_officer"];
const AUDITOR_ROLES: InternalRoleKey[] = ["auditor"];

function overlaps<T>(a: T[], b: T[]) { return a.some((x) => b.includes(x)); }

function passesFilter(u: InternalUser, f: AccessFilter): boolean {
  switch (f) {
    case "admins":     return overlaps(u.roles, ADMIN_ROLES);
    case "agents":     return overlaps(u.roles, AGENT_ROLES);
    case "finance":    return overlaps(u.roles, FINANCE_ROLES);
    case "compliance": return overlaps(u.roles, COMPLIANCE_ROLES);
    case "identity":   return overlaps(u.roles, IDENTITY_ROLES);
    case "auditors":   return overlaps(u.roles, AUDITOR_ROLES);
    case "suspended":  return u.status === "suspended";
    case "critical":   return u.access_level === "full" || u.access_level === "high";
    case "invited":            return u.status === "invited";
    case "pending_approval":   return u.status === "pending_approval";
    case "suspended_or_locked":return u.status === "suspended" || u.status === "locked";
    case "privileged":         return u.access_level === "full" || u.access_level === "high";
    case "all":
    default:           return true;
  }
}

// ---------- Directory ----------

let cachedRolePerms: Map<string, string[]> | null = null;
async function loadRolePermissions(): Promise<Map<string, string[]>> {
  if (cachedRolePerms) return cachedRolePerms;
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_key,permission_key");
  if (error) throw error;
  const map = new Map<string, string[]>();
  for (const r of data ?? []) {
    const arr = map.get(r.role_key) ?? [];
    arr.push(r.permission_key);
    map.set(r.role_key, arr);
  }
  cachedRolePerms = map;
  return map;
}

export function invalidateRolePermissionCache() { cachedRolePerms = null; }

function computeEffective(roles: string[], grants: string[], revokes: string[], rolePerms: Map<string, string[]>): {
  base: string[]; effective: string[];
} {
  const base = new Set<string>();
  for (const r of roles) for (const p of (rolePerms.get(r) ?? [])) base.add(p);
  const eff = new Set<string>(base);
  for (const g of grants) eff.add(g);
  for (const r of revokes) eff.delete(r);
  return { base: Array.from(base).sort(), effective: Array.from(eff).sort() };
}

export async function fetchAccessDirectory(q: AccessDirectoryQuery = {}): Promise<AccessDirectoryResponse> {
  const [rolePerms, usersRes, rolesRes, overridesRes, mfaRes] = await Promise.all([
    loadRolePermissions(),
    supabase.from("internal_users").select("*").order("created_at", { ascending: false }),
    supabase.from("internal_user_roles").select("user_id,role_key,is_primary"),
    supabase.from("user_permission_overrides").select("user_id,permission_key,mode"),
    // Real 2FA state, derived from the auth factor table. The
    // `internal_users.two_factor_enabled` column is a deprecated shadow flag
    // and is no longer trusted for display.
    supabase.rpc("internal_users_mfa_status"),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (rolesRes.error) throw rolesRes.error;
  if (overridesRes.error) throw overridesRes.error;

  const mfaByUser = new Map<string, boolean>();
  for (const m of ((mfaRes.data ?? []) as Array<{ user_id: string; two_factor_enabled: boolean }>)) {
    mfaByUser.set(m.user_id, !!m.two_factor_enabled);
  }

  const rolesByUser = new Map<string, { key: string; primary: boolean }[]>();
  for (const r of rolesRes.data ?? []) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push({ key: r.role_key, primary: !!r.is_primary });
    rolesByUser.set(r.user_id, arr);
  }
  const overridesByUser = new Map<string, { grants: string[]; revokes: string[] }>();
  for (const o of overridesRes.data ?? []) {
    const cur = overridesByUser.get(o.user_id) ?? { grants: [], revokes: [] };
    if (o.mode === "grant") cur.grants.push(o.permission_key);
    else cur.revokes.push(o.permission_key);
    overridesByUser.set(o.user_id, cur);
  }

  // Build a lookup so we can resolve reporting-manager metadata locally.
  const userById = new Map<string, any>();
  for (const row of (usersRes.data ?? [])) userById.set(row.id, row);

  const all: InternalUser[] = (usersRes.data ?? []).map((row): InternalUser => {
    const rr = rolesByUser.get(row.id) ?? [];
    const roles = rr.map((x) => x.key as InternalRoleKey);
    const primary = (rr.find((x) => x.primary)?.key ?? rr[0]?.key ?? "support_agent") as InternalRoleKey;
    const ov = overridesByUser.get(row.id) ?? { grants: [], revokes: [] };
    const { base, effective } = computeEffective(roles, ov.grants, ov.revokes, rolePerms);
    const managerRow = row.reporting_manager_id ? userById.get(row.reporting_manager_id) : null;
    const managerRoles = managerRow ? (rolesByUser.get(managerRow.id) ?? []) : [];
    const managerPrimary = managerRoles.find((x) => x.primary)?.key ?? managerRoles[0]?.key ?? null;
    return {
      id: row.id,
      display_id: row.display_id,
      employee_id: row.employee_id ?? row.display_id,
      full_name: row.full_name,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      email: row.email,
      avatar_url: null,
      roles,
      primary_role: primary,
      access_level: deriveAccessLevel(effective, roles),
      status: row.status as InternalUserStatus,
      last_active_at: row.last_active_at,
      two_factor_enabled: mfaByUser.get(row.id) ?? false,
      created_at: row.created_at,
      department: row.department,
      team: row.team ?? null,
      job_title: row.job_title ?? null,
      reporting_manager_id: row.reporting_manager_id ?? null,
      reporting_manager_name: managerRow?.full_name ?? null,
      reporting_manager_role: (managerPrimary as InternalRoleKey | null) ?? null,
      access_expires_at: row.access_expires_at ?? null,
      reason_for_access: row.reason_for_access ?? null,
      invitation_status: (row.invitation_status ?? "not_invited") as InternalUser["invitation_status"],
      permissions: effective,
      base_permissions: base,
      grants: ov.grants,
      revokes: ov.revokes,
    };
  });

  const filter = q.filter ?? "all";
  const search = (q.q ?? "").trim().toLowerCase();
  let rows = all
    .filter((u) => passesFilter(u, filter))
    .filter((u) => {
      if (!search) return true;
      const hay = [
        u.full_name, u.email, u.display_id, u.department ?? "",
        ...u.roles.map((r) => ROLE_LABEL[r] ?? r),
      ].join(" ").toLowerCase();
      return hay.includes(search);
    })
    .filter((u) => (q.role ? u.roles.includes(q.role) : true))
    .filter((u) => (q.department ? (u.department ?? "") === q.department : true))
    .filter((u) => (q.status ? u.status === q.status : true))
    .filter((u) => (q.access_level ? u.access_level === q.access_level : true));

  const sortBy = q.sort_by ?? "last_active";
  const dir = (q.sort_dir ?? "desc") === "asc" ? 1 : -1;
  const accessRank: Record<AccessLevel, number> = { full: 4, high: 3, standard: 2, limited: 1 };
  const statusRank: Record<InternalUserStatus, number> = {
    active: 6, invited: 5, pending_approval: 4, suspended: 3, locked: 2, deactivated: 1,
  };
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name": cmp = a.full_name.localeCompare(b.full_name); break;
      case "role": cmp = (ROLE_LABEL[a.primary_role] ?? "").localeCompare(ROLE_LABEL[b.primary_role] ?? ""); break;
      case "status": cmp = statusRank[a.status] - statusRank[b.status]; break;
      case "access_level": cmp = accessRank[a.access_level] - accessRank[b.access_level]; break;
      case "last_active":
      default: {
        const at = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
        const bt = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
        cmp = at - bt;
      }
    }
    return cmp * dir;
  });

  const total = rows.length;
  const page_size = Math.max(1, q.page_size ?? 25);
  const page = Math.max(1, q.page ?? 1);
  const start = (page - 1) * page_size;
  const pagedRows = rows.slice(start, start + page_size);

  const departments = Array.from(
    new Set(all.map((u) => u.department).filter((d): d is string => !!d)),
  ).sort();

  const summary: AccessSummary = {
    active_admins: all.filter((u) => overlaps(u.roles, ADMIN_ROLES) && u.status === "active").length,
    admins_delta_week: 0,
    active_agents: all.filter((u) => overlaps(u.roles, AGENT_ROLES) && u.status === "active").length,
    agents_delta_week: 0,
    suspended_users: all.filter((u) => u.status === "suspended").length,
    suspended_delta_week: 0,
    full_access_users: all.filter((u) => u.access_level === "full").length,
    pending_invites: all.filter((u) => u.status === "invited").length,
    pending_approvals: all.filter((u) => u.status === "pending_approval").length,
    suspended_or_locked: all.filter((u) => u.status === "suspended" || u.status === "locked").length,
    privileged_users: all.filter((u) => u.access_level === "full" || u.access_level === "high").length,
  };

  return { summary, rows: pagedRows, total, page, page_size, departments };
}

// ---------- Audit history ----------

export async function fetchAccessAudit(userId: string): Promise<AccessAuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,action,description,created_at,metadata,actor_user_id")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;

  const actorIds = Array.from(new Set((data ?? []).map((r: any) => r.actor_user_id).filter(Boolean)));
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from("profiles").select("id,full_name").in("id", actorIds);
    for (const p of profs ?? []) names.set(p.id, p.full_name ?? "Admin");
  }

  return (data ?? []).map((r: any): AccessAuditEntry => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const sev = typeof meta.severity === "string" ? meta.severity : "info";
    return {
      id: r.id,
      user_id: userId,
      actor_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? "Admin") : "System",
      action: String(meta.access_action ?? r.action ?? "action"),
      detail: String(r.description ?? ""),
      created_at: r.created_at,
      severity: (["critical", "warning", "info"].includes(sev) ? sev : "info") as AccessAuditEntry["severity"],
      metadata: meta,
    };
  });
}

// ---------- Mutations ----------

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

// ============================================================================
// Safeguard helpers: enforced client-side (mirrored by DB triggers/RLS)
// ============================================================================

async function loadUserRolesAndOverrides(userId: string): Promise<{
  roles: InternalRoleKey[];
  effective: string[];
  base: string[];
  grants: string[];
  revokes: string[];
}> {
  const [rp, r, o] = await Promise.all([
    loadRolePermissions(),
    supabase.from("internal_user_roles").select("role_key").eq("user_id", userId),
    supabase.from("user_permission_overrides").select("permission_key,mode").eq("user_id", userId),
  ]);
  const roles = ((r.data ?? []) as Array<{ role_key: string }>).map((x) => x.role_key as InternalRoleKey);
  const grants: string[] = [];
  const revokes: string[] = [];
  for (const row of (o.data ?? []) as Array<{ permission_key: string; mode: string }>) {
    if (row.mode === "grant") grants.push(row.permission_key);
    else revokes.push(row.permission_key);
  }
  const { base, effective } = computeEffective(roles, grants, revokes, rp);
  return { roles, effective, base, grants, revokes };
}

const ACCESS_RANK: Record<AccessLevel, number> = { full: 4, high: 3, standard: 2, limited: 1 };

/** Rule d: cannot remove `super_admin` from the last active holder. */
async function assertNotLastSuperAdmin(targetUserId: string, willRemoveSuperAdmin: boolean): Promise<void> {
  if (!willRemoveSuperAdmin) return;
  const { data } = await supabase
    .from("internal_user_roles")
    .select("user_id, internal_users:internal_users!inner(status)")
    .eq("role_key", "super_admin");
  const active = (data ?? []).filter((r: any) => r.internal_users?.status === "active");
  const others = active.filter((r: any) => r.user_id !== targetUserId);
  if (others.length === 0) {
    throw new Error("Cannot remove the last active Super Admin. Assign another Super Admin first.");
  }
}

/** Rules c + e: caller must outrank target, cannot self-modify privileges. */
async function assertOutranksTarget(callerId: string, targetUserId: string, action: string): Promise<void> {
  if (callerId === targetUserId) {
    throw new Error(`You cannot ${action} your own account.`);
  }
  const [me, target] = await Promise.all([
    loadUserRolesAndOverrides(callerId),
    loadUserRolesAndOverrides(targetUserId),
  ]);
  const myLevel = deriveAccessLevel(me.effective, me.roles);
  const targetLevel = deriveAccessLevel(target.effective, target.roles);
  // Super admin outranks everyone.
  if (me.roles.includes("super_admin")) return;
  if (ACCESS_RANK[targetLevel] >= ACCESS_RANK[myLevel]) {
    throw new Error(`You cannot ${action} a user whose access level is at or above yours.`);
  }
}

/** Rule b: cannot grant a permission you do not hold. */
async function assertCallerHoldsPermissions(callerId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const me = await loadUserRolesAndOverrides(callerId);
  if (me.roles.includes("super_admin")) return;
  const held = new Set(me.effective);
  const missing = keys.filter((k) => !held.has(k));
  if (missing.length > 0) {
    throw new Error(
      `You cannot grant permissions you don't hold: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`,
    );
  }
}

async function callerIsSuperAdmin(callerId: string): Promise<boolean> {
  const { data } = await supabase
    .from("internal_user_roles")
    .select("role_key")
    .eq("user_id", callerId)
    .eq("role_key", "super_admin");
  return (data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// Canonical audit writer.
// Writes ONE row to `admin_actions` using a real `admin_action_type` when the
// value is one of the new lifecycle enums (see 20260725 migration), and
// mirrors a human-readable copy to `audit_logs` so the existing timeline UI
// (which currently reads from `audit_logs`) keeps working during the
// transition to the edge-function pipeline described in the plan.
// ---------------------------------------------------------------------------
const CANONICAL_ADMIN_ACTIONS: ReadonlySet<string> = new Set([
  "user_invited","invitation_resent","user_activated",
  "role_assigned","role_changed",
  "permission_override_requested","permission_override_approved","permission_override_rejected",
  "role_change_approved","role_change_rejected",
  "user_reactivated","user_deactivated",
  "session_revoked","task_reassigned",
  "suspend_user","unsuspend_user","add_internal_note",
]);

// Map internal "access_*" action names used across this service to real
// admin_action_type enum values so the unified edge-function logger accepts
// them. Anything not mapped falls back to add_internal_note.
const ACTION_ALIAS: Record<string, string> = {
  access_role_change_requested: "role_change_approved",     // requested-for-approval → tracked separately below
  access_roles_updated: "role_changed",
  access_permissions_updated: "permission_override_approved",
  access_permission_override_requested: "permission_override_requested",
  access_user_suspended: "suspend_user",
  access_user_reactivated: "user_reactivated",
  access_user_deactivated: "user_deactivated",
  access_invite_resent: "invitation_resent",
  access_change_approved: "role_change_approved",
  access_change_rejected: "role_change_rejected",
};

function canonicalActionType(raw: string): string {
  if (CANONICAL_ADMIN_ACTIONS.has(raw)) return raw;
  if (ACTION_ALIAS[raw]) return ACTION_ALIAS[raw];
  return "add_internal_note";
}

interface AuditWriteOpts {
  target_user_id: string;
  action_type: string;
  description: string;
  severity?: "info" | "warning" | "critical";
  before?: unknown;
  after?: unknown;
  reason?: string;
  approval_reference?: string | null;
  metadata?: Record<string, unknown>;
  result?: "success" | "blocked_by_safeguard" | "failed";
  entity_ref?: string | null;
}

async function auditLog(
  target_user_id: string,
  action_type: string,
  description: string,
  severity: "info" | "warning" | "critical" = "info",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  return writeAudit({ target_user_id, action_type, description, severity, metadata });
}

async function writeAudit(opts: AuditWriteOpts): Promise<void> {
  const canonical = canonicalActionType(opts.action_type);
  const payload = {
    target_user_id: opts.target_user_id,
    action_type: canonical,
    description: opts.description,
    reason: opts.reason ?? (opts.metadata?.reason as string | undefined) ?? null,
    before: opts.before ?? opts.metadata?.before ?? null,
    after: opts.after ?? opts.metadata?.after ?? null,
    approval_reference: opts.approval_reference ?? (opts.metadata?.request_id as string | undefined) ?? null,
    result: opts.result ?? "success",
    entity_ref: opts.entity_ref ?? `internal_users:${opts.target_user_id}`,
    metadata: {
      ...opts.metadata,
      raw_action: opts.action_type,
      severity: opts.severity ?? "info",
    },
    mirror: true,
  };

  // Preferred path: edge function captures IP + User-Agent server-side.
  try {
    const { error } = await supabase.functions.invoke("admin-log-access-action", { body: payload });
    if (!error) return;
  } catch {
    /* fall through to client-side best-effort write */
  }

  // Fallback: direct writes so the timeline never loses an event if the
  // edge function is unreachable.
  try {
    const uid = await currentUserId();
    const bodyPayload = {
      reason: opts.reason ?? (opts.metadata?.reason as string | undefined) ?? null,
      before: opts.before ?? opts.metadata?.before ?? null,
      after: opts.after ?? opts.metadata?.after ?? null,
      approval_reference: opts.approval_reference ?? null,
      severity: opts.severity ?? "info",
      description: opts.description,
      ...opts.metadata,
    };
    await supabase.from("admin_actions").insert({
      admin_user_id: uid,
      target_user_id: opts.target_user_id,
      action_type: canonical as any,
      action_notes: JSON.stringify(bodyPayload),
    } as any);
    await supabase.from("audit_logs").insert({
      actor_user_id: uid,
      target_user_id: opts.target_user_id,
      action: "admin_internal_note",
      description: `[${opts.action_type}] ${opts.description}`,
      metadata: { ...bodyPayload, access_action: opts.action_type },
    } as any);
  } catch {
    /* audit best-effort */
  }
}

// Typed safeguard error so callers/UI can render inline hints.
export class AccessSafeguardError extends Error {
  code: string;
  rule: "a"|"b"|"c"|"d"|"e"|"f"|"g"|"h";
  constructor(rule: AccessSafeguardError["rule"], code: string, message: string) {
    super(message);
    this.name = "AccessSafeguardError";
    this.code = code;
    this.rule = rule;
  }
}

/**
 * Rule g: Finance-touching permission changes cannot be approved by the same
 * operator that raised them, regardless of role. Called from
 * `reviewAccessChangeRequest` after the requester ≠ reviewer check.
 */
function assertFinanceParanoidCheck(
  req: { requested_by: string; change_type: string; payload: any },
  reviewerId: string,
): void {
  if (req.change_type !== "permission") return;
  const key = String(req.payload?.permission_key ?? "");
  const finance =
    key.startsWith("finance_") ||
    key.startsWith("payouts.") ||
    key.startsWith("refunds.") ||
    key.startsWith("escrow.release");
  if (finance && reviewerId === req.requested_by) {
    throw new AccessSafeguardError(
      "g",
      "E_FINANCE_SELF_APPROVAL",
      "Financial permission changes cannot be approved by the same person that raised them.",
    );
  }
}

export interface UpdateRolesInput {
  user_id: string;
  roles: InternalRoleKey[];
  primary_role: InternalRoleKey;
  reason: string;
}

/**
 * Replaces a user's role set. If any of the added/removed roles is protected
 * and the caller isn't super_admin, this queues an access_change_request
 * instead of applying immediately.
 */
export async function updateUserRoles(input: UpdateRolesInput): Promise<{ applied: boolean; request_id?: string }> {
  const check = validateRoleSet(input.roles);
  if (!check.ok) throw new Error(check.error);
  if (!input.roles.includes(input.primary_role)) {
    throw new Error("Primary role must be one of the assigned roles.");
  }
  const requester = await currentUserId();
  if (!input.reason?.trim()) throw new Error("A reason is required for role changes.");
  await assertOutranksTarget(requester, input.user_id, "change roles for");

  // Read current state
  const { data: current, error: curErr } = await supabase
    .from("internal_user_roles")
    .select("role_key,is_primary")
    .eq("user_id", input.user_id);
  if (curErr) throw curErr;

  const before = new Set((current ?? []).map((r: any) => r.role_key));
  const after = new Set(input.roles);
  const added = [...after].filter((r) => !before.has(r));
  const removed = [...before].filter((r) => !after.has(r));
  const hasProtected = [...added, ...removed].some(isProtectedRole);
  const willRemoveSuperAdmin = before.has("super_admin") && !after.has("super_admin");
  await assertNotLastSuperAdmin(input.user_id, willRemoveSuperAdmin);

  // Rule b: cannot elevate to a role you don't hold at least equivalent to.
  const addedProtected = added.filter(isProtectedRole);
  if (addedProtected.length > 0) {
    const isSuper = await callerIsSuperAdmin(requester);
    if (!isSuper) {
      // handled via approval queue below (existing behaviour)
    }
  }

  // If protected and caller isn't super_admin, queue for approval
  const { data: myRoles } = await supabase
    .from("internal_user_roles")
    .select("role_key")
    .eq("user_id", requester);
  const isSuper = (myRoles ?? []).some((r: any) => r.role_key === "super_admin");

  if (hasProtected && !isSuper) {
    const { data: req, error: reqErr } = await supabase
      .from("access_change_requests")
      .insert({
        target_user_id: input.user_id,
        requested_by: requester,
        change_type: "role",
        payload: { roles: input.roles, primary_role: input.primary_role },
        reason: input.reason,
      })
      .select("id")
      .single();
    if (reqErr) throw reqErr;
    await auditLog(input.user_id, "access_role_change_requested",
      `Role change queued for approval (added: ${added.join(", ") || "—"}, removed: ${removed.join(", ") || "—"})`,
      "warning", { request_id: req.id });
    return { applied: false, request_id: req.id };
  }

  // Apply atomically-ish: delete removed, upsert kept, ensure single primary
  if (removed.length) {
    const { error } = await supabase
      .from("internal_user_roles")
      .delete()
      .eq("user_id", input.user_id)
      .in("role_key", removed);
    if (error) throw error;
  }

  // Clear existing primary, then insert/update rows for the new set
  await supabase.from("internal_user_roles")
    .update({ is_primary: false })
    .eq("user_id", input.user_id);

  for (const role of input.roles) {
    const { error } = await supabase
      .from("internal_user_roles")
      .upsert({
        user_id: input.user_id,
        role_key: role,
        is_primary: role === input.primary_role,
        assigned_by: requester,
      }, { onConflict: "user_id,role_key" });
    if (error) throw error;
  }

  await auditLog(input.user_id, "access_roles_updated",
    `Roles updated (added: ${added.join(", ") || "—"}, removed: ${removed.join(", ") || "—"}, primary: ${input.primary_role})`,
    hasProtected ? "warning" : "info",
    { before: [...before], after: [...after], primary: input.primary_role, reason: input.reason });
  return { applied: true };
}

export interface UpdatePermissionsInput {
  user_id: string;
  grants: string[];
  revokes: string[];
  reason: string;
}

export async function updatePermissionOverrides(input: UpdatePermissionsInput): Promise<void> {
  const invalid = [...input.grants, ...input.revokes].filter((k) => !ALL_PERMISSION_KEYS.includes(k));
  if (invalid.length) throw new Error(`Unknown permission keys: ${invalid.join(", ")}`);
  const requester = await currentUserId();
  if (!input.reason?.trim()) throw new Error("A reason is required for permission overrides.");
  await assertOutranksTarget(requester, input.user_id, "change permissions for");
  await assertCallerHoldsPermissions(requester, input.grants);

  const { error: delErr } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", input.user_id);
  if (delErr) throw delErr;

  const rows = [
    ...input.grants.map((k) => ({ user_id: input.user_id, permission_key: k, mode: "grant", reason: input.reason, granted_by: requester })),
    ...input.revokes.map((k) => ({ user_id: input.user_id, permission_key: k, mode: "revoke", reason: input.reason, granted_by: requester })),
  ];
  if (rows.length) {
    const { error } = await supabase.from("user_permission_overrides").insert(rows);
    if (error) throw error;
  }
  await auditLog(input.user_id, "access_permissions_updated",
    `Permission overrides updated (${input.grants.length} grants / ${input.revokes.length} revokes)`,
    "warning", { grants: input.grants, revokes: input.revokes, reason: input.reason });
}

export interface SuspendInput { user_id: string; reason: string; }

export async function suspendInternalUser(input: SuspendInput): Promise<void> {
  const requester = await currentUserId();
  if (!input.reason?.trim()) throw new Error("A reason is required to suspend a user.");
  await assertOutranksTarget(requester, input.user_id, "suspend");
  // Rule d: protect the last super admin.
  const target = await loadUserRolesAndOverrides(input.user_id);
  await assertNotLastSuperAdmin(input.user_id, target.roles.includes("super_admin"));
  const { error } = await supabase
    .from("internal_users")
    .update({ status: "suspended" })
    .eq("id", input.user_id);
  if (error) throw error;
  await auditLog(input.user_id, "access_user_suspended", `Suspended: ${input.reason}`, "critical", { reason: input.reason });
}

export async function reactivateInternalUser(input: SuspendInput): Promise<void> {
  const requester = await currentUserId();
  if (!input.reason?.trim()) throw new Error("A reason is required to reactivate a user.");
  await assertOutranksTarget(requester, input.user_id, "reactivate");
  const { error } = await supabase
    .from("internal_users")
    .update({ status: "active" })
    .eq("id", input.user_id);
  if (error) throw error;
  await auditLog(input.user_id, "access_user_reactivated", `Reactivated: ${input.reason}`, "info", { reason: input.reason });
}

export async function deactivateInternalUser(input: SuspendInput): Promise<void> {
  const requester = await currentUserId();
  if (!input.reason?.trim()) throw new Error("A reason is required to deactivate a user.");
  await assertOutranksTarget(requester, input.user_id, "deactivate");
  const target = await loadUserRolesAndOverrides(input.user_id);
  await assertNotLastSuperAdmin(input.user_id, target.roles.includes("super_admin"));
  const { error } = await supabase
    .from("internal_users")
    .update({ status: "deactivated" })
    .eq("id", input.user_id);
  if (error) throw error;
  await auditLog(input.user_id, "access_user_deactivated",
    `Deactivated (retained for audit): ${input.reason}`, "critical", { reason: input.reason });
}

export async function resendInternalUserInvite(input: { user_id: string; email: string; full_name: string; }): Promise<void> {
  try {
    await supabase.functions.invoke("admin-invite-internal-user", {
      body: { ...input, resend: true },
    });
  } catch {
    /* best-effort: still audit */
  }
  await auditLog(input.user_id, "access_invite_resent",
    `Resent invitation to ${input.email}`, "info", { email: input.email });
}

// Hard-delete an invited (or already-deactivated) internal user. The edge
// function guards status so audit rows for previously-active users can't be
// erased: those must go through deactivateInternalUser instead.
export async function deleteInvitedInternalUser(input: { user_id: string; reason: string; }): Promise<void> {
  if (!input.reason?.trim()) throw new Error("A reason is required to delete a user.");
  const { data, error } = await supabase.functions.invoke("admin-delete-internal-user", {
    body: { user_id: input.user_id, reason: input.reason },
  });
  if (error) {
    // Surface the edge function's structured error body when available.
    const anyErr = error as { context?: { text?: () => Promise<string> } };
    let detail = error.message;
    try {
      if (anyErr.context?.text) {
        const txt = await anyErr.context.text();
        const parsed = JSON.parse(txt);
        detail = parsed.detail ?? parsed.error ?? detail;
      }
    } catch { /* keep default */ }
    throw new Error(detail);
  }
  return data as any;
}

// Extend or reset access_expires_at for an existing internal user. Written
// as a permission override so it appears in the same audit timeline as other
// access-scope changes.
export async function extendInternalUserAccess(input: {
  user_id: string;
  new_expires_at: string | null; // ISO string; null clears the expiry
  reason: string;
}): Promise<void> {
  if (!input.reason?.trim()) throw new Error("A reason is required to extend access.");
  const { data: before, error: loadErr } = await supabase
    .from("internal_users")
    .select("access_expires_at, status")
    .eq("id", input.user_id)
    .maybeSingle();
  if (loadErr) throw loadErr;
  const previous = before?.access_expires_at ?? null;

  const { error } = await supabase
    .from("internal_users")
    .update({ access_expires_at: input.new_expires_at })
    .eq("id", input.user_id);
  if (error) throw error;

  await auditLog(
    input.user_id,
    "access_permissions_updated",
    input.new_expires_at
      ? `Access expiry extended to ${new Date(input.new_expires_at).toLocaleDateString()}`
      : "Access expiry cleared (no expiration)",
    "warning",
    {
      reason: input.reason,
      field: "access_expires_at",
      before: previous,
      after: input.new_expires_at,
    },
  );
}

// ---------- Role diff helpers ----------

/**
 * Returns the union of permissions a given role set would grant, using the
 * cached `role_permissions` map.
 */
export async function fetchPermissionsForRoles(roles: string[]): Promise<string[]> {
  const map = await loadRolePermissions();
  return permissionsForRoles(roles, map);
}

export interface RoleChangeDiff {
  added: string[];
  removed: string[];
  privilegedIntroduced: string[];
  unavailableModules: { key: string; label: string }[];
  newAccessLevel: AccessLevel;
  requiresApproval: boolean;
}

export async function computeRoleChangeDiff(
  user: Pick<InternalUser, "base_permissions" | "roles">,
  nextRoles: InternalRoleKey[],
): Promise<RoleChangeDiff> {
  const nextBase = await fetchPermissionsForRoles(nextRoles);
  const prev = new Set(user.base_permissions);
  const next = new Set(nextBase);
  const added = [...next].filter((p) => !prev.has(p)).sort();
  const removed = [...prev].filter((p) => !next.has(p)).sort();
  const privilegedIntroduced = added.filter(isPrivilegedPermission);
  const prevModules = new Set([...prev].map((p) => p.split(".")[0]));
  const nextModules = new Set([...next].map((p) => p.split(".")[0]));
  const unavailable = [...prevModules].filter((m) => !nextModules.has(m));
  const moduleLabel = new Map(PERMISSION_MODULES.map((m) => [m.key, m.label]));
  const unavailableModules = unavailable.map((k) => ({ key: k, label: moduleLabel.get(k) ?? k }));
  const newAccessLevel = deriveAccessLevel(nextBase, nextRoles);
  const requiresApproval =
    nextRoles.some(isProtectedRole) ||
    newAccessLevel === "full" || newAccessLevel === "high" ||
    privilegedIntroduced.length > 0;
  return { added, removed, privilegedIntroduced, unavailableModules, newAccessLevel, requiresApproval };
}

// ---------- Change-role: submit-for-approval ----------

export interface SubmitRoleChangeInput {
  user_id: string;
  roles: InternalRoleKey[];
  primary_role: InternalRoleKey;
  effective_at: string;   // ISO
  expires_at: string | null;
  reason: string;
}

export async function submitRoleChangeRequest(input: SubmitRoleChangeInput): Promise<{ request_id: string }> {
  const check = validateRoleSet(input.roles);
  if (!check.ok) throw new Error(check.error);
  if (!input.roles.includes(input.primary_role)) {
    throw new Error("Primary role must be one of the assigned roles.");
  }
  const requester = await currentUserId();
  // Rule h: reason required.
  if (!input.reason?.trim()) throw new Error("A reason is required to submit a role change request.");
  // Rule c: must outrank the target even to raise.
  await assertOutranksTarget(requester, input.user_id, "raise role change for");
  const { data, error } = await supabase
    .from("access_change_requests")
    .insert({
      target_user_id: input.user_id,
      requested_by: requester,
      change_type: "role",
      payload: {
        roles: input.roles,
        primary_role: input.primary_role,
        effective_at: input.effective_at,
        expires_at: input.expires_at,
      },
      reason: input.reason,
    })
    .select("id")
    .single();
  if (error) throw error;
  await auditLog(input.user_id, "access_role_change_requested",
    `Role change submitted for approval (${input.roles.join(", ")})`,
    "warning", { request_id: data.id, reason: input.reason });
  return { request_id: data.id };
}

// ---------- Permission overrides: individual request flow ----------

export interface OverrideDetail {
  permission_key: string;
  mode: "grant" | "revoke";
  reason: string;
  granted_by: string | null;
  granted_by_name: string | null;
  granted_at: string;
  expires_at: string | null;
}

export async function fetchUserOverrides(user_id: string): Promise<OverrideDetail[]> {
  const { data, error } = await supabase
    .from("user_permission_overrides")
    .select("permission_key, mode, reason, granted_by, granted_at")
    .eq("user_id", user_id);
  if (error) throw error;
  const rows = data ?? [];
  const actorIds = Array.from(new Set(rows.map((r: any) => r.granted_by).filter(Boolean)));
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", actorIds);
    for (const p of profs ?? []) names.set(p.id, p.full_name ?? "");
    const { data: ius } = await supabase.from("internal_users").select("id,full_name").in("id", actorIds);
    for (const p of ius ?? []) names.set(p.id, p.full_name ?? "");
  }
  return rows.map((r: any): OverrideDetail => ({
    permission_key: r.permission_key,
    mode: r.mode,
    reason: r.reason,
    granted_by: r.granted_by,
    granted_by_name: r.granted_by ? names.get(r.granted_by) ?? "Admin" : null,
    granted_at: r.granted_at,
    expires_at: null,   // schema does not yet track expiry; reserved for future
  }));
}

export async function fetchPendingRequestsForUser(user_id: string): Promise<AccessChangeRequest[]> {
  const all = await listAccessChangeRequests("pending");
  return all.filter((r) => r.target_user_id === user_id);
}

export interface RequestOverrideInput {
  user_id: string;
  permission_key: string;
  mode: "grant" | "revoke";
  expires_at: string | null;
  reason: string;
}

export async function requestPermissionOverride(input: RequestOverrideInput): Promise<{ request_id: string }> {
  if (!ALL_PERMISSION_KEYS.includes(input.permission_key)) {
    throw new Error(`Unknown permission key: ${input.permission_key}`);
  }
  const requester = await currentUserId();
  // Rule h: reason required.
  if (!input.reason?.trim()) throw new Error("A reason is required to request a permission override.");
  // Rule c: must outrank the target.
  await assertOutranksTarget(requester, input.user_id, "raise permission override for");
  // Rule b: grantor must hold the permission being granted.
  if (input.mode === "grant") {
    await assertCallerHoldsPermissions(requester, [input.permission_key]);
  }
  // Rule e: cannot request an override on your own account.
  if (input.user_id === requester) {
    throw new AccessSafeguardError("e", "E_SELF_ESCALATION", "You cannot request permission overrides on your own account.");
  }
  const { data, error } = await supabase
    .from("access_change_requests")
    .insert({
      target_user_id: input.user_id,
      requested_by: requester,
      change_type: "permission",
      payload: {
        permission_key: input.permission_key,
        mode: input.mode,
        expires_at: input.expires_at,
      },
      reason: input.reason,
    })
    .select("id")
    .single();
  if (error) throw error;
  await auditLog(input.user_id, "access_permission_override_requested",
    `Requested ${input.mode} of ${input.permission_key}`,
    "warning", { request_id: data.id, ...input });
  return { request_id: data.id };
}

// ---------------------------------------------------------------------------
// requiresApproval: single decision point for direct-apply vs. queue.
// Kept as a pure helper so drawers, tests, and services all agree.
// ---------------------------------------------------------------------------
export type ApprovalAction =
  | { type: "role_change"; nextRoles: InternalRoleKey[]; primaryRole: InternalRoleKey; currentRoles: InternalRoleKey[] }
  | { type: "permission_override"; key: string; mode: "grant" | "revoke" }
  | { type: "suspend"; targetRoles: InternalRoleKey[] }
  | { type: "deactivate"; targetRoles: InternalRoleKey[] }
  | { type: "reactivate" };

export function requiresApproval(action: ApprovalAction, callerIsSuper: boolean): boolean {
  if (callerIsSuper) return false;
  switch (action.type) {
    case "role_change": {
      const changed = new Set<string>([...action.nextRoles, ...action.currentRoles]);
      return [...changed].some(isProtectedRole);
    }
    case "permission_override":
      return isPrivilegedPermission(action.key);
    case "suspend":
    case "deactivate":
      return action.targetRoles.some(isProtectedRole);
    case "reactivate":
      return false;
  }
}

// ---------------------------------------------------------------------------
// previewRequestSafeguards: evaluates rules a–g against a pending request
// so the Review Drawer can disable Approve and surface the failing rule
// before calling the mutation.
// ---------------------------------------------------------------------------
export interface SafeguardCheck {
  rule: "a" | "b" | "c" | "d" | "e" | "f" | "g";
  level: "block" | "warn";
  code: string;
  message: string;
}

export async function previewRequestSafeguards(req: AccessChangeRequest): Promise<SafeguardCheck[]> {
  const findings: SafeguardCheck[] = [];
  const reviewer = await currentUserId();

  // a: requester != approver
  if (req.requested_by === reviewer) {
    findings.push({ rule: "a", level: "block", code: "E_SELF_APPROVAL", message: "You cannot approve your own request." });
  }

  // g: finance paranoid check (independent of role)
  try {
    assertFinanceParanoidCheck(
      { requested_by: req.requested_by, change_type: req.change_type, payload: req.payload },
      reviewer,
    );
  } catch (e) {
    if (e instanceof AccessSafeguardError) {
      findings.push({ rule: "g", level: "block", code: e.code, message: e.message });
    }
  }

  // c: outrank check
  try {
    await assertOutranksTarget(reviewer, req.target_user_id, "approve changes for");
  } catch (e) {
    findings.push({ rule: "c", level: "block", code: "E_OUTRANK", message: (e as Error).message });
  }

  if (req.change_type === "role") {
    const payload = req.payload as { roles: InternalRoleKey[] };
    const target = await loadUserRolesAndOverrides(req.target_user_id);
    const willRemoveSuperAdmin = target.roles.includes("super_admin") && !payload.roles.includes("super_admin");
    if (willRemoveSuperAdmin) {
      try {
        await assertNotLastSuperAdmin(req.target_user_id, true);
      } catch (e) {
        findings.push({ rule: "d", level: "block", code: "E_LAST_SUPER_ADMIN", message: (e as Error).message });
      }
    }
  } else if (req.change_type === "permission") {
    const payload = req.payload as { permission_key: string; mode: "grant" | "revoke" };
    if (payload.mode === "grant") {
      try {
        await assertCallerHoldsPermissions(reviewer, [payload.permission_key]);
      } catch (e) {
        findings.push({ rule: "b", level: "block", code: "E_GRANT_UNHELD", message: (e as Error).message });
      }
    }
  } else if (req.change_type === "suspend") {
    const target = await loadUserRolesAndOverrides(req.target_user_id);
    if (target.roles.includes("super_admin")) {
      try {
        await assertNotLastSuperAdmin(req.target_user_id, true);
      } catch (e) {
        findings.push({ rule: "d", level: "block", code: "E_LAST_SUPER_ADMIN", message: (e as Error).message });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Before/after diff resolver for a pending request. Powers the diff panel.
// ---------------------------------------------------------------------------
export interface RequestDiff {
  label: string;
  before: string[];
  after: string[];
  added: string[];
  removed: string[];
}

export async function fetchRequestDiff(req: AccessChangeRequest): Promise<RequestDiff> {
  if (req.change_type === "role") {
    const payload = req.payload as { roles: InternalRoleKey[] };
    const target = await loadUserRolesAndOverrides(req.target_user_id);
    const before = target.roles.slice().sort();
    const after = payload.roles.slice().sort();
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    return {
      label: "Roles",
      before: before.map((r) => ROLE_LABEL[r] ?? r),
      after: after.map((r) => ROLE_LABEL[r] ?? r),
      added: [...afterSet].filter((r) => !beforeSet.has(r)).map((r) => ROLE_LABEL[r] ?? r),
      removed: [...beforeSet].filter((r) => !afterSet.has(r)).map((r) => ROLE_LABEL[r] ?? r),
    };
  }
  if (req.change_type === "permission") {
    const payload = req.payload as { permission_key: string; mode: "grant" | "revoke" };
    const target = await loadUserRolesAndOverrides(req.target_user_id);
    const before = target.effective.slice().sort();
    const key = payload.permission_key;
    const after = payload.mode === "grant"
      ? [...new Set([...before, key])].sort()
      : before.filter((k) => k !== key);
    return {
      label: "Permissions",
      before,
      after,
      added: payload.mode === "grant" ? [key] : [],
      removed: payload.mode === "revoke" ? [key] : [],
    };
  }
  const { data: statusRow } = await supabase
    .from("internal_users")
    .select("status")
    .eq("id", req.target_user_id)
    .maybeSingle();
  const beforeStatus = (statusRow?.status as string | undefined) ?? "unknown";
  const afterStatus = req.change_type === "suspend" ? "suspended" : "active";
  return {
    label: "Account status",
    before: [beforeStatus],
    after: [afterStatus],
    added: [afterStatus],
    removed: [beforeStatus],
  };
}

// ---------- Suspend (rich): sessions + audit ----------

export async function fetchActiveSessionCount(user_id: string): Promise<number> {
  const { count, error } = await supabase
    .from("user_sessions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("is_active", true)
    .is("revoked_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function fetchReassignmentTargets(excludeUserId: string): Promise<Array<{ id: string; full_name: string; role: InternalRoleKey | null }>> {
  const [usersRes, rolesRes] = await Promise.all([
    supabase.from("internal_users").select("id,full_name,status").eq("status", "active"),
    supabase.from("internal_user_roles").select("user_id,role_key,is_primary"),
  ]);
  if (usersRes.error) return [];
  const primaryByUser = new Map<string, InternalRoleKey>();
  const rolesByUser = new Map<string, InternalRoleKey[]>();
  for (const r of rolesRes.data ?? []) {
    if (r.is_primary) primaryByUser.set(r.user_id, r.role_key as InternalRoleKey);
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.role_key as InternalRoleKey);
    rolesByUser.set(r.user_id, arr);
  }
  const ELIGIBLE: InternalRoleKey[] = ["dispute_manager", "dispute_agent"];
  return (usersRes.data ?? [])
    .filter((u: any) => u.id !== excludeUserId)
    .filter((u: any) => (rolesByUser.get(u.id) ?? []).some((r) => ELIGIBLE.includes(r)))
    .map((u: any) => ({
      id: u.id as string,
      full_name: u.full_name as string,
      role: primaryByUser.get(u.id) ?? null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export interface SuspendAtomicInput {
  user_id: string;
  reason: string;
  duration: "indefinite" | { until: string };
  revoke_sessions: boolean;
  reassign_tasks: boolean;
  reassign_target_id: string | null;
}

export async function suspendUserAtomic(input: SuspendAtomicInput): Promise<{ revoked_sessions: number }> {
  const requester = await currentUserId();
  if (!input.reason?.trim()) throw new Error("A reason is required to suspend a user.");
  await assertOutranksTarget(requester, input.user_id, "suspend");
  const target = await loadUserRolesAndOverrides(input.user_id);
  await assertNotLastSuperAdmin(input.user_id, target.roles.includes("super_admin"));
  const { error } = await supabase
    .from("internal_users")
    .update({ status: "suspended" })
    .eq("id", input.user_id);
  if (error) throw error;

  let revoked = 0;
  if (input.revoke_sessions) {
    const { data, error: sErr } = await supabase
      .from("user_sessions")
      .update({ is_active: false, revoked_at: new Date().toISOString(), revoke_reason: "user_suspended" })
      .eq("user_id", input.user_id)
      .eq("is_active", true)
      .is("revoked_at", null)
      .select("id");
    if (!sErr) revoked = data?.length ?? 0;
  }

  await auditLog(input.user_id, "access_user_suspended",
    `Suspended: ${input.reason}`,
    "critical",
    {
      reason: input.reason,
      duration: input.duration,
      revoked_sessions: revoked,
      reassign_tasks: input.reassign_tasks,
      reassign_target_id: input.reassign_target_id,
    });

  return { revoked_sessions: revoked };
}

export interface InviteUserInput {
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  roles: InternalRoleKey[];
  primary_role: InternalRoleKey;
  department: string;
  team?: string;
  job_title?: string;
  reporting_manager_id?: string | null;
  access_expires_at?: string | null;
  reason?: string;
  send_invitation?: boolean;
  require_2fa: boolean;
}

/** Simple RFC-5321-ish email format check for client-side validation. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInviteInput(input: Partial<InviteUserInput>): { ok: true } | { ok: false; error: string } {
  const email = (input.email ?? "").trim();
  if (!input.first_name?.trim()) return { ok: false, error: "First name is required." };
  if (!input.last_name?.trim())  return { ok: false, error: "Last name is required." };
  if (!email)                    return { ok: false, error: "Work email is required." };
  if (!EMAIL_RE.test(email))     return { ok: false, error: "Enter a valid work email." };
  if (!input.department)         return { ok: false, error: "Department is required." };
  if (!input.primary_role)       return { ok: false, error: "Primary role is required." };
  const roles = input.roles ?? [];
  const check = validateRoleSet(roles);
  if (!check.ok) return { ok: false, error: check.error ?? "Invalid role selection." };
  const requiresApproval = roles.some(isProtectedRole);
  if (requiresApproval && !input.reason?.trim()) {
    return { ok: false, error: "A reason is required for privileged roles." };
  }
  return { ok: true };
}

/** Returns true when the email is already in use by an internal user. */
export async function checkEmailAvailability(email: string): Promise<{ available: boolean }> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { available: true };
  const { data, error } = await supabase
    .from("internal_users")
    .select("id")
    .ilike("email", clean)
    .limit(1);
  if (error) return { available: true };
  return { available: (data?.length ?? 0) === 0 };
}

/** Reporting-manager options: admin-tier active users only. */
export async function fetchReportingManagerOptions(): Promise<Array<{
  id: string; full_name: string; role: InternalRoleKey | null;
}>> {
  const [usersRes, rolesRes] = await Promise.all([
    supabase.from("internal_users").select("id,full_name,status").eq("status", "active"),
    supabase.from("internal_user_roles").select("user_id,role_key,is_primary"),
  ]);
  if (usersRes.error) return [];
  const primaryByUser = new Map<string, InternalRoleKey>();
  for (const r of rolesRes.data ?? []) {
    if (r.is_primary) primaryByUser.set(r.user_id, r.role_key as InternalRoleKey);
  }
  const ADMIN_TIER: InternalRoleKey[] = [
    "super_admin", "senior_admin", "dispute_manager", "finance_approver", "compliance_officer",
  ];
  return (usersRes.data ?? [])
    .map((u: any) => ({
      id: u.id as string,
      full_name: u.full_name as string,
      role: primaryByUser.get(u.id) ?? null,
    }))
    .filter((u) => !u.role || ADMIN_TIER.includes(u.role))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function inviteInternalUser(input: InviteUserInput): Promise<InternalUser> {
  const check = validateRoleSet(input.roles);
  if (!check.ok) throw new Error(check.error);
  const { data, error } = await supabase.functions.invoke("admin-invite-internal-user", { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  const user = data.user as InternalUser;
  // Attach the email delivery outcome so the UI can adapt its toast.
  (user as any).__email_channel = data.email_channel ?? "resend";
  (user as any).__email_error = data.email_error ?? null;
  return user;
}

// ---------- Access change requests ----------

export async function listAccessChangeRequests(
  status: "pending" | "approved" | "rejected" | "cancelled" | "all" = "pending",
): Promise<AccessChangeRequest[]> {
  const q = supabase
    .from("access_change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const { data, error } = status === "all" ? await q : await q.eq("status", status);
  if (error) throw error;

  const rows = data ?? [];
  const ids = Array.from(new Set(rows.flatMap((r: any) => [r.requested_by, r.target_user_id]).filter(Boolean)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
    for (const p of profs ?? []) names.set(p.id, p.full_name ?? "");
    const { data: ius } = await supabase.from("internal_users").select("id,full_name").in("id", ids);
    for (const p of ius ?? []) names.set(p.id, p.full_name ?? "");
  }

  return rows.map((r: any): AccessChangeRequest => ({
    id: r.id,
    target_user_id: r.target_user_id,
    target_name: names.get(r.target_user_id) ?? null,
    requested_by: r.requested_by,
    requested_by_name: names.get(r.requested_by) ?? null,
    change_type: r.change_type,
    payload: r.payload ?? {},
    reason: r.reason,
    status: r.status,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    review_reason: r.review_reason,
    created_at: r.created_at,
  }));
}

export async function reviewAccessChangeRequest(id: string, decision: "approve" | "reject", reason: string): Promise<void> {
  const requester = await currentUserId();
  if (!reason?.trim()) throw new Error("A reason is required to review this request.");
  const { data: req, error: fetchErr } = await supabase
    .from("access_change_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;
  if (req.status !== "pending") throw new Error("Request already reviewed.");
  if (req.requested_by === requester) throw new Error("You cannot approve your own request.");

  // Rule g: paranoid double check for finance-touching changes even when
  // the reviewer is a super admin.
  assertFinanceParanoidCheck(
    { requested_by: req.requested_by, change_type: req.change_type, payload: req.payload },
    requester,
  );

  // Safeguards must hold at approval time. The world may have changed
  // since the request was raised.
  if (decision === "approve") {
    await assertOutranksTarget(requester, req.target_user_id, "approve changes for");
    if (req.change_type === "role") {
      const payload = req.payload as { roles: InternalRoleKey[] };
      const target = await loadUserRolesAndOverrides(req.target_user_id);
      const willRemoveSuperAdmin = target.roles.includes("super_admin") && !payload.roles.includes("super_admin");
      await assertNotLastSuperAdmin(req.target_user_id, willRemoveSuperAdmin);
    } else if (req.change_type === "permission") {
      const payload = req.payload as { permission_key: string; mode: "grant" | "revoke" };
      if (payload.mode === "grant") {
        await assertCallerHoldsPermissions(requester, [payload.permission_key]);
      }
    }
  }

  const nextStatus = decision === "approve" ? "approved" : "rejected";
  const { error: updErr } = await supabase
    .from("access_change_requests")
    .update({ status: nextStatus, reviewed_by: requester, reviewed_at: new Date().toISOString(), review_reason: reason })
    .eq("id", id);
  if (updErr) throw updErr;

  if (decision === "approve") {
    if (req.change_type === "role") {
      const payload = req.payload as { roles: InternalRoleKey[]; primary_role: InternalRoleKey };
      // Apply role change directly (bypass the queue. Approver is authorised).
      const target = await loadUserRolesAndOverrides(req.target_user_id);
      const before = new Set(target.roles);
      const after = new Set(payload.roles);
      const removed = [...before].filter((r) => !after.has(r));
      if (removed.length) {
        await supabase.from("internal_user_roles")
          .delete()
          .eq("user_id", req.target_user_id)
          .in("role_key", removed);
      }
      await supabase.from("internal_user_roles")
        .update({ is_primary: false })
        .eq("user_id", req.target_user_id);
      for (const role of payload.roles) {
        await supabase.from("internal_user_roles").upsert({
          user_id: req.target_user_id,
          role_key: role,
          is_primary: role === payload.primary_role,
          assigned_by: requester,
        }, { onConflict: "user_id,role_key" });
      }
    } else if (req.change_type === "permission") {
      const payload = req.payload as { permission_key: string; mode: "grant" | "revoke" };
      await supabase.from("user_permission_overrides").insert({
        user_id: req.target_user_id,
        permission_key: payload.permission_key,
        mode: payload.mode,
        reason: `Approved: ${reason}`,
        granted_by: requester,
      });
    } else if (req.change_type === "suspend") {
      await supabase.from("internal_users").update({ status: "suspended" }).eq("id", req.target_user_id);
    } else if (req.change_type === "reactivate") {
      await supabase.from("internal_users").update({ status: "active" }).eq("id", req.target_user_id);
    }
  }

  await auditLog(req.target_user_id, `access_change_${decision}d`,
    `${decision === "approve" ? "Approved" : "Rejected"} access change request`,
    decision === "approve" ? "warning" : "info",
    { request_id: id, reason, change_type: req.change_type, payload: req.payload });
}

// ---------- Presentation helpers ----------

export const STATUS_LABEL: Record<InternalUserStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  pending_approval: "Pending Approval",
  invited: "Invited",
  locked: "Locked",
  deactivated: "Deactivated",
};

export function accessDotClass(level: AccessLevel): string {
  switch (level) {
    case "full": return "bg-red-400";
    case "high": return "bg-amber-400";
    case "standard": return "bg-blue-400";
    case "limited": return "bg-emerald-400";
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.round(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Back-compat export used by some legacy imports.
export const PERMISSION_CATALOG = PERMISSION_MODULES.map((m) => ({
  group: m.label,
  items: m.permissions.map((p) => ({ key: p.key, label: p.label })),
}));